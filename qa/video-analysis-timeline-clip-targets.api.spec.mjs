import { expect, test } from "@playwright/test";
import { timelineClipHitInsets } from "../src/modules/video-analysis/timeline/timeline.clip-targets.js";
import { renderTimeline } from "../src/modules/video-analysis/timeline/timeline.renderer.js";

const clip = (startMs, endMs) => ({ startMs, endMs });
const insets = (before, after, end) => `--video-analysis-clip-hit-before:${before}%;--video-analysis-clip-hit-after:${after}%;--video-analysis-clip-space-end:${end}%;`;

test("clip hit targets share empty gaps and preserve the source timings", () => {
  const clips = [clip(100, 200), clip(400, 500)];
  const before = structuredClone(clips);
  expect(timelineClipHitInsets(clips, { durationMs: 600 })).toEqual([insets(50, 100, 500), insets(100, 50, 200)]);
  expect(clips).toEqual(before);
});

test("adjacent and overlapping clips cannot expand into each other", () => {
  expect(timelineClipHitInsets([clip(0, 200), clip(100, 300), clip(300, 400)], { durationMs: 400 }))
    .toEqual([insets(0, 0, 200), insets(0, 0, 150), insets(0, 0, 100)]);
});

test("nested clips cannot steal clicks from a longer enclosing clip", () => {
  expect(timelineClipHitInsets([clip(0, 1000), clip(100, 200), clip(201, 301)], { durationMs: 1200 }))
    .toEqual([insets(0, 0, 120), insets(0, 0, 1100), insets(0, 0, 999)]);
});

test("hit targets stay within the visible timeline window", () => {
  expect(timelineClipHitInsets([clip(100, 250), clip(550, 900)], { startMs: 200, durationMs: 400 }))
    .toEqual([insets(0, 300, 800), insets(300, 0, 100)]);
  expect(timelineClipHitInsets([], { durationMs: 600 })).toEqual([]);
});

test("overview clips have descriptive names and precise times without visible numbering", () => {
  const html = renderTimeline({ videoRef: { durationMs: 120000 }, timeline: { laneMode: "all" }, clips: [{
    id: "tiny", subPhase: "High Press", startMs: 10000, endMs: 10100,
    miniGamePrincipleId: "drive-past-press",
  }] });
  expect(html).not.toContain("video-analysis-clip-block__copy");
  expect(html).not.toContain("<strong>1</strong>");
  expect(html).toContain('aria-label="High Press · 0:00:10 - 0:00:10.100 · Duration: 0.1 s · Drive past press"');
  expect(html).toContain('title="Drive past press · 0:00:10 - 0:00:10.100 · Duration: 0.1 s"');
});
