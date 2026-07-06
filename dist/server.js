import * as Sentry from '@sentry/nextjs';

var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

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

// src/sampling.ts
var SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;
var SENTRY_PROFILES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;
process.env.NODE_ENV === "production" ? 0.1 : 0;
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

// src/server.ts
function initSentryServer(opts) {
  const {
    app,
    dsn,
    prisma = true,
    profiling = true,
    ignoreErrors = [],
    extraIntegrations = [],
    sendDefaultPii = false,
    transport
  } = opts;
  const integrations = [];
  if (prisma) {
    integrations.push(Sentry.prismaIntegration());
  }
  if (profiling) {
    try {
      const profMod = __require("@sentry/profiling-node");
      if (typeof profMod.nodeProfilingIntegration === "function") {
        integrations.push(profMod.nodeProfilingIntegration());
      }
    } catch {
    }
  }
  try {
    const sentryAny = Sentry;
    if (typeof sentryAny.vercelAIIntegration === "function") {
      integrations.push(sentryAny.vercelAIIntegration());
    }
  } catch {
  }
  integrations.push(...extraIntegrations);
  Sentry.init({
    dsn: dsn ?? process.env.SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    profilesSampleRate: SENTRY_PROFILES_SAMPLE_RATE,
    sendDefaultPii,
    enabled: SENTRY_ENABLED,
    debug: false,
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    integrations,
    beforeSend: createSentryBeforeSend(app),
    _experiments: { enableLogs: true },
    // Opt-in transport override (getsentry/sentry-javascript#18871). Only spread
    // when provided so the SDK default is preserved for healthy setups.
    ...transport !== void 0 ? { transport } : {}
  });
}

export { initSentryServer };
//# sourceMappingURL=server.js.map
//# sourceMappingURL=server.js.map