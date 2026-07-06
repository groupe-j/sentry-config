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
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_PROFILES_SAMPLE_RATE,
  SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  createTracesSampler,
} from "./sampling.js";

export { setSentryUser, clearSentryUser, type SentryUserContext } from "./user.js";

export { isBot } from "./bot.js";

export { DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS } from "./ignored.js";

export { withCronMonitor, type CronMonitorOptions } from "./crons.js";

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

export {
  assertSentryArmed,
  type AssertSentryArmedOptions,
  type SentryArmedLike,
  type SentryClientLike,
} from "./armed.js";
