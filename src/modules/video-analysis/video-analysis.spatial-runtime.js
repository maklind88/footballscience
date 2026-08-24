import { createSpatialController } from "./controllers/spatialController.js";
import { createSpatialRepository } from "./repositories/spatialRepository.js";

export function createVideoAnalysisSpatialRuntime(options = {}) {
  const context = options.context || {};
  const getRuntime = options.getRuntime || (() => null);
  const repository = createSpatialRepository(context);
  const controller = createSpatialController({
    getState: () => getRuntime()?.store.getState() || {},
    updateState: (updater) => getRuntime()?.store.update(updater),
    getVideoElement: options.getVideoElement,
    loadCalibration: (videoId, sourceId) => repository.getCalibration(videoId, sourceId),
    persistCalibration: (calibration) => repository.saveCalibration(calibration),
    persistGraphic: (graphic) => getRuntime()?.tracking.saveDynamicGraphic(graphic),
  });
  return { controller, repository };
}
