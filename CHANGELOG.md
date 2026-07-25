# Changelog

All notable changes to `@groupe-j/sentry-config` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.7.0] - 2026-07-25

### Added

- **`replay: "lazy"` on `initSentryClient`** — Replay is attached after first
  paint (idle-after-`load`), or immediately if an error is captured before
  that, from a separate async chunk. `replaysSessionSampleRate` /
  `replaysOnErrorSampleRate` are **unchanged** (10% / 100%): the integration
  reads them from the client options whenever it is set up, so error replays
  stay armed.
  Honest caveat, documented in the code: an error thrown **before** the attach
  (the `[init → first paint]` window) carries no replay — Replay buffers the
  seconds *preceding* an error. Keep `replay: true` for boot-time errors.
- **`NEXT_PUBLIC_SENTRY_REPLAY_MODE=lazy`** — the build-time switch that
  actually removes the bytes. It flips the default mode to `"lazy"` and, since
  Next inlines `NEXT_PUBLIC_*` literals into browser modules (node_modules
  included), makes the eager `Sentry.replayIntegration` branch statically dead
  so the bundler tree-shakes `@sentry-internal/replay` out of the initial
  chunk. Without it, `"lazy"` still defers the *work* but the bytes stay — a
  bundler cannot know which mode you pass at runtime. Numbers in the PR.
- **`SENTRY_WEBVITAL_SAMPLE_RATE`** (default `1.0`, env override
  `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE`) and a second argument on
  `createTracesSampler(defaultRate, webVitalRate)`.

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
  Web-vital spans are now matched first (by `sentry.origin`
  `auto.http.browser.*` / `sentry.op` `ui.interaction.*`) and sampled at
  `SENTRY_WEBVITAL_SAMPLE_RATE`.
  ⚠️ **Quota**: this adds at most one span per page that had an interaction.
  Dial it down per app with `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE`.
- `browserTracingIntegration({ enableInp: true })` is now passed **explicitly**
  instead of relying on the SDK default (true since 8.x, absent in 7.x), so INP
  collection survives a default flip. `@sentry/nextjs` re-exports its own
  App-Router-aware `browserTracingIntegration`, and a user-provided integration
  replaces the default of the same name — no instrumentation is lost.

### Notes

- 🪤 `replay: false` remains a trap and is now documented as such: it saves
  **zero bytes** (the `Sentry.replayIntegration` reference in the eager branch
  is static, so bundlers ship `@sentry-internal/replay` either way) and it sets
  `replaysOnErrorSampleRate` to `0`. Use `"lazy"` for bundle size.
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
