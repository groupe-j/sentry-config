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
  "fullname",
  "firstname",
  "lastname",
  "givenname",
  "familyname",
  "dateofbirth",
  "dob",
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
function createSentryBeforeSend(appName) {
  return (event) => {
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
var SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
var SKIP_PATTERNS = [
  /\/api\/health$/,
  /\/api\/healthz$/,
  /\/_next\/static\//,
  /\/_next\/image\//,
  /\/_next\/data\//,
  /\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|map|css|js)$/
];
function createTracesSampler(defaultRate = SENTRY_TRACES_SAMPLE_RATE) {
  return (ctx) => {
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

exports.DEFAULT_DENY_URLS = DEFAULT_DENY_URLS;
exports.DEFAULT_IGNORED_ERRORS = DEFAULT_IGNORED_ERRORS;
exports.REDACTED = REDACTED;
exports.SENTRY_ENABLED = SENTRY_ENABLED;
exports.SENTRY_ENVIRONMENT = SENTRY_ENVIRONMENT;
exports.SENTRY_PROFILES_SAMPLE_RATE = SENTRY_PROFILES_SAMPLE_RATE;
exports.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE = SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE;
exports.SENTRY_REPLAYS_SESSION_SAMPLE_RATE = SENTRY_REPLAYS_SESSION_SAMPLE_RATE;
exports.SENTRY_TRACES_SAMPLE_RATE = SENTRY_TRACES_SAMPLE_RATE;
exports.clearSentryUser = clearSentryUser;
exports.createSentryBeforeSend = createSentryBeforeSend;
exports.createTracesSampler = createTracesSampler;
exports.isBot = isBot;
exports.isSensitive = isSensitive;
exports.redact = redact;
exports.scrubHeaders = scrubHeaders;
exports.setSentryUser = setSentryUser;
exports.withCronMonitor = withCronMonitor;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map