'use strict';

var chunk345PN2DU_cjs = require('./chunk-345PN2DU.cjs');
require('./chunk-JEQ2X3Z6.cjs');
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

Object.defineProperty(exports, "DEFAULT_DENY_URLS", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.DEFAULT_DENY_URLS; }
});
Object.defineProperty(exports, "DEFAULT_IGNORED_ERRORS", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.DEFAULT_IGNORED_ERRORS; }
});
Object.defineProperty(exports, "REDACTED", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.REDACTED; }
});
Object.defineProperty(exports, "SENTRY_ENABLED", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.SENTRY_ENABLED; }
});
Object.defineProperty(exports, "SENTRY_ENVIRONMENT", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.SENTRY_ENVIRONMENT; }
});
Object.defineProperty(exports, "SENTRY_PROFILES_SAMPLE_RATE", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.SENTRY_PROFILES_SAMPLE_RATE; }
});
Object.defineProperty(exports, "SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE; }
});
Object.defineProperty(exports, "SENTRY_REPLAYS_SESSION_SAMPLE_RATE", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.SENTRY_REPLAYS_SESSION_SAMPLE_RATE; }
});
Object.defineProperty(exports, "SENTRY_TRACES_SAMPLE_RATE", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.SENTRY_TRACES_SAMPLE_RATE; }
});
Object.defineProperty(exports, "SENTRY_WEBVITAL_SAMPLE_RATE", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.SENTRY_WEBVITAL_SAMPLE_RATE; }
});
Object.defineProperty(exports, "createSentryBeforeSend", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.createSentryBeforeSend; }
});
Object.defineProperty(exports, "createTracesSampler", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.createTracesSampler; }
});
Object.defineProperty(exports, "isSensitive", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.isSensitive; }
});
Object.defineProperty(exports, "redact", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.redact; }
});
Object.defineProperty(exports, "scrubHeaders", {
  enumerable: true,
  get: function () { return chunk345PN2DU_cjs.scrubHeaders; }
});
exports.assertSentryArmed = assertSentryArmed;
exports.clearSentryUser = clearSentryUser;
exports.createSentryTrpcMiddleware = createSentryTrpcMiddleware;
exports.createTrpcSentryOnError = createTrpcSentryOnError;
exports.isBot = isBot;
exports.setSentryUser = setSentryUser;
exports.shouldReportTrpcError = shouldReportTrpcError;
exports.withCronMonitor = withCronMonitor;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map