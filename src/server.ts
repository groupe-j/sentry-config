/**
 * Server-side (Node runtime) Sentry init helper.
 * For Vercel Fluid Compute and traditional Node.js.
 *
 * Usage in `sentry.server.config.ts`:
 *
 *   import { initSentryServer } from '@groupe-j/sentry-config/server';
 *   initSentryServer({ app: 'mega-hote' });
 *
 * With Prisma instrumentation enabled by default. Pass `prisma: false` to disable.
 */

import * as Sentry from "@sentry/nextjs";
import { createSentryBeforeSend } from "./before-send.js";
import { DEFAULT_IGNORED_ERRORS } from "./ignored.js";
import {
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_PROFILES_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  createTracesSampler,
} from "./sampling.js";

export type InitSentryServerOptions = {
  /** App name — tagged on every event for multi-tenant dashboards. */
  app: string;
  /** Override the server DSN (default: process.env.SENTRY_DSN). */
  dsn?: string;
  /** Enable Prisma query instrumentation (default true). */
  prisma?: boolean;
  /** Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS). */
  ignoreErrors?: Array<string | RegExp>;
  /** Custom integrations to add (in addition to defaults). */
  extraIntegrations?: unknown[];
};

export function initSentryServer(opts: InitSentryServerOptions): void {
  const { app, dsn, prisma = true, ignoreErrors = [], extraIntegrations = [] } = opts;

  const integrations: unknown[] = [];
  if (prisma) {
    integrations.push(Sentry.prismaIntegration());
  }
  integrations.push(...extraIntegrations);

  Sentry.init({
    dsn: dsn ?? process.env.SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    profilesSampleRate: SENTRY_PROFILES_SAMPLE_RATE,
    sendDefaultPii: false,
    enabled: SENTRY_ENABLED,
    debug: false,
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    integrations: integrations as Parameters<typeof Sentry.init>[0]["integrations"],
    beforeSend: createSentryBeforeSend(app),
    _experiments: { enableLogs: true },
  });
}
