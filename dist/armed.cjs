'use strict';

// src/armed.ts
function assertSentryArmed(Sentry, options = {}) {
  const { throwOnMissing = false } = options;
  const dsn = Sentry.getClient()?.getDsn();
  if (dsn) return true;
  const message = "[sentry-config] Sentry is NOT armed: getClient().getDsn() is empty. Errors will be silently dropped. Check SENTRY_DSN / Sentry.init in this runtime.";
  if (throwOnMissing) {
    console.error(message);
    throw new Error(message);
  }
  console.error(message);
  return false;
}

exports.assertSentryArmed = assertSentryArmed;
//# sourceMappingURL=armed.cjs.map
//# sourceMappingURL=armed.cjs.map