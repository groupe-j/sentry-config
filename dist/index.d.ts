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
/**
 * Explicit override wins over the Vercel/Node defaults.
 *
 * `SENTRY_ENVIRONMENT` is the server-side var. The browser bundle only sees
 * `NEXT_PUBLIC_*` vars (Next.js inlines those at build time and drops
 * non-public ones), so client consumers set `NEXT_PUBLIC_SENTRY_ENVIRONMENT`.
 * Both fall through to `VERCEL_ENV` (prod/preview) and `NODE_ENV` (local/test)
 * when unset, so dev/preview/prod behaviour is unchanged unless an app opts in
 * — e.g. a CI e2e run booting under `next start` that wants `environment: "ci"`.
 */
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

/**
 * Reusable tRPC → Sentry error capture for the `@trpc/server` fetch adapter.
 *
 * Drop-in `onError` for `fetchRequestHandler`, centralising the capture logic
 * that portfolio apps were each re-implementing (or omitting — see GRO-295,
 * where `apps/portal` had no `onError` at all and a prod outage produced 0
 * Sentry events).
 *
 * Usage (Next.js route handler, `@sentry/nextjs`):
 *
 *   import * as Sentry from '@sentry/nextjs';
 *   import { createTrpcSentryOnError } from '@groupe-j/sentry-config';
 *
 *   const onError = createTrpcSentryOnError(Sentry);
 *
 *   export function POST(req: Request) {
 *     return fetchRequestHandler({ req, router, createContext, onError });
 *   }
 *
 * The Sentry instance is injected rather than imported, so the same helper works
 * whether the app uses `@sentry/nextjs`, `@sentry/node`, or any SDK exposing a
 * compatible `captureException`.
 */
/**
 * Whether a tRPC error code should be reported to Sentry. Client-fault codes are
 * skipped; any other code (server fault, including unknown/future codes) is
 * reported. Fails open so a new server-fault code is never silently dropped.
 */
declare function shouldReportTrpcError(code: string): boolean;
/** The tRPC error type passed by the fetch adapter's `onError`. */
type TrpcErrorType = "query" | "mutation" | "subscription" | "unknown";
/**
 * Minimal structural shape of a `TRPCError`. We avoid importing `@trpc/server`
 * so the package carries no tRPC dependency; the real `TRPCError` (whose `code`
 * is a string union and which carries an optional `cause`) satisfies this.
 */
interface TrpcErrorLike {
    code: string;
    cause?: unknown;
}
/**
 * The argument the fetch adapter passes to `onError`. We only read `error`,
 * `path` and `type`; `input`, `ctx` and `req` are accepted and ignored so the
 * handler's signature matches the adapter's callback exactly.
 */
interface TrpcOnErrorPayload {
    error: TrpcErrorLike;
    path?: string;
    type: TrpcErrorType;
    input?: unknown;
    ctx?: unknown;
    req?: unknown;
}
/**
 * Minimal structural shape of the Sentry SDK needed for capture — satisfied by
 * `@sentry/nextjs`, `@sentry/node`, `@sentry/browser`, etc.
 */
interface TrpcSentryLike {
    captureException: (exception: unknown, hint?: {
        tags?: Record<string, string>;
    }) => unknown;
}
/**
 * Builds an `onError` handler for `@trpc/server`'s `fetchRequestHandler`.
 *
 * Server faults are reported with `captureException(error.cause ?? error, …)`.
 * Capturing the underlying `cause` groups Sentry issues by the real root fault
 * (e.g. the Prisma exception) instead of collapsing every distinct failure into
 * one generic "TRPCError" issue. Client faults are skipped (see
 * {@link shouldReportTrpcError}).
 */
declare function createTrpcSentryOnError(Sentry: TrpcSentryLike): (opts: TrpcOnErrorPayload) => void;

/**
 * Wrapper around the SDK's built-in `Sentry.trpcMiddleware`, so apps stop
 * hand-rolling `onError → captureException` on the fetch adapter and instead
 * capture resolver throws *at the middleware layer* — with the RPC input
 * attached (`attachRpcInput`) and a span per procedure.
 *
 * Why both this and {@link createTrpcSentryOnError} exist:
 *
 * - `createTrpcSentryOnError` plugs into `fetchRequestHandler`'s `onError`. It's
 *   the right tool when you only control the route handler and want a tested,
 *   noise-filtered capture (skips client-fault codes, unwraps `cause`).
 * - `Sentry.trpcMiddleware` plugs into the *procedure builder* (`t.procedure.use`).
 *   It runs inside the tRPC call, so it can attach the procedure input to the
 *   event and open a performance span — context the `onError` path can't reach.
 *   This is Sentry's recommended integration point for tRPC.
 *
 * Use the middleware when you own the tRPC `initTRPC` setup; use the `onError`
 * helper when you only own the Next.js route. Using both is fine and harmless
 * (the middleware captures with input; `onError` is a backstop) — but if you
 * adopt the middleware you can usually drop the manual `onError` capture.
 *
 * The Sentry instance is injected rather than imported, so the package keeps no
 * direct `@sentry/*` dependency and the helper works with `@sentry/nextjs`,
 * `@sentry/node`, or any SDK exposing a compatible `trpcMiddleware`.
 *
 * Usage (tRPC `initTRPC` setup, `@sentry/nextjs`):
 *
 *   import * as Sentry from '@sentry/nextjs';
 *   import { createSentryTrpcMiddleware } from '@groupe-j/sentry-config';
 *
 *   const t = initTRPC.context<Context>().create();
 *   const sentryMiddleware = t.middleware(createSentryTrpcMiddleware(Sentry));
 *
 *   export const publicProcedure = t.procedure.use(sentryMiddleware);
 */
/** Options forwarded to the SDK's `trpcMiddleware`. */
interface SentryTrpcMiddlewareOptions {
    /**
     * Include the procedure input in the reported event. Defaults to `true` here
     * (the SDK default is `false`) — capturing the input is the main reason to
     * use the middleware over the `onError` path. Set `false` if inputs may carry
     * free-form PII the (key-name-based) redaction layer doesn't cover.
     */
    attachRpcInput?: boolean;
    /** Force a transaction (span) even when there's no active parent. */
    forceTransaction?: boolean;
}
/**
 * The argument shape the returned middleware receives — mirrors the SDK's
 * `SentryTrpcMiddlewareArguments` so the generic `next()` return type flows
 * through to tRPC's `middleware()` (which requires the callback to return a
 * `Promise<MiddlewareResult>`; a flattened `unknown` would not type-check).
 */
interface SentryTrpcMiddlewareArguments<T> {
    path?: unknown;
    type?: unknown;
    next: () => T;
    rawInput?: unknown;
    getRawInput?: () => Promise<unknown>;
}
/** The SDK forces the callback to be async: `T` if already a promise, else `Promise<T>`. */
type SentryTrpcMiddlewareResult<T> = T extends Promise<unknown> ? T : Promise<T>;
/** The middleware function `trpcMiddleware()` returns — pass to `t.middleware(...)`. */
type SentryTrpcMiddleware = <T>(opts: SentryTrpcMiddlewareArguments<T>) => SentryTrpcMiddlewareResult<T>;
/**
 * Minimal structural shape of the SDK needed to build the middleware — satisfied
 * by `@sentry/nextjs`, `@sentry/node`, etc. Kept faithful to the real
 * `trpcMiddleware` signature so the wrapper's return type is identical to
 * calling `Sentry.trpcMiddleware()` directly.
 */
interface SentryTrpcMiddlewareLike {
    trpcMiddleware: (options?: SentryTrpcMiddlewareOptions) => SentryTrpcMiddleware;
}
/**
 * Builds a Sentry tRPC middleware ready to pass to `t.middleware(...)`.
 *
 * Defaults `attachRpcInput` to `true` so resolver throws are captured *with*
 * their input (the whole point of the middleware over the `onError` backstop).
 * Everything else is forwarded untouched. The return type is exactly what
 * `Sentry.trpcMiddleware()` returns, so it drops into `t.middleware()` unchanged.
 */
declare function createSentryTrpcMiddleware(Sentry: SentryTrpcMiddlewareLike, options?: SentryTrpcMiddlewareOptions): SentryTrpcMiddleware;

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

export { type AssertSentryArmedOptions, type CronMonitorOptions, DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS, REDACTED, SENTRY_ENABLED, SENTRY_ENVIRONMENT, SENTRY_PROFILES_SAMPLE_RATE, SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, SENTRY_REPLAYS_SESSION_SAMPLE_RATE, SENTRY_TRACES_SAMPLE_RATE, type SentryArmedLike, type SentryClientLike, type SentryEventLike, type SentryTrpcMiddleware, type SentryTrpcMiddlewareArguments, type SentryTrpcMiddlewareLike, type SentryTrpcMiddlewareOptions, type SentryTrpcMiddlewareResult, type SentryUserContext, type TrpcErrorLike, type TrpcErrorType, type TrpcOnErrorPayload, type TrpcSentryLike, assertSentryArmed, clearSentryUser, createSentryBeforeSend, createSentryTrpcMiddleware, createTracesSampler, createTrpcSentryOnError, isBot, isSensitive, redact, scrubHeaders, setSentryUser, shouldReportTrpcError, withCronMonitor };
