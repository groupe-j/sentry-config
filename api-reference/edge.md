# edge

## Interfaces

### InitSentryEdgeOptions

Defined in: [edge.ts:22](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L22)

#### Properties

##### app

> **app**: `string`

Defined in: [edge.ts:24](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L24)

App name — tagged on every event.

##### dsn?

> `optional` **dsn?**: `string`

Defined in: [edge.ts:26](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L26)

Override the DSN (default: process.env.SENTRY_DSN).

##### ignoreErrors?

> `optional` **ignoreErrors?**: (`string` \| `RegExp`)[]

Defined in: [edge.ts:28](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L28)

Extra error patterns to ignore.

## Functions

### initSentryEdge()

> **initSentryEdge**(`opts`): `void`

Defined in: [edge.ts:31](https://github.com/groupe-j/sentry-config/blob/main/src/edge.ts#L31)

#### Parameters

##### opts

[`InitSentryEdgeOptions`](#initsentryedgeoptions)

#### Returns

`void`
