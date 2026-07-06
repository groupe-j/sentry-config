/**
 * Browser-side Sentry init helper.
 *
 * Usage in `sentry.client.config.ts`:
 *
 *   import { initSentryClient } from '@groupe-j/sentry-config/client';
 *   initSentryClient({ app: 'mega-hote' });
 *
 * For PDPA / consent gating (ridesamui pattern), pass an `enabled` predicate:
 *
 *   initSentryClient({ app: 'web', enabled: () => hasUserConsent() });
 */

import * as Sentry from "@sentry/nextjs";
import { createSentryBeforeSend } from "./before-send.js";
import { DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS } from "./ignored.js";
import {
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  createTracesSampler,
} from "./sampling.js";

export interface InitSentryClientOptions {
  /** App name — tagged on every event for multi-tenant dashboards. */
  app: string;
  /** Override the public DSN (default: process.env.NEXT_PUBLIC_SENTRY_DSN). */
  dsn?: string;
  /** Disable Sentry when this returns false (e.g. cookie consent gate). */
  enabled?: () => boolean;
  /** Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS). */
  ignoreErrors?: (string | RegExp)[];
  /** Disable Replay if you don't want session recording. */
  replay?: boolean;
  /** Mask all text in Replay (default true — safe). Set false only if no PII risk. */
  replayMaskAllText?: boolean;
  /** Block media in Replay (default true). */
  replayBlockAllMedia?: boolean;
  /**
   * Same-origin tunnel route to bypass ad-blockers. Match the tunnelRoute you
   * set in `withSentryConfig`. Example: `'/monitoring'`. Default: none.
   */
  tunnel?: string;
  /**
   * Send default PII (cookies, headers, IP). Default: false (RGPD-safer).
   * Set true only when you have explicit user consent and need the data.
   */
  sendDefaultPii?: boolean;
}

export function initSentryClient(opts: InitSentryClientOptions): void {
  const {
    app,
    dsn,
    enabled,
    ignoreErrors = [],
    replay = true,
    replayMaskAllText = true,
    replayBlockAllMedia = true,
    tunnel,
    sendDefaultPii = false,
  } = opts;

  const isEnabled = SENTRY_ENABLED && (enabled?.() ?? true);

  Sentry.init({
    dsn: dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    replaysSessionSampleRate: replay ? SENTRY_REPLAYS_SESSION_SAMPLE_RATE : 0,
    replaysOnErrorSampleRate: replay ? SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE : 0,
    enabled: isEnabled,
    sendDefaultPii,
    debug: false,
    ...(tunnel && { tunnel }),
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    denyUrls: DEFAULT_DENY_URLS,
    integrations: replay
      ? [
          Sentry.replayIntegration({
            maskAllText: replayMaskAllText,
            blockAllMedia: replayBlockAllMedia,
          }),
        ]
      : [],
    beforeSend: createSentryBeforeSend(app),
  });
}
