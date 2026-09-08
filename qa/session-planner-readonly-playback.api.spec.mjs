import { expect, test } from "@playwright/test";
import { getReadonlyTacticalView, renderReadonlyTacticalPlayback } from "../src/modules/session-planner/session-planner-readonly-playback-renderer.mjs";
import { createReadonlyTacticalPlaybackController } from "../src/modules/session-planner/session-planner-readonly-playback-controller.mjs";
import { createSessionPlannerVisualRenderer } from "../src/modules/session-planner/session-planner-visual-renderer.mjs";
import { createSessionPlannerWorkspaceRenderer } from "../src/modules/session-planner/session-planner-workspace-renderer.mjs";
import { createSessionPlannerPrintRenderer } from "../src/modules/session-planner/session-planner-print-renderer.mjs";

function block() {
  return { id: "block", title: "Exercise", objective: "Private notes", tacticalPitchMode: "full-wide",
    tacticalActiveFrameId: "last", tacticalElements: [{ id: "player", x: 90, y: 50 }],
    tacticalFrames: [
      { id: "first", elements: [{ id: "player", x: 20, y: 30 }] },
      { id: "last", elements: [{ id: "player", x: 90, y: 50 }] },
    ] };
}

test("readonly projection starts at the first frame and excludes unrelated session data", () => {
  const source = block();
  const before = structuredClone(source);
  const view = getReadonlyTacticalView(source);
  expect(view.tacticalActiveFrameId).toBe("first");
  expect(view.tacticalElements[0].x).toBe(20);
  expect(view).not.toHaveProperty("objective");
  expect(source).toEqual(before);
  source.tacticalFrames[0].elements = [];
  expect(getReadonlyTacticalView(source).tacticalElements).toEqual([]);
});

test("readonly frames honor the editor's legacy active-frame mirror without changing saved data", () => {
  const source = block();
  source.tacticalFrames[1].elements = [];
  const before = structuredClone(source);
  const view = getReadonlyTacticalView(source);
  expect(view.tacticalElements).toEqual(source.tacticalFrames[0].elements);
  expect(view.tacticalFrames[1].elements).toEqual(source.tacticalElements);
  expect(source).toEqual(before);

  source.tacticalFrames = [{ id: "first", elements: [] }];
  source.tacticalActiveFrameId = "first";
  expect(getReadonlyTacticalView(source).tacticalElements).toEqual(source.tacticalElements);
  expect(source.tacticalFrames[0].elements).toEqual([]);

  source.tacticalFrames[0].elements = before.tacticalElements;
  source.tacticalElements = [];
  expect(getReadonlyTacticalView(source).tacticalElements).toEqual([]);
  delete source.tacticalElements;
  expect(getReadonlyTacticalView(source).tacticalElements).toEqual(before.tacticalElements);
});

test("shared visual previews stay static unless their controller explicitly opts in", () => {
  const renderer = createSessionPlannerVisualRenderer({ getState: () => ({ visualPreviewOpen: true }) });
  const source = block();
  const before = structuredClone(source);
  const legacyPreview = renderer.renderVisualPreviewOverlay(source);
  expect(legacyPreview).toContain('class="session-library-modal session-visual-modal"');
  expect(legacyPreview).not.toContain("data-session-readonly-playback");
  const preview = renderer.renderVisualPreviewOverlay(source, { readOnlyPlayback: true });
  expect(preview).toContain("has-readonly-playback");
  expect(preview).toContain("data-session-readonly-playback");
  expect(source).toEqual(before);
});

test("overview and printed stills use the first frame without changing source or legacy boards", () => {
  const views = [];
  const renderVisual = (view) => { views.push(view); return "<div>Pitch</div>"; };
  const workspace = createSessionPlannerWorkspaceRenderer({
    renderSessionPlannerExerciseVisual: renderVisual,
    renderSessionPlannerActionIcon: () => "",
    renderSessionPlannerPlayerBoard: () => "",
  });
  const print = createSessionPlannerPrintRenderer({
    getState: () => ({ printSections: { visuals: true } }),
    renderExerciseVisual: renderVisual,
  });
  const source = block();
  const emptyFirst = { ...block(), tacticalFrames: [{ id: "empty", elements: [] }, block().tacticalFrames[1]] };
  const legacy = { id: "legacy", visualImage: "/pitch.png", tacticalElements: [{ id: "player", x: 55, y: 40 }] };
  for (const [input, expectedElements] of [
    [source, source.tacticalFrames[0].elements], [emptyFirst, []], [legacy, legacy.tacticalElements],
  ]) {
    const before = structuredClone(input);
    views.length = 0;
    expect(workspace.renderToolsPanel(input)).toContain("<div>Pitch</div>");
    expect(print.renderVisual(input)).toContain("<div>Pitch</div>");
    expect(print.renderVisual(input, { landscape: true })).toContain("<div>Pitch</div>");
    expect(views).toHaveLength(3);
    for (const view of views) {
      expect(view.tacticalElements).toEqual(expectedElements);
      expect(view.visualImage).toBe(input.visualImage);
    }
    expect(input).toEqual(before);
  }
});

test("readonly renderer preserves legacy images, pitch modes and only offers transport controls", () => {
  for (const [mode, width, height] of [["full", 520, 840], ["full-wide", 840, 520],
    ["attacking-half", 520, 420], ["defending-half", 520, 420], ["goalkeeper", 520, 264]]) {
    const source = { ...block(), tacticalPitchMode: mode };
    const html = renderReadonlyTacticalPlayback(source, (view, options) => {
      expect(options).toEqual({ large: true });
      expect(view.tacticalElements[0].x).toBe(20);
      return "<div>Pitch</div>";
    });
    expect(html).toContain(`--readonly-board-width:${width}px;--readonly-board-height:${height}px`);
    expect(html).toContain('class="session-readonly-source" inert');
    for (const action of ["play", "stop", "restart", "loop"]) expect(html).toContain(`data-session-tactical-playback="${action}"`);
    expect(html).not.toMatch(/data-session-(add|delete)-tactical-frame|contenteditable|data-session-tactical-canvas[ =]/);
  }
  const legacy = { visualImage: "/pitch.png", tacticalElements: [{ id: "old" }] };
  expect(getReadonlyTacticalView(legacy).tacticalElements).toEqual(legacy.tacticalElements);
  expect(renderReadonlyTacticalPlayback(legacy, () => "<img>")).not.toContain("session-readonly-controls");
  expect(renderReadonlyTacticalPlayback(block(), () => "")).toBe("");
  expect(renderReadonlyTacticalPlayback(null, () => "")).toBe("");
});

test("equivalent source updates retain readonly playback; changed content, day or block reset it", () => {
  const modal = { isConnected: true, querySelector: () => null, querySelectorAll: () => [], classList: { remove() {} } };
  const root = { querySelector: () => modal };
  let clone;
  const win = { document: {}, ResizeObserver: null };
  const controller = createReadonlyTacticalPlaybackController({ win, getWorkspace: () => root,
    renderVisual: (view) => { clone = view; return ""; } });
  const source = block();
  expect(controller.retain(source, "day:block")).toBeNull();
  controller.mount();
  expect(controller.retain(structuredClone(source), "day:block")).toBe(modal);
  expect(controller.retain({ ...source, objective: "Updated notes", tacticalActiveFrameId: "first",
    tacticalElements: source.tacticalFrames[0].elements }, "day:block")).toBe(modal);
  expect(controller.retain(source, "other-day:block")).toBeNull();
  expect(controller.retain(source, "day:other-block")).toBeNull();
  source.tacticalFrames[0].elements[0].x = 30;
  expect(controller.retain(source, "day:other-block")).toBeNull();
  expect(controller.retain(null, "closed")).toBeNull();
  controller.reset();
  expect(clone).toBeUndefined();
});
