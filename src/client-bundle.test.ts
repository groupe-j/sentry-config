import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BuildOptions, type Message, build } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * Client entry points, bundled the way a browser build would.
 *
 * The source-level invariants in `client.test.ts` read import graphs as text.
 * This file asks an actual bundler, so a hazard that only shows at resolution
 * time — a Node builtin, a server-only SDK member, a modern regex literal
 * injected by a transform — fails here instead of in a consumer's `next build`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ENTRIES = ["client.ts", "client-lazy.ts"] as const;

interface Bundle {
  code: string;
  warnings: Message[];
  /** Node builtins the bundler was asked to resolve, with their importer. */
  builtins: string[];
  /** Bare specifiers other than Node builtins, i.e. third-party packages. */
  packages: string[];
}

/**
 * A regex literal starts where an expression can: after an indent, a
 * punctuator, or a keyword (`return /…/`, `void /…/`). A `/` after an
 * identifier, a number or `)` is a division and is not matched.
 */
const REGEX_LITERAL =
  /(?:^[ \t]*|[=(,:;!&|?{}[+\-*%<>~^]\s*|\b(?:return|void|typeof|case|in|of|else|throw|delete|await|yield)\s+)\/(?![/*])(?:[^/\n\\[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[dgimsuvy]*/gm;

function unicodePropertyLiterals(code: string): string[] {
  return (code.match(REGEX_LITERAL) ?? []).filter((l) => /\\[pP]\{/.test(l));
}

async function bundle(entry: string, options: BuildOptions = {}): Promise<Bundle> {
  const builtins: string[] = [];
  const packages = new Set<string>();
  const result = await build({
    entryPoints: [path.join(here, entry)],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    conditions: ["browser"],
    logLevel: "silent",
    ...options,
    plugins: [
      {
        name: "record-bare-imports",
        setup(b) {
          b.onResolve({ filter: /^[^./]/ }, (args) => {
            // A Windows entry path (`C:\…`) matches the filter too.
            if (args.kind === "entry-point") return undefined;
            const name = args.path.replace(/^node:/, "").split("/")[0] ?? "";
            if (args.path.startsWith("node:") || builtinModules.includes(name)) {
              builtins.push(`${args.path} ← ${path.relative(here, args.importer)}`);
              return { path: args.path, external: true };
            }
            packages.add(args.path);
            return undefined;
          });
        },
      },
    ],
  });
  return {
    code: result.outputFiles?.[0]?.text ?? "",
    warnings: result.warnings,
    builtins,
    packages: [...packages],
  };
}

// esbuild's service start-up alone can take seconds on a cold Windows machine.
const BUNDLER = { timeout: 30_000 };

describe("client entries bundle for the browser", BUNDLER, () => {
  // The SDK stays external here, as it does in `tsup.config.ts`: this block is
  // about what THIS package brings into a client chunk.
  const OWN_CODE = { external: ["@sentry/nextjs"] } satisfies BuildOptions;

  it.each(CLIENT_ENTRIES)("%s pulls no Node builtin and no package but the SDK", async (entry) => {
    const b = await bundle(entry, OWN_CODE);
    expect(b.builtins).toEqual([]);
    expect(b.packages).toEqual(["@sentry/nextjs"]);
    expect(b.warnings).toEqual([]);
  });

  it.each(CLIENT_ENTRIES)("%s exports scrubSentryEvent from the bundle itself", async (entry) => {
    const b = await bundle(entry, OWN_CODE);
    expect(b.code).toMatch(/export\s*\{[^}]*\bscrubSentryEvent\b[^}]*\}/);
  });

  /**
   * Lookbehind as a regex LITERAL is a parse-time SyntaxError before Safari
   * 16.4 (DECISIONS.md §17) — for the whole chunk, app code included. esbuild
   * rewrites such a literal into `new RegExp(…)` when told the target lacks
   * the feature, so a bundle that comes out byte-identical either way contains
   * none, whatever wrote it: our sources, a future helper, or a transform.
   */
  it.each(CLIENT_ENTRIES)("%s bundles no lookbehind regex literal", async (entry) => {
    const modern = await bundle(entry, OWN_CODE);
    const legacy = await bundle(entry, {
      ...OWN_CODE,
      supported: { "regexp-lookbehind-assertions": false },
    });
    expect(legacy.code).toBe(modern.code);
  });

  /**
   * esbuild does NOT lower `\p{…}` inside a character class (`/[\p{L}]/u`,
   * the shape of the email pattern), so the byte-identity trick above is blind
   * to it. Those are found by scanning the bundle's regex literals instead.
   */
  it.each(CLIENT_ENTRIES)("%s bundles no \\p{…} regex literal", async (entry) => {
    const b = await bundle(entry, OWN_CODE);
    expect(unicodePropertyLiterals(b.code)).toEqual([]);
  });

  it("both probes do detect a literal (guards the probes themselves)", async () => {
    const compile = async (contents: string, supported?: Record<string, boolean>): Promise<string> =>
      (await build({ stdin: { contents, loader: "ts" }, write: false, logLevel: "silent", supported }))
        .outputFiles[0]?.text ?? "";

    const lookbehind = "export const r = /(?<=a)b/u;";
    expect(await compile(lookbehind, { "regexp-lookbehind-assertions": false })).not.toBe(
      await compile(lookbehind),
    );

    for (const statement of [
      String.raw`export const r = /[\p{L}\p{N}]+@x/gu;`,
      String.raw`export function f(s) { return /[\p{L}]+@x/u.test(s); }`,
      String.raw`export function g(s) { if (s) { void /[\p{L}]/u.test(s); } }`,
    ]) {
      expect(unicodePropertyLiterals(await compile(statement)), statement).toHaveLength(1);
    }
    // …and a pattern compiled from a string, as `scrub.ts` does, is not one.
    const fromString = await compile("export const r = new RegExp(String.raw`[\\p{L}]+`, 'u');");
    expect(unicodePropertyLiterals(fromString)).toEqual([]);
  });
});

describe("client entries against the real browser build of @sentry/nextjs", BUNDLER, () => {
  // `next` and React are provided by the consumer's build; bundling them here
  // would only measure Next's own Node fallbacks (`gzip-size` → `fs`, `zlib`).
  const REAL_SDK = {
    external: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"],
  } satisfies BuildOptions;

  const undefinedImports = (b: Bundle): string[] =>
    b.warnings.filter((w) => w.id === "import-is-undefined").map((w) => w.text);

  it.each(CLIENT_ENTRIES)("%s resolves every SDK member it uses and no Node builtin", async (entry) => {
    const b = await bundle(entry, REAL_SDK);
    expect(undefinedImports(b)).toEqual([]);
    expect(b.builtins).toEqual([]);
  });

  it("the barrel does not (the hazard is real, so the check above means something)", async () => {
    // If this goes green-by-accident, the barrel stopped dragging server-only
    // members and the "never import the barrel from a client module" notes are
    // stale — remove them rather than leave them to mislead.
    const b = await bundle("index.ts", REAL_SDK);
    expect(undefinedImports(b).join("\n")).toMatch(/captureCheckIn/);
  });
});
