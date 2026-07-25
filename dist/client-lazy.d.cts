import { I as InitSentryClientBaseOptions } from './client-core-Chixsrq_.cjs';

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
 * entirely; Replay is fetched from Sentry's CDN after first paint through the
 * SDK's own `lazyLoadIntegration`. Measured with esbuild (minified,
 * `@sentry/nextjs` 10.65, browser condition), initial chunk of a minimal app:
 *
 *   /client      (replay: true)  285.6 KB raw / 95.1 KB gzip   ← rrweb inside
 *   /client-lazy (replay: lazy)  163.2 KB raw / 56.0 KB gzip   ← rrweb absent
 *   ------------------------------------------------------------------------
 *   saved                        122.4 KB raw / 39.1 KB gzip
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
 *    should either self-host the bundle (`replayCdnBaseUrl`) or stay eager.
 * 4. **Boot-time errors have no run-up.** Replay's error mode records the
 *    seconds *preceding* an error from a rolling buffer that only exists once
 *    the integration is attached. Errors thrown before attach (roughly
 *    `init` → first paint) get no run-up. `replaysOnErrorSampleRate` stays at
 *    its normal value and is honest for every error after attach, which is the
 *    overwhelming majority. If you need replays for boot-time errors
 *    specifically, stay on `@groupe-j/sentry-config/client` with `replay: true`.
 */

/**
 * Replay strategies available on this entry point.
 *
 * `true` is deliberately **not** offered: honouring it would require a static
 * `Sentry.replayIntegration` reference, which is exactly the ~39 KB gzip this
 * module exists to avoid. Use `@groupe-j/sentry-config/client` for eager
 * Replay.
 */
type LazyReplayMode = "lazy" | false;
interface InitSentryClientLazyOptions extends InitSentryClientBaseOptions {
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
declare function initSentryClient(opts: InitSentryClientLazyOptions): void;

export { type InitSentryClientLazyOptions, type LazyReplayMode, initSentryClient };
