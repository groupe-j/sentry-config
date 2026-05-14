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
export type SentryEventLike = {
  tags?: Record<string, unknown>;
  request?: {
    data?: unknown;
    headers?: Record<string, string>;
  };
  breadcrumbs?: Array<{ data?: unknown }>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};

export function createSentryBeforeSend<E extends SentryEventLike>(
  appName: string,
): (event: E) => E {
  return (event: E): E => {
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
