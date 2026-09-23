import { activeAnalysisTimeline, normalizeAnalysisTimeline } from "../domain/timelineWorkspace.model.js";
import { normalizePlaylistEdits, playlistClipVersion } from "./timeline.playlist-clips.js";

export const isPlaylistRow = row => row?.kind === "manual" && row?.query?.source === "fs-player-playlist";

export function playlistTimelineLanes(state) {
  const timeline = activeAnalysisTimeline(state.timelineWorkspace);
  if (timeline?.matchId && timeline.matchId !== state.match?.id) return [];
  const source = state.allClips?.length ? state.allClips : state.clips || [];
  const clipsById = new Map(source.map(clip => [clip.id, clip]));
  return (timeline?.rows || []).filter(row => isPlaylistRow(row) && !row.hidden).map(row => ({
    id: `playlist:${row.id}`, label: row.label, playlistRow: row, color: row.color,
    clips: row.clipIds.map(id => clipsById.has(id) ? playlistClipVersion(clipsById.get(id), row.query.clipEdits?.[id]) : null).filter(Boolean),
  }));
}

export function playlistRowFromTrigger(state, trigger) {
  const key = trigger?.closest(".video-analysis-lane")?.dataset.videoAnalysisRowKey;
  return playlistTimelineLanes(state).find(lane => lane.id === key)?.playlistRow || null;
}

export function buildPlaylistTimeline(state, draft) {
  if (!state.canEdit) throw new Error("You do not have permission to save playlists.");
  const workspace = state.timelineWorkspace || {};
  if (workspace.loadStatus !== "ready" || workspace.loadedMatchId !== state.match?.id) {
    throw new Error("The match timeline has not loaded. Reopen the playlist when it is ready.");
  }
  const timeline = activeAnalysisTimeline(workspace);
  if (!timeline || timeline.matchId !== state.match.id) throw new Error("The selected match has changed.");
  if (workspace.dirtyTimelineIds?.length || workspace.saveStatus === "saving") {
    throw new Error("There are other unsaved timeline changes. Save those before saving this playlist.");
  }
  const label = String(draft.label || "").trim();
  if (!label || label.length > 120) throw new Error("Enter a playlist name (1-120 characters).");
  const clips = state.allClips?.length ? state.allClips : state.clips || [];
  const available = new Set(clips.filter(clip => !["archived", "deleted"].includes(clip.status)
    && (!clip.matchId && !clip.match_id || (clip.matchId || clip.match_id) === state.match.id)).map(clip => clip.id));
  const clipIds = [...new Set(draft.clipIds)];
  if (!clipIds.length || clipIds.length > 1000 || clipIds.some(id => !available.has(id))) {
    throw new Error("The playlist must contain 1-1000 available clips from this match.");
  }
  const previous = timeline.rows.find(row => row.query?.playlistKey === draft.key);
  if (draft.rowId && (!previous || previous.id !== draft.rowId)) throw new Error("This playlist has changed. Reopen it before saving.");
  if (previous?.locked) throw new Error("This playlist is locked.");
  if (draft.revision && draft.revision !== timeline.revision) throw new Error("The timeline has changed. Reopen this playlist before saving.");
  if (!previous && timeline.rows.length >= 200) throw new Error("This timeline has reached its row limit.");
  const row = {
    ...previous, id: previous?.id || `playlist-${draft.key}`, label, kind: "manual",
    color: previous?.color || "#0f766e", sortOrder: previous?.sortOrder ?? timeline.rows.length,
    query: { ...previous?.query, source: "fs-player-playlist", playlistKey: draft.key,
      clipEdits: Object.fromEntries(clipIds.map(id => [id, normalizePlaylistEdits(draft.clipEdits?.[id])])),
    }, clipIds,
  };
  return {
    ...timeline,
    // The existing RPC resolves a first, unsaved match timeline by its title.
    id: timeline.id === "match-timeline" ? "" : timeline.id,
    rows: previous ? timeline.rows.map(item => item.id === previous.id ? row : item) : [...timeline.rows, row],
  };
}

export function createPlaylistRowSaver({ getState, updateState, saveTimeline }) {
  let saving = false;
  return async draft => {
    if (saving) throw new Error("A playlist save is already in progress.");
    const state = getState();
    const original = activeAnalysisTimeline(state.timelineWorkspace);
    const candidate = buildPlaylistTimeline(state, draft);
    saving = true;
    try {
      const payload = await saveTimeline(candidate);
      const saved = normalizeAnalysisTimeline(payload.timeline || {});
      const row = saved.rows.find(item => item.query?.playlistKey === draft.key);
      if (!payload.timeline?.id || saved.matchId !== state.match.id || !row
        || row.label !== String(draft.label).trim() || JSON.stringify(row.clipIds) !== JSON.stringify(candidate.rows.find(item => item.query?.playlistKey === draft.key).clipIds)
        || row.clipIds.some(id => JSON.stringify(normalizePlaylistEdits(row.query.clipEdits?.[id])) !== JSON.stringify(normalizePlaylistEdits(draft.clipEdits?.[id])))) {
        throw new Error("The saved playlist could not be verified. Reopen the match before retrying.");
      }
      if (getState().match?.id !== state.match.id) throw new Error("The playlist was saved in the previous match.");
      let applied = false;
      updateState(current => {
        const workspace = current.timelineWorkspace;
        const latest = activeAnalysisTimeline(workspace);
        if (JSON.stringify(latest) !== JSON.stringify(original)) return current;
        applied = true;
        return { ...current, timelineWorkspace: {
          ...workspace, activeTimelineId: saved.id, saveStatus: "ready", error: "",
          timelines: workspace.timelines.map(item => item.id === original.id ? saved : item),
        } };
      });
      if (!applied) throw new Error("The playlist was saved, but the timeline changed. Reopen the match to reload it.");
      return { row, revision: saved.revision };
    } finally { saving = false; }
  };
}
