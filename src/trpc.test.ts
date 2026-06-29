import { describe, expect, it, vi } from "vitest";

import {
  createTrpcSentryOnError,
  shouldReportTrpcError,
  type TrpcOnErrorPayload,
} from "./trpc.js";

describe("shouldReportTrpcError", () => {
  const CLIENT_FAULT_CODES = [
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
  ];

  it.each(CLIENT_FAULT_CODES)("skips client-fault code %s", (code) => {
    expect(shouldReportTrpcError(code)).toBe(false);
  });

  const SERVER_FAULT_CODES = [
    "INTERNAL_SERVER_ERROR",
    "NOT_IMPLEMENTED",
    "BAD_GATEWAY",
    "SERVICE_UNAVAILABLE",
    "GATEWAY_TIMEOUT",
    "PARSE_ERROR",
  ];

  it.each(SERVER_FAULT_CODES)("reports server-fault code %s", (code) => {
    expect(shouldReportTrpcError(code)).toBe(true);
  });

  it("reports unknown/custom codes (fail-open)", () => {
    expect(shouldReportTrpcError("SOME_FUTURE_CODE")).toBe(true);
  });
});

describe("createTrpcSentryOnError", () => {
  function makeSentry() {
    return { captureException: vi.fn() };
  }

  function payload(
    overrides: Partial<TrpcOnErrorPayload>,
  ): TrpcOnErrorPayload {
    return {
      error: { code: "INTERNAL_SERVER_ERROR" },
      path: "post.create",
      type: "mutation",
      ...overrides,
    };
  }

  it("captures the underlying cause with trpc tags for a server fault", () => {
    const sentry = makeSentry();
    const cause = new Error("Prisma: table does not exist");
    const onError = createTrpcSentryOnError(sentry);

    onError(
      payload({
        error: { code: "INTERNAL_SERVER_ERROR", cause },
        path: "booking.confirm",
        type: "mutation",
      }),
    );

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(cause, {
      tags: { trpcPath: "booking.confirm", trpcType: "mutation" },
    });
  });

  it("falls back to the error itself when there is no cause", () => {
    const sentry = makeSentry();
    const error = { code: "INTERNAL_SERVER_ERROR" };
    const onError = createTrpcSentryOnError(sentry);

    onError(payload({ error, path: "q", type: "query" }));

    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { trpcPath: "q", trpcType: "query" },
    });
  });

  it("uses a placeholder when path is undefined", () => {
    const sentry = makeSentry();
    const onError = createTrpcSentryOnError(sentry);

    onError(payload({ path: undefined, type: "unknown" }));

    expect(sentry.captureException).toHaveBeenCalledWith(expect.anything(), {
      tags: { trpcPath: "<no-path>", trpcType: "unknown" },
    });
  });

  it("does NOT capture client-fault errors", () => {
    const sentry = makeSentry();
    const onError = createTrpcSentryOnError(sentry);

    onError(payload({ error: { code: "NOT_FOUND" } }));
    onError(payload({ error: { code: "UNAUTHORIZED" } }));

    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
