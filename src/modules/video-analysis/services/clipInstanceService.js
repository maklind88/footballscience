import { normalizeClipInstance, normalizeMs } from "../domain/clipInstance.model.js";
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
    tags: splitTags(draft.tags),
    players: selectedPlayer
      ? [{ playerId: selectedPlayer.id, playerLabel: selectedPlayer.name, role: draft.playerRole || "primary" }]
      : [],
    notes: draft.note ? [{ note: draft.note }] : [],
  });
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
    tags: clip.tags || [],
    players: clip.players || [],
    note: clip.notes?.[0]?.note || "",
  };
}
