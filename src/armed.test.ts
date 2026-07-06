import { afterEach, describe, expect, it, vi } from "vitest";

import { assertSentryArmed, type SentryArmedLike } from "./armed.js";

function sentryWithDsn(dsn: unknown): SentryArmedLike {
  return { getClient: () => ({ getDsn: () => dsn }) };
}

const sentryNoClient: SentryArmedLike = { getClient: () => undefined };

describe("assertSentryArmed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true and stays quiet when a DSN is present", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

    const armed = assertSentryArmed(
      sentryWithDsn("https://abc@o1.ingest.sentry.io/1"),
    );

    expect(armed).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns false and logs loudly when the client has no DSN", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

    const armed = assertSentryArmed(sentryWithDsn(undefined));

    expect(armed).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("returns false and logs loudly when there is no client at all", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

    const armed = assertSentryArmed(sentryNoClient);

    expect(armed).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw by default when disarmed", () => {
    vi.spyOn(console, "error").mockImplementation(vi.fn());

    expect(() => assertSentryArmed(sentryNoClient)).not.toThrow();
  });

  it("throws when disarmed and throwOnMissing is true", () => {
    vi.spyOn(console, "error").mockImplementation(vi.fn());

    expect(() =>
      assertSentryArmed(sentryNoClient, { throwOnMissing: true }),
    ).toThrow(/sentry/i);
  });

  it("does not throw when armed even if throwOnMissing is true", () => {
    vi.spyOn(console, "error").mockImplementation(vi.fn());

    expect(() =>
      assertSentryArmed(sentryWithDsn("https://abc@o1.ingest.sentry.io/1"), {
        throwOnMissing: true,
      }),
    ).not.toThrow();
  });
});
