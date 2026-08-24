import { createMediaProductionController } from "./controllers/mediaProductionController.js";
import { createMediaProductionRepository } from "./repositories/mediaProductionRepository.js";

export function createVideoAnalysisMediaRuntime(options = {}) {
  const context = options.context || {};
  const getRuntime = options.getRuntime || (() => null);
  const repository = createMediaProductionRepository(context);
  const controller = createMediaProductionController({
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
  return { controller, repository };
}
