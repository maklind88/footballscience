import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import { isPlayerOnlyClip } from "./clipInstanceService.js";
import { clipMiniGamePrincipleLabels } from "./miniGamePrincipleService.js";

export const clipLibraryGroupModes = Object.freeze([
  { id: "subPhase", label: "Sub-phase" },
  { id: "player", label: "Player" },
  { id: "miniGamePrinciple", label: "MG Principle" },
  { id: "outcome", label: "Outcome" },
]);

export function clipStartMs(clip = {}) {
  return Math.max(0, Math.round(Number(clip.startMs ?? clip.start_ms ?? 0)));
}

export function clipEndMs(clip = {}) {
  const startMs = clipStartMs(clip);
  return Math.max(startMs + 1, Math.round(Number(clip.endMs ?? clip.end_ms ?? startMs + 1)));
}

export function clipDurationMs(clip = {}) {
  return Math.max(1, clipEndMs(clip) - clipStartMs(clip));
}

export function playerEntries(clip = {}) {
  return (Array.isArray(clip.players) ? clip.players : [])
    .map((player) => ({
      id: String(player.player_id || player.playerId || player.id || "").trim(),
      label: String(player.player_label || player.playerLabel || player.name || player.player_id || player.playerId || "").trim(),
    }))
    .filter((player) => player.id || player.label);
}

export function uniqueClipValues(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function clipLibraryGroupValues(clip = {}, groupBy = "subPhase") {
  if (groupBy === "player") {
    const players = playerEntries(clip).map((player) => player.label || player.id).filter(Boolean);
    return players.length ? uniqueClipValues(players) : ["Unit clips"];
  }
  if (groupBy === "miniGamePrinciple") {
    const labels = clipMiniGamePrincipleLabels(clip);
    return labels.length ? labels : ["No MG principle"];
  }
  if (groupBy === "outcome") return [String(clip.outcome || "Neutral").trim() || "Neutral"];
  if (isPlayerOnlyClip(clip)) return ["Player"];
  return [String(clip.subPhase || clip.sub_phase || "No sub-phase").trim() || "No sub-phase"];
}

function modeOrder(mode = "subPhase") {
  if (mode === "subPhase") return new Map(videoAnalysisSubPhases.map((label, index) => [label, index]));
  if (mode === "outcome") return new Map(videoAnalysisOutcomes.map((label, index) => [label, index]));
  if (mode === "miniGamePrinciple") return new Map(miniGamePrinciples.map((principle, index) => [principle.label, index]));
  return new Map();
}

export function buildClipLibraryGroups(clips = [], groupBy = "subPhase") {
  const groups = new Map();
  for (const clip of clips) {
    for (const value of clipLibraryGroupValues(clip, groupBy)) {
      const list = groups.get(value) || [];
      list.push(clip);
      groups.set(value, list);
    }
  }
  const order = modeOrder(groupBy);
  return [...groups.entries()]
    .map(([label, groupClips]) => ({
      label,
      clips: groupClips.slice().sort((a, b) => clipStartMs(a) - clipStartMs(b)),
      durationMs: groupClips.reduce((total, clip) => total + clipDurationMs(clip), 0),
    }))
    .sort((a, b) => {
      const aOrder = order.has(a.label) ? order.get(a.label) : Number.MAX_SAFE_INTEGER;
      const bOrder = order.has(b.label) ? order.get(b.label) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.label.localeCompare(b.label);
    });
}

export function buildClipLibraryClipOrder(clips = [], groupBy = "subPhase") {
  const seen = new Set();
  const orderedIds = [];
  for (const group of buildClipLibraryGroups(clips, groupBy)) {
    for (const clip of group.clips || []) {
      const id = String(clip?.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      orderedIds.push(id);
    }
  }
  return orderedIds;
}

export function buildClipLibraryStats(clips = []) {
  return {
    clips: clips.length,
    durationMs: clips.reduce((total, clip) => total + clipDurationMs(clip), 0),
    subPhases: uniqueClipValues(clips.map((clip) => (isPlayerOnlyClip(clip) ? "Player" : clip.subPhase || clip.sub_phase))).length,
    players: uniqueClipValues(clips.flatMap((clip) => playerEntries(clip).map((player) => player.label || player.id))).length,
    principles: uniqueClipValues(clips.flatMap((clip) => clipMiniGamePrincipleLabels(clip))).length,
  };
}

export function clipMatchesLibraryGroup(clip = {}, groupBy = "subPhase", value = "") {
  const target = String(value || "").trim();
  if (!target) return false;
  return clipLibraryGroupValues(clip, groupBy).includes(target);
}
