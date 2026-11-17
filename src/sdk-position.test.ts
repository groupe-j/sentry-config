import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { REDACTED_VALUE } from "./scrub.js";
import { createSentryTrpcMiddleware } from "./trpc-middleware.js";

type EnvelopeItem = [{ type: string }, Record<string, unknown>];

const LNG = "6.17592";
const LAT = "49.11963";
const ADDRESS_TYPED = "12 rue de la Paix";

/**
 * The real server SDK, end to end: what the SDK itself records (an outgoing
 * request's breadcrumb, the tRPC middleware's `contexts.trpc`) → our hooks →
 * envelope. Pins the shapes against SDK drift: a `@sentry/nextjs` bump that
 * moves the query or the procedure input to a field the hooks do not read
 * turns this red. One SDK init for the file; each test reads the events it
 * produced.
 */
describe("real @sentry/nextjs server SDK — position", () => {
  const items: EnvelopeItem[] = [];
  let server: Server | undefined;

  beforeAll(async () => {
    // `SENTRY_ENABLED` is read from NODE_ENV at import time (vitest: `test`).
    vi.stubEnv("NODE_ENV", "development");
    const { initSentryServer } = await import("./server.js");
    const transport = () => ({
      send: (envelope: [unknown, EnvelopeItem[]]) => {
        items.push(...envelope[1]);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    });
    initSentryServer({ app: "sdk-test", dsn: "https://key@o1.ingest.sentry.io/1", prisma: false, profiling: false, transport });
    vi.unstubAllEnvs();
  });
  afterAll(() => server?.close());

  /** The last error event whose exception value is `message`. */
  function eventFor(message: string): Record<string, unknown> | undefined {
    return items
      .filter(([header]) => header.type === "event")
      .map(([, payload]) => payload)
      .find((e) => JSON.stringify(e.exception).includes(message));
  }

  it("masks `geom` in the outgoing-request breadcrumb joined to a capture", async () => {
    server = createServer((_req, res) => {
      res.statusCode = 504;
      res.end("{}");
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const geom = encodeURIComponent(JSON.stringify({ type: "Point", coordinates: [Number(LNG), Number(LAT)] }));
    await fetch(`http://127.0.0.1:${port}/api/gpu/zone-urba?geom=${geom}&_limit=1`);
    Sentry.captureException(new Error("upstream 504"));
    await Sentry.flush(5000);

    const event = eventFor("upstream 504");
    const crumbs = (event?.breadcrumbs ?? []) as { category?: string; data?: Record<string, unknown> }[];
    const http = crumbs.find((b) => typeof b.data?.url === "string" && b.data.url.includes("/api/gpu/zone-urba"));
    // If the SDK stops recording the call, the test must say so rather than pass on nothing.
    expect(http, JSON.stringify(crumbs)).toBeDefined();
    expect(http?.data?.["http.query"]).toBe(`?geom=${REDACTED_VALUE}&_limit=1`);
    const serialised = decodeURIComponent(JSON.stringify(event));
    expect(serialised).not.toContain(LAT);
    expect(serialised).not.toContain(LNG);
  }, 20_000);

  it("masks the typed address in the input the SDK's `trpcMiddleware` attaches (`contexts.trpc.input`)", async () => {
    // The package's own wrapper (attachRpcInput: true by default) over the real SDK middleware.
    const middleware = createSentryTrpcMiddleware(Sentry);
    const inputs = [{ q: ADDRESS_TYPED, limit: 5 }, { 0: { json: { q: ADDRESS_TYPED } } }];
    for (const [i, input] of inputs.entries()) {
      await middleware({
        path: "dossier.suggest",
        type: "query",
        getRawInput: () => Promise.resolve(input),
        next: () => Promise.resolve({ ok: false, error: new Error(`suggest failed ${i}`) }),
      });
    }
    await Sentry.flush(5000);

    for (const i of [0, 1]) {
      const event = eventFor(`suggest failed ${i}`);
      const trpc = (event?.contexts as Record<string, Record<string, unknown>> | undefined)?.trpc;
      // The SDK's own field name: if it moves, this must go red, not pass on nothing.
      expect(trpc?.input, JSON.stringify(event?.contexts)).toBeDefined();
      expect(trpc?.procedure_path).toBe("dossier.suggest");
      expect(JSON.stringify(event)).not.toContain("Paix");
    }
    const first = (eventFor("suggest failed 0")?.contexts as Record<string, Record<string, unknown>>).trpc;
    expect(first?.input).toEqual({ q: REDACTED_VALUE, limit: 5 });
  }, 20_000);
});
