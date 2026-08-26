const unavailableWorkspaceStatuses = new Set([
  "pending-central",
  "unprotected",
  "samples-missing",
]);

export function trackingGraphicBindingSelection(trackValues = [], selectedTrackIds = [], tool = "highlight") {
  const required = tool === "distance" ? 2 : 1;
  const trackIds = [...new Set(selectedTrackIds.map(String).filter(Boolean))].slice(0, required);
  if (trackIds.length < required) {
    return {
      ready: false,
      required,
      trackIds,
      reason: required === 2 ? "Select two tracks for distance." : "Select a track first.",
    };
  }
  const tracks = new Map(trackValues.map((track) => [String(track?.id || ""), track]));
  const selectedTracks = trackIds.map((trackId) => tracks.get(trackId));
  if (selectedTracks.some((track) => !track)) {
    return { ready: false, required, trackIds, reason: "A selected track is no longer available." };
  }
  if (selectedTracks.some((track) => unavailableWorkspaceStatuses.has(track.metadata?.localWorkspaceStatus))) {
    return {
      ready: false,
      required,
      trackIds,
      reason: "Synchronize the selected track before adding dynamic graphics.",
    };
  }
  return { ready: true, required, trackIds, reason: "" };
}
