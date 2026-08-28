# armed

## Interfaces

### AssertSentryArmedOptions

Defined in: [armed.ts:32](https://github.com/groupe-j/sentry-config/blob/main/src/armed.ts#L32)

#### Properties

##### throwOnMissing?

> `optional` **throwOnMissing?**: `boolean`

Defined in: [armed.ts:38](https://github.com/groupe-j/sentry-config/blob/main/src/armed.ts#L38)

Throw a hard error when no DSN is configured, instead of only logging.
Default: false (log loudly but let the app continue). Set true in
production startup if you'd rather fail the boot than run blind.

***

### SentryArmedLike

Defined in: [armed.ts:28](https://github.com/groupe-j/sentry-config/blob/main/src/armed.ts#L28)

Minimal structural shape of the Sentry SDK needed to check arming — satisfied
by `@sentry/nextjs`, `@sentry/node`, `@sentry/browser`, etc.

#### Properties

##### getClient

> **getClient**: () => [`SentryClientLike`](#sentryclientlike) \| `undefined`

Defined in: [armed.ts:29](https://github.com/groupe-j/sentry-config/blob/main/src/armed.ts#L29)

###### Returns

[`SentryClientLike`](#sentryclientlike) \| `undefined`

***

### SentryClientLike

Defined in: [armed.ts:20](https://github.com/groupe-j/sentry-config/blob/main/src/armed.ts#L20)

Minimal structural shape of a Sentry client (what `getClient()` returns).

#### Properties

##### getDsn

> **getDsn**: () => `unknown`

Defined in: [armed.ts:21](https://github.com/groupe-j/sentry-config/blob/main/src/armed.ts#L21)

###### Returns

`unknown`

## Functions

### assertSentryArmed()

> **assertSentryArmed**(`Sentry`, `options?`): `boolean`

Defined in: [armed.ts:46](https://github.com/groupe-j/sentry-config/blob/main/src/armed.ts#L46)

Returns `true` when Sentry has a live client with a DSN. When it doesn't,
logs a loud `console.error` and returns `false` — or throws if
`throwOnMissing` is set.

#### Parameters

##### Sentry

[`SentryArmedLike`](#sentryarmedlike)

##### options?

[`AssertSentryArmedOptions`](#assertsentryarmedoptions) = `{}`

#### Returns

`boolean`
