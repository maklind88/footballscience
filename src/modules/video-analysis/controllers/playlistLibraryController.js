import { normalizeAnalysisTimeline } from "../domain/timelineWorkspace.model.js";
import { normalizeClipInstance } from "../domain/clipInstance.model.js";
import { savedPlaylistEntries } from "../services/playlistLibraryService.js";

const PAGE_SIZE = 40;

export function createPlaylistLibraryController({ getRuntime, openMatch, openEditor }) {
  let loading = false;
  let opening = false;
  const update = patch => getRuntime().store.update(state => ({ ...state, playlistLibrary: { ...state.playlistLibrary, ...patch } }));

  async function load() {
    if (loading) return;
    loading = true;
    const run = getRuntime();
    update({ status: "loading", error: "" });
    try {
      const timelines = [];
      const presentations = [];
      for (const [items, read, property] of [
        [timelines, offset => run.timelineWorkspaceRuntime.repository.list("", PAGE_SIZE, offset), "timelines"],
        [presentations, offset => run.presentations.list(PAGE_SIZE, offset), "presentations"],
      ]) {
        for (let offset = 0; offset <= 10000; offset += PAGE_SIZE) {
          const payload = await read(offset);
          const page = payload[property] || [];
          if (page.some(item => items.some(previous => previous.id === item.id))) throw new Error("Playlists changed while loading. Please retry.");
          items.push(...page);
          if (page.length < PAGE_SIZE) break;
          if (offset === 10000) throw new Error("Too many playlists to load. Narrow the match selection.");
        }
      }
      run.store.update(state => ({ ...state,
        playlistLibrary: { ...state.playlistLibrary, timelines, status: "ready", error: "" },
        presentation: { ...state.presentation, presentations },
      }));
    } catch (error) { update({ status: "error", error: error.message || "Could not load playlists." }); }
    finally { loading = false; }
  }

  async function open(key, trigger) {
    if (opening) return false;
    const run = getRuntime();
    const entry = savedPlaylistEntries(run.store.getState()).find(item => item.key === key);
    if (!entry) return false;
    opening = true;
    update({ openingKey: key, error: "" });
    try {
      let state = run.store.getState();
      if (state.timelineWorkspace?.dirtyTimelineIds?.length || state.timelineWorkspace?.saveStatus === "saving") {
        throw new Error("Save the pending timeline changes before opening this playlist.");
      }
      if (state.match?.id !== entry.timeline.matchId) {
        const payload = await run.videos.listMatches({ matchId: entry.timeline.matchId, limit: 1 });
        const match = payload.matches?.find(item => item.id === entry.timeline.matchId);
        if (!match) throw new Error("The source match is unavailable. Your playlist is still saved.");
        run.store.update(current => ({ ...current, library: { ...current.library,
          matches: [match, ...(current.library?.matches || []).filter(item => item.id !== match.id)] } }));
        if (!await openMatch(`match:${match.id}`)) throw new Error("Could not open the playlist's match.");
      }
      const matchId = entry.timeline.matchId;
      const workspaceBefore = JSON.stringify(run.store.getState().timelineWorkspace);
      const payload = await run.timelineWorkspaceRuntime.repository.list(matchId, 1, 0, entry.timeline.id);
      const raw = payload.timelines?.find(item => item.id === entry.timeline.id);
      if (!raw) throw new Error("The playlist is unavailable. Reload Playlists before retrying.");
      const timeline = normalizeAnalysisTimeline(raw);
      const row = timeline.rows.find(item => item.id === entry.row.id);
      if (!row?.clipIds.length) throw new Error("This playlist has no available clips. Its saved data has not changed.");
      const clips = new Map();
      for (let offset = 0; offset <= 10000; offset += 200) {
        const result = await run.clips.list({ matchId, limit: 200, offset });
        for (const clip of (result.clips || []).map(normalizeClipInstance)) clips.set(clip.id, clip);
        if (row.clipIds.every(id => clips.has(id)) || (result.pageSize ?? result.clips?.length ?? 0) < 200) break;
      }
      if (row.clipIds.some(id => !clips.has(id))) throw new Error("Some source clips are unavailable. The saved playlist has been kept unchanged.");
      if (run.store.getState().match?.id !== matchId) throw new Error("The selected match changed. Reopen the playlist.");
      if (run.store.getState().activeAnalysisRoomTab !== "presentation"
        || JSON.stringify(run.store.getState().timelineWorkspace) !== workspaceBefore) {
        throw new Error("The workspace changed while loading. Reopen the playlist.");
      }
      run.store.update(current => ({ ...current,
        allClips: [...new Map([...(current.allClips || []), ...clips.values()].map(clip => [clip.id, clip])).values()],
        timelineWorkspace: { ...current.timelineWorkspace, activeTimelineId: timeline.id,
          timelines: [timeline, ...(current.timelineWorkspace?.timelines || []).filter(item => item.id !== timeline.id)],
          loadedMatchId: matchId, loadStatus: "ready" },
      }));
      const ordered = row.clipIds.map(id => clips.get(id));
      return openEditor(ordered[0], trigger, ordered, row);
    } catch (error) { update({ error: error.message || "Could not open playlist." }); return false; }
    finally { opening = false; update({ openingKey: "" }); }
  }

  return { load, open };
}
