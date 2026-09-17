import * as Sentry from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";

import { REDACTED } from "./redaction.js";

type EnvelopeItem = [{ type: string }, Record<string, unknown>];

/**
 * The real server SDK, end to end: `initSentryServer` → SDK integrations → our
 * hooks → envelope. Pins GRO-1505 against SDK drift: a `@sentry/nextjs` bump
 * that writes a `runtime.name` / `os.name` missing from `SDK_CONTEXT_NAMES`
 * turns this red instead of blanking the tags in production. Runs on whatever
 * OS the suite runs on (CI: Ubuntu).
 */
describe("real @sentry/nextjs server SDK — runtime/os names (GRO-1505)", () => {
  it("keeps runtime.name and os.name on errors and transactions, redacts a lead name", async () => {
    // `SENTRY_ENABLED` is read from NODE_ENV at import time, and vitest sets
    // it to `test` (SDK disabled): stub it before loading the init helper.
    vi.stubEnv("NODE_ENV", "development");
    const { initSentryServer } = await import("./server.js");

    const items: EnvelopeItem[] = [];
    const transport = () => ({
      send: (envelope: [unknown, EnvelopeItem[]]) => {
        items.push(...envelope[1]);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    });
    initSentryServer({ app: "sdk-test", dsn: "https://key@o1.ingest.sentry.io/1", prisma: false, profiling: false, transport });

    Sentry.setContext("lead", { name: "Jean Dupont", status: "new" });
    Sentry.startSpan({ name: "GET /sdk-test", op: "http.server", forceTransaction: true }, () => {
      Sentry.captureException(new Error("boom"));
    });
    await Sentry.flush(5000);
    vi.unstubAllEnvs();

    const events = items.filter(([header]) => header.type === "event" || header.type === "transaction");
    expect(events.map(([header]) => header.type).sort()).toEqual(["event", "transaction"]);
    for (const [, payload] of events) {
      const contexts = payload.contexts as Record<string, Record<string, unknown>>;
      expect(contexts.runtime?.name).toBe("node");
      expect(contexts.os?.name).toEqual(expect.any(String));
      expect(contexts.os?.name).not.toBe(REDACTED);
      expect(contexts.lead).toEqual({ name: REDACTED, status: "new" });
    }
  }, 20_000);
});
