# @groupe-j/sentry-config

Shared Sentry configuration with battle-tested PII redaction. Extracted from `ridesamui`'s `@ridesamui/config/sentry` and enhanced with init helpers, health endpoint exclusion, bot filtering, and user context tagging.

**Used in production by**: RideSamui (Thailand), Prono.pro, MEGA Hote, Mirey (Luxembourg paie), and other groupe-j apps.

## What this gives you

- **PII redaction** by key-name (predictable, visible as `[REDACTED]`) — handles passport, idCard, nationalId, addresses, emails, payment data
- **Header scrubbing** for webhook signatures (Stripe, Knock, Telegram, Sanity, Vercel)
- **Multi-tenant app tagging** via `beforeSend` for cross-app dashboards
- **Smart sampling**: 10% prod / 100% dev / 0% test, with health endpoint and static assets excluded
- **Init helpers** (`initSentryClient`, `initSentryServer`, `initSentryEdge`) — 3 lines per app instead of 40
- **User context helper** (`setSentryUser`) for post-auth tagging with tenant/plan
- **Bot detection** to filter crawler noise
- **tRPC → Sentry capture** (`createTrpcSentryOnError`) — one tested `onError` for `fetchRequestHandler`, skips client faults, captures the underlying `cause`
- **Arming guard** (`assertSentryArmed`) — fail loudly when a missing DSN turns Sentry into a silent no-op
- **Cycle-safe** PII walker (WeakSet guard against componentStack / Apollo error.cause loops)

## Install

This package lives on **GitHub Packages**, not npm. Authenticate first:

```bash
# One-time: create a fine-grained token with read:packages on the groupe-j org
# https://github.com/settings/tokens?type=beta

# Local install
echo "@groupe-j:registry=https://npm.pkg.github.com" >> .npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> .npmrc

pnpm add @groupe-j/sentry-config
```

For **Vercel** deploys: add `NPM_TOKEN` env var with the same token. Vercel auto-reads `.npmrc` containing `${NPM_TOKEN}`.

For **GitHub Actions**: use `${{ secrets.GITHUB_TOKEN }}` — auto-provided, no setup.

## Usage

### `sentry.client.config.ts`

```ts
import { initSentryClient } from '@groupe-j/sentry-config/client';

initSentryClient({
  app: 'mega-hote',
  // Optional: PDPA / cookie consent gate
  enabled: () => hasUserConsent(),
});
```

### `sentry.server.config.ts`

```ts
import { initSentryServer } from '@groupe-j/sentry-config/server';

initSentryServer({
  app: 'mega-hote',
  prisma: true, // default
});
```

### `sentry.edge.config.ts`

```ts
import { initSentryEdge } from '@groupe-j/sentry-config/edge';

initSentryEdge({ app: 'mega-hote' });
```

### Tag user after authentication

```ts
import { setSentryUser } from '@groupe-j/sentry-config';

// e.g. in a BetterAuth onSession hook, or your auth middleware
setSentryUser({
  id: user.id,
  tenant: company.id,
  plan: subscription.plan, // 'free' | 'premium' | 'enterprise'
});
```

### Capture tRPC errors to Sentry

Use as the `onError` of `@trpc/server`'s `fetchRequestHandler`. It skips
client-fault codes (`BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, rate limits, …)
and captures everything else — reporting `error.cause ?? error` so Sentry groups
issues by the real root fault (e.g. the Prisma exception) rather than collapsing
them into one generic `TRPCError`.

```ts
// app/api/trpc/[trpc]/route.ts
import * as Sentry from '@sentry/nextjs';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTrpcSentryOnError } from '@groupe-j/sentry-config';

const onError = createTrpcSentryOnError(Sentry);

function handler(req: Request) {
  return fetchRequestHandler({
    req,
    endpoint: '/api/trpc',
    router: appRouter,
    createContext,
    onError, // tagged with { trpcPath, trpcType }
  });
}

export { handler as GET, handler as POST };
```

The Sentry instance is injected, so the same helper works with `@sentry/nextjs`,
`@sentry/node`, or any SDK exposing `captureException`. The
`shouldReportTrpcError(code)` predicate is exported too if you need the
client-vs-server decision elsewhere.

### Assert Sentry is actually armed

A missing/empty DSN makes the SDK install a no-op client — the app looks healthy
while every `captureException` goes nowhere (the GRO-295 blind spot). Call
`assertSentryArmed` right after init to fail visibly instead:

```ts
import * as Sentry from '@sentry/nextjs';
import { initSentryServer, assertSentryArmed } from '@groupe-j/sentry-config';

initSentryServer({ app: 'portal' });
assertSentryArmed(Sentry, {
  // log loudly everywhere; hard-fail the boot only in prod
  throwOnMissing: process.env.NODE_ENV === 'production',
});
```

Returns `true` when a DSN is present; otherwise logs a loud `console.error` and
returns `false` (or throws when `throwOnMissing` is set).

### Advanced: custom traces sampler

`createTracesSampler` returns a `tracesSampler` function that drops health probes, static assets, and `_next/*` routes automatically. Use it when you need to pass a custom default rate without re-implementing the skip list.

```ts
import { createTracesSampler } from '@groupe-j/sentry-config';

// Pass to Sentry.init() directly — no need to handle health/static skips yourself.
Sentry.init({
  tracesSampler: createTracesSampler(0.05), // 5% custom rate
});
```

If you omit the argument, it defaults to `SENTRY_TRACES_SAMPLE_RATE` (10% prod / 100% dev — test environments send 0 events because `SENTRY_ENABLED` is `false`, not because the sampler returns 0).

### Advanced: custom redaction

```ts
import { redact, scrubHeaders } from '@groupe-j/sentry-config';

const cleaned = redact(myEvent);
```

## Required env vars

| Var | Where | Used by |
|-----|-------|---------|
| `SENTRY_DSN` | Server (Doppler) | server, edge |
| `NEXT_PUBLIC_SENTRY_DSN` | Client (Doppler → Vercel) | client |
| `SENTRY_ENVIRONMENT` | Optional, server | environment tag (overrides `VERCEL_ENV`/`NODE_ENV`) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional, client | environment tag in the browser bundle |
| `VERCEL_ENV` | Auto on Vercel | environment tag (fallback) |
| `VERCEL_GIT_COMMIT_SHA` | Auto on Vercel | release tracking |
| `NODE_ENV` | Auto | sample rates + enabled flag + environment fallback |

## What this does NOT do

- **Source maps upload** — configured in `next.config.ts` via `withSentryConfig({ sourcemaps })`. Not this package's job.
- **Auth wizard / project creation** — use `npx @sentry/wizard@latest -i nextjs` once per project.
- **Custom alert rules** — managed in Sentry UI / API per project.

## Migration from inline configs

See [MIGRATION.md](./MIGRATION.md) for step-by-step instructions per app type.

## Contributing

- [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow for `@sentry/nextjs` upgrades, adding sensitive keys, semver policy, release process
- [DECISIONS.md](./DECISIONS.md) — architecture decision records: rationale behind redaction strategy, cycle guard, init helpers, tsup build, optional peer deps

## Versioning

Semver. Major bumps when sample rate semantics or `beforeSend` shape change. Minor for new helpers. Patch for bug fixes and new sensitive keys. See [CONTRIBUTING.md → Politique semver](./CONTRIBUTING.md#politique-semver) for the full table.

## License

UNLICENSED — internal to groupe-j org.
