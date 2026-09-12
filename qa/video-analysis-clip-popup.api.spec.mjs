import { test, expect } from "@playwright/test";
import { formatClipEditorTime, parseClipEditorTime, renderClipEditor } from "../src/modules/video-analysis/timeline/timeline.clip-editor.renderer.js";
import { editTimelineClip } from "../src/modules/video-analysis/services/clipEditingService.js";
import { renderPlayerHeaderActions } from "../src/modules/video-analysis/components/PlayerHeaderActions.js";

test("clip popup time fields preserve millisecond precision", () => {
  for (const ms of [0, 1, 67025, 3599999, 7200000, 36000000]) expect(parseClipEditorTime(formatClipEditorTime(ms))).toBe(ms);
  expect(parseClipEditorTime("01:07.5")).toBe(67500);
  for (const value of ["-1", "0:01:99", "0:60:00", "hello", "1:02.1234", ""]) expect(parseClipEditorTime(value)).toBeNaN();
});

test("clip popup escapes saved content and keeps readonly fields disabled", () => {
  const html = renderClipEditor({ id: "x", subPhase: '<img src=x onerror="bad()">', notes: [{ note: "</textarea><script>bad()</script>" }] });
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain('aria-label="Clip timing" disabled');
  expect(html).toContain('class="video-analysis-clip-editor__metadata" disabled');
  expect(html).not.toContain("data-clip-edit-open");
  expect(html).not.toContain("data-video-analysis-timeline-edit-save");
});

test("clip popup time and metadata edits preserve clip identity and source data", () => {
  const clip = { id: "clip", revision: 8, startMs: 1000, endMs: 5000, subPhase: "High Press", outcome: "Neutral", videoId: "v", matchId: "m", players: [{ playerId: "p" }], metadata: { clipKind: "player" } };
  const original = structuredClone(clip);
  const edited = editTimelineClip(clip, { startMs: 2000, endMs: 6000, note: "Review", tags: "press" });
  expect(edited).toMatchObject({ ...clip, startMs: 2000, endMs: 6000, tags: ["press"], notes: [{ note: "Review" }] });
  expect(clip).toEqual(original);
});

test("multiple clip actions live in settings and respect edit permission", () => {
  const state = { canEdit: true, clips: [{ id: "a" }, { id: "b" }], timeline: { selectedClipIds: ["a", "b"] } };
  expect(renderPlayerHeaderActions(state)).toContain("Merge 2 selected clips");
  expect(renderPlayerHeaderActions(state)).toContain("Delete 2 selected clips");
  expect(renderPlayerHeaderActions({ ...state, canEdit: false })).not.toContain("data-video-analysis-timeline-merge");
});
