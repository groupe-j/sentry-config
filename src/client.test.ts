import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const addIntegrationMock = vi.fn();
const addBreadcrumbMock = vi.fn();
const replayIntegrationMock = vi.fn((opts: unknown) => ({ name: "Replay", opts }));
const browserTracingIntegrationMock = vi.fn((opts: unknown) => ({
  name: "BrowserTracing",
  opts,
}));
let clientHooks: Record<string, (...args: unknown[]) => void> = {};
const getClientMock = vi.fn(() => ({
  on: (hook: string, cb: (...args: unknown[]) => void) => {
    clientHooks[hook] = cb;
  },
}));

vi.mock("@sentry/nextjs", () => ({
  init: (...args: unknown[]): void => {
    initMock(...args);
  },
  addIntegration: (...args: unknown[]): void => {
    addIntegrationMock(...args);
  },
  addBreadcrumb: (...args: unknown[]): void => {
    addBreadcrumbMock(...args);
  },
  replayIntegration: (opts: unknown): unknown => replayIntegrationMock(opts),
  browserTracingIntegration: (opts: unknown): unknown => browserTracingIntegrationMock(opts),
  getClient: (): unknown => getClientMock(),
}));

/** The two globals `client.ts` feature-detects, typed so the lint stays clean. */
const globals = globalThis as unknown as {
  window?: FakeWindow;
  document?: { readyState: string };
};

interface FakeWindow {
  readyState?: string;
  requestIdleCallback?: (cb: () => void, opts?: unknown) => number;
  setTimeout: typeof setTimeout;
  addEventListener: (type: string, cb: () => void, opts?: unknown) => void;
}

/**
 * Minimal browser stubs. By default the page is still loading and there is no
 * idle callback, so nothing attaches until the test asks for it — otherwise a
 * pending dynamic import from one test lands in the next one.
 */
function stubBrowser(options: { idle?: boolean; loaded?: boolean } = {}): {
  fireLoad: () => void;
} {
  const listeners: Record<string, (() => void)[]> = {};
  const win: FakeWindow = {
    setTimeout,
    addEventListener: (type, cb) => {
      (listeners[type] ??= []).push(cb);
    },
  };
  if (options.idle) {
    win.requestIdleCallback = (cb) => {
      cb();
      return 1;
    };
  }
  globals.window = win;
  globals.document = { readyState: options.loaded ? "complete" : "loading" };
  return {
    fireLoad: () => listeners.load?.forEach((cb) => cb()),
  };
}

async function loadClient(buildEnv?: Record<string, string>) {
  vi.resetModules();
  // SENTRY_ENABLED is false under NODE_ENV=test; the lazy path is only armed
  // when Sentry is enabled, so simulate a production bundle.
  vi.stubEnv("NODE_ENV", "production");
  for (const [k, v] of Object.entries(buildEnv ?? {})) vi.stubEnv(k, v);
  return import("./client.js");
}

beforeEach(() => {
  initMock.mockClear();
  addIntegrationMock.mockClear();
  addBreadcrumbMock.mockClear();
  replayIntegrationMock.mockClear();
  browserTracingIntegrationMock.mockClear();
  getClientMock.mockClear();
  clientHooks = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete globals.window;
  delete globals.document;
});

function initOptions(): Record<string, unknown> {
  return initMock.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe("initSentryClient — INP", () => {
  it("always passes browserTracingIntegration with enableInp", async () => {
    stubBrowser();
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe" });

    expect(browserTracingIntegrationMock).toHaveBeenCalledWith({ enableInp: true });
    const integrations = initOptions().integrations as { name: string }[];
    expect(integrations.some((i) => i.name === "BrowserTracing")).toBe(true);
  });
});

describe("initSentryClient — replay modes", () => {
  it("default (true) keeps the eager integration and the 100% on-error rate", async () => {
    stubBrowser();
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe" });

    const integrations = initOptions().integrations as { name: string }[];
    expect(integrations.some((i) => i.name === "Replay")).toBe(true);
    expect(initOptions().replaysOnErrorSampleRate).toBe(1.0);
    expect(addIntegrationMock).not.toHaveBeenCalled();
  });

  it("false zeroes both replay rates (documented trap: no bytes saved)", async () => {
    stubBrowser();
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe", replay: false });

    const integrations = initOptions().integrations as { name: string }[];
    expect(integrations.some((i) => i.name === "Replay")).toBe(false);
    expect(initOptions().replaysOnErrorSampleRate).toBe(0);
    expect(initOptions().replaysSessionSampleRate).toBe(0);
    expect(addIntegrationMock).not.toHaveBeenCalled();
  });

  it("lazy keeps replaysOnErrorSampleRate at 1.0 — replay on error stays armed", async () => {
    stubBrowser();
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe", replay: "lazy" });

    expect(initOptions().replaysOnErrorSampleRate).toBe(1.0);
    expect(initOptions().replaysSessionSampleRate).toBe(0.1);
  });

  it("lazy does NOT reference replayIntegration at init time", async () => {
    stubBrowser();
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe", replay: "lazy" });

    const integrations = initOptions().integrations as { name: string }[];
    expect(integrations.some((i) => i.name === "Replay")).toBe(false);
    expect(replayIntegrationMock).not.toHaveBeenCalled();
  });

  it("lazy attaches replay once the page is idle, with the same masking options", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe", replay: "lazy", replayMaskAllText: false });

    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
    expect(replayIntegrationMock).toHaveBeenCalledWith({
      maskAllText: false,
      blockAllMedia: true,
    });
  });

  it("lazy attaches on the first captured error, before idle", async () => {
    const { fireLoad } = stubBrowser();
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe", replay: "lazy" });

    expect(addIntegrationMock).not.toHaveBeenCalled();
    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));

    // …and the later idle/load trigger must not attach a second time.
    fireLoad();
    await new Promise((r) => setTimeout(r, 10));
    expect(addIntegrationMock).toHaveBeenCalledTimes(1);
  });

  it("lazy ignores non-error events for the early trigger", async () => {
    stubBrowser();
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe", replay: "lazy" });

    clientHooks.beforeSendEvent?.({ type: "transaction" });
    await new Promise((r) => setTimeout(r, 10));
    expect(addIntegrationMock).not.toHaveBeenCalled();
  });

  it("does not schedule anything on the server (no window)", async () => {
    const { initSentryClient } = await loadClient();
    initSentryClient({ app: "probe", replay: "lazy" });

    await new Promise((r) => setTimeout(r, 10));
    expect(addIntegrationMock).not.toHaveBeenCalled();
  });
});

describe("initSentryClient — NEXT_PUBLIC_SENTRY_REPLAY_MODE=lazy (build-time)", () => {
  const buildLazy = { NEXT_PUBLIC_SENTRY_REPLAY_MODE: "lazy" };

  it("flips the default mode to lazy: no eager integration, replay attached later", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadClient(buildLazy);
    initSentryClient({ app: "probe" });

    const integrations = initOptions().integrations as { name: string }[];
    expect(integrations.some((i) => i.name === "Replay")).toBe(false);
    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
    expect(initOptions().replaysOnErrorSampleRate).toBe(1.0);
  });

  it("serves an explicit replay: true lazily rather than dropping it", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadClient(buildLazy);
    initSentryClient({ app: "probe", replay: true });

    const integrations = initOptions().integrations as { name: string }[];
    expect(integrations.some((i) => i.name === "Replay")).toBe(false);
    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
  });

  it("still honours replay: false", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadClient(buildLazy);
    initSentryClient({ app: "probe", replay: false });

    await new Promise((r) => setTimeout(r, 10));
    expect(addIntegrationMock).not.toHaveBeenCalled();
    expect(initOptions().replaysOnErrorSampleRate).toBe(0);
  });
});
