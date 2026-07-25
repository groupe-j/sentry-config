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
export const SENTRY_ENVIRONMENT =
  process.env.SENTRY_ENVIRONMENT ??
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
  process.env.VERCEL_ENV ??
  process.env.NODE_ENV ??
  "development";

/**
 * Web-vital sample rate — INP & friends.
 *
 * Why it is NOT `SENTRY_TRACES_SAMPLE_RATE`: since SDK 8.x the browser SDK
 * emits INP (and optionally CLS/LCP) as **standalone spans**, i.e. one root
 * span per measurement, sampled through the very same `tracesSampler` as a
 * pageload. At 10% in production, a portfolio of low-traffic sites collects
 * ~0 INP samples — which is exactly what we observed: LCP/CLS/FCP/TTFB (which
 * ride along the pageload transaction, one per pageview) were populated on the
 * 13 Sentry projects while INP was empty everywhere.
 *
 * INP is emitted at most once per page lifetime, so 100% is cheap. Dial it
 * down with `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE` on a high-traffic app.
 */
export const SENTRY_WEBVITAL_SAMPLE_RATE = parseRate(
  process.env.NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE ??
    process.env.SENTRY_WEBVITAL_SAMPLE_RATE,
  1.0,
);

function parseRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

/**
 * Loose SamplingContext shape — matches @sentry/types without coupling.
 */
interface SamplingContextLike {
  name?: string;
  transactionContext?: { name?: string };
  request?: { url?: string };
  /** Span attributes known at sampling time (SDK 8+). */
  attributes?: Record<string, unknown>;
}

/**
 * Standalone web-vital spans carry `sentry.origin = auto.http.browser.<vital>`
 * (`inp`, and `cls`/`lcp` when standalone web-vital spans are enabled).
 */
const WEB_VITAL_ORIGIN_PREFIX = "auto.http.browser.";

function isWebVitalSpan(ctx: SamplingContextLike): boolean {
  const origin = ctx.attributes?.["sentry.origin"];
  if (typeof origin === "string" && origin.startsWith(WEB_VITAL_ORIGIN_PREFIX)) return true;
  const op = ctx.attributes?.["sentry.op"];
  return typeof op === "string" && op.startsWith("ui.interaction.");
}

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
 *
 * Web-vital standalone spans (INP…) are handled FIRST and on their own rate.
 * Two reasons:
 *  1. quota: see {@link SENTRY_WEBVITAL_SAMPLE_RATE} — 10% of a once-per-page
 *     metric is statistically nothing on our traffic;
 *  2. correctness: the `name` of an INP span is a DOM selector, not a URL
 *     (`htmlTreeAsString(target)`, e.g. `div#root > div.map`). Running URL
 *     patterns on it silently drops interactions whose deepest CSS class ends
 *     with `.map`, `.css`, `.js`… — a real hazard on our map-heavy apps.
 */
export function createTracesSampler(
  defaultRate: number = SENTRY_TRACES_SAMPLE_RATE,
  webVitalRate: number = SENTRY_WEBVITAL_SAMPLE_RATE,
) {
  return (ctx: SamplingContextLike): number => {
    if (isWebVitalSpan(ctx)) return webVitalRate;

    const url =
      ctx.transactionContext?.name ??
      ctx.name ??
      ctx.request?.url ??
      "";
    if (SKIP_PATTERNS.some((re) => re.test(url))) return 0;
    return defaultRate;
  };
}
