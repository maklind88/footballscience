import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { savedPlaylistEntries, filteredPlaylistLibrary } from "../src/modules/video-analysis/services/playlistLibraryService.js";
import { createPlaylistLibraryController } from "../src/modules/video-analysis/controllers/playlistLibraryController.js";
import { renderPresentationOverview } from "../src/modules/video-analysis/components/PresentationOverview.js";
import { renderTimeline } from "../src/modules/video-analysis/timeline/timeline.renderer.js";

const require = createRequire(import.meta.url);
const matchId = "11111111-1111-4111-8111-111111111111";
const timelineId = "22222222-2222-4222-8222-222222222222";
const clipId = "33333333-3333-4333-8333-333333333333";
const row = () => ({ id: "row-1", kind: "manual", label: "Team review", clipIds: [clipId], hidden: true,
  query: { source: "fs-player-playlist", playlistKey: "list-1", clipEdits: { [clipId]: { note: "Saved note" } } } });
const timeline = () => ({ id: timelineId, matchId, title: "Match timeline", revision: 2, rows: [row()] });
const initial = () => ({ canEdit: true, activeAnalysisRoomTab: "presentation", match: { id: matchId, title: "Seattle" }, clips: [], allClips: [],
  timeline: {}, timelineWorkspace: { loadedMatchId: matchId, loadStatus: "ready", activeTimelineId: timelineId, timelines: [timeline()] },
  presentation: { presentations: [{ id: "deck-1", title: "Older presentation", metadata: { clipCount: 4 } }] },
});

test("library includes hidden and inactive-timeline playlists without rewriting any saved data", () => {
  const state = initial();
  state.playlistLibrary = { timelines: [{ ...timeline(), id: "another", matchId: "other-match" }] };
  const before = structuredClone(state);
  const entries = savedPlaylistEntries(state);
  expect(entries).toHaveLength(2);
  expect(entries.map(item => item.row.query.clipEdits[clipId].note)).toEqual(["Saved note", "Saved note"]);
  expect(filteredPlaylistLibrary(state)).toHaveLength(3);
  expect(state).toEqual(before);
  const html = renderPresentationOverview(state);
  expect(html).toContain("Older presentation");
  expect(html).toContain("Team review");
  expect(html).toContain("Search playlists");
});

test("timeline only renders tags while the same saved list remains discoverable", () => {
  const state = initial();
  state.timelineWorkspace.timelines[0].rows[0].hidden = false;
  expect(renderTimeline(state)).not.toContain("Team review");
  expect(renderPresentationOverview(state)).toContain("Team review");
});

test("library search, ordering and UI pagination support many saved lists", () => {
  const state = initial();
  state.timelineWorkspace.timelines[0].rows = Array.from({ length: 125 }, (_, index) => ({ ...row(), id: `r-${index}`, label: `Meeting ${index}` }));
  state.presentation.librarySort = "name";
  expect(filteredPlaylistLibrary(state)[2].title).toBe("Meeting 2");
  expect(renderPresentationOverview(state).match(/data-playlist-library-item=/g)).toHaveLength(50);
  state.presentation.librarySearch = "Meeting 124";
  expect(filteredPlaylistLibrary(state).map(item => item.title)).toEqual(["Meeting 124"]);
  state.presentation.librarySearch = "older";
  expect(filteredPlaylistLibrary(state)[0].kind).toBe("presentation");
});

test("saved titles and metadata cannot inject markup into the library", () => {
  const state = initial();
  state.presentation.presentations[0].title = '<img src=x onerror="alert(1)">';
  state.presentation.presentations[0].metadata.clipCount = '<script>alert(1)</script>';
  const html = renderPresentationOverview(state);
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;img");
});

function harness(overrides = {}) {
  let state = initial();
  const calls = [];
  const run = {
    store: { getState: () => state, update: fn => { state = fn(state); } },
    timelineWorkspaceRuntime: { repository: { list: async () => ({ timelines: [timeline()] }) } },
    presentations: { list: async () => ({ presentations: [] }) },
    clips: { list: async () => ({ clips: [{ id: clipId, match_id: matchId, start_ms: 1000, end_ms: 2000 }] }) },
    videos: { listMatches: async () => ({ matches: [{ id: matchId }] }) }, ...overrides,
  };
  const controller = createPlaylistLibraryController({ getRuntime: () => run,
    openMatch: async () => true, openEditor: (...args) => { calls.push(args); return true; } });
  return { run, controller, calls, state: () => state, key: `timeline:${timelineId}:row-1` };
}

test("opening rehydrates every source and uses exact saved membership, not current selection", async () => {
  const h = harness();
  h.state().timeline.selectedClipIds = ["unrelated"];
  expect(await h.controller.open(h.key)).toBe(true);
  expect(h.calls[0][2].map(clip => clip.id)).toEqual([clipId]);
  expect(h.calls[0][3].query.clipEdits[clipId].note).toBe("Saved note");
});

test("local metadata isolation blocks discovery and opening before any repository read", async () => {
  const h = harness();
  const reads = [];
  h.run.timelineWorkspaceRuntime.repository.list = async () => { reads.push("timeline"); return { timelines: [] }; };
  h.run.presentations.list = async () => { reads.push("presentation"); return { presentations: [] }; };
  h.run.clips.list = async () => { reads.push("clips"); return { clips: [] }; };
  const controller = createPlaylistLibraryController({ getRuntime: () => h.run, shouldLoadMetadata: () => false,
    openMatch: async () => { reads.push("match"); }, openEditor: () => { reads.push("editor"); } });
  await controller.load();
  expect(await controller.open(h.key)).toBe(false);
  expect(reads).toEqual([]);
  expect(h.state().playlistLibrary).toBeUndefined();
});

test("unavailable clips fail closed without replacing or reducing the saved membership", async () => {
  const h = harness({ clips: { list: async () => ({ clips: [] }) } });
  const before = structuredClone(h.state().timelineWorkspace);
  expect(await h.controller.open(h.key)).toBe(false);
  expect(h.calls).toEqual([]);
  expect(h.state().playlistLibrary.error).toContain("kept unchanged");
  expect(h.state().timelineWorkspace).toEqual(before);
});

test("pending timeline work is never overwritten by opening a library entry", async () => {
  const h = harness();
  h.state().timelineWorkspace.dirtyTimelineIds = [timelineId];
  expect(await h.controller.open(h.key)).toBe(false);
  expect(h.calls).toEqual([]);
});

test("navigation or editing during an async open cannot replace the newer workspace", async () => {
  const h = harness();
  h.run.clips.list = async () => {
    h.state().timelineWorkspace.dirtyTimelineIds = [timelineId];
    return { clips: [{ id: clipId, match_id: matchId, start_ms: 1000, end_ms: 2000 }] };
  };
  expect(await h.controller.open(h.key)).toBe(false);
  expect(h.calls).toEqual([]);
  expect(h.state().timelineWorkspace.dirtyTimelineIds).toEqual([timelineId]);
});

test("library loading reads all pages and preserves existing entries when the next request fails", async () => {
  const offsets = [];
  const h = harness({ timelineWorkspaceRuntime: { repository: { list: async (_match, _limit, offset) => {
    offsets.push(offset);
    return { timelines: offset ? [timeline()] : Array.from({ length: 40 }, (_, index) => ({ ...timeline(), id: `timeline-${index}` })) };
  } } } });
  await h.controller.load();
  expect(offsets).toEqual([0, 40]);
  expect(h.state().playlistLibrary.timelines).toHaveLength(41);
  const before = structuredClone(h.state().playlistLibrary.timelines);
  h.run.timelineWorkspaceRuntime.repository.list = async () => { throw new Error("Offline"); };
  await h.controller.load();
  expect(h.state().playlistLibrary.timelines).toEqual(before);
  expect(h.state().playlistLibrary.error).toBe("Offline");
});

test("timeline reads retain tenant scope, pagination and all memberships beyond the first database page", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://playlist-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  const requests = [];
  try {
    globalThis.fetch = async url => {
      const parsed = new URL(url); requests.push(parsed);
      if (parsed.pathname.endsWith("/video_timelines")) return Response.json([{ id: timelineId, match_id: matchId, title: "Review", revision: 2 }]);
      if (parsed.pathname.endsWith("/video_timeline_lanes")) return Response.json([{ id: "lane-1", timeline_id: timelineId, lane_key: "row-1", label: "List", source_type: "manual", query_json: row().query }]);
      const offset = Number(parsed.searchParams.get("offset") || 0);
      return Response.json(Array.from({ length: offset ? 1 : 500 }, (_, index) => ({ id: `${offset + index}`, timeline_id: timelineId, lane_id: "lane-1", clip_instance_id: `clip-${offset + index}`, sort_order: offset + index })));
    };
    const { listTimelines } = require("../api/_lib/video-analysis-workstation-database.js");
    const result = await listTimelines({ limit: 1, offset: 40, timelineId, matchId }, { clubId: "club-a", teamId: "team-a" });
    expect(result.ok).toBe(true);
    expect(result.payload.timelines[0].rows[0].clipIds).toHaveLength(501);
    expect(result.payload.timelines[0].rows[0].clipIds.at(-1)).toBe("clip-500");
    expect(requests[0].searchParams.get("offset")).toBe("40");
    expect(requests[0].searchParams.get("id")).toBe(`eq.${timelineId}`);
    for (const request of requests) {
      expect(request.searchParams.get("organization_id")).toBe("eq.club-a");
      expect(request.searchParams.get("team_id")).toBe("eq.team-a");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("playlist discovery read filters cannot broaden match or tenant access", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://playlist-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  const requests = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url: new URL(url), method: options?.method || "GET" });
      return Response.json([]);
    };
    const actor = { clubId: "club-a", teamId: "team-a" };
    await require("../api/_lib/video-analysis-library-database.js").listMatches({ matchId, limit: 1 }, actor);
    await require("../api/_lib/video-analysis-presentation-database.js").listPresentations({ limit: 40, offset: 80 }, actor);
    expect(requests.find(request => request.url.pathname.endsWith("/video_matches")).url.searchParams.get("id")).toBe(`eq.${matchId}`);
    expect(requests.find(request => request.url.pathname.endsWith("/video_presentations")).url.searchParams.get("offset")).toBe("80");
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expect(request.url.searchParams.get("organization_id")).toBe("eq.club-a");
      expect(request.url.searchParams.get("team_id")).toBe("eq.team-a");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
