/**
 * Edge runtime Sentry init helper. For middleware and edge API routes.
 *
 * Usage in `sentry.edge.config.ts`:
 *
 *   import { initSentryEdge } from '@groupe-j/sentry-config/edge';
 *   initSentryEdge({ app: 'mega-hote' });
 *
 * Edge runtime has no Node APIs — no Prisma instrumentation, no profiling.
 */

import * as Sentry from "@sentry/nextjs";
import { createSentryBeforeSend } from "./before-send.js";
import { DEFAULT_IGNORED_ERRORS } from "./ignored.js";
import {
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_TRACES_SAMPLE_RATE,
  createTracesSampler,
} from "./sampling.js";

export type InitSentryEdgeOptions = {
  /** App name — tagged on every event. */
  app: string;
  /** Override the DSN (default: process.env.SENTRY_DSN). */
  dsn?: string;
  /** Extra error patterns to ignore. */
  ignoreErrors?: Array<string | RegExp>;
};

export function initSentryEdge(opts: InitSentryEdgeOptions): void {
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
    beforeSend: createSentryBeforeSend(app),
  });
}
