/**
 * Wrapper around the SDK's built-in `Sentry.trpcMiddleware`, so apps stop
 * hand-rolling `onError → captureException` on the fetch adapter and instead
 * capture resolver throws *at the middleware layer* — with the RPC input
 * attached (`attachRpcInput`) and a span per procedure.
 *
 * Why both this and {@link createTrpcSentryOnError} exist:
 *
 * - `createTrpcSentryOnError` plugs into `fetchRequestHandler`'s `onError`. It's
 *   the right tool when you only control the route handler and want a tested,
 *   noise-filtered capture (skips client-fault codes, unwraps `cause`).
 * - `Sentry.trpcMiddleware` plugs into the *procedure builder* (`t.procedure.use`).
 *   It runs inside the tRPC call, so it can attach the procedure input to the
 *   event and open a performance span — context the `onError` path can't reach.
 *   This is Sentry's recommended integration point for tRPC.
 *
 * Use the middleware when you own the tRPC `initTRPC` setup; use the `onError`
 * helper when you only own the Next.js route. Using both is fine and harmless
 * (the middleware captures with input; `onError` is a backstop) — but if you
 * adopt the middleware you can usually drop the manual `onError` capture.
 *
 * The Sentry instance is injected rather than imported, so the package keeps no
 * direct `@sentry/*` dependency and the helper works with `@sentry/nextjs`,
 * `@sentry/node`, or any SDK exposing a compatible `trpcMiddleware`.
 *
 * Usage (tRPC `initTRPC` setup, `@sentry/nextjs`):
 *
 *   import * as Sentry from '@sentry/nextjs';
 *   import { createSentryTrpcMiddleware } from '@groupe-j/sentry-config';
 *
 *   const t = initTRPC.context<Context>().create();
 *   const sentryMiddleware = t.middleware(createSentryTrpcMiddleware(Sentry));
 *
 *   export const publicProcedure = t.procedure.use(sentryMiddleware);
 */

/** Options forwarded to the SDK's `trpcMiddleware`. */
export interface SentryTrpcMiddlewareOptions {
  /**
   * Include the procedure input in the reported event. Defaults to `true` here
   * (the SDK default is `false`) — capturing the input is the main reason to
   * use the middleware over the `onError` path. Set `false` if inputs may carry
   * PII the redaction layer doesn't cover.
   */
  attachRpcInput?: boolean;
  /** Force a transaction (span) even when there's no active parent. */
  forceTransaction?: boolean;
}

/**
 * Minimal structural shape of the SDK needed to build the middleware — satisfied
 * by `@sentry/nextjs`, `@sentry/node`, etc. `trpcMiddleware` returns a function
 * matching tRPC's middleware signature.
 */
export interface SentryTrpcMiddlewareLike {
  trpcMiddleware: (
    options?: SentryTrpcMiddlewareOptions,
  ) => (opts: unknown) => unknown;
}

/**
 * Builds a Sentry tRPC middleware ready to pass to `t.middleware(...)`.
 *
 * Defaults `attachRpcInput` to `true` so resolver throws are captured *with*
 * their input (the whole point of the middleware over the `onError` backstop).
 * Everything else is forwarded untouched.
 */
export function createSentryTrpcMiddleware(
  Sentry: SentryTrpcMiddlewareLike,
  options: SentryTrpcMiddlewareOptions = {},
): (opts: unknown) => unknown {
  const { attachRpcInput = true, ...rest } = options;
  return Sentry.trpcMiddleware({ attachRpcInput, ...rest });
}
