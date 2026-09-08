import { expect, test } from "@playwright/test";
import {
  buildVideoLibraryItems,
  filterVideoLibraryItems,
  mergeScheduleCandidates,
  normalizeContextScheduleCandidates,
  videoLibraryResultPage,
} from "../src/modules/video-analysis/services/videoLibraryService.js";
import { renderVideoLibrary } from "../src/modules/video-analysis/components/VideoLibrary.js";
import { createVideoLibraryController } from "../src/modules/video-analysis/video-analysis.library-controller.js";

const date = "2026-06-15";
const event = (id, title = id) => ({ id, date, type: "training", title });
const saved = (id, eventId = "", title = id) => ({ id, title, match_date: date, event_type: "training", schedule_event_id: eventId });

test("Analysis Room preserves separate same-day activities and deduplicates only the linked event", () => {
  const items = buildVideoLibraryItems({ library: {
    matches: [saved("video-am", "am")], scheduleCandidates: [event("am"), event("pm")],
  } });
  expect(items.map((item) => item.key).sort()).toEqual(["match:video-am", "schedule:pm"]);
});

test("Analysis Room date-only fallback cannot hide ambiguous or identified activities", () => {
  const items = (scheduleCandidates) => buildVideoLibraryItems({ library: { matches: [saved("legacy")], scheduleCandidates } });
  expect(items([event("", "Morning")])).toHaveLength(1);
  expect(items([event("", "Morning"), event("", "Afternoon")])).toHaveLength(3);
  expect(items([event("new", "Morning")])).toHaveLength(2);
  expect(buildVideoLibraryItems({ library: { matches: [saved("identified", "am")], scheduleCandidates: [event("", "Afternoon")] } })).toHaveLength(2);
});

test("Analysis Room excludes off, meeting, travel and invalid candidates before normalizing", () => {
  const candidates = [event("training"), { ...event("match"), type: "match" }, ...["off", "meeting", "travel", ""].map((type) => ({ ...event(type), type })), null, { ...event("bad"), date: "" }];
  const context = normalizeContextScheduleCandidates({ getScheduleState: () => ({ events: candidates }) });
  expect(context.map((item) => item.scheduleEventId)).toEqual(["training", "match"]);
  expect(mergeScheduleCandidates(candidates, [event("training", "Renamed training")])).toHaveLength(2);
});

test("Analysis Room zero-result search never falls back to unfiltered calendar entries", () => {
  const state = { library: { matches: [saved("am")], filters: { search: "nonexistent", calendarMonth: "2026-06" } } };
  expect(filterVideoLibraryItems(buildVideoLibraryItems(state), state.library.filters)).toHaveLength(0);
  const html = renderVideoLibrary(state);
  expect(html).toContain("No matches or training sessions found.");
  expect(html).not.toContain("data-video-analysis-open-library-item=");
});

test("Analysis Room result pages reach all loaded entries and clamp stale page numbers", () => {
  const items = Array.from({ length: 19 }, (_, id) => ({ id }));
  expect([0, 1, 2].flatMap((page) => videoLibraryResultPage(items, page).items)).toEqual(items);
  expect(videoLibraryResultPage(items, 99)).toMatchObject({ page: 2, pageCount: 3, start: 17, end: 19 });
  expect(videoLibraryResultPage(items, -1).page).toBe(0);
  expect(videoLibraryResultPage([], 99)).toMatchObject({ page: 0, pageCount: 1, start: 0, end: 0, items: [] });
  expect(videoLibraryResultPage(Array.from({ length: 50000 }), 6249)).toMatchObject({ start: 49993, end: 50000, pageCount: 6250 });
});

test("Analysis Room exposes day overflow and bounded result navigation", () => {
  const html = renderVideoLibrary({ library: {
    matches: Array.from({ length: 12 }, (_, id) => saved(`session-${id}`)),
    filters: { date, calendarMonth: "2026-06" },
  } });
  expect(html).toContain('aria-label="Show all 12 activities for 15/06/2026"');
  expect(html).toContain('aria-label="Next results"');
  expect(html.match(/class="video-analysis-library-row /g)).toHaveLength(8);
});

test("Analysis Room retains loaded data on refresh failure and can retry", async () => {
  let state = { library: { status: "ready", matches: [saved("saved")], scheduleCandidates: [event("remote")] } };
  let fail = true;
  const run = {
    context: { getScheduleState: () => ({ events: [event("local")] }) },
    store: { getState: () => state, update: (updater) => { state = updater(state); } },
    videos: { listMatches: async () => {
      expect(state.library.status).toBe("loading");
      if (fail) throw new Error("Temporary failure <script>");
      return { matches: [saved("fresh")], scheduleCandidates: [event("remote")] };
    } },
  };
  const controller = createVideoLibraryController({ getRuntime: () => run, shouldLoadMetadata: () => true });
  await controller.loadLibrary();
  expect(state.library.matches[0].id).toBe("saved");
  expect(state.library.scheduleCandidates.map((item) => item.scheduleEventId)).toEqual(["remote", "local"]);
  expect(renderVideoLibrary(state)).toContain('role="alert"');
  expect(renderVideoLibrary(state)).toContain("Temporary failure &lt;script&gt;");
  fail = false;
  await controller.loadLibrary();
  expect(state.library).toMatchObject({ status: "ready", error: "" });
  expect(state.library.matches[0].id).toBe("fresh");
});
