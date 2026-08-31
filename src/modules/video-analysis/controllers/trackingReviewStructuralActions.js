import { rejectTrackingTrack } from "../services/trackingReviewService.js";
import { mergeTrackingTracks } from "../services/trackingStructuralCorrectionService.js";
import { trackSnapshots } from "./trackingReviewHistory.js";

export function createTrackingReviewStructuralActions(options = {}) {
  function mergeSelectedTracks() {
    const state = options.getState();
    const context = options.selectedContext(state);
    const selectedIds = state.presentation?.tracking?.selectedTrackIds || [];
    const selectedTracks = selectedIds
      .map((trackId) => context.item?.objectTracks?.find((track) => track.id === trackId))
      .filter(Boolean);
    if (!context.item || selectedTracks.length !== 2) return false;
    try {
      const operationId = options.createOperationId("merge");
      const result = mergeTrackingTracks(selectedTracks[0], selectedTracks[1], {
        operationId,
        correctedBy: options.getReviewer?.() || "",
      });
      const indexes = selectedTracks.map((track) => (
        context.item.objectTracks.findIndex((entry) => entry.id === track.id)
      ));
      return options.commitCompound({
        id: operationId,
        itemId: context.item.id,
        type: "merge",
        atMs: result.atMs,
        sequence: options.nextSequence(),
        affectedTrackIds: [result.retainedTrackId, result.absorbedTrackId],
        before: trackSnapshots(context.item, selectedTracks, indexes),
        after: trackSnapshots(context.item, [result.merged], [Math.min(...indexes)]),
        selectedBefore: [...selectedIds],
        selectedAfter: [result.merged.id],
        bindingFallbacksByDirection: {
          after: { [result.absorbedTrackId]: result.retainedTrackId },
        },
        audits: [{
          operationId: `${operationId}:retained`,
          trackId: result.merged.id,
          atMs: result.atMs,
          correctionType: "merge",
          reason: "Merged reviewed trajectory fragments",
          metadata: {
            operationGroupId: operationId,
            mergedTrackId: result.absorbedTrackId,
          },
        }],
      });
    } catch (error) {
      options.setError(error?.message || "The selected trajectory fragments could not be merged.");
      return true;
    }
  }

  function rejectSelectedTrack() {
    const state = options.getState();
    const context = options.selectedContext(state);
    if (!context.track) return false;
    try {
      const atMs = options.currentAtMs(state);
      const operationId = options.createOperationId("reject");
      const rejected = rejectTrackingTrack(context.track, {
        atMs,
        operationId,
        correctedBy: options.getReviewer?.() || "",
      });
      return options.commitTrackChange(context, rejected, {
        atMs,
        operationId,
        correctionType: "reject",
        reason: "Rejected false-positive trajectory",
        metadata: { disposition: "false-positive" },
      });
    } catch (error) {
      options.setError(error?.message || "The selected trajectory could not be rejected.");
      return true;
    }
  }

  return { mergeSelectedTracks, rejectSelectedTrack };
}
