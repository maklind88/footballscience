import { createTrackingController } from "./controllers/trackingController.js";
import { createTrackingRepository } from "./repositories/trackingRepository.js";
import { inspectLocalTrackingProvider, trackLocalObject } from "./services/localTrackingService.js";
import { activeMediaAngle, mediaReferenceForAngle } from "./services/mediaProductionService.js";
import { matchTimeToAngleTime } from "./services/multiAngleSyncService.js";

export function localTrackingRequest(request = {}, state = {}) {
  const angle = activeMediaAngle(state);
  const prompt = request.prompt || {};
  const sourceStartMs = angle ? matchTimeToAngleTime(prompt.startMs, angle) : prompt.startMs;
  const sourceEndMs = angle ? matchTimeToAngleTime(prompt.endMs, angle) : prompt.endMs;
  const sourcePromptAtMs = angle ? matchTimeToAngleTime(prompt.promptAtMs, angle) : prompt.promptAtMs;
  return {
    ...request,
    videoRef: mediaReferenceForAngle(state, angle) || request.videoRef || state.videoRef,
    videoId: angle?.videoId || request.videoId,
    prompt: {
      ...prompt,
      angleId: angle?.id || "",
      sourceStartMs,
      sourceEndMs: Math.max(sourceStartMs + 1, sourceEndMs),
      sourcePromptAtMs: Math.max(sourceStartMs, Math.min(sourceEndMs, sourcePromptAtMs)),
      syncOffsetMs: Number(angle?.syncOffsetMs) || 0,
      driftPpm: Number(angle?.driftPpm) || 0,
    },
  };
}

export function createVideoAnalysisTrackingRuntime(options = {}) {
  const context = options.context || {};
  const getRuntime = options.getRuntime || (() => null);
  const repository = createTrackingRepository(context);
  const controller = createTrackingController({
    getState: () => getRuntime()?.store.getState() || {},
    updateState: (updater) => getRuntime()?.store.update(updater),
    getVideoElement: options.getVideoElement,
    getCurrentMatchMs: options.getCurrentMatchMs,
    getWindow: () => getRuntime()?.context?.win || context.win || window,
    getReviewer: () => {
      const user = getRuntime()?.context?.currentUser || context.currentUser || {};
      return user.id || user.userId || user.user_id || "local-analyst";
    },
    inspectProvider: () => {
      const runtime = getRuntime();
      return inspectLocalTrackingProvider(runtime?.context?.win || context.win || window);
    },
    trackObject: (request) => {
      const runtime = getRuntime();
      return trackLocalObject({
        ...localTrackingRequest(request, runtime?.store.getState() || {}),
        win: runtime?.context?.win || context.win || window,
      });
    },
    persistTrack: (track) => repository.saveObjectTrack(track),
    persistCorrection: (correction) => repository.saveCorrection(correction),
    persistGraphic: (graphic) => repository.saveDynamicGraphic(graphic),
  });
  return { controller, repository };
}
