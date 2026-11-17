# index

## Interfaces

### CronMonitorOptions

Defined in: [crons.ts:29](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L29)

#### Properties

##### checkinMarginMinutes?

> `optional` **checkinMarginMinutes?**: `number`

Defined in: [crons.ts:45](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L45)

How many minutes after the schedule before considering the run "late".
Default: 5 minutes.

##### failureIssueThreshold?

> `optional` **failureIssueThreshold?**: `number`

Defined in: [crons.ts:54](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L54)

Number of consecutive failures before opening a Sentry issue.
Default: 1 (alert on first failure).

##### maxRuntimeMinutes?

> `optional` **maxRuntimeMinutes?**: `number`

Defined in: [crons.ts:40](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L40)

Max time the cron should take, in minutes. Sentry alerts if exceeded.
Default: 30 minutes.

##### recoveryThreshold?

> `optional` **recoveryThreshold?**: `number`

Defined in: [crons.ts:59](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L59)

Number of consecutive successes before closing the issue.
Default: 1.

##### schedule

> **schedule**: `string`

Defined in: [crons.ts:35](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L35)

Crontab schedule string (e.g., '0 6 * * *' for 6am daily).
MUST match the Vercel cron schedule exactly — Sentry uses this to
detect missed runs.

##### timezone?

> `optional` **timezone?**: `string`

Defined in: [crons.ts:49](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L49)

Timezone for the schedule. Default: UTC (Vercel cron default).

***

### SentryBreadcrumbLike

Defined in: [before-send.ts:40](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L40)

Loose Sentry breadcrumb shape (`beforeBreadcrumb`, `event.breadcrumbs`).

#### Properties

##### category?

> `optional` **category?**: `string`

Defined in: [before-send.ts:42](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L42)

##### data?

> `optional` **data?**: `unknown`

Defined in: [before-send.ts:45](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L45)

##### level?

> `optional` **level?**: `string`

Defined in: [before-send.ts:43](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L43)

##### message?

> `optional` **message?**: `string`

Defined in: [before-send.ts:44](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L44)

##### timestamp?

> `optional` **timestamp?**: `number`

Defined in: [before-send.ts:46](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L46)

##### type?

> `optional` **type?**: `string`

Defined in: [before-send.ts:41](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L41)

***

### SentryEventLike

Defined in: [before-send.ts:51](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L51)

@groupe-j/sentry-config — barrel export.

Most consumers should import from sub-paths:
  - '@groupe-j/sentry-config/client' → browser config
  - '@groupe-j/sentry-config/server' → Node config
  - '@groupe-j/sentry-config/edge'   → Edge config

This barrel exposes the building blocks (redact, createSentryBeforeSend,
setSentryUser, isBot) for advanced use cases.

#### Properties

##### breadcrumbs?

> `optional` **breadcrumbs?**: [`SentryBreadcrumbLike`](#sentrybreadcrumblike)[]

Defined in: [before-send.ts:65](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L65)

##### contexts?

> `optional` **contexts?**: `Record`\<`string`, `unknown`\>

Defined in: [before-send.ts:67](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L67)

##### exception?

> `optional` **exception?**: `object`

Defined in: [before-send.ts:68](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L68)

###### values?

> `optional` **values?**: `object`[]

##### extra?

> `optional` **extra?**: `Record`\<`string`, `unknown`\>

Defined in: [before-send.ts:66](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L66)

##### fingerprint?

> `optional` **fingerprint?**: `string`[]

Defined in: [before-send.ts:53](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L53)

##### logentry?

> `optional` **logentry?**: `object`

Defined in: [before-send.ts:54](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L54)

###### message?

> `optional` **message?**: `string`

###### params?

> `optional` **params?**: `unknown`[]

##### message?

> `optional` **message?**: `string`

Defined in: [before-send.ts:52](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L52)

##### request?

> `optional` **request?**: `object`

Defined in: [before-send.ts:57](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L57)

###### cookies?

> `optional` **cookies?**: `unknown`

###### data?

> `optional` **data?**: `unknown`

###### env?

> `optional` **env?**: `Record`\<`string`, `unknown`\>

###### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

###### query\_string?

> `optional` **query\_string?**: `unknown`

###### url?

> `optional` **url?**: `string`

##### spans?

> `optional` **spans?**: `object`[]

Defined in: [before-send.ts:76](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L76)

###### data?

> `optional` **data?**: `unknown`

###### description?

> `optional` **description?**: `string`

##### tags?

> `optional` **tags?**: `Record`\<`string`, `unknown`\>

Defined in: [before-send.ts:56](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L56)

##### transaction?

> `optional` **transaction?**: `string`

Defined in: [before-send.ts:55](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L55)

***

### SentryLogLike

Defined in: [before-send.ts:416](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L416)

@groupe-j/sentry-config — barrel export.

Most consumers should import from sub-paths:
  - '@groupe-j/sentry-config/client' → browser config
  - '@groupe-j/sentry-config/server' → Node config
  - '@groupe-j/sentry-config/edge'   → Edge config

This barrel exposes the building blocks (redact, createSentryBeforeSend,
setSentryUser, isBot) for advanced use cases.

#### Properties

##### attributes?

> `optional` **attributes?**: `Record`\<`string`, `unknown`\>

Defined in: [before-send.ts:418](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L418)

##### message?

> `optional` **message?**: `unknown`

Defined in: [before-send.ts:417](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L417)

***

### SentryTrpcMiddlewareArguments

Defined in: [trpc-middleware.ts:56](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L56)

The argument shape the returned middleware receives — mirrors the SDK's
`SentryTrpcMiddlewareArguments` so the generic `next()` return type flows
through to tRPC's `middleware()` (which requires the callback to return a
`Promise<MiddlewareResult>`; a flattened `unknown` would not type-check).

#### Type Parameters

##### T

`T`

#### Properties

##### getRawInput?

> `optional` **getRawInput?**: () => `Promise`\<`unknown`\>

Defined in: [trpc-middleware.ts:61](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L61)

###### Returns

`Promise`\<`unknown`\>

##### next

> **next**: () => `T`

Defined in: [trpc-middleware.ts:59](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L59)

###### Returns

`T`

##### path?

> `optional` **path?**: `unknown`

Defined in: [trpc-middleware.ts:57](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L57)

##### rawInput?

> `optional` **rawInput?**: `unknown`

Defined in: [trpc-middleware.ts:60](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L60)

##### type?

> `optional` **type?**: `unknown`

Defined in: [trpc-middleware.ts:58](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L58)

***

### SentryTrpcMiddlewareLike

Defined in: [trpc-middleware.ts:78](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L78)

Minimal structural shape of the SDK needed to build the middleware — satisfied
by `@sentry/nextjs`, `@sentry/node`, etc. Kept faithful to the real
`trpcMiddleware` signature so the wrapper's return type is identical to
calling `Sentry.trpcMiddleware()` directly.

#### Properties

##### trpcMiddleware

> **trpcMiddleware**: (`options?`) => [`SentryTrpcMiddleware`](#sentrytrpcmiddleware)

Defined in: [trpc-middleware.ts:79](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L79)

###### Parameters

###### options?

[`SentryTrpcMiddlewareOptions`](#sentrytrpcmiddlewareoptions)

###### Returns

[`SentryTrpcMiddleware`](#sentrytrpcmiddleware)

***

### SentryTrpcMiddlewareOptions

Defined in: [trpc-middleware.ts:38](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L38)

Options forwarded to the SDK's `trpcMiddleware`.

#### Properties

##### attachRpcInput?

> `optional` **attachRpcInput?**: `boolean`

Defined in: [trpc-middleware.ts:45](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L45)

Include the procedure input in the reported event. Defaults to `true` here
(the SDK default is `false`) — capturing the input is the main reason to
use the middleware over the `onError` path. Set `false` if inputs may carry
free-form PII the (key-name-based) redaction layer doesn't cover.

##### forceTransaction?

> `optional` **forceTransaction?**: `boolean`

Defined in: [trpc-middleware.ts:47](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L47)

Force a transaction (span) even when there's no active parent.

***

### SentryUserContext

Defined in: [user.ts:13](https://github.com/groupe-j/sentry-config/blob/main/src/user.ts#L13)

#### Properties

##### email?

> `optional` **email?**: `string`

Defined in: [user.ts:17](https://github.com/groupe-j/sentry-config/blob/main/src/user.ts#L17)

Optional — only set if email is OK to send (consider PDPA/RGPD).

##### id

> **id**: `string`

Defined in: [user.ts:15](https://github.com/groupe-j/sentry-config/blob/main/src/user.ts#L15)

Stable user identifier (DB id, NOT email).

##### plan?

> `optional` **plan?**: `string`

Defined in: [user.ts:21](https://github.com/groupe-j/sentry-config/blob/main/src/user.ts#L21)

Plan tier (free/premium/enterprise) — useful for "is this a paying client?".

##### tenant?

> `optional` **tenant?**: `string`

Defined in: [user.ts:19](https://github.com/groupe-j/sentry-config/blob/main/src/user.ts#L19)

Tenant/org/agency id for multi-tenant apps (ridesamui, prono.pro, mirey).

***

### SignalServerlessOptions

Defined in: [serverless.ts:75](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L75)

#### Properties

##### extra?

> `optional` **extra?**: `Record`\<`string`, `unknown`\>

Defined in: [serverless.ts:82](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L82)

Structured context attached to the event. Redacted by `beforeSend` at send
time like any other `extra`, so PII keys are scrubbed there too.

##### flushTimeoutMs?

> `optional` **flushTimeoutMs?**: `number`

Defined in: [serverless.ts:97](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L97)

Max ms to wait for the transport queue to drain. Default: 2000.

##### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [serverless.ts:95](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L95)

Raw request headers to attach for debugging. Scrubbed with `scrubHeaders`
before attachment, which since 1.4.0 has **three** outcomes, not two: a
header in the exact list (`authorization`, `cookie`, named webhook
signatures) is **dropped entirely**; a header whose folded name ends in a
credential suffix (`token`, `secret`, `password`, `signature`,
`credential`) keeps its **key** and gets `[REDACTED]` as its **value**;
anything else survives untouched. What remains — marked or untouched —
lands under `extra.headers`, where `beforeSend` scrubs it again like any
other `extra`. Reuses the package's canonical scrubber rather than
re-implementing it per route.

##### level?

> `optional` **level?**: [`SentrySeverityLevel`](#sentryseveritylevel)

Defined in: [serverless.ts:77](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L77)

Severity for the captured message. Default: `"warning"`.

***

### TrpcErrorLike

Defined in: [trpc.ts:64](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L64)

Minimal structural shape of a `TRPCError`. We avoid importing `@trpc/server`
so the package carries no tRPC dependency; the real `TRPCError` (whose `code`
is a string union and which carries an optional `cause`) satisfies this.

#### Properties

##### cause?

> `optional` **cause?**: `unknown`

Defined in: [trpc.ts:66](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L66)

##### code

> **code**: `string`

Defined in: [trpc.ts:65](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L65)

***

### TrpcOnErrorPayload

Defined in: [trpc.ts:74](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L74)

The argument the fetch adapter passes to `onError`. We only read `error`,
`path` and `type`; `input`, `ctx` and `req` are accepted and ignored so the
handler's signature matches the adapter's callback exactly.

#### Properties

##### ctx?

> `optional` **ctx?**: `unknown`

Defined in: [trpc.ts:79](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L79)

##### error

> **error**: [`TrpcErrorLike`](#trpcerrorlike)

Defined in: [trpc.ts:75](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L75)

##### input?

> `optional` **input?**: `unknown`

Defined in: [trpc.ts:78](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L78)

##### path?

> `optional` **path?**: `string`

Defined in: [trpc.ts:76](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L76)

##### req?

> `optional` **req?**: `unknown`

Defined in: [trpc.ts:80](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L80)

##### type

> **type**: [`TrpcErrorType`](#trpcerrortype)

Defined in: [trpc.ts:77](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L77)

***

### TrpcSentryLike

Defined in: [trpc.ts:87](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L87)

Minimal structural shape of the Sentry SDK needed for capture — satisfied by
`@sentry/nextjs`, `@sentry/node`, `@sentry/browser`, etc.

#### Properties

##### captureException

> **captureException**: (`exception`, `hint?`) => `unknown`

Defined in: [trpc.ts:88](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L88)

###### Parameters

###### exception

`unknown`

###### hint?

###### tags?

`Record`\<`string`, `string`\>

###### Returns

`unknown`

***

### UrlScrubContext

Defined in: [scrub.ts:282](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L282)

What the surroundings of a query say about it.

#### Properties

##### addressApi?

> `optional` **addressApi?**: `boolean`

Defined in: [scrub.ts:286](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L286)

The URL is a geocoder's: its free-text parameters are addresses.

##### trpc?

> `optional` **trpc?**: `boolean`

Defined in: [scrub.ts:284](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L284)

The URL is a tRPC route: its `input` parameter is the procedure input.

## Type Aliases

### DeferFn

> **DeferFn** = (`promise`) => `void`

Defined in: [serverless.ts:69](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L69)

A runtime keep-alive hook — Vercel's `waitUntil`, or any function that keeps
the process alive until the given promise settles. **Injected, never imported**
(see the module doc). The return value is ignored.

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### SentrySeverityLevel

> **SentrySeverityLevel** = `"fatal"` \| `"error"` \| `"warning"` \| `"log"` \| `"info"` \| `"debug"`

Defined in: [serverless.ts:62](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L62)

Sentry severity levels. Typed locally to keep this package decoupled from the
SDK's own types (see DECISIONS §11) — the SDK validates the string at runtime.

***

### SentryTrpcMiddleware

> **SentryTrpcMiddleware** = \<`T`\>(`opts`) => [`SentryTrpcMiddlewareResult`](#sentrytrpcmiddlewareresult)\<`T`\>

Defined in: [trpc-middleware.ts:68](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L68)

The middleware function `trpcMiddleware()` returns — pass to `t.middleware(...)`.

#### Type Parameters

##### T

`T`

#### Parameters

##### opts

[`SentryTrpcMiddlewareArguments`](#sentrytrpcmiddlewarearguments)\<`T`\>

#### Returns

[`SentryTrpcMiddlewareResult`](#sentrytrpcmiddlewareresult)\<`T`\>

***

### SentryTrpcMiddlewareResult

> **SentryTrpcMiddlewareResult**\<`T`\> = `T` *extends* `Promise`\<`unknown`\> ? `T` : `Promise`\<`T`\>

Defined in: [trpc-middleware.ts:65](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L65)

The SDK forces the callback to be async: `T` if already a promise, else `Promise<T>`.

#### Type Parameters

##### T

`T`

***

### TrpcErrorType

> **TrpcErrorType** = `"query"` \| `"mutation"` \| `"subscription"` \| `"unknown"`

Defined in: [trpc.ts:57](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L57)

The tRPC error type passed by the fetch adapter's `onError`.

## Variables

### DEFAULT\_DENY\_URLS

> `const` **DEFAULT\_DENY\_URLS**: `RegExp`[]

Defined in: [ignored.ts:55](https://github.com/groupe-j/sentry-config/blob/main/src/ignored.ts#L55)

***

### DEFAULT\_FLUSH\_TIMEOUT\_MS

> `const` **DEFAULT\_FLUSH\_TIMEOUT\_MS**: `2000` = `2_000`

Defined in: [serverless.ts:73](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L73)

Default flush budget: long enough to drain a healthy transport, short enough
 that a Sentry outage can't hold the function past this.

***

### DEFAULT\_IGNORED\_ERRORS

> `const` **DEFAULT\_IGNORED\_ERRORS**: (`string` \| `RegExp`)[]

Defined in: [ignored.ts:11](https://github.com/groupe-j/sentry-config/blob/main/src/ignored.ts#L11)

Default error patterns ignored by Sentry.

Browser-side: framework artifacts (NEXT_REDIRECT), browser quirks
(ResizeObserver, hydration noise on hot reload), and network failures
that aren't actionable.

Extend per-app via `ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...yourCustom]`.

***

### REDACTED

> `const` **REDACTED**: `"[REDACTED]"` = `"[REDACTED]"`

Defined in: [redaction.ts:121](https://github.com/groupe-j/sentry-config/blob/main/src/redaction.ts#L121)

***

### REDACTED\_VALUE

> `const` **REDACTED\_VALUE**: `"[redacted]"` = `"[redacted]"`

Defined in: [scrub.ts:30](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L30)

Marker for a value scrubbed out of free text. Lower-case on purpose: it tells
a reader the difference with a key-name redaction (`[REDACTED]`) at a glance.

***

### SCRUB\_FAILED\_TAG

> `const` **SCRUB\_FAILED\_TAG**: `"pii_scrub_failed"` = `"pii_scrub_failed"`

Defined in: [before-send.ts:143](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L143)

Tag set on an event whose scrubbing threw — see failClosed.

***

### SENTRY\_BROWSER\_TRACES\_SAMPLE\_RATE

> `const` **SENTRY\_BROWSER\_TRACES\_SAMPLE\_RATE**: `number`

Defined in: [sampling.ts:80](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L80)

Browser traces sample rate — **100% in production**, on purpose.

## Why it is not 10%

`SENTRY_TRACES_SAMPLE_RATE` (10%) is calibrated for the **server** tier: a
flood of `http.server` transactions, crons and queue jobs. Applying the same
rate to the browser starves it to zero, because the two tiers differ by two
orders of magnitude. Measured on the portfolio (Sentry, 30 days to
2026-07-31, `environment:production`, stored — i.e. billed — spans under
`transaction.op:pageload` + `navigation`):

```
app                 server txns   browser txns   browser spans   ×10 (rate 1.0)
megahote-t3              34 875              8             435           4 350
jepeuxconstruire         20 401             69           3 311          33 110
linegroup                 1 941             24           1 052          10 520
archicollab-t3              742             77           2 601          26 010
jelement                      0             60           3 664          36 640
coraly                       99              9             347           3 470
businessfamily                3              0               0               0
```

At 10%, half the portfolio collects fewer than **ten** browser transactions a
month — one every three days. That is not a sample, it is a rounding error:
no p75 web vital, no navigation timing, no way to tell a regression from
noise. It costs nothing and it reports nothing. (Sentry's own extrapolation
confirms the rate empirically: `count() / count_sample()` on those pageload
spans is exactly `10.0` on every app that goes through this package.)

## What 100% costs

Going from 0.1 to 1.0 on the six apps above adds **~103 000 stored spans per
month** portfolio-wide (the ×10 column, plus navigation). Against 1 704 224
spans already ingested in the same 30 days, and a reserved quota of
**5 000 000 spans/month** (Developer plan, 34% used), that is **+6% of
current ingestion and +2% of quota**. Nothing else moves: replays, profiles
and errors have their own rates, and the server tier is untouched.

## 🔻 When to come back down — the threshold, in code, not in a ticket

**Above ~500 pageloads/day, set `tracesSampleRate: 0.2` on that app** (per-app
option on `initSentryClient`, or `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` to
do it without a code deploy).

Where 500 comes from: ~100 sampled pageloads/day is the floor at which a
daily p75 web vital stops jittering, and `0.2 × 500 = 100`. Below 500/day,
dialling down buys a saving measured in tens of thousands of spans on a
five-million quota and costs the only signal the app has — not a trade worth
making. Above it, 1.0 starts to matter: a single app at 5 000 pageloads/day
would be ~5.4M spans/month at 1.0 and blow the plan on its own.
(`pronostic`, which does not use this package, uses the same rule with a
200/day trigger.)

Dev/preview stay at 100% as before. Override precedence:
`initSentryClient({ tracesSampleRate })` > `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
> this default.

***

### SENTRY\_ENABLED

> `const` **SENTRY\_ENABLED**: `boolean`

Defined in: [sampling.ts:20](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L20)

***

### SENTRY\_ENVIRONMENT

> `const` **SENTRY\_ENVIRONMENT**: `string`

Defined in: [sampling.ts:97](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L97)

Explicit override wins over the Vercel/Node defaults.

`SENTRY_ENVIRONMENT` is the server-side var. The browser bundle only sees
`NEXT_PUBLIC_*` vars (Next.js inlines those at build time and drops
non-public ones), so client consumers set `NEXT_PUBLIC_SENTRY_ENVIRONMENT`.
Both fall through to `VERCEL_ENV` (prod/preview; `NEXT_PUBLIC_VERCEL_ENV` in
the browser bundle) and `NODE_ENV` (local/test) when unset, so
dev/preview/prod behaviour is unchanged unless an app opts in
— e.g. a CI e2e run booting under `next start` that wants `environment: "ci"`.

***

### SENTRY\_PROFILES\_SAMPLE\_RATE

> `const` **SENTRY\_PROFILES\_SAMPLE\_RATE**: `0.1` \| `1`

Defined in: [sampling.ts:17](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L17)

***

### SENTRY\_REPLAYS\_ON\_ERROR\_SAMPLE\_RATE

> `const` **SENTRY\_REPLAYS\_ON\_ERROR\_SAMPLE\_RATE**: `1` = `1.0`

Defined in: [sampling.ts:19](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L19)

***

### SENTRY\_REPLAYS\_SESSION\_SAMPLE\_RATE

> `const` **SENTRY\_REPLAYS\_SESSION\_SAMPLE\_RATE**: `0` \| `0.1`

Defined in: [sampling.ts:18](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L18)

***

### SENTRY\_TRACES\_SAMPLE\_RATE

> `const` **SENTRY\_TRACES\_SAMPLE\_RATE**: `0.1` \| `1`

Defined in: [sampling.ts:16](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L16)

Sampling rates per environment.

process.env.NODE_ENV is baked at build time in Next.js, so reading once
at module load is safe.

Production: 10% (cost control)
Dev/preview: 100% (catch everything during development)
Test: disabled (no Sentry noise from CI)

⚠️ This is the **server / edge** rate. The browser has its own — see
[SENTRY\_BROWSER\_TRACES\_SAMPLE\_RATE](#sentry_browser_traces_sample_rate) — because the two tiers differ by
two orders of magnitude in volume and 10% is calibrated for the loud one.

***

### SENTRY\_WEBVITAL\_SAMPLE\_RATE

> `const` **SENTRY\_WEBVITAL\_SAMPLE\_RATE**: `number`

Defined in: [sampling.ts:124](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L124)

Web-vital sample rate — INP & friends.

Why it is NOT `SENTRY_TRACES_SAMPLE_RATE`: since SDK 8.x the browser SDK
emits INP (and optionally CLS/LCP) as **standalone spans**, i.e. one root
span per measurement, sampled through the very same `tracesSampler` as a
pageload. At 10% in production, a portfolio of low-traffic sites collects
~0 INP samples — which is exactly what we observed: LCP/CLS/FCP/TTFB (which
ride along the pageload transaction, one per pageview) were populated on the
13 Sentry projects while INP was empty everywhere.

INP is emitted at most once per page lifetime, so 100% is cheap. Dial it
down with `NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE` on a high-traffic app.

## Functions

### clearSentryUser()

> **clearSentryUser**(): `void`

Defined in: [user.ts:33](https://github.com/groupe-j/sentry-config/blob/main/src/user.ts#L33)

#### Returns

`void`

***

### createSentryBeforeBreadcrumb()

> **createSentryBeforeBreadcrumb**\<`B`\>(): (`breadcrumb`) => `B`

Defined in: [before-send.ts:391](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L391)

`beforeBreadcrumb`: the URL, message and top-level scrubbing of the
breadcrumbs of `beforeSend`, applied when the breadcrumb is RECORDED (nested
objects are left to `beforeSend`, see `scrubRecordedBreadcrumbData`). `beforeSend` already cleans the
breadcrumbs joined to an event; this hook keeps the raw ones (an outgoing
call's `http.query`, a fetch `url`, a navigation `to`) out of the scope
buffer, where anything else that reads it — an integration, an app's own
`beforeSend` running before ours — would see them in clear.

Fail-closed: a breadcrumb whose scrubbing throws keeps its type, category,
level and timestamp, and loses its message and data.

#### Type Parameters

##### B

`B` *extends* [`SentryBreadcrumbLike`](#sentrybreadcrumblike)

#### Returns

(`breadcrumb`) => `B`

***

### createSentryBeforeSend()

> **createSentryBeforeSend**\<`E`\>(`appName`): (`event`) => `E` \| `null`

Defined in: [before-send.ts:334](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L334)

@groupe-j/sentry-config — barrel export.

Most consumers should import from sub-paths:
  - '@groupe-j/sentry-config/client' → browser config
  - '@groupe-j/sentry-config/server' → Node config
  - '@groupe-j/sentry-config/edge'   → Edge config

This barrel exposes the building blocks (redact, createSentryBeforeSend,
setSentryUser, isBot) for advanced use cases.

#### Type Parameters

##### E

`E` *extends* [`SentryEventLike`](#sentryeventlike)

#### Parameters

##### appName

`string`

#### Returns

(`event`) => `E` \| `null`

***

### createSentryBeforeSendLog()

> **createSentryBeforeSendLog**\<`L`\>(): (`log`) => `L`

Defined in: [before-send.ts:425](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L425)

`beforeSendLog`: `Sentry.logger.error(\`… ${err}\`)` puts the same ORM
message in a log line, and its template parameters in `attributes`.

#### Type Parameters

##### L

`L` *extends* [`SentryLogLike`](#sentryloglike)

#### Returns

(`log`) => `L`

***

### createSentryBeforeSendTransaction()

> **createSentryBeforeSendTransaction**\<`E`\>(): (`event`) => `E`

Defined in: [before-send.ts:375](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L375)

`beforeSendTransaction` counterpart: a transaction carries the same request
(`url` with `?token=…`), contexts and breadcrumbs as an error, plus span
descriptions and span data (`http.query`, captured header attributes).

#### Type Parameters

##### E

`E` *extends* [`SentryEventLike`](#sentryeventlike)

#### Returns

(`event`) => `E`

***

### createSentryTrpcMiddleware()

> **createSentryTrpcMiddleware**(`Sentry`, `options?`): [`SentryTrpcMiddleware`](#sentrytrpcmiddleware)

Defined in: [trpc-middleware.ts:90](https://github.com/groupe-j/sentry-config/blob/main/src/trpc-middleware.ts#L90)

Builds a Sentry tRPC middleware ready to pass to `t.middleware(...)`.

Defaults `attachRpcInput` to `true` so resolver throws are captured *with*
their input (the whole point of the middleware over the `onError` backstop).
Everything else is forwarded untouched. The return type is exactly what
`Sentry.trpcMiddleware()` returns, so it drops into `t.middleware()` unchanged.

#### Parameters

##### Sentry

[`SentryTrpcMiddlewareLike`](#sentrytrpcmiddlewarelike)

##### options?

[`SentryTrpcMiddlewareOptions`](#sentrytrpcmiddlewareoptions) = `{}`

#### Returns

[`SentryTrpcMiddleware`](#sentrytrpcmiddleware)

***

### createTracesSampler()

> **createTracesSampler**(`defaultRate?`, `webVitalRate?`): (`ctx`) => `number`

Defined in: [sampling.ts:218](https://github.com/groupe-j/sentry-config/blob/main/src/sampling.ts#L218)

Builds a `tracesSampler` that returns 0 for low-value routes.
Pass to `Sentry.init({ tracesSampler: createTracesSampler(0.1) })`.

Web-vital standalone spans (INP…) are handled FIRST and on their own rate.
Two reasons:
 1. quota: see [SENTRY\_WEBVITAL\_SAMPLE\_RATE](#sentry_webvital_sample_rate) — 10% of a once-per-page
    metric is statistically nothing on our traffic;
 2. correctness: the `name` of an INP span is a DOM selector, not a URL
    (`htmlTreeAsString(target)`, e.g. `div#root > div.map`). Running URL
    patterns on it silently drops interactions whose deepest CSS class ends
    with `.map`, `.css`, `.js`… — a real hazard on our map-heavy apps.

#### Parameters

##### defaultRate?

`number` = `SENTRY_TRACES_SAMPLE_RATE`

##### webVitalRate?

`number` = `SENTRY_WEBVITAL_SAMPLE_RATE`

#### Returns

(`ctx`) => `number`

***

### createTrpcSentryOnError()

> **createTrpcSentryOnError**(`Sentry`): (`opts`) => `void`

Defined in: [trpc.ts:103](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L103)

Builds an `onError` handler for `@trpc/server`'s `fetchRequestHandler`.

Server faults are reported with `captureException(error.cause ?? error, …)`.
Capturing the underlying `cause` groups Sentry issues by the real root fault
(e.g. the Prisma exception) instead of collapsing every distinct failure into
one generic "TRPCError" issue. Client faults are skipped (see
[shouldReportTrpcError](#shouldreporttrpcerror)).

#### Parameters

##### Sentry

[`TrpcSentryLike`](#trpcsentrylike)

#### Returns

(`opts`) => `void`

***

### isBot()

> **isBot**(`userAgent?`): `boolean`

Defined in: [bot.ts:12](https://github.com/groupe-j/sentry-config/blob/main/src/bot.ts#L12)

#### Parameters

##### userAgent?

`string` \| `null`

#### Returns

`boolean`

***

### isPositionName()

> **isPositionName**(`name`): `boolean`

Defined in: [scrub.ts:324](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L324)

A key or parameter name that carries a position or an address in any
context (`lat`, `geom`, `coordinates`, `point[lng]`…).

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### isSecretName()

> **isSecretName**(`name`): `boolean`

Defined in: [scrub.ts:190](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L190)

True for a name whose value is PII or a credential in ANY context: a PII key
(same list as key-name redaction) or a credential name (`token`,
`refresh_token`, `magicLink`, `X-Amz-Signature`, `X-Goog-Signature`…).

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### isSecretParam()

> **isSecretParam**(`name`, `value`): `boolean`

Defined in: [scrub.ts:205](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L205)

True when a URL / form parameter named `name` carrying `value` must be
scrubbed: [isSecretName](#issecretname), or a weak name (`code`, `key`, `sid`…) with a
credential-length value. Weak names are URL-only on purpose: as an object key
or a JSON field, `code: "ERR_INVALID_ARG_TYPE"` is a diagnostic.

#### Parameters

##### name

`string`

##### value

`string`

#### Returns

`boolean`

***

### isSensitive()

> **isSensitive**(`key`): `boolean`

Defined in: [redaction.ts:137](https://github.com/groupe-j/sentry-config/blob/main/src/redaction.ts#L137)

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### redact()

> **redact**(`value`, `seen?`): `unknown`

Defined in: [redaction.ts:141](https://github.com/groupe-j/sentry-config/blob/main/src/redaction.ts#L141)

#### Parameters

##### value

`unknown`

##### seen?

`WeakSet`\<`object`\> = `...`

#### Returns

`unknown`

***

### scrubCookies()

> **scrubCookies**(`cookies`): `unknown`

Defined in: [scrub.ts:977](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L977)

`event.request.cookies`: names are kept (they say which session was active),
every value is dropped — a cookie value is a credential or tracking id.

#### Parameters

##### cookies

`unknown`

#### Returns

`unknown`

***

### scrubDeep()

> **scrubDeep**(`value`, `seen?`, `depth?`): `unknown`

Defined in: [scrub.ts:781](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L781)

Key-name redaction AND value scrubbing, recursively. Returns new containers
(never mutates). Cycles and pathological depth become `[REDACTED]`.

#### Parameters

##### value

`unknown`

##### seen?

`WeakSet`\<`object`\> = `...`

##### depth?

`number` = `0`

#### Returns

`unknown`

***

### scrubHeaders()

> **scrubHeaders**(`headers`): `Record`\<`string`, `string`\>

Defined in: [redaction.ts:300](https://github.com/groupe-j/sentry-config/blob/main/src/redaction.ts#L300)

#### Parameters

##### headers

`Record`\<`string`, `string`\>

#### Returns

`Record`\<`string`, `string`\>

***

### scrubQueryString()

> **scrubQueryString**(`qs`, `ctx?`): `unknown`

Defined in: [scrub.ts:943](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L943)

`event.request.query_string`: string, `{ key: value | value[] }` or
`[key, value][]`. `ctx`: what the request URL says about it (a tRPC route,
a geocoder) — see [UrlScrubContext](#urlscrubcontext).

#### Parameters

##### qs

`unknown`

##### ctx?

[`UrlScrubContext`](#urlscrubcontext)

#### Returns

`unknown`

***

### scrubRequestData()

> **scrubRequestData**(`data`, `seen?`): `unknown`

Defined in: [scrub.ts:900](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L900)

`event.request.data`: an object is walked; a JSON string is parsed, walked
and re-serialised (so key-name redaction applies to it too); anything else —
form bodies, JSON truncated by the SDK's body cap — goes through text
scrubbing, whose quoted `"key":"value"` and `key=value` patterns still apply
the key list.

#### Parameters

##### data

`unknown`

##### seen?

`WeakSet`\<`object`\> = `...`

#### Returns

`unknown`

***

### scrubSentryEvent()

> **scrubSentryEvent**\<`E`\>(`event`): `E`

Defined in: [before-send.ts:362](https://github.com/groupe-j/sentry-config/blob/main/src/before-send.ts#L362)

The scrubbing of `beforeSend` without its app tag or its drop filters
(browser extensions, non-browser runtimes) — for an app that keeps its own
`beforeSend` and composes this after it:

  beforeSend: (event) => { const e = ownRedactor(event); return e && scrubSentryEvent(e); }

Fails closed like the hooks (see [SCRUB\_FAILED\_TAG](#scrub_failed_tag)).

#### Type Parameters

##### E

`E` *extends* [`SentryEventLike`](#sentryeventlike)

#### Parameters

##### event

`E`

#### Returns

`E`

***

### scrubText()

> **scrubText**(`text`): `string`

Defined in: [scrub.ts:624](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L624)

Scrub PII and credentials out of a free-text string, keeping the text around
them. Returns the same string instance when nothing matched.

#### Parameters

##### text

`string`

#### Returns

`string`

***

### scrubUrl()

> **scrubUrl**(`url`, `ctx?`): `string`

Defined in: [scrub.ts:652](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L652)

A field known to hold a URL (`request.url`, breadcrumb `url` / `from` / `to`,
span `url.full`). Free-text scrubbing plus the position rules, with the
context of `ctx` (the host of a sibling field). Fail-closed: a query that
cannot be analysed is removed whole, fragment included — the path stays.

#### Parameters

##### url

`string`

##### ctx?

[`UrlScrubContext`](#urlscrubcontext)

#### Returns

`string`

***

### scrubUrlQuery()

> **scrubUrlQuery**(`query`, `ctx?`): `string`

Defined in: [scrub.ts:668](https://github.com/groupe-j/sentry-config/blob/main/src/scrub.ts#L668)

A query string on its own (`request.query_string`, breadcrumb `http.query`),
with or without its `?`. Same rules and same fail-closed as [scrubUrl](#scruburl);
`ctx` carries the host and path the query belongs to.

#### Parameters

##### query

`string`

##### ctx?

[`UrlScrubContext`](#urlscrubcontext)

#### Returns

`string`

***

### setSentryUser()

> **setSentryUser**(`user`): `void`

Defined in: [user.ts:24](https://github.com/groupe-j/sentry-config/blob/main/src/user.ts#L24)

#### Parameters

##### user

[`SentryUserContext`](#sentryusercontext)

#### Returns

`void`

***

### shouldReportTrpcError()

> **shouldReportTrpcError**(`code`): `boolean`

Defined in: [trpc.ts:52](https://github.com/groupe-j/sentry-config/blob/main/src/trpc.ts#L52)

Whether a tRPC error code should be reported to Sentry. Client-fault codes are
skipped; any other code (server fault, including unknown/future codes) is
reported. Fails open so a new server-fault code is never silently dropped.

#### Parameters

##### code

`string`

#### Returns

`boolean`

***

### signalServerless()

> **signalServerless**(`message`, `defer`, `options?`): `void`

Defined in: [serverless.ts:107](https://github.com/groupe-j/sentry-config/blob/main/src/serverless.ts#L107)

Capture a serverless signal and hand a bounded transport flush to `defer`.

Exactly one `captureMessage` per call (one signal, one capture). The flush is
queued *after* the capture so the drain sees the event, and handed to `defer`
so the runtime keeps the function alive until it settles.

#### Parameters

##### message

`string`

##### defer

[`DeferFn`](#deferfn)

##### options?

[`SignalServerlessOptions`](#signalserverlessoptions) = `{}`

#### Returns

`void`

***

### withCronMonitor()

> **withCronMonitor**\<`Args`, `R`\>(`monitorSlug`, `handler`, `options`): (...`args`) => `Promise`\<`R`\>

Defined in: [crons.ts:88](https://github.com/groupe-j/sentry-config/blob/main/src/crons.ts#L88)

Wraps a Next.js route handler (typically a cron GET) with Sentry monitoring.

Returns a new handler with identical signature. The Sentry check-in lifecycle
is fully transparent to the wrapped function.

Why manual check-ins instead of `Sentry.withMonitor`: `withMonitor` only
reports "error" when its callback *throws*. A route handler that **returns**
a 500 `Response` terminates normally, so the check-in went out as "ok" on a
failed run. Making the wrapper throw instead would turn a clean 500 into an
unhandled exception and break the route — so we point the status by hand and
hand the caller its `Response` back untouched.

#### Type Parameters

##### Args

`Args` *extends* `unknown`[]

##### R

`R`

#### Parameters

##### monitorSlug

`string`

##### handler

(...`args`) => `Promise`\<`R`\>

##### options

[`CronMonitorOptions`](#cronmonitoroptions)

#### Returns

(...`args`) => `Promise`\<`R`\>

## References

### assertSentryArmed

Re-exports [assertSentryArmed](armed.md#assertsentryarmed)

***

### AssertSentryArmedOptions

Re-exports [AssertSentryArmedOptions](armed.md#assertsentryarmedoptions)

***

### SentryArmedLike

Re-exports [SentryArmedLike](armed.md#sentryarmedlike)

***

### SentryClientLike

Re-exports [SentryClientLike](armed.md#sentryclientlike)
