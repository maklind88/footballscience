import { normalizeClipInstance, normalizeMs } from "../domain/clipInstance.model.js";
import { descriptorApiKeys } from "../constants/descriptors.js";
import { isValidCodingSelection, splitTags } from "./taggingService.js";

export function createClipDraftFromPlayerTime(draft = {}, videoElement) {
  const currentMs = normalizeMs((videoElement?.currentTime || 0) * 1000);
  return {
    ...draft,
    startMs: currentMs,
    endMs: currentMs + 5000,
  };
}

export function buildClipPayload(state = {}) {
  const draft = state.draft || {};
  const session = state.codingSession || {};
  if (!state.match?.id || !state.video?.id) {
    throw new Error("Load a local video before saving a clip.");
  }
  if (!isValidCodingSelection(draft)) {
    throw new Error("Choose a valid phase, principle, mini-game principle, and outcome.");
  }
  const selectedPlayer = (state.players || []).find((player) => player.id === draft.playerId);
  return normalizeClipInstance({
    matchId: state.match.id,
    videoId: state.video.id,
    startMs: draft.startMs,
    endMs: draft.endMs,
    period: draft.period,
    phase: draft.phase,
    subPhase: draft.subPhase,
    teamPrincipleId: draft.teamPrincipleId,
    miniGamePrincipleId: draft.miniGamePrincipleId,
    outcome: draft.outcome,
    codingMode: session.mode || "manual",
    codingTemplateId: state.template?.databaseId || state.template?.id || "",
    codingButtonId: session.activeButtonDatabaseId || session.activeButtonId || "",
    preRollMs: session.preRollMs || 0,
    postRollMs: session.postRollMs || 0,
    tags: splitTags(draft.tags),
    descriptors: buildDescriptorPayload(draft, selectedPlayer),
    players: selectedPlayer
      ? [{ playerId: selectedPlayer.id, playerLabel: selectedPlayer.name, role: draft.playerRole || "primary" }]
      : [],
    notes: draft.note ? [{ note: draft.note }] : [],
  });
}

export function buildDescriptorPayload(draft = {}, selectedPlayer = null) {
  const descriptorKeys = ["unit", "pitchZone", "pressure", "decision", "execution"];
  const descriptors = descriptorKeys
    .map((key) => ({ type: descriptorApiKeys[key] || key, value: draft[key] || "", label: draft[key] || "" }))
    .filter((entry) => entry.value);
  if (selectedPlayer) descriptors.unshift({ type: "player", value: selectedPlayer.id, label: selectedPlayer.name });
  return descriptors;
}

export function toApiClipPayload(clip = {}) {
  return {
    matchId: clip.matchId,
    videoId: clip.videoId,
    startMs: clip.startMs,
    endMs: clip.endMs,
    period: clip.period,
    phase: clip.phase,
    subPhase: clip.subPhase,
    teamPrincipleId: clip.teamPrincipleId,
    miniGamePrincipleId: clip.miniGamePrincipleId,
    outcome: clip.outcome,
    codingMode: clip.codingMode,
    codingTemplateId: clip.codingTemplateId,
    codingButtonId: clip.codingButtonId,
    preRollMs: clip.preRollMs,
    postRollMs: clip.postRollMs,
    tags: clip.tags || [],
    descriptors: clip.descriptors || [],
    players: clip.players || [],
    note: clip.notes?.[0]?.note || "",
  };
}
