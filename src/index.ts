/**
 * @groupe-j/sentry-config — barrel export.
 *
 * Most consumers should import from sub-paths:
 *   - '@groupe-j/sentry-config/client' → browser config
 *   - '@groupe-j/sentry-config/server' → Node config
 *   - '@groupe-j/sentry-config/edge'   → Edge config
 *
 * This barrel exposes the building blocks (redact, createSentryBeforeSend,
 * setSentryUser, isBot) for advanced use cases.
 */

export {
  createSentryBeforeSend,
  type SentryEventLike,
} from "./before-send.js";

export {
  REDACTED,
  isSensitive,
  redact,
  scrubHeaders,
} from "./redaction.js";

export {
  SENTRY_BROWSER_TRACES_SAMPLE_RATE,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_PROFILES_SAMPLE_RATE,
  SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  SENTRY_WEBVITAL_SAMPLE_RATE,
  createTracesSampler,
} from "./sampling.js";

export { setSentryUser, clearSentryUser, type SentryUserContext } from "./user.js";

export { isBot } from "./bot.js";

export { DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS } from "./ignored.js";

export { withCronMonitor, type CronMonitorOptions } from "./crons.js";

export {
  signalServerless,
  DEFAULT_FLUSH_TIMEOUT_MS,
  type DeferFn,
  type SentrySeverityLevel,
  type SignalServerlessOptions,
} from "./serverless.js";

export {
  createTrpcSentryOnError,
  shouldReportTrpcError,
  type TrpcErrorType,
  type TrpcErrorLike,
  type TrpcOnErrorPayload,
  type TrpcSentryLike,
} from "./trpc.js";

export {
  createSentryTrpcMiddleware,
  type SentryTrpcMiddlewareOptions,
  type SentryTrpcMiddlewareLike,
  type SentryTrpcMiddleware,
  type SentryTrpcMiddlewareArguments,
  type SentryTrpcMiddlewareResult,
} from "./trpc-middleware.js";

/**
 * ⚠️ Do NOT import `assertSentryArmed` from this barrel inside a **client**
 * module. The barrel also re-exports `withCronMonitor` and
 * `createSentryTrpcMiddleware`, which reach for `Sentry.withMonitor` and
 * `Sentry.trpcMiddleware` — server-only members of `@sentry/nextjs`. A bundler
 * resolving them against the browser build fails the build (businessfamily,
 * 2026-07-31). Use `@groupe-j/sentry-config/armed`, which imports nothing.
 */
export {
  assertSentryArmed,
  type AssertSentryArmedOptions,
  type SentryArmedLike,
  type SentryClientLike,
} from "./armed.js";
