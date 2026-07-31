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
type ReplayMode = boolean | "lazy";
interface InitSentryClientBaseOptions {
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
     * `0` is a legal value and is honoured: it disables browser tracing while
     * leaving error reporting on. Anything outside `[0, 1]` (or `NaN`) is a
     * programming error — it is logged loudly and the default is used, rather
     * than silently shipping a rate nobody chose.
     *
     * Precedence: this option > `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` > default.
     */
    tracesSampleRate?: number;
}

export type { InitSentryClientBaseOptions as I, ReplayMode as R };
