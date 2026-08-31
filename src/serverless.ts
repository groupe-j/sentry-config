/**
 * Serverless-safe signal — capture a message AND drain the transport before the
 * platform freezes the function.
 *
 * ## The failure this fixes
 *
 * `Sentry.captureMessage` enqueues the event on an **asynchronous** transport
 * and returns immediately. A Vercel serverless function is **frozen the instant
 * it responds**, so the queue is never drained and the event silently never
 * arrives. `grep flush src/` on this package returned zero before this helper:
 * every app calling `captureMessage` inside a serverless route had the same
 * blind spot, and by construction none of them knew it (GRO-1072).
 *
 * ## Three things this helper gets right, and why each matters
 *
 * 1. **`defer` is INJECTED, not imported.** The runtime keep-alive is Vercel's
 *    `waitUntil` (`@vercel/functions`). Importing it here would bind this
 *    shared, platform-agnostic package to Vercel, though it also serves
 *    contexts that have no `waitUntil`. Same reasoning as the `Defer` port of
 *    `@groupe-j/notifications`. The caller passes the hook in.
 *
 * 2. **The flush is HANDED to the runtime, not merely launched.** An orphaned
 *    `Sentry.flush()` promise is killed by the freeze exactly like the queue it
 *    was meant to drain — so calling flush without `defer` would change nothing.
 *    We hand the flush promise to `defer` so the platform keeps the function
 *    alive until the drain completes.
 *
 * 3. **The flush is BOUNDED.** Without a bound, a Sentry outage would hold the
 *    function open until the platform's max timeout — one would pay a
 *    third-party incident in latency on every request. `flushTimeoutMs`
 *    (default 2000) caps the wait; `Sentry.flush` resolves `false` on timeout
 *    rather than hanging.
 *
 * ## Usage (Vercel route)
 *
 *   import { waitUntil } from '@vercel/functions';
 *   import { signalServerless } from '@groupe-j/sentry-config';
 *
 *   export async function POST(req: Request) {
 *     if (webhookCount === 0) {
 *       signalServerless('WebhookRecu à 0', waitUntil, {
 *         extra: { route: 'knock-webhook' },
 *         headers: Object.fromEntries(req.headers),
 *       });
 *     }
 *     return new Response('ok');
 *   }
 *
 * The precedent already lives in the portfolio: `@groupe-j/notifications`'
 * `sentryFailureSink` has done `await Sentry.flush(2000)` since 0.2.2 for
 * exactly this reason.
 */

import * as Sentry from "@sentry/nextjs";

import { scrubHeaders } from "./redaction.js";

/**
 * Sentry severity levels. Typed locally to keep this package decoupled from the
 * SDK's own types (see DECISIONS §11) — the SDK validates the string at runtime.
 */
export type SentrySeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

/**
 * A runtime keep-alive hook — Vercel's `waitUntil`, or any function that keeps
 * the process alive until the given promise settles. **Injected, never imported**
 * (see the module doc). The return value is ignored.
 */
export type DeferFn = (promise: Promise<unknown>) => void;

/** Default flush budget: long enough to drain a healthy transport, short enough
 *  that a Sentry outage can't hold the function past this. */
export const DEFAULT_FLUSH_TIMEOUT_MS = 2_000;

export interface SignalServerlessOptions {
  /** Severity for the captured message. Default: `"warning"`. */
  level?: SentrySeverityLevel;
  /**
   * Structured context attached to the event. Redacted by `beforeSend` at send
   * time like any other `extra`, so PII keys are scrubbed there too.
   */
  extra?: Record<string, unknown>;
  /**
   * Raw request headers to attach for debugging. Scrubbed with `scrubHeaders`
   * before attachment — credential-bearing headers (`authorization`, `cookie`,
   * webhook signatures) are dropped entirely; the rest survive under
   * `extra.headers`. Reuses the package's canonical scrubber rather than
   * re-implementing it per route.
   */
  headers?: Record<string, string>;
  /** Max ms to wait for the transport queue to drain. Default: 2000. */
  flushTimeoutMs?: number;
}

/**
 * Capture a serverless signal and hand a bounded transport flush to `defer`.
 *
 * Exactly one `captureMessage` per call (one signal, one capture). The flush is
 * queued *after* the capture so the drain sees the event, and handed to `defer`
 * so the runtime keeps the function alive until it settles.
 */
export function signalServerless(
  message: string,
  defer: DeferFn,
  options: SignalServerlessOptions = {},
): void {
  const { level = "warning", extra, headers, flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS } = options;

  const scrubbedHeaders = headers ? scrubHeaders(headers) : undefined;
  const mergedExtra =
    extra || scrubbedHeaders
      ? { ...extra, ...(scrubbedHeaders ? { headers: scrubbedHeaders } : {}) }
      : undefined;

  Sentry.captureMessage(message, {
    level,
    ...(mergedExtra ? { extra: mergedExtra } : {}),
  });

  // Hand the drain to the runtime, bounded. Orphaning it (no defer) would let
  // the freeze kill it exactly like the queue; leaving it unbounded would let a
  // Sentry outage hold the function to the platform max. Both are wrong.
  //
  // `.catch` is not optional: a raw rejected flush handed to `waitUntil` is an
  // unhandled rejection during the keep-alive window — a process crash, strictly
  // worse than the lost event this helper exists to fix (and against the house
  // "toujours un catch pour waitUntil" rule). We swallow to `false` — the same
  // value `Sentry.flush` already returns on timeout — rather than re-capturing:
  // the flush is failing *because* the Sentry transport is unreachable, so
  // reporting that through the same channel would only recurse.
  defer(Sentry.flush(flushTimeoutMs).catch(() => false));
}
