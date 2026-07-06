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
  /**
   * Enable Node.js profiling. Default: true (requires @sentry/profiling-node
   * as a peer dep). Set false if your platform doesn't support it (Vercel
   * Edge runtime, some serverless providers).
   *
   * Profiling captures stack traces at intervals to show CPU usage hotspots.
   * Sample rate controlled by `profilesSampleRate`. Vercel Fluid Compute (Node
   * runtime) supports it.
   */
  profiling?: boolean;
  /** Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS). */
  ignoreErrors?: Array<string | RegExp>;
  /** Custom integrations to add (in addition to defaults). */
  extraIntegrations?: unknown[];
  /**
   * Send default PII (cookies, headers, IP). Default: false (RGPD-safer).
   * Set true only when you have explicit user consent and need the data
   * for debugging (e.g. internal admin tools).
   */
  sendDefaultPii?: boolean;
  /**
   * Override the Sentry transport factory. Passed straight through to
   * `Sentry.init({ transport })`; when omitted the SDK's own transport is used
   * (no behaviour change — this is a rarely-needed escape hatch).
   *
   * The motivating case is getsentry/sentry-javascript#18871: under Next 16 +
   * Turbopack, `makeNodeTransport` on SDK v10.32–10.34 calls `suppressTracing()`,
   * which breaks the OpenTelemetry async context and silently drops server-side
   * events. This package's peer range (`>=10.63.0`) already excludes that window,
   * so you shouldn't hit it — but if a future SDK regression needs a different
   * transport, supply one here without forking init.
   *
   * Typed `unknown` on purpose so this package needn't depend on the SDK's
   * internal transport types; `Sentry.init` validates it at runtime.
   */
  transport?: unknown;
};

export function initSentryServer(opts: InitSentryServerOptions): void {
  const {
    app,
    dsn,
    prisma = true,
    profiling = true,
    ignoreErrors = [],
    extraIntegrations = [],
    sendDefaultPii = false,
    transport,
  } = opts;

  const integrations: unknown[] = [];
  if (prisma) {
    integrations.push(Sentry.prismaIntegration());
  }
  // Profiling is loaded lazily via require() to avoid making it a hard dep.
  // If @sentry/profiling-node is installed and profiling is enabled, add the
  // integration. Otherwise skip silently — apps that don't want profiling
  // simply don't install the optional peer dep.
  if (profiling) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const profMod = require("@sentry/profiling-node") as {
        nodeProfilingIntegration?: () => unknown;
      };
      if (typeof profMod.nodeProfilingIntegration === "function") {
        integrations.push(profMod.nodeProfilingIntegration());
      }
    } catch {
      // @sentry/profiling-node not installed — skip (intentional, no-op).
    }
  }

  // Vercel AI SDK auto-instrumentation. Populates the "AI Agents Overview"
  // dashboard in Sentry (model name, latency, token usage, errors).
  // Available in @sentry/nextjs 10.x — lazy-loaded so apps without `ai` package
  // don't trigger the integration overhead.
  try {
    const sentryAny = Sentry as unknown as {
      vercelAIIntegration?: () => unknown;
    };
    if (typeof sentryAny.vercelAIIntegration === "function") {
      integrations.push(sentryAny.vercelAIIntegration());
    }
  } catch {
    // Integration not available in this SDK version — skip.
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
    integrations: integrations as Parameters<typeof Sentry.init>[0]["integrations"],
    beforeSend: createSentryBeforeSend(app),
    _experiments: { enableLogs: true },
    // Opt-in transport override (getsentry/sentry-javascript#18871). Only spread
    // when provided so the SDK default is preserved for healthy setups.
    ...(transport !== undefined
      ? { transport: transport as Parameters<typeof Sentry.init>[0]["transport"] }
      : {}),
  });
}
