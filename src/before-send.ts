/**
 * `beforeSend` callback factory. Tags events with app name and scrubs PII.
 *
 * Returns a NEW event object (no mutation) — downstream Sentry integrations
 * (Replay, etc.) may read the event after `beforeSend` returns; mutation
 * would leak to them.
 */

import { REDACTED, scrubHeaders } from "./redaction.js";
import {
  REDACTED_VALUE,
  scrubCookies,
  scrubDeep,
  scrubQueryString,
  scrubRequestData,
  scrubText,
} from "./scrub.js";

interface StackFrameLike {
  filename?: string;
  abs_path?: string;
  vars?: Record<string, unknown>;
}

// Loose Sentry event shape — typed locally to keep this package
// independent from @sentry/* (consumer apps depend on @sentry/nextjs).
export interface SentryEventLike {
  message?: string;
  logentry?: { message?: string; params?: unknown[] };
  transaction?: string;
  tags?: Record<string, unknown>;
  request?: {
    url?: string;
    data?: unknown;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
  };
  breadcrumbs?: { message?: string; data?: unknown }[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  exception?: {
    values?: {
      type?: string;
      value?: string;
      stacktrace?: { frames?: StackFrameLike[] };
    }[];
  };
  spans?: { description?: string; data?: unknown }[];
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

/** Tag set on an event whose scrubbing threw — see {@link failClosed}. */
export const SCRUB_FAILED_TAG = "pii_scrub_failed";

function scrubTags(tags: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tags)) {
    result[k] = typeof v === "string" ? scrubText(v) : v;
  }
  return result;
}

/**
 * Every free-text and structured field of an event (error or transaction)
 * that can carry PII. Fields absent from the input stay absent.
 */
function scrubEvent<E extends SentryEventLike>(event: E): E {
  const seen = new WeakSet<object>();
  const next: E = { ...event };

  if (typeof event.message === "string") next.message = scrubText(event.message);
  if (event.logentry) {
    next.logentry = {
      ...event.logentry,
      message:
        typeof event.logentry.message === "string"
          ? scrubText(event.logentry.message)
          : event.logentry.message,
      params:
        event.logentry.params === undefined
          ? undefined
          : (scrubDeep(event.logentry.params, seen) as unknown[]),
    };
  }
  if (typeof event.transaction === "string") next.transaction = scrubText(event.transaction);
  if (event.tags) next.tags = scrubTags(event.tags);

  if (event.request) {
    const r = event.request;
    next.request = {
      ...r,
      url: typeof r.url === "string" ? scrubText(r.url) : r.url,
      data: r.data === undefined ? undefined : scrubRequestData(r.data, seen),
      query_string: r.query_string === undefined ? undefined : scrubQueryString(r.query_string),
      cookies: r.cookies === undefined ? undefined : scrubCookies(r.cookies),
      headers: r.headers ? scrubHeaders(r.headers) : undefined,
    };
  }

  if (event.exception?.values) {
    next.exception = {
      ...event.exception,
      // Linked errors (`cause`, depth 5 by default) are separate entries here,
      // so scrubbing every value covers the whole cause chain.
      values: event.exception.values.map((v) => ({
        ...v,
        value: typeof v.value === "string" ? scrubText(v.value) : v.value,
        stacktrace:
          v.stacktrace?.frames?.some((f) => f.vars)
            ? {
                ...v.stacktrace,
                frames: v.stacktrace.frames.map((f) =>
                  f.vars ? { ...f, vars: scrubDeep(f.vars, seen) as Record<string, unknown> } : f,
                ),
              }
            : v.stacktrace,
      })),
    };
  }

  if (event.breadcrumbs) {
    next.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: typeof b.message === "string" ? scrubText(b.message) : b.message,
      data: b.data === undefined ? undefined : scrubDeep(b.data, seen),
    }));
  }

  if (event.extra) next.extra = scrubDeep(event.extra, seen) as Record<string, unknown>;
  if (event.contexts) next.contexts = scrubDeep(event.contexts, seen) as Record<string, unknown>;

  if (event.spans) {
    next.spans = event.spans.map((s) => ({
      ...s,
      description: typeof s.description === "string" ? scrubText(s.description) : s.description,
      data: s.data === undefined ? undefined : scrubDeep(s.data, seen),
    }));
  }

  return next;
}

/**
 * Scrubbing threw (a bug, or an input shape nobody anticipated). Sending the
 * raw event would leak; dropping it would blind the app. Keep what is needed
 * to see that the error happened and where — exception types and stack
 * frames without locals — and drop every free-text field.
 */
function failClosed<E extends SentryEventLike>(event: E, appName?: string): E {
  const values = event.exception?.values?.map((v) => ({
    type: v.type,
    value: REDACTED_VALUE,
    stacktrace: v.stacktrace?.frames
      ? { frames: v.stacktrace.frames.map(({ vars: _vars, ...frame }) => frame) }
      : undefined,
  }));
  const minimal: SentryEventLike = {
    tags: { ...(appName ? { app: appName } : {}), [SCRUB_FAILED_TAG]: "true" },
    ...(values ? { exception: { values } } : {}),
    ...(event.message !== undefined ? { message: REDACTED } : {}),
  };
  const kept: Record<string, unknown> = {};
  // Envelope/grouping metadata — never user data.
  for (const key of ["event_id", "timestamp", "start_timestamp", "level", "platform", "type", "environment", "release", "dist", "sdk", "fingerprint"]) {
    if (key in event) kept[key] = (event as Record<string, unknown>)[key];
  }
  return { ...kept, ...minimal } as E;
}

export function createSentryBeforeSend<E extends SentryEventLike>(
  appName: string,
): (event: E) => E | null {
  return (event: E): E | null => {
    if (hasBrowserExtensionException(event)) return null;
    try {
      const next = scrubEvent(event);
      next.tags = { ...next.tags, app: appName };
      return next;
    } catch {
      return failClosed(event, appName);
    }
  };
}

/**
 * `beforeSendTransaction` counterpart: a transaction carries the same request
 * (`url` with `?token=…`), contexts and breadcrumbs as an error, plus span
 * descriptions and span data (`http.query`, captured header attributes).
 */
export function createSentryBeforeSendTransaction<E extends SentryEventLike>(): (event: E) => E {
  return (event: E): E => {
    try {
      return scrubEvent(event);
    } catch {
      return failClosed(event);
    }
  };
}

// Loose Sentry log shape (`beforeSendLog`).
export interface SentryLogLike {
  message?: unknown;
  attributes?: Record<string, unknown>;
}

/**
 * `beforeSendLog`: `Sentry.logger.error(\`… ${err}\`)` puts the same ORM
 * message in a log line, and its template parameters in `attributes`.
 */
export function createSentryBeforeSendLog<L extends SentryLogLike>(): (log: L) => L {
  return (log: L): L => {
    try {
      const next: L = { ...log };
      // `Sentry.logger.fmt` hands a `String` OBJECT (ParameterizedString); the
      // SDK serialises it with `String(message)`, so a primitive is equivalent.
      if (typeof log.message === "string" || log.message instanceof String) {
        next.message = scrubText(String(log.message));
      }
      if (log.attributes !== undefined) {
        next.attributes = scrubDeep(log.attributes) as Record<string, unknown>;
      }
      return next;
    } catch {
      const { attributes: _attributes, ...rest } = log;
      return { ...rest, message: REDACTED_VALUE } as L;
    }
  };
}
