/**
 * Edge runtime Sentry init helper. For middleware and edge API routes.
 *
 * Usage in `sentry.edge.config.ts`:
 *
 *   import { initSentryEdge } from '@groupe-j/sentry-config/edge';
 *   initSentryEdge({ app: 'mega-hote' });
 *
 * Edge runtime has no Node APIs — no Prisma instrumentation, no profiling.
 */
type InitSentryEdgeOptions = {
    /** App name — tagged on every event. */
    app: string;
    /** Override the DSN (default: process.env.SENTRY_DSN). */
    dsn?: string;
    /** Extra error patterns to ignore. */
    ignoreErrors?: Array<string | RegExp>;
};
declare function initSentryEdge(opts: InitSentryEdgeOptions): void;

export { type InitSentryEdgeOptions, initSentryEdge };
