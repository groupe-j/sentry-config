import { describe, it, expect } from "vitest";
import {
  createSentryBeforeSend,
  createSentryBeforeSendLog,
  createSentryBeforeSendTransaction,
  SCRUB_FAILED_TAG,
  scrubSentryEvent,
  type SentryEventLike,
} from "./before-send.js";
import { REDACTED } from "./redaction.js";
import { modernRegexLiterals } from "./regex-literals.test-helper.js";
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

describe("scrubText — independent review findings", () => {
  it("catches Drizzle params flattened to one line or JSON-escaped", () => {
    expect(scrubText(`{"err":"Failed query: select 1\\nparams: MAGICTOKENabcdef123456,5"}`)).toBe(
      `{"err":"Failed query: select 1\\nparams: [redacted]"}`,
    );
    expect(scrubText("Failed query: select 1 where k = $1 params: MAGICTOKENabcdef123456")).toBe(
      "Failed query: select 1 where k = $1 params: [redacted]",
    );
    // Without `Failed query`, a one-line `params:` is a genuine diagnostic.
    expect(scrubText("Invalid params: expected object")).toBe("Invalid params: expected object");
  });

  it("redacts Postgres failing rows, nested key expressions and both exclusion tuples", () => {
    expect(scrubText('null value in column "email" violates not-null constraint\nFailing row contains (1, Jean Dupont, 0612345678).')).toBe(
      'null value in column "email" violates not-null constraint\nFailing row contains ([redacted]).',
    );
    expect(scrubText("Key (lower(name::text))=(Jean Dupont) already exists.")).toBe(
      "Key (lower(name::text))=([redacted]) already exists.",
    );
    expect(scrubText("Key (lower((phone)::text))=(0612345678) already exists.")).toBe(
      "Key (lower((phone)::text))=([redacted]) already exists.",
    );
    expect(scrubText("Key (room, during)=(12, [2026-09-17,2026-09-18)) conflicts with existing key (room, during)=(12, [2026-09-16,2026-09-18)).")).toBe(
      "Key (room, during)=([redacted]) conflicts with existing key (room, during)=([redacted]).",
    );
  });

  it("redacts a Telegram bot token in a URL path", () => {
    expect(scrubText("POST https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage")).toBe(
      "POST https://api.telegram.org/[redacted]/sendMessage",
    );
  });

  it("decodes a nested URL once and scrubs its parameters", () => {
    const out = scrubText("/login?redirect=%2Freset-password%3Ftoken%3DSECRETabc123&lang=fr");
    expect(out).not.toContain("SECRETabc123");
    expect(decodeURIComponent(out)).toBe("/login?redirect=/reset-password?token=[redacted]&lang=fr");
    expect(scrubText("/x?next=%2Fu%3Femail%3Djean%2540example.com")).not.toContain("example.com");
  });

  it("covers 6-digit one-time codes but keeps upper-snake error codes", () => {
    expect(scrubText("/verify?code=123456")).toBe("/verify?code=[redacted]");
    expect(scrubText("/error?code=ERR_INVALID_ARG_TYPE")).toBe("/error?code=ERR_INVALID_ARG_TYPE");
  });

  it("covers remaining credential shapes", () => {
    expect(scrubText("connect redis://:supersecret@cache.internal:6379")).toBe("connect redis://:[redacted]@cache.internal:6379");
    expect(scrubText("GET /b.pdf?X-Goog-Signature=0a1b2c3d&X-Goog-Expires=600")).toBe("GET /b.pdf?X-Goog-Signature=[redacted]&X-Goog-Expires=600");
    expect(scrubText("Authorization: Bearer abcdefghijklmnopqrstuvwx")).toBe("Authorization: Bearer [redacted]");
    expect(scrubText("key re_123abc45_AbCdEfGhIjKlMnOpQr leaked")).toBe("key [redacted] leaked");
  });

  it("redacts a Unicode e-mail whole, leaves an SSH remote alone", () => {
    expect(scrubText("to jérôme.dupont@example.fr failed")).toBe("to [redacted] failed");
    expect(scrubText("git clone git@github.com:groupe-j/repo.git")).toBe("git clone git@github.com:groupe-j/repo.git");
  });

  it("keeps broad PII keys (`name`) in SQL and code comparisons", () => {
    const sql = `SELECT "id" FROM "products" WHERE "name" = 'Chair'`;
    expect(scrubText(sql)).toBe(sql);
    expect(scrubText('data: { name: "Jean Dupont", role: "MEMBER" }')).toBe('data: { name: "[redacted]", role: "MEMBER" }');
  });

  it("covers the keys missing from the list (telephone, mobile, city, birthDate, ip)", () => {
    const out = scrubText('data: { telephone: "0612345678", mobile: "0712345678", city: "Metz", birthDate: "1990-01-01", ip: "82.1.2.3" }');
    expect(out).toBe('data: { telephone: "[redacted]", mobile: "[redacted]", city: "[redacted]", birthDate: "[redacted]", ip: "[redacted]" }');
  });
});

describe("scrubText — second review round", () => {
  it("keeps redacting flat params past escaped quotes and past 4 KB", () => {
    const escaped = String.raw`{"msg":"Failed query: insert\nparams: jean,\"{\"phone\":\"0612345678\"}\",TOKENabc123"}`;
    const out = scrubText(escaped);
    expect(out).not.toContain("0612345678");
    expect(out).not.toContain("TOKENabc123");
    const bulk = `Failed query: insert into t values ($1) params: ${"a,".repeat(2_200)}TOKENtail123456`;
    expect(scrubText(bulk)).toBe("Failed query: insert into t values ($1) params: [redacted]");
  });

  it("ends Postgres tuples inside JSON, before `SQL state`, after `=` or `(`", () => {
    expect(scrubText('{"detail":"Failing row contains (1, Jean Dupont, 0612345678).","code":"23502"}')).toBe(
      '{"detail":"Failing row contains ([redacted]).","code":"23502"}',
    );
    expect(scrubText("DETAIL: Failing row contains (1, Jean Dupont). SQL state: 23502")).toBe(
      "DETAIL: Failing row contains ([redacted]). SQL state: 23502",
    );
    expect(scrubText("detail: Key (phone)=(0612345678). hint: x")).toBe("detail: Key (phone)=([redacted]). hint: x");
    expect(scrubText("detail=Key (phone)=(0612345678) already exists.")).toBe("detail=Key (phone)=([redacted]) already exists.");
    expect(scrubText("(Key (phone)=(0612345678) already exists.)")).toBe("(Key (phone)=([redacted]) already exists.)");
  });

  it("unwraps double URL-encoding and keeps the marker searchable", () => {
    const out = scrubText("/login?redirect=%252Freset%253Ftoken%253DSECRET123&lang=fr");
    expect(out).not.toContain("SECRET123");
    expect(out).toContain("[redacted]");
    expect(out.endsWith("&lang=fr")).toBe(true);
  });

  it("finds an e-mail inside a percent-encoded URL run longer than 64 characters", () => {
    const out = scrubText("path https%3A%2F%2Fapp.example.com%2Fauth%2Fverify%3Fsomething%3Dx%26email%3Djean%40example.com");
    expect(out).not.toContain("jean");
  });

  it("never declares a lookbehind or \\p{…} as a regex LITERAL (parse-time SyntaxError before Safari 16.4)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["src/scrub.ts", "src/before-send.ts", "src/redaction.ts"]) {
      const source = readFileSync(file, "utf8");
      // Parsed, not pattern-matched: `String.raw` sources full of slashes and
      // comments quoting a pattern are neither false alarms nor hiding places.
      expect(modernRegexLiterals(source), file).toEqual([]);
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

  it("scrubs array values of an object query_string", () => {
    expect(scrubQueryString({ token: ["abc", "def"], page: ["1"] })).toEqual({
      token: [REDACTED_VALUE, REDACTED_VALUE],
      page: ["1"],
    });
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

  it("scrubs header values, frame source lines and inline-script file URLs", () => {
    const out = beforeSend({
      request: { headers: { referer: MAGIC_LINK_URL, "user-agent": "Mozilla/5.0" } },
      exception: {
        values: [
          {
            type: "Error",
            value: "boom",
            stacktrace: {
              frames: [
                {
                  filename: `https://app.example.com/verify?token=${TOKEN}`,
                  context_line: `  const email = "${EMAIL}";`,
                  pre_context: [`// owner ${EMAIL}`],
                  post_context: ["  return null;"],
                  lineno: 3,
                },
                { filename: "/var/task/node_modules/.pnpm/@sentry+nextjs@10.65.0_next@16.3.3/node_modules/x.js" },
              ],
            },
          },
        ],
      },
    })!;
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain(TOKEN);
    expect(serialised).not.toContain(EMAIL);
    const frames = out.exception!.values![0]!.stacktrace!.frames!;
    expect(frames[0]!.post_context).toEqual(["  return null;"]);
    expect(frames[1]!.filename).toBe("/var/task/node_modules/.pnpm/@sentry+nextjs@10.65.0_next@16.3.3/node_modules/x.js");
    expect(out.request!.headers!["user-agent"]).toBe("Mozilla/5.0");
  });

  it("redacts client-IP headers, request.env.REMOTE_ADDR and mechanism data", () => {
    const out = beforeSend({
      request: {
        headers: { "x-forwarded-for": "81.1.2.3", "x-vercel-ip-city": "Metz", accept: "text/html" },
        env: { REMOTE_ADDR: "81.1.2.3", SERVER_NAME: "app" },
      },
      exception: {
        values: [{ type: "Error", value: "boom", mechanism: { type: "generic", data: { url: `https://app/?token=${TOKEN}` } } }],
      },
    })!;
    expect(out.request!.headers).toEqual({ "x-forwarded-for": REDACTED, "x-vercel-ip-city": REDACTED, accept: "text/html" });
    expect(out.request!.env).toEqual({ REMOTE_ADDR: REDACTED, SERVER_NAME: "app" });
    expect(out.exception!.values![0]!.mechanism).toEqual({ type: "generic", data: { url: "https://app/?token=[redacted]" } });
  });

  it("scrubs fingerprint and IP span attributes; fail-closed keeps trace ids and only class-name types", () => {
    expect(beforeSend({ fingerprint: ["{{ default }}", EMAIL] })!.fingerprint).toEqual(["{{ default }}", REDACTED_VALUE]);
    const tx = createSentryBeforeSendTransaction<SentryEventLike & Record<string, unknown>>()({
      spans: [{ data: { "http.request.header.x_forwarded_for": "81.1.2.3", "user.ip_address": "81.1.2.3", "http.method": "GET" } }],
    });
    expect(tx.spans![0]!.data).toEqual({ "http.request.header.x_forwarded_for": REDACTED, "user.ip_address": REDACTED, "http.method": "GET" });

    const hostile: SentryEventLike & Record<string, unknown> = {
      type: "transaction",
      contexts: { trace: { trace_id: "t1", span_id: "s1", op: "http.server", data: { url: MAGIC_LINK_URL } } },
      exception: { values: [{ type: `Error for ${EMAIL}` }] },
    };
    Object.defineProperty(hostile, "extra", { enumerable: true, get() { throw new Error("x"); } });
    const out = beforeSend(hostile)!;
    expect(out.tags).toEqual({ app: "test-app", [SCRUB_FAILED_TAG]: "true" });
    expect(out.contexts).toEqual({ trace: { trace_id: "t1", span_id: "s1", parent_span_id: undefined, op: "http.server" } });
    expect(out.exception!.values![0]!.type).toBe("Error");
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });

  it("fails closed even when reading exception.values throws, and drops fingerprint", () => {
    const hostile: SentryEventLike & Record<string, unknown> = { event_id: "e1", fingerprint: [EMAIL] };
    Object.defineProperty(hostile, "exception", {
      enumerable: true,
      get() {
        return { get values(): never { throw new Error("x"); } };
      },
    });
    let out: (SentryEventLike & Record<string, unknown>) | null = null;
    expect(() => { out = beforeSend(hostile); }).not.toThrow();
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(out!.tags).toEqual({ app: "test-app", [SCRUB_FAILED_TAG]: "true" });
    expect(out!.event_id).toBe("e1");
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

describe("scrubSentryEvent", () => {
  it("scrubs without tagging, for composition after an app's own redactor", () => {
    const out = scrubSentryEvent({ message: `mail ${EMAIL}`, tags: { area: "x" } });
    expect(out).toEqual({ message: "mail [redacted]", tags: { area: "x" } });
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

  it("redacts user.* attributes the SDK sets BEFORE the hook, keeps user.id", () => {
    const out = beforeSendLog({
      message: "x",
      attributes: { "user.id": "u1", "user.name": "Jean Dupont", "user.email": EMAIL, "client.address": "81.1.2.3" },
    }) as { attributes: Record<string, unknown> };
    expect(out.attributes).toEqual({ "user.id": "u1", "user.name": REDACTED, "user.email": REDACTED, "client.address": REDACTED });
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
      // REPEATED PREFIXES — many start positions, each able to scan far. These
      // are the shapes that were quadratic in the first version (6 s / 100 KB
      // for `eyJ-`, 82 s for a 480 KB log attribute).
      "eyJ-".repeat(25_000),
      "eyJaaaaaaaa-".repeat(10_000),
      "Key (a)=(".repeat(11_112),
      "a Key (a)=(".repeat(9_000),
      "Failing row contains (".repeat(4_500),
      "sk-".repeat(33_000),
      "sk_live_".repeat(12_500),
      "bot123456:".repeat(10_000),
      "a:\"".repeat(33_000),
      "Bearer 1".repeat(12_500),
      "Bearer " + "abcdefghij".repeat(10_000),
      "?token=".repeat(14_000),
      "x=%25".repeat(20_000),
      "postgres://a:".repeat(7_500),
      "Failed query: x\\nparams: ".repeat(4_000),
      "jean@".repeat(20_000),
      "é".repeat(50_000) + "@x.fr",
    ];
    for (const input of inputs) {
      const start = performance.now();
      scrubText(input);
      expect(performance.now() - start, input.slice(0, 24)).toBeLessThan(250);
    }
  });

  it("stays linear through beforeSendLog on a large repeated-prefix attribute", () => {
    const start = performance.now();
    createSentryBeforeSendLog()({ message: "x", attributes: { blob: "eyJaaaaaaaa-".repeat(40_000) } });
    expect(performance.now() - start).toBeLessThan(500);
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
