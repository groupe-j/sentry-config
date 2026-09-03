import { describe, it, expect } from "vitest";
import { DEFAULT_IGNORED_ERRORS } from "./ignored.js";

/**
 * Mirrors how the Sentry SDK matches `ignoreErrors` against an error message:
 * a string entry matches by substring, a RegExp entry by `.test()`.
 */
function isIgnored(message: string): boolean {
  return DEFAULT_IGNORED_ERRORS.some((pattern) =>
    typeof pattern === "string" ? message.includes(pattern) : pattern.test(message),
  );
}

describe("DEFAULT_IGNORED_ERRORS — DOM reconciliation noise (translation extensions)", () => {
  it("ignores the canonical Google-Translate removeChild / insertBefore errors", () => {
    // Real messages observed on the portfolio (PRONOSTIC-2W / -2V).
    expect(
      isIgnored(
        "NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
      ),
    ).toBe(true);
    expect(
      isIgnored(
        "NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
      ),
    ).toBe(true);
  });

  it("does NOT swallow a genuine app-thrown NotFoundError with a different message", () => {
    // A real domain error must still reach Sentry — the filter is message-scoped,
    // not a blanket `NotFoundError` type ignore.
    expect(isIgnored("NotFoundError: reservation 42 not found")).toBe(false);
    expect(isIgnored("NotFoundError: user profile does not exist")).toBe(false);
  });
});
