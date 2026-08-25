import { createMediaCaptureController } from "./controllers/mediaCaptureController.js";
import { createMediaProductionController } from "./controllers/mediaProductionController.js";
import { createMediaProxyController } from "./controllers/mediaProxyController.js";
import { createPortableMediaController } from "./controllers/portableMediaController.js";
import { createMediaProductionRepository } from "./repositories/mediaProductionRepository.js";
import { createLocalMediaCaptureService } from "./services/localMediaCaptureService.js";

export function createVideoAnalysisMediaRuntime(options = {}) {
  const context = options.context || {};
  const getRuntime = options.getRuntime || (() => null);
  const repository = createMediaProductionRepository(context);
  const productionController = createMediaProductionController({
    getState: () => getRuntime()?.store.getState() || {},
    updateState: (updater) => getRuntime()?.store.update(updater),
    getRoot: options.getRoot,
    getVideoElement: options.getVideoElement,
    getWindow: () => getRuntime()?.context?.win || context.win || window,
    getCurrentMatchMs: options.getCurrentMatchMs,
    seekToMatchMs: options.seekToMatchMs,
    createLocalSource: (payload) => getRuntime()?.videos.createLocalVideoSource(payload),
    repository,
  });
  const portableController = createPortableMediaController({
    getState: () => getRuntime()?.store.getState() || {},
    updateState: (updater) => getRuntime()?.store.update(updater),
    getVideoElement: options.getVideoElement,
    getWindow: () => getRuntime()?.context?.win || context.win || window,
    seekToMatchMs: options.seekToMatchMs,
    repository,
  });
  const captureController = createMediaCaptureController({
    captureService: createLocalMediaCaptureService({ win: getRuntime()?.context?.win || context.win || window }),
    connectCapturedFile: productionController.connectAngleFile,
    getCurrentMatchMs: options.getCurrentMatchMs,
    getState: () => getRuntime()?.store.getState() || {},
    getWindow: () => getRuntime()?.context?.win || context.win || window,
    updateState: (updater) => getRuntime()?.store.update(updater),
  });
  const proxyController = createMediaProxyController({
    getCurrentMatchMs: options.getCurrentMatchMs,
    getState: () => getRuntime()?.store.getState() || {},
    getVideoElement: options.getVideoElement,
    getWindow: () => getRuntime()?.context?.win || context.win || window,
    refreshPlayback: (matchMs, play) => {
      const win = getRuntime()?.context?.win || context.win || window;
      win.requestAnimationFrame?.(() => {
        options.seekToMatchMs?.(matchMs);
        const video = options.getVideoElement?.();
        if (play) video?.play?.().catch?.(() => {});
        productionController.syncSecondaryVideos(video);
      });
    },
    updateState: (updater) => getRuntime()?.store.update(updater),
  });
  const controller = {
    handleChange: (event) => proxyController.handleChange(event) || productionController.handleChange(event),
    handleClick: (event) => portableController.handleClick(event) || captureController.handleClick(event) || proxyController.handleClick(event) || productionController.handleClick(event),
    handleVideoTimeUpdate: (video) => proxyController.handleVideoTimeUpdate(video) || productionController.handleVideoTimeUpdate(video),
    initialize: async (force) => {
      captureController.initialize();
      const productionReady = await productionController.initialize(force);
      const portableReady = await portableController.initialize(force);
      return productionReady || portableReady;
    },
    syncSecondaryVideos: productionController.syncSecondaryVideos,
  };
  return {
    captureController,
    controller,
    dispose: () => Promise.all([captureController.dispose(), portableController.dispose(), proxyController.dispose()]),
    portableController,
    proxyController,
    repository,
  };
}
