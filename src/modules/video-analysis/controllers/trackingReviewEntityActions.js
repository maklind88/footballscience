import {
  applyTrackingEntityCorrection,
  applyTrackingIdentityCorrection,
} from "../services/trackingCorrectionService.js";

export function createTrackingReviewEntityActions(options = {}) {
  const {
    commitTrackChange,
    currentAtMs,
    getReviewer,
    getState,
    selectedContext,
    setError,
  } = options;

  function applyIdentity() {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    try {
      const prompt = state.presentation?.tracking?.prompt || {};
      const atMs = currentAtMs(state);
      const corrected = applyTrackingIdentityCorrection(context.track, prompt, {
        atMs,
        correctedBy: getReviewer?.() || "",
      });
      return commitTrackChange(context, corrected, {
        atMs,
        correctionType: "identity",
        playerId: corrected.playerId,
        playerLabel: corrected.playerLabel,
        reason: "Assigned player identity",
        metadata: { teamSide: corrected.teamSide, shirtNumber: corrected.shirtNumber },
      });
    } catch (error) {
      setError(error?.message || "Player identity could not be applied.");
      return true;
    }
  }

  function applyEntityType() {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    try {
      const atMs = currentAtMs(state);
      const previousEntityType = context.track.entityType;
      const corrected = applyTrackingEntityCorrection(
        context.track,
        state.presentation?.tracking?.prompt?.entityType,
        { atMs, correctedBy: getReviewer?.() || "" },
      );
      return commitTrackChange(context, corrected, {
        atMs,
        correctionType: "entity",
        reason: `Relabeled ${previousEntityType} as ${corrected.entityType}`,
        metadata: {
          previousEntityType,
          nextEntityType: corrected.entityType,
          playerAssignmentCleared: true,
        },
      });
    } catch (error) {
      setError(error?.message || "Object type could not be corrected.");
      return true;
    }
  }

  return { applyEntityType, applyIdentity };
}
