import { SENTRY_ENABLED, DEFAULT_DENY_URLS, DEFAULT_IGNORED_ERRORS, SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, SENTRY_REPLAYS_SESSION_SAMPLE_RATE, SENTRY_ENVIRONMENT, createSentryBeforeSend, createTracesSampler, SENTRY_TRACES_SAMPLE_RATE } from './chunk-RLML3U3R.js';
import './chunk-DGUM43GV.js';
import * as Sentry from '@sentry/nextjs';

var REPLAY_LAZY_AT_BUILD = process.env.NEXT_PUBLIC_SENTRY_REPLAY_MODE === "lazy";
function initSentryClient(opts) {
  const {
    app,
    dsn,
    enabled,
    ignoreErrors = [],
    replay = REPLAY_LAZY_AT_BUILD ? "lazy" : true,
    replayMaskAllText = true,
    replayBlockAllMedia = true,
    tunnel,
    sendDefaultPii = false
  } = opts;
  const isEnabled = SENTRY_ENABLED && (enabled?.() ?? true);
  const replayEnabled = replay !== false;
  const replayEager = replay === true && !REPLAY_LAZY_AT_BUILD;
  Sentry.init({
    dsn: dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: createTracesSampler(SENTRY_TRACES_SAMPLE_RATE),
    // Rates stay identical between `true` and `"lazy"`: the integration reads
    // them from the client options whenever it is set up (at init, or later).
    replaysSessionSampleRate: replayEnabled ? SENTRY_REPLAYS_SESSION_SAMPLE_RATE : 0,
    replaysOnErrorSampleRate: replayEnabled ? SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE : 0,
    enabled: isEnabled,
    sendDefaultPii,
    debug: false,
    ...tunnel && { tunnel },
    ignoreErrors: [...DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    denyUrls: DEFAULT_DENY_URLS,
    integrations: [
      // Explicit — do not rely on the SDK default. `enableInp: true` has been
      // the default since SDK 8.x, but stating it here makes INP collection
      // survive a default flip and documents that INP (a Google ranking signal
      // since it replaced FID) is a first-class metric for us.
      // Note: `@sentry/nextjs` re-exports its OWN browserTracingIntegration
      // (App Router navigation instrumentation included), and a user-provided
      // integration replaces the default of the same name — nothing is lost.
      Sentry.browserTracingIntegration({ enableInp: true }),
      // Static reference ON PURPOSE only in the eager branch. See ReplayMode:
      // this is the line that keeps Replay in the initial chunk, and the
      // `REPLAY_LAZY_AT_BUILD` guard is what lets a build delete it.
      ...replayEager ? [
        Sentry.replayIntegration({
          maskAllText: replayMaskAllText,
          blockAllMedia: replayBlockAllMedia
        })
      ] : []
    ],
    beforeSend: createSentryBeforeSend(app)
  });
  if (replayEnabled && !replayEager && isEnabled) {
    scheduleLazyReplay({
      maskAllText: replayMaskAllText,
      blockAllMedia: replayBlockAllMedia
    });
  }
}
function scheduleLazyReplay(opts) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  let requested = false;
  const attach = () => {
    if (requested) return;
    requested = true;
    void import('./replay-lazy.js').then((mod) => {
      mod.attachReplayIntegration(opts);
    }).catch(() => {
      Sentry.addBreadcrumb({
        category: "sentry.replay",
        level: "warning",
        message: "lazy replay chunk failed to load \u2014 no session replay for this page"
      });
    });
  };
  Sentry.getClient()?.on("beforeSendEvent", (event) => {
    if (event.exception) attach();
  });
  const onLoaded = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => attach(), { timeout: 3e3 });
    } else {
      window.setTimeout(attach, 1500);
    }
  };
  if (document.readyState === "complete") onLoaded();
  else window.addEventListener("load", onLoaded, { once: true });
}

export { initSentryClient };
//# sourceMappingURL=client.js.map
//# sourceMappingURL=client.js.map