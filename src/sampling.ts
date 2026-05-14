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

export const SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1.0;
export const SENTRY_PROFILES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1.0;
export const SENTRY_REPLAYS_SESSION_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 0;
export const SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE = 1.0;
export const SENTRY_ENABLED = process.env.NODE_ENV !== "test";
export const SENTRY_ENVIRONMENT = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

/**
 * Loose SamplingContext shape — matches @sentry/types without coupling.
 */
type SamplingContextLike = {
  name?: string;
  transactionContext?: { name?: string };
  request?: { url?: string };
};

/**
 * Routes that are not worth tracing (waste of quota).
 * Health probes (Grafana Synthetic Monitoring), static assets, Next.js internals.
 */
const SKIP_PATTERNS = [
  /\/api\/health$/,
  /\/api\/healthz$/,
  /\/_next\/static\//,
  /\/_next\/image\//,
  /\/_next\/data\//,
  /\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|map|css|js)$/,
];

/**
 * Builds a `tracesSampler` that returns 0 for low-value routes.
 * Pass to `Sentry.init({ tracesSampler: createTracesSampler(0.1) })`.
 */
export function createTracesSampler(defaultRate: number = SENTRY_TRACES_SAMPLE_RATE) {
  return (ctx: SamplingContextLike): number => {
    const url =
      ctx.transactionContext?.name ??
      ctx.name ??
      ctx.request?.url ??
      "";
    if (SKIP_PATTERNS.some((re) => re.test(url))) return 0;
    return defaultRate;
  };
}
