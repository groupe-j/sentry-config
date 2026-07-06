/**
 * Browser-side Sentry init helper.
 *
 * Usage in `sentry.client.config.ts`:
 *
 *   import { initSentryClient } from '@groupe-j/sentry-config/client';
 *   initSentryClient({ app: 'mega-hote' });
 *
 * For PDPA / consent gating (ridesamui pattern), pass an `enabled` predicate:
 *
 *   initSentryClient({ app: 'web', enabled: () => hasUserConsent() });
 */
interface InitSentryClientOptions {
    /** App name — tagged on every event for multi-tenant dashboards. */
    app: string;
    /** Override the public DSN (default: process.env.NEXT_PUBLIC_SENTRY_DSN). */
    dsn?: string;
    /** Disable Sentry when this returns false (e.g. cookie consent gate). */
    enabled?: () => boolean;
    /** Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS). */
    ignoreErrors?: (string | RegExp)[];
    /** Disable Replay if you don't want session recording. */
    replay?: boolean;
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

export { type InitSentryClientOptions, initSentryClient };
