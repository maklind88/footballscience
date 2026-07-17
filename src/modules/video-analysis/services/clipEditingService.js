import { normalizeClipInstance } from "../domain/clipInstance.model.js";
import { phaseForSubPhase } from "./footballLanguageService.js";
import { withMiniGamePrinciples } from "./miniGamePrincipleService.js";

const timelineHistoryLimit = 20;

function stringValue(value = "") {
  return String(value || "").trim();
}

function clipId(clip = {}) {
  return stringValue(clip.id || clip.clipId || clip.clip_id);
}

function relationValue(entry = {}, fields = []) {
  for (const field of fields) {
    const value = stringValue(entry?.[field]);
    if (value) return value;
  }
  return "";
}

function uniqueRelations(entries = [], keyFields = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = keyFields.map((fields) => relationValue(entry, fields)).join(":");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clipVisibility(clips = []) {
  const values = clips.map((clip) => stringValue(clip.visibility || clip.clipVisibility));
  if (values.includes("idp")) return "idp";
  if (values.includes("team")) return "team";
  return "private";
}

function sharedValue(clips = [], field = "") {
  const values = [...new Set(clips.map((clip) => stringValue(clip[field])).filter(Boolean))];
  return values.length === 1 ? values[0] : "";
}

function mergedMetadata(clips = [], timestamp = new Date().toISOString()) {
  const base = clips[0]?.metadata && typeof clips[0].metadata === "object" ? clips[0].metadata : {};
  const clipKinds = [...new Set(clips.map((clip) => stringValue(clip.metadata?.clipKind || clip.metadata?.clip_kind)).filter(Boolean))];
  const metadata = {
    ...base,
    source: "timeline-merge",
    mergedAt: timestamp,
    mergedFromClipIds: clips.map(clipId).filter(Boolean),
  };
  if (clipKinds.length === 1) {
    metadata.clipKind = clipKinds[0];
  } else {
    delete metadata.clipKind;
    delete metadata.clip_kind;
    metadata.labelOnly = false;
  }
  return metadata;
}

export function timelineSelectedClipIds(state = {}) {
  const ids = Array.isArray(state.timeline?.selectedClipIds) ? state.timeline.selectedClipIds : [];
  const activeId = stringValue(state.selectedClipId || state.timeline?.selectedCategory?.activeClipId);
  return [...new Set([...ids, activeId].map(stringValue).filter(Boolean))];
}

export function clipsForTimelineSelection(state = {}) {
  const ids = new Set(timelineSelectedClipIds(state));
  const source = Array.isArray(state.allClips) && state.allClips.length ? state.allClips : state.clips || [];
  return source.filter((clip) => ids.has(clipId(clip)));
}

export function updateTimelineClipSelection(state = {}, id = "", options = {}) {
  const targetId = stringValue(id);
  if (!targetId) return state;
  const current = new Set(timelineSelectedClipIds(state));
  if (options.toggle) {
    if (current.has(targetId)) current.delete(targetId);
    else current.add(targetId);
  } else {
    current.clear();
    current.add(targetId);
  }
  const selectedClipIds = [...current];
  const selectedClipId = selectedClipIds.includes(targetId) ? targetId : selectedClipIds.at(-1) || "";
  return {
    ...state,
    selectedClipId,
    timeline: {
      ...(state.timeline || {}),
      selectedClipIds,
      editorOpen: selectedClipIds.length === 1 ? Boolean(state.timeline?.editorOpen) : false,
      selectedCategory: {
        ...(state.timeline?.selectedCategory || {}),
        activeClipId: selectedClipId,
        keyboardDeleteScope: "clip",
      },
    },
  };
}

export function clearTimelineClipSelection(state = {}) {
  return {
    ...state,
    selectedClipId: "",
    timeline: {
      ...(state.timeline || {}),
      selectedClipIds: [],
      editorOpen: false,
      selectedCategory: {
        ...(state.timeline?.selectedCategory || {}),
        activeClipId: "",
      },
    },
  };
}

export function pushTimelineHistory(state = {}, entry = {}) {
  if (!entry?.type) return state;
  const history = [
    ...(Array.isArray(state.timeline?.history) ? state.timeline.history : []),
    { ...entry, recordedAt: entry.recordedAt || new Date().toISOString() },
  ].slice(-timelineHistoryLimit);
  return {
    ...state,
    timeline: {
      ...(state.timeline || {}),
      history,
    },
  };
}

export function popTimelineHistory(state = {}) {
  const history = Array.isArray(state.timeline?.history) ? state.timeline.history : [];
  if (!history.length) return { state, entry: null };
  return {
    entry: history.at(-1),
    state: {
      ...state,
      timeline: {
        ...(state.timeline || {}),
        history: history.slice(0, -1),
      },
    },
  };
}

export function validateTimelineMerge(clips = []) {
  if (clips.length < 2) return { ok: false, reason: "Select at least two clips to merge." };
  if (clips.length > 20) return { ok: false, reason: "Merge at most 20 clips at a time." };
  const matchIds = new Set(clips.map((clip) => stringValue(clip.matchId || clip.match_id)));
  const videoIds = new Set(clips.map((clip) => stringValue(clip.videoId || clip.video_id)));
  if (matchIds.size !== 1 || videoIds.size !== 1) {
    return { ok: false, reason: "Only clips from the same video can be merged." };
  }
  return { ok: true };
}

export function mergeTimelineClips(clips = [], timestamp = new Date().toISOString()) {
  const validation = validateTimelineMerge(clips);
  if (!validation.ok) throw new Error(validation.reason);
  const sorted = clips.slice().sort((first, second) => (
    Number(first.startMs ?? first.start_ms ?? 0) - Number(second.startMs ?? second.start_ms ?? 0)
  ));
  const base = normalizeClipInstance(sorted[0]);
  const startMs = Math.min(...sorted.map((clip) => Number(clip.startMs ?? clip.start_ms ?? 0)));
  const endMs = Math.max(...sorted.map((clip) => Number(clip.endMs ?? clip.end_ms ?? 0)));
  const subPhase = sharedValue(sorted.map(normalizeClipInstance), "subPhase") || base.subPhase;
  const miniGamePrincipleIds = sorted.flatMap((clip) => [
    clip.miniGamePrincipleId || clip.mini_game_principle_id,
    ...(Array.isArray(clip.labels) ? clip.labels
      .filter((label) => stringValue(label.type || label.label_type) === "mini_game_principle")
      .map((label) => label.value || label.label_value || label.label) : []),
  ]);
  const merged = normalizeClipInstance({
    ...base,
    id: "",
    startMs,
    endMs,
    phase: sharedValue(sorted.map(normalizeClipInstance), "phase") || phaseForSubPhase(subPhase, base.phase),
    subPhase,
    outcome: sharedValue(sorted.map(normalizeClipInstance), "outcome") || base.outcome,
    teamPrincipleId: sharedValue(sorted.map(normalizeClipInstance), "teamPrincipleId") || base.teamPrincipleId,
    visibility: clipVisibility(sorted),
    tags: [...new Set(sorted.flatMap((clip) => clip.tags || []).map(stringValue).filter(Boolean))],
    labels: uniqueRelations(sorted.flatMap((clip) => clip.labels || []), [
      ["type", "labelType", "label_type"],
      ["value", "labelValue", "label_value", "label", "labelText", "label_text"],
    ]),
    descriptors: uniqueRelations(sorted.flatMap((clip) => clip.descriptors || []), [
      ["type", "descriptorType", "descriptor_type"],
      ["value", "descriptorValue", "descriptor_value"],
    ]),
    players: uniqueRelations(sorted.flatMap((clip) => clip.players || []), [
      ["playerId", "player_id", "id"],
      ["role"],
    ]),
    notes: uniqueRelations(sorted.flatMap((clip) => clip.notes || []), [["note"]]),
    metadata: mergedMetadata(sorted, timestamp),
  });
  return withMiniGamePrinciples(merged, miniGamePrincipleIds);
}

export function editTimelineClip(clip = {}, values = {}) {
  const subPhase = stringValue(values.subPhase || clip.subPhase || clip.sub_phase);
  const note = stringValue(values.note);
  const tags = Array.isArray(values.tags)
    ? values.tags.map(stringValue).filter(Boolean)
    : String(values.tags || "").split(",").map(stringValue).filter(Boolean);
  return withMiniGamePrinciples(normalizeClipInstance({
    ...clip,
    phase: phaseForSubPhase(subPhase, clip.phase),
    subPhase,
    outcome: stringValue(values.outcome || clip.outcome),
    tags,
    notes: note ? [{ note }] : [],
  }), values.miniGamePrincipleIds || []);
}
