import './chunk-DGUM43GV.js';
import * as Sentry from '@sentry/nextjs';

function attachReplayIntegration(opts) {
  Sentry.addIntegration(
    Sentry.replayIntegration({
      maskAllText: opts.maskAllText,
      blockAllMedia: opts.blockAllMedia
    })
  );
}

export { attachReplayIntegration };
//# sourceMappingURL=replay-lazy.js.map
//# sourceMappingURL=replay-lazy.js.map