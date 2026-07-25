import { DEFAULT_IGNORED_ERRORS, SENTRY_ENABLED, SENTRY_PROFILES_SAMPLE_RATE, SENTRY_ENVIRONMENT, createSentryBeforeSend, createTracesSampler, SENTRY_TRACES_SAMPLE_RATE } from './chunk-RLML3U3R.js';
import { __require } from './chunk-DGUM43GV.js';
import * as Sentry from '@sentry/nextjs';

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