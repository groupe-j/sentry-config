export { DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS, REDACTED, SENTRY_ENABLED, SENTRY_ENVIRONMENT, SENTRY_PROFILES_SAMPLE_RATE, SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, SENTRY_REPLAYS_SESSION_SAMPLE_RATE, SENTRY_TRACES_SAMPLE_RATE, SENTRY_WEBVITAL_SAMPLE_RATE, createSentryBeforeSend, createTracesSampler, isSensitive, redact, scrubHeaders } from './chunk-RLML3U3R.js';
import './chunk-DGUM43GV.js';
import * as Sentry from '@sentry/nextjs';

function setSentryUser(user) {
  Sentry.setUser({
    id: user.id,
    ...user.email && { email: user.email }
  });
  if (user.tenant) Sentry.setTag("tenant", user.tenant);
  if (user.plan) Sentry.setTag("plan", user.plan);
}
function clearSentryUser() {
  Sentry.setUser(null);
  Sentry.setTag("tenant", void 0);
  Sentry.setTag("plan", void 0);
}

// src/bot.ts
var BOT_REGEX = /bot|crawler|spider|crawling|scraper|http(?:client|client)|curl\/|wget\/|python-requests|preview|fetch|axios\/|node-fetch|lighthouse|headlesschrome|pingdombot|uptimerobot|statuscake|datadog/i;
function isBot(userAgent) {
  if (!userAgent) return false;
  return BOT_REGEX.test(userAgent);
}
function withCronMonitor(monitorSlug, handler, options) {
  return async (...args) => {
    return Sentry.withMonitor(
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

export { assertSentryArmed, clearSentryUser, createSentryTrpcMiddleware, createTrpcSentryOnError, isBot, setSentryUser, shouldReportTrpcError, withCronMonitor };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map