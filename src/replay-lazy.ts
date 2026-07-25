/**
 * Lazy Replay attachment — kept in its own module ON PURPOSE.
 *
 * This is the ONLY module of the package that references
 * `Sentry.replayIntegration`. Because `client.ts` reaches it exclusively
 * through a dynamic `import("./replay-lazy.js")`, the bundler of the
 * consuming app can put `@sentry-internal/replay` (~180 KB gzipped together
 * with the rest of the SDK chunk) in a separate async chunk instead of the
 * initial one.
 *
 * ⚠️ Do NOT import this module statically from anywhere in the package —
 * a single static import re-attaches replay to the initial chunk and silently
 * cancels the whole optimisation (that is exactly the trap `replay: false`
 * falls into, see `client.ts`).
 */

import * as Sentry from "@sentry/nextjs";

export interface AttachReplayOptions {
  /** Mask all text in Replay (safe default: true). */
  maskAllText: boolean;
  /** Block media in Replay (safe default: true). */
  blockAllMedia: boolean;
}

/**
 * Adds the Replay integration to the already-initialised client.
 *
 * The sampling decision is taken by the integration itself when it is set up,
 * using `replaysSessionSampleRate` / `replaysOnErrorSampleRate` from the
 * options passed to `Sentry.init()` — so a lazily attached Replay keeps the
 * exact same rates as an eagerly attached one (buffer mode: 100% on error).
 */
export function attachReplayIntegration(opts: AttachReplayOptions): void {
  Sentry.addIntegration(
    Sentry.replayIntegration({
      maskAllText: opts.maskAllText,
      blockAllMedia: opts.blockAllMedia,
    }),
  );
}
