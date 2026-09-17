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

import { REDACTED, isSensitive } from "./redaction.js";

/**
 * Marker for a value scrubbed out of free text. Lower-case on purpose: it tells
 * a reader the difference with a key-name redaction (`[REDACTED]`) at a glance.
 */
export const REDACTED_VALUE = "[redacted]";

// ─── Patterns ──────────────────────────────────────────────────────────────

/**
 * drizzle-orm: `params: ${params}` — Array#toString, so `a,b,c`, not JSON, and
 * a value may itself contain newlines. Consume to the end of the message, or to
 * the first stack line when the text is a `stack`.
 */
const ORM_PARAMS = /(^|\n)(params: )[\s\S]*?(?=\n[ \t]+at |$)/g;

/** Postgres constraint `detail`: `Key (email)=(jean@example.com) already exists.` */
const PG_KEY_DETAIL =
  /(\bKey \([^()\n]{1,256}\)=\()[^\n]*?(\) (?:already exists|is not present in table|is still referenced from table|conflicts with existing key))/g;

/** `postgres://user:password@host` — keep scheme, user and host. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@]{1,256}:)[^\s@/]{1,256}@/gi;

/**
 * `"key": "value"` / `key: 'value'` / `key="value"` — JSON, Prisma argument
 * dumps, logfmt. Only QUOTED values: `Invalid token: expired` must survive.
 */
const QUOTED_KV =
  /(["']?)([A-Za-z_][A-Za-z0-9_.-]{0,63})\1(\s*[:=]\s*)("(?:[^"\\\n]|\\.){0,4096}"|'(?:[^'\\\n]|\\.){0,4096}')/g;

/** `?token=…`, `&code=…`, `#access_token=…`, form bodies, `a=1; b=2`. */
const PARAM_KV = /(^|[?&#;,\s])([A-Za-z0-9_.[\]-]{1,64})=([^&#\s"'`<>;,]*)/g;

/**
 * `Bearer <token>`. The value must hold a digit or symbol: a real token always
 * does, while `Bearer undefined` (a real diagnostic — the header was built from
 * a missing env var) and prose like `Basic authentication` do not.
 */
const AUTH_SCHEME =
  /\b(Bearer|Basic)(\s+)(?=[A-Za-z0-9._~+/=-]*[0-9._~+/=-])[A-Za-z0-9._~+/=-]{8,}/gi;

/** Credentials recognisable by their prefix alone. */
const KNOWN_SECRETS =
  /\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9+/=]{16,}|npg_[A-Za-z0-9]{8,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g;

/** Email, raw or URL-encoded (`%40`). Bounded parts keep it linear. */
const EMAIL = /[A-Za-z0-9._%+-]{1,64}(?:@|%40)(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;

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
  "xamzsignature",
  "xamzcredential",
  "xamzsecuritytoken",
]);

/**
 * Credential only when the value is long enough to be one: `code=500`,
 * `key=theme` and `session=1` are diagnostics, `code=4/0AfJohX…` is not.
 */
const WEAK_SECRET_PARAMS = new Set(["code", "key", "sig", "auth", "session", "sessionid", "sid", "ticket", "pass"]);
const WEAK_SECRET_MIN_LENGTH = 8;

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[_.[\]-]/g, "");
}

/**
 * True for a name whose value is PII or a credential in ANY context: a PII key
 * (same list as key-name redaction) or a credential name (`token`,
 * `refresh_token`, `magicLink`, `X-Amz-Signature`…).
 */
export function isSecretName(name: string): boolean {
  if (isSensitive(name)) return true;
  const n = normaliseName(name);
  if (SECRET_PARAMS.has(n)) return true;
  return n.endsWith("token") || n.endsWith("secret") || n.endsWith("password") || n.startsWith("magic");
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
  return WEAK_SECRET_PARAMS.has(normaliseName(name)) && value.length >= WEAK_SECRET_MIN_LENGTH;
}

// ─── Text ──────────────────────────────────────────────────────────────────

/**
 * Scrub PII and credentials out of a free-text string, keeping the text around
 * them. Returns the same string instance when nothing matched.
 */
export function scrubText(text: string): string {
  if (text.length < 6) return text;
  let out = text;

  if (out.includes("params: ")) out = out.replace(ORM_PARAMS, `$1$2${REDACTED_VALUE}`);
  if (out.includes("Key (")) out = out.replace(PG_KEY_DETAIL, `$1${REDACTED_VALUE}$2`);
  if (out.includes("://")) out = out.replace(URL_CREDENTIALS, `$1${REDACTED_VALUE}@`);

  const hasColon = out.includes(":");
  const hasEquals = out.includes("=");
  if ((hasColon || hasEquals) && (out.includes('"') || out.includes("'"))) {
    out = out.replace(QUOTED_KV, (match, q: string, key: string, sep: string, quoted: string) => {
      const inner = quoted.slice(1, -1);
      if (inner === "" || inner === REDACTED_VALUE || inner === REDACTED || !isSecretName(key)) {
        return match;
      }
      const mark = quoted[0];
      return `${q}${key}${q}${sep}${mark}${REDACTED_VALUE}${mark}`;
    });
  }

  if (hasEquals) {
    out = out.replace(PARAM_KV, (match, lead: string, name: string, value: string) =>
      isSecretParam(name, value) ? `${lead}${name}=${REDACTED_VALUE}` : match,
    );
  }

  if (/bearer|basic/i.test(out)) out = out.replace(AUTH_SCHEME, `$1$2${REDACTED_VALUE}`);
  if (out.includes("_") || out.includes("-") || out.includes("eyJ") || out.includes("AKIA")) {
    out = out.replace(KNOWN_SECRETS, REDACTED_VALUE);
  }
  if (out.includes("@") || out.includes("%40")) out = out.replace(EMAIL, REDACTED_VALUE);

  return out;
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

function isCredentialKey(key: string): boolean {
  if (isSensitive(key)) return true;
  const lower = key.toLowerCase();
  if (CREDENTIAL_HEADER_KEYS.has(lower)) return true;
  const header = lower.lastIndexOf(".header.");
  return header !== -1 && CREDENTIAL_HEADER_KEYS.has(lower.slice(header + ".header.".length));
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
    try {
      return JSON.stringify(scrubDeep(JSON.parse(data), seen));
    // eslint-disable-next-line @groupe-j/no-error-swallow -- not an error: truncated/invalid JSON falls through to text scrubbing below.
    } catch {
      // Truncated or invalid JSON — fall through to text scrubbing.
    }
  }
  return scrubText(data);
}

/** `event.request.query_string`: string, `{ key: value }` or `[key, value][]`. */
export function scrubQueryString(qs: unknown): unknown {
  if (typeof qs === "string") {
    // PARAM_KV anchors on `^`/`&`, so a bare `token=…&x=1` is covered.
    return scrubText(qs);
  }
  if (Array.isArray(qs)) {
    return qs.map((pair) => {
      if (!Array.isArray(pair) || typeof pair[0] !== "string") return scrubDeep(pair);
      const [k, v] = pair as [string, unknown];
      return [k, typeof v === "string" && isSecretParam(k, v) ? REDACTED_VALUE : scrubDeep(v)];
    });
  }
  if (qs !== null && typeof qs === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(qs as Record<string, unknown>)) {
      result[k] = typeof v === "string" && isSecretParam(k, v) ? REDACTED_VALUE : scrubDeep(v);
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
