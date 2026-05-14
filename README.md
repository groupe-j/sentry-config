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
| `VERCEL_ENV` | Auto on Vercel | environment tag |
| `VERCEL_GIT_COMMIT_SHA` | Auto on Vercel | release tracking |
| `NODE_ENV` | Auto | sample rates + enabled flag |

## What this does NOT do

- **Source maps upload** — configured in `next.config.ts` via `withSentryConfig({ sourcemaps })`. Not this package's job.
- **Auth wizard / project creation** — use `npx @sentry/wizard@latest -i nextjs` once per project.
- **Custom alert rules** — managed in Sentry UI / API per project.

## Migration from inline configs

See `MIGRATION.md` for step-by-step instructions per app type.

## Versioning

Semver. Major bumps when sample rate semantics or `beforeSend` shape change. Minor for new helpers. Patch for bug fixes and new sensitive keys.

## License

UNLICENSED — internal to groupe-j org.
