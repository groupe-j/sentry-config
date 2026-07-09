/**
 * PII redaction by key-name (not regex on values).
 *
 * Why key-name: cheap, predictable, no false negatives on well-named fields.
 * Redaction is visible (`"[REDACTED]"`) so missing data is obvious in Sentry UI
 * rather than silent.
 *
 * Why whole-word + normalization (not substring): substring would over-redact
 * `ipAddress`, `requestToken`, etc. Normalisation handles `id_card` ≡ `idCard`
 * ≡ `id-card` (all become `idcard` → match). Exact-key matching means broad
 * entries stay narrow: `name` redacts a key literally named `name`, never
 * `filename` / `hostname` / `username` / `appName`.
 *
 * Tradeoff — these three broad keys also match Sentry's own context fields:
 * `name` → `contexts.{browser,os,device}.name` ("Chrome"/"Windows"); `description`
 * → `contexts.trace.description` (span label, e.g. "GET /api/foo"); `location`
 * → any library-set `location` in `extra`/breadcrumb data. All become `[REDACTED]`.
 * Accepted, visible cost — in this lead-heavy portfolio these are high-risk PII
 * fields, and the sibling `*.version`/`op`/`trace_id` context fields survive for
 * debugging. Exception values/stack frames are never passed through `redact`, so
 * error messages and filenames are unaffected.
 *
 * Why WeakSet cycle guard: Sentry events hold cycles via
 * `contexts.react.componentStack` or error.cause chains from Apollo/Prisma.
 * A throw in `beforeSend` causes Sentry to silently drop the event —
 * exactly the failure mode this helper is meant to prevent.
 */

const SENSITIVE_KEYS = new Set([
  // Identity
  "email",
  "emails",
  "phone",
  "phonenumber",
  "name",
  "fullname",
  "firstname",
  "lastname",
  "givenname",
  "familyname",
  "dateofbirth",
  "dob",

  // Lead / contact free-text (leads schema across portfolio apps —
  // `name`/`location`/`description` carry a person's identity, home town,
  // and self-description, so they are PII once attached to an event).
  "location",
  "description",

  // Government ID (Thailand, France, Luxembourg, EU)
  "passport",
  "passporturl",
  "passportnumber",
  "idcard",
  "idcardurl",
  "idcardnumber",
  "nationalid",
  "nationalidnumber",
  "ssn",
  "socialsecuritynumber",
  "niss",  // Luxembourg
  "nif",   // tax IDs

  // Address
  "address",
  "streetaddress",
  "billingaddress",
  "shippingaddress",
  "postalcode",
  "zipcode",

  // Auth + secrets
  "password",
  "passwordhash",
  "secret",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "csrftoken",

  // Payment
  "cardnumber",
  "cvv",
  "cvc",
  "iban",
  "swift",
  "bic",
]);

export const REDACTED = "[REDACTED]";

export function isSensitive(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEYS.has(normalised);
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  // Cycle guard: return REDACTED rather than the same ref (which would re-enter
  // on the next traversal anyway).
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitive(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redact(v, seen);
    }
  }
  return result;
}

/**
 * Headers that are credentials by another name — strip them entirely.
 * They have no debug value once an error has fired.
 */
const SENSITIVE_HEADERS = new Set([
  "stripe-signature",
  "x-knock-signature",
  "x-webhook-signature",
  "x-vercel-signature",
  "x-telegram-bot-api-secret-token",
  "x-sanity-webhook-signature",
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

export function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}
