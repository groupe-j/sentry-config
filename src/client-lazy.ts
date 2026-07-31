/**
 * Browser-side Sentry init helper — **lazy Replay** entry point.
 *
 * Drop-in replacement for `@groupe-j/sentry-config/client`: same options, same
 * `initSentryClient` name, one import line to change.
 *
 *   import { initSentryClient } from '@groupe-j/sentry-config/client-lazy';
 *   initSentryClient({ app: 'mega-hote' });
 *
 * ## What it buys you
 *
 * Nothing in this module — or in anything it imports — references
 * `Sentry.replayIntegration`. rrweb is therefore absent from your bundle
 * entirely; Replay is fetched from Sentry's CDN at the first idle after `load`,
 * through the
 * SDK's own `lazyLoadIntegration`. Measured with esbuild (minified,
 * `@sentry/nextjs` 10.65, browser condition), initial chunk of a minimal app:
 *
 *   /client      (replay: true)  292.2 KB raw / 97.5 KB gzip   ← rrweb inside
 *   /client-lazy (replay: lazy)  167.8 KB raw / 57.8 KB gzip   ← rrweb absent
 *   ------------------------------------------------------------------------
 *   saved                        124.4 KB raw / 39.7 KB gzip
 *
 * ## What it costs you — read before adopting
 *
 * 1. **CSP.** The Replay bundle is injected as
 *    `<script src="https://browser.sentry-cdn.com/<version>/replay.min.js">`.
 *    Your `script-src` must allow that origin (or pass `replayScriptNonce`, or
 *    self-host via `replayCdnBaseUrl`). On an app with a service worker
 *    (Serwist/Workbox) the SW may re-fetch that `<script src>` through the
 *    Fetch API, in which case the origin is **also** needed in `connect-src`.
 * 2. **Content blockers.** `browser.sentry-cdn.com` is on common blocklists. A
 *    `tunnelRoute` does not help — it tunnels *events*, not the script. When the
 *    fetch fails the page is unaffected and a breadcrumb records why the next
 *    event has no replay.
 * 3. **Third-party code, no SRI.** The SDK injects the tag with
 *    `crossorigin="anonymous"` but *without* an `integrity` hash (it cannot know
 *    it ahead of time), so you are trusting Sentry's CDN at runtime. Eager
 *    Replay ships the same code, but pinned by your lockfile and served from
 *    your own origin. Apps that cannot accept a third-party script at runtime
 *    should either self-host the bundle (`replayCdnBaseUrl`, **origin only** —
 *    any path you put there is discarded) or stay eager.
 * 4. **The URL is pinned to the installed SDK version.** It resolves to
 *    `<cdnBaseUrl>/<SDK_VERSION>/replay.min.js`. A dependency bump that outruns
 *    the CDN — or a version whose bundle was never published — breaks Replay
 *    everywhere at once, and a lazily-loaded feature that fails is invisible by
 *    nature. That is the `sharp 0.35` failure class. On failure this module
 *    sets the scope tag `replay.lazy: "failed"` so you can query for it in
 *    Sentry instead of waiting to notice; it deliberately does **not** capture
 *    an event of its own (house rule: one error = one capture).
 * 5. **Boot-time errors have no run-up.** Replay's error mode records the
 *    seconds *preceding* an error from a rolling buffer that only exists once
 *    the integration is attached. Errors thrown before attach (roughly
 *    `init` → first paint) get no run-up. `replaysOnErrorSampleRate` stays at
 *    its normal value and is honest for every error after attach, which is the
 *    overwhelming majority. If you need replays for boot-time errors
 *    specifically, stay on `@groupe-j/sentry-config/client` with `replay: true`.
 */

import {
  type InitSentryClientBaseOptions,
  initClientCore,
} from "./client-core.js";

/**
 * Replay strategies available on this entry point.
 *
 * `true` is deliberately **not** offered: honouring it would require a static
 * `Sentry.replayIntegration` reference, which is exactly the ~39 KB gzip this
 * module exists to avoid. Use `@groupe-j/sentry-config/client` for eager
 * Replay.
 */
export type LazyReplayMode = "lazy" | false;

/** See the note on the same re-export in `client.ts` — never import the barrel from a client module. */
export { SENTRY_BROWSER_TRACES_SAMPLE_RATE } from "./sampling.js";

export interface InitSentryClientLazyOptions extends InitSentryClientBaseOptions {
  /**
   * `"lazy"` (default) — Replay fetched from the CDN after first paint or on
   * the first captured error. `false` — no Replay at all, and unlike on the
   * eager entry point `false` here saves no *further* bytes because there were
   * none to save; it just zeroes `replaysOnErrorSampleRate`.
   *
   * @default "lazy"
   */
  replay?: LazyReplayMode;
}

export function initSentryClient(opts: InitSentryClientLazyOptions): void {
  const { replay = "lazy", ...rest } = opts;
  initClientCore({
    options: rest satisfies InitSentryClientBaseOptions,
    replay,
    // `null` is the load-bearing part: no eager factory means no static
    // `replayIntegration` reference reachable from this entry point.
    eagerReplay: null,
  });
}
