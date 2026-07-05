import { clipMiniGamePrincipleLabels, miniGamePrincipleLabel } from "../services/miniGamePrincipleService.js";
import { isPhaseOnlyClip, isPlayerOnlyClip, isSubPhaseOnlyClip } from "../services/clipInstanceService.js";

export function clipValue(clip = {}, camelKey = "", snakeKey = "") {
  return clip[camelKey] ?? clip[snakeKey] ?? "";
}

export function getClipStartMs(clip = {}) {
  return Math.max(0, Math.round(Number(clipValue(clip, "startMs", "start_ms") || 0)));
}

export function getClipEndMs(clip = {}) {
  const startMs = getClipStartMs(clip);
  const endMs = Math.round(Number(clipValue(clip, "endMs", "end_ms") || startMs + 1000));
  return Math.max(startMs + 100, endMs);
}

export function getClipDurationMs(clip = {}) {
  return Math.max(100, getClipEndMs(clip) - getClipStartMs(clip));
}

export function firstPlayerLabel(clip = {}) {
  const player = Array.isArray(clip.players) ? clip.players[0] : null;
  return player?.player_label || player?.playerLabel || player?.player_id || player?.playerId || "Unit";
}

export function playerLaneLabels(clip = {}) {
  const labels = (Array.isArray(clip.players) ? clip.players : [])
    .map((player) => player?.player_label || player?.playerLabel || player?.name || player?.player_id || player?.playerId || "")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(labels)];
}

export function firstDescriptorValue(clip = {}, type = "") {
  return (clip.descriptors || []).find((entry) => (
    entry.descriptor_type === type || entry.type === type
  ))?.descriptor_value || "";
}

export function getClipMiniGamePrincipleLabel(clip = {}) {
  const labels = clipMiniGamePrincipleLabels(clip);
  if (labels.length) return labels.join(" + ");
  const id = String(clipValue(clip, "miniGamePrincipleId", "mini_game_principle_id") || "");
  return miniGamePrincipleLabel(id) || "No MG principle";
}

export function getTimelineLaneValue(clip = {}, laneMode = "phase") {
  return getTimelineLaneValues(clip, laneMode)[0] || "Uncoded";
}

export function getTimelineLaneValues(clip = {}, laneMode = "phase") {
  if (laneMode === "all") return ["All Tags"];
  if (laneMode === "player") {
    const players = playerLaneLabels(clip);
    if (players.length) return players;
    return isPlayerOnlyClip(clip) ? ["Player"] : [];
  }
  if (isPhaseOnlyClip(clip)) {
    if (laneMode === "phase") return [clipValue(clip, "phase", "phase") || "Phase"];
    if (laneMode === "subPhase") return [];
  }
  if (isPlayerOnlyClip(clip) && (laneMode === "phase" || laneMode === "subPhase")) return [];
  if (isSubPhaseOnlyClip(clip) && laneMode === "phase") return [];
  if (laneMode === "tags") return [Array.isArray(clip.tags) && clip.tags.length ? clip.tags[0] : "No tag"];
  if (laneMode === "unit") return [firstDescriptorValue(clip, "unit") || "Unit"];
  if (laneMode === "outcome") return [clipValue(clip, "outcome", "outcome") || "Neutral"];
  if (laneMode === "subPhase") return [clipValue(clip, "subPhase", "sub_phase") || "No sub-phase"];
  if (laneMode === "miniGamePrinciple") return [getClipMiniGamePrincipleLabel(clip)];
  return [clipValue(clip, "phase", "phase") || "Uncoded"];
}

export function getClipPrimaryLabel(clip = {}, laneMode = "phase") {
  if (isPhaseOnlyClip(clip)) return clipValue(clip, "phase", "phase") || "Phase";
  if (isSubPhaseOnlyClip(clip)) return clipValue(clip, "subPhase", "sub_phase") || "Sub-phase";
  if (isPlayerOnlyClip(clip)) return firstPlayerLabel(clip);
  if (laneMode === "outcome") return clipValue(clip, "phase", "phase") || "Uncoded";
  if (laneMode === "tags") return clipValue(clip, "outcome", "outcome") || "Neutral";
  return clipValue(clip, "outcome", "outcome") || getTimelineLaneValue(clip, laneMode);
}

export function getClipSecondaryLabel(clip = {}) {
  if (isPhaseOnlyClip(clip)) return "Phase";
  if (isSubPhaseOnlyClip(clip)) return clipValue(clip, "phase", "phase") || "Sub-phase";
  if (isPlayerOnlyClip(clip)) return firstPlayerLabel(clip);
  const phase = clipValue(clip, "phase", "phase") || "Uncoded";
  const subPhase = clipValue(clip, "subPhase", "sub_phase") || "";
  const player = firstPlayerLabel(clip);
  return [phase, subPhase, player].filter(Boolean).join(" / ");
}

export function getSelectedClip(clips = [], selectedClipId = "") {
  return clips.find((clip) => clip.id === selectedClipId) || null;
}
