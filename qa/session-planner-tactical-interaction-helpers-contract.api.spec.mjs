import { expect, test } from "@playwright/test";
import { duplicateSessionPlannerTacticalClipboard } from "../src/modules/session-planner/session-planner-tactical-clipboard-helpers.mjs";
import {
  advanceSessionPlannerTacticalLineClick,
  finishSessionPlannerTacticalDraftLine,
} from "../src/modules/session-planner/session-planner-tactical-line-interaction-helpers.mjs";
import {
  isSessionPlannerTacticalCoarsePointer,
  isSessionPlannerTacticalLineTool,
  isSessionPlannerTacticalPlacementTool,
  shouldPlaceSessionPlannerTacticalDoubleClick,
  shouldSkipRepeatedSessionPlannerTacticalPlacement,
} from "../src/modules/session-planner/session-planner-tactical-placement-helpers.mjs";
import { createSessionPlannerTacticalSelectionHelpers } from "../src/modules/session-planner/session-planner-tactical-selection-helpers.mjs";
import { createSessionPlannerTacticalTransformHelpers } from "../src/modules/session-planner/session-planner-tactical-transform-helpers.mjs";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const cloneElement = (element) => ({
  ...element,
  points: Array.isArray(element.points) ? element.points.map((point) => ({ ...point })) : [],
});

test("Tactical selection helpers own box geometry and element inclusion", () => {
  const helpers = createSessionPlannerTacticalSelectionHelpers({
    clamp,
    getEndpointCoordinates: (element) => element,
    isStrokeElement: (element) => ["line", "curve", "freehand"].includes(element.type),
  });
  const selectionRect = helpers.getSelectionRect({
    startPoint: { x: 40, y: 45 },
    currentPoint: { x: 5, y: 10 },
  });
  const elements = [
    { id: "player", type: "blue-player", x: 12, y: 14 },
    { id: "line", type: "line", x: 70, y: 70, x2: 90, y2: 90 },
  ];

  expect(selectionRect).toEqual({
    left: 5,
    top: 10,
    right: 40,
    bottom: 45,
    x: 5,
    y: 10,
    width: 35,
    height: 35,
  });
  expect(helpers.getElementsInRect(elements, selectionRect).map((element) => element.id)).toEqual(["player"]);
  expect(helpers.uniqueValues(["player", "player", "line"])).toEqual(["player", "line"]);
});

test("Tactical transform and clipboard helpers preserve complete element geometry", () => {
  const transforms = createSessionPlannerTacticalTransformHelpers({ clamp, cloneElement });
  const curve = {
    id: "curve",
    type: "curve",
    x: 10,
    y: 20,
    x2: 40,
    y2: 50,
    controlX: 25,
    controlY: 5,
    points: [],
  };
  transforms.moveElementFromInitial(curve, cloneElement(curve), 8, -4);
  expect(curve).toMatchObject({
    x: 18,
    y: 16,
    x2: 48,
    y2: 46,
    controlX: 33,
    controlY: 1,
  });

  const duplicates = duplicateSessionPlannerTacticalClipboard({
    clipboard: [curve],
    cloneElement,
    createStableId: () => "copy-1",
    moveElementFromInitial: transforms.moveElementFromInitial,
    pasteCount: 0,
  });
  expect(duplicates).toHaveLength(1);
  expect(duplicates[0]).toMatchObject({
    id: "copy-1",
    x: 21.6,
    y: 19.6,
    x2: 51.6,
    y2: 49.6,
    controlX: 36.6,
    controlY: 4.6,
  });
});

test("Tactical line helpers preserve two-point and three-point drawing contracts", () => {
  const start = { x: 10, y: 15 };
  const control = { x: 35, y: 55 };
  const end = { x: 75, y: 30 };
  const first = advanceSessionPlannerTacticalLineClick("curve", null, start);
  const second = advanceSessionPlannerTacticalLineClick("curve", first.pendingPoint, control);
  const third = advanceSessionPlannerTacticalLineClick("curve", second.pendingPoint, end);

  expect(first).toMatchObject({ action: "pending", pendingPoint: { startPoint: start } });
  expect(second).toMatchObject({ action: "pending", pendingPoint: { controlPoint: control } });
  expect(third).toMatchObject({
    action: "complete",
    type: "curve",
    from: start,
    to: end,
    options: { controlPoint: control },
  });
  expect(
    finishSessionPlannerTacticalDraftLine({
      type: "arrow",
      startPoint: start,
      currentPoint: end,
      moved: true,
    })
  ).toMatchObject({ action: "complete", type: "arrow", from: start, to: end });
});

test("Tactical placement helpers distinguish desktop double-click, touch, and duplicate events", () => {
  expect(isSessionPlannerTacticalLineTool("dashed-zone")).toBe(true);
  expect(isSessionPlannerTacticalPlacementTool("cone")).toBe(true);
  expect(isSessionPlannerTacticalPlacementTool("line")).toBe(false);
  expect(isSessionPlannerTacticalCoarsePointer({ pointerType: "touch" })).toBe(true);
  expect(isSessionPlannerTacticalCoarsePointer({ pointerType: "mouse" })).toBe(false);

  const firstClick = shouldPlaceSessionPlannerTacticalDoubleClick({
    point: { x: 20, y: 20 },
    previousClick: null,
    tool: "cone",
    now: 1000,
  });
  const secondClick = shouldPlaceSessionPlannerTacticalDoubleClick({
    point: { x: 21, y: 20 },
    previousClick: firstClick.nextClick,
    tool: "cone",
    now: 1300,
  });
  expect(firstClick.shouldPlace).toBe(false);
  expect(secondClick.shouldPlace).toBe(true);

  const repeated = shouldSkipRepeatedSessionPlannerTacticalPlacement({
    point: { x: 21.2, y: 20 },
    previousPlacement: { tool: "cone", x: 21, y: 20, time: 1300 },
    tool: "cone",
    now: 1400,
  });
  expect(repeated.shouldSkip).toBe(true);
});
