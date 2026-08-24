import { createTrackingController } from "./controllers/trackingController.js";
import { createTrackingRepository } from "./repositories/trackingRepository.js";
import { trackLocalObject } from "./services/localTrackingService.js";

export function createVideoAnalysisTrackingRuntime(options = {}) {
  const context = options.context || {};
  const getRuntime = options.getRuntime || (() => null);
  const repository = createTrackingRepository(context);
  const controller = createTrackingController({
    getState: () => getRuntime()?.store.getState() || {},
    updateState: (updater) => getRuntime()?.store.update(updater),
    getVideoElement: options.getVideoElement,
    getCurrentMatchMs: options.getCurrentMatchMs,
    trackObject: (request) => trackLocalObject({
      ...request,
      win: getRuntime()?.context?.win || context.win || window,
    }),
    persistTrack: (track) => repository.saveObjectTrack(track),
    persistCorrection: (correction) => repository.saveCorrection(correction),
    persistGraphic: (graphic) => repository.saveDynamicGraphic(graphic),
  });
  return { controller, repository };
}
