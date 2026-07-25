'use strict';

var chunk345PN2DU_cjs = require('./chunk-345PN2DU.cjs');
var chunkJEQ2X3Z6_cjs = require('./chunk-JEQ2X3Z6.cjs');
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

function initSentryServer(opts) {
  const {
    app,
    dsn,
    prisma = true,
    profiling = true,
    ignoreErrors = [],
    extraIntegrations = [],
    sendDefaultPii = false,
    transport
  } = opts;
  const integrations = [];
  if (prisma) {
    integrations.push(Sentry__namespace.prismaIntegration());
  }
  if (profiling) {
    try {
      const profMod = chunkJEQ2X3Z6_cjs.__require("@sentry/profiling-node");
      if (typeof profMod.nodeProfilingIntegration === "function") {
        integrations.push(profMod.nodeProfilingIntegration());
      }
    } catch {
    }
  }
  try {
    const sentryAny = Sentry__namespace;
    if (typeof sentryAny.vercelAIIntegration === "function") {
      integrations.push(sentryAny.vercelAIIntegration());
    }
  } catch {
  }
  integrations.push(...extraIntegrations);
  Sentry__namespace.init({
    dsn: dsn ?? process.env.SENTRY_DSN,
    environment: chunk345PN2DU_cjs.SENTRY_ENVIRONMENT,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: chunk345PN2DU_cjs.createTracesSampler(chunk345PN2DU_cjs.SENTRY_TRACES_SAMPLE_RATE),
    profilesSampleRate: chunk345PN2DU_cjs.SENTRY_PROFILES_SAMPLE_RATE,
    sendDefaultPii,
    enabled: chunk345PN2DU_cjs.SENTRY_ENABLED,
    debug: false,
    ignoreErrors: [...chunk345PN2DU_cjs.DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    integrations,
    beforeSend: chunk345PN2DU_cjs.createSentryBeforeSend(app),
    _experiments: { enableLogs: true },
    // Opt-in transport override (getsentry/sentry-javascript#18871). Only spread
    // when provided so the SDK default is preserved for healthy setups.
    ...transport !== void 0 ? { transport } : {}
  });
}

exports.initSentryServer = initSentryServer;
//# sourceMappingURL=server.cjs.map
//# sourceMappingURL=server.cjs.map