import { expect, test } from "@playwright/test";
import { renderTimeline } from "../src/modules/video-analysis/timeline/timeline.renderer.js";
import { renderPlayerHeaderActions } from "../src/modules/video-analysis/components/PlayerHeaderActions.js";

function matchState() {
  return {
    canEdit: true,
    videoRef: { durationMs: 600000 },
    timeline: { laneMode: "subPhase", zoom: 1 },
    clips: [
      { id: "press", startMs: 30000, endMs: 45000, subPhase: "High Press" },
      { id: "build", startMs: 60000, endMs: 75000, subPhase: "Build Up" },
    ],
    timelineWorkspace: {
      activeTimelineId: "extra",
      editorOpen: true,
      dirtyTimelineIds: ["extra"],
      timelines: [
        { id: "match", title: "Match timeline", rows: [] },
        { id: "extra", title: "Timeline 7", rows: [
          { id: "only-press", label: "Custom press row", hidden: true, clipIds: ["press"] },
        ] },
      ],
    },
  };
}

test("single match timeline ignores extra timeline row filters without changing saved work", () => {
  const state = matchState();
  const before = structuredClone(state);
  const html = renderTimeline(state);
  expect(html).toContain('data-video-analysis-seek="press"');
  expect(html).toContain('data-video-analysis-seek="build"');
  expect(html).toContain('data-video-analysis-timeline-clip-count="2"');
  expect(html).toContain('data-video-analysis-timeline-category-label="High Press"');
  expect(html).toContain('data-video-analysis-timeline-category-label="Build Up"');
  expect(html).not.toContain("Custom press row");
  expect(html).not.toContain("video-analysis-workspace-bar");
  expect(html).not.toContain("data-video-analysis-workspace-");
  expect(state).toEqual(before);
});

test("single match timeline starts at the ruler and ignores stale focus without hiding clips", () => {
  const state = matchState();
  state.selectedClipId = "press";
  state.timeline = { ...state.timeline, viewMode: "focus", selectedClipIds: ["press"] };
  const html = renderTimeline(state);
  expect(html).not.toContain("video-analysis-timeline-window-controls");
  expect(html).not.toContain("data-video-analysis-timeline-view=");
  expect(html).not.toContain("data-video-analysis-timeline-zoom=");
  expect(html).not.toContain("data-video-analysis-timeline-undo");
  expect(html).toContain('data-video-analysis-timeline-window-duration-ms="600000"');
  expect(html).toContain('data-video-analysis-timeline-window-start-ms="0"');
  expect(html).toContain('data-video-analysis-seek="build"');
  expect(html).toContain("data-video-analysis-timeline-focus");
  expect(html).toContain("0:00:30");
  expect(html).toContain("0:00:45");
  expect(html).toContain("0:00:15");
});

test("player settings retain undo only for editable tag history", () => {
  const state = matchState();
  expect(renderPlayerHeaderActions(state)).not.toContain("data-video-analysis-timeline-undo");
  state.timeline.history = [{ type: "archive", clipIds: ["press"] }];
  expect(renderPlayerHeaderActions(state)).toContain("data-video-analysis-timeline-undo");
  expect(renderPlayerHeaderActions({ ...state, canEdit: false })).not.toContain("data-video-analysis-timeline-undo");
});
