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
  function?: string;
  module?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
  vars?: Record<string, unknown>;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
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
    env?: Record<string, unknown>;
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
      mechanism?: { type?: string; data?: Record<string, unknown> };
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

/**
 * A frame carries PII in three places: local `vars`, source lines
 * (`context_line: 'const email = "jean@…"'`) and the file URL of an inline
 * script (`https://app/verify?token=…`). Filenames are only scanned when they
 * hold a query or fragment, so ordinary paths are never rewritten.
 */
function scrubFrame(f: StackFrameLike, seen: WeakSet<object>): StackFrameLike {
  const next: StackFrameLike = { ...f };
  if (f.vars) next.vars = scrubDeep(f.vars, seen) as Record<string, unknown>;
  if (typeof f.filename === "string" && /[?#]/.test(f.filename)) next.filename = scrubText(f.filename);
  if (typeof f.abs_path === "string" && /[?#]/.test(f.abs_path)) next.abs_path = scrubText(f.abs_path);
  if (typeof f.context_line === "string") next.context_line = scrubText(f.context_line);
  if (Array.isArray(f.pre_context)) next.pre_context = f.pre_context.map((l) => (typeof l === "string" ? scrubText(l) : l));
  if (Array.isArray(f.post_context)) next.post_context = f.post_context.map((l) => (typeof l === "string" ? scrubText(l) : l));
  return next;
}

/** Client IP and IP-derived geolocation headers (proxies, Vercel, Cloudflare). */
const IP_HEADER = /^(?:x-forwarded-for|x-real-ip|forwarded|cf-connecting-ip|true-client-ip|x-client-ip|x-vercel-forwarded-for|x-vercel-proxied-for|x-vercel-ip-.+|cf-ipcity|cf-iplatitude|cf-iplongitude)$/i;

/** Header NAMES that are credentials are dropped by `scrubHeaders`; the rest have their VALUES scanned (`Referer: …?token=`). */
function scrubHeaderValues(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(scrubHeaders(headers))) {
    result[k] = IP_HEADER.test(k) ? REDACTED : typeof v === "string" ? scrubText(v) : v;
  }
  return result;
}

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
      env: r.env === undefined ? undefined : (scrubDeep(r.env, seen) as Record<string, unknown>),
      data: r.data === undefined ? undefined : scrubRequestData(r.data, seen),
      query_string: r.query_string === undefined ? undefined : scrubQueryString(r.query_string),
      cookies: r.cookies === undefined ? undefined : scrubCookies(r.cookies),
      headers: r.headers ? scrubHeaderValues(r.headers) : undefined,
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
        mechanism: v.mechanism?.data
          ? { ...v.mechanism, data: scrubDeep(v.mechanism.data, seen) as Record<string, unknown> }
          : v.mechanism,
        stacktrace: v.stacktrace?.frames
          ? { ...v.stacktrace, frames: v.stacktrace.frames.map((f) => scrubFrame(f, seen)) }
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
  const result: Record<string, unknown> = {};
  // Envelope metadata — never user data. `fingerprint` is NOT kept: apps build
  // it from arbitrary values. Each read is guarded: the event that made
  // scrubbing throw may throw again on any access.
  for (const key of ["event_id", "timestamp", "start_timestamp", "level", "platform", "type", "environment", "release", "dist", "sdk"]) {
    try {
      if (key in event) result[key] = (event as Record<string, unknown>)[key];
      // eslint-disable-next-line @groupe-j/no-error-swallow -- this IS the error path: an unreadable envelope field is left out so the fail-closed event still ships.
    } catch {
      // Unreadable field: leave it out rather than fail the whole fallback.
    }
  }
  try {
    const values = event.exception?.values?.map((v) => ({
      type: typeof v.type === "string" ? v.type : undefined,
      value: REDACTED_VALUE,
      stacktrace: v.stacktrace?.frames ? { frames: v.stacktrace.frames.map(safeFrame) } : undefined,
    }));
    if (values) result.exception = { values };
  } catch {
    result.exception = { values: [{ type: "Error", value: REDACTED_VALUE }] };
  }
  result.message = REDACTED_VALUE;
  result.tags = { ...(appName ? { app: appName } : {}), [SCRUB_FAILED_TAG]: "true" };
  return result as E;
}

/** Location only: no locals, no source lines, no query string in the file URL. */
function safeFrame(f: StackFrameLike): StackFrameLike {
  const frame: StackFrameLike = {};
  if (typeof f.filename === "string") frame.filename = f.filename.split(/[?#]/)[0];
  if (typeof f.abs_path === "string") frame.abs_path = f.abs_path.split(/[?#]/)[0];
  for (const key of ["function", "module", "lineno", "colno", "in_app"] as const) {
    if (f[key] !== undefined) (frame as Record<string, unknown>)[key] = f[key];
  }
  return frame;
}

export function createSentryBeforeSend<E extends SentryEventLike>(
  appName: string,
): (event: E) => E | null {
  return (event: E): E | null => {
    try {
      // Inside the `try`: a throwing getter on `exception.values` must reach
      // the fail-closed path, not escape — the SDK drops an event whose
      // `beforeSend` throws.
      if (hasBrowserExtensionException(event)) return null;
      const next = scrubEvent(event);
      next.tags = { ...next.tags, app: appName };
      return next;
    } catch {
      return failClosed(event, appName);
    }
  };
}

/**
 * The scrubbing of `beforeSend` without its app tag or extension filter — for
 * an app that keeps its own `beforeSend` and composes this after it:
 *
 *   beforeSend: (event) => { const e = ownRedactor(event); return e && scrubSentryEvent(e); }
 *
 * Fails closed like the hooks (see {@link SCRUB_FAILED_TAG}).
 */
export function scrubSentryEvent<E extends SentryEventLike>(event: E): E {
  try {
    return scrubEvent(event);
  } catch {
    return failClosed(event);
  }
}

/**
 * `beforeSendTransaction` counterpart: a transaction carries the same request
 * (`url` with `?token=…`), contexts and breadcrumbs as an error, plus span
 * descriptions and span data (`http.query`, captured header attributes).
 */
export function createSentryBeforeSendTransaction<E extends SentryEventLike>(): (event: E) => E {
  return (event: E): E => scrubSentryEvent(event);
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
