import { test, expect } from "@playwright/test";
import { normalizeClipDrawings, MAX_CLIP_DRAWINGS } from "../src/modules/video-analysis/timeline/timeline.clip-drawing.model.js";
import { playlistClipVersion } from "../src/modules/video-analysis/timeline/timeline.playlist-clips.js";

const arrow = { tool: "arrow", atMs: 1578, sourceId: `local-video-${"a".repeat(40)}`,
  geometry: { x1: 49.12345, y1: 55, x2: 12, y2: 33 } };

test("drawings only accept finite video-space geometry, a registered source and supported tools", () => {
  expect(normalizeClipDrawings([
    null, { ...arrow, tool: "<svg>" }, { ...arrow, sourceId: "blob:unregistered" },
    { ...arrow, atMs: -1 }, { ...arrow, geometry: { ...arrow.geometry, x2: "10" } },
    { ...arrow, geometry: { ...arrow.geometry, y2: Infinity } },
    { ...arrow, geometry: { ...arrow.geometry, x2: 101 } },
    { ...arrow, geometry: { ...arrow.geometry, unexpected: "stripped" } },
  ])).toEqual([{ ...arrow, geometry: { ...arrow.geometry, x1: 49.123 } }]);
  expect(normalizeClipDrawings(Array.from({ length: 100 }, () => arrow))).toHaveLength(MAX_CLIP_DRAWINGS);
});

test("drawing overrides are independent, and undoing the last shape leaves metadata intact", () => {
  const original = { id: "clip", tags: ["Original"] };
  const first = playlistClipVersion(original, { note: "Review note", drawings: [arrow] });
  const second = playlistClipVersion(original, { note: "Different review" });
  expect(original).toEqual({ id: "clip", tags: ["Original"] });
  expect(second.playlistEdits).toEqual({ note: "Different review" });
  expect(playlistClipVersion(first, { drawings: [] }).playlistEdits).toEqual({ note: "Review note" });
  expect(first.playlistEdits.drawings).toHaveLength(1);
});
