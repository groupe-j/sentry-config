/**
 * Value-level scrubbing for the free-text fields key-name redaction cannot see.
 *
 * `redact` (./redaction.ts) works on KEY names. It never reads a value, so PII
 * that travels inside a string survives it untouched:
 *
 *  - exception messages — drizzle-orm's `DrizzleQueryError` is
 *    `Failed query: <sql>\nparams: <values>` (an address, a magic-link token in
 *    clear, a rate-limit key built from the address); Postgres' `detail`
 *    (`Key (email)=(jean@…) already exists.`); Prisma's argument dump;
 *  - a request body Sentry captured as a JSON **string**;
 *  - `request.url` / `query_string` (`?token=…` on a magic-link callback).
 *
 * Every pattern replaces the VALUE with {@link REDACTED_VALUE} and keeps the
 * surrounding text: the SQL, the constraint name and the parameter NAMES are
 * what makes an error diagnosable, the values are not.
 *
 * Cost discipline (this runs inside `beforeSend`): each pattern is gated by a
 * cheap `includes` on a character it cannot match without, and every
 * quantifier that could scan from many start positions is bounded, so an
 * adversarial 100 KB string stays linear (pinned by `scrub.test.ts`).
 */

import { REDACTED, foldKey, isSensitive } from "./redaction.js";

/**
 * Marker for a value scrubbed out of free text. Lower-case on purpose: it tells
 * a reader the difference with a key-name redaction (`[REDACTED]`) at a glance.
 */
export const REDACTED_VALUE = "[redacted]";

// ─── Patterns ──────────────────────────────────────────────────────────────
//
// ReDoS rule for every pattern below: the cost is (start positions) × (length
// scanned per start). Bounding a quantifier is not enough on its own — a
// repeated PREFIX (`eyJ-eyJ-…`, `Key (a)=(Key (a)=(…`) multiplies the starts.
// So each pattern either always succeeds once started (it consumes, no
// restart), or has a lookbehind that refuses a start glued to the previous
// candidate, AND every open quantifier is bounded. `scrub.test.ts` pins both
// shapes of adversarial input.

/**
 * drizzle-orm: `params: ${params}` — Array#toString, so `a,b,c`, not JSON, and
 * a value may itself contain newlines. Consume to the end of the message, or to
 * the first stack line when the text is a `stack`.
 */
const ORM_PARAMS = /(^|\n)(params: )[\s\S]*?(?=\n[ \t]+at |$)/g;

/**
 * Same message after a logger flattened it to one line, or JSON-escaped it
 * (`\n` as two characters). Gated on `Failed query` so that a genuine
 * `Invalid params: expected object` is never touched. Stops at a quote (end of
 * the enclosing JSON string) or a real newline.
 */
const ORM_PARAMS_FLAT = /((?:\\n|[ \t])params: )(?:[^\n"\\]|\\(?!n[ \t]+at )[\s\S])*/g;
// ↑ Unbounded on purpose: once started it always consumes (no restart), so it
// stays linear — and a bound would leave the tail of a bulk insert in clear
// while the message LOOKS redacted. Escaped quotes (`\"`) do not stop it.

/**
 * A Postgres detail tuple ends at `)` followed by the end of the text, a
 * newline (real or JSON-escaped), a quote, a space or a separator — the detail
 * is often embedded in JSON (`"detail":"…"`) or followed by `SQL state: …`.
 */
const PG_TUPLE_END = String.raw`\)(?=\.?(?:$|\\n|[\n\s"',;}\]]))`;

/**
 * Postgres constraint `detail`: `Key (email)=(jean@…) already exists.`,
 * `Key (lower((phone)::text))=(…)`, and both tuples of an exclusion violation
 * (`… conflicts with existing key (…)=(…).`). The terminator is a LOOKAHEAD so
 * the second `key (…)=(` stays available to the next match. Source string, not
 * a literal: see {@link compileModernPatterns}.
 */
const PG_KEY_DETAIL_SOURCE =
  String.raw`(?<=^|[\s"'.:;,>\]=(\[]|\\n)(key \((?:[^()\n]|\((?:[^()\n]|\([^()\n]{0,64}\)){0,64}\)){1,128}\)=\()[^\n]{0,1024}?(?=\) (?:already exists|is not present in table|is still referenced from table|conflicts with existing key)|` +
  PG_TUPLE_END +
  ")";

/** Postgres `Failing row contains (1, Jean Dupont, 0612345678).` — the whole row. */
const PG_FAILING_ROW = new RegExp(String.raw`(\bFailing row contains \()[^\n]{0,4096}?(?=` + PG_TUPLE_END + ")", "g");

/** `postgres://user:password@host`, `redis://:password@host` — keep scheme, user and host. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@]{0,256}:)[^\s@/]{1,256}@/gi;

/**
 * `"key": "value"` / `key: 'value'` / `key="value"` — JSON, Prisma argument
 * dumps, logfmt. Only QUOTED values: `Invalid token: expired` must survive.
 */
const QUOTED_KV =
  /(["']?)([A-Za-z_\u00C0-\u024F][\w.\u00C0-\u024F-]{0,63})\1(\s*[:=]\s*)("(?:[^"\\\n]|\\.){0,4096}"|'(?:[^'\\\n]|\\.){0,4096}')/g;

/** `?token=…`, `&code=…`, `#access_token=…`, form bodies, `a=1; b=2`. */
const PARAM_KV = /(^|[?&#;,\s])([A-Za-z0-9_.[\]-]{1,64})=([^&#\s"'`<>;,]{0,8192})/g;

/**
 * `Bearer <token>`. The value must hold a digit or symbol: a real token almost
 * always does, while `Bearer undefined` (a real diagnostic — the header was
 * built from a missing env var) and prose like `Basic authentication` do not.
 */
const AUTH_SCHEME =
  /\b(Bearer|Basic)(\s+)(?=[A-Za-z0-9._~+/=-]{0,4096}[0-9._~+/=-])[A-Za-z0-9._~+/=-]{8,4096}/gi;

/** Letters-only bearer token: long enough that no English word qualifies. */
const BEARER_ALPHA = /\b(Bearer)(\s+)[A-Za-z]{20,4096}(?![A-Za-z0-9._~+/=-])/gi;

/**
 * Credentials recognisable by their shape alone. The lookbehind refuses a start
 * glued to a token character, so `eyJ-eyJ-eyJ-…` is ONE start, not thousands.
 */
const KNOWN_SECRETS_SOURCE = String.raw`(?<![A-Za-z0-9_-])(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,512}|whsec_[A-Za-z0-9+/=]{16,512}|npg_[A-Za-z0-9]{8,512}|re_[A-Za-z0-9]{8,64}_[A-Za-z0-9]{16,128}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,512}|gh[pousr]_[A-Za-z0-9]{30,512}|github_pat_[A-Za-z0-9_]{30,512}|xox[abposr]-[A-Za-z0-9-]{10,512}|AKIA[0-9A-Z]{16}|bot\d{6,12}:[A-Za-z0-9_-]{30,256}|eyJ[A-Za-z0-9_-]{8,512}\.eyJ[A-Za-z0-9_-]{8,65536}\.[A-Za-z0-9_-]{8,4096})`;

/**
 * Email, raw or URL-encoded (`%40`), Unicode local part and domain. The
 * lookbehind anchors the match at the start of the local part (`jérôme.…` is
 * redacted whole, a long run of word characters is one start, and `git@host:`
 * — an SSH remote — is not re-matched from its second letter). A start right
 * after a percent-escape is allowed: in `…%26email%3Djean%40x.fr` the address
 * begins after `%3D`.
 */
const EMAIL_SOURCE = String.raw`(?<=^|[^\p{L}\p{N}._%+-]|%[0-9A-Fa-f]{2})(?!git@)[\p{L}\p{N}._%+-]{1,64}(?:@|%40)(?:[\p{L}\p{N}-]{1,63}\.){1,8}\p{L}{2,24}(?![\p{L}\p{N}-])`;

interface ModernPatterns {
  pgKeyDetail: RegExp;
  knownSecrets: RegExp;
  email: RegExp;
}

let modernPatterns: ModernPatterns | undefined;

/**
 * Lookbehind and `\p{…}` need Safari ≥ 16.4. As regex LITERALS, an older
 * engine rejects them at PARSE time — a SyntaxError for the whole bundled
 * chunk, which may hold app code, not just Sentry. Compiled lazily from source
 * strings instead, the failure stays local: `scrubText` throws, and the hooks
 * fail closed (the event still ships, minimal and tagged).
 */
function compileModernPatterns(): ModernPatterns {
  modernPatterns ??= {
    pgKeyDetail: new RegExp(PG_KEY_DETAIL_SOURCE, "gi"),
    knownSecrets: new RegExp(KNOWN_SECRETS_SOURCE, "g"),
    email: new RegExp(EMAIL_SOURCE, "gu"),
  };
  return modernPatterns;
}

// ─── Parameter names ───────────────────────────────────────────────────────

/** Always a credential, whatever the value looks like. */
const SECRET_PARAMS = new Set([
  "token",
  "otp",
  "apikey",
  "secret",
  "password",
  "passwd",
  "pwd",
  "signature",
  "jwt",
  "magic",
  "magiclink",
  "xamzcredential",
  "xamzsecuritytoken",
]);

/**
 * Credential only when the value is long enough to be one: `code=500`,
 * `key=theme` and `session=1` are diagnostics, `code=123456` (an e-mailed
 * one-time code) and `code=4/0AfJohX…` are not.
 */
const WEAK_SECRET_PARAMS = new Set(["code", "key", "sig", "auth", "session", "sessionid", "sid", "ticket", "pass"]);
const WEAK_SECRET_MIN_LENGTH = 6;
/** `code=ERR_INVALID_ARG_TYPE` — an upper-snake error code, not a credential. */
const ERROR_CODE_VALUE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

/**
 * PII keys too common in code and SQL to apply with any separator:
 * `name: "Jean"` (a dump) is data, `"name" = 'Chair'` (SQL) is code.
 */
const BROAD_PII_KEYS = new Set(["name", "description", "location", "city", "nom", "ville", "commune"]);

function normaliseName(name: string): string {
  return foldKey(name).replace(/[.[\]]/g, "");
}

/**
 * True for a name whose value is PII or a credential in ANY context: a PII key
 * (same list as key-name redaction) or a credential name (`token`,
 * `refresh_token`, `magicLink`, `X-Amz-Signature`, `X-Goog-Signature`…).
 */
export function isSecretName(name: string): boolean {
  if (isSensitive(name)) return true;
  const n = normaliseName(name);
  if (SECRET_PARAMS.has(n)) return true;
  return (
    n.endsWith("token") ||
    n.endsWith("secret") ||
    n.endsWith("password") ||
    n.endsWith("signature") ||
    n.endsWith("credential") ||
    n.startsWith("magic")
  );
}

/**
 * True when a URL / form parameter named `name` carrying `value` must be
 * scrubbed: {@link isSecretName}, or a weak name (`code`, `key`, `sid`…) with a
 * credential-length value. Weak names are URL-only on purpose: as an object key
 * or a JSON field, `code: "ERR_INVALID_ARG_TYPE"` is a diagnostic.
 */
export function isSecretParam(name: string, value: string): boolean {
  if (value === "" || value === REDACTED_VALUE || value === REDACTED) return false;
  if (isSecretName(name)) return true;
  return (
    WEAK_SECRET_PARAMS.has(normaliseName(name)) &&
    value.length >= WEAK_SECRET_MIN_LENGTH &&
    !ERROR_CODE_VALUE.test(value)
  );
}

// ─── Text ──────────────────────────────────────────────────────────────────

/** A URL-encoded value is decoded and re-scanned at most this many times. */
const MAX_DECODE_DEPTH = 3;
const ENCODED_MARKER = encodeURIComponent(REDACTED_VALUE);

function scrubParamValue(lead: string, name: string, value: string, match: string, depth: number): string {
  if (isSecretParam(name, value)) return `${lead}${name}=${REDACTED_VALUE}`;
  // `?redirect=%2Freset%3Ftoken%3DSECRET` — the nested URL only shows its
  // parameters once decoded. Re-encode the scrubbed result so the outer URL
  // stays well-formed and the redirect path stays readable.
  if (depth === 0 && value.includes("%")) {
    // Decode as many layers as present (`%253D` → `%3D` → `=`), bounded, then
    // scan once. Malformed percent-encoding stops the unwrapping: nothing
    // decodable is hidden behind it.
    let decoded = value;
    for (let i = 0; i < MAX_DECODE_DEPTH && decoded.includes("%"); i++) {
      let next: string;
      try {
        next = decodeURIComponent(decoded);
      } catch {
        break;
      }
      if (next === decoded) break;
      decoded = next;
    }
    if (decoded !== value) {
      const scrubbed = scrubTextAt(decoded, 1);
      if (scrubbed !== decoded) {
        // Re-encode once so the outer URL stays well-formed, but keep the
        // marker literal: a search for `[redacted]` must find it.
        return `${lead}${name}=${encodeURIComponent(scrubbed).split(ENCODED_MARKER).join(REDACTED_VALUE)}`;
      }
    }
  }
  return match;
}

function scrubTextAt(text: string, depth: number): string {
  if (text.length < 6) return text;
  let out = text;

  if (out.includes("params: ")) {
    out = out.replace(ORM_PARAMS, `$1$2${REDACTED_VALUE}`);
    if (out.includes("Failed query")) out = out.replace(ORM_PARAMS_FLAT, `$1${REDACTED_VALUE}`);
  }
  const modern = compileModernPatterns();
  if (out.includes("ey (")) out = out.replace(modern.pgKeyDetail, `$1${REDACTED_VALUE}`);
  if (out.includes("Failing row contains (")) out = out.replace(PG_FAILING_ROW, `$1${REDACTED_VALUE}`);
  if (out.includes("://")) out = out.replace(URL_CREDENTIALS, `$1${REDACTED_VALUE}@`);

  const hasColon = out.includes(":");
  const hasEquals = out.includes("=");
  if ((hasColon || hasEquals) && (out.includes('"') || out.includes("'"))) {
    out = out.replace(QUOTED_KV, (match, q: string, key: string, sep: string, quoted: string) => {
      const inner = quoted.slice(1, -1);
      if (inner === "" || inner === REDACTED_VALUE || inner === REDACTED || !isSecretName(key)) {
        return match;
      }
      if (BROAD_PII_KEYS.has(normaliseName(key)) && !sep.includes(":")) return match;
      const mark = quoted[0];
      return `${q}${key}${q}${sep}${mark}${REDACTED_VALUE}${mark}`;
    });
  }

  if (hasEquals) {
    out = out.replace(PARAM_KV, (match, lead: string, name: string, value: string) =>
      scrubParamValue(lead, name, value, match, depth),
    );
  }

  if (/bearer|basic/i.test(out)) {
    out = out.replace(AUTH_SCHEME, `$1$2${REDACTED_VALUE}`).replace(BEARER_ALPHA, `$1$2${REDACTED_VALUE}`);
  }
  if (out.includes("_") || out.includes("-") || out.includes("eyJ") || out.includes("AKIA") || out.includes("bot")) {
    out = out.replace(modern.knownSecrets, REDACTED_VALUE);
  }
  if (out.includes("@") || out.includes("%40")) out = out.replace(modern.email, REDACTED_VALUE);

  return out;
}

/**
 * Scrub PII and credentials out of a free-text string, keeping the text around
 * them. Returns the same string instance when nothing matched.
 */
export function scrubText(text: string): string {
  return scrubTextAt(text, 0);
}

// ─── Structures ────────────────────────────────────────────────────────────

/**
 * Header names that are credentials by another name. Matched as a key
 * (`{ authorization: … }` in breadcrumb data) and as the tail of a span
 * attribute (`http.request.header.cookie`).
 */
const CREDENTIAL_HEADER_KEYS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "stripe-signature",
  "x-knock-signature",
  "x-webhook-signature",
  "x-vercel-signature",
  "x-telegram-bot-api-secret-token",
  "x-sanity-webhook-signature",
]);

/**
 * Client-IP carriers: headers (proxies, Vercel, Cloudflare, Fastly) and the
 * OpenTelemetry / Sentry attributes that copy them.
 */
export const IP_KEY =
  /^(?:x-(?:original-)?forwarded-for|x-real-ip|forwarded|cf-connecting-ip|true-client-ip|x-client-ip|x-cluster-client-ip|fastly-client-ip|x-vercel-forwarded-for|x-vercel-proxied-for|x-vercel-ip-.+|cf-ipcity|cf-iplatitude|cf-iplongitude|client\.address|user\.ip_address|ip_address)$/i;

function isCredentialKey(key: string): boolean {
  if (isSensitive(key)) return true;
  const lower = key.toLowerCase();
  if (CREDENTIAL_HEADER_KEYS.has(lower) || IP_KEY.test(lower)) return true;
  // Log / span attributes: `user.email`, `user.name`, `user.username` (only
  // `user.id` is not personal data by itself).
  if (lower.startsWith("user.") && lower !== "user.id") return true;
  const header = lower.lastIndexOf(".header.");
  if (header === -1) return false;
  const name = lower.slice(header + ".header.".length).replace(/_/g, "-");
  return CREDENTIAL_HEADER_KEYS.has(name) || IP_KEY.test(name);
}

/** Beyond this depth the value is replaced — a parsed request body is attacker-shaped. */
const MAX_DEPTH = 32;

/**
 * Key-name redaction AND value scrubbing, recursively. Returns new containers
 * (never mutates). Cycles and pathological depth become `[REDACTED]`.
 */
export function scrubDeep(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH || seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, seen, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isCredentialKey(key)) result[key] = REDACTED;
    // Credential names outside the key list (`magicToken`, `resetPassword`):
    // only a string is a credential — `tokenCount: 3` stays.
    else if (typeof v === "string" && v !== "" && isSecretName(key)) result[key] = REDACTED_VALUE;
    else result[key] = scrubDeep(v, seen, depth + 1);
  }
  return result;
}

/**
 * `event.request.data`: an object is walked; a JSON string is parsed, walked
 * and re-serialised (so key-name redaction applies to it too); anything else —
 * form bodies, JSON truncated by the SDK's body cap — goes through text
 * scrubbing, whose quoted `"key":"value"` and `key=value` patterns still apply
 * the key list.
 */
export function scrubRequestData(data: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof data !== "string") return scrubDeep(data, seen);
  const head = data.trimStart()[0];
  if (head === "{" || head === "[") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Truncated (SDK body cap) or invalid JSON: text scrubbing below still
      // applies the key list through its quoted `"key":"value"` pattern.
      return scrubText(data);
    }
    return JSON.stringify(scrubDeep(parsed, seen));
  }
  return scrubText(data);
}

function scrubQueryValue(key: string, v: unknown): unknown {
  if (typeof v === "string") return isSecretParam(key, v) ? REDACTED_VALUE : scrubText(v);
  // `?token=a&token=b` parses to `{ token: ["a", "b"] }`.
  if (Array.isArray(v)) return v.map((item) => scrubQueryValue(key, item));
  return scrubDeep(v);
}

/** `event.request.query_string`: string, `{ key: value | value[] }` or `[key, value][]`. */
export function scrubQueryString(qs: unknown): unknown {
  if (typeof qs === "string") {
    // PARAM_KV anchors on `^`/`&`, so a bare `token=…&x=1` is covered.
    return scrubText(qs);
  }
  if (Array.isArray(qs)) {
    return qs.map((pair) => {
      if (!Array.isArray(pair) || typeof pair[0] !== "string") return scrubDeep(pair);
      const [k, v] = pair as [string, unknown];
      return [k, scrubQueryValue(k, v)];
    });
  }
  if (qs !== null && typeof qs === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(qs as Record<string, unknown>)) {
      result[k] = scrubQueryValue(k, v);
    }
    return result;
  }
  return qs;
}

/**
 * `event.request.cookies`: names are kept (they say which session was active),
 * every value is dropped — a cookie value is a credential or tracking id.
 */
export function scrubCookies(cookies: unknown): unknown {
  if (typeof cookies === "string") {
    return cookies.replace(/(^|;\s*)([^=;\s]+)=[^;]*/g, `$1$2=${REDACTED_VALUE}`);
  }
  if (cookies !== null && typeof cookies === "object" && !Array.isArray(cookies)) {
    const result: Record<string, string> = {};
    for (const k of Object.keys(cookies)) result[k] = REDACTED;
    return result;
  }
  return cookies === undefined ? undefined : REDACTED;
}
