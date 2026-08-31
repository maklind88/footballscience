import { activeMediaAngle } from "./mediaProductionService.js";
import { selectedPresentationItem } from "./presentationService.js";

const fingerprintPattern = /^[a-f0-9]{64}$/i;

export function trackingSourceFingerprint(state = {}, itemOverride = null) {
  const angle = activeMediaAngle(state);
  const proxyFingerprint = String(
    state.mediaProduction?.proxy?.byAngleId?.[angle?.id]?.result?.sourceSha256 || "",
  ).trim();
  if (fingerprintPattern.test(proxyFingerprint)) return proxyFingerprint.toLowerCase();
  const item = itemOverride || selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
  const trackedFingerprint = (item?.objectTracks || []).find((track) => {
    const value = String(track.metadata?.localSourceSha256 || "");
    const trackAngleId = String(track.metadata?.angleId || "");
    return fingerprintPattern.test(value) && (!angle?.id || !trackAngleId || trackAngleId === angle.id);
  })?.metadata?.localSourceSha256;
  return fingerprintPattern.test(String(trackedFingerprint || ""))
    ? String(trackedFingerprint).toLowerCase()
    : "";
}
