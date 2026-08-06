/**
 * Sentry Crons helper — wrap Vercel cron handlers to report check-ins.
 *
 * Usage in a Next.js API route :
 *
 *   // app/api/cron/cleaning-finalize/route.ts
 *   import { withCronMonitor } from '@groupe-j/sentry-config';
 *
 *   export const GET = withCronMonitor(
 *     'cleaning-finalize',
 *     async () => {
 *       await runCleaningFinalize();
 *       return new Response('ok');
 *     },
 *     { schedule: '0 6 * * *', maxRuntimeMinutes: 30 }
 *   );
 *
 * What it does:
 * - Reports "started" to Sentry Crons when invoked
 * - Reports "ok" or "error" based on the handler outcome
 * - Sentry detects skip / late / failed runs and alerts via #alerts-critical
 *
 * The `monitorSlug` must be unique across all your projects' Sentry crons.
 * Recommend `<app>-<cron-name>` (e.g., `megahote-cleaning-finalize`).
 */

import * as Sentry from "@sentry/nextjs";

export interface CronMonitorOptions {
  /**
   * Crontab schedule string (e.g., '0 6 * * *' for 6am daily).
   * MUST match the Vercel cron schedule exactly — Sentry uses this to
   * detect missed runs.
   */
  schedule: string;
  /**
   * Max time the cron should take, in minutes. Sentry alerts if exceeded.
   * Default: 30 minutes.
   */
  maxRuntimeMinutes?: number;
  /**
   * How many minutes after the schedule before considering the run "late".
   * Default: 5 minutes.
   */
  checkinMarginMinutes?: number;
  /**
   * Timezone for the schedule. Default: UTC (Vercel cron default).
   */
  timezone?: string;
  /**
   * Number of consecutive failures before opening a Sentry issue.
   * Default: 1 (alert on first failure).
   */
  failureIssueThreshold?: number;
  /**
   * Number of consecutive successes before closing the issue.
   * Default: 1.
   */
  recoveryThreshold?: number;
}

/**
 * Is this handler result a `Response` that reports a server error?
 *
 * `R` is unconstrained, so the test must be safe for *any* value — a plain
 * object, `undefined`, `null`, a number. Hence `instanceof Response` first:
 * only then is reading `.status` legal. Never an optimistic property access.
 *
 * The bound is `>= 500`: 500, 503 and 599 are failures; 499 is not.
 */
function isServerErrorResponse(result: unknown): boolean {
  return result instanceof Response && result.status >= 500;
}

/**
 * Wraps a Next.js route handler (typically a cron GET) with Sentry monitoring.
 *
 * Returns a new handler with identical signature. The Sentry check-in lifecycle
 * is fully transparent to the wrapped function.
 *
 * Why manual check-ins instead of `Sentry.withMonitor`: `withMonitor` only
 * reports "error" when its callback *throws*. A route handler that **returns**
 * a 500 `Response` terminates normally, so the check-in went out as "ok" on a
 * failed run. Making the wrapper throw instead would turn a clean 500 into an
 * unhandled exception and break the route — so we point the status by hand and
 * hand the caller its `Response` back untouched.
 */
export function withCronMonitor<Args extends unknown[], R>(
  monitorSlug: string,
  handler: (...args: Args) => Promise<R>,
  options: CronMonitorOptions,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    const monitorConfig = {
      schedule: { type: "crontab", value: options.schedule },
      maxRuntime: options.maxRuntimeMinutes ?? 30,
      checkinMargin: options.checkinMarginMinutes ?? 5,
      timezone: options.timezone ?? "UTC",
      failureIssueThreshold: options.failureIssueThreshold ?? 1,
      recoveryThreshold: options.recoveryThreshold ?? 1,
    } as const;

    const checkInId = Sentry.captureCheckIn(
      { monitorSlug, status: "in_progress" },
      monitorConfig,
    );
    const startedAt = Date.now();
    const finishCheckIn = (status: "ok" | "error"): void => {
      Sentry.captureCheckIn({
        monitorSlug,
        status,
        checkInId,
        duration: (Date.now() - startedAt) / 1000,
      });
    };

    let result: R;
    try {
      result = await handler(...args);
    } catch (error) {
      finishCheckIn("error");
      throw error;
    }

    finishCheckIn(isServerErrorResponse(result) ? "error" : "ok");
    return result;
  };
}
