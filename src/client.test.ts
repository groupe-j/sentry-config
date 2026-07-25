import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const addIntegrationMock = vi.fn();
const addBreadcrumbMock = vi.fn();
const setTagMock = vi.fn();
const replayIntegrationMock = vi.fn((opts: unknown) => ({ name: "Replay", opts }));
const browserTracingIntegrationMock = vi.fn((opts: unknown) => ({
  name: "BrowserTracing",
  opts,
}));
/** Resolution of `lazyLoadIntegration`, swappable per test. */
let lazyLoadResult: () => Promise<unknown> = () =>
  Promise.resolve((opts: unknown) => replayIntegrationMock(opts));
const lazyLoadIntegrationMock = vi.fn((_name: string, _nonce?: string) => lazyLoadResult());

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
  setTag: (...args: unknown[]): void => {
    setTagMock(...args);
  },
  replayIntegration: (opts: unknown): unknown => replayIntegrationMock(opts),
  browserTracingIntegration: (opts: unknown): unknown => browserTracingIntegrationMock(opts),
  lazyLoadIntegration: (name: string, nonce?: string): unknown =>
    lazyLoadIntegrationMock(name, nonce),
  getClient: (): unknown => getClientMock(),
}));

/** The two globals the client feature-detects, typed so the lint stays clean. */
const globals = globalThis as unknown as {
  window?: FakeWindow;
  document?: { readyState: string };
};

interface FakeWindow {
  requestIdleCallback?: (cb: () => void, opts?: unknown) => number;
  setTimeout: typeof setTimeout;
  addEventListener: (type: string, cb: () => void, opts?: unknown) => void;
}

/**
 * Minimal browser stubs. By default the page is still loading and there is no
 * idle callback, so nothing attaches until the test asks for it — otherwise a
 * pending attach from one test lands in the next one.
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

/**
 * SENTRY_ENABLED is false under NODE_ENV=test, and the lazy path is only armed
 * when Sentry is enabled — so simulate a production bundle.
 */
async function loadEager() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  return import("./client.js");
}

async function loadLazy() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  return import("./client-lazy.js");
}

beforeEach(() => {
  initMock.mockClear();
  addIntegrationMock.mockClear();
  addBreadcrumbMock.mockClear();
  setTagMock.mockClear();
  replayIntegrationMock.mockClear();
  browserTracingIntegrationMock.mockClear();
  lazyLoadIntegrationMock.mockClear();
  getClientMock.mockClear();
  clientHooks = {};
  lazyLoadResult = () => Promise.resolve((opts: unknown) => replayIntegrationMock(opts));
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete globals.window;
  delete globals.document;
});

function initOptions(): Record<string, unknown> {
  return initMock.mock.calls[0]?.[0] as Record<string, unknown>;
}

function integrationNames(): string[] {
  return (initOptions().integrations as { name: string }[]).map((i) => i.name);
}

describe("INP — the reason web vitals were missing", () => {
  it("passes browserTracingIntegration with enableInp on both entry points", async () => {
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe" });
    expect(browserTracingIntegrationMock).toHaveBeenCalledWith({ enableInp: true });
    expect(integrationNames()).toContain("BrowserTracing");

    initMock.mockClear();
    browserTracingIntegrationMock.mockClear();
    const lazy = await loadLazy();
    lazy.initSentryClient({ app: "probe" });
    expect(browserTracingIntegrationMock).toHaveBeenCalledWith({ enableInp: true });
    expect(integrationNames()).toContain("BrowserTracing");
  });
});

describe("/client — eager entry point (unchanged behaviour)", () => {
  it("default (true) keeps the eager integration and the 100% on-error rate", async () => {
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe" });

    expect(integrationNames()).toContain("Replay");
    expect(initOptions().replaysOnErrorSampleRate).toBe(1.0);
    expect(addIntegrationMock).not.toHaveBeenCalled();
    expect(lazyLoadIntegrationMock).not.toHaveBeenCalled();
  });

  it("false zeroes both replay rates (documented trap: no bytes saved)", async () => {
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe", replay: false });

    expect(integrationNames()).not.toContain("Replay");
    expect(initOptions().replaysOnErrorSampleRate).toBe(0);
    expect(initOptions().replaysSessionSampleRate).toBe(0);
    expect(addIntegrationMock).not.toHaveBeenCalled();
  });

  it("still forwards every non-replay option (dsn, tunnel, pii, ignoreErrors)", async () => {
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({
      app: "probe",
      dsn: "https://x@o1.ingest.sentry.io/2",
      tunnel: "/monitoring",
      sendDefaultPii: true,
      ignoreErrors: ["MyCustomNoise"],
    });

    const o = initOptions();
    expect(o.dsn).toBe("https://x@o1.ingest.sentry.io/2");
    expect(o.tunnel).toBe("/monitoring");
    expect(o.sendDefaultPii).toBe(true);
    expect(o.ignoreErrors).toContain("MyCustomNoise");
    expect(typeof o.tracesSampler).toBe("function");
    expect(typeof o.beforeSend).toBe("function");
  });

  it("honours the enabled gate and never schedules a lazy attach when off", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe", replay: "lazy", enabled: () => false });

    expect(initOptions().enabled).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(lazyLoadIntegrationMock).not.toHaveBeenCalled();
  });
});

describe("/client-lazy — lazy entry point", () => {
  it("defaults to lazy: no eager Replay, on-error rate still 1.0", async () => {
    stubBrowser();
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe" });

    expect(integrationNames()).not.toContain("Replay");
    expect(replayIntegrationMock).not.toHaveBeenCalled();
    // The honesty requirement: an error must still be able to produce a replay.
    expect(initOptions().replaysOnErrorSampleRate).toBe(1.0);
    expect(initOptions().replaysSessionSampleRate).toBe(0.1);
  });

  it("attaches from the CDN once the page is idle, with the same masking options", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replayMaskAllText: false });

    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
    expect(lazyLoadIntegrationMock).toHaveBeenCalledWith("replayIntegration", undefined);
    expect(replayIntegrationMock).toHaveBeenCalledWith({
      maskAllText: false,
      blockAllMedia: true,
    });
  });

  it("forwards a CSP nonce to the injected script", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replayScriptNonce: "n0nc3" });

    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
    expect(lazyLoadIntegrationMock).toHaveBeenCalledWith("replayIntegration", "n0nc3");
  });

  it("passes replayCdnBaseUrl through to Sentry.init as cdnBaseUrl", async () => {
    stubBrowser();
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replayCdnBaseUrl: "https://cdn.example.com" });

    expect(initOptions().cdnBaseUrl).toBe("https://cdn.example.com");
  });

  it("attaches on the first captured error, before idle, and only once", async () => {
    const { fireLoad } = stubBrowser();
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe" });

    expect(addIntegrationMock).not.toHaveBeenCalled();
    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));

    // …and the later idle/load trigger must not attach a second time.
    fireLoad();
    await new Promise((r) => setTimeout(r, 10));
    expect(addIntegrationMock).toHaveBeenCalledTimes(1);
    expect(lazyLoadIntegrationMock).toHaveBeenCalledTimes(1);
  });

  it("ignores non-error events for the early trigger", async () => {
    stubBrowser();
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe" });

    clientHooks.beforeSendEvent?.({ type: "transaction" });
    await new Promise((r) => setTimeout(r, 10));
    expect(lazyLoadIntegrationMock).not.toHaveBeenCalled();
  });

  it("survives a blocked CDN: breadcrumb, no throw, no second capture path", async () => {
    lazyLoadResult = () => Promise.reject(new Error("blocked by client"));
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe" });

    await vi.waitFor(() => expect(addBreadcrumbMock).toHaveBeenCalledTimes(1));
    expect(addBreadcrumbMock.mock.calls[0]?.[0]).toMatchObject({
      category: "sentry.replay",
      level: "warning",
    });
    expect(addIntegrationMock).not.toHaveBeenCalled();
    // Queryable signal, so a portfolio-wide CDN/version breakage is findable
    // without waiting for an unrelated error to carry the breadcrumb.
    expect(setTagMock).toHaveBeenCalledWith("replay.lazy", "failed");
  });

  it("retries on the idle trigger after the error-triggered attempt failed", async () => {
    // The error trigger can fire during boot on a congested network. Burning
    // the single chance there would kill the idle attempt that would have won.
    let calls = 0;
    lazyLoadResult = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("transient"))
        : Promise.resolve((opts: unknown) => replayIntegrationMock(opts));
    };
    const { fireLoad } = stubBrowser({ idle: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe" });

    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await vi.waitFor(() => expect(addBreadcrumbMock).toHaveBeenCalledTimes(1));
    expect(addIntegrationMock).not.toHaveBeenCalled();

    fireLoad();
    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
  });

  it("gives up after the retry cap rather than hammering the CDN", async () => {
    lazyLoadResult = () => Promise.reject(new Error("blocked"));
    const { fireLoad } = stubBrowser({ idle: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe" });

    // Wait for each failure to SETTLE before firing the next trigger —
    // otherwise the in-flight guard, not the cap, is what stops the call.
    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await vi.waitFor(() => expect(addBreadcrumbMock).toHaveBeenCalledTimes(1));

    fireLoad();
    await vi.waitFor(() => expect(addBreadcrumbMock).toHaveBeenCalledTimes(2));
    expect(lazyLoadIntegrationMock).toHaveBeenCalledTimes(2);

    // Cap reached: a third trigger must not fetch again.
    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await new Promise((r) => setTimeout(r, 10));
    expect(lazyLoadIntegrationMock).toHaveBeenCalledTimes(2);
  });

  it("replay: false disables replay entirely and fetches nothing", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replay: false });

    await new Promise((r) => setTimeout(r, 10));
    expect(initOptions().replaysOnErrorSampleRate).toBe(0);
    expect(initOptions().replaysSessionSampleRate).toBe(0);
    expect(lazyLoadIntegrationMock).not.toHaveBeenCalled();
  });

  it("does not schedule anything on the server (no window)", async () => {
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe" });

    await new Promise((r) => setTimeout(r, 10));
    expect(lazyLoadIntegrationMock).not.toHaveBeenCalled();
  });
});

/**
 * The entire ~39 KB gzip saving rests on one static property: no module
 * reachable from `client-lazy.ts` may touch `Sentry.replayIntegration`. That is
 * invisible at runtime and would be silently undone by a stray import, so it is
 * asserted on the source text itself.
 */
describe("bundle-size invariant — client-lazy must never reference replayIntegration", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  /** Strip comments and doc blocks: prose may legitimately name the API. */
  const code = (f: string): string =>
    readFileSync(path.join(here, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  /**
   * Walks the whole local import graph from an entry, so a NEW module that
   * leaks Replay is caught too — checking only the two files we happen to know
   * about today would rot the moment someone adds a third.
   */
  function localGraph(entry: string): string[] {
    const seen = new Set<string>();
    const walk = (f: string): void => {
      if (seen.has(f)) return;
      seen.add(f);
      const src = code(f);
      // Static `from "./x.js"` and dynamic `import("./x.js")` alike: both keep
      // the target reachable, and reachability is what pins the bytes.
      for (const m of src.matchAll(/from\s*["']\.\/([^"']+)\.js["']/g)) walk(`${m[1]}.ts`);
      for (const m of src.matchAll(/import\(\s*["']\.\/([^"']+)\.js["']\s*\)/g)) walk(`${m[1]}.ts`);
    };
    walk(entry);
    return [...seen];
  }

  it("reaches the modules we expect (guards the walker itself)", () => {
    const graph = localGraph("client-lazy.ts");
    expect(graph).toContain("client-core.ts");
    expect(graph).toContain("sampling.ts");
    expect(graph).toContain("before-send.ts");
    expect(graph).not.toContain("client.ts");
  });

  it("no module reachable from client-lazy.ts touches replayIntegration", () => {
    for (const f of localGraph("client-lazy.ts")) {
      const src = code(f);
      // Member access, destructuring and computed access all pin the bytes.
      expect(src, `${f}: Sentry.replayIntegration member access`).not.toMatch(
        /Sentry\s*\.\s*replayIntegration/,
      );
      expect(src, `${f}: computed access to replayIntegration`).not.toMatch(
        /\[\s*["']replayIntegration["']\s*\]/,
      );
      expect(src, `${f}: replayIntegration destructured off the SDK`).not.toMatch(
        /\{[^}]*\breplayIntegration\b[^}]*\}\s*=/,
      );
      expect(src, `${f}: replayIntegration imported by name`).not.toMatch(
        /import\s*\{[^}]*\breplayIntegration\b[^}]*\}\s*from/,
      );
    }
  });

  it("client.ts is the single place that references it", () => {
    expect(code("client.ts")).toMatch(/Sentry\s*\.\s*replayIntegration/);
  });
});
