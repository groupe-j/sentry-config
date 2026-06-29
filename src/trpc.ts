/**
 * Reusable tRPC → Sentry error capture for the `@trpc/server` fetch adapter.
 *
 * Drop-in `onError` for `fetchRequestHandler`, centralising the capture logic
 * that portfolio apps were each re-implementing (or omitting — see GRO-295,
 * where `apps/portal` had no `onError` at all and a prod outage produced 0
 * Sentry events).
 *
 * Usage (Next.js route handler, `@sentry/nextjs`):
 *
 *   import * as Sentry from '@sentry/nextjs';
 *   import { createTrpcSentryOnError } from '@groupe-j/sentry-config';
 *
 *   const onError = createTrpcSentryOnError(Sentry);
 *
 *   export function POST(req: Request) {
 *     return fetchRequestHandler({ req, router, createContext, onError });
 *   }
 *
 * The Sentry instance is injected rather than imported, so the same helper works
 * whether the app uses `@sentry/nextjs`, `@sentry/node`, or any SDK exposing a
 * compatible `captureException`.
 */

/**
 * tRPC error codes that represent a client fault (4xx-ish). These are expected
 * outcomes of normal operation — auth failures, validation errors, missing
 * resources, rate limits — and would only add noise to Sentry. Everything else
 * (most importantly INTERNAL_SERVER_ERROR, which wraps unexpected throws like
 * the GRO-295 Prisma "table does not exist") is a server fault worth capturing.
 */
const CLIENT_FAULT_CODES = new Set<string>([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "TIMEOUT",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "METHOD_NOT_SUPPORTED",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST",
]);

/**
 * Whether a tRPC error code should be reported to Sentry. Client-fault codes are
 * skipped; any other code (server fault, including unknown/future codes) is
 * reported. Fails open so a new server-fault code is never silently dropped.
 */
export function shouldReportTrpcError(code: string): boolean {
  return !CLIENT_FAULT_CODES.has(code);
}

/** The tRPC error type passed by the fetch adapter's `onError`. */
export type TrpcErrorType = "query" | "mutation" | "subscription" | "unknown";

/**
 * Minimal structural shape of a `TRPCError`. We avoid importing `@trpc/server`
 * so the package carries no tRPC dependency; the real `TRPCError` (whose `code`
 * is a string union and which carries an optional `cause`) satisfies this.
 */
export interface TrpcErrorLike {
  code: string;
  cause?: unknown;
}

/**
 * The argument the fetch adapter passes to `onError`. We only read `error`,
 * `path` and `type`; `input`, `ctx` and `req` are accepted and ignored so the
 * handler's signature matches the adapter's callback exactly.
 */
export interface TrpcOnErrorPayload {
  error: TrpcErrorLike;
  path?: string;
  type: TrpcErrorType;
  input?: unknown;
  ctx?: unknown;
  req?: unknown;
}

/**
 * Minimal structural shape of the Sentry SDK needed for capture — satisfied by
 * `@sentry/nextjs`, `@sentry/node`, `@sentry/browser`, etc.
 */
export interface TrpcSentryLike {
  captureException: (
    exception: unknown,
    hint?: { tags?: Record<string, string> },
  ) => unknown;
}

/**
 * Builds an `onError` handler for `@trpc/server`'s `fetchRequestHandler`.
 *
 * Server faults are reported with `captureException(error.cause ?? error, …)`.
 * Capturing the underlying `cause` groups Sentry issues by the real root fault
 * (e.g. the Prisma exception) instead of collapsing every distinct failure into
 * one generic "TRPCError" issue. Client faults are skipped (see
 * {@link shouldReportTrpcError}).
 */
export function createTrpcSentryOnError(
  Sentry: TrpcSentryLike,
): (opts: TrpcOnErrorPayload) => void {
  return ({ error, path, type }: TrpcOnErrorPayload): void => {
    if (!shouldReportTrpcError(error.code)) return;

    Sentry.captureException(error.cause ?? error, {
      tags: {
        trpcPath: path ?? "<no-path>",
        trpcType: type,
      },
    });
  };
}
