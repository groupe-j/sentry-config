import { describe, it, expect } from "vitest";
import { redact, isSensitive, REDACTED } from "./redaction.js";
import { createSentryBeforeSend, createSentryBeforeSendTransaction, scrubSentryEvent } from "./before-send.js";

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

describe("isSensitive — clés françaises des formulaires du portefeuille", () => {
  it.each([
    "nom",
    "Nom",
    "prenom",
    "prénom",
    "Prénom",
    "adresse",
    "commune",
    "codepostal",
    "code_postal",
    "codePostal",
    "code-postal",
    "Code Postal",
    "telephone",
    "téléphone",
    "tel",
    "tél",
    "portable",
    "ville",
    "raison_sociale",
    "raisonSociale",
    "Raison sociale",
    "siret",
    "SIRET",
  ])("redacts %s (case, accents and separators folded)", (key) => {
    expect(isSensitive(key)).toBe(true);
  });

  // Exact match after folding, never a substring: these share a prefix with a
  // PII key and must survive.
  it.each(["nombre", "nomenclature", "nomFichier", "dénomination", "telemetrie", "communication", "portabilite", "villeId"])(
    "keeps %s",
    (key) => {
      expect(isSensitive(key)).toBe(false);
    },
  );

  it("redacts the French PII of a form payload and nothing else", () => {
    expect(
      redact({
        prénom: "Jean",
        nom: "Dupont",
        code_postal: "57000",
        raisonSociale: "Dupont SARL",
        nombre: 3,
        nomenclature: "NAF 71.11Z",
      }),
    ).toEqual({
      prénom: REDACTED,
      nom: REDACTED,
      code_postal: REDACTED,
      raisonSociale: REDACTED,
      nombre: 3,
      nomenclature: "NAF 71.11Z",
    });
  });
});

describe("SDK-written runtime/os names survive key-name redaction (GRO-1505)", () => {
  // Shapes written by @sentry/node-core (client `runtime` option, context
  // integration `os`) and @sentry/vercel-edge (`runtime`). `name` there is
  // product metadata: redacting it empties the runtime.name / os.name tags.
  const sdkContexts = () => ({
    runtime: { name: "node", version: "v22.12.0" },
    os: { name: "Linux", version: "6.1", kernel_version: "6.1.0" },
    trace: { trace_id: "t1", span_id: "s1", op: "http.server" },
  });
  interface WithContexts {
    contexts: Record<string, Record<string, unknown>>;
  }
  const beforeSend: (event: Record<string, unknown>) => unknown = createSentryBeforeSend("test-app");
  const hooks: Record<string, (event: Record<string, unknown>) => unknown> = {
    beforeSend,
    beforeSendTransaction: createSentryBeforeSendTransaction<Record<string, unknown>>(),
    scrubSentryEvent: (e) => scrubSentryEvent(e),
  };

  for (const [hook, run] of Object.entries(hooks)) {
    it(`keeps runtime and os names — ${hook}`, () => {
      const out = run({ type: hook === "beforeSend" ? undefined : "transaction", contexts: sdkContexts() }) as WithContexts;
      expect(out.contexts).toEqual(sdkContexts());
    });
  }

  it.each(["vercel-edge", "cloudflare"])("keeps the %s runtime name", (name) => {
    const out = beforeSend({ contexts: { runtime: { name } } }) as WithContexts;
    expect(out.contexts.runtime!.name).toBe(name);
  });

  it.each(["Windows", "macOS", "Mac OS X", "Ubuntu Linux", "Alpine Linux", "Red Hat Linux"])("keeps the %s os name", (name) => {
    const out = beforeSend({ contexts: { os: { name } } }) as WithContexts;
    expect(out.contexts.os!.name).toBe(name);
  });

  it("redacts an app value written over the SDK's (setContext / captureException hint)", () => {
    // The node-core context integration merges `...event.contexts?.os` over its
    // own, so an app's `setContext("os", lead)` lands in the very same field —
    // and a bare name has no shape value scrubbing could catch.
    const out = beforeSend({
      contexts: { os: { name: "Jean Dupont", version: "6.1" }, runtime: { name: "jean.dupont@example.fr" } },
    }) as WithContexts;
    expect(out.contexts.os).toEqual({ name: REDACTED, version: "6.1" });
    expect(out.contexts.runtime).toEqual({ name: REDACTED });
  });

  it("matches SDK values exactly (no case folding, no prefix)", () => {
    for (const name of ["linux", "Linux Jean Dupont", "node ", "Node"]) {
      const out = beforeSend({ contexts: { os: { name }, runtime: { name } } }) as WithContexts;
      expect(out.contexts.os!.name).toBe(REDACTED);
      expect(out.contexts.runtime!.name).toBe(REDACTED);
    }
  });

  it("keeps an SDK name only in its own context", () => {
    const out = beforeSend({ contexts: { runtime: { name: "Linux" }, os: { name: "node" } } }) as WithContexts;
    expect(out.contexts.runtime!.name).toBe(REDACTED);
    expect(out.contexts.os!.name).toBe(REDACTED);
  });

  it("keeps redacting every other sensitive key inside an SDK context", () => {
    const out = beforeSend({
      contexts: { os: { name: "Linux", email: "jean@example.fr", description: "Linux", meta: { name: "Linux" } } },
    }) as WithContexts;
    expect(out.contexts.os).toEqual({ name: "Linux", email: REDACTED, description: REDACTED, meta: { name: REDACTED } });
  });

  it("redacts a non-string name in an SDK context", () => {
    const out = beforeSend({ contexts: { runtime: { name: ["node"] } } }) as WithContexts;
    expect(out.contexts.runtime!.name).toBe(REDACTED);
  });

  it("keeps redacting name in browser, device, app, culture, cloud_resource and trace contexts", () => {
    // No JS SDK writes browser/device before beforeSend (Relay derives them from
    // the User-Agent afterwards); on native SDKs device.name is the owner-given
    // name. The SDK writes no `name` in the others.
    const out = beforeSend({
      contexts: {
        browser: { name: "Chrome", version: "140.0" },
        device: { name: "iPhone de Jean Dupont", arch: "arm64" },
        app: { name: "node", app_start_time: "2026-09-17T00:00:00.000Z" },
        culture: { name: "Linux", locale: "fr-FR" },
        cloud_resource: { name: "Jean Dupont", "cloud.provider": "vercel" },
        trace: { name: "Jean Dupont", trace_id: "t1", data: { name: "Jean Dupont" } },
      },
    }) as WithContexts;
    expect(out.contexts.browser).toEqual({ name: REDACTED, version: "140.0" });
    expect(out.contexts.device).toEqual({ name: REDACTED, arch: "arm64" });
    expect(out.contexts.app!.name).toBe(REDACTED);
    expect(out.contexts.culture!.name).toBe(REDACTED);
    expect(out.contexts.cloud_resource!.name).toBe(REDACTED);
    expect(out.contexts.trace!.name).toBe(REDACTED);
    expect((out.contexts.trace!.data as Record<string, unknown>).name).toBe(REDACTED);
  });

  it("keeps redacting a lead name in extra, request.data, breadcrumbs and custom contexts", () => {
    const lead = () => ({ name: "Jean Dupont", status: "new" });
    const out = beforeSend({
      contexts: { ...sdkContexts(), lead: lead(), runtimeLead: lead() },
      extra: { lead: lead(), name: "Jean Dupont" },
      request: { data: { name: "Jean Dupont" } },
      breadcrumbs: [{ message: "lead", data: lead() }],
    }) as WithContexts & {
      extra: Record<string, Record<string, unknown> | string>;
      request: { data: Record<string, unknown> };
      breadcrumbs: { data: Record<string, unknown> }[];
    };
    expect(out.contexts.runtime!.name).toBe("node");
    expect(out.contexts.lead).toEqual({ name: REDACTED, status: "new" });
    expect(out.contexts.runtimeLead).toEqual({ name: REDACTED, status: "new" });
    expect(out.extra).toEqual({ lead: { name: REDACTED, status: "new" }, name: REDACTED });
    expect(out.request.data).toEqual({ name: REDACTED });
    expect(out.breadcrumbs[0]!.data).toEqual({ name: REDACTED, status: "new" });
    expect(JSON.stringify(out)).not.toContain("Jean Dupont");
  });

  it("survives context keys that are Object.prototype properties", () => {
    const event = JSON.parse('{"contexts":{"constructor":{"name":"node"},"__proto__":{"name":"node"}}}') as Record<string, unknown>;
    const out = beforeSend(event) as WithContexts & {
      tags: Record<string, unknown>;
    };
    expect(out.tags).toEqual({ app: "test-app" });
    expect(Object.getOwnPropertyDescriptor(out.contexts, "constructor")?.value).toEqual({ name: REDACTED });
  });

  it("keeps the cycle guard on an SDK context referenced twice", () => {
    const os: Record<string, unknown> = { name: "Linux" };
    const out = beforeSend({ contexts: { os, alias: os } }) as WithContexts;
    expect(out.contexts.os).toEqual({ name: "Linux" });
    expect(out.contexts.alias).toBe(REDACTED);
    const reversed = beforeSend({ contexts: { alias: os, os } }) as WithContexts;
    expect(reversed.contexts.alias).toEqual({ name: REDACTED });
    expect(reversed.contexts.os).toBe(REDACTED);
  });
});
