import { miniGamePrinciplePickerGroups, miniGamePrinciplePickerIds } from "../constants/miniGamePrinciples.js";
import { uniqueMiniGamePrincipleIds } from "./miniGamePrincipleService.js";

const pickerMiniGamePrincipleIdSet = new Set(miniGamePrinciplePickerIds);
const pickerMiniGamePrinciples = miniGamePrinciplePickerGroups.flatMap((group) => (
  group.principles.map((principle) => ({ ...principle, groupLabel: group.label }))
));

export function isPickerMiniGamePrincipleId(id = "") {
  return pickerMiniGamePrincipleIdSet.has(String(id || "").trim());
}

export function pickerVisibleMiniGamePrincipleIds(ids = []) {
  return uniqueMiniGamePrincipleIds(ids).filter((id) => pickerMiniGamePrincipleIdSet.has(id));
}

export function firstMiniGamePrincipleSearchMatchId(search = "") {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return "";
  return pickerMiniGamePrinciples.find((principle) => (
    [principle.label, principle.id, principle.groupLabel]
      .some((value) => String(value || "").toLowerCase().includes(query))
  ))?.id || "";
}

export function patchMiniGamePrincipleDraftState(state = {}, ids = []) {
  return {
    ...state,
    draft: {
      ...(state.draft || {}),
      miniGamePrincipleId: ids[0] || "",
      miniGamePrincipleIds: ids,
    },
    codingSession: {
      ...(state.codingSession || {}),
      miniGamePrincipleDraftIds: ids,
      miniGamePrinciplePickerOpen: true,
    },
  };
}

export function defaultMomentTagDurationMs(state = {}) {
  return Math.max(1000, Number(state.template?.defaultClipDurationMs || state.codingSession?.defaultClipDurationMs || 15000));
}

export function buildMiniGamePrincipleCapture(state = {}, startMs = 0, targetClip = null) {
  const draft = state.draft || {};
  const clip = targetClip || {};
  const players = Array.isArray(clip.players) ? clip.players : [];
  const player = players[0] || null;
  return {
    startMs: Math.max(0, Math.round(Number(startMs || 0))),
    durationMs: defaultMomentTagDurationMs(state),
    targetClipId: clip.id || "",
    period: clip.period || draft.period || "1",
    phase: clip.phase || clip.phase_id || draft.phase || "",
    subPhase: clip.subPhase || clip.sub_phase || draft.subPhase || "",
    teamPrincipleId: clip.teamPrincipleId || clip.team_principle_id || draft.teamPrincipleId || "",
    outcome: clip.outcome || draft.outcome || "",
    playerId: player?.playerId || player?.player_id || draft.playerId || "",
    playerRole: player?.role || draft.playerRole || "primary",
    unit: draft.unit || "",
    pitchZone: draft.pitchZone || "",
    pressure: draft.pressure || "",
    decision: draft.decision || "",
    execution: draft.execution || "",
    visibility: clip.visibility || draft.visibility || draft.clipVisibility || "private",
  };
}

export function closeMiniGamePrinciplePickerState(state = {}) {
  return {
    ...state,
    codingSession: {
      ...(state.codingSession || {}),
      miniGamePrinciplePickerOpen: false,
      miniGamePrincipleSearch: "",
      miniGamePrincipleCapture: null,
    },
  };
}

export function closeUnitPickerState(state = {}) {
  return {
    ...state,
    codingSession: {
      ...(state.codingSession || {}),
      unitPickerOpen: false,
      unitEditorOpen: false,
      unitEditorDraft: [],
      unitCapture: null,
    },
  };
}

export function closeUnitEditorState(state = {}) {
  return {
    ...state,
    codingSession: {
      ...(state.codingSession || {}),
      unitEditorOpen: false,
      unitEditorDraft: [],
    },
  };
}

export function nextUnitEditorLabel(options = []) {
  const labels = new Set((Array.isArray(options) ? options : [])
    .map((option) => String(option || "").trim().toLowerCase())
    .filter(Boolean));
  if (!labels.has("new unit")) return "New unit";
  let index = 2;
  while (labels.has(`new unit ${index}`)) index += 1;
  return `New unit ${index}`;
}

export function clipHasTag(clip = {}, tag = "") {
  const target = String(tag || "").trim().toLowerCase();
  if (!target) return true;
  return (Array.isArray(clip.tags) ? clip.tags : [])
    .some((value) => String(value || "").trim().toLowerCase() === target);
}

export function clipMatchesOwner(clip = {}, ownerId = "") {
  const target = String(ownerId || "").trim();
  if (!target) return true;
  return String(clip.ownerId || clip.owner_id || clip.createdBy || clip.created_by || "").trim() === target;
}
