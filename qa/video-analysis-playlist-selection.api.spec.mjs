import { test, expect } from "@playwright/test";
import { selectTimelineGroup, timelineReviewSelection } from "../src/modules/video-analysis/timeline/timeline.selection.js";
import { createClipReview } from "../src/modules/video-analysis/timeline/timeline.clip-review.js";
import { playlistClipVersion } from "../src/modules/video-analysis/timeline/timeline.playlist-clips.js";
import { buildPlaylistTimeline, createPlaylistRowSaver, playlistTimelineLanes } from "../src/modules/video-analysis/timeline/timeline.playlist-rows.js";

const clips = [1, 2, 3].map(id => ({ id: `clip-${id}`, startMs: id * 1000, endMs: id * 1000 + 500, matchId: "match-1", phase: "In Possession", subPhase: "Build Up", tags: ["original"], notes: [{ note: "Original" }] }));
const state = () => ({
  match: { id: "match-1" }, canEdit: true, clips, allClips: clips, timeline: { selectedClipIds: [] },
  timelineWorkspace: { loadedMatchId: "match-1", loadStatus: "ready", activeTimelineId: "timeline-1", timelines: [{
    id: "timeline-1", matchId: "match-1", title: "Match timeline", revision: 4,
    settings: { preserved: true }, rows: [{ id: "existing", label: "Existing", kind: "manual", clipIds: ["clip-2"], query: {} }],
  }] },
});
const draft = () => ({ key: "playlist-key-1", label: "Team review", revision: 4, clipIds: ["clip-3", "clip-1"], clipEdits: { "clip-1": { tags: "new tag", note: "Playlist note", startMs: 100, endMs: 300 } } });

test("CMD row selection toggles groups, retains overlapping clips once and opens the entire selection", () => {
  let current = selectTimelineGroup(state(), clips.slice(0, 2));
  current = selectTimelineGroup(current, clips.slice(1), { toggle: true });
  expect(current.timeline.selectedClipIds).toEqual(["clip-1", "clip-2", "clip-3"]);
  expect(timelineReviewSelection(current, [clips[1]])).toHaveLength(3);
  current = selectTimelineGroup(current, [clips[1]]);
  expect(current.timeline.selectedClipIds).toHaveLength(3);
  current = selectTimelineGroup(current, [clips[1]], { toggle: true });
  expect(current.timeline.selectedClipIds).toEqual(["clip-1", "clip-3"]);
  expect(current.selectedClipId).not.toBe("clip-2");
  current = selectTimelineGroup(current, [clips[1]]);
  expect(current.timeline.selectedClipIds).toEqual(["clip-2"]);
});

test("playlist order and per-playlist edits never mutate source clips", () => {
  const before = structuredClone(clips);
  const review = createClipReview(clips);
  expect(review.move("clip-3", "clip-1")).toBe(true);
  review.saved(playlistClipVersion(clips[0], draft().clipEdits["clip-1"]));
  expect(review.entries.map(entry => entry.clip.id)).toEqual(["clip-3", "clip-1", "clip-2"]);
  expect(review.entries[1].clip.tags).toEqual(["new tag"]);
  expect(review.entries[1].clip.notes).toEqual([{ note: "Playlist note" }]);
  review.remove("clip-2");
  expect(clips).toEqual(before);
});

test("playlist timeline payload preserves other rows and persists ordered references with bounded overrides", () => {
  const current = state(), before = structuredClone(current);
  const timeline = buildPlaylistTimeline(current, draft());
  expect(timeline.rows).toHaveLength(2);
  expect(timeline.rows[0].id).toBe("existing");
  expect(timeline.settings).toEqual({ preserved: true });
  expect(timeline.rows[1].clipIds).toEqual(["clip-3", "clip-1"]);
  expect(timeline.rows[1].query.clipEdits["clip-1"].tags).toEqual(["new tag"]);
  expect(current).toEqual(before);
  const lanes = playlistTimelineLanes({ ...current, timelineWorkspace: { ...current.timelineWorkspace, timelines: [timeline] } });
  expect(lanes).toHaveLength(1);
  expect(lanes[0].clips.map(clip => clip.id)).toEqual(["clip-3", "clip-1"]);
  expect(lanes[0].clips[1].startMs).toBe(100);
  expect(clips[0].startMs).toBe(1000);
});

for (const [name, change] of [
  ["read-only", current => { current.canEdit = false; }],
  ["not loaded", current => { current.timelineWorkspace.loadStatus = "error"; }],
  ["other match", current => { current.match.id = "other"; }],
  ["unrelated unsaved rows", current => { current.timelineWorkspace.dirtyTimelineIds = ["timeline-1"]; }],
  ["stale revision", current => { current.timelineWorkspace.timelines[0].revision = 5; }],
]) test(`playlist save blocks ${name}`, () => {
  const current = state(); change(current);
  expect(() => buildPlaylistTimeline(current, draft())).toThrow();
});

test("failed or conflicting saves keep state and drafts untouched", async () => {
  const current = state(), before = structuredClone(current), input = draft();
  const saver = createPlaylistRowSaver({ getState: () => current, updateState: () => { throw new Error("Unexpected update"); }, saveTimeline: async () => { throw new Error("Timeline revision conflict"); } });
  await expect(saver(input)).rejects.toThrow("revision conflict");
  expect(current).toEqual(before);
  expect(input).toEqual(draft());
});

test("server identity, order, edits and rename round-trip through the existing timeline contract", async () => {
  let current = state();
  const saver = createPlaylistRowSaver({ getState: () => current, updateState: update => { current = update(current); }, saveTimeline: async timeline => ({ timeline: { ...timeline, revision: timeline.revision + 1, rows: timeline.rows.map(row => row.query.playlistKey ? { ...row, id: "server-row-id" } : row) } }) });
  const saved = await saver(draft());
  expect(saved.row.id).toBe("server-row-id");
  await saver({ ...draft(), rowId: saved.row.id, revision: saved.revision, label: "Renamed" });
  expect(current.timelineWorkspace.timelines[0].rows).toHaveLength(2);
  expect(current.timelineWorkspace.timelines[0].rows[1].label).toBe("Renamed");
  expect(clips[0].tags).toEqual(["original"]);
});

test("save result cannot replace another match or concurrent local work", async () => {
  let current = state();
  const saver = createPlaylistRowSaver({ getState: () => current, updateState: update => { current = update(current); }, saveTimeline: async timeline => {
    current = { ...current, match: { id: "different" } };
    return { timeline: { ...timeline, revision: 5 } };
  } });
  await expect(saver(draft())).rejects.toThrow("previous match");
  expect(current.timelineWorkspace.timelines[0].rows).toHaveLength(1);
});
