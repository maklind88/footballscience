import { normalizeAnalysisTimeline } from "../domain/timelineWorkspace.model.js";
import { presentationQueue } from "./presentationService.js";
import { isPlaylistRow } from "../timeline/timeline.playlist-rows.js";

export function savedPlaylistEntries(state = {}) {
  const timelines = new Map();
  for (const value of [...(state.playlistLibrary?.timelines || []), ...(state.timelineWorkspace?.timelines || [])]) {
    const timeline = normalizeAnalysisTimeline(value);
    const previous = timelines.get(timeline.id);
    if (timeline.status === "active" && (!previous || previous.revision <= timeline.revision)) timelines.set(timeline.id, timeline);
  }
  const matches = new Map((state.library?.matches || []).map(match => [match.id, match]));
  if (state.match?.id) matches.set(state.match.id, state.match);
  return [...timelines.values()].flatMap(timeline => timeline.rows.filter(isPlaylistRow).map(row => ({
    key: `timeline:${timeline.id}:${row.id}`, kind: "timeline", title: row.label,
    clipCount: row.clipIds.length, updatedAt: timeline.updatedAt, timeline, row,
    matchTitle: matches.get(timeline.matchId)?.title || timeline.title,
  })));
}

export function playlistLibraryEntries(state = {}) {
  const current = state.presentation?.current || {};
  const saved = state.presentation?.presentations || [];
  const presentations = !current.id && presentationQueue(current).length ? [current, ...saved] : saved;
  return [...savedPlaylistEntries(state), ...presentations.map(value => {
    const item = value.id && value.id === current.id ? { ...value, ...current } : value;
    const queue = presentationQueue(item);
    const rawCount = queue.length || item.metadata?.clipCount || item.metadata?.clip_count;
    const count = Number(rawCount);
    return { key: `presentation:${item.id || "draft"}`, kind: "presentation", title: String(item.title || "Untitled playlist"),
      clipCount: rawCount == null ? null : Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
      updatedAt: item.updatedAt || item.createdAt, presentation: item,
      matchTitle: item.purpose || "", draft: !item.id };
  })];
}

export function filteredPlaylistLibrary(state = {}) {
  const search = String(state.presentation?.librarySearch || "").trim().toLowerCase();
  const sort = state.presentation?.librarySort || "updated";
  const entries = playlistLibraryEntries(state).filter(item => `${item.title} ${item.matchTitle}`.toLowerCase().includes(search));
  return entries.sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title, "en", { numeric: true })
    : sort === "clips" ? b.clipCount - a.clipCount
      : String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))) || a.key.localeCompare(b.key));
}
