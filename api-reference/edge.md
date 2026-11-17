# edge

## Interfaces

### InitSentryEdgeOptions

Defined in: [edge.ts:26](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L26)

#### Properties

##### app

> **app**: `string`

Defined in: [edge.ts:28](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L28)

App name — tagged on every event.

##### dsn?

> `optional` **dsn?**: `string`

Defined in: [edge.ts:30](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L30)

Override the DSN (default: process.env.SENTRY_DSN).

##### ignoreErrors?

> `optional` **ignoreErrors?**: (`string` \| `RegExp`)[]

Defined in: [edge.ts:32](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L32)

Extra error patterns to ignore.

## Functions

### initSentryEdge()

> **initSentryEdge**(`opts`): `void`

Defined in: [edge.ts:35](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L35)

#### Parameters

##### opts

[`InitSentryEdgeOptions`](#initsentryedgeoptions)

#### Returns

`void`
