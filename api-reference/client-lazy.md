# client-lazy

## Interfaces

### InitSentryClientLazyOptions

Defined in: [client-lazy.ts:78](https://github.com/groupe-j/sentry-config/blob/main/src/client-lazy.ts#L78)

#### Extends

- `InitSentryClientBaseOptions`

#### Properties

##### app

> **app**: `string`

Defined in: [client-core.ts:56](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L56)

App name — tagged on every event for multi-tenant dashboards.

###### Inherited from

`InitSentryClientBaseOptions.app`

##### dsn?

> `optional` **dsn?**: `string`

Defined in: [client-core.ts:58](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L58)

Override the public DSN (default: process.env.NEXT_PUBLIC_SENTRY_DSN).

###### Inherited from

`InitSentryClientBaseOptions.dsn`

##### enabled?

> `optional` **enabled?**: () => `boolean`

Defined in: [client-core.ts:60](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L60)

Disable Sentry when this returns false (e.g. cookie consent gate). Evaluated once, at init.

###### Returns

`boolean`

###### Inherited from

`InitSentryClientBaseOptions.enabled`

##### ignoreErrors?

> `optional` **ignoreErrors?**: (`string` \| `RegExp`)[]

Defined in: [client-core.ts:109](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L109)

Extra error patterns to ignore (merged with DEFAULT_IGNORED_ERRORS).

###### Inherited from

`InitSentryClientBaseOptions.ignoreErrors`

##### replay?

> `optional` **replay?**: [`LazyReplayMode`](#lazyreplaymode)

Defined in: [client-lazy.ts:87](https://github.com/groupe-j/sentry-config/blob/main/src/client-lazy.ts#L87)

`"lazy"` (default) — Replay fetched from the CDN after first paint or on
the first captured error. `false` — no Replay at all, and unlike on the
eager entry point `false` here saves no *further* bytes because there were
none to save; it just zeroes `replaysOnErrorSampleRate`.

###### Default

```ts
"lazy"
```

##### replayBlockAllMedia?

> `optional` **replayBlockAllMedia?**: `boolean`

Defined in: [client-core.ts:113](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L113)

Block media in Replay (default true).

###### Inherited from

`InitSentryClientBaseOptions.replayBlockAllMedia`

##### replayCdnBaseUrl?

> `optional` **replayCdnBaseUrl?**: `string`

Defined in: [client-core.ts:136](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L136)

Origin to fetch the lazily-loaded Replay bundle from. Defaults to Sentry's
public CDN (`https://browser.sentry-cdn.com`). Point it at your own origin
if your CSP or your ad-blocker tolerance requires it. Ignored when Replay
is eager.

⚠️ **Origin only — any path is discarded.** The SDK resolves
`new URL("/<version>/replay.min.js", baseURL)`, and the leading slash makes
that origin-absolute: `https://cdn.example.com/sentry` fetches
`https://cdn.example.com/<version>/replay.min.js`, *not*
`…/sentry/<version>/…`. Serve the bundle at the root of whatever origin you
point this at, or you get a 404 and no Replay.

###### Inherited from

`InitSentryClientBaseOptions.replayCdnBaseUrl`

##### replayConsent?

> `optional` **replayConsent?**: () => `boolean`

Defined in: [client-core.ts:107](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L107)

Gate **Replay alone**, without gating Sentry. Return `false` to skip the
attach; return `true` to allow it.

## Why this is not `enabled`

`enabled` turns off the whole SDK and is evaluated **once, at init**. Two
reasons that does not fit a consent banner:

1. **Error monitoring and session recording do not share a legal basis.**
   Capturing errors is routinely run on legitimate interest — security and
   availability — while recording a user's screen is not. An app that needs
   "Sentry always, Replay only on consent" has no way to say so with
   `enabled`, and the two apps that needed it hand-rolled the gate instead
   (which is what kept them on the eager entry point, and on ~124 KB of
   rrweb in the initial chunk).
2. **At init, the answer is not knowable yet.** `instrumentation-client.ts`
   runs before the first React render, so before any consent manager has
   loaded. Reading consent there means reading it too early — you either
   never record, or you record regardless, and the second is worse.

This callback is therefore evaluated **at each attach trigger** (idle after
`load`, and again on a captured error), not at init. By then the consent
cookie is readable.

###### Returns

`boolean`

###### Example

```ts
initSentryClient({
  app: "archicollab",
  // Sentry stays on: legitimate interest (security, availability).
  // Replay waits for an explicit opt-in.
  replayConsent: () => readConsentFromCookie(SENTRY_SERVICE_KEY),
});

⚠️ **Known gap, stated rather than hidden.** A refusal does not consume an
attach attempt, so consent granted *later* is still honoured — but only at
the next trigger, and the idle-after-`load` trigger fires once. In practice
that means: consent granted, then an error occurs → Replay attaches;
consent granted, no error, no further trigger → no Replay for that page
view. It resumes on the next navigation that reloads the document. Recording
a user who has not (yet) agreed is the failure this option exists to
prevent, so the gap is deliberately on the side of not recording.

Ignored when Replay is eager (`@groupe-j/sentry-config/client` with
`replay: true`): there is no attach step to gate. Gate that entry point with
`replay: false` instead.
```

###### Inherited from

`InitSentryClientBaseOptions.replayConsent`

##### replayMaskAllText?

> `optional` **replayMaskAllText?**: `boolean`

Defined in: [client-core.ts:111](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L111)

Mask all text in Replay (default true — safe). Set false only if no PII risk.

###### Inherited from

`InitSentryClientBaseOptions.replayMaskAllText`

##### replayScriptNonce?

> `optional` **replayScriptNonce?**: `string`

Defined in: [client-core.ts:141](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L141)

Nonce forwarded to the lazily injected `<script>` tag, for apps running a
strict `script-src 'nonce-…'` CSP. Ignored when Replay is eager.

###### Inherited from

`InitSentryClientBaseOptions.replayScriptNonce`

##### sendDefaultPii?

> `optional` **sendDefaultPii?**: `boolean`

Defined in: [client-core.ts:146](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L146)

Send default PII (cookies, headers, IP). Default: false (RGPD-safer).
Set true only when you have explicit user consent and need the data.

###### Inherited from

`InitSentryClientBaseOptions.sendDefaultPii`

##### tracesSampleRate?

> `optional` **tracesSampleRate?**: `number`

Defined in: [client-core.ts:178](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L178)

Fraction of browser pageloads / navigations that get a trace, in `[0, 1]`.

Default: [SENTRY\_BROWSER\_TRACES\_SAMPLE\_RATE](index.md#sentry_browser_traces_sample_rate) — **1.0 in production**,
1.0 in dev. Read that doc comment before overriding: it carries the
measured volumes and the threshold at which coming back down to `0.2` is
the right call (**~500 pageloads/day**).

This knob is browser-only. `initSentryServer` / `initSentryEdge` keep
`SENTRY_TRACES_SAMPLE_RATE` (10%), which is what the server tier's volume
justifies.

`0` is a legal value and is honoured as written: no pageload and no
navigation traces, error reporting untouched.

⚠️ **`0` here does NOT zero your browser span bill.** Standalone web-vital
spans (INP, and CLS/LCP when enabled) are sampled on their **own** rate —
`SENTRY_WEBVITAL_SAMPLE_RATE`, 100% by default — and `createTracesSampler`
settles them *before* it looks at this one. That decoupling is deliberate
(it is why INP stopped being empty portfolio-wide in 0.6.0, and
"web vitals only, no full pageload traces" is a genuinely good setting for a
low-traffic vitrine), but it does mean `tracesSampleRate: 0` alone leaves
one span per interactive page still flowing. For an actual full stop, add
`NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE=0`.

Anything outside `[0, 1]` (or `NaN`) is a programming error — it is logged
loudly and the default is used, rather than silently shipping a rate nobody
chose.

Precedence: this option > `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` > default.

###### Inherited from

`InitSentryClientBaseOptions.tracesSampleRate`

##### tunnel?

> `optional` **tunnel?**: `string`

Defined in: [client-core.ts:122](https://github.com/groupe-j/sentry-config/blob/main/src/client-core.ts#L122)

Same-origin tunnel route to bypass ad-blockers. Match the tunnelRoute you
set in `withSentryConfig`. Example: `'/monitoring'`. Default: none.

⚠️ The tunnel only covers **event ingestion**. In `"lazy"` mode the Replay
*code* is still fetched from `browser.sentry-cdn.com`, which a content
blocker can refuse independently. See [InitSentryClientBaseOptions.replayCdnBaseUrl](client.md#replaycdnbaseurl).

###### Inherited from

`InitSentryClientBaseOptions.tunnel`

## Type Aliases

### LazyReplayMode

> **LazyReplayMode** = `"lazy"` \| `false`

Defined in: [client-lazy.ts:73](https://github.com/groupe-j/sentry-config/blob/main/src/client-lazy.ts#L73)

Replay strategies available on this entry point.

`true` is deliberately **not** offered: honouring it would require a static
`Sentry.replayIntegration` reference, which is exactly the ~39 KB gzip this
module exists to avoid. Use `@groupe-j/sentry-config/client` for eager
Replay.

## Functions

### initSentryClient()

> **initSentryClient**(`opts`): `void`

Defined in: [client-lazy.ts:90](https://github.com/groupe-j/sentry-config/blob/main/src/client-lazy.ts#L90)

#### Parameters

##### opts

[`InitSentryClientLazyOptions`](#initsentryclientlazyoptions)

#### Returns

`void`

## References

### SENTRY\_BROWSER\_TRACES\_SAMPLE\_RATE

Re-exports [SENTRY_BROWSER_TRACES_SAMPLE_RATE](index.md#sentry_browser_traces_sample_rate)
