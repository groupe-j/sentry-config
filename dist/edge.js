import { DEFAULT_IGNORED_ERRORS, SENTRY_ENABLED, SENTRY_ENVIRONMENT, createSentryBeforeSend, createTracesSampler, SENTRY_TRACES_SAMPLE_RATE } from './chunk-RLML3U3R.js';
import './chunk-DGUM43GV.js';
import * as Sentry from '@sentry/nextjs';

function initSentryEdge(opts) {
  const { app, dsn, ignoreErrors = [] } = opts;
  Sentry.init({
    dsn: dsn ?? process.env.SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
    enabled: SENTRY_ENABLED,
    debug: false,
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    beforeSend: createSentryBeforeSend(app)
  });
}

export { initSentryEdge };
//# sourceMappingURL=edge.js.map
//# sourceMappingURL=edge.js.map