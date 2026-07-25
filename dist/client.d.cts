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
type ReplayMode = boolean | "lazy";
interface InitSentryClientOptions {
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
declare function initSentryClient(opts: InitSentryClientOptions): void;

export { type InitSentryClientOptions, type ReplayMode, initSentryClient };
