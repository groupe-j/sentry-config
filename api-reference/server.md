# server

## Interfaces

### InitSentryServerOptions

Defined in: [server.ts:24](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L24)

#### Properties

##### app

> **app**: `string`

Defined in: [server.ts:26](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L26)

App name — tagged on every event for multi-tenant dashboards.

##### dsn?

> `optional` **dsn?**: `string`

Defined in: [server.ts:28](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L28)

Override the server DSN (default: process.env.SENTRY_DSN).

##### extraIntegrations?

> `optional` **extraIntegrations?**: `unknown`[]

Defined in: [server.ts:44](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L44)

Custom integrations to add (in addition to defaults).

##### ignoreErrors?

> `optional` **ignoreErrors?**: (`string` \| `RegExp`)[]

Defined in: [server.ts:42](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L42)

Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS).

##### prisma?

> `optional` **prisma?**: `boolean`

Defined in: [server.ts:30](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L30)

Enable Prisma query instrumentation (default true).

##### profiling?

> `optional` **profiling?**: `boolean`

Defined in: [server.ts:40](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L40)

Enable Node.js profiling. Default: true (requires @sentry/profiling-node
as a peer dep). Set false if your platform doesn't support it (Vercel
Edge runtime, some serverless providers).

Profiling captures stack traces at intervals to show CPU usage hotspots.
Sample rate controlled by `profilesSampleRate`. Vercel Fluid Compute (Node
runtime) supports it.

##### sendDefaultPii?

> `optional` **sendDefaultPii?**: `boolean`

Defined in: [server.ts:50](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L50)

Send default PII (cookies, headers, IP). Default: false (RGPD-safer).
Set true only when you have explicit user consent and need the data
for debugging (e.g. internal admin tools).

##### transport?

> `optional` **transport?**: `unknown`

Defined in: [server.ts:66](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L66)

Override the Sentry transport factory. Passed straight through to
`Sentry.init({ transport })`; when omitted the SDK's own transport is used
(no behaviour change — this is a rarely-needed escape hatch).

The motivating case is getsentry/sentry-javascript#18871: under Next 16 +
Turbopack, `makeNodeTransport` on SDK v10.32–10.34 calls `suppressTracing()`,
which breaks the OpenTelemetry async context and silently drops server-side
events. This package's peer range (`>=10.63.0`) already excludes that window,
so you shouldn't hit it — but if a future SDK regression needs a different
transport, supply one here without forking init.

Typed `unknown` on purpose so this package needn't depend on the SDK's
internal transport types; `Sentry.init` validates it at runtime.

## Functions

### initSentryServer()

> **initSentryServer**(`opts`): `void`

Defined in: [server.ts:69](https://github.com/groupe-j/sentry-config/blob/main/src/server.ts#L69)

#### Parameters

##### opts

[`InitSentryServerOptions`](#initsentryserveroptions)

#### Returns

`void`
