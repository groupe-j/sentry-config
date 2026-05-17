/**
 * Server-side (Node runtime) Sentry init helper.
 * For Vercel Fluid Compute and traditional Node.js.
 *
 * Usage in `sentry.server.config.ts`:
 *
 *   import { initSentryServer } from '@groupe-j/sentry-config/server';
 *   initSentryServer({ app: 'mega-hote' });
 *
 * With Prisma instrumentation enabled by default. Pass `prisma: false` to disable.
 */
type InitSentryServerOptions = {
    /** App name — tagged on every event for multi-tenant dashboards. */
    app: string;
    /** Override the server DSN (default: process.env.SENTRY_DSN). */
    dsn?: string;
    /** Enable Prisma query instrumentation (default true). */
    prisma?: boolean;
    /**
     * Enable Node.js profiling. Default: true (requires @sentry/profiling-node
     * as a peer dep). Set false if your platform doesn't support it (Vercel
     * Edge runtime, some serverless providers).
     *
     * Profiling captures stack traces at intervals to show CPU usage hotspots.
     * Sample rate controlled by `profilesSampleRate`. Vercel Fluid Compute (Node
     * runtime) supports it.
     */
    profiling?: boolean;
    /** Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS). */
    ignoreErrors?: Array<string | RegExp>;
    /** Custom integrations to add (in addition to defaults). */
    extraIntegrations?: unknown[];
    /**
     * Send default PII (cookies, headers, IP). Default: false (RGPD-safer).
     * Set true only when you have explicit user consent and need the data
     * for debugging (e.g. internal admin tools).
     */
    sendDefaultPii?: boolean;
};
declare function initSentryServer(opts: InitSentryServerOptions): void;

export { type InitSentryServerOptions, initSentryServer };
