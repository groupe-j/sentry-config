# Changelog

All notable changes to `@groupe-j/sentry-config` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
