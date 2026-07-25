'use strict';

var chunk345PN2DU_cjs = require('./chunk-345PN2DU.cjs');
require('./chunk-JEQ2X3Z6.cjs');
var Sentry = require('@sentry/nextjs');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var Sentry__namespace = /*#__PURE__*/_interopNamespace(Sentry);

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
  const isEnabled = chunk345PN2DU_cjs.SENTRY_ENABLED && (enabled?.() ?? true);
  const replayEnabled = replay !== false;
  const replayEager = replay === true && !REPLAY_LAZY_AT_BUILD;
  Sentry__namespace.init({
    dsn: dsn ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: chunk345PN2DU_cjs.SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: chunk345PN2DU_cjs.createTracesSampler(chunk345PN2DU_cjs.SENTRY_TRACES_SAMPLE_RATE),
    // Rates stay identical between `true` and `"lazy"`: the integration reads
    // them from the client options whenever it is set up (at init, or later).
    replaysSessionSampleRate: replayEnabled ? chunk345PN2DU_cjs.SENTRY_REPLAYS_SESSION_SAMPLE_RATE : 0,
    replaysOnErrorSampleRate: replayEnabled ? chunk345PN2DU_cjs.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE : 0,
    enabled: isEnabled,
    sendDefaultPii,
    debug: false,
    ...tunnel && { tunnel },
    ignoreErrors: [...chunk345PN2DU_cjs.DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    denyUrls: chunk345PN2DU_cjs.DEFAULT_DENY_URLS,
    integrations: [
      // Explicit — do not rely on the SDK default. `enableInp: true` has been
      // the default since SDK 8.x, but stating it here makes INP collection
      // survive a default flip and documents that INP (a Google ranking signal
      // since it replaced FID) is a first-class metric for us.
      // Note: `@sentry/nextjs` re-exports its OWN browserTracingIntegration
      // (App Router navigation instrumentation included), and a user-provided
      // integration replaces the default of the same name — nothing is lost.
      Sentry__namespace.browserTracingIntegration({ enableInp: true }),
      // Static reference ON PURPOSE only in the eager branch. See ReplayMode:
      // this is the line that keeps Replay in the initial chunk, and the
      // `REPLAY_LAZY_AT_BUILD` guard is what lets a build delete it.
      ...replayEager ? [
        Sentry__namespace.replayIntegration({
          maskAllText: replayMaskAllText,
          blockAllMedia: replayBlockAllMedia
        })
      ] : []
    ],
    beforeSend: chunk345PN2DU_cjs.createSentryBeforeSend(app)
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
    void import('./replay-lazy.cjs').then((mod) => {
      mod.attachReplayIntegration(opts);
    }).catch(() => {
      Sentry__namespace.addBreadcrumb({
        category: "sentry.replay",
        level: "warning",
        message: "lazy replay chunk failed to load \u2014 no session replay for this page"
      });
    });
  };
  Sentry__namespace.getClient()?.on("beforeSendEvent", (event) => {
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

exports.initSentryClient = initSentryClient;
//# sourceMappingURL=client.cjs.map
//# sourceMappingURL=client.cjs.map