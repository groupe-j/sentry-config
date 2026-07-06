/**
 * `beforeSend` callback factory. Tags events with app name and scrubs PII.
 *
 * Returns a NEW event object (no mutation) — downstream Sentry integrations
 * (Replay, etc.) may read the event after `beforeSend` returns; mutation
 * would leak to them.
 */

import { redact, scrubHeaders } from "./redaction.js";

// Loose Sentry event shape — typed locally to keep this package
// independent from @sentry/* (consumer apps depend on @sentry/nextjs).
export interface SentryEventLike {
  tags?: Record<string, unknown>;
  request?: {
    data?: unknown;
    headers?: Record<string, string>;
  };
  breadcrumbs?: { data?: unknown }[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  exception?: {
    values?: {
      type?: string;
      value?: string;
      stacktrace?: { frames?: { filename?: string; abs_path?: string }[] };
    }[];
  };
}

/**
 * Browser-extension URL scheme. Deliberately requires the `…-extension://`
 * scheme (not a bare "extension" substring) so free-text errors like
 * "Unsupported file extension: .xyz" are never dropped — the conservative rule
 * is to keep any genuine user error.
 */
const EXTENSION_SCHEME = /(?:chrome|moz|safari(?:-web)?)-extension:\/\//i;

/**
 * True when any exception value/type or stacktrace frame points at a browser
 * extension. Belt-and-suspenders behind SDK `denyUrls`: an extension error that
 * is re-captured (e.g. via `captureConsoleIntegration`) can carry a synthesized
 * stack whose TOP frame is the app's console call, so `denyUrls` never fires —
 * but a deeper frame or the value still holds the `…-extension://` scheme.
 */
function hasBrowserExtensionException(event: SentryEventLike): boolean {
  const values = event.exception?.values;
  if (!values) return false;
  return values.some((v) => {
    if (EXTENSION_SCHEME.test(v.type ?? "") || EXTENSION_SCHEME.test(v.value ?? "")) {
      return true;
    }
    return (v.stacktrace?.frames ?? []).some(
      (f) => EXTENSION_SCHEME.test(f.filename ?? "") || EXTENSION_SCHEME.test(f.abs_path ?? ""),
    );
  });
}

export function createSentryBeforeSend<E extends SentryEventLike>(
  appName: string,
): (event: E) => E | null {
  return (event: E): E | null => {
    if (hasBrowserExtensionException(event)) return null;

    const seen = new WeakSet<object>();

    const next: E = {
      ...event,
      tags: { ...event.tags, app: appName },
    };

    if (event.request) {
      next.request = {
        ...event.request,
        data:
          event.request.data === undefined
            ? undefined
            : redact(event.request.data, seen),
        headers: event.request.headers
          ? scrubHeaders(event.request.headers)
          : undefined,
      };
    }

    if (event.breadcrumbs) {
      next.breadcrumbs = event.breadcrumbs.map((b) => ({
        ...b,
        data: b.data === undefined ? undefined : redact(b.data, seen),
      }));
    }

    if (event.extra) {
      next.extra = redact(event.extra, seen) as Record<string, unknown>;
    }

    if (event.contexts) {
      next.contexts = redact(event.contexts, seen) as Record<string, unknown>;
    }

    return next;
  };
}
