/**
 * Guard that a Sentry SDK is actually "armed" — i.e. initialised with a real
 * DSN — so a missing-DSN / no-op SDK fails *visibly* instead of silently
 * swallowing every event.
 *
 * The failure mode this prevents: `Sentry.init()` runs with an empty/undefined
 * DSN (missing env var, wrong runtime), the SDK installs a no-op client, and
 * the app looks healthy while every `captureException` goes nowhere — exactly
 * the blind spot behind GRO-295. Call this right after `Sentry.init` on the
 * server:
 *
 *   import * as Sentry from '@sentry/nextjs';
 *   import { assertSentryArmed } from '@groupe-j/sentry-config';
 *
 *   initSentryServer({ app: 'portal' });
 *   assertSentryArmed(Sentry, { throwOnMissing: process.env.NODE_ENV === 'production' });
 */
/** Minimal structural shape of a Sentry client (what `getClient()` returns). */
interface SentryClientLike {
    getDsn: () => unknown;
}
/**
 * Minimal structural shape of the Sentry SDK needed to check arming — satisfied
 * by `@sentry/nextjs`, `@sentry/node`, `@sentry/browser`, etc.
 */
interface SentryArmedLike {
    getClient: () => SentryClientLike | undefined;
}
interface AssertSentryArmedOptions {
    /**
     * Throw a hard error when no DSN is configured, instead of only logging.
     * Default: false (log loudly but let the app continue). Set true in
     * production startup if you'd rather fail the boot than run blind.
     */
    throwOnMissing?: boolean;
}
/**
 * Returns `true` when Sentry has a live client with a DSN. When it doesn't,
 * logs a loud `console.error` and returns `false` — or throws if
 * `throwOnMissing` is set.
 */
declare function assertSentryArmed(Sentry: SentryArmedLike, options?: AssertSentryArmedOptions): boolean;

export { type AssertSentryArmedOptions, type SentryArmedLike, type SentryClientLike, assertSentryArmed };
