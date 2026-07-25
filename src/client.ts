/**
 * Browser-side Sentry init helper — **eager Replay** entry point.
 *
 * Usage in `instrumentation-client.ts` (Next 15+) or `sentry.client.config.ts`:
 *
 *   import { initSentryClient } from '@groupe-j/sentry-config/client';
 *   initSentryClient({ app: 'mega-hote' });
 *
 * ⚠️ **Next 16 / Turbopack.** `sentry.client.config.ts` is only injected by the
 * *webpack* path of `@sentry/nextjs`. A Next 16 app built with Turbopack never
 * executes it, so `initSentryClient` never runs and the browser SDK reports
 * nothing — silently. On Next ≥ 15 always put this call in
 * **`instrumentation-client.ts`** at the project root.
 *
 * For PDPA / consent gating (ridesamui pattern), pass an `enabled` predicate:
 *
 *   initSentryClient({ app: 'web', enabled: () => hasUserConsent() });
 *
 * ⚠️ `enabled` is evaluated ONCE, at init time. If the predicate reads a
 * consent cookie that the user only accepts later in the session, Sentry stays
 * off for the whole page — no errors, no pageload transactions. That is a
 * legitimate design (privacy first), but such an app reports nothing until the
 * visitor has consented AND loaded a new document.
 *
 * 📦 **Bundle size.** This module references `Sentry.replayIntegration`
 * statically, which pins ~124 KB raw / ~39 KB gzip of rrweb into your initial
 * chunk **on every page, whatever `replay` is set to** — `replay: false`
 * included (see the trap on {@link ReplayMode}). To get those bytes out, import
 * from `@groupe-j/sentry-config/client-lazy` instead; the API is the same.
 */

import * as Sentry from "@sentry/nextjs";
import {
  type InitSentryClientBaseOptions,
  type ReplayMode,
  initClientCore,
} from "./client-core.js";

export type { ReplayMode } from "./client-core.js";

export interface InitSentryClientOptions extends InitSentryClientBaseOptions {
  /**
   * Replay strategy for this entry point: `true` (default — set up during
   * `Sentry.init`, records from the very first line) or `false` (off).
   *
   * 🪤 `false` does **not** save any bytes here; it only zeroes
   * `replaysOnErrorSampleRate`. See {@link ReplayMode}.
   *
   * `"lazy"` is accepted for source compatibility but is a *worse* deal on this
   * entry point than on `/client-lazy`: the rrweb bytes stay in your initial
   * chunk (the eager reference above is still there) **and** you additionally
   * fetch Replay from the CDN. Use `@groupe-j/sentry-config/client-lazy` to get
   * the actual saving.
   *
   * @default true
   */
  replay?: ReplayMode;
}

export function initSentryClient(opts: InitSentryClientOptions): void {
  const { replay = true, ...rest } = opts;
  initClientCore({
    options: rest,
    replay,
    // The ONLY static `replayIntegration` reference in the package.
    eagerReplay: (tuning) =>
      Sentry.replayIntegration({
        maskAllText: tuning.maskAllText,
        blockAllMedia: tuning.blockAllMedia,
      }),
  });
}
