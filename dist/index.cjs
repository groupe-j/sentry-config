'use strict';

var Sentry = require('@sentry/nextjs');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var Sentry__namespace = /*#__PURE__*/_interopNamespace(Sentry);

// src/redaction.ts
var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
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
  "niss",
  // Luxembourg
  "nif",
  // tax IDs
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
  "bic"
]);
var REDACTED = "[REDACTED]";
function isSensitive(key) {
  const normalised = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEYS.has(normalised);
}
function redact(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null || value === void 0) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return REDACTED;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }
  const result = {};
  for (const [key, v] of Object.entries(value)) {
    if (isSensitive(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redact(v, seen);
    }
  }
  return result;
}
var SENSITIVE_HEADERS = /* @__PURE__ */ new Set([
  "stripe-signature",
  "x-knock-signature",
  "x-webhook-signature",
  "x-vercel-signature",
  "x-telegram-bot-api-secret-token",
  "x-sanity-webhook-signature",
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie"
]);
function scrubHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}

// src/before-send.ts
var EXTENSION_SCHEME = /(?:chrome|moz|safari(?:-web)?)-extension:\/\//i;
function hasBrowserExtensionException(event) {
  const values = event.exception?.values;
  if (!values) return false;
  return values.some((v) => {
    if (EXTENSION_SCHEME.test(v.type ?? "") || EXTENSION_SCHEME.test(v.value ?? "")) {
      return true;
    }
    return (v.stacktrace?.frames ?? []).some(
      (f) => EXTENSION_SCHEME.test(f.filename ?? "") || EXTENSION_SCHEME.test(f.abs_path ?? "")
    );
  });
}
function createSentryBeforeSend(appName) {
  return (event) => {
    if (hasBrowserExtensionException(event)) return null;
    const seen = /* @__PURE__ */ new WeakSet();
    const next = {
      ...event,
      tags: { ...event.tags, app: appName }
    };
    if (event.request) {
      next.request = {
        ...event.request,
        data: event.request.data === void 0 ? void 0 : redact(event.request.data, seen),
        headers: event.request.headers ? scrubHeaders(event.request.headers) : void 0
      };
    }
    if (event.breadcrumbs) {
      next.breadcrumbs = event.breadcrumbs.map((b) => ({
        ...b,
        data: b.data === void 0 ? void 0 : redact(b.data, seen)
      }));
    }
    if (event.extra) {
      next.extra = redact(event.extra, seen);
    }
    if (event.contexts) {
      next.contexts = redact(event.contexts, seen);
    }
    return next;
  };
}

// src/sampling.ts
var SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;
var SENTRY_PROFILES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;
var SENTRY_REPLAYS_SESSION_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 0;
var SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
var SENTRY_ENABLED = process.env.NODE_ENV !== "test";
var SENTRY_BROWSER_TRACES_SAMPLE_RATE = parseRate(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  1,
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE"
);
var SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
var SENTRY_WEBVITAL_SAMPLE_RATE = parseRate(
  process.env.NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE ?? process.env.SENTRY_WEBVITAL_SAMPLE_RATE,
  1,
  "NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE"
);
function parseRate(raw, fallback, name) {
  if (raw === void 0 || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  console.error(
    `[sentry-config] ${name ?? "sample rate"}: expected a number in [0, 1], got ${JSON.stringify(raw)}. Using ${fallback} instead \u2014 the value you set is NOT in effect.`
  );
  return fallback;
}
var WEB_VITAL_ORIGINS = /* @__PURE__ */ new Set([
  "auto.http.browser.inp",
  "auto.http.browser.cls",
  "auto.http.browser.lcp"
]);
function isWebVitalSpan(ctx) {
  const origin = ctx.attributes?.["sentry.origin"];
  if (typeof origin === "string" && WEB_VITAL_ORIGINS.has(origin)) return true;
  const op = ctx.attributes?.["sentry.op"];
  return typeof op === "string" && op.startsWith("ui.interaction.");
}
var SKIP_PATTERNS = [
  /\/api\/health$/,
  /\/api\/healthz$/,
  /\/_next\/static\//,
  /\/_next\/image\//,
  /\/_next\/data\//,
  /\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|map|css|js)$/
];
function createTracesSampler(defaultRate = SENTRY_TRACES_SAMPLE_RATE, webVitalRate = SENTRY_WEBVITAL_SAMPLE_RATE) {
  return (ctx) => {
    if (isWebVitalSpan(ctx)) return webVitalRate;
    const url = ctx.transactionContext?.name ?? ctx.name ?? ctx.request?.url ?? "";
    if (SKIP_PATTERNS.some((re) => re.test(url))) return 0;
    return defaultRate;
  };
}
function setSentryUser(user) {
  Sentry__namespace.setUser({
    id: user.id,
    ...user.email && { email: user.email }
  });
  if (user.tenant) Sentry__namespace.setTag("tenant", user.tenant);
  if (user.plan) Sentry__namespace.setTag("plan", user.plan);
}
function clearSentryUser() {
  Sentry__namespace.setUser(null);
  Sentry__namespace.setTag("tenant", void 0);
  Sentry__namespace.setTag("plan", void 0);
}

// src/bot.ts
var BOT_REGEX = /bot|crawler|spider|crawling|scraper|http(?:client|client)|curl\/|wget\/|python-requests|preview|fetch|axios\/|node-fetch|lighthouse|headlesschrome|pingdombot|uptimerobot|statuscake|datadog/i;
function isBot(userAgent) {
  if (!userAgent) return false;
  return BOT_REGEX.test(userAgent);
}

// src/ignored.ts
var DEFAULT_IGNORED_ERRORS = [
  // Next.js framework artifacts
  "NEXT_NOT_FOUND",
  "NEXT_REDIRECT",
  "NEXT_HTTP_ERROR_FALLBACK",
  // Network errors — almost always user side (offline, blocking extensions)
  "AbortError",
  "NetworkError",
  "Failed to fetch",
  "Load failed",
  "Network request failed",
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",
  // Browser quirks
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /hydration/i,
  // Browser extensions injecting code
  "Script error.",
  /chrome-extension/,
  /moz-extension/,
  /safari-extension/,
  // User cancellations
  "The user aborted a request",
  "The operation was aborted"
];
var DEFAULT_DENY_URLS = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /^safari-web-extension:\/\//i
];
function withCronMonitor(monitorSlug, handler, options) {
  return async (...args) => {
    return Sentry__namespace.withMonitor(
      monitorSlug,
      async () => handler(...args),
      {
        schedule: { type: "crontab", value: options.schedule },
        maxRuntime: options.maxRuntimeMinutes ?? 30,
        checkinMargin: options.checkinMarginMinutes ?? 5,
        timezone: options.timezone ?? "UTC",
        failureIssueThreshold: options.failureIssueThreshold ?? 1,
        recoveryThreshold: options.recoveryThreshold ?? 1
      }
    );
  };
}

// src/trpc.ts
var CLIENT_FAULT_CODES = /* @__PURE__ */ new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "TIMEOUT",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "METHOD_NOT_SUPPORTED",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST"
]);
function shouldReportTrpcError(code) {
  return !CLIENT_FAULT_CODES.has(code);
}
function createTrpcSentryOnError(Sentry3) {
  return ({ error, path, type }) => {
    if (!shouldReportTrpcError(error.code)) return;
    Sentry3.captureException(error.cause ?? error, {
      tags: {
        trpcPath: path ?? "<no-path>",
        trpcType: type
      }
    });
  };
}

// src/trpc-middleware.ts
function createSentryTrpcMiddleware(Sentry3, options = {}) {
  const { attachRpcInput = true, ...rest } = options;
  return Sentry3.trpcMiddleware({ attachRpcInput, ...rest });
}

// src/armed.ts
function assertSentryArmed(Sentry3, options = {}) {
  const { throwOnMissing = false } = options;
  const dsn = Sentry3.getClient()?.getDsn();
  if (dsn) return true;
  const message = "[sentry-config] Sentry is NOT armed: getClient().getDsn() is empty. Errors will be silently dropped. Check SENTRY_DSN / Sentry.init in this runtime.";
  if (throwOnMissing) {
    console.error(message);
    throw new Error(message);
  }
  console.error(message);
  return false;
}

exports.DEFAULT_DENY_URLS = DEFAULT_DENY_URLS;
exports.DEFAULT_IGNORED_ERRORS = DEFAULT_IGNORED_ERRORS;
exports.REDACTED = REDACTED;
exports.SENTRY_BROWSER_TRACES_SAMPLE_RATE = SENTRY_BROWSER_TRACES_SAMPLE_RATE;
exports.SENTRY_ENABLED = SENTRY_ENABLED;
exports.SENTRY_ENVIRONMENT = SENTRY_ENVIRONMENT;
exports.SENTRY_PROFILES_SAMPLE_RATE = SENTRY_PROFILES_SAMPLE_RATE;
exports.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE = SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE;
exports.SENTRY_REPLAYS_SESSION_SAMPLE_RATE = SENTRY_REPLAYS_SESSION_SAMPLE_RATE;
exports.SENTRY_TRACES_SAMPLE_RATE = SENTRY_TRACES_SAMPLE_RATE;
exports.SENTRY_WEBVITAL_SAMPLE_RATE = SENTRY_WEBVITAL_SAMPLE_RATE;
exports.assertSentryArmed = assertSentryArmed;
exports.clearSentryUser = clearSentryUser;
exports.createSentryBeforeSend = createSentryBeforeSend;
exports.createSentryTrpcMiddleware = createSentryTrpcMiddleware;
exports.createTracesSampler = createTracesSampler;
exports.createTrpcSentryOnError = createTrpcSentryOnError;
exports.isBot = isBot;
exports.isSensitive = isSensitive;
exports.redact = redact;
exports.scrubHeaders = scrubHeaders;
exports.setSentryUser = setSentryUser;
exports.shouldReportTrpcError = shouldReportTrpcError;
exports.withCronMonitor = withCronMonitor;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map