import { describe, it, expect } from "vitest";
import {
  createSentryBeforeSend,
  createSentryBeforeSendLog,
  createSentryBeforeSendTransaction,
  SCRUB_FAILED_TAG,
  type SentryEventLike,
} from "./before-send.js";
import { REDACTED } from "./redaction.js";
import {
  REDACTED_VALUE,
  isSecretName,
  isSecretParam,
  scrubCookies,
  scrubQueryString,
  scrubRequestData,
  scrubText,
} from "./scrub.js";

const EMAIL = "jean.dupont@example.com";
const TOKEN = "Zk3pQ8vN2mR7tY4wX9bC6dF1gH5jL0sA";

// ─── Realistic fixtures ────────────────────────────────────────────────────

/** Exactly what drizzle-orm 0.45 builds: `Failed query: ${query}\nparams: ${params}`. */
function drizzleMessage(query: string, params: unknown[]): string {
  // Array#toString, exactly what the template literal in drizzle-orm does.
  return `Failed query: ${query}\nparams: ${params.toString()}`;
}

const DRIZZLE_VERIFICATION = drizzleMessage(
  'insert into "verification" ("id", "identifier", "value", "expires_at") values ($1, $2, $3, $4)',
  ["vrf_01J9", TOKEN, `{"email":"${EMAIL}","name":""}`, "2026-09-17T10:05:00.000Z"],
);

const DRIZZLE_RATE_LIMIT = drizzleMessage(
  'select "count" from "rate_limit" where "key" = $1',
  [`magic-link:${EMAIL}`],
);

/** Postgres `detail` as surfaced by pg / neon on a unique violation (P2002 underneath Prisma). */
const PG_UNIQUE_DETAIL = `duplicate key value violates unique constraint "users_email_key"\nKey (email)=(${EMAIL}) already exists.`;

/** Prisma argument dump (PrismaClientValidationError / KnownRequestError P2002 with args). */
const PRISMA_P2002 = `
Invalid \`prisma.user.create()\` invocation in
/var/task/src/server/auth.ts:42:21

  39 export async function register(input) {
→ 42   await prisma.user.create({
         data: {
           email: "${EMAIL}",
           phone: "+33612345678",
           resetToken: "${TOKEN}",
           role: "MEMBER"
         }
       })

Unique constraint failed on the fields: (\`email\`)`;

const MAGIC_LINK_URL = `https://app.example.com/api/auth/magic-link/verify?token=${TOKEN}&callbackURL=%2Fdashboard`;

// ─── scrubText ─────────────────────────────────────────────────────────────

describe("scrubText — ORM errors", () => {
  it("redacts DrizzleQueryError params but keeps the SQL", () => {
    const out = scrubText(DRIZZLE_VERIFICATION);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('insert into "verification"');
    expect(out).toBe(
      'Failed query: insert into "verification" ("id", "identifier", "value", "expires_at") values ($1, $2, $3, $4)\nparams: [redacted]',
    );
  });

  it("redacts a rate-limit key built from the address", () => {
    const out = scrubText(DRIZZLE_RATE_LIMIT);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('from "rate_limit" where "key" = $1');
  });

  it("stops the params redaction at the first stack line of a `stack` string", () => {
    const stack = `DrizzleQueryError: ${DRIZZLE_RATE_LIMIT}\n    at NeonPreparedQuery.queryWithCache (/var/task/node_modules/drizzle-orm/neon-serverless/session.js:40:11)`;
    const out = scrubText(stack);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain("at NeonPreparedQuery.queryWithCache");
  });

  it("redacts a param value that itself spans several lines", () => {
    const out = scrubText(drizzleMessage("update x set note = $1", [`line one\n${EMAIL}\nline three`]));
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("line three");
  });

  it("redacts the Postgres constraint detail value, keeps the column", () => {
    const out = scrubText(PG_UNIQUE_DETAIL);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('violates unique constraint "users_email_key"');
    expect(out).toContain("Key (email)=([redacted]) already exists.");
    // A value with no recognisable shape: only the `Key (…)=(…)` pattern sees it.
    expect(scrubText("Key (last_name, city)=(Dupont, Metz) already exists.")).toBe(
      "Key (last_name, city)=([redacted]) already exists.",
    );
    expect(scrubText('Key (owner_id)=(usr_42) is not present in table "users".')).toBe(
      'Key (owner_id)=([redacted]) is not present in table "users".',
    );
  });

  it("redacts values in a Prisma argument dump, keeps the diagnosis", () => {
    const out = scrubText(PRISMA_P2002);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("+33612345678");
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('role: "MEMBER"');
    expect(out).toContain("Unique constraint failed on the fields: (`email`)");
    expect(out).toContain("/var/task/src/server/auth.ts:42:21");
  });
});

describe("scrubText — URLs, credentials, keys", () => {
  it("redacts magic-link token in a URL, keeps path and other params", () => {
    const out = scrubText(MAGIC_LINK_URL);
    expect(out).toBe(
      "https://app.example.com/api/auth/magic-link/verify?token=[redacted]&callbackURL=%2Fdashboard",
    );
  });

  it("redacts OAuth code, fragment access_token and URL-encoded email", () => {
    expect(scrubText("GET /callback?code=4/0AfJohXkL9pQ2&state=abc")).toBe(
      "GET /callback?code=[redacted]&state=abc",
    );
    expect(scrubText("https://x.io/#access_token=abc.def.ghi&expires_in=3600")).toBe(
      "https://x.io/#access_token=[redacted]&expires_in=3600",
    );
    expect(scrubText("/unsubscribe?to=jean.dupont%40example.com")).not.toContain("example.com");
  });

  it("keeps short diagnostic values of weak names (code=500, key=theme)", () => {
    expect(scrubText("upstream failed: status code=500")).toBe("upstream failed: status code=500");
    expect(scrubText("cache miss for key=theme")).toBe("cache miss for key=theme");
  });

  it("redacts Bearer tokens but keeps `Bearer undefined` (a real diagnostic)", () => {
    expect(scrubText(`Authorization: Bearer ${TOKEN}`)).toBe("Authorization: Bearer [redacted]");
    expect(scrubText("got header Bearer undefined")).toBe("got header Bearer undefined");
    expect(scrubText("Basic authentication is disabled")).toBe("Basic authentication is disabled");
  });

  it("redacts well-known secret prefixes and JWTs", () => {
    for (const secret of [
      "sk_live_51HxYzAbCdEfGhIjKlMn",
      "pk_test_51HxYzAbCdEfGhIjKlMn",
      "npg_AbC123dEf456",
      "whsec_AbCdEfGhIjKlMnOpQrStUv",
      "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx",
      "ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    ]) {
      const out = scrubText(`request failed with key ${secret} (401)`);
      expect(out, secret).toBe("request failed with key [redacted] (401)");
    }
  });

  it("redacts the password of a connection string, keeps host and database", () => {
    // No `npg_` prefix on purpose: the URL-credentials pattern alone must catch it
    // (the email pattern would otherwise swallow `password@host`).
    expect(scrubText("connect ECONNREFUSED postgres://app_user:S3cr3tPw@ep-x.eu-central-1.aws.neon.tech/app")).toBe(
      "connect ECONNREFUSED postgres://app_user:[redacted]@ep-x.eu-central-1.aws.neon.tech/app",
    );
  });

  it("leaves ordinary error messages byte-identical", () => {
    for (const msg of [
      "Cannot read properties of undefined (reading 'id')",
      "Invalid token: expired",
      "Unique constraint failed on the fields: (`email`)",
      "TRPCError: UNAUTHORIZED",
      "fetch failed: getaddrinfo ENOTFOUND api.stripe.com",
      "Request failed with status code 502",
      "Module not found: Can't resolve '@sentry+nextjs@10.65.0_next@16.3.3/node_modules/next/dist/server.js'",
      'select "id" from "users" where "id" = $1 limit $2',
      "Unsupported file extension: .xyz",
    ]) {
      expect(scrubText(msg)).toBe(msg);
    }
  });
});

describe("isSecretName / isSecretParam", () => {
  it("keeps weak names URL-only: `code` as an object key or JSON field is a diagnostic", () => {
    expect(isSecretName("code")).toBe(false);
    expect(scrubText('{"code":"ERR_INVALID_ARG_TYPE","message":"bad"}')).toBe(
      '{"code":"ERR_INVALID_ARG_TYPE","message":"bad"}',
    );
    const out = createSentryBeforeSend("a")({ contexts: { node: { code: "ERR_INVALID_ARG_TYPE", tokenCount: 3 } } });
    expect(out!.contexts).toEqual({ node: { code: "ERR_INVALID_ARG_TYPE", tokenCount: 3 } });
  });

  it("flags credential names regardless of value length", () => {
    expect(isSecretParam("token", "x")).toBe(true);
    expect(isSecretParam("refresh_token", "abc")).toBe(true);
    expect(isSecretParam("X-Amz-Signature", "ab12")).toBe(true);
    expect(isSecretParam("email", EMAIL)).toBe(true);
  });

  it("does not flag diagnostics or already-redacted values", () => {
    expect(isSecretParam("page", "2")).toBe(false);
    expect(isSecretParam("callbackURL", "/dashboard")).toBe(false);
    expect(isSecretParam("token", REDACTED_VALUE)).toBe(false);
    expect(isSecretParam("code", "500")).toBe(false);
  });
});

// ─── Request parts ─────────────────────────────────────────────────────────

describe("scrubRequestData", () => {
  it("parses a JSON string body, redacts by key AND by value, re-serialises", () => {
    const body = JSON.stringify({
      email: EMAIL,
      callbackURL: "/dashboard",
      meta: { note: `contact me at ${EMAIL}`, magicToken: TOKEN, attempts: 2 },
    });
    const out = scrubRequestData(body);
    expect(typeof out).toBe("string");
    const parsed = JSON.parse(out as string) as {
      email: unknown;
      callbackURL: unknown;
      meta: { note: unknown; magicToken: unknown; attempts: unknown };
    };
    expect(parsed.email).toBe(REDACTED);
    expect(parsed.callbackURL).toBe("/dashboard");
    expect(parsed.meta.note).toBe(`contact me at ${REDACTED_VALUE}`);
    expect(parsed.meta.magicToken).toBe(REDACTED_VALUE);
    expect(parsed.meta.attempts).toBe(2);
  });

  it("falls back to text scrubbing on JSON truncated by the SDK body cap", () => {
    const truncated = `{"email":"${EMAIL}","phone":"+33612345678","token":"${TOKEN}","items":[{"id":1},{"i`;
    const out = scrubRequestData(truncated) as string;
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("+33612345678");
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('"items":[{"id":1}');
  });

  it("scrubs a form-urlencoded body", () => {
    expect(scrubRequestData(`email=jean.dupont%40example.com&password=hunter22&remember=1`)).toBe(
      "email=[redacted]&password=[redacted]&remember=1",
    );
  });

  it("walks an object body", () => {
    const out = scrubRequestData({ user: { email: EMAIL, bio: `mail ${EMAIL}` } }) as {
      user: Record<string, unknown>;
    };
    expect(out.user.email).toBe(REDACTED);
    expect(out.user.bio).toBe(`mail ${REDACTED_VALUE}`);
  });

  it("survives a pathologically deep JSON body without throwing", () => {
    const deep = "[".repeat(5000) + "]".repeat(5000);
    expect(() => scrubRequestData(deep)).not.toThrow();
  });
});

describe("scrubQueryString / scrubCookies", () => {
  it("handles the three query_string shapes", () => {
    expect(scrubQueryString(`token=${TOKEN}&page=2`)).toBe("token=[redacted]&page=2");
    expect(scrubQueryString({ token: TOKEN, page: "2" })).toEqual({ token: REDACTED_VALUE, page: "2" });
    expect(scrubQueryString([["code", "4/0AfJohXkL9pQ2"], ["page", "2"]])).toEqual([
      ["code", REDACTED_VALUE],
      ["page", "2"],
    ]);
  });

  it("keeps cookie names, drops every value", () => {
    expect(scrubCookies({ "better-auth.session_token": TOKEN, theme: "dark" })).toEqual({
      "better-auth.session_token": REDACTED,
      theme: REDACTED,
    });
    expect(scrubCookies(`session=${TOKEN}; theme=dark`)).toBe("session=[redacted]; theme=[redacted]");
  });
});

// ─── beforeSend end-to-end ─────────────────────────────────────────────────

const beforeSend = createSentryBeforeSend<SentryEventLike & Record<string, unknown>>("test-app");

function drizzleEvent(): SentryEventLike & Record<string, unknown> {
  return {
    event_id: "abc",
    level: "error",
    message: `Failed to send magic link: ${DRIZZLE_RATE_LIMIT}`,
    logentry: { message: `send failed for ${EMAIL}`, params: [EMAIL] },
    transaction: "POST /api/auth/sign-in/magic-link",
    tags: { recipient: EMAIL, area: "auth" },
    exception: {
      values: [
        // Linked `cause` comes first (Sentry orders root cause last).
        { type: "error", value: PG_UNIQUE_DETAIL },
        {
          type: "DrizzleQueryError",
          value: DRIZZLE_VERIFICATION,
          stacktrace: {
            frames: [
              {
                filename: "/var/task/src/lib/magic-link-send.ts",
                vars: { email: EMAIL, url: MAGIC_LINK_URL, attempt: 1 },
              },
              { filename: "/var/task/node_modules/drizzle-orm/neon-serverless/session.js" },
            ],
          },
        },
      ],
    },
    request: {
      url: MAGIC_LINK_URL,
      query_string: `token=${TOKEN}&callbackURL=%2Fdashboard`,
      cookies: { "better-auth.session_token": TOKEN },
      data: JSON.stringify({ email: EMAIL, callbackURL: "/dashboard" }),
      headers: { authorization: `Bearer ${TOKEN}`, "user-agent": "Mozilla/5.0" },
    },
    breadcrumbs: [
      { message: `[auth] APIError 5xx ${DRIZZLE_RATE_LIMIT}`, data: { arguments: [{ message: DRIZZLE_RATE_LIMIT }] } },
      { message: "fetch", data: { url: MAGIC_LINK_URL, method: "GET", status_code: 200 } },
    ],
    extra: { detail: String(PG_UNIQUE_DETAIL), leadId: "lead_1" },
    contexts: { trace: { trace_id: "t1", op: "http.server" } },
  };
}

describe("createSentryBeforeSend — no PII leaves the process", () => {
  it("scrubs a realistic Drizzle magic-link failure everywhere it surfaces", () => {
    const out = beforeSend(drizzleEvent());
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain(EMAIL);
    expect(serialised).not.toContain(TOKEN);
    expect(serialised).not.toContain("jean.dupont");
  });

  it("keeps what makes the error diagnosable", () => {
    const out = beforeSend(drizzleEvent())!;
    const [cause, root] = out.exception!.values!;
    expect(cause!.value).toContain('violates unique constraint "users_email_key"');
    expect(root!.type).toBe("DrizzleQueryError");
    expect(root!.value).toContain('insert into "verification"');
    expect(root!.stacktrace!.frames![0]!.filename).toBe("/var/task/src/lib/magic-link-send.ts");
    expect(root!.stacktrace!.frames![0]!.vars!.attempt).toBe(1);
    expect(out.request!.url).toBe(
      "https://app.example.com/api/auth/magic-link/verify?token=[redacted]&callbackURL=%2Fdashboard",
    );
    expect(out.request!.headers).toEqual({ "user-agent": "Mozilla/5.0" });
    expect(out.transaction).toBe("POST /api/auth/sign-in/magic-link");
    expect(out.tags).toEqual({ recipient: REDACTED_VALUE, area: "auth", app: "test-app" });
    expect(out.extra!.leadId).toBe("lead_1");
    expect(out.contexts).toEqual({ trace: { trace_id: "t1", op: "http.server" } });
    expect((out.breadcrumbs![1]!.data as Record<string, unknown>).status_code).toBe(200);
    expect(out.event_id).toBe("abc");
  });

  it("does not mutate the input event (Replay and other integrations read it after)", () => {
    const input = drizzleEvent();
    const snapshot = structuredClone(input);
    beforeSend(input);
    expect(input).toEqual(snapshot);
  });

  it("walks a cyclic and a pathologically deep extra without failing closed", () => {
    const cyclic: Record<string, unknown> = { email: EMAIL };
    cyclic.self = cyclic;
    let deep: Record<string, unknown> = { note: EMAIL };
    for (let i = 0; i < 20_000; i++) deep = { next: deep };
    const out = beforeSend({ extra: { cyclic, deep } })!;
    expect(out.tags).toEqual({ app: "test-app" });
    expect(JSON.stringify(out)).not.toContain(EMAIL);
  });

  it("returns the same text instance when there is nothing to scrub", () => {
    const msg = "Cannot read properties of undefined (reading 'id')";
    expect(scrubText(msg)).toBe(msg);
  });

  it("fails closed — never sends raw, never drops — when scrubbing throws", () => {
    const hostile = drizzleEvent();
    Object.defineProperty(hostile, "extra", {
      enumerable: true,
      get() {
        return new Proxy({}, { ownKeys: () => { throw new Error("boom"); } });
      },
    });
    const out = beforeSend(hostile)!;
    expect(out).not.toBeNull();
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain(EMAIL);
    expect(serialised).not.toContain(TOKEN);
    expect(out.tags).toEqual({ app: "test-app", [SCRUB_FAILED_TAG]: "true" });
    expect(out.exception!.values!.map((v) => v.type)).toEqual(["error", "DrizzleQueryError"]);
    expect(out.exception!.values![1]!.stacktrace!.frames![0]).toEqual({
      filename: "/var/task/src/lib/magic-link-send.ts",
    });
    expect(out.event_id).toBe("abc");
  });
});

describe("createSentryBeforeSendTransaction", () => {
  const beforeSendTransaction = createSentryBeforeSendTransaction<SentryEventLike & Record<string, unknown>>();

  it("scrubs request, span descriptions and credential span attributes", () => {
    const out = beforeSendTransaction({
      type: "transaction",
      transaction: "GET /api/auth/magic-link/verify",
      request: { url: MAGIC_LINK_URL, query_string: `token=${TOKEN}` },
      spans: [
        {
          description: `GET https://api.resend.com/emails?to=${encodeURIComponent(EMAIL)}`,
          data: {
            "http.query": `?token=${TOKEN}`,
            "http.request.header.cookie": `session=${TOKEN}`,
            "http.request.header.authorization": `Bearer ${TOKEN}`,
            "http.response.status_code": 200,
          },
        },
        { description: 'select "id" from "users" where "email" = $1', data: { "db.system": "postgresql" } },
      ],
    });
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain(TOKEN);
    expect(serialised).not.toContain("jean.dupont");
    expect(out.spans![1]!.description).toBe('select "id" from "users" where "email" = $1');
    expect((out.spans![0]!.data as Record<string, unknown>)["http.response.status_code"]).toBe(200);
    expect((out.spans![0]!.data as Record<string, unknown>)["http.request.header.cookie"]).toBe(REDACTED);
    expect(out.tags).toBeUndefined();
  });
});

describe("createSentryBeforeSendLog", () => {
  const beforeSendLog = createSentryBeforeSendLog();

  it("scrubs the message (string or ParameterizedString) and attributes", () => {
    const parameterized = new String(`magic link failed: ${DRIZZLE_RATE_LIMIT}`);
    const out = beforeSendLog({
      level: "error",
      message: parameterized,
      attributes: { "sentry.message.parameter.0": EMAIL, "user.email": EMAIL, route: "/api/auth" },
    } as never) as { message: unknown; attributes: Record<string, unknown> };
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(out.message).toContain('from "rate_limit"');
    expect(out.attributes.route).toBe("/api/auth");
  });
});

// ─── Cost ──────────────────────────────────────────────────────────────────

describe("cost", () => {
  it("stays linear on adversarial strings (no catastrophic backtracking)", () => {
    const inputs = [
      "a".repeat(100_000) + "@",
      "a.".repeat(50_000) + "@x",
      "params: " + "x".repeat(100_000),
      "Key (" + "a".repeat(100_000),
      '"token": "' + "a".repeat(100_000),
      "x=".repeat(50_000),
      "Bearer " + "a".repeat(100_000),
      "postgres://" + "a".repeat(100_000) + ":",
    ];
    for (const input of inputs) {
      const start = performance.now();
      scrubText(input);
      expect(performance.now() - start, input.slice(0, 20)).toBeLessThan(250);
    }
  });

  it("scrubs a large event in a few milliseconds", () => {
    const big = drizzleEvent();
    big.breadcrumbs = Array.from({ length: 100 }, (_, i) => ({
      message: i % 10 === 0 ? `[auth] ${DRIZZLE_RATE_LIMIT}` : `GET /api/items/${i} 200`,
      data: { url: `https://app.example.com/api/items/${i}?page=${i}`, method: "GET", status_code: 200 },
    }));
    big.request!.data = JSON.stringify({
      items: Array.from({ length: 400 }, (_, i) => ({ id: i, label: `Item number ${i}`, owner: `u${i}@example.com` })),
    });
    big.contexts = {
      ...big.contexts,
      os: { name: "Linux", version: "6.1" },
      runtime: { name: "node", version: "v22.9.0" },
      app: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, `value ${i}`])),
    };
    const size = JSON.stringify(big).length;
    expect(size).toBeGreaterThan(30_000);

    for (let i = 0; i < 20; i++) beforeSend(big); // warm-up (JIT)
    const runs = 50;
    const start = performance.now();
    for (let i = 0; i < runs; i++) beforeSend(big);
    const perEvent = (performance.now() - start) / runs;

    const out = JSON.stringify(beforeSend(big));
    expect(out).not.toContain("@example.com");
    // Generous ceiling for a loaded CI runner; locally ~1–2 ms for ~40 KB.
    expect(perEvent).toBeLessThan(25);
  });
});
