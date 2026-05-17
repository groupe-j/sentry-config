/**
 * `beforeSend` callback factory. Tags events with app name and scrubs PII.
 *
 * Returns a NEW event object (no mutation) — downstream Sentry integrations
 * (Replay, etc.) may read the event after `beforeSend` returns; mutation
 * would leak to them.
 */
type SentryEventLike = {
    tags?: Record<string, unknown>;
    request?: {
        data?: unknown;
        headers?: Record<string, string>;
    };
    breadcrumbs?: Array<{
        data?: unknown;
    }>;
    extra?: Record<string, unknown>;
    contexts?: Record<string, unknown>;
};
declare function createSentryBeforeSend<E extends SentryEventLike>(appName: string): (event: E) => E;

/**
 * PII redaction by key-name (not regex on values).
 *
 * Why key-name: cheap, predictable, no false negatives on well-named fields.
 * Redaction is visible (`"[REDACTED]"`) so missing data is obvious in Sentry UI
 * rather than silent.
 *
 * Why whole-word + normalization (not substring): substring would over-redact
 * `ipAddress`, `requestToken`, etc. Normalisation handles `id_card` ≡ `idCard`
 * ≡ `id-card` (all become `idcard` → match).
 *
 * Why WeakSet cycle guard: Sentry events hold cycles via
 * `contexts.react.componentStack` or error.cause chains from Apollo/Prisma.
 * A throw in `beforeSend` causes Sentry to silently drop the event —
 * exactly the failure mode this helper is meant to prevent.
 */
declare const REDACTED = "[REDACTED]";
declare function isSensitive(key: string): boolean;
declare function redact(value: unknown, seen?: WeakSet<object>): unknown;
declare function scrubHeaders(headers: Record<string, string>): Record<string, string>;

/**
 * Sampling rates per environment.
 *
 * process.env.NODE_ENV is baked at build time in Next.js, so reading once
 * at module load is safe.
 *
 * Production: 10% (cost control)
 * Dev/preview: 100% (catch everything during development)
 * Test: disabled (no Sentry noise from CI)
 */
declare const SENTRY_TRACES_SAMPLE_RATE: number;
declare const SENTRY_PROFILES_SAMPLE_RATE: number;
declare const SENTRY_REPLAYS_SESSION_SAMPLE_RATE: number;
declare const SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
declare const SENTRY_ENABLED: boolean;
declare const SENTRY_ENVIRONMENT: string;
/**
 * Loose SamplingContext shape — matches @sentry/types without coupling.
 */
type SamplingContextLike = {
    name?: string;
    transactionContext?: {
        name?: string;
    };
    request?: {
        url?: string;
    };
};
/**
 * Builds a `tracesSampler` that returns 0 for low-value routes.
 * Pass to `Sentry.init({ tracesSampler: createTracesSampler(0.1) })`.
 */
declare function createTracesSampler(defaultRate?: number): (ctx: SamplingContextLike) => number;

/**
 * User context helpers.
 *
 * Call `setSentryUser` right after authentication (BetterAuth onSession,
 * Clerk userSession, or your own auth middleware). Sentry events captured
 * after this call will include the user identity and any tenant tags.
 *
 * Call `clearSentryUser` on logout.
 */
type SentryUserContext = {
    /** Stable user identifier (DB id, NOT email). */
    id: string;
    /** Optional — only set if email is OK to send (consider PDPA/RGPD). */
    email?: string;
    /** Tenant/org/agency id for multi-tenant apps (ridesamui, prono.pro, mirey). */
    tenant?: string;
    /** Plan tier (free/premium/enterprise) — useful for "is this a paying client?". */
    plan?: string;
};
declare function setSentryUser(user: SentryUserContext): void;
declare function clearSentryUser(): void;

/**
 * Bot detection — to filter out crawler noise from Sentry.
 *
 * Coverage: Googlebot, Bingbot, Slurp, DuckDuckBot, Baiduspider, YandexBot,
 * facebookexternalhit, Twitterbot, LinkedInBot, WhatsApp, Telegrambot,
 * AhrefsBot, SemrushBot, MJ12bot, DataForSeoBot, generic curl/wget/python-requests.
 */
declare function isBot(userAgent?: string | null): boolean;

/**
 * Default error patterns ignored by Sentry.
 *
 * Browser-side: framework artifacts (NEXT_REDIRECT), browser quirks
 * (ResizeObserver, hydration noise on hot reload), and network failures
 * that aren't actionable.
 *
 * Extend per-app via `ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...yourCustom]`.
 */
declare const DEFAULT_IGNORED_ERRORS: Array<string | RegExp>;
declare const DEFAULT_DENY_URLS: RegExp[];

/**
 * Sentry Crons helper — wrap Vercel cron handlers to report check-ins.
 *
 * Usage in a Next.js API route :
 *
 *   // app/api/cron/cleaning-finalize/route.ts
 *   import { withCronMonitor } from '@groupe-j/sentry-config';
 *
 *   export const GET = withCronMonitor(
 *     'cleaning-finalize',
 *     async () => {
 *       await runCleaningFinalize();
 *       return new Response('ok');
 *     },
 *     { schedule: '0 6 * * *', maxRuntimeMinutes: 30 }
 *   );
 *
 * What it does:
 * - Reports "started" to Sentry Crons when invoked
 * - Reports "ok" or "error" based on the handler outcome
 * - Sentry detects skip / late / failed runs and alerts via #alerts-critical
 *
 * The `monitorSlug` must be unique across all your projects' Sentry crons.
 * Recommend `<app>-<cron-name>` (e.g., `megahote-cleaning-finalize`).
 */
type CronMonitorOptions = {
    /**
     * Crontab schedule string (e.g., '0 6 * * *' for 6am daily).
     * MUST match the Vercel cron schedule exactly — Sentry uses this to
     * detect missed runs.
     */
    schedule: string;
    /**
     * Max time the cron should take, in minutes. Sentry alerts if exceeded.
     * Default: 30 minutes.
     */
    maxRuntimeMinutes?: number;
    /**
     * How many minutes after the schedule before considering the run "late".
     * Default: 5 minutes.
     */
    checkinMarginMinutes?: number;
    /**
     * Timezone for the schedule. Default: UTC (Vercel cron default).
     */
    timezone?: string;
    /**
     * Number of consecutive failures before opening a Sentry issue.
     * Default: 1 (alert on first failure).
     */
    failureIssueThreshold?: number;
    /**
     * Number of consecutive successes before closing the issue.
     * Default: 1.
     */
    recoveryThreshold?: number;
};
/**
 * Wraps a Next.js route handler (typically a cron GET) with Sentry monitoring.
 *
 * Returns a new handler with identical signature. The Sentry check-in lifecycle
 * is fully transparent to the wrapped function.
 */
declare function withCronMonitor<Args extends unknown[], R>(monitorSlug: string, handler: (...args: Args) => Promise<R>, options: CronMonitorOptions): (...args: Args) => Promise<R>;

export { type CronMonitorOptions, DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS, REDACTED, SENTRY_ENABLED, SENTRY_ENVIRONMENT, SENTRY_PROFILES_SAMPLE_RATE, SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, SENTRY_REPLAYS_SESSION_SAMPLE_RATE, SENTRY_TRACES_SAMPLE_RATE, type SentryEventLike, type SentryUserContext, clearSentryUser, createSentryBeforeSend, createTracesSampler, isBot, isSensitive, redact, scrubHeaders, setSentryUser, withCronMonitor };
