import { afterEach, describe, expect, it, vi } from "vitest";
import { createTracesSampler } from "./sampling.js";

describe("createTracesSampler", () => {
  const sampler = createTracesSampler(0.1, 1.0);

  it("returns the default rate for a normal route", () => {
    expect(sampler({ name: "/vehicles" })).toBe(0.1);
  });

  it("drops health probes and static assets", () => {
    expect(sampler({ name: "GET /api/health" })).toBe(0);
    expect(sampler({ name: "/_next/static/chunks/main.js" })).toBe(0);
    expect(sampler({ request: { url: "https://x.fr/logo.svg" } })).toBe(0);
  });

  it("samples INP standalone spans at the web-vital rate, not the traces rate", () => {
    const rate = sampler({
      name: "body > button.cta",
      attributes: {
        "sentry.origin": "auto.http.browser.inp",
        "sentry.op": "ui.interaction.click",
      },
    });
    expect(rate).toBe(1.0);
  });

  it("does NOT let URL patterns eat an INP span whose element selector ends like a file", () => {
    // htmlTreeAsString() yields DOM selectors, e.g. a MapLibre container:
    // without the web-vital branch, /\.(?:…|map|css|js)$/ matched and returned 0.
    const rate = sampler({
      name: "div#root > div.map",
      attributes: { "sentry.origin": "auto.http.browser.inp" },
    });
    expect(rate).toBe(1.0);
  });

  it("recognises a web vital by its op alone", () => {
    expect(
      sampler({ name: "div.leaflet.css", attributes: { "sentry.op": "ui.interaction.press" } }),
    ).toBe(1.0);
  });

  it("keeps skipping low-value routes even when attributes are present", () => {
    expect(
      sampler({ name: "/api/health", attributes: { "sentry.op": "http.server" } }),
    ).toBe(0);
  });

  it("honours a custom web-vital rate", () => {
    const dialedDown = createTracesSampler(0.1, 0.25);
    expect(dialedDown({ attributes: { "sentry.origin": "auto.http.browser.inp" } })).toBe(0.25);
  });

  it("does NOT treat fetch-stream spans as web vitals", () => {
    // FetchStreamPerformance tags spans `auto.http.browser.stream` and they can
    // become root spans. A `auto.http.browser.` PREFIX test would sample all
    // SSE/streaming traffic at the web-vital rate (100%) instead of 10%.
    expect(
      sampler({
        name: "GET /api/chat",
        attributes: {
          "sentry.origin": "auto.http.browser.stream",
          "sentry.op": "http.client.stream",
        },
      }),
    ).toBe(0.1);
  });

  it("does not treat ordinary pageload/navigation spans as web vitals", () => {
    expect(
      sampler({ name: "/vehicles", attributes: { "sentry.origin": "auto.pageload.browser" } }),
    ).toBe(0.1);
    expect(
      sampler({ name: "/vehicles", attributes: { "sentry.origin": "auto.navigation.browser" } }),
    ).toBe(0.1);
  });

  it("accepts the cls and lcp standalone origins too", () => {
    for (const origin of ["auto.http.browser.cls", "auto.http.browser.lcp"]) {
      expect(sampler({ attributes: { "sentry.origin": origin } })).toBe(1.0);
    }
  });
});

describe("web-vital rate parsing (parseRate)", () => {
  async function rateFor(raw: string | undefined): Promise<number> {
    vi.resetModules();
    if (raw === undefined) vi.stubEnv("NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE", "");
    else vi.stubEnv("NEXT_PUBLIC_SENTRY_WEBVITAL_SAMPLE_RATE", raw);
    const mod = await import("./sampling.js");
    return mod.SENTRY_WEBVITAL_SAMPLE_RATE;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("falls back to 1.0 for a declared-but-EMPTY env var", async () => {
    // Number("") === 0, a valid rate — left unguarded this silently re-creates
    // the "INP is empty everywhere" bug the web-vital rate exists to fix.
    expect(await rateFor("")).toBe(1.0);
    expect(await rateFor("   ")).toBe(1.0);
  });

  it("falls back to 1.0 for garbage and out-of-range values", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const raw of ["abc", "2", "-1", "NaN", "Infinity"]) {
        errorSpy.mockClear();
        expect(await rateFor(raw), `raw=${JSON.stringify(raw)}`).toBe(1.0);
        // Refusing a value the operator explicitly set is not something to do
        // quietly — same rule as the traces rate.
        expect(errorSpy, `raw=${JSON.stringify(raw)}`).toHaveBeenCalled();
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("accepts a real explicit rate, including an explicit 0", async () => {
    expect(await rateFor("0.25")).toBe(0.25);
    expect(await rateFor("1")).toBe(1);
    // An explicit "0" is a deliberate opt-out and must be honoured.
    expect(await rateFor("0")).toBe(0);
  });
});

describe("SENTRY_WEBVITAL_SAMPLE_RATE", () => {
  it("defaults to 1.0 so INP is actually collected", async () => {
    const { SENTRY_WEBVITAL_SAMPLE_RATE } = await import("./sampling.js");
    expect(SENTRY_WEBVITAL_SAMPLE_RATE).toBe(1.0);
  });
});

describe("SENTRY_BROWSER_TRACES_SAMPLE_RATE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to 1.0 — 10% starves the browser tier to zero", async () => {
    const { SENTRY_BROWSER_TRACES_SAMPLE_RATE } = await import("./sampling.js");
    expect(SENTRY_BROWSER_TRACES_SAMPLE_RATE).toBe(1.0);
  });

  it("stays at 1.0 in PRODUCTION while the server rate drops to 0.1", async () => {
    // The whole point of GRO-869, and the only environment where the two rates
    // differ — so this is the assertion that actually guards the fix. The
    // server tier keeps 10% (calibrated on ~35k transactions/month of crons +
    // http.server on the loudest app); the browser tier, two orders of
    // magnitude smaller, is no longer starved by it. If these two ever collapse
    // back into one constant, this test goes red.
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./sampling.js");
    expect(mod.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
    expect(mod.SENTRY_BROWSER_TRACES_SAMPLE_RATE).toBe(1.0);
  });

  it("is overridable via NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, including 0", async () => {
    for (const [raw, expected] of [
      ["0.2", 0.2],
      ["0", 0],
      ["1", 1],
    ] as const) {
      vi.resetModules();
      vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", raw);
      const mod = await import("./sampling.js");
      expect(mod.SENTRY_BROWSER_TRACES_SAMPLE_RATE, `raw=${raw}`).toBe(expected);
    }
  });

  it("falls back to 1.0 on an empty or out-of-range env var", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const raw of ["", "   ", "abc", "2", "-1"]) {
        vi.resetModules();
        vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", raw);
        const mod = await import("./sampling.js");
        expect(mod.SENTRY_BROWSER_TRACES_SAMPLE_RATE, `raw=${JSON.stringify(raw)}`).toBe(1.0);
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("says so out loud when a non-blank value is refused", async () => {
    // This env var is documented as THE no-deploy way to dial an app down. An
    // operator typing `0,2` (decimal comma) or `20%` to cut volume by 5× would
    // otherwise land on the 1.0 default with nothing in the logs — the opposite
    // of the intent, silently. Blank stays silent: blank means "unset".
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const raw of ["0,2", "20%", "abc", "2", "-1"]) {
        vi.resetModules();
        errorSpy.mockClear();
        vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", raw);
        const mod = await import("./sampling.js");
        expect(mod.SENTRY_BROWSER_TRACES_SAMPLE_RATE, `raw=${raw}`).toBe(1.0);
        expect(errorSpy, `raw=${raw}`).toHaveBeenCalled();
        expect(String(errorSpy.mock.calls[0]?.[0]), `raw=${raw}`).toContain(
          "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
        );
      }

      for (const raw of ["", "   ", "0.2"]) {
        vi.resetModules();
        errorSpy.mockClear();
        vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", raw);
        await import("./sampling.js");
        expect(errorSpy, `raw=${JSON.stringify(raw)} must stay silent`).not.toHaveBeenCalled();
      }
    } finally {
      errorSpy.mockRestore();
    }
  });
});
