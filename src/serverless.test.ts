import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ServerlessModule from "./serverless.js";

/**
 * Both spies are hoisted: `vi.mock` factories run above ordinary `const`s.
 * `@sentry/nextjs` is mocked whole, but `./redaction.js` is NOT — so the real
 * `scrubHeaders` runs and the header-scrubbing assertions test real behaviour.
 */
const { captureMessageMock, flushMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn<(message: string, context?: unknown) => string>(),
  flushMock: vi.fn<(timeout?: number) => Promise<boolean>>(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, context?: unknown): string =>
    captureMessageMock(message, context),
  flush: (timeout?: number): Promise<boolean> => flushMock(timeout),
}));

/** The `captureContext` object the helper hands to `Sentry.captureMessage`. */
interface CaptureContext {
  level?: string;
  extra?: Record<string, unknown>;
}

async function loadServerless(): Promise<typeof ServerlessModule> {
  vi.resetModules();
  return import("./serverless.js");
}

/** The captureContext of the single capture the helper produced. */
function capturedContext(): CaptureContext {
  const call = captureMessageMock.mock.calls[0];
  if (!call) throw new Error("captureMessage was never called");
  return call[1] as CaptureContext;
}

/** A defer that records every promise handed to it — the runtime keep-alive. */
function recordingDefer(): { defer: (p: Promise<unknown>) => void; handed: Promise<unknown>[] } {
  const handed: Promise<unknown>[] = [];
  return { defer: (p) => handed.push(p), handed };
}

describe("signalServerless", () => {
  beforeEach(() => {
    captureMessageMock.mockReset();
    captureMessageMock.mockReturnValue("event-id");
    flushMock.mockReset();
    flushMock.mockResolvedValue(true);
  });

  it("captures the message exactly once", async () => {
    const { signalServerless } = await loadServerless();

    signalServerless("WebhookRecu à 0", vi.fn());

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0]?.[0]).toBe("WebhookRecu à 0");
  });

  it("captures at warning level by default", async () => {
    const { signalServerless } = await loadServerless();

    signalServerless("msg", vi.fn());

    expect(capturedContext().level).toBe("warning");
  });

  it("hands the flush promise to the injected defer — not orphaned", async () => {
    const { signalServerless } = await loadServerless();
    // The EXACT promise the transport drain returns. An orphaned flush (a bare
    // `Sentry.flush()` with no defer) is killed by the serverless freeze exactly
    // like the queue it was meant to drain — so the test pins the identity of
    // what defer received, not merely that flush was called.
    const flushPromise = Promise.resolve(true);
    flushMock.mockReturnValue(flushPromise);
    const { defer, handed } = recordingDefer();

    signalServerless("msg", defer);

    expect(handed).toHaveLength(1);
    expect(handed[0]).toBe(flushPromise);
  });

  it("bounds the flush at 2000ms by default", async () => {
    const { signalServerless } = await loadServerless();

    signalServerless("msg", vi.fn());

    expect(flushMock).toHaveBeenCalledTimes(1);
    expect(flushMock).toHaveBeenCalledWith(2000);
  });

  it("bounds the flush with a caller-supplied timeout", async () => {
    const { signalServerless } = await loadServerless();

    signalServerless("msg", vi.fn(), { flushTimeoutMs: 500 });

    expect(flushMock).toHaveBeenCalledWith(500);
  });

  it("captures before it flushes — the drain must see the queued event", async () => {
    const { signalServerless } = await loadServerless();
    const order: string[] = [];
    captureMessageMock.mockImplementation(() => {
      order.push("capture");
      return "event-id";
    });
    flushMock.mockImplementation(() => {
      order.push("flush");
      return Promise.resolve(true);
    });

    signalServerless("msg", vi.fn());

    expect(order).toEqual(["capture", "flush"]);
  });

  it("captures at the caller's level with the caller's extra", async () => {
    const { signalServerless } = await loadServerless();

    signalServerless("msg", vi.fn(), { level: "error", extra: { count: 0 } });

    const ctx = capturedContext();
    expect(ctx.level).toBe("error");
    expect(ctx.extra).toMatchObject({ count: 0 });
  });

  it("scrubs credential headers via scrubHeaders, keeping the rest", async () => {
    const { signalServerless } = await loadServerless();

    signalServerless("msg", vi.fn(), {
      headers: {
        authorization: "Bearer sk_live_secret",
        cookie: "session=abc",
        "content-type": "application/json",
      },
    });

    const headers = capturedContext().extra?.headers as Record<string, string>;
    expect(headers).toEqual({ "content-type": "application/json" });
  });

  it("still flushes even when no extra or headers are given", async () => {
    const { signalServerless } = await loadServerless();
    const { defer, handed } = recordingDefer();

    signalServerless("bare", defer);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(handed).toHaveLength(1);
  });

  it("never imports @vercel/functions — defer is injected, not imported", async () => {
    // The 🚨 of GRO-1072: importing waitUntil here would bind this shared,
    // platform-agnostic package to Vercel. defer must stay a parameter.
    const source = await readFile(
      fileURLToPath(new URL("./serverless.ts", import.meta.url)),
      "utf8",
    );
    // Strip comments first: the module doc carries a usage example that *does*
    // import waitUntil from @vercel/functions — that belongs in the docs. The
    // invariant is that no such import survives in actual code.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/@vercel\/functions/);
  });
});
