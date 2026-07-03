import { normalizeClipInstance, normalizeMs } from "../domain/clipInstance.model.js";
import { descriptorApiKeys } from "../constants/descriptors.js";
import { isValidCodingSelection, splitTags } from "./taggingService.js";
import { phaseForSubPhase, withPhaseForSubPhase } from "./footballLanguageService.js";
import { buildMiniGamePrincipleLabels, uniqueMiniGamePrincipleIds, withMiniGamePrinciples } from "./miniGamePrincipleService.js";

const playerOnlyClipKind = "player";

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
  const phase = phaseForSubPhase(draft.subPhase, draft.phase);
  if (!state.match?.id || !state.video?.id) {
    throw new Error("Load a local video before saving a clip.");
  }
  if (!isValidCodingSelection({ ...draft, phase })) {
    throw new Error("Choose a valid phase, sub-phase, and outcome.");
  }
  const selectedPlayer = (state.players || []).find((player) => player.id === draft.playerId);
  const miniGamePrincipleIds = uniqueMiniGamePrincipleIds([
    ...(Array.isArray(draft.miniGamePrincipleIds) ? draft.miniGamePrincipleIds : []),
    draft.miniGamePrincipleId,
  ]);
  return normalizeClipInstance({
    matchId: state.match.id,
    videoId: state.video.id,
    startMs: draft.startMs,
    endMs: draft.endMs,
    period: draft.period,
    phase,
    subPhase: draft.subPhase,
    teamPrincipleId: draft.teamPrincipleId,
    miniGamePrincipleId: miniGamePrincipleIds[0] || "",
    outcome: draft.outcome,
    codingMode: session.mode || "manual",
    codingTemplateId: state.template?.databaseId || state.template?.id || "",
    codingButtonId: session.activeButtonDatabaseId || session.activeButtonId || "",
    preRollMs: session.preRollMs || 0,
    postRollMs: session.postRollMs || 0,
    visibility: selectedPlayer ? "idp" : draft.visibility || draft.clipVisibility || "private",
    tags: splitTags(draft.tags),
    descriptors: buildDescriptorPayload(draft, selectedPlayer),
    labels: buildMiniGamePrincipleLabels(miniGamePrincipleIds),
    metadata: draft.metadata && typeof draft.metadata === "object" ? draft.metadata : {},
    players: selectedPlayer
      ? [{ playerId: selectedPlayer.id, playerLabel: selectedPlayer.name, role: draft.playerRole || "primary" }]
      : [],
    notes: draft.note ? [{ note: draft.note }] : [],
  });
}

export function isPlayerOnlyClip(clip = {}) {
  return String(clip.metadata?.clipKind || clip.metadata?.clip_kind || "").trim() === playerOnlyClipKind;
}

function playerIdValue(player = {}) {
  return String(player.id || player.playerId || player.player_id || "").trim();
}

function playerNameValue(player = {}) {
  return String(player.name || player.playerLabel || player.player_label || playerIdValue(player)).trim();
}

export function buildPlayerOnlyClipPayload(state = {}, player = {}, startMs = 0, durationMs = 15000) {
  if (!state.match?.id || !state.video?.id) {
    throw new Error("Load a local video before tagging a player.");
  }
  const playerId = playerIdValue(player);
  if (!playerId) {
    throw new Error("Player is not available in the current squad.");
  }
  const start = normalizeMs(startMs);
  const duration = Math.max(1000, normalizeMs(durationMs, 15000));
  const label = playerNameValue(player);
  return normalizeClipInstance({
    matchId: state.match.id,
    videoId: state.video.id,
    startMs: start,
    endMs: start + duration,
    period: state.draft?.period || "1",
    phase: "In Possession",
    subPhase: "Player",
    outcome: state.draft?.outcome || "Neutral",
    codingMode: "instant",
    codingTemplateId: state.template?.databaseId || state.template?.id || "",
    preRollMs: 0,
    postRollMs: duration,
    visibility: "idp",
    descriptors: [{ type: "player", value: playerId, label, descriptor_type: "player", descriptor_value: playerId, descriptor_label: label }],
    labels: [{ type: "player", value: playerId, label, label_type: "player", label_value: playerId, label_text: label }],
    players: [{ playerId, player_id: playerId, playerLabel: label, player_label: label, role: "primary" }],
    metadata: {
      clipKind: playerOnlyClipKind,
      labelOnly: true,
      source: "player-quick-tag",
    },
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

function uniqueTags(tags = [], value = "") {
  const nextValue = String(value || "").trim();
  return [...new Set([...(Array.isArray(tags) ? tags : []), nextValue].map((tag) => String(tag || "").trim()).filter(Boolean))];
}

function descriptorTypeForField(field = "") {
  return descriptorApiKeys[field] || field;
}

function descriptorValue(entry = {}) {
  return entry.descriptor_value || entry.descriptorValue || entry.value || "";
}

function descriptorType(entry = {}) {
  return entry.descriptor_type || entry.descriptorType || entry.type || "";
}

function withDescriptor(clip = {}, field = "", value = "") {
  const type = descriptorTypeForField(field);
  const nextValue = String(value || "").trim();
  const existing = Array.isArray(clip.descriptors) ? clip.descriptors : [];
  const withoutType = existing.filter((entry) => descriptorType(entry) !== type);
  if (!nextValue) return { ...clip, descriptors: withoutType };
  return {
    ...clip,
    descriptors: [
      ...withoutType,
      { type, value: nextValue, label: nextValue, descriptor_type: type, descriptor_value: nextValue, descriptor_label: nextValue },
    ],
  };
}

function withPlayer(clip = {}, playerId = "", players = []) {
  const id = String(playerId || "").trim();
  if (!id) return clip;
  const player = players.find((item) => item.id === id || item.playerId === id || item.player_id === id);
  const label = player?.name || player?.playerLabel || player?.player_label || id;
  const existing = Array.isArray(clip.players) ? clip.players : [];
  if (existing.some((item) => (item.playerId || item.player_id) === id)) {
    return { ...clip, visibility: "idp", clipVisibility: "idp", idpShared: true };
  }
  return {
    ...clip,
    visibility: "idp",
    clipVisibility: "idp",
    idpShared: true,
    players: [...existing, { playerId: id, player_id: id, playerLabel: label, player_label: label, role: "primary" }],
  };
}

export function applyCodingButtonToClip(clip = {}, button = {}, players = []) {
  const targetField = button.targetField || button.type || "tags";
  const value = button.value || button.label || "";
  if (targetField === "tags") return { ...clip, tags: uniqueTags(clip.tags, value) };
  if (targetField === "phase") return { ...clip, phase: value };
  if (targetField === "subPhase") {
    const metadata = isPlayerOnlyClip(clip)
      ? { ...(clip.metadata || {}), clipKind: "coded", labelOnly: false, upgradedFrom: playerOnlyClipKind }
      : clip.metadata;
    return withPhaseForSubPhase({ ...clip, metadata, subPhase: value, sub_phase: value });
  }
  if (targetField === "teamPrincipleId") return { ...clip, teamPrincipleId: value, team_principle_id: value };
  if (targetField === "miniGamePrincipleId") return withMiniGamePrinciples(clip, [value]);
  if (targetField === "outcome") return { ...clip, outcome: value };
  if (targetField === "playerId") return withPlayer(clip, value, players);
  if (["unit", "pitchZone", "pressure", "decision", "execution"].includes(targetField)) {
    return withDescriptor(clip, targetField, value);
  }
  return { ...clip, tags: uniqueTags(clip.tags, value) };
}

export function toApiClipPayload(clip = {}) {
  return {
    id: clip.id,
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
    visibility: clip.visibility || (clip.idpShared ? "idp" : clip.isShared ? "team" : "private"),
    isShared: Boolean(clip.isShared || clip.visibility === "team" || clip.visibility === "idp" || clip.idpShared),
    metadata: clip.metadata || {},
    tags: clip.tags || [],
    labels: clip.labels || [],
    descriptors: clip.descriptors || [],
    players: clip.players || [],
    note: clip.notes?.[0]?.note || "",
  };
}
