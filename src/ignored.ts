/**
 * Default error patterns ignored by Sentry.
 *
 * Browser-side: framework artifacts (NEXT_REDIRECT), browser quirks
 * (ResizeObserver, hydration noise on hot reload), and network failures
 * that aren't actionable.
 *
 * Extend per-app via `ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...yourCustom]`.
 */

export const DEFAULT_IGNORED_ERRORS: (string | RegExp)[] = [
  // Next.js framework artifacts
  "NEXT_NOT_FOUND",
  "NEXT_REDIRECT",
  "NEXT_HTTP_ERROR_FALLBACK",

  // Network errors — almost always user side (offline, blocking extensions)
  "AbortError",
  "NetworkError",
  "Failed to fetch",
  "Load failed",
  "Network request failed",
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",

  // Browser quirks
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /hydration/i,

  // DOM reconciliation errors from page-translation extensions (Google
  // Translate, Microsoft Translator, in-browser translators) that mutate the
  // live DOM under React's feet. React then fails to remove/insert a node it no
  // longer owns and throws a `NotFoundError`. The stack is 100% React-internal,
  // so it carries no `…-extension://` frame — `denyUrls` and the beforeSend
  // extension filter never see it, and only a message match catches it. Observed
  // portfolio-wide with 0 users impacted (PRONOSTIC-2W / -2V on /auth/*); the
  // canonical non-actionable browser noise. Matched on the message substring so
  // a genuine app-thrown NotFoundError with a different message still reports.
  /Failed to execute 'removeChild' on 'Node'/,
  /Failed to execute 'insertBefore' on 'Node'/,

  // Browser extensions injecting code
  "Script error.",
  /chrome-extension/,
  /moz-extension/,
  /safari-extension/,

  // User cancellations
  "The user aborted a request",
  "The operation was aborted",
];

export const DEFAULT_DENY_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /^safari-web-extension:\/\//i,
];
