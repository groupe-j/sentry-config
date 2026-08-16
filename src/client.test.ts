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

describe("tracesSampleRate — GRO-869", () => {
  /** Effective rate for an ordinary route, read off the sampler `init` received. */
  function effectiveRate(): number {
    const sampler = initOptions().tracesSampler as (ctx: { name: string }) => number;
    return sampler({ name: "/vehicles" });
  }

  it("defaults to 100% in the browser — NOT the server's 10%", async () => {
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe" });
    expect(effectiveRate()).toBe(1.0);
  });

  it("is overridable per app, on both entry points", async () => {
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe", tracesSampleRate: 0.2 });
    expect(effectiveRate()).toBe(0.2);

    initMock.mockClear();
    const lazy = await loadLazy();
    lazy.initSentryClient({ app: "probe", tracesSampleRate: 0.2 });
    expect(effectiveRate()).toBe(0.2);
  });

  it("honours an explicit 0 instead of reading it as 'unset'", async () => {
    // A truthiness test here would turn "no browser tracing" into "trace
    // everything" — the loudest possible misreading of an opt-out.
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe", tracesSampleRate: 0 });
    expect(effectiveRate()).toBe(0);
  });

  it("0 stops pageloads but NOT web vitals — the documented decoupling", async () => {
    // Pinned because it is surprising and the JSDoc now promises it explicitly:
    // web-vital standalone spans ride their own rate and are settled before the
    // traces rate is consulted. "Web vitals only, no pageload traces" is a real
    // setting; a full stop additionally needs
    // NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE=0. If this ever changes, the
    // doc comment on `tracesSampleRate` has to change with it.
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe", tracesSampleRate: 0 });
    const sampler = initOptions().tracesSampler as (ctx: unknown) => number;
    expect(sampler({ name: "/x" })).toBe(0);
    for (const origin of [
      "auto.http.browser.inp",
      "auto.http.browser.cls",
      "auto.http.browser.lcp",
    ]) {
      expect(sampler({ attributes: { "sentry.origin": origin } }), origin).toBe(1.0);
    }
  });

  it("rejects an out-of-range rate loudly rather than clamping it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const bad of [10, -1, Number.NaN]) {
        initMock.mockClear();
        errorSpy.mockClear();
        stubBrowser();
        const { initSentryClient } = await loadEager();
        initSentryClient({ app: "probe", tracesSampleRate: bad });
        // Clamping 10 to 1 would ship the intended volume by accident; clamping
        // it to 0 would kill tracing. Neither is a decision the package gets to
        // make silently.
        expect(effectiveRate(), `bad=${String(bad)}`).toBe(1.0);
        expect(errorSpy).toHaveBeenCalled();
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("leaves the web-vital rate alone", async () => {
    stubBrowser();
    const { initSentryClient } = await loadEager();
    initSentryClient({ app: "probe", tracesSampleRate: 0.2 });
    const sampler = initOptions().tracesSampler as (ctx: unknown) => number;
    expect(sampler({ attributes: { "sentry.origin": "auto.http.browser.inp" } })).toBe(1.0);
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

  it("replayConsent refusé : rien n'est téléchargé, et Sentry reste actif", async () => {
    // Le cas qui bloquait l'adoption : erreurs sur intérêt légitime, Replay sur
    // consentement. `enabled` ne sait pas l'exprimer — il éteint tout.
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replayConsent: () => false });

    await new Promise((r) => setTimeout(r, 10));
    expect(lazyLoadIntegrationMock).not.toHaveBeenCalled();
    expect(addIntegrationMock).not.toHaveBeenCalled();
    // Sentry lui-même n'est PAS éteint : c'est toute la différence avec `enabled`.
    expect(initOptions().enabled).toBe(true);
  });

  it("replayConsent accordé : le Replay s'accroche normalement", async () => {
    stubBrowser({ idle: true, loaded: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replayConsent: () => true });

    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
    expect(lazyLoadIntegrationMock).toHaveBeenCalledWith("replayIntegration", undefined);
  });

  it("un refus NE CONSOMME PAS de tentative — un consentement tardif reste honoré", async () => {
    // Le vrai piège de cette option. La garde `attempts >= MAX_ATTEMPTS` borne
    // les reprises à 2. Si un refus comptait comme une tentative, DEUX refus
    // suffiraient à verrouiller la page : l'utilisateur qui accepte ensuite ne
    // serait plus jamais enregistré, par la garde même censée borner les échecs
    // réseau.
    //
    // ⚠️ Il faut bien DEUX refus avant le consentement pour que ce test
    // discrimine : avec un seul, le plafond n'est pas atteint et les deux
    // placements de la grille passent. Vérifié par mutation — la première
    // version de ce test ne mordait pas.
    let consenti = false;
    const { fireLoad } = stubBrowser({ idle: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replayConsent: () => consenti });

    // Refus n° 1 — déclencheur « idle après load ».
    fireLoad();
    await new Promise((r) => setTimeout(r, 10));
    // Refus n° 2 — déclencheur « première erreur ».
    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await new Promise((r) => setTimeout(r, 10));
    expect(lazyLoadIntegrationMock).not.toHaveBeenCalled();

    // L'utilisateur accepte, puis une nouvelle erreur survient : le Replay doit
    // encore pouvoir s'accrocher.
    consenti = true;
    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await vi.waitFor(() => expect(addIntegrationMock).toHaveBeenCalledTimes(1));
  });

  it("replayConsent est réévalué à CHAQUE déclencheur, pas mémorisé", async () => {
    const consent = vi.fn(() => false);
    const { fireLoad } = stubBrowser({ idle: true });
    const { initSentryClient } = await loadLazy();
    initSentryClient({ app: "probe", replayConsent: consent });

    fireLoad();
    await new Promise((r) => setTimeout(r, 10));
    clientHooks.beforeSendEvent?.({ exception: { values: [] } });
    await new Promise((r) => setTimeout(r, 10));

    // Deux déclencheurs, deux interrogations : une valeur mise en cache à
    // l'init rendrait le consentement impossible à accorder après coup.
    expect(consent.mock.calls.length).toBeGreaterThanOrEqual(2);
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

  /**
   * Build invariant, separate from the byte-size one above.
   *
   * `Sentry.captureCheckIn` / `Sentry.withMonitor` (crons) and
   * `Sentry.trpcMiddleware` (tRPC) do not exist in the browser build of
   * `@sentry/nextjs`. A bundler that has to resolve any of them against the
   * client condition fails the build outright — which is exactly what happened
   * to businessfamily on 2026-07-31, through the package **barrel**
   * (`index.ts` re-exports both). Client entry points must therefore stay clear
   * of them, and `armed.ts` — the module client code actually wants from the
   * barrel — must keep importing nothing at all so its own `/armed` subpath is
   * safe from every runtime.
   *
   * Verified against `@sentry/browser@10.68.0`: its `build/npm/types/exports.d.ts`
   * re-exports an *explicit named list* from `@sentry/core/browser` which
   * carries `captureException` but neither `captureCheckIn` nor `withMonitor` —
   * both live in `@sentry/core`'s `shared-exports`, off the browser list.
   */
  const SERVER_ONLY_SDK_MEMBERS = [
    "captureCheckIn",
    "withMonitor",
    "trpcMiddleware",
    "prismaIntegration",
  ] as const;

  it("no module reachable from a client entry touches a server-only SDK member", () => {
    for (const entry of ["client.ts", "client-lazy.ts", "armed.ts"]) {
      for (const f of localGraph(entry)) {
        for (const member of SERVER_ONLY_SDK_MEMBERS) {
          expect(code(f), `${entry} → ${f}: Sentry.${member}`).not.toMatch(
            new RegExp(`Sentry\\s*\\.\\s*${member}`),
          );
        }
      }
    }
  });

  it("armed.ts imports nothing, so /armed is safe from any runtime", () => {
    expect(localGraph("armed.ts")).toEqual(["armed.ts"]);
    expect(code("armed.ts")).not.toMatch(/^\s*import\b/m);
  });

  it("the barrel really does drag the server-only members (the hazard is real)", () => {
    // If this ever goes green-by-accident — because the barrel stopped
    // re-exporting crons/tRPC — the warnings pointing client code at /armed
    // become stale and should be removed rather than left to mislead.
    const barrel = localGraph("index.ts");
    expect(barrel).toContain("crons.ts");
    expect(barrel).toContain("trpc-middleware.ts");
    expect(code("crons.ts")).toMatch(/Sentry\s*\.\s*captureCheckIn/);
  });
});
