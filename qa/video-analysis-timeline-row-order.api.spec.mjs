import { expect, test } from "@playwright/test";
import { normalizeTimelineRowOrder, orderTimelineLanes, moveTimelineRow,
  timelineRowOrderScope, createTimelineRowOrderPreferences } from "../src/modules/video-analysis/timeline/timeline.row-order.js";
import { renderTimeline } from "../src/modules/video-analysis/timeline/timeline.renderer.js";

const state = () => ({ match: { id: "match-1", team_id: "team-1", organization_id: "org-1" }, timeline: { laneMode: "all" } });
const context = () => {
  const values = new Map();
  return { currentUser: { id: "user-1" }, win: { localStorage: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } } };
};

test("row order rejects malformed values, deduplicates and bounds preference size", () => {
  expect(normalizeTimelineRowOrder({ a: "b" })).toEqual([]);
  expect(normalizeTimelineRowOrder([null, 3, "", "a", "a", "b", "x".repeat(501)])).toEqual(["a", "b"]);
  expect(normalizeTimelineRowOrder(Array.from({ length: 1100 }, (_, i) => String(i)))).toHaveLength(1000);
});

test("row ordering is immutable, stable for new rows and preserves clip references", () => {
  const rows = [{ id: "a", clips: [{ id: "clip", startMs: 3000, endMs: 18000 }] }, { id: "b" }, { id: "c" }, { id: "d" }];
  const before = structuredClone(rows);
  const ordered = orderTimelineLanes(rows, ["missing", "b", "a"]);
  expect(ordered.map(row => row.id)).toEqual(["b", "a", "c", "d"]);
  expect(ordered[1]).toBe(rows[0]);
  expect(rows).toEqual(before);
});

test("move supports both directions, boundaries and no-op targets without losing hidden rows", () => {
  const visible = ["a", "b", "c"];
  const order = ["a", "hidden", "b", "c"];
  expect(moveTimelineRow(order, visible, "c", "a")).toEqual(["c", "a", "hidden", "b"]);
  expect(moveTimelineRow(order, visible, "a", "c", true)).toEqual(["hidden", "b", "c", "a"]);
  expect(moveTimelineRow([], visible, "a", "b", true)).toEqual(["b", "a", "c"]);
  for (const [source, target] of [["a", "a"], ["missing", "a"], ["a", "missing"]]) {
    expect(moveTimelineRow(order, visible, source, target)).toEqual(order);
  }
  expect(order).toEqual(["a", "hidden", "b", "c"]);
});

test("personal order persists after recreation and does not write clip or workspace state", () => {
  const ctx = context(), current = state(), before = structuredClone(current);
  const prefs = createTimelineRowOrderPreferences(() => ctx);
  expect(prefs.read(current).order).toEqual([]);
  expect(prefs.save(current, ["Player / A", "Sub-phase / High Press"])).toEqual({ saved: true });
  expect(createTimelineRowOrderPreferences(() => ctx).read(current).order).toEqual(["Player / A", "Sub-phase / High Press"]);
  expect(current).toEqual(before);
});

test("order is isolated by viewer, organization, team, match and category mode", () => {
  const ctx = context(), current = state();
  const scope = timelineRowOrderScope(current, ctx);
  const variants = [
    timelineRowOrderScope(current, { ...ctx, currentUser: { id: "user-2" } }),
    timelineRowOrderScope({ ...current, match: { ...current.match, organization_id: "org-2" } }, ctx),
    timelineRowOrderScope({ ...current, match: { ...current.match, team_id: "team-2" } }, ctx),
    timelineRowOrderScope({ ...current, match: { ...current.match, id: "match-2" } }, ctx),
    timelineRowOrderScope({ ...current, timeline: { laneMode: "player" } }, ctx),
  ];
  expect(scope.persistent).toBe(true);
  for (const variant of variants) expect(variant.key).not.toBe(scope.key);
  expect(timelineRowOrderScope({ ...current, source: { user_id: "uploader" } }, ctx).key).toBe(scope.key);
  expect(timelineRowOrderScope(current, { ...ctx, currentUser: null }).persistent).toBe(false);
  expect(timelineRowOrderScope({}, ctx).persistent).toBe(false);
});

test("broken or disabled browser storage keeps the timeline usable and order in memory", () => {
  const ctx = context(), current = state();
  ctx.win.localStorage.getItem = () => "broken{";
  ctx.win.localStorage.setItem = () => { throw new Error("quota"); };
  const prefs = createTimelineRowOrderPreferences(() => ctx);
  expect(prefs.read(current).order).toEqual([]);
  expect(prefs.save(current, ["b", "a"])).toEqual({ saved: false });
  expect(prefs.read(current).order).toEqual(["b", "a"]);
  Object.defineProperty(ctx.win, "localStorage", { get: () => { throw new Error("blocked"); } });
  const blocked = createTimelineRowOrderPreferences(() => ctx);
  expect(blocked.read(current).order).toEqual([]);
  expect(blocked.save(current, ["a"])).toEqual({ saved: false });
  expect(blocked.read(current).order).toEqual(["a"]);
});

test("renderer reorders whole rows while preserving clip geometry and category identity", () => {
  const current = { ...state(), videoRef: { durationMs: 120000 }, clips: [
    { id: "press", subPhase: "High Press", startMs: 10000, endMs: 25000 },
    { id: "build", subPhase: "Build Up", startMs: 20000, endMs: 35000 },
  ] };
  const before = structuredClone(current);
  const order = ["Sub-phase / High Press", "Sub-phase / Build Up"];
  const html = renderTimeline({ ...current, timeline: { ...current.timeline, rowOrder: order } });
  expect(html.indexOf('data-video-analysis-row-key="Sub-phase / High Press"'))
    .toBeLessThan(html.indexOf('data-video-analysis-row-key="Sub-phase / Build Up"'));
  expect(html).toContain('data-video-analysis-row-drag="Sub-phase / High Press"');
  expect(html).toContain('data-video-analysis-seek="press"');
  expect(html).toContain('left:8.333333333333332%;width:12.5%;');
  expect(html).toContain('aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"');
  expect(html).not.toContain("video-analysis-workspace-bar");
  expect(current).toEqual(before);
});
