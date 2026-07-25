import { describe, expect, it } from "vitest";
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
});

describe("SENTRY_WEBVITAL_SAMPLE_RATE", () => {
  it("defaults to 1.0 so INP is actually collected", async () => {
    const { SENTRY_WEBVITAL_SAMPLE_RATE } = await import("./sampling.js");
    expect(SENTRY_WEBVITAL_SAMPLE_RATE).toBe(1.0);
  });
});
