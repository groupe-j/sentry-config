import { describe, expect, it, vi } from "vitest";

import {
  createFetchTransportFactory,
  type FetchTransportRequest,
  type FetchTransportResponse,
} from "./transport.js";

describe("createFetchTransportFactory", () => {
  const OPTIONS = {
    url: "https://ingest.example/api/1/envelope/",
    headers: { "x-sentry-auth": "token" },
  };

  function fakeResponse(
    status: number,
    headers: Record<string, string | null> = {},
  ): Response {
    return {
      status,
      headers: { get: (k: string) => headers[k] ?? null },
    } as unknown as Response;
  }

  it("passes options + a makeRequest executor to the injected createTransport", () => {
    const sentinel = { send: vi.fn(), flush: vi.fn() };
    const createTransport = vi.fn((_options: unknown, _makeRequest: unknown) => sentinel);

    const factory = createFetchTransportFactory(createTransport, vi.fn());
    const transport = factory(OPTIONS);

    expect(transport).toBe(sentinel);
    expect(createTransport).toHaveBeenCalledTimes(1);
    const [passedOptions, makeRequest] = createTransport.mock.calls[0]!;
    expect(passedOptions).toBe(OPTIONS);
    expect(typeof makeRequest).toBe("function");
  });

  it("POSTs the envelope body to the ingest URL with the SDK headers", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(200));
    let makeRequest!: (r: FetchTransportRequest) => PromiseLike<FetchTransportResponse>;
    const createTransport = vi.fn((_opts, mr) => {
      makeRequest = mr;
      return { send: vi.fn(), flush: vi.fn() };
    });

    createFetchTransportFactory(createTransport, fetchImpl)(OPTIONS);
    await makeRequest({ body: "envelope-bytes" });

    expect(fetchImpl).toHaveBeenCalledWith(OPTIONS.url, {
      method: "POST",
      body: "envelope-bytes",
      headers: OPTIONS.headers,
      keepalive: true,
    });
  });

  it("maps status + rate-limit headers into the transport response", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse(429, {
        "x-sentry-rate-limits": "60::organization",
        "retry-after": "60",
      }),
    );
    let makeRequest!: (r: FetchTransportRequest) => PromiseLike<FetchTransportResponse>;
    const createTransport = vi.fn((_opts, mr) => {
      makeRequest = mr;
      return { send: vi.fn(), flush: vi.fn() };
    });

    createFetchTransportFactory(createTransport, fetchImpl)(OPTIONS);
    const res = await makeRequest({ body: "x" });

    expect(res).toEqual({
      statusCode: 429,
      headers: {
        "x-sentry-rate-limits": "60::organization",
        "retry-after": "60",
      },
    });
  });

  it("returns null header values when the response omits them", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(200));
    let makeRequest!: (r: FetchTransportRequest) => PromiseLike<FetchTransportResponse>;
    const createTransport = vi.fn((_opts, mr) => {
      makeRequest = mr;
      return { send: vi.fn(), flush: vi.fn() };
    });

    createFetchTransportFactory(createTransport, fetchImpl)(OPTIONS);
    const res = await makeRequest({ body: "x" });

    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual({
      "x-sentry-rate-limits": null,
      "retry-after": null,
    });
  });
});
