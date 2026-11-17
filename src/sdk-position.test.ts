import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/nextjs";
import { afterAll, describe, expect, it, vi } from "vitest";

import { REDACTED_VALUE } from "./scrub.js";

type EnvelopeItem = [{ type: string }, Record<string, unknown>];

const LNG = "6.17592";
const LAT = "49.11963";

/**
 * The real server SDK, end to end: an outgoing `fetch` with a position in its
 * query → the SDK's own breadcrumb (`url` + `http.query`) → our hooks →
 * envelope. Pins the shape the SDK records against drift: a `@sentry/nextjs`
 * bump that moves the query to a field the hooks do not read turns this red.
 */
describe("real @sentry/nextjs server SDK — outgoing request position", () => {
  let server: Server | undefined;
  afterAll(() => server?.close());

  it("masks `geom` in the outgoing-request breadcrumb joined to a capture", async () => {
    server = createServer((_req, res) => {
      res.statusCode = 504;
      res.end("{}");
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

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

    const geom = encodeURIComponent(JSON.stringify({ type: "Point", coordinates: [Number(LNG), Number(LAT)] }));
    await fetch(`http://127.0.0.1:${port}/api/gpu/zone-urba?geom=${geom}&_limit=1`);
    Sentry.captureException(new Error("upstream 504"));
    await Sentry.flush(5000);
    vi.unstubAllEnvs();

    const event = items.find(([header]) => header.type === "event")?.[1];
    const crumbs = (event?.breadcrumbs ?? []) as { category?: string; data?: Record<string, unknown> }[];
    const http = crumbs.find((b) => typeof b.data?.url === "string" && b.data.url.includes("/api/gpu/zone-urba"));
    // If the SDK stops recording the call, the test must say so rather than pass on nothing.
    expect(http, JSON.stringify(crumbs)).toBeDefined();
    expect(http?.data?.["http.query"]).toBe(`?geom=${REDACTED_VALUE}&_limit=1`);
    const serialised = decodeURIComponent(JSON.stringify(event));
    expect(serialised).not.toContain(LAT);
    expect(serialised).not.toContain(LNG);
  }, 20_000);
});
