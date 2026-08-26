import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { trackingMetadataPayload } from "./trackingReviewService.js";

export async function persistTrackingTrack(trackValue = {}, options = {}) {
  let track = normalizeObjectTrack(trackValue);
  const previousTrackId = track.id;
  track = normalizeObjectTrack({
    ...track,
    metadata: {
      ...(track.metadata || {}),
      localWorkspaceTrackKey: String(track.metadata?.localWorkspaceTrackKey || track.id || ""),
    },
  });
  let localError = null;
  let remoteError = null;
  if (options.persistLocalTrack) {
    try {
      await options.persistLocalTrack(track, { previousTrackId, syncStatus: "pending" });
    } catch (error) {
      localError = error;
    }
  }
  if (options.persistMetadata) {
    try {
      const payload = await options.persistMetadata(trackingMetadataPayload(track));
      const remoteTrack = payload?.objectTrack || payload?.track || {};
      track = normalizeObjectTrack({
        ...track,
        ...remoteTrack,
        segments: track.segments,
        corrections: track.corrections,
        metadata: { ...(remoteTrack.metadata || {}), ...(track.metadata || {}) },
      });
    } catch (error) {
      remoteError = error;
    }
  }
  if (!remoteError && track.status === "archived" && options.removeLocalTrack) {
    try {
      await options.removeLocalTrack(track.id, { previousTrackId });
      localError = null;
    } catch (error) {
      localError = error;
    }
  } else if (!remoteError && options.persistLocalTrack) {
    try {
      await options.persistLocalTrack(track, { previousTrackId, syncStatus: "synced" });
      localError = null;
    } catch (error) {
      localError = error;
    }
  }
  const localWorkspaceStatus = remoteError
    ? localError ? "unprotected" : "pending-central"
    : localError
      ? "unprotected"
      : track.status === "archived" && options.removeLocalTrack
        ? "removed"
        : options.persistLocalTrack ? "ready" : "session-only";
  return normalizeObjectTrack({
    ...track,
    metadata: {
      ...(track.metadata || {}),
      localWorkspaceStatus,
      localWorkspaceError: remoteError?.message || localError?.message || "",
      centralSyncPending: Boolean(remoteError),
    },
  });
}
