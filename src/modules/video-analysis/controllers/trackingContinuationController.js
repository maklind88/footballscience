import {
  trackingContinuationSteps,
  trackingExtensionAvailability,
  trackingExtensionPrompt,
  trackingTargetRange,
} from "../services/trackingExtensionService.js";

const MAX_CONTINUATION_JOBS = 256;

export function createTrackingContinuationController(options = {}) {
  function reportError(error, fallback = "The object track could not be extended.") {
    options.setError?.(error?.message || fallback);
    return false;
  }

  function read(expectedTrackId = "") {
    const context = options.getContext?.() || {};
    if (!context.item || !context.track || context.provider?.status !== "ready") return null;
    if (expectedTrackId && context.track.id !== expectedTrackId) return null;
    return context;
  }

  async function extend(direction = "later", runOptions = {}) {
    const context = read(runOptions.expectedTrackId);
    if (!context) return reportError(null, "Select the same player track before continuing the range.");
    try {
      const range = trackingTargetRange(context.track, context.range);
      const prompt = trackingExtensionPrompt(context.track, range, direction, {
        maxDurationMs: context.provider.maxDurationMs,
      });
      return await options.runTracking?.({
        baseTrack: context.track,
        direction,
        prompt,
        batch: runOptions.batch || null,
      });
    } catch (error) {
      return reportError(error);
    }
  }

  async function complete() {
    const initial = read();
    if (!initial) return reportError(null, "Select a player track before completing its range.");
    const trackId = initial.track.id;
    const initialRange = trackingTargetRange(initial.track, initial.range);
    const initialPlan = trackingContinuationSteps(initial.track, initialRange, {
      maxDurationMs: initial.provider.maxDurationMs,
    });
    if (!initialPlan.total) return true;
    const startedAtMs = Number(options.now?.()) || Date.now();
    let completed = 0;
    let total = initialPlan.total;
    while (completed < MAX_CONTINUATION_JOBS) {
      const context = read(trackId);
      if (!context) return reportError(null, "Range completion stopped because the selected track changed.");
      const range = trackingTargetRange(context.track, context.range);
      const availability = trackingExtensionAvailability(context.track, range);
      if (!availability.earlier && !availability.later) return true;
      const remaining = trackingContinuationSteps(context.track, range, {
        maxDurationMs: context.provider.maxDurationMs,
      });
      total = Math.max(total, completed + remaining.total);
      const direction = availability.earlier ? "earlier" : "later";
      const ok = await extend(direction, {
        expectedTrackId: trackId,
        batch: { completed, total, startedAtMs },
      });
      if (!ok) return false;
      completed += 1;
    }
    return reportError(null, "Range completion stopped at the local safety limit.");
  }

  return { complete, extend };
}
