import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as CronsModule from "./crons.js";

/**
 * The single spy every check-in flows through. `vi.hoisted` is required because
 * `vi.mock` factories are hoisted above ordinary `const` declarations.
 */
const { captureCheckInMock } = vi.hoisted(() => ({
  captureCheckInMock: vi.fn<(checkIn: unknown, monitorConfig?: unknown) => string>(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureCheckIn: (checkIn: unknown, monitorConfig?: unknown): string =>
    captureCheckInMock(checkIn, monitorConfig),

  /**
   * Faithful re-implementation of the SDK's own `withMonitor`
   * (`@sentry/core@10.68.0`, `build/esm/exports.js`), routed through the same
   * spy. It exists so that a test failing against the *old* implementation
   * fails on the status it asserts — not on a missing export. That is what
   * makes the red meaningful: `withMonitor` really does point "ok" when the
   * handler returns a 500.
   */
  withMonitor: <T>(monitorSlug: string, callback: () => T, upsertMonitorConfig?: unknown): T => {
    const checkInId = captureCheckInMock(
      { monitorSlug, status: "in_progress" },
      upsertMonitorConfig,
    );
    const finishCheckIn = (status: "ok" | "error"): void => {
      captureCheckInMock({ monitorSlug, status, checkInId, duration: 0 });
    };
    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback();
    } catch (e) {
      finishCheckIn("error");
      throw e;
    }
    const thenable = maybePromiseResult as unknown as { then?: unknown };
    if (thenable && typeof thenable.then === "function") {
      return (maybePromiseResult as unknown as Promise<unknown>).then(
        (r) => {
          finishCheckIn("ok");
          return r;
        },
        (e: unknown) => {
          finishCheckIn("error");
          throw e;
        },
      ) as unknown as T;
    }
    finishCheckIn("ok");
    return maybePromiseResult;
  },
}));

const SLUG = "megahote-generate-blog";
const OPTIONS = { schedule: "0 6 * * *" };

/** Shape of the check-in objects the wrapper hands to the SDK. */
interface CapturedCheckIn {
  monitorSlug: string;
  status: "in_progress" | "ok" | "error";
  checkInId?: string;
  duration?: number;
}

async function loadCrons(): Promise<typeof CronsModule> {
  vi.resetModules();
  return import("./crons.js");
}

/** A handler that resolves with `value` — non-async, so no bare `async` lint. */
function resolving<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value);
}

/** The check-ins the wrapper produced, in order. */
function checkIns(): CapturedCheckIn[] {
  return captureCheckInMock.mock.calls.map((call) => call[0] as CapturedCheckIn);
}

/** The terminal ("ok"/"error") check-in — the one that decides the cron's fate. */
function terminalCheckIn(): CapturedCheckIn {
  const all = checkIns();
  expect(all.length).toBeGreaterThanOrEqual(2);
  const last = all[all.length - 1];
  if (!last) throw new Error("no terminal check-in was captured");
  return last;
}

describe("withCronMonitor", () => {
  beforeEach(() => {
    captureCheckInMock.mockReset();
    let n = 0;
    captureCheckInMock.mockImplementation(() => `check-in-${++n}`);
  });

  it("points in_progress before running the handler, carrying the monitor config", async () => {
    const { withCronMonitor } = await loadCrons();
    const order: string[] = [];
    captureCheckInMock.mockImplementation((checkIn) => {
      order.push(`checkin:${(checkIn as CapturedCheckIn).status}`);
      return "check-in-1";
    });

    await withCronMonitor(
      SLUG,
      () => {
        order.push("handler");
        return Promise.resolve(new Response("ok"));
      },
      OPTIONS,
    )();

    expect(order).toEqual(["checkin:in_progress", "handler", "checkin:ok"]);
    const firstCall = captureCheckInMock.mock.calls[0];
    expect(firstCall?.[1]).toEqual({
      schedule: { type: "crontab", value: "0 6 * * *" },
      maxRuntime: 30,
      checkinMargin: 5,
      timezone: "UTC",
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    });
  });

  it("points error when the handler RETURNS a 500 Response", async () => {
    const { withCronMonitor } = await loadCrons();

    await withCronMonitor(SLUG, resolving(new Response(null, { status: 500 })), OPTIONS)();

    expect(terminalCheckIn().status).toBe("error");
  });

  it("hands the caller back the very same 500 Response, status preserved", async () => {
    const { withCronMonitor } = await loadCrons();
    const failure = new Response(null, { status: 500 });

    const returned = await withCronMonitor(SLUG, resolving(failure), OPTIONS)();

    expect(returned).toBe(failure);
    expect(returned.status).toBe(500);
  });

  it("points ok when the handler returns a 200 Response", async () => {
    const { withCronMonitor } = await loadCrons();

    await withCronMonitor(SLUG, resolving(new Response("done", { status: 200 })), OPTIONS)();

    expect(terminalCheckIn().status).toBe("ok");
  });

  it("points error and rethrows when the handler throws synchronously", async () => {
    const { withCronMonitor } = await loadCrons();
    const boom = new Error("boom");
    const throwing = (): Promise<Response> => {
      throw boom;
    };

    await expect(withCronMonitor(SLUG, throwing, OPTIONS)()).rejects.toBe(boom);

    expect(terminalCheckIn().status).toBe("error");
  });

  it("points error and rethrows when the handler rejects", async () => {
    const { withCronMonitor } = await loadCrons();
    const boom = new Error("rejected");

    await expect(
      withCronMonitor(SLUG, (): Promise<Response> => Promise.reject(boom), OPTIONS)(),
    ).rejects.toBe(boom);

    expect(terminalCheckIn().status).toBe("error");
  });

  it("points ok when the handler returns a plain object, not a Response", async () => {
    const { withCronMonitor } = await loadCrons();

    const returned = await withCronMonitor(SLUG, resolving({ status: 500 }), OPTIONS)();

    expect(terminalCheckIn().status).toBe("ok");
    expect(returned).toEqual({ status: 500 });
  });

  it("points ok when the handler returns undefined, without throwing", async () => {
    const { withCronMonitor } = await loadCrons();

    const returned = await withCronMonitor(SLUG, resolving(undefined), OPTIONS)();

    expect(terminalCheckIn().status).toBe("ok");
    expect(returned).toBeUndefined();
  });

  it("points error on a 503", async () => {
    const { withCronMonitor } = await loadCrons();

    await withCronMonitor(SLUG, resolving(new Response(null, { status: 503 })), OPTIONS)();

    expect(terminalCheckIn().status).toBe("error");
  });

  it("points error on a 599", async () => {
    const { withCronMonitor } = await loadCrons();

    await withCronMonitor(SLUG, resolving(new Response(null, { status: 599 })), OPTIONS)();

    expect(terminalCheckIn().status).toBe("error");
  });

  it("points ok on a 499 — the bound is >= 500, not 'contains a 5'", async () => {
    const { withCronMonitor } = await loadCrons();

    await withCronMonitor(SLUG, resolving(new Response(null, { status: 499 })), OPTIONS)();

    expect(terminalCheckIn().status).toBe("ok");
  });

  it("threads the in_progress check-in id into the terminal check-in", async () => {
    const { withCronMonitor } = await loadCrons();
    captureCheckInMock.mockReturnValue("the-check-in-id");

    await withCronMonitor(SLUG, resolving(new Response(null, { status: 500 })), OPTIONS)();

    const terminal = terminalCheckIn();
    expect(terminal.checkInId).toBe("the-check-in-id");
    expect(terminal.monitorSlug).toBe(SLUG);
  });
});
