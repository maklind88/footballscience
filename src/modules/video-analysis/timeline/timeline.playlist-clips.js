import { replaceMiniGamePrincipleLabels } from "../services/miniGamePrincipleService.js";

export function normalizePlaylistEdits(value = {}) {
  const edits = {};
  for (const key of ["startMs", "endMs"]) {
    if (Number.isFinite(value[key]) && value[key] >= 0) edits[key] = Math.round(value[key]);
  }
  for (const key of ["phase", "subPhase", "outcome"]) {
    if (typeof value[key] === "string") edits[key] = value[key].slice(0, 120);
  }
  if (typeof value.note === "string") edits.note = value.note.slice(0, 4000);
  if (typeof value.tags === "string" || Array.isArray(value.tags)) {
    edits.tags = [...new Set((Array.isArray(value.tags) ? value.tags : value.tags.split(","))
      .map(tag => String(tag).trim().slice(0, 120)).filter(Boolean))].slice(0, 100);
  }
  if (Array.isArray(value.miniGamePrincipleIds)) edits.miniGamePrincipleIds = [...new Set(value.miniGamePrincipleIds.map(String))].slice(0, 100);
  return edits;
}

export function playlistClipVersion(original, value = {}) {
  const edits = normalizePlaylistEdits({ ...original.playlistEdits, ...value });
  const clip = { ...structuredClone(original), ...edits, playlistEdits: edits };
  if ("note" in edits) clip.notes = edits.note ? [{ note: edits.note }] : [];
  if ("subPhase" in edits) clip.sub_phase = edits.subPhase;
  if ("startMs" in edits) clip.start_ms = edits.startMs;
  if ("endMs" in edits) clip.end_ms = edits.endMs;
  if ("miniGamePrincipleIds" in edits) {
    clip.miniGamePrincipleId = edits.miniGamePrincipleIds[0] || "";
    clip.mini_game_principle_id = clip.miniGamePrincipleId;
    clip.mini_game_principle_ids = edits.miniGamePrincipleIds;
    clip.labels = replaceMiniGamePrincipleLabels(clip.labels, edits.miniGamePrincipleIds);
  }
  return clip;
}
