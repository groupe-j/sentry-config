import { describe, expect, it, vi } from "vitest";

import { createSentryTrpcMiddleware } from "./trpc-middleware.js";

describe("createSentryTrpcMiddleware", () => {
  function makeSentry() {
    const built = vi.fn();
    const trpcMiddleware = vi.fn(() => built);
    return { sentry: { trpcMiddleware }, trpcMiddleware, built };
  }

  it("defaults attachRpcInput to true (SDK default is false)", () => {
    const { sentry, trpcMiddleware } = makeSentry();

    createSentryTrpcMiddleware(sentry);

    expect(trpcMiddleware).toHaveBeenCalledTimes(1);
    expect(trpcMiddleware).toHaveBeenCalledWith({ attachRpcInput: true });
  });

  it("lets the caller opt out of attachRpcInput", () => {
    const { sentry, trpcMiddleware } = makeSentry();

    createSentryTrpcMiddleware(sentry, { attachRpcInput: false });

    expect(trpcMiddleware).toHaveBeenCalledWith({ attachRpcInput: false });
  });

  it("forwards forceTransaction alongside the default input flag", () => {
    const { sentry, trpcMiddleware } = makeSentry();

    createSentryTrpcMiddleware(sentry, { forceTransaction: true });

    expect(trpcMiddleware).toHaveBeenCalledWith({
      attachRpcInput: true,
      forceTransaction: true,
    });
  });

  it("returns the middleware the SDK produced", () => {
    const { sentry, built } = makeSentry();

    const middleware = createSentryTrpcMiddleware(sentry);

    expect(middleware).toBe(built);
  });
});
