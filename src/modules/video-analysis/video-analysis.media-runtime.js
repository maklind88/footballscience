import { createMediaCaptureController } from "./controllers/mediaCaptureController.js";
import { createMediaProductionController } from "./controllers/mediaProductionController.js";
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
  const captureController = createMediaCaptureController({
    captureService: createLocalMediaCaptureService({ win: getRuntime()?.context?.win || context.win || window }),
    connectCapturedFile: productionController.connectAngleFile,
    getCurrentMatchMs: options.getCurrentMatchMs,
    getState: () => getRuntime()?.store.getState() || {},
    getWindow: () => getRuntime()?.context?.win || context.win || window,
    updateState: (updater) => getRuntime()?.store.update(updater),
  });
  const controller = {
    handleChange: productionController.handleChange,
    handleClick: (event) => captureController.handleClick(event) || productionController.handleClick(event),
    handleVideoTimeUpdate: productionController.handleVideoTimeUpdate,
    initialize: (force) => {
      captureController.initialize();
      return productionController.initialize(force);
    },
    syncSecondaryVideos: productionController.syncSecondaryVideos,
  };
  return {
    captureController,
    controller,
    dispose: () => captureController.dispose(),
    repository,
  };
}
