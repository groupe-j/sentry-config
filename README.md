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
- **tRPC → Sentry capture** — two integration points: `createTrpcSentryOnError` (tested `onError` for `fetchRequestHandler`) and `createSentryTrpcMiddleware` (wraps the SDK's `trpcMiddleware`, captures resolver throws *with input* at the procedure layer)
- **Arming guard** (`assertSentryArmed`) — fail loudly when a missing DSN turns Sentry into a silent no-op
- **Next 16 + Turbopack safety** — peer range excludes the SDK window (#18871) that silently drops server events, plus an opt-in `transport` override on `initSentryServer` for any future transport swap
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

## ⚠️ Required for Next.js 16 (Turbopack): `serverExternalPackages`

**Every consumer of `@groupe-j/sentry-config/server` must add this to their
`next.config.ts`** — otherwise the production build fails.

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep the native Sentry server SDKs OUT of the Turbopack bundle.
  serverExternalPackages: ['@sentry/node', '@sentry/profiling-node'],
};

export default nextConfig;
```

**Why.** `@groupe-j/sentry-config/server` (via `initSentryServer`) transitively
pulls in `@sentry/node` and `@sentry/profiling-node`. When Next 16 Turbopack
tries to bundle those, it walks their OpenTelemetry instrumentation graph and
the build dies with:

```
Module not found: Can't resolve '@opentelemetry/instrumentation'
```

This is **not** a missing dependency — you do not need to `pnpm add
@opentelemetry/instrumentation`. It is Turbopack bundling a package that must
stay external. Listing both SDKs in `serverExternalPackages` tells Next to load
them from `node_modules` at runtime instead of bundling them, which resolves the
error.

> This is the systemic root of **GRO-523** — the build break reproduces in
> every app that wires up the server SDK without this config. If you `withSentryConfig`
> your `next.config`, keep the `serverExternalPackages` key on the base config
> object (it is preserved through the wrapper).

## Usage

### `sentry.client.config.ts`

```ts
import { initSentryClient } from '@groupe-j/sentry-config/client';

initSentryClient({
  app: 'mega-hote',
  // Optional: PDPA / cookie consent gate — evaluated ONCE, at init.
  enabled: () => hasUserConsent(),
});
```

> ⚠️ **Put this in `instrumentation-client.ts`, not `sentry.client.config.ts`.**
> `sentry.client.config.ts` is injected only by the **webpack** path of
> `@sentry/nextjs`. A Next 16 app builds with **Turbopack**, which never injects
> it — so `initSentryClient` is never called, the browser SDK never boots, and
> the project reports **zero pageloads and zero browser errors**, silently.
> Nothing in this package can detect that from the inside: code that is never
> imported cannot warn you. The symptom to watch for is a Sentry project with
> server events but no `pageload` transactions.
>
> If you *are* initialised and want to be sure the SDK is armed (real DSN, not a
> no-op client), call `assertSentryArmed(Sentry)` right after init — see below.

### Replay: eager or lazy — and how to actually drop the bytes

Session Replay (rrweb) is **~124 KB raw / ~40 KB gzip** of your initial chunk,
on every page. There are two entry points; they take the same options and
export the same `initSentryClient`, so switching is a one-line import change.

| Import | Replay bytes in the initial chunk | Session replay | Replay on error |
|--------|-----------------------------------|----------------|-----------------|
| `…/client` (default, `replay: true`) | **bundled** | 10% prod | 100%, from init |
| `…/client` with `replay: false` | ⚠️ **still bundled** | 0 | **0** |
| `…/client-lazy` (default `replay: "lazy"`) | **absent** | 10% prod | 100%, from first idle after `load` |

Measured with esbuild (minified, `@sentry/nextjs` 10.65, browser condition) on
a minimal consumer:

```
/client      replay:true    292.2 KB raw /  97.5 KB gz   rrweb IN
/client      replay:false   292.2 KB raw /  97.5 KB gz   rrweb IN   ← the trap
/client-lazy replay:"lazy"  167.8 KB raw /  57.8 KB gz   rrweb OUT
------------------------------------------------------------------
saved                       124.4 KB raw /  39.7 KB gz
```

```ts
// Drop the bytes: change the import, nothing else.
import { initSentryClient } from '@groupe-j/sentry-config/client-lazy';

initSentryClient({ app: 'mega-hote' });
```

🪤 **`replay: false` is a trap.** It saves **zero bytes** — the
`Sentry.replayIntegration` reference on the `/client` entry is static, so
bundlers (webpack *and* Turbopack) ship `@sentry-internal/replay` either way —
and it silently sets `replaysOnErrorSampleRate` to `0`. You lose every error
replay and keep every byte. If you want the bytes gone, use `/client-lazy`; if
you want Replay gone for privacy reasons, `false` is correct and the wasted
weight is the price.

#### What `/client-lazy` costs you

It uses the SDK's own `lazyLoadIntegration`, which injects
`<script src="https://browser.sentry-cdn.com/<version>/replay.min.js">` at the
first idle after the `load` event (or on the first captured error). That means:

1. **CSP** — `script-src` must allow that origin. Pass `replayScriptNonce` if
   you run `script-src 'nonce-…'`. If the app has a service worker
   (Serwist/Workbox), the SW may re-fetch that script through the Fetch API, in
   which case the origin is **also** needed in `connect-src`.
2. **Content blockers** — `browser.sentry-cdn.com` is on common blocklists, and
   `tunnel` does **not** help (it tunnels *events*, not the script). On failure
   the page is unaffected and a breadcrumb explains why the next event has no
   replay. Self-host with `replayCdnBaseUrl` if that matters to you — note it
   takes an **origin only**: the SDK resolves `/<version>/replay.min.js` from
   the root, so any path you pass is discarded.
3. **No SRI** — the SDK cannot know the hash ahead of time, so the tag carries
   `crossorigin="anonymous"` but no `integrity`. Eager Replay ships the same
   code pinned by your lockfile instead.
4. **The URL is pinned to the installed SDK version** (`<cdnBaseUrl>/<SDK_VERSION>/replay.min.js`).
   A dependency bump that outruns the CDN breaks Replay everywhere at once, and
   a lazy feature that fails is invisible by nature — the `sharp 0.35` failure
   class. On failure the scope tag `replay.lazy: "failed"` is set so you can
   **query** for it in Sentry; no extra event is captured (house rule: one error
   = one capture).
5. **Boot-time errors have no run-up** — Replay records the seconds *preceding*
   an error from a rolling buffer that only exists once the integration is
   attached. `replaysOnErrorSampleRate` stays at `1.0` and is honest for every
   error after attach (the overwhelming majority); errors thrown in the
   `[init → first paint]` window get no run-up. Stay on `/client` with
   `replay: true` if boot-time errors are what you are hunting.

> A local `import()` of a module that references `Sentry.replayIntegration`
> does **not** work — measured: rrweb still lands in the initial chunk, because
> the SDK barrel is reachable from both graphs and chunk assignment hoists it.
> See `DECISIONS.md` §14.

> `bundleSizeOptimizations` from `@sentry/nextjs` does **not** help either: it
> is a **no-op under Turbopack** (verified byte-identical SDK chunk on
> j-element).

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

### Capture tRPC errors at the resolver layer (recommended)

The `onError` helper above hooks the Next.js route. If you own the `initTRPC`
setup, prefer `createSentryTrpcMiddleware` — it wraps the SDK's built-in
`Sentry.trpcMiddleware`, so it runs *inside* the tRPC call and can attach the
procedure **input** to the event (plus open a span per procedure). This is
Sentry's recommended integration point and removes the need for a hand-rolled
`onError → captureException`.

```ts
// server/api/trpc.ts
import * as Sentry from '@sentry/nextjs';
import { initTRPC } from '@trpc/server';
import { createSentryTrpcMiddleware } from '@groupe-j/sentry-config';

const t = initTRPC.context<Context>().create();

// attachRpcInput defaults to `true` here (the raw SDK default is `false`).
const sentryMiddleware = t.middleware(createSentryTrpcMiddleware(Sentry));

export const publicProcedure = t.procedure.use(sentryMiddleware);
export const protectedProcedure = t.procedure.use(sentryMiddleware).use(auth);
```

Pass `{ attachRpcInput: false }` if procedure inputs may carry PII the redaction
layer doesn't cover. The Sentry instance is injected, so any SDK exposing
`trpcMiddleware` works.

**Middleware vs `onError`:** use the middleware when you own the `initTRPC`
setup (richer context: input + span); use `createTrpcSentryOnError` when you
only own the Next.js route handler. Running both is harmless — the middleware
captures with input and the `onError` acts as a backstop — but once you adopt
the middleware you can usually drop the manual `onError` capture.

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

### Next 16 + Turbopack blind spot (SDK #18871)

Under **Next 16 + Turbopack**, `@sentry/nextjs` **v10.32–10.34** shipped a
`makeNodeTransport` that calls `suppressTracing()` internally. That call breaks
the OpenTelemetry async context and **silently drops server-side events** —
`captureException` returns cleanly, the app looks healthy, and nothing reaches
Sentry (the same class of blind spot as a missing DSN). See
[getsentry/sentry-javascript#18871](https://github.com/getsentry/sentry-javascript/issues/18871).

**You are already protected.** This package pins
`@sentry/nextjs` to **`>=10.63.0 <11`**, so the affected 10.32–10.34 window is
excluded by the peer constraint — you can't install into it through this
package. The apps in this org run 10.63+.

Two operational notes:

- `assertSentryArmed` does **not** catch a transport that eats events (the
  client is armed, the DSN is present). After any Next/Turbopack/SDK upgrade,
  confirm a real test event actually lands in Sentry.
- If a *future* SDK regression ever needs a different transport, `initSentryServer`
  accepts an opt-in `transport` option that passes straight through to
  `Sentry.init({ transport })`. Omit it (the default) and the SDK's own
  transport is used — no behaviour change. It exists so you never have to fork
  the init helper to swap a transport.

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

The second argument is the **web-vital rate** (default `1.0`, override with
`NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE`). Since SDK 8.x, **INP is emitted as
a standalone span**, one per page lifetime, sampled by this very
`tracesSampler`. At the 10% traces rate a low-traffic site collects
approximately zero INP samples — which is why INP was empty on all 13 Sentry
projects while LCP/CLS/FCP/TTFB (carried by the pageload transaction) were
fine. INP is a Google ranking signal, so we collect it at 100% by default; the
volume is one span per page, not per interaction.

```ts
createTracesSampler(0.05, 1.0); // 5% of routes, 100% of web vitals
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
| `SENTRY_ENVIRONMENT` | Optional, server | environment tag (overrides `VERCEL_ENV`/`NODE_ENV`) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional, client | environment tag in the browser bundle |
| `VERCEL_ENV` | Auto on Vercel | environment tag (fallback) |
| `VERCEL_GIT_COMMIT_SHA` | Auto on Vercel | release tracking |
| `NODE_ENV` | Auto | sample rates + enabled flag + environment fallback |
| `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE` | Optional, client | web-vital (INP) sample rate — default `1.0` |
| `NEXT_PUBLIC_SENTRY_REPLAY_MODE` | Optional, **build-time** | `lazy` → Replay in an async chunk (see Replay section) |

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
