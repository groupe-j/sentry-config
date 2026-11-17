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

import { REDACTED, foldKey, hasCredentialSuffix, isSensitive } from "./redaction.js";

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
  if (isSensitive(name) || isPositionName(name)) return true;
  const n = normaliseName(name);
  if (SECRET_PARAMS.has(n)) return true;
  // `hasCredentialSuffix` reçoit `n`, DÉJÀ normalisé par `normaliseName` —
  // c'est ce qui préserve `user[token]`. Voir son contrat d'entrée.
  return hasCredentialSuffix(n) || n.startsWith("magic");
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

// ─── Position ──────────────────────────────────────────────────────────────
//
// A visitor's plot, typed as an address and geocoded, travels as coordinates
// in the query of every call made for it: `geom={"type":"Point",
// "coordinates":[lng,lat]}` (apicarto IGN), `latlon=lng,lat` (Géorisques),
// `lat=…&lon=…` (DVF), the tRPC `input={"0":{"json":{"lng":…,"lat":…}}}`, and
// the page URL itself (`/recherche?lng=…&lat=…&label=12 rue …`). The SDK keeps
// those queries in breadcrumbs (`http.query`, `url`, `from` / `to`) and in
// `request.url` / `query_string`, and joins them to every capture.
//
// A coordinate is a number, so `scrubText` never sees it as PII, and the key
// list matched none of these names. The rules below mask the VALUE and keep
// the parameter name and the rest of the URL, which is what diagnoses a failed
// upstream call.

/** Parameters whose value is a position or a postal address, wherever they appear. */
const POSITION_PARAMS = new Set([
  "geom",
  "latlon",
  "latlng",
  "lnglat",
  "lonlat",
  "lat",
  "lng",
  "lon",
  "latitude",
  "longitude",
  "coordinates",
  "coords",
  // A viewport around the plot: a WMS / tRPC bounding box, its corners, and the
  // WMTS tile of a high zoom (`TILEMATRIX=19&TILEROW=…&TILECOL=…` is ~50 m wide;
  // the zoom level is kept).
  "bbox",
  "minlat",
  "minlng",
  "minlon",
  "maxlat",
  "maxlng",
  "maxlon",
  "tilerow",
  "tilecol",
  "adresse",
  "address",
]);

/**
 * Free text that names the place: the label of a geocoded address
 * (`label=12 rue de Metz 57000 Metz`), the query typed into a geocoder. Too
 * generic to mask everywhere (`?q=permis` on a blog search is a diagnostic), so
 * only on an address API, or next to a position in the same query.
 */
const ADDRESS_TEXT_PARAMS = new Set(["q", "query", "text", "label"]);

/** Geocoders: every free-text parameter sent to them is an address typed by a visitor. */
const ADDRESS_API = /api-adresse\.data\.gouv\.fr|data\.geopf\.fr\/geocodage|nominatim\.openstreetmap\.org|photon\.komoot\.io/i;

/** A tRPC HTTP route (`/api/trpc/router.proc?batch=1&input=…`). */
const TRPC_PATH = /\/trpc\//i;

/**
 * tRPC sends a GET procedure's input as URL-encoded JSON (superjson too), and
 * that input is whatever the form held. Recognised by its first character,
 * raw or percent-encoded (once or twice).
 */
const JSON_VALUE = /^(?:[{[]|%(?:25){0,2}(?:7b|5b))/i;

/** What the surroundings of a query say about it. */
export interface UrlScrubContext {
  /** The URL is a tRPC route: its `input` parameter is the procedure input. */
  trpc?: boolean;
  /** The URL is a geocoder's: its free-text parameters are addresses. */
  addressApi?: boolean;
}

/** `ctx` widened by what `sources` (URLs, transaction names) say. */
function urlContext(ctx: UrlScrubContext | undefined, ...sources: unknown[]): UrlScrubContext {
  let trpc = ctx?.trpc === true;
  let addressApi = ctx?.addressApi === true;
  for (const s of sources) {
    if (typeof s !== "string") continue;
    trpc ||= TRPC_PATH.test(s);
    addressApi ||= ADDRESS_API.test(s);
  }
  return { trpc, addressApi };
}

/** What `sources` (URLs, a transaction name) say about a query kept apart from them. */
export function urlContextOf(...sources: unknown[]): UrlScrubContext {
  return urlContext(undefined, ...sources);
}

/** Last segment of a parameter name, folded: `point[lat]`, `filter.lat` and `LAT` are all `lat`. */
function paramLeaf(name: string): string {
  const parts = name.split(/[.[\]]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part) return foldKey(part);
  }
  return "";
}

/**
 * A key or parameter name that carries a position or an address in any
 * context (`lat`, `geom`, `coordinates`, `point[lng]`…).
 */
export function isPositionName(name: string): boolean {
  return POSITION_PARAMS.has(paramLeaf(name));
}

/**
 * Nothing to hide, or already hidden. `startsWith`: a value is read up to its
 * own end, and a marker that ends a JSON string (`lat=[redacted]"}`) runs on.
 */
function isEmptyOrMasked(value: string): boolean {
  return value === "" || value.startsWith(REDACTED_VALUE) || value.startsWith(REDACTED);
}

/**
 * Must the value of parameter `leaf` be masked? `hasPosition`: the same query
 * carries a position parameter, which makes its free-text parameters an address.
 */
function masksPositionParam(leaf: string, value: string, ctx: UrlScrubContext, hasPosition: boolean): boolean {
  if (isEmptyOrMasked(value)) return false;
  if (POSITION_PARAMS.has(leaf)) return true;
  if (leaf === "input") return ctx.trpc === true || JSON_VALUE.test(value);
  if (ADDRESS_TEXT_PARAMS.has(leaf)) return ctx.addressApi === true || hasPosition;
  return false;
}

/** URL-decode a parameter NAME (`+` is a space in a query). Throws on malformed percent-encoding. */
function decodeParamName(raw: string): string {
  return raw.includes("%") || raw.includes("+") ? decodeURIComponent(raw.replace(/\+/g, " ")) : raw;
}

/**
 * `name=` in free text or in a URL. The value is NOT part of the pattern: its
 * end depends on the name (see {@link positionValueEnd}), so the scan restarts
 * right after `=` when the value is kept — a position parameter glued to it
 * (`a=1,lat=48.8`) is still found.
 */
const PARAM_NAME = /(^|[?&#;,\s])([^\s=&?#;,"'`<>]{1,64})=/g;

/**
 * Where a position value ends. Wider than {@link PARAM_KV}, which stops at `,`
 * and `"`: `geom={%22type%22:%22Point%22,%22coordinates%22:[2.35,48.85]}` (a
 * URL normalised by WHATWG leaves `{`, `,` and `[` raw) and `adresse=12%20rue,
 * %20Metz` would otherwise leave the tail in clear. A raw JSON value runs to
 * the next parameter; anything else also stops at a quote or a backslash, the
 * end of an enclosing string.
 */
function positionValueEnd(text: string, start: number, limit = 8192): number {
  const json = text[start] === "{" || text[start] === "[";
  const max = Math.min(text.length, start + limit);
  let i = start;
  for (; i < max; i++) {
    const c = text.charCodeAt(i);
    // & # whitespace
    if (c === 38 || c === 35 || c === 32 || (c >= 9 && c <= 13)) break;
    // " ' ` < > \
    if (!json && (c === 34 || c === 39 || c === 96 || c === 60 || c === 62 || c === 92)) break;
  }
  return i;
}

/** Enough of a value to tell empty, `[redacted]` and a JSON start (`%25257B`) apart. */
const VALUE_HEAD = 16;

/**
 * One pass of {@link scrubPositionText}: masks the parameters `decide` picks.
 * Returns the text and whether a position parameter was seen.
 */
function maskParams(
  text: string,
  decide: (leaf: string, value: string) => boolean,
): { out: string; sawPosition: boolean } {
  let out = "";
  let last = 0;
  let sawPosition = false;
  PARAM_NAME.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARAM_NAME.exec(text)) !== null) {
    const valueStart = m.index + m[0].length;
    // Decide on the head of the value only, and scan to its end only to mask:
    // a kept value is scanned again from its start (the next `,lat=` may be
    // inside), so scanning it whole here would be quadratic.
    const value = text.slice(valueStart, positionValueEnd(text, valueStart, VALUE_HEAD));
    let leaf: string | undefined;
    try {
      leaf = paramLeaf(decodeParamName(m[2] ?? ""));
      // eslint-disable-next-line @groupe-j/no-error-swallow -- not swallowed: `leaf` stays undefined and the value is masked below.
    } catch {
      // Undecodable name: it could be any of them. Fail closed on the value.
    }
    if (leaf !== undefined && POSITION_PARAMS.has(leaf) && value !== "") sawPosition = true;
    const mask = leaf === undefined ? !isEmptyOrMasked(value) : decide(leaf, value);
    if (mask) {
      const end = positionValueEnd(text, valueStart);
      out += text.slice(last, valueStart) + REDACTED_VALUE;
      last = end;
      PARAM_NAME.lastIndex = end;
    }
  }
  return { out: last === 0 ? text : out + text.slice(last), sawPosition };
}

/**
 * Mask position, address and tRPC-input parameters in free text or a URL.
 * `ctx` adds what the text cannot say itself (the host of an `http.query`).
 */
function scrubPositionText(text: string, given?: UrlScrubContext): string {
  const ctx = urlContext(given, text);
  // Two passes: an address label may come BEFORE the position that makes it one.
  const first = maskParams(text, (leaf, value) => !ADDRESS_TEXT_PARAMS.has(leaf) && masksPositionParam(leaf, value, ctx, false));
  if (!first.sawPosition && ctx.addressApi !== true) return first.out;
  return maskParams(first.out, (leaf, value) => ADDRESS_TEXT_PARAMS.has(leaf) && masksPositionParam(leaf, value, ctx, true)).out;
}

/**
 * `lat: 48.85`, `"lng":2.35` (a JSON dump, a logged object) — a coordinate as
 * a NUMBER, which the quoted `key: "value"` pattern cannot see.
 */
const POSITION_NUMBER_KV = /\b((?:min|max)?(?:lat|lng|lon)|latitude|longitude)\b(\\?["']?\s{0,8}:\s{0,8})-?\d{1,3}(?:\.\d{1,20})?(?![\d.])/gi;

/**
 * `"coordinates":[2.35,48.85]`, GeoJSON rings included: a run of numbers and
 * brackets. A digit must follow the opening brackets, so `[redacted]` is not
 * matched again on the next pass (`beforeBreadcrumb`, then `beforeSend`).
 */
const POSITION_ARRAY_KV =
  /\b(coordinates|coords|latlon|latlng|lnglat|lonlat)\b(\\?["']?\s{0,8}:\s{0,8})\[[\s[]{0,16}-?\d[-\d\s.,eE+[\]]{0,8192}/gi;

/** Gate for the two patterns above. */
const POSITION_KEY_HINT = /lat|lng|lon|coord/i;

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

function scrubTextAt(text: string, depth: number, ctx?: UrlScrubContext): string {
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
  // Before the quoted and `key=value` patterns: a position value runs past the
  // `,` and `"` where they stop.
  if (hasEquals) out = scrubPositionText(out, ctx);
  if (hasColon && POSITION_KEY_HINT.test(out)) {
    out = out.replace(POSITION_NUMBER_KV, `$1$2${REDACTED_VALUE}`).replace(POSITION_ARRAY_KV, `$1$2${REDACTED_VALUE}`);
  }
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

/**
 * Does any parameter NAME of this query fail to URL-decode? Then it cannot be
 * told whether it is a position parameter, and {@link scrubUrl} drops the
 * whole query rather than guess. Values are never decoded to decide, so a
 * malformed value (`?lat=%E0%A4%A`) is masked like any other.
 */
function hasUndecodableName(query: string): boolean {
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    try {
      decodeParamName(eq === -1 ? pair : pair.slice(0, eq));
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * A field known to hold a URL (`request.url`, breadcrumb `url` / `from` / `to`,
 * span `url.full`). Free-text scrubbing plus the position rules, with the
 * context of `ctx` (the host of a sibling field). Fail-closed: a query that
 * cannot be analysed is removed whole, fragment included — the path stays.
 */
export function scrubUrl(url: string, ctx?: UrlScrubContext): string {
  const q = url.indexOf("?");
  if (q !== -1) {
    const hash = url.indexOf("#", q);
    if (hasUndecodableName(url.slice(q + 1, hash === -1 ? undefined : hash))) {
      return `${scrubTextAt(url.slice(0, q), 0, urlContext(ctx, url))}?${REDACTED_VALUE}`;
    }
  }
  return scrubTextAt(url, 0, urlContext(ctx, url));
}

/**
 * A query string on its own (`request.query_string`, breadcrumb `http.query`),
 * with or without its `?`. Same rules and same fail-closed as {@link scrubUrl};
 * `ctx` carries the host and path the query belongs to.
 */
export function scrubUrlQuery(query: string, ctx?: UrlScrubContext): string {
  const body = query.startsWith("?") ? query.slice(1) : query;
  const hash = body.indexOf("#");
  if (hasUndecodableName(hash === -1 ? body : body.slice(0, hash))) {
    return query.startsWith("?") ? `?${REDACTED_VALUE}` : REDACTED_VALUE;
  }
  // Leading `?` or not, `PARAM_NAME` anchors on `^` / `&`, so the first
  // parameter is found either way.
  return scrubTextAt(query, 0, ctx);
}

/** Keys of breadcrumb and span data that hold a full URL or a path. */
const URL_FIELDS = ["url", "from", "to", "http.url", "url.full"] as const;
/** Keys that hold the query of a sibling URL field, kept apart by the SDK. */
const QUERY_FIELDS = ["http.query", "url.query"] as const;

/**
 * Breadcrumb `data` / span `data`: URL fields go through {@link scrubUrl}, and
 * the query the SDK splits off the URL (`http.query`: `{ url:
 * "https://apicarto.ign.fr/api/gpu/zone-urba", "http.query": "?geom=…" }`)
 * through {@link scrubUrlQuery} with the context of that URL — the host is
 * what makes `q` an address. Shallow copy; the caller then runs
 * {@link scrubDeep} over the result, which leaves masked values as they are.
 */
export function scrubUrlFields(data: unknown): unknown {
  if (!isPlainObject(data)) return data;
  const ctx = urlContext(undefined, ...URL_FIELDS.map((k) => data[k]));
  const next: Record<string, unknown> = { ...data };
  for (const k of URL_FIELDS) {
    const v = data[k];
    if (typeof v === "string") next[k] = scrubUrl(v, ctx);
  }
  for (const k of QUERY_FIELDS) {
    const v = data[k];
    if (typeof v === "string") next[k] = scrubUrlQuery(v, ctx);
  }
  return next;
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
  // A position is a number or an array (`{ lat: 48.85 }`, a tRPC input in
  // `contexts.trpc`): only a key rule reaches it.
  if (isSensitive(key) || isPositionName(key)) return true;
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
    result[key] = scrubEntry(key, v, seen, depth);
  }
  return result;
}

/** One `key: value` of an object at `depth` — the per-key rule of {@link scrubDeep}. */
function scrubEntry(key: string, v: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (isCredentialKey(key)) return REDACTED;
  // Credential names outside the key list (`magicToken`, `resetPassword`):
  // only a string is a credential — `tokenCount: 3` stays.
  if (typeof v === "string" && v !== "" && isSecretName(key)) return REDACTED_VALUE;
  return scrubDeep(v, seen, depth + 1);
}

/**
 * The `name` values the Sentry SDK writes as product metadata in
 * `contexts.runtime` and `contexts.os` — read from the SDK source (10.70), not
 * guessed: `runtime` from the `@sentry/node-core` and `@sentry/vercel-edge`
 * clients, and `@sentry/nextjs` on Cloudflare (`getCloudflareRuntimeConfig`);
 * `os` from the node-core context integration
 * (`PLATFORM_NAMES`, `LINUX_DISTROS`, `sw_vers` on macOS). Redacting them by key
 * empties the `runtime.name` / `os.name` tags, and triage can no longer split
 * Node from edge issues.
 *
 * An allowlist of VALUES, not of context keys: the SDK merges app data over
 * its own (`os: { ...sdkOs, ...event.contexts?.os }`), so
 * `setContext("os", { name: lead.name })` lands in the very same field, and a
 * bare name has no shape `scrubText` could catch. An SDK value missing from the
 * list is redacted as before — visible, never a leak; `sdk-contexts.test.ts`
 * runs the real SDK to catch that drift.
 *
 * Deliberately absent:
 *  - `browser` / `device` — no JS SDK writes them before `beforeSend` (Relay
 *    derives them from the User-Agent afterwards), and on native SDKs
 *    `device.name` is the owner-given name ("iPhone de Jean Dupont");
 *  - `app`, `culture`, `cloud_resource`, `trace` — the SDK writes no `name` there.
 */
const SDK_CONTEXT_NAMES = new Map<string, ReadonlySet<string>>([
  ["runtime", new Set(["node", "vercel-edge", "cloudflare"])],
  [
    "os",
    new Set([
      "Linux",
      "Windows",
      "macOS",
      "Mac OS X",
      "Android",
      "FreeBSD",
      "OpenBSD",
      "SunOS",
      "IBM AIX",
      "OpenHarmony",
      "Alpine Linux",
      "Arch Linux",
      "Centos",
      "Debian",
      "Fedora",
      "Gentoo Linux",
      "Red Hat Linux",
      "SUSE Linux",
      "Ubuntu Linux",
    ]),
  ],
]);

/**
 * `event.contexts`: {@link scrubDeep}, except that `runtime.name` / `os.name`
 * survive when their value is one the SDK writes ({@link SDK_CONTEXT_NAMES}).
 * Any other value, and every other key of those contexts, keeps the key-name
 * rule.
 */
export function scrubContexts(contexts: unknown, seen = new WeakSet<object>()): unknown {
  if (!isPlainObject(contexts) || seen.has(contexts)) return scrubDeep(contexts, seen);
  seen.add(contexts);

  const result: Record<string, unknown> = {};
  for (const [key, ctx] of Object.entries(contexts)) {
    const sdkNames = SDK_CONTEXT_NAMES.get(key);
    if (!sdkNames || !isPlainObject(ctx) || seen.has(ctx)) {
      result[key] = scrubEntry(key, ctx, seen, 0);
      continue;
    }
    seen.add(ctx);
    const scrubbed: Record<string, unknown> = {};
    for (const [field, v] of Object.entries(ctx)) {
      scrubbed[field] = field === "name" && typeof v === "string" && sdkNames.has(v) ? v : scrubEntry(field, v, seen, 1);
    }
    result[key] = scrubbed;
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function scrubQueryValue(key: string, v: unknown, mask: (leaf: string, value: string) => boolean): unknown {
  if (typeof v === "string") {
    return isSecretParam(key, v) || mask(paramLeaf(key), v) ? REDACTED_VALUE : scrubText(v);
  }
  // `?token=a&token=b` parses to `{ token: ["a", "b"] }`.
  if (Array.isArray(v)) return v.map((item) => scrubQueryValue(key, item, mask));
  if (v !== null && typeof v === "object" && isPositionName(key)) return REDACTED;
  return scrubDeep(v);
}

/**
 * `event.request.query_string`: string, `{ key: value | value[] }` or
 * `[key, value][]`. `ctx`: what the request URL says about it (a tRPC route,
 * a geocoder) — see {@link UrlScrubContext}.
 */
export function scrubQueryString(qs: unknown, ctx?: UrlScrubContext): unknown {
  if (typeof qs === "string") {
    // PARAM_KV anchors on `^`/`&`, so a bare `token=…&x=1` is covered.
    return scrubUrlQuery(qs, ctx);
  }
  const context = urlContext(ctx);
  if (Array.isArray(qs)) {
    const hasPosition = qs.some((pair) => Array.isArray(pair) && typeof pair[0] === "string" && isPositionName(pair[0]));
    const mask = (leaf: string, value: string): boolean => masksPositionParam(leaf, value, context, hasPosition);
    return qs.map((pair) => {
      if (!Array.isArray(pair) || typeof pair[0] !== "string") return scrubDeep(pair);
      const [k, v] = pair as [string, unknown];
      return [k, scrubQueryValue(k, v, mask)];
    });
  }
  if (qs !== null && typeof qs === "object") {
    const entries = Object.entries(qs as Record<string, unknown>);
    const hasPosition = entries.some(([k]) => isPositionName(k));
    const mask = (leaf: string, value: string): boolean => masksPositionParam(leaf, value, context, hasPosition);
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      result[k] = scrubQueryValue(k, v, mask);
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
