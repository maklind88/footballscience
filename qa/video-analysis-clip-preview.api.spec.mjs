import { test, expect } from "@playwright/test";
import { clipPreviewRange } from "../src/modules/video-analysis/timeline/timeline.clip-preview.controller.js";
import { clipEditorSubPhaseOptions } from "../src/modules/video-analysis/timeline/timeline.clip-editor.renderer.js";
import { editTimelineClip } from "../src/modules/video-analysis/services/clipEditingService.js";

test("clip preview rejects invalid or unavailable ranges without clamping away match time", () => {
  expect(clipPreviewRange({}, 1000, 5000, 6000)).toEqual({ start: 1000, end: 5000, duration: 4000 });
  for (const [start, end] of [[NaN, 5000], [1000, NaN], [-1, 4000], [5000, 1000], [1000, 1000], [1000, 8000]]) {
    expect(clipPreviewRange({}, start, end, 6000)).toBeNull();
  }
});

test("clip preview uses synchronized angle offsets and drift", () => {
  const state = { mediaProduction: { activeAngleId: "side", angles: [{ id: "side", syncOffsetMs: -10000, driftPpm: 1000 }] } };
  expect(clipPreviewRange(state, 20000, 30000, 60000)).toEqual({ start: 10020, end: 20030, duration: 10000 });
  expect(clipPreviewRange(state, 5000, 15000, 60000)).toBeNull();
});

test("clip preview respects portable and replay source windows", () => {
  const portable = { mediaProduction: { portable: { playback: { active: true, url: "blob:review", startMs: 60000, endMs: 90000 } } } };
  expect(clipPreviewRange(portable, 67000, 82000, 30000)).toEqual({ start: 7000, end: 22000, duration: 15000 });
  expect(clipPreviewRange(portable, 50000, 82000, 30000)).toBeNull();
  expect(clipPreviewRange(portable, 67000, 92000, 30000)).toBeNull();
  const replay = { mediaProduction: { activeAngleId: "angle-primary", replay: { buffer: { active: true, angleId: "angle-primary", startMatchMs: 60000, endMatchMs: 90000 } } } };
  expect(clipPreviewRange(replay, 67000, 82000, 30000)).toEqual({ start: 7000, end: 22000, duration: 15000 });
});

test("clip editor filters compatible sub-phases and preserves custom values", () => {
  expect(clipEditorSubPhaseOptions("In Possession", "High Press")).not.toContain('value="High Press"');
  expect(clipEditorSubPhaseOptions("In Possession", "High Press")).toContain('value="Build Up"');
  expect(clipEditorSubPhaseOptions("Offensive Transition")).toContain('value="Offensive Transition"');
  expect(clipEditorSubPhaseOptions("Custom phase", "Custom category")).toContain('value="Custom category"');
  expect(editTimelineClip({ subPhase: "Custom category", phase: "Custom phase" }, { phase: "Set Pieces" }).phase).toBe("Set Pieces");
  expect(editTimelineClip({ subPhase: "High Press" }, { phase: "In Possession" }).phase).toBe("Out of Possession");
});
