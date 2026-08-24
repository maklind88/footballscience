import { normalizeClipInstance, normalizeMs } from "../domain/clipInstance.model.js";
import { descriptorApiKeys } from "../constants/descriptors.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { isValidCodingSelection, splitTags } from "./taggingService.js";
import { phaseForSubPhase, withPhaseForSubPhase } from "./footballLanguageService.js";
import { buildMiniGamePrincipleLabels, uniqueMiniGamePrincipleIds, withMiniGamePrinciples } from "./miniGamePrincipleService.js";

const playerOnlyClipKind = "player";
const phaseClipKind = "phase";
const subPhaseClipKind = "subPhase";
const miniGamePrincipleClipKind = "miniGamePrinciple";
const unitOnlyClipKind = "unit";
const outcomeOnlyClipKind = "outcome";
const canonicalTargetFields = Object.freeze({
  sub_phase: "subPhase",
  team_principle: "teamPrincipleId",
  team_principle_id: "teamPrincipleId",
  mini_game_principle: "miniGamePrincipleId",
  mini_game_principle_id: "miniGamePrincipleId",
  player: "playerId",
  player_id: "playerId",
  pitch_zone: "pitchZone",
});

function canonicalClipTargetField(value = "") {
  const field = String(value || "").trim();
  return canonicalTargetFields[field] || field;
}

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
  const selectedPlayerIds = draftPlayerIds(draft);
  const selectedPlayers = selectedPlayerIds
    .map((id) => (state.players || []).find((player) => playerIdValue(player) === id) || { id, name: id })
    .filter((player) => playerIdValue(player));
  const selectedPlayer = selectedPlayers[0] || null;
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
    visibility: selectedPlayers.length ? "idp" : draft.visibility || draft.clipVisibility || "private",
    tags: splitTags(draft.tags),
    descriptors: buildDescriptorPayload(draft, selectedPlayer),
    labels: buildMiniGamePrincipleLabels(miniGamePrincipleIds),
    metadata: draft.metadata?.clipKind
      ? tagMomentMetadata(draft.metadata, draft.metadata.clipKind, draft.metadata.momentKey || draft.metadata.moment_key)
      : (draft.metadata && typeof draft.metadata === "object" ? draft.metadata : {}),
    players: selectedPlayers.map((player) => ({
      playerId: playerIdValue(player),
      playerLabel: playerNameValue(player),
      role: draft.playerRole || "primary",
    })),
    notes: draft.note ? [{ note: draft.note }] : [],
  });
}

export function isPlayerOnlyClip(clip = {}) {
  return String(clip.metadata?.clipKind || clip.metadata?.clip_kind || "").trim() === playerOnlyClipKind;
}

export function isPhaseOnlyClip(clip = {}) {
  return String(clip.metadata?.clipKind || clip.metadata?.clip_kind || "").trim() === phaseClipKind;
}

export function isSubPhaseOnlyClip(clip = {}) {
  return String(clip.metadata?.clipKind || clip.metadata?.clip_kind || "").trim() === subPhaseClipKind;
}

export function isMiniGamePrincipleOnlyClip(clip = {}) {
  return String(clip?.metadata?.clipKind || clip?.metadata?.clip_kind || "").trim() === miniGamePrincipleClipKind;
}

export function isUnitOnlyClip(clip = {}) {
  return String(clip.metadata?.clipKind || clip.metadata?.clip_kind || "").trim() === unitOnlyClipKind;
}

export function isOutcomeOnlyClip(clip = {}) {
  return String(clip.metadata?.clipKind || clip.metadata?.clip_kind || "").trim() === outcomeOnlyClipKind;
}

function playerIdValue(player = {}) {
  return String(player.id || player.playerId || player.player_id || "").trim();
}

function playerNameValue(player = {}) {
  return String(player.name || player.playerLabel || player.player_label || playerIdValue(player)).trim();
}

function draftPlayerIds(draft = {}) {
  const values = [
    ...(Array.isArray(draft.playerIds) ? draft.playerIds : []),
    ...(Array.isArray(draft.player_ids) ? draft.player_ids : []),
    draft.playerId,
    draft.player_id,
  ];
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function tagMomentMetadata(base = {}, clipKind = "", momentKey = "") {
  return {
    ...(base && typeof base === "object" ? base : {}),
    clipKind,
    labelOnly: clipKind !== subPhaseClipKind,
    ...(momentKey ? { momentKey } : {}),
  };
}

export function buildPhaseOnlyClipPayload(state = {}, phase = "", startMs = 0, durationMs = 15000, options = {}) {
  if (!state.match?.id || !state.video?.id) {
    throw new Error("Load a local video before tagging a phase.");
  }
  const label = String(phase || "").trim();
  if (!label) {
    throw new Error("Sub-phase did not resolve to a phase.");
  }
  const start = normalizeMs(startMs);
  const duration = Math.max(1000, normalizeMs(durationMs, 15000));
  return normalizeClipInstance({
    matchId: state.match.id,
    videoId: state.video.id,
    startMs: start,
    endMs: start + duration,
    period: state.draft?.period || "1",
    phase: label,
    subPhase: label,
    outcome: state.draft?.outcome || "Neutral",
    codingMode: "instant",
    codingTemplateId: state.template?.databaseId || state.template?.id || "",
    codingButtonId: state.codingSession?.activeButtonDatabaseId || state.codingSession?.activeButtonId || "",
    preRollMs: 0,
    postRollMs: duration,
    visibility: options.visibility || state.draft?.visibility || state.draft?.clipVisibility || "private",
    labels: [{ type: "phase", value: label, label }],
    metadata: tagMomentMetadata(options.metadata, phaseClipKind, options.momentKey),
  });
}

export function buildPlayerOnlyClipPayload(state = {}, player = {}, startMs = 0, durationMs = 15000, options = {}) {
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
    metadata: tagMomentMetadata({
      source: "player-quick-tag",
      ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {}),
    }, playerOnlyClipKind, options.momentKey),
  });
}

export function buildUnitOnlyClipPayload(state = {}, unit = "", startMs = 0, durationMs = 15000, options = {}) {
  if (!state.match?.id || !state.video?.id) {
    throw new Error("Load a local video before tagging a unit.");
  }
  const label = String(unit || "").trim();
  if (!label) {
    throw new Error("Choose the involved unit.");
  }
  const start = normalizeMs(startMs);
  const duration = Math.max(1000, normalizeMs(durationMs, 15000));
  return normalizeClipInstance({
    matchId: state.match.id,
    videoId: state.video.id,
    startMs: start,
    endMs: start + duration,
    period: state.draft?.period || "1",
    phase: "Unit",
    subPhase: "Unit",
    outcome: state.draft?.outcome || "Neutral",
    codingMode: "instant",
    codingTemplateId: state.template?.databaseId || state.template?.id || "",
    preRollMs: 0,
    postRollMs: duration,
    visibility: options.visibility || state.draft?.visibility || state.draft?.clipVisibility || "private",
    descriptors: [{ type: "unit", value: label, label, descriptor_type: "unit", descriptor_value: label, descriptor_label: label }],
    labels: [{ type: "unit", value: label, label, label_type: "unit", label_value: label, label_text: label }],
    metadata: tagMomentMetadata({
      source: "unit-button",
      ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {}),
    }, unitOnlyClipKind, options.momentKey),
  });
}

export function buildOutcomeOnlyClipPayload(state = {}, outcome = "", startMs = 0, durationMs = 15000, options = {}) {
  if (!state.match?.id || !state.video?.id) {
    throw new Error("Load a local video before tagging an outcome.");
  }
  const label = String(outcome || "").trim();
  if (!videoAnalysisOutcomes.includes(label)) {
    throw new Error("Choose a valid outcome.");
  }
  const start = normalizeMs(startMs);
  const duration = Math.max(1000, normalizeMs(durationMs, 15000));
  return normalizeClipInstance({
    matchId: state.match.id,
    videoId: state.video.id,
    startMs: start,
    endMs: start + duration,
    period: state.draft?.period || "1",
    phase: "Outcome",
    subPhase: "Outcome",
    outcome: label,
    codingMode: "instant",
    codingTemplateId: state.template?.databaseId || state.template?.id || "",
    preRollMs: 0,
    postRollMs: duration,
    visibility: options.visibility || state.draft?.visibility || state.draft?.clipVisibility || "private",
    labels: [{ type: "outcome", value: label, label, label_type: "outcome", label_value: label, label_text: label }],
    metadata: tagMomentMetadata({
      source: "outcome-button",
      ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {}),
    }, outcomeOnlyClipKind, options.momentKey),
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
  const targetField = canonicalClipTargetField(button.targetField || button.type || "tags");
  const value = button.value || button.label || "";
  if (targetField === "tags") return { ...clip, tags: uniqueTags(clip.tags, value) };
  if (targetField === "phase") return isPlayerOnlyClip(clip) ? clip : { ...clip, phase: value };
  if (targetField === "subPhase") {
    if (isPlayerOnlyClip(clip)) return clip;
    return withPhaseForSubPhase({ ...clip, subPhase: value, sub_phase: value });
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
    expectedRevision: clip.id ? Math.max(1, Math.round(Number(clip.revision) || 1)) : null,
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
