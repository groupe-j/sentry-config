import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    server: "src/server.ts",
    edge: "src/edge.ts",
    // Own chunk on purpose: `client.ts` only reaches it through a dynamic
    // import, so the Replay bytes stay out of the consumer's initial chunk.
    "replay-lazy": "src/replay-lazy.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  // Required for the dynamic `import("./replay-lazy.js")` to survive as a real
  // dynamic import in the ESM output (with splitting off, esbuild inlines it
  // and the lazy mode silently degrades to the eager one).
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ["@sentry/nextjs", "@sentry/node", "@sentry/browser"],
  treeshake: true,
});
