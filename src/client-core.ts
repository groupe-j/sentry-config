/**
 * Shared browser-init logic behind the two client entry points.
 *
 * ⚠️ **This module must never reference `Sentry.replayIntegration`.**
 * That single static reference is what pins `@sentry-internal/replay` (rrweb,
 * ~124 KB raw / ~39 KB gzip) into the consumer's *initial* chunk. The eager
 * reference lives in `client.ts` and nowhere else, which is precisely what lets
 * `client-lazy.ts` ship without those bytes. Measured (esbuild, minified,
 * `@sentry/nextjs` 10.65, browser condition):
 *
 *   init + browserTracing, no replay reference : 161.3 KB raw /  55.3 KB gzip
 *   init + browserTracing + replayIntegration  : 285.6 KB raw /  95.1 KB gzip
 *
 * See `DECISIONS.md` for why a dynamic `import()` of a local module does NOT
 * achieve this and `lazyLoadIntegration` does.
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
 * How Session Replay is loaded.
 *
 * - `true` — set up inside `Sentry.init()`. Records from the first line of the
 *   page. Costs ~39 KB gzip in the initial chunk. Only available on
 *   `@groupe-j/sentry-config/client`.
 * - `"lazy"` — fetched from the Sentry CDN after first paint (or on the first
 *   captured error) via the SDK's own `lazyLoadIntegration`. Costs **0 bytes**
 *   in the app bundle. Only available on
 *   `@groupe-j/sentry-config/client-lazy`.
 * - `false` — no Replay.
 *
 * 🪤 **The `false` trap — read this before reaching for it.** `replay: false`
 * does **not** make the bundle smaller. On the `client` entry the
 * `Sentry.replayIntegration` reference is *static*, so the bundler ships
 * `@sentry-internal/replay` whether or not the flag is on — the only thing
 * `false` changes is that it forces `replaysSessionSampleRate` **and**
 * `replaysOnErrorSampleRate` to `0`. You lose every error replay and keep every
 * byte. If your goal is bundle size, switch the import to
 * `@groupe-j/sentry-config/client-lazy`; if your goal is privacy, `false` is
 * the right call and the wasted bytes are the price.
 */
export type ReplayMode = boolean | "lazy";

export interface InitSentryClientBaseOptions {
  /** App name — tagged on every event for multi-tenant dashboards. */
  app: string;
  /** Override the public DSN (default: process.env.NEXT_PUBLIC_SENTRY_DSN). */
  dsn?: string;
  /** Disable Sentry when this returns false (e.g. cookie consent gate). Evaluated once, at init. */
  enabled?: () => boolean;
  /** Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS). */
  ignoreErrors?: (string | RegExp)[];
  /** Mask all text in Replay (default true — safe). Set false only if no PII risk. */
  replayMaskAllText?: boolean;
  /** Block media in Replay (default true). */
  replayBlockAllMedia?: boolean;
  /**
   * Same-origin tunnel route to bypass ad-blockers. Match the tunnelRoute you
   * set in `withSentryConfig`. Example: `'/monitoring'`. Default: none.
   *
   * ⚠️ The tunnel only covers **event ingestion**. In `"lazy"` mode the Replay
   * *code* is still fetched from `browser.sentry-cdn.com`, which a content
   * blocker can refuse independently. See {@link InitSentryClientBaseOptions.replayCdnBaseUrl}.
   */
  tunnel?: string;
  /**
   * Origin to fetch the lazily-loaded Replay bundle from. Defaults to Sentry's
   * public CDN (`https://browser.sentry-cdn.com`). Point it at your own origin
   * if your CSP or your ad-blocker tolerance requires it. Ignored when Replay
   * is eager.
   */
  replayCdnBaseUrl?: string;
  /**
   * Nonce forwarded to the lazily injected `<script>` tag, for apps running a
   * strict `script-src 'nonce-…'` CSP. Ignored when Replay is eager.
   */
  replayScriptNonce?: string;
  /**
   * Send default PII (cookies, headers, IP). Default: false (RGPD-safer).
   * Set true only when you have explicit user consent and need the data.
   */
  sendDefaultPii?: boolean;
}

/** Replay knobs handed to whichever integration factory ends up being used. */
export interface ReplayTuning {
  maskAllText: boolean;
  blockAllMedia: boolean;
}

/** Structural shape of `Sentry.replayIntegration` — kept loose on purpose. */
export type ReplayIntegrationFactory = (
  tuning: ReplayTuning,
) => ReturnType<typeof Sentry.browserTracingIntegration>;

export interface InitClientCoreParams {
  options: InitSentryClientBaseOptions;
  /** Resolved mode. */
  replay: ReplayMode;
  /**
   * Eager Replay factory, or `null` for entry points that must not reference
   * Replay statically. Passing `null` with `replay: true` is a programming
   * error and is treated as `"lazy"`.
   */
  eagerReplay: ReplayIntegrationFactory | null;
}

export function initClientCore({ options, replay, eagerReplay }: InitClientCoreParams): void {
  const {
    app,
    dsn,
    enabled,
    ignoreErrors = [],
    replayMaskAllText = true,
    replayBlockAllMedia = true,
    tunnel,
    replayCdnBaseUrl,
    replayScriptNonce,
    sendDefaultPii = false,
  } = options;

  const isEnabled = SENTRY_ENABLED && (enabled?.() ?? true);
  // `true` and `"lazy"` both record; only `false` turns Replay off entirely.
  const replayEnabled = replay !== false;
  const replayEager = replay === true && eagerReplay !== null;
  const tuning: ReplayTuning = {
    maskAllText: replayMaskAllText,
    blockAllMedia: replayBlockAllMedia,
  };

  Sentry.init({
    dsn: dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    // Rates are identical between `true` and `"lazy"`: the integration reads
    // them off the client options whenever it is set up — at init, or later.
    replaysSessionSampleRate: replayEnabled ? SENTRY_REPLAYS_SESSION_SAMPLE_RATE : 0,
    replaysOnErrorSampleRate: replayEnabled ? SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE : 0,
    enabled: isEnabled,
    sendDefaultPii,
    debug: false,
    ...(tunnel && { tunnel }),
    ...(replayCdnBaseUrl && { cdnBaseUrl: replayCdnBaseUrl }),
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    denyUrls: DEFAULT_DENY_URLS,
    integrations: [
      // Explicit — do not rely on the SDK default. `enableInp: true` has been
      // the default since SDK 8.x, but stating it here makes INP collection
      // survive a default flip and documents that INP (a Google ranking signal
      // since it replaced FID) is a first-class metric for us.
      // Note: `@sentry/nextjs` re-exports its OWN browserTracingIntegration
      // (App Router navigation instrumentation included), and a user-supplied
      // integration replaces the default of the same name — nothing is lost.
      Sentry.browserTracingIntegration({ enableInp: true }),
      ...(replayEager && eagerReplay ? [eagerReplay(tuning)] : []),
    ],
    beforeSend: createSentryBeforeSend(app),
  });

  if (replayEnabled && !replayEager && isEnabled) {
    scheduleLazyReplay(tuning, replayScriptNonce);
  }
}

/**
 * Attach Replay off the critical path, using the SDK's own CDN loader.
 *
 * Two triggers, whichever fires first:
 *  1. **idle after `load`** — the page has painted and the main thread is free,
 *     so fetching the Replay bundle costs the user nothing visible.
 *  2. **first captured error** — observed through the client `beforeSendEvent`
 *     hook. That hook is read-only: it captures nothing, so the house rule
 *     "one error = one capture" still holds. It bounds the blind window for
 *     apps that throw before `load` fires.
 *
 * ⚠️ **Honest limitation on `replaysOnErrorSampleRate`.** Replay's error mode
 * works by keeping a rolling buffer of the seconds *preceding* the error. That
 * buffer only exists once the integration is attached. So:
 *  - errors thrown **after** attach (the overwhelming majority — attach happens
 *    at first idle after `load`) get a normal buffered replay, and
 *    `replaysOnErrorSampleRate: 1.0` is honest for them;
 *  - errors thrown **before** attach get, at best, a replay that starts at
 *    attach time — the run-up to the error is not recorded, because nothing was
 *    recording yet.
 *
 * There is no way around that: recording early is the thing we are opting out
 * of. An app that must have replays for boot-time errors should import
 * `@groupe-j/sentry-config/client` and keep `replay: true`.
 */
function scheduleLazyReplay(tuning: ReplayTuning, scriptNonce?: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let requested = false;
  const attach = (): void => {
    if (requested) return;
    requested = true;
    // `lazyLoadIntegration` injects `<script src="<cdnBaseUrl>/<version>/replay.min.js">`
    // and resolves with the integration factory. Nothing about Replay is in our
    // bundle — that is the whole point of this module.
    Sentry.lazyLoadIntegration("replayIntegration", scriptNonce)
      .then((replayIntegration) => {
        Sentry.addIntegration(replayIntegration(tuning));
      })
      .catch(() => {
        // Never break the app because session recording failed to load (a
        // content blocker refusing browser.sentry-cdn.com is the common case),
        // and never turn this into a second capture path. A breadcrumb is
        // enough: it rides along with the next real error, where it is
        // actionable — it tells you why that event has no replay.
        Sentry.addBreadcrumb({
          category: "sentry.replay",
          level: "warning",
          message: "lazy Replay bundle failed to load — no session replay for this page",
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
