import { describe, it, expect } from "vitest";
import { createSentryBeforeSend } from "./before-send.js";

const beforeSend = createSentryBeforeSend("test-app");

describe("createSentryBeforeSend — browser-extension exceptions (dropped)", () => {
  it("drops an event whose exception frame is a browser-extension URL", () => {
    // Belt-and-suspenders for the leak shape denyUrls misses: an extension error
    // re-captured (e.g. via captureConsoleIntegration) whose synthesized stack still
    // points at the extension file, but whose top frame is the app's console call —
    // so SDK denyUrls never fires.
    const event = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "undefined is not an object",
            stacktrace: {
              frames: [{ filename: "safari-web-extension://ABC123/inject.js" }],
            },
          },
        ],
      },
    };
    expect(beforeSend(event)).toBeNull();
  });

  it("drops an event whose exception value mentions a chrome-extension URL", () => {
    const event = {
      exception: {
        values: [
          { type: "Error", value: "chrome-extension://xyz/content.js failed to load" },
        ],
      },
    };
    expect(beforeSend(event)).toBeNull();
  });

  it("keeps a first-party exception (no extension scheme) and still tags it", () => {
    const event = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read properties of undefined (reading 'id')",
            stacktrace: {
              frames: [{ filename: "https://app.example.com/_next/static/chunks/x.js" }],
            },
          },
        ],
      },
    };
    const out = beforeSend(event);
    expect(out).not.toBeNull();
    expect(out?.tags?.app).toBe("test-app");
  });

  it("keeps an event that merely mentions the word extension (no scheme)", () => {
    // Must NOT over-filter: free-text mentioning "extension" without a URL scheme
    // is a real error (the conservative rule: never drop a genuine user error).
    const event = {
      exception: {
        values: [{ type: "Error", value: "Unsupported file extension: .xyz" }],
      },
    };
    expect(beforeSend(event)).not.toBeNull();
  });
});

describe("createSentryBeforeSend — non-browser JS runtimes posing as Chrome (dropped)", () => {
  // Shape observed portfolio-wide (CORALY-6/-2, MEGAHOTE-T3-1H/-1G/-1A/-19,
  // RIDESAMUI-T3-19/-1H, BUSINESSFAMILY-C) : a headless scraper built on
  // deno_core ("Obscura") that sends a "Chrome 145 / Windows" user agent, runs
  // the page in its own runtime and crashes inside it — `reading 'toLowerCase'`
  // / `reading 'toObject'` on the home page, 0 users impacted. Its stack holds
  // frames no real browser can produce: `ext:core/…` (deno_core internal module
  // specifiers) and `<obscura:bootstrap>`.
  const obscuraEvent = (frames: { filename: string }[]) => ({
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Cannot read properties of undefined (reading 'toLowerCase')",
          stacktrace: { frames },
        },
      ],
    },
  });

  it("drops an event with a deno_core `ext:core/` frame", () => {
    const event = obscuraEvent([
      { filename: "https://megahote.com/_next/static/chunks/main.js" },
      { filename: "ext:core/01_core.js" },
    ]);
    expect(beforeSend(event)).toBeNull();
  });

  it("drops an event with an `<obscura:…>` bootstrap frame", () => {
    const event = obscuraEvent([
      { filename: "<obscura:bootstrap>" },
      { filename: "<script>" },
    ]);
    expect(beforeSend(event)).toBeNull();
  });

  it("drops it when the marker is only in abs_path", () => {
    const event = {
      exception: {
        values: [
          { type: "TypeError", value: "x", stacktrace: { frames: [{ abs_path: "ext:deno_web/02_timers.js" }] } },
        ],
      },
    };
    expect(beforeSend(event)).toBeNull();
  });

  it("keeps an inline `<script>` / `<anonymous>` frame — real browsers emit those", () => {
    const event = obscuraEvent([{ filename: "<script>" }, { filename: "<anonymous>" }]);
    expect(beforeSend(event)).not.toBeNull();
  });

  it("keeps a first-party file whose PATH merely contains `ext:core`", () => {
    // Anchored on the scheme: only a specifier that STARTS with `ext:` is a
    // runtime-internal module — never a URL that happens to contain the text.
    const event = obscuraEvent([{ filename: "https://app.example.com/docs/ext:core/01_core.js" }]);
    expect(beforeSend(event)).not.toBeNull();
  });

  it("keeps an error whose message merely mentions obscura", () => {
    const event = { exception: { values: [{ type: "Error", value: "<obscura:bootstrap> is not a valid tag" }] } };
    expect(beforeSend(event)).not.toBeNull();
  });
});
