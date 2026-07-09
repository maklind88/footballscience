const MOMENT_TOLERANCE_MS = 2000;

function normalizeText(value = "", maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeMetadata(metadata = {}) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function msOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function clipMomentKey(clip = {}) {
  const metadata = normalizeMetadata(clip.metadata);
  return normalizeText(metadata.momentKey || metadata.moment_key, 220);
}

function clipMomentStartMs(clip = {}) {
  const metadata = normalizeMetadata(clip.metadata);
  return msOrNull(metadata.timestampMs || metadata.timestamp_ms || clip.start_ms || clip.startMs);
}

function clipMomentEndMs(clip = {}) {
  const metadata = normalizeMetadata(clip.metadata);
  return msOrNull(clip.end_ms || clip.endMs || metadata.endMs || metadata.end_ms);
}

function clipsShareIdpMoment(first = {}, second = {}, toleranceMs = MOMENT_TOLERANCE_MS) {
  const firstKey = clipMomentKey(first);
  const secondKey = clipMomentKey(second);
  if (firstKey && secondKey && firstKey === secondKey) return true;

  const sameVideo = Boolean(first.video_id && second.video_id && first.video_id === second.video_id);
  const sameMatch = Boolean(first.match_id && second.match_id && first.match_id === second.match_id);
  if (first.video_id && second.video_id && !sameVideo) return false;
  if (!sameVideo && first.match_id && second.match_id && !sameMatch) return false;
  if (!sameVideo && !sameMatch) return false;

  const firstStart = clipMomentStartMs(first);
  const secondStart = clipMomentStartMs(second);
  if (firstStart === null || secondStart === null) return false;
  const safeToleranceMs = Math.max(0, Number(toleranceMs) || MOMENT_TOLERANCE_MS);
  return Math.abs(firstStart - secondStart) <= safeToleranceMs;
}

function uniqueMiniGamePrincipleLabels(labels = []) {
  const seen = new Set();
  const unique = [];
  for (const label of labels) {
    const value = normalizeText(label?.value || label?.label || label?.label_value || label?.label_text, 180);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    unique.push({
      type: "mini_game_principle",
      value,
      label: normalizeText(label?.label || label?.label_text || value, 220),
    });
  }
  return unique;
}

function aggregateMiniGamePrincipleLabelsForClip(targetClip = {}, relatedClips = [], labelsByClip = new Map()) {
  const labels = [...(labelsByClip.get(targetClip.id) || [])];
  for (const relatedClip of relatedClips) {
    if (!relatedClip?.id || relatedClip.id === targetClip.id) continue;
    if (!clipsShareIdpMoment(targetClip, relatedClip)) continue;
    labels.push(...(labelsByClip.get(relatedClip.id) || []));
  }
  return uniqueMiniGamePrincipleLabels(labels);
}

module.exports = {
  MOMENT_TOLERANCE_MS,
  aggregateMiniGamePrincipleLabelsForClip,
  clipMomentEndMs,
  clipMomentKey,
  clipMomentStartMs,
  clipsShareIdpMoment,
  uniqueMiniGamePrincipleLabels,
};
