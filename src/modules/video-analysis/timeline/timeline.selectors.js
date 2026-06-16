import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { teamPrinciples } from "../constants/principles.js";

const teamPrincipleLabels = new Map(teamPrinciples.map((item) => [item.id, item.label]));
const miniGamePrincipleLabels = new Map(miniGamePrinciples.map((item) => [item.id, item.label]));

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

export function firstDescriptorValue(clip = {}, type = "") {
  return (clip.descriptors || []).find((entry) => (
    entry.descriptor_type === type || entry.type === type
  ))?.descriptor_value || "";
}

export function getClipTeamPrincipleLabel(clip = {}) {
  const id = String(clipValue(clip, "teamPrincipleId", "team_principle_id") || "");
  return teamPrincipleLabels.get(id) || id || "No team principle";
}

export function getClipMiniGamePrincipleLabel(clip = {}) {
  const id = String(clipValue(clip, "miniGamePrincipleId", "mini_game_principle_id") || "");
  return miniGamePrincipleLabels.get(id) || id || "No mini-game principle";
}

export function getTimelineLaneValue(clip = {}, laneMode = "phase") {
  if (laneMode === "player") return firstPlayerLabel(clip);
  if (laneMode === "tags") return Array.isArray(clip.tags) && clip.tags.length ? clip.tags[0] : "No tag";
  if (laneMode === "unit") return firstDescriptorValue(clip, "unit") || "Unit";
  if (laneMode === "outcome") return clipValue(clip, "outcome", "outcome") || "Neutral";
  if (laneMode === "subPhase") return clipValue(clip, "subPhase", "sub_phase") || "No sub-phase";
  if (laneMode === "teamPrinciple") return getClipTeamPrincipleLabel(clip);
  if (laneMode === "miniGamePrinciple") return getClipMiniGamePrincipleLabel(clip);
  return clipValue(clip, "phase", "phase") || "Uncoded";
}

export function getClipPrimaryLabel(clip = {}, laneMode = "phase") {
  if (laneMode === "outcome") return clipValue(clip, "phase", "phase") || "Uncoded";
  if (laneMode === "tags") return clipValue(clip, "outcome", "outcome") || "Neutral";
  return clipValue(clip, "outcome", "outcome") || getTimelineLaneValue(clip, laneMode);
}

export function getClipSecondaryLabel(clip = {}) {
  const phase = clipValue(clip, "phase", "phase") || "Uncoded";
  const subPhase = clipValue(clip, "subPhase", "sub_phase") || "";
  const player = firstPlayerLabel(clip);
  return [phase, subPhase, player].filter(Boolean).join(" / ");
}

export function getSelectedClip(clips = [], selectedClipId = "") {
  return clips.find((clip) => clip.id === selectedClipId) || null;
}
