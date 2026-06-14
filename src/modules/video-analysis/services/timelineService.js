function clipValue(clip = {}, camelKey = "", snakeKey = "") {
  return clip[camelKey] ?? clip[snakeKey] ?? "";
}

function firstPlayerLabel(clip = {}) {
  const player = Array.isArray(clip.players) ? clip.players[0] : null;
  return player?.player_label || player?.playerLabel || player?.player_id || player?.playerId || "Unit";
}

function firstDescriptorValue(clip = {}, type = "") {
  return (clip.descriptors || []).find((entry) => entry.descriptor_type === type || entry.type === type)?.descriptor_value || "";
}

export function getTimelineLaneValue(clip = {}, laneMode = "phase") {
  if (laneMode === "player") return firstPlayerLabel(clip);
  if (laneMode === "unit") return firstDescriptorValue(clip, "unit") || "Unit";
  if (laneMode === "outcome") return clipValue(clip, "outcome", "outcome") || "Neutral";
  return clipValue(clip, "phase", "phase") || "Uncoded";
}

export function buildTimelineLanes(clips = [], laneMode = "phase") {
  const map = new Map();
  for (const clip of clips) {
    const label = getTimelineLaneValue(clip, laneMode);
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(clip);
  }
  return [...map.entries()].map(([label, laneClips]) => ({ id: label, label, clips: laneClips }));
}

export function clipBlockStyle(clip = {}, durationMs = 1, zoom = 1) {
  const safeDuration = Math.max(1, Number(durationMs || 1) / Math.max(1, Number(zoom || 1)));
  const startMs = Number(clipValue(clip, "startMs", "start_ms") || 0);
  const endMs = Number(clipValue(clip, "endMs", "end_ms") || startMs + 1000);
  const left = Math.max(0, (startMs / safeDuration) * 100);
  const width = Math.max(1.5, ((Math.max(startMs + 100, endMs) - startMs) / safeDuration) * 100);
  return `left:${Math.min(99, left)}%;width:${Math.min(100 - Math.min(99, left), width)}%;`;
}

export function trimClipDraft(draft = {}, edge = "end", deltaMs = 100) {
  const startMs = Math.max(0, Math.round(Number(draft.startMs || 0)));
  const endMs = Math.max(startMs + 100, Math.round(Number(draft.endMs || startMs + 5000)));
  if (edge === "start") return { ...draft, startMs: Math.max(0, Math.min(endMs - 100, startMs + deltaMs)) };
  return { ...draft, endMs: Math.max(startMs + 100, endMs + deltaMs) };
}

export function playheadStyle(playheadMs = 0, durationMs = 1, zoom = 1) {
  const safeDuration = Math.max(1, Number(durationMs || 1) / Math.max(1, Number(zoom || 1)));
  return `left:${Math.min(99.5, Math.max(0, (Number(playheadMs || 0) / safeDuration) * 100))}%;`;
}
