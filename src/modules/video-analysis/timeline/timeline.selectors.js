import { clipMiniGamePrincipleLabels, miniGamePrincipleLabel } from "../services/miniGamePrincipleService.js";
import {
  isMiniGamePrincipleOnlyClip,
  isPhaseOnlyClip,
  isPlayerOnlyClip,
  isSubPhaseOnlyClip,
  isUnitOnlyClip,
} from "../services/clipInstanceService.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";

const phaseLabels = new Set(videoAnalysisPhases);
const subPhaseLabels = new Set(videoAnalysisSubPhases);

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

export function tagLaneLabels(clip = {}) {
  const labels = (Array.isArray(clip.tags) ? clip.tags : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(labels)];
}

export function inferredTimelineClipKind(clip = {}) {
  if (isPlayerOnlyClip(clip)) return "player";
  if (isPhaseOnlyClip(clip)) return "phase";
  if (isSubPhaseOnlyClip(clip)) return "subPhase";
  if (isMiniGamePrincipleOnlyClip(clip)) return "miniGamePrinciple";
  if (isUnitOnlyClip(clip)) return "unit";
  const phase = String(clipValue(clip, "phase", "phase") || "").trim();
  const subPhase = String(clipValue(clip, "subPhase", "sub_phase") || "").trim();
  if (subPhase === "Player" && playerLaneLabels(clip).length) return "player";
  if (subPhaseLabels.has(subPhase)) return "subPhase";
  if (phaseLabels.has(phase) && (!subPhase || subPhase === "Phase" || subPhase === phase || phaseLabels.has(subPhase))) {
    return "phase";
  }
  return "";
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

export function getClipMiniGamePrincipleLaneLabels(clip = {}) {
  const labels = clipMiniGamePrincipleLabels(clip);
  if (labels.length) return labels;
  const id = String(clipValue(clip, "miniGamePrincipleId", "mini_game_principle_id") || "").trim();
  const label = miniGamePrincipleLabel(id);
  return label ? [label] : [];
}

export function getTimelineLaneValue(clip = {}, laneMode = "phase") {
  return getTimelineLaneValues(clip, laneMode)[0] || "Uncoded";
}

function prefixedLaneLabels(prefix = "", labels = []) {
  return labels
    .map((label) => String(label || "").trim())
    .filter(Boolean)
    .map((label) => `${prefix} / ${label}`);
}

export function getAllTimelineLaneValues(clip = {}) {
  return [
    ...getTimelineLaneValues(clip, "phase").map((label) => `Phase / ${label}`),
    ...getTimelineLaneValues(clip, "subPhase").map((label) => `Sub-phase / ${label}`),
    ...prefixedLaneLabels("MG Principle", getClipMiniGamePrincipleLaneLabels(clip)),
    ...prefixedLaneLabels("Tag", tagLaneLabels(clip)),
    ...prefixedLaneLabels("Player", playerLaneLabels(clip)),
    ...prefixedLaneLabels("Unit", getTimelineLaneValues(clip, "unit")),
  ];
}

export function getTimelineLaneValues(clip = {}, laneMode = "phase") {
  if (laneMode === "all") return getAllTimelineLaneValues(clip);
  const clipKind = inferredTimelineClipKind(clip);
  if (laneMode === "player") {
    const players = playerLaneLabels(clip);
    if (players.length) return players;
    return clipKind === "player" ? ["Player"] : [];
  }
  if (laneMode === "phase") {
    if (clipKind !== "phase") return [];
    const phase = String(clipValue(clip, "phase", "phase") || "").trim();
    return phaseLabels.has(phase) ? [phase] : [];
  }
  if (laneMode === "subPhase") {
    if (clipKind !== "subPhase") return [];
    const subPhase = String(clipValue(clip, "subPhase", "sub_phase") || "").trim();
    return subPhaseLabels.has(subPhase) ? [subPhase] : [];
  }
  if (laneMode === "unit") {
    const unit = firstDescriptorValue(clip, "unit");
    return unit ? [unit] : [];
  }
  if (laneMode === "miniGamePrinciple") return getClipMiniGamePrincipleLaneLabels(clip);
  return [clipValue(clip, "phase", "phase") || "Uncoded"];
}

export function getClipPrimaryLabel(clip = {}, laneMode = "phase") {
  if (isPhaseOnlyClip(clip)) return clipValue(clip, "phase", "phase") || "Phase";
  if (isSubPhaseOnlyClip(clip)) return clipValue(clip, "subPhase", "sub_phase") || "Sub-phase";
  if (isMiniGamePrincipleOnlyClip(clip)) return getClipMiniGamePrincipleLabel(clip);
  if (isPlayerOnlyClip(clip)) return firstPlayerLabel(clip);
  if (isUnitOnlyClip(clip)) return firstDescriptorValue(clip, "unit") || "Unit";
  return clipValue(clip, "outcome", "outcome") || getTimelineLaneValue(clip, laneMode);
}

export function getClipSecondaryLabel(clip = {}) {
  if (isPhaseOnlyClip(clip)) return "Phase";
  if (isSubPhaseOnlyClip(clip)) return clipValue(clip, "phase", "phase") || "Sub-phase";
  if (isMiniGamePrincipleOnlyClip(clip)) return clipValue(clip, "subPhase", "sub_phase") || "MG Principle";
  if (isPlayerOnlyClip(clip)) return firstPlayerLabel(clip);
  if (isUnitOnlyClip(clip)) return "Unit";
  const phase = clipValue(clip, "phase", "phase") || "Uncoded";
  const subPhase = clipValue(clip, "subPhase", "sub_phase") || "";
  const player = firstPlayerLabel(clip);
  return [phase, subPhase, player].filter(Boolean).join(" / ");
}

export function getSelectedClip(clips = [], selectedClipId = "") {
  return clips.find((clip) => clip.id === selectedClipId) || null;
}
