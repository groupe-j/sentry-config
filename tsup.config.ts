import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    server: "src/server.ts",
    edge: "src/edge.ts",
    // Separate entry ON PURPOSE. It is the only client entry that never
    // references `Sentry.replayIntegration`, which is what lets a consumer's
    // bundler drop rrweb from the initial chunk. Keeping it a distinct entry
    // (rather than a branch inside `client.ts`) is what makes that property
    // static and therefore verifiable.
    "client-lazy": "src/client-lazy.ts",
    // Standalone entry so `assertSentryArmed` is reachable WITHOUT the barrel.
    // The barrel drags `Sentry.withMonitor` / `Sentry.trpcMiddleware` — absent
    // from the browser build of `@sentry/nextjs` — so importing it from a
    // client module breaks the build. `src/armed.ts` imports nothing at all.
    armed: "src/armed.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  // Keep splitting OFF: each entry must be self-contained so that importing
  // `/client-lazy` cannot drag in a shared chunk that mentions Replay.
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["@sentry/nextjs", "@sentry/node", "@sentry/browser"],
  treeshake: true,
});
