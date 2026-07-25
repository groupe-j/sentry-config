'use strict';

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

function attachReplayIntegration(opts) {
  Sentry__namespace.addIntegration(
    Sentry__namespace.replayIntegration({
      maskAllText: opts.maskAllText,
      blockAllMedia: opts.blockAllMedia
    })
  );
}

exports.attachReplayIntegration = attachReplayIntegration;
//# sourceMappingURL=replay-lazy.cjs.map
//# sourceMappingURL=replay-lazy.cjs.map