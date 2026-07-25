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

function initSentryEdge(opts) {
  const { app, dsn, ignoreErrors = [] } = opts;
  Sentry__namespace.init({
    dsn: dsn ?? process.env.SENTRY_DSN,
    environment: chunk345PN2DU_cjs.SENTRY_ENVIRONMENT,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampler: chunk345PN2DU_cjs.createTracesSampler(chunk345PN2DU_cjs.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
    enabled: chunk345PN2DU_cjs.SENTRY_ENABLED,
    debug: false,
    ignoreErrors: [...chunk345PN2DU_cjs.DEFAULT_IGNORED_ERRORS, ...ignoreErrors],
    beforeSend: chunk345PN2DU_cjs.createSentryBeforeSend(app)
  });
}

exports.initSentryEdge = initSentryEdge;
//# sourceMappingURL=edge.cjs.map
//# sourceMappingURL=edge.cjs.map