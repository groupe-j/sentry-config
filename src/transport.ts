/**
 * Fetch-based Sentry transport factory — the escape hatch for
 * getsentry/sentry-javascript#18871.
 *
 * Under Next 16 + Turbopack, the Node SDK's default `makeNodeTransport`
 * (v10.32–10.34) calls `suppressTracing()`, which breaks the OpenTelemetry async
 * context and silently drops server-side events. A fetch-based transport doesn't
 * go through that code path, so events flow again.
 *
 * The Node SDK does **not** ship a ready-made fetch transport (`makeFetchTransport`
 * is browser-only), so this builds one from the SDK's low-level `createTransport`.
 * `createTransport` is injected rather than imported, keeping this package free of
 * a direct `@sentry/*` dependency:
 *
 *   import * as Sentry from '@sentry/nextjs';
 *   import { initSentryServer, createFetchTransportFactory } from '@groupe-j/sentry-config';
 *
 *   initSentryServer({
 *     app: 'portal',
 *     // Only on an affected SDK version — omit on healthy ones.
 *     transport: createFetchTransportFactory(Sentry.createTransport),
 *   });
 *
 * Prefer upgrading out of the affected range (see README). This is for setups
 * pinned to it.
 */

/** The request the SDK hands to a transport's `makeRequest` executor. */
export interface FetchTransportRequest {
  body: string | Uint8Array;
}

/**
 * What the executor must return. `createTransport`'s buffer reads `statusCode`
 * and the rate-limit headers to drive backpressure and drop-event accounting.
 */
export interface FetchTransportResponse {
  statusCode?: number;
  headers?: {
    "x-sentry-rate-limits": string | null;
    "retry-after": string | null;
  };
}

/** Runtime transport options the SDK supplies (`url` + optional `headers`). */
export interface FetchTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Structural shape of the SDK's `createTransport`. Generic over the transport it
 * returns so the caller's `Sentry.createTransport` type flows through unchanged.
 */
export type CreateTransportFn<T> = (
  options: FetchTransportOptions,
  makeRequest: (request: FetchTransportRequest) => PromiseLike<FetchTransportResponse>,
) => T;

/**
 * Builds a `transport` factory (the shape `Sentry.init({ transport })` expects)
 * that sends envelopes with the global `fetch` instead of the Node http module.
 *
 * @param createTransport the SDK's `createTransport` (e.g. `Sentry.createTransport`)
 * @param fetchImpl override `fetch` (tests / custom agents); defaults to global `fetch`
 */
export function createFetchTransportFactory<T>(
  createTransport: CreateTransportFn<T>,
  fetchImpl: typeof fetch = fetch,
): (options: FetchTransportOptions) => T {
  return (options: FetchTransportOptions): T =>
    createTransport(options, async (request: FetchTransportRequest) => {
      const response = await fetchImpl(options.url, {
        method: "POST",
        // Envelopes are already-encoded strings/bytes; forward as-is. A
        // Uint8Array is a valid BodyInit at runtime; the cast placates the
        // stricter lib.dom generic.
        body: request.body as BodyInit,
        headers: options.headers,
        // Keep the request alive past a serverless function returning its
        // response, so the last events aren't dropped on shutdown.
        keepalive: true,
      });

      return {
        statusCode: response.status,
        headers: {
          "x-sentry-rate-limits": response.headers.get("x-sentry-rate-limits"),
          "retry-after": response.headers.get("retry-after"),
        },
      };
    });
}
