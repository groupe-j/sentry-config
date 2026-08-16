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
 *   /client-lazy (no replay reference) : 167.8 KB raw / 57.8 KB gzip
 *   /client      (replay: true)        : 292.2 KB raw / 97.5 KB gzip
 *
 * See `DECISIONS.md` for why a dynamic `import()` of a local module does NOT
 * achieve this and `lazyLoadIntegration` does.
 */

import * as Sentry from "@sentry/nextjs";
import { createSentryBeforeSend } from "./before-send.js";
import { DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS } from "./ignored.js";
import {
  SENTRY_BROWSER_TRACES_SAMPLE_RATE,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
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
  /**
   * Gate **Replay alone**, without gating Sentry. Return `false` to skip the
   * attach; return `true` to allow it.
   *
   * ## Why this is not `enabled`
   *
   * `enabled` turns off the whole SDK and is evaluated **once, at init**. Two
   * reasons that does not fit a consent banner:
   *
   * 1. **Error monitoring and session recording do not share a legal basis.**
   *    Capturing errors is routinely run on legitimate interest — security and
   *    availability — while recording a user's screen is not. An app that needs
   *    "Sentry always, Replay only on consent" has no way to say so with
   *    `enabled`, and the two apps that needed it hand-rolled the gate instead
   *    (which is what kept them on the eager entry point, and on ~124 KB of
   *    rrweb in the initial chunk).
   * 2. **At init, the answer is not knowable yet.** `instrumentation-client.ts`
   *    runs before the first React render, so before any consent manager has
   *    loaded. Reading consent there means reading it too early — you either
   *    never record, or you record regardless, and the second is worse.
   *
   * This callback is therefore evaluated **at each attach trigger** (idle after
   * `load`, and again on a captured error), not at init. By then the consent
   * cookie is readable.
   *
   * @example
   * initSentryClient({
   *   app: "archicollab",
   *   // Sentry stays on: legitimate interest (security, availability).
   *   // Replay waits for an explicit opt-in.
   *   replayConsent: () => readConsentFromCookie(SENTRY_SERVICE_KEY),
   * });
   *
   * ⚠️ **Known gap, stated rather than hidden.** A refusal does not consume an
   * attach attempt, so consent granted *later* is still honoured — but only at
   * the next trigger, and the idle-after-`load` trigger fires once. In practice
   * that means: consent granted, then an error occurs → Replay attaches;
   * consent granted, no error, no further trigger → no Replay for that page
   * view. It resumes on the next navigation that reloads the document. Recording
   * a user who has not (yet) agreed is the failure this option exists to
   * prevent, so the gap is deliberately on the side of not recording.
   *
   * Ignored when Replay is eager (`@groupe-j/sentry-config/client` with
   * `replay: true`): there is no attach step to gate. Gate that entry point with
   * `replay: false` instead.
   */
  replayConsent?: () => boolean;
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
   *
   * ⚠️ **Origin only — any path is discarded.** The SDK resolves
   * `new URL("/<version>/replay.min.js", baseURL)`, and the leading slash makes
   * that origin-absolute: `https://cdn.example.com/sentry` fetches
   * `https://cdn.example.com/<version>/replay.min.js`, *not*
   * `…/sentry/<version>/…`. Serve the bundle at the root of whatever origin you
   * point this at, or you get a 404 and no Replay.
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
  /**
   * Fraction of browser pageloads / navigations that get a trace, in `[0, 1]`.
   *
   * Default: {@link SENTRY_BROWSER_TRACES_SAMPLE_RATE} — **1.0 in production**,
   * 1.0 in dev. Read that doc comment before overriding: it carries the
   * measured volumes and the threshold at which coming back down to `0.2` is
   * the right call (**~500 pageloads/day**).
   *
   * This knob is browser-only. `initSentryServer` / `initSentryEdge` keep
   * `SENTRY_TRACES_SAMPLE_RATE` (10%), which is what the server tier's volume
   * justifies.
   *
   * `0` is a legal value and is honoured as written: no pageload and no
   * navigation traces, error reporting untouched.
   *
   * ⚠️ **`0` here does NOT zero your browser span bill.** Standalone web-vital
   * spans (INP, and CLS/LCP when enabled) are sampled on their **own** rate —
   * `SENTRY_WEBVITAL_SAMPLE_RATE`, 100% by default — and `createTracesSampler`
   * settles them *before* it looks at this one. That decoupling is deliberate
   * (it is why INP stopped being empty portfolio-wide in 0.6.0, and
   * "web vitals only, no full pageload traces" is a genuinely good setting for a
   * low-traffic vitrine), but it does mean `tracesSampleRate: 0` alone leaves
   * one span per interactive page still flowing. For an actual full stop, add
   * `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE=0`.
   *
   * Anything outside `[0, 1]` (or `NaN`) is a programming error — it is logged
   * loudly and the default is used, rather than silently shipping a rate nobody
   * chose.
   *
   * Precedence: this option > `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` > default.
   */
  tracesSampleRate?: number;
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
    replayConsent,
    tunnel,
    replayCdnBaseUrl,
    replayScriptNonce,
    sendDefaultPii = false,
    tracesSampleRate,
  } = options;

  const isEnabled = SENTRY_ENABLED && (enabled?.() ?? true);
  const tracesRate = resolveTracesRate(tracesSampleRate);
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
    tracesSampler: createTracesSampler(tracesRate),
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
    scheduleLazyReplay(tuning, replayScriptNonce, replayConsent);
  }
}

/**
 * Resolve the browser traces rate from the explicit option, falling back to
 * {@link SENTRY_BROWSER_TRACES_SAMPLE_RATE}.
 *
 * `undefined` means "not supplied" and takes the default. `0` is a real choice
 * and is kept — hence `?? `-style handling rather than a truthiness test, which
 * would have silently turned "no browser tracing" into "trace everything".
 *
 * An out-of-range number is NOT quietly coerced. Clamping a typo'd `10` down to
 * `1` would ship 10× the intended volume under the appearance of working, and
 * dropping it to `0` would kill tracing on an app that asked for more of it.
 * Both are the failure this whole change exists to end, so the caller gets a
 * loud `console.error` and the documented default.
 */
function resolveTracesRate(rate: number | undefined): number {
  if (rate === undefined) return SENTRY_BROWSER_TRACES_SAMPLE_RATE;
  if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate;
  console.error(
    `[sentry-config] initSentryClient: tracesSampleRate must be a number in [0, 1], got ${String(rate)}. ` +
      `Falling back to the default (${SENTRY_BROWSER_TRACES_SAMPLE_RATE}).`,
  );
  return SENTRY_BROWSER_TRACES_SAMPLE_RATE;
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
function scheduleLazyReplay(
  tuning: ReplayTuning,
  scriptNonce?: string,
  replayConsent?: () => boolean,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Two triggers race for one attach. `pending` guards against a double fetch;
  // `attempts` caps the retries. A *failed* attempt releases the guard so the
  // later trigger can still succeed: the error trigger can fire during boot on a
  // congested network, and burning the single chance there would kill the
  // idle-after-`load` attempt that would have worked.
  const MAX_ATTEMPTS = 2;
  let pending = false;
  let attempts = 0;
  let attached = false;

  const attach = (): void => {
    if (pending || attached || attempts >= MAX_ATTEMPTS) return;
    // Consent is checked HERE, at each trigger — not at init, where the answer
    // is not knowable yet — and BEFORE `attempts` is incremented. A refusal
    // must not burn one of the two attempts: otherwise a visitor who declines
    // at the idle trigger and accepts a second later would be locked out for
    // the whole page view by the very guard meant to cap retries.
    if (replayConsent && !replayConsent()) return;
    pending = true;
    attempts += 1;
    // `lazyLoadIntegration` injects `<script src="<cdnBaseUrl>/<version>/replay.min.js">`
    // and resolves with the integration factory. Nothing about Replay is in our
    // bundle — that is the whole point of this module.
    Sentry.lazyLoadIntegration("replayIntegration", scriptNonce)
      .then((replayIntegration) => {
        attached = true;
        pending = false;
        Sentry.addIntegration(replayIntegration(tuning));
      })
      .catch(() => {
        pending = false;
        // Never break the app because session recording failed to load (a
        // content blocker refusing browser.sentry-cdn.com is the common case),
        // and never turn this into a second capture path — no captureException,
        // no captureMessage. Two passive signals instead:
        //  - a breadcrumb, which rides along with the next real event and tells
        //    you why that event has no replay;
        //  - a scope tag, so the failure is *queryable* in Sentry
        //    (`replay.lazy:failed`) rather than only readable one event at a
        //    time. That matters because the CDN URL is pinned to the installed
        //    SDK version: a dependency bump that outruns the CDN would break
        //    Replay portfolio-wide, and a breadcrumb alone only surfaces when
        //    some unrelated error happens to occur on the same page.
        Sentry.addBreadcrumb({
          category: "sentry.replay",
          level: "warning",
          message: "lazy Replay bundle failed to load — no session replay for this page",
        });
        Sentry.setTag("replay.lazy", "failed");
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
