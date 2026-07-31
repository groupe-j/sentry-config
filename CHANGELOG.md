# Changelog

All notable changes to `@groupe-j/sentry-config` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-31

### Changed — BREAKING

- **Browser traces sample rate is now 100% in production, not 10%** (GRO-869).
  `initSentryClient` no longer reads `SENTRY_TRACES_SAMPLE_RATE`; it reads the
  new `SENTRY_BROWSER_TRACES_SAMPLE_RATE`. **`initSentryServer` and
  `initSentryEdge` are unchanged at 10%** — this is a browser-only change.

  Per CONTRIBUTING → *Politique semver*, "change de sample rate par défaut =
  major": every consumer must re-validate its Sentry budget before bumping,
  which is precisely why this is a major and not a minor.

  The 10% figure was calibrated on the **server** tier and starved the browser
  tier to nothing. Measured in Sentry over the 30 days to 2026-07-31,
  `environment:production` (stored = billed spans):

  ```
  app                 server txns   browser txns   browser spans   ×10 (at 1.0)
  megahote-t3              34 875              8             435          4 350
  jepeuxconstruire         20 401             69           3 311         33 110
  linegroup                 1 941             24           1 052         10 520
  archicollab-t3              742             77           2 601         26 010
  jelement                      0             60           3 664         36 640
  coraly                       99              9             347          3 470
  businessfamily                3              0               0              0
  ```

  Half the portfolio was collecting fewer than ten browser transactions a month
  — one every three days. No p75 web vital, no navigation timing, no way to tell
  a regression from noise. Sentry's own extrapolation confirms the rate
  empirically: `count() / count_sample()` on those pageload spans is exactly
  `10.0` on every app going through this package.

  **Cost of the change:** ~103 000 additional stored spans/month portfolio-wide,
  against 1 704 224 spans already ingested in the same window and a reserved
  quota of 5 000 000 spans/month — **+6% of ingestion, +2% of quota**. Replays,
  profiles and errors have their own rates and do not move.

  **🔻 Descent threshold, written here and in `sampling.ts` rather than in a
  ticket:** above **~500 pageloads/day**, set `tracesSampleRate: 0.2` on that
  app. Derivation: ~100 sampled pageloads/day is where a daily p75 web vital
  stops jittering, and `0.2 × 500 = 100`. Below that, dialling down saves tens of
  thousands of spans on a five-million quota and costs the only signal the app
  has; above it, a single app at 5 000 pageloads/day would be ~5.4M spans/month
  at 1.0 and blow the plan on its own.

  Migration: nothing to do to accept the new default. To keep the old
  behaviour, pass `tracesSampleRate: 0.1` (below) or set
  `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1`.

### Added

- **`tracesSampleRate` option on `initSentryClient`** — the blocker behind
  GRO-869: the browser rate was not exposed at all, so an app that wanted more
  than 10% had no recourse short of abandoning the helper. Accepts `[0, 1]`.
  `0` is honoured as a deliberate opt-out (browser tracing off, error reporting
  untouched); an out-of-range value is refused with a loud `console.error` and
  the default is used — deliberately **not** clamped, since clamping a typo'd
  `10` to `1` would ship the wrong volume under the appearance of working.
  Available on both `/client` and `/client-lazy`.

- **`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`** — same knob without a code
  deploy. Precedence: option > env var > default. Blank/garbage/out-of-range
  falls back to the default (same `parseRate` guard as the web-vital rate).

- **`SENTRY_BROWSER_TRACES_SAMPLE_RATE`** exported from the barrel **and from
  both client entry points**.

- **New subpath `@groupe-j/sentry-config/armed`** — `assertSentryArmed` without
  the barrel. Importing it from the barrel inside a client module breaks the
  build: the barrel also re-exports `withCronMonitor` and
  `createSentryTrpcMiddleware`, which reference `Sentry.withMonitor` and
  `Sentry.trpcMiddleware` — absent from the browser build of `@sentry/nextjs`
  (observed on businessfamily, 2026-07-31). `src/armed.ts` imports nothing at
  all, so the new entry is safe from every runtime. A source-graph test now
  asserts that no module reachable from `client`, `client-lazy` or `armed`
  touches a server-only SDK member.

## [0.7.0] - 2026-07-25

### Added

- **New entry point `@groupe-j/sentry-config/client-lazy`** — same
  `initSentryClient`, same options, but Session Replay is fetched from the
  Sentry CDN after first paint (or on the first captured error) through the
  SDK's own `lazyLoadIntegration`, instead of being bundled. rrweb is absent
  from the initial chunk **by construction**, on any bundler. Measured with
  esbuild (minified, `@sentry/nextjs` 10.65, browser condition):

  ```
  /client      replay:true    292.2 KB raw /  97.5 KB gz   rrweb IN
  /client      replay:false   292.2 KB raw /  97.5 KB gz   rrweb IN   (the trap)
  /client-lazy replay:"lazy"  167.8 KB raw /  57.8 KB gz   rrweb OUT
  saved                       124.4 KB raw /  39.7 KB gz
  ```

  `replaysSessionSampleRate` / `replaysOnErrorSampleRate` are **unchanged**
  (10% / 100%): the integration reads them off the client options whenever it
  is set up, so error replays stay armed. Honest caveat: Replay records the
  seconds *preceding* an error from a rolling buffer that only exists once the
  integration is attached, so an error thrown in the `[init → first paint]`
  window gets no run-up. Keep `/client` + `replay: true` for boot-time errors.

  On a failed CDN load the page is unaffected: a breadcrumb is added and the
  scope tag `replay.lazy: "failed"` is set so the failure is **queryable**
  (the URL is pinned to the installed SDK version, so a bump that outruns the
  CDN would otherwise break Replay portfolio-wide in silence — the `sharp 0.35`
  failure class). No extra event is captured: one error = one capture. A failed
  attempt also releases the guard so the later trigger can still succeed, capped
  at 2 attempts.

  New options for this path: `replayCdnBaseUrl` (self-host the bundle, **origin
  only** — the SDK resolves `/<version>/replay.min.js` from the root, so any
  path is discarded) and
  `replayScriptNonce` (strict `script-src 'nonce-…'` CSP). **Adopting it
  requires allowing `browser.sentry-cdn.com` in `script-src`** — and in
  `connect-src` too if the app has a service worker.

- **`SENTRY_WEBVITAL_SAMPLE_RATE`** (default `1.0`, env override
  `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE`) and a second argument on
  `createTracesSampler(defaultRate, webVitalRate)`. A declared-but-**empty** env
  var falls back to the default rather than parsing as `0` — `Number("")` is
  `0`, which would have silently re-created the very bug below.

### Fixed

- **INP was never collected on any of the 13 Sentry projects.** Since SDK 8.x
  the browser SDK emits INP as a **standalone span** — one root span per page,
  sampled by our own `tracesSampler`. Two bugs stacked up:
  1. at the 10% production traces rate, a once-per-page metric on low-traffic
     sites yields ~0 samples (LCP/CLS/FCP/TTFB survived because they ride the
     pageload transaction, one per pageview);
  2. the URL skip-list was applied to the INP span `name`, which is a **DOM
     selector** (`htmlTreeAsString`, e.g. `div#root > div.map`), so any
     interaction whose deepest CSS class ends in `.map` / `.css` / `.js` was
     dropped outright — a live hazard on our map-heavy apps.

  Web-vital spans are now matched first — by an **allowlist** of the three
  standalone origins (`auto.http.browser.{inp,cls,lcp}`) plus the
  `ui.interaction.*` op — and sampled at `SENTRY_WEBVITAL_SAMPLE_RATE`. The
  allowlist is deliberate: a `auto.http.browser.` *prefix* test would also catch
  `auto.http.browser.stream` (`FetchStreamPerformance`) and sample all
  SSE/streaming traffic at 100%.
  ⚠️ **Quota**: this adds at most one span per page that had an interaction.
  Dial it down per app with `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE`.
- `browserTracingIntegration({ enableInp: true })` is now passed **explicitly**
  instead of relying on the SDK default (true since 8.x, absent in 7.x), so INP
  collection survives a default flip. `@sentry/nextjs` re-exports its own
  App-Router-aware `browserTracingIntegration`, and a user-provided integration
  replaces the default of the same name — no instrumentation is lost.

### Notes

- **No breaking change.** `@groupe-j/sentry-config/client` keeps its exact
  behaviour, API and byte size. Consumers opt into the saving by changing one
  import line.
- 🪤 `replay: false` remains a trap on `/client` and is now documented as such:
  it saves **zero bytes** (the `Sentry.replayIntegration` reference is static,
  so bundlers ship `@sentry-internal/replay` either way) and it sets
  `replaysOnErrorSampleRate` to `0`.
- A local `import()` of a module that references `Sentry.replayIntegration`
  does **not** move the bytes — measured, rrweb still lands in the initial
  chunk because the SDK barrel is reachable from both graphs. See
  `DECISIONS.md` §14 for the full measurement.
- `bundleSizeOptimizations` of `@sentry/nextjs` is a **no-op under Turbopack**
  (verified byte-identical SDK chunk on j-element with and without it) — do not
  count on it to drop Replay/tracing bytes.

## [0.6.1] - 2026-07-09

### Changed

- **Added `name`, `location`, `description` to `SENSITIVE_KEYS`** (PII redaction).
  These are lead-schema fields used across portfolio apps; before this, attaching
  a lead object to a Sentry event (`extra`, `contexts`, breadcrumbs, `request.data`)
  leaked the person's name, home location, and free-text description in clear.
  (M5, RGPD — audit finding from JELEMENT.)
- Matching stays **exact-key** (normalised, whole-word), so `filename` /
  `hostname` / `username` / `appName` are **not** over-redacted. Note: `name`
  also matches Sentry's own `contexts.{browser,os,device}.name` — an accepted,
  visible (`[REDACTED]`) cost documented in `src/redaction.ts`.
- `firstName` / `lastName` / `phone` / `address` were already covered — no change.

> Patch bump per semver policy: adding a sensitive key is strictly more
> redaction, backward-compatible for consumers. Apps inherit it at their next
> `@groupe-j/sentry-config` bump.

## [0.4.0] - 2026-07-01

### Changed

- **Raised the Sentry peer-dependency floor to `>=10.63.0 <11`** for both
  `@sentry/nextjs` and `@sentry/profiling-node` (previously `^10.0.0`).
  Sentry `<10.63.0` (notably `@sentry/profiling-node@10.53.x`) drags in
  `@sentry/node` → `@opentelemetry/instrumentation-http`, which pins the
  vulnerable `@opentelemetry/core@2.6.1`. Sentry `10.63.0` dropped that
  instrumentation dependency, letting `@opentelemetry/core` resolve to the
  patched `2.8.0`. Bumping the floor here forces consumers off the vulnerable
  transitive tree. (GRO-535, root cause in GRO-533)
- Bumped the `@sentry/nextjs` devDependency to `^10.63.0` to keep the build/test
  matrix consistent with the new peer floor.

> **Note:** this is a peer-range tightening — treated as a **minor** bump because
> consumers still pinned to Sentry `<10.63.0` will see a peer warning until they
> upgrade. No runtime API changed.

## [0.3.0]

- Reusable tRPC `onError` + `assertSentryArmed` guard.

## [0.2.0]

- Resolve `SENTRY_ENVIRONMENT` before `VERCEL_ENV`/`NODE_ENV`.

## [0.1.x]

- Initial extraction of shared Sentry config + PII redaction from ridesamui.
