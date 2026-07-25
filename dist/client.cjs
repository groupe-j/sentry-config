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

// src/client.ts

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

// src/sampling.ts
var SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;
process.env.NODE_ENV === "production" ? 0.1 : 1;
var SENTRY_REPLAYS_SESSION_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 0;
var SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
var SENTRY_ENABLED = process.env.NODE_ENV !== "test";
var SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
var SENTRY_WEBVITAL_SAMPLE_RATE = parseRate(
  process.env.NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE ?? process.env.SENTRY_WEBVITAL_SAMPLE_RATE,
  1
);
function parseRate(raw, fallback) {
  if (raw === void 0 || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
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

// src/client-core.ts
function initClientCore({ options, replay, eagerReplay }) {
  const {
    app,
    dsn,
    enabled,
    ignoreErrors = [],
    replayMaskAllText = true,
    replayBlockAllMedia = true,
    tunnel,
    replayCdnBaseUrl,
    replayScriptNonce,
    sendDefaultPii = false
  } = options;
  const isEnabled = SENTRY_ENABLED && (enabled?.() ?? true);
  const replayEnabled = replay !== false;
  const replayEager = replay === true && eagerReplay !== null;
  const tuning = {
    maskAllText: replayMaskAllText,
    blockAllMedia: replayBlockAllMedia
  };
  Sentry__namespace.init({
    dsn: dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    // Rates are identical between `true` and `"lazy"`: the integration reads
    // them off the client options whenever it is set up — at init, or later.
    replaysSessionSampleRate: replayEnabled ? SENTRY_REPLAYS_SESSION_SAMPLE_RATE : 0,
    replaysOnErrorSampleRate: replayEnabled ? SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE : 0,
    enabled: isEnabled,
    sendDefaultPii,
    debug: false,
    ...tunnel && { tunnel },
    ...replayCdnBaseUrl && { cdnBaseUrl: replayCdnBaseUrl },
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    denyUrls: DEFAULT_DENY_URLS,
    integrations: [
      // Explicit — do not rely on the SDK default. `enableInp: true` has been
      // the default since SDK 8.x, but stating it here makes INP collection
      // survive a default flip and documents that INP (a Google ranking signal
      // since it replaced FID) is a first-class metric for us.
      // Note: `@sentry/nextjs` re-exports its OWN browserTracingIntegration
      // (App Router navigation instrumentation included), and a user-supplied
      // integration replaces the default of the same name — nothing is lost.
      Sentry__namespace.browserTracingIntegration({ enableInp: true }),
      ...replayEager && eagerReplay ? [eagerReplay(tuning)] : []
    ],
    beforeSend: createSentryBeforeSend(app)
  });
  if (replayEnabled && !replayEager && isEnabled) {
    scheduleLazyReplay(tuning, replayScriptNonce);
  }
}
function scheduleLazyReplay(tuning, scriptNonce) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const MAX_ATTEMPTS = 2;
  let pending = false;
  let attempts = 0;
  let attached = false;
  const attach = () => {
    if (pending || attached || attempts >= MAX_ATTEMPTS) return;
    pending = true;
    attempts += 1;
    Sentry__namespace.lazyLoadIntegration("replayIntegration", scriptNonce).then((replayIntegration2) => {
      attached = true;
      pending = false;
      Sentry__namespace.addIntegration(replayIntegration2(tuning));
    }).catch(() => {
      pending = false;
      Sentry__namespace.addBreadcrumb({
        category: "sentry.replay",
        level: "warning",
        message: "lazy Replay bundle failed to load \u2014 no session replay for this page"
      });
      Sentry__namespace.setTag("replay.lazy", "failed");
    });
  };
  Sentry__namespace.getClient()?.on("beforeSendEvent", (event) => {
    if (event.exception) attach();
  });
  const onLoaded = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => attach(), { timeout: 3e3 });
    } else {
      window.setTimeout(attach, 1500);
    }
  };
  if (document.readyState === "complete") onLoaded();
  else window.addEventListener("load", onLoaded, { once: true });
}

// src/client.ts
function initSentryClient(opts) {
  const { replay = true, ...rest } = opts;
  initClientCore({
    options: rest,
    replay,
    // The ONLY static `replayIntegration` reference in the package.
    eagerReplay: (tuning) => Sentry__namespace.replayIntegration({
      maskAllText: tuning.maskAllText,
      blockAllMedia: tuning.blockAllMedia
    })
  });
}

exports.initSentryClient = initSentryClient;
//# sourceMappingURL=client.cjs.map
//# sourceMappingURL=client.cjs.map