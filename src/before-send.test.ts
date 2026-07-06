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
