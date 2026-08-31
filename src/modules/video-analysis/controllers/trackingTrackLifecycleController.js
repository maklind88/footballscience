import { createManualPromptTrack, verifyObjectTrack } from "../services/trackingReviewService.js";
import { blockTrackingPreannotationPreview } from "../services/trackingPreannotationReviewGuard.js";
import { persistTrackingTrack } from "../services/trackingTrackPersistenceService.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
} from "./trackingControllerHelpers.js";

export function createTrackingTrackLifecycleController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});

  async function persistTrack(trackValue = {}) {
    const track = await persistTrackingTrack(trackValue, {
      persistLocalTrack: options.persistLocalTrack,
      persistMetadata: options.persistMetadata,
      removeLocalTrack: options.removeLocalTrack,
    });
    const status = track.metadata?.localWorkspaceStatus;
    if (["pending-central", "unprotected"].includes(status)) {
      updateState((state) => patchTrackingState(state, {
        workspace: {
          ...(state.presentation?.tracking?.workspace || {}),
          status: status === "pending-central" ? "pending-sync" : "attention",
          error: String(track.metadata?.localWorkspaceError || ""),
        },
      }));
    }
    return track;
  }

  async function addManualTrack() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const prompt = state.presentation?.tracking?.prompt;
    if (!item || !prompt?.box) return false;
    let track = createManualPromptTrack({
      ...prompt,
      clipId: item.clipId,
      videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
      teamId: state.video?.team_id || "",
    });
    try {
      track = await persistTrack(track);
    } catch {
      // The manual track remains usable locally if metadata persistence is temporarily unavailable.
    }
    updateState((current) => {
      const liveItem = selectedTrackingItem(current);
      if (!liveItem) return current;
      return patchTrackingState(replacePresentationItem(current, liveItem.id, {
        objectTracks: [...(liveItem.objectTracks || []), track],
      }), {
        selectedTrackIds: [track.id],
        captureMode: "",
        prompt: { ...prompt, box: null },
        error: "",
      });
    });
    options.invalidateGroundTruth?.(item.id);
    return true;
  }

  async function verifySelectedTrack() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
    const track = (item?.objectTracks || []).find((entry) => entry.id === trackId);
    if (!item || !track) return false;
    if (blockTrackingPreannotationPreview(
      track,
      (error) => updateState((current) => patchTrackingState(current, { error })),
      "verify",
    )) return false;
    try {
      const verified = await persistTrack(verifyObjectTrack(track));
      updateState((current) => {
        const liveItem = selectedTrackingItem(current);
        return liveItem ? replacePresentationItem(current, liveItem.id, {
          objectTracks: (liveItem.objectTracks || []).map((entry) => (
            entry.id === verified.id ? verified : entry
          )),
        }) : current;
      });
      options.invalidateGroundTruth?.(item.id);
      return true;
    } catch (error) {
      updateState((current) => patchTrackingState(current, {
        error: error.message || "Review the track before verification.",
      }));
      return false;
    }
  }

  return { addManualTrack, persistTrack, verifySelectedTrack };
}
