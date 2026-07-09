import { describe, it, expect } from "vitest";
import { redact, isSensitive, REDACTED } from "./redaction.js";
import { createSentryBeforeSend } from "./before-send.js";

describe("isSensitive — lead PII keys (M5, RGPD)", () => {
  it("flags name / location / description (exact key)", () => {
    expect(isSensitive("name")).toBe(true);
    expect(isSensitive("location")).toBe(true);
    expect(isSensitive("description")).toBe(true);
  });

  it("flags firstName / lastName / phone / address", () => {
    expect(isSensitive("firstName")).toBe(true);
    expect(isSensitive("lastName")).toBe(true);
    expect(isSensitive("phone")).toBe(true);
    expect(isSensitive("address")).toBe(true);
  });

  it("normalises case / separators for the new keys", () => {
    expect(isSensitive("Name")).toBe(true);
    expect(isSensitive("full_name")).toBe(true); // fullname
    expect(isSensitive("first-name")).toBe(true); // firstname
  });

  it("does NOT over-redact technical keys that merely contain 'name'", () => {
    // Exact-key match must not fire on substrings.
    expect(isSensitive("filename")).toBe(false);
    expect(isSensitive("hostname")).toBe(false);
    expect(isSensitive("username")).toBe(false);
    expect(isSensitive("appName")).toBe(false);
    expect(isSensitive("componentName")).toBe(false);
  });

  it("does NOT redact legitimate non-PII keys", () => {
    expect(isSensitive("id")).toBe(false);
    expect(isSensitive("status")).toBe(false);
    expect(isSensitive("count")).toBe(false);
    expect(isSensitive("url")).toBe(false);
  });
});

describe("redact — lead object", () => {
  it("masks name / location / description / phone in a nested lead", () => {
    const out = redact({
      lead: {
        id: "lead_123",
        name: "Jean Dupont",
        location: "Metz",
        description: "cherche un terrain constructible",
        phone: "+33612345678",
        status: "new",
      },
    }) as { lead: Record<string, unknown> };

    expect(out.lead.name).toBe(REDACTED);
    expect(out.lead.location).toBe(REDACTED);
    expect(out.lead.description).toBe(REDACTED);
    expect(out.lead.phone).toBe(REDACTED);
    // Non-PII survives untouched.
    expect(out.lead.id).toBe("lead_123");
    expect(out.lead.status).toBe("new");
  });
});

describe("createSentryBeforeSend — lead PII in extra/contexts (M5)", () => {
  const beforeSend = createSentryBeforeSend<Record<string, unknown>>("test-app");

  it("redacts lead PII attached to event.extra", () => {
    const out = beforeSend({
      extra: { name: "Jean Dupont", location: "Metz", description: "note", phone: "+33612345678" },
    }) as { extra: Record<string, unknown> };

    expect(out.extra.name).toBe(REDACTED);
    expect(out.extra.location).toBe(REDACTED);
    expect(out.extra.description).toBe(REDACTED);
    expect(out.extra.phone).toBe(REDACTED);
  });

  it("redacts lead PII attached to event.contexts (deep)", () => {
    const out = beforeSend({
      contexts: {
        lead: { name: "Jean Dupont", location: "Metz", description: "note", status: "new" },
      },
    }) as { contexts: { lead: Record<string, unknown> } };

    expect(out.contexts.lead.name).toBe(REDACTED);
    expect(out.contexts.lead.location).toBe(REDACTED);
    expect(out.contexts.lead.description).toBe(REDACTED);
    expect(out.contexts.lead.status).toBe("new");
  });

  it("does not touch a legitimate non-PII context field", () => {
    const out = beforeSend({
      contexts: { trace: { trace_id: "abc123", op: "http.server" } },
    }) as { contexts: { trace: Record<string, unknown> } };

    expect(out.contexts.trace.trace_id).toBe("abc123");
    expect(out.contexts.trace.op).toBe("http.server");
  });
});
