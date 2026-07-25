/**
 * Browser-side Sentry init helper.
 *
 * Usage in `instrumentation-client.ts` (Next 15+) or `sentry.client.config.ts`:
 *
 *   import { initSentryClient } from '@groupe-j/sentry-config/client';
 *   initSentryClient({ app: 'mega-hote' });
 *
 * For PDPA / consent gating (ridesamui pattern), pass an `enabled` predicate:
 *
 *   initSentryClient({ app: 'web', enabled: () => hasUserConsent() });
 *
 * ⚠️ `enabled` is evaluated ONCE, at init time. If the predicate reads a
 * consent cookie that the user only accepts later in the session, Sentry stays
 * off for the whole page — no errors, no pageload transactions. That is a
 * legitimate design (privacy first), but such an app reports nothing until the
 * visitor has consented AND loaded a new document.
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

/**
 * Replay loading strategy.
 *
 * - `true` (default) — Replay is set up during `Sentry.init()`.
 * - `"lazy"` — Replay is attached after first paint (idle after `load`), or as
 *   soon as an error is captured, from a **separate async chunk**.
 * - `false` — no Replay at all. ⚠️ READ THE TRAP BELOW BEFORE PICKING THIS.
 *
 * 🪤 **The `false` trap.** `replay: false` does NOT make the bundle smaller.
 * The `Sentry.replayIntegration` reference in the eager branch below is
 * *static*, so bundlers ship `@sentry-internal/replay` regardless of the
 * runtime flag — measured byte-identical on jepeuxconstruire. All `false` buys
 * you is `replaysOnErrorSampleRate: 0`: you *lose* the error replays and keep
 * the exact same bytes. If your goal is bundle size, see below.
 *
 * 📦 **Getting the bytes out.** Same reason, same limit: `"lazy"` alone moves
 * the *work* off the critical path but NOT the bytes, because a bundler cannot
 * know which mode you will pass at runtime — the eager branch stays reachable.
 * To actually drop `@sentry-internal/replay` from the initial chunk, set the
 * build-time env var
 *
 *     NEXT_PUBLIC_SENTRY_REPLAY_MODE=lazy
 *
 * Next inlines `NEXT_PUBLIC_*` literals into the browser bundle, which makes
 * the eager branch statically dead and lets the bundler tree-shake Replay into
 * the async chunk. The env var also flips the default mode to `"lazy"`, so
 * apps get the win without touching their init call — and an app that does NOT
 * set it keeps today's bytes and today's behaviour, to the byte.
 */
export type ReplayMode = boolean | "lazy";

/**
 * Build-time constant: `process.env.NEXT_PUBLIC_*` is text-replaced by Next
 * (webpack DefinePlugin / Turbopack define) in every browser module, including
 * this one inside `node_modules`. When the app sets the var to `lazy`, this
 * folds to `true` and every `!REPLAY_LAZY_AT_BUILD` branch below becomes dead
 * code — that is what removes the Replay bytes.
 */
const REPLAY_LAZY_AT_BUILD = process.env.NEXT_PUBLIC_SENTRY_REPLAY_MODE === "lazy";

export interface InitSentryClientOptions {
  /** App name — tagged on every event for multi-tenant dashboards. */
  app: string;
  /** Override the public DSN (default: process.env.NEXT_PUBLIC_SENTRY_DSN). */
  dsn?: string;
  /** Disable Sentry when this returns false (e.g. cookie consent gate). Evaluated once, at init. */
  enabled?: () => boolean;
  /** Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS). */
  ignoreErrors?: (string | RegExp)[];
  /**
   * Replay strategy: `true` (eager), `"lazy"` (async chunk after first paint),
   * or `false` (off — see the trap documented on {@link ReplayMode}).
   *
   * Default: `"lazy"` when the build sets `NEXT_PUBLIC_SENTRY_REPLAY_MODE=lazy`,
   * otherwise `true`.
   */
  replay?: ReplayMode;
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
    replay = REPLAY_LAZY_AT_BUILD ? "lazy" : true,
    replayMaskAllText = true,
    replayBlockAllMedia = true,
    tunnel,
    sendDefaultPii = false,
  } = opts;

  const isEnabled = SENTRY_ENABLED && (enabled?.() ?? true);
  // `true` and `"lazy"` both record; only `false` turns Replay off entirely.
  const replayEnabled = replay !== false;
  // Eager = set up inside `Sentry.init`. Compiled out when the build asked for
  // lazy, in which case even an explicit `replay: true` is served lazily
  // (better a slightly late Replay than a silently missing one).
  const replayEager = replay === true && !REPLAY_LAZY_AT_BUILD;

  Sentry.init({
    dsn: dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    // Rates stay identical between `true` and `"lazy"`: the integration reads
    // them from the client options whenever it is set up (at init, or later).
    replaysSessionSampleRate: replayEnabled ? SENTRY_REPLAYS_SESSION_SAMPLE_RATE : 0,
    replaysOnErrorSampleRate: replayEnabled ? SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE : 0,
    enabled: isEnabled,
    sendDefaultPii,
    debug: false,
    ...(tunnel && { tunnel }),
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    denyUrls: DEFAULT_DENY_URLS,
    integrations: [
      // Explicit — do not rely on the SDK default. `enableInp: true` has been
      // the default since SDK 8.x, but stating it here makes INP collection
      // survive a default flip and documents that INP (a Google ranking signal
      // since it replaced FID) is a first-class metric for us.
      // Note: `@sentry/nextjs` re-exports its OWN browserTracingIntegration
      // (App Router navigation instrumentation included), and a user-provided
      // integration replaces the default of the same name — nothing is lost.
      Sentry.browserTracingIntegration({ enableInp: true }),
      // Static reference ON PURPOSE only in the eager branch. See ReplayMode:
      // this is the line that keeps Replay in the initial chunk, and the
      // `REPLAY_LAZY_AT_BUILD` guard is what lets a build delete it.
      ...(replayEager
        ? [
            Sentry.replayIntegration({
              maskAllText: replayMaskAllText,
              blockAllMedia: replayBlockAllMedia,
            }),
          ]
        : []),
    ],
    beforeSend: createSentryBeforeSend(app),
  });

  if (replayEnabled && !replayEager && isEnabled) {
    scheduleLazyReplay({
      maskAllText: replayMaskAllText,
      blockAllMedia: replayBlockAllMedia,
    });
  }
}

interface ScheduleLazyReplayOptions {
  maskAllText: boolean;
  blockAllMedia: boolean;
}

/**
 * Attach Replay off the critical path.
 *
 * Two triggers, whichever fires first:
 *  1. **idle after load** — the page has painted and the main thread is free,
 *     so downloading the Replay chunk costs the user nothing visible.
 *  2. **first captured error** — via the client `beforeSendEvent` hook, a
 *     read-only observer that captures nothing (the house rule "one error =
 *     one capture" still holds). It bounds the blind window for apps that
 *     error before `load` fires.
 *
 * ⚠️ **Honest limitation.** Replay buffers the seconds *preceding* an error.
 * An error thrown before the integration is attached therefore carries NO
 * replay: `replaysOnErrorSampleRate: 1.0` only applies from the attach
 * onwards. In `"lazy"` mode that blind window is roughly [init → first paint].
 * If you need replays for boot-time errors, keep `replay: true`.
 */
function scheduleLazyReplay(opts: ScheduleLazyReplayOptions): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let requested = false;
  const attach = (): void => {
    if (requested) return;
    requested = true;
    void import("./replay-lazy.js")
      .then((mod) => {
        mod.attachReplayIntegration(opts);
      })
      .catch(() => {
        // Never break the app because session recording failed to load, and
        // never turn this into a second capture path. A breadcrumb is enough:
        // it rides along with the next real error, where it is actionable.
        Sentry.addBreadcrumb({
          category: "sentry.replay",
          level: "warning",
          message: "lazy replay chunk failed to load — no session replay for this page",
        });
      });
  };

  Sentry.getClient()?.on("beforeSendEvent", (event) => {
    if (event.exception) attach();
  });

  const onLoaded = (): void => {
    // `requestIdleCallback` is missing on Safari < 16.4 — fall back to a timer.
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => attach(), { timeout: 3000 });
    } else {
      window.setTimeout(attach, 1500);
    }
  };

  if (document.readyState === "complete") onLoaded();
  else window.addEventListener("load", onLoaded, { once: true });
}
