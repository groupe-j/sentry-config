/**
 * Sampling rates per environment.
 *
 * process.env.NODE_ENV is baked at build time in Next.js, so reading once
 * at module load is safe.
 *
 * Production: 10% (cost control)
 * Dev/preview: 100% (catch everything during development)
 * Test: disabled (no Sentry noise from CI)
 *
 * ⚠️ This is the **server / edge** rate. The browser has its own — see
 * {@link SENTRY_BROWSER_TRACES_SAMPLE_RATE} — because the two tiers differ by
 * two orders of magnitude in volume and 10% is calibrated for the loud one.
 */

export const SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1.0;
export const SENTRY_PROFILES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1.0;
export const SENTRY_REPLAYS_SESSION_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 0;
export const SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE = 1.0;
export const SENTRY_ENABLED = process.env.NODE_ENV !== "test";

/**
 * Browser traces sample rate — **100% in production**, on purpose.
 *
 * ## Why it is not 10%
 *
 * `SENTRY_TRACES_SAMPLE_RATE` (10%) is calibrated for the **server** tier: a
 * flood of `http.server` transactions, crons and queue jobs. Applying the same
 * rate to the browser starves it to zero, because the two tiers differ by two
 * orders of magnitude. Measured on the portfolio (Sentry, 30 days to
 * 2026-07-31, `environment:production`, stored — i.e. billed — spans under
 * `transaction.op:pageload` + `navigation`):
 *
 * ```
 * app                 server txns   browser txns   browser spans   ×10 (rate 1.0)
 * megahote-t3              34 875              8             435           4 350
 * jepeuxconstruire         20 401             69           3 311          33 110
 * linegroup                 1 941             24           1 052          10 520
 * archicollab-t3              742             77           2 601          26 010
 * jelement                      0             60           3 664          36 640
 * coraly                       99              9             347           3 470
 * businessfamily                3              0               0               0
 * ```
 *
 * At 10%, half the portfolio collects fewer than **ten** browser transactions a
 * month — one every three days. That is not a sample, it is a rounding error:
 * no p75 web vital, no navigation timing, no way to tell a regression from
 * noise. It costs nothing and it reports nothing. (Sentry's own extrapolation
 * confirms the rate empirically: `count() / count_sample()` on those pageload
 * spans is exactly `10.0` on every app that goes through this package.)
 *
 * ## What 100% costs
 *
 * Going from 0.1 to 1.0 on the six apps above adds **~103 000 stored spans per
 * month** portfolio-wide (the ×10 column, plus navigation). Against 1 704 224
 * spans already ingested in the same 30 days, and a reserved quota of
 * **5 000 000 spans/month** (Developer plan, 34% used), that is **+6% of
 * current ingestion and +2% of quota**. Nothing else moves: replays, profiles
 * and errors have their own rates, and the server tier is untouched.
 *
 * ## 🔻 When to come back down — the threshold, in code, not in a ticket
 *
 * **Above ~500 pageloads/day, set `tracesSampleRate: 0.2` on that app** (per-app
 * option on `initSentryClient`, or `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` to
 * do it without a code deploy).
 *
 * Where 500 comes from: ~100 sampled pageloads/day is the floor at which a
 * daily p75 web vital stops jittering, and `0.2 × 500 = 100`. Below 500/day,
 * dialling down buys a saving measured in tens of thousands of spans on a
 * five-million quota and costs the only signal the app has — not a trade worth
 * making. Above it, 1.0 starts to matter: a single app at 5 000 pageloads/day
 * would be ~5.4M spans/month at 1.0 and blow the plan on its own.
 * (`pronostic`, which does not use this package, uses the same rule with a
 * 200/day trigger.)
 *
 * Dev/preview stay at 100% as before. Override precedence:
 * `initSentryClient({ tracesSampleRate })` > `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
 * > this default.
 */
export const SENTRY_BROWSER_TRACES_SAMPLE_RATE = parseRate(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  1.0,
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
);

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
  "NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE",
);

function parseRate(raw: string | undefined, fallback: number, name?: string): number {
  // A declared-but-empty env var is the common Vercel accident, and `Number("")`
  // is `0` — which is a perfectly valid rate. Left unguarded, an empty
  // NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE would silently set the rate to 0 and
  // re-create the exact "INP is empty everywhere" bug this module exists to fix.
  // Blank means "unset", and that is a legitimate state — stay silent for it.
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  // A *non-blank* value that does not parse is somebody trying to set a rate and
  // failing. Falling back silently is the fail-open shape this module is full of
  // warnings about: `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` is documented as the
  // no-deploy way to dial an app DOWN, so an operator who types `0,2` (decimal
  // comma) or `20%` while trying to cut volume by 5× lands on the 1.0 default
  // instead — the exact opposite of the intent, with nothing in the logs. Same
  // reasoning as `resolveTracesRate` in client-core.ts: say so, loudly.
  console.error(
    `[sentry-config] ${name ?? "sample rate"}: expected a number in [0, 1], got ${JSON.stringify(raw)}. ` +
      `Using ${fallback} instead — the value you set is NOT in effect.`,
  );
  return fallback;
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
 * Standalone web-vital spans carry `sentry.origin = auto.http.browser.<vital>`.
 *
 * ⚠️ Deliberately an **allowlist**, not a `auto.http.browser.` prefix test.
 * `FetchStreamPerformance` tags its spans `auto.http.browser.stream`, and those
 * become root spans (so they reach this sampler) whenever no idle span is
 * active — i.e. any SSE / streaming request a second after pageload. A prefix
 * test would sample that traffic at the web-vital rate (100%) instead of the
 * traces rate. These three are the only web-vital origins the SDK emits
 * (`browser-utils/metrics/{inp,cls,lcp}.js`).
 */
const WEB_VITAL_ORIGINS = new Set([
  "auto.http.browser.inp",
  "auto.http.browser.cls",
  "auto.http.browser.lcp",
]);

function isWebVitalSpan(ctx: SamplingContextLike): boolean {
  const origin = ctx.attributes?.["sentry.origin"];
  if (typeof origin === "string" && WEB_VITAL_ORIGINS.has(origin)) return true;
  // Fallback for INP specifically: its op is `ui.interaction.<type>`. The only
  // other `ui.interaction.*` producer creates *child* spans of the pageload
  // transaction, which never reach a sampler.
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
