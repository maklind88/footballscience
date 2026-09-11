import { expect, test } from "@playwright/test";
import { renderTimeline } from "../src/modules/video-analysis/timeline/timeline.renderer.js";
import { renderPlayerHeaderActions } from "../src/modules/video-analysis/components/PlayerHeaderActions.js";
import { clipBlockStyle } from "../src/modules/video-analysis/timeline/timeline.service.js";
import { handleVideoAnalysisShortcut } from "../src/modules/video-analysis/services/keyboardShortcutService.js";

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
  expect(html).not.toContain("data-video-analysis-timeline-focus");
  expect(html).toContain("0:00:30");
  expect(html).toContain("0:00:45");
});

test("player settings retain undo only for editable tag history", () => {
  const state = matchState();
  expect(renderPlayerHeaderActions(state)).not.toContain("data-video-analysis-timeline-undo");
  state.timeline.history = [{ type: "archive", clipIds: ["press"] }];
  expect(renderPlayerHeaderActions(state)).toContain("data-video-analysis-timeline-undo");
  expect(renderPlayerHeaderActions({ ...state, canEdit: false })).not.toContain("data-video-analysis-timeline-undo");
});

test("timeline shortens visible names without changing category identity or saved clips", () => {
  const state = matchState();
  state.timeline.laneMode = "all";
  state.clips[0].players = [{ player_label: "Ally Schlegel" }];
  const before = structuredClone(state);
  const html = renderTimeline(state);
  expect(html).toContain('data-video-analysis-timeline-category-label="Sub-phase / High Press"');
  expect(html).toContain('data-video-analysis-timeline-category-label="Player / Ally Schlegel"');
  expect(html).toContain('class="video-analysis-lane__name">High Press</span>');
  expect(html).toContain('class="video-analysis-lane__name">Ally Schlegel</span>');
  expect(html).not.toContain('class="video-analysis-lane__name">Sub-phase /');
  expect(html).not.toContain('class="video-analysis-lane__name">Player /');
  expect(state).toEqual(before);
});

test("timeline overlap keeps every clip at its original time without extra subrows", () => {
  const state = matchState();
  state.clips.push({ ...state.clips[0], id: "press-overlap", startMs: 32000, endMs: 47000 });
  const html = renderTimeline(state);
  expect(html).not.toContain("--video-analysis-lane-rows");
  expect(html).not.toContain("--video-analysis-clip-row");
  expect(html).toContain('data-video-analysis-seek="press"');
  expect(html).toContain('data-video-analysis-seek="press-overlap"');
  expect(html).toContain(clipBlockStyle(state.clips[0], 600000));
  expect(html).toContain(clipBlockStyle(state.clips[2], 600000));
});

test("timeline does not inflate short clips or shift clips at the end of the match", () => {
  expect(clipBlockStyle({ startMs: 599000, endMs: 600000 }, 600000))
    .toBe("left:99.83333333333333%;width:0.16666666666666669%;");
  const shortStyle = clipBlockStyle({ startMs: 12000, endMs: 12100 }, 600000);
  expect(shortStyle).toBe("left:2%;width:0.016666666666666666%;");
  expect(clipBlockStyle({ startMs: 600000, endMs: 601000 }, 600000)).toBe("left:100%;width:0%;");
});

test("Enter activates focused timeline clips without invoking the save shortcut", () => {
  let saved = 0;
  let prevented = 0;
  const clipTarget = { closest: selector => selector.startsWith(".video-analysis-clip-block") ? {} : null };
  const root = { contains: () => true };
  const handlers = { root, saveDraftClip: () => { saved += 1; } };
  const event = { key: "Enter", target: clipTarget, preventDefault: () => { prevented += 1; } };
  expect(handleVideoAnalysisShortcut(event, handlers)).toBe(false);
  expect(saved).toBe(0);
  expect(prevented).toBe(0);
  expect(handleVideoAnalysisShortcut({ ...event, target: { closest: () => null } }, handlers)).toBe(true);
  expect(saved).toBe(1);
});
