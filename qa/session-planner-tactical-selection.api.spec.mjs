import { expect, test } from "@playwright/test";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";
import { createSessionPlannerTacticalSelectionHelpers } from "../src/modules/session-planner/session-planner-tactical-selection-helpers.mjs";
import { createSessionPlannerTacticalTransformHelpers } from "../src/modules/session-planner/session-planner-tactical-transform-helpers.mjs";
import { duplicateSessionPlannerTacticalClipboard } from "../src/modules/session-planner/session-planner-tactical-clipboard-helpers.mjs";
import { isSessionPlannerTacticalLineTool } from "../src/modules/session-planner/session-planner-tactical-placement-helpers.mjs";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const { cloneTacticalElement, createStableId } = createSessionPlannerTacticalHelpers();
const selection = createSessionPlannerTacticalSelectionHelpers({
  clamp,
  getEndpointCoordinates: (element) => element,
  isStrokeElement: (element) => isSessionPlannerTacticalLineTool(element.type) || element.type === "freehand",
});
const transforms = createSessionPlannerTacticalTransformHelpers({ clamp, cloneElement: cloneTacticalElement });
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

for (const type of ["blue-player", "red-player", "neutral-player", "coach", "ball", "cone", "mini-goal", "big-goal", "mannequin", "pole", "gate", "text"]) {
  test(`${type} selects only at its visible position, including old copied geometry`, () => {
    const element = cloneTacticalElement({ id: "marker", type, x: 80, y: 80 });
    expect(selection.getElementsInRect([element], rect(35, 35, 45, 45))).toEqual([]);
    expect(selection.getElementsInRect([element], rect(0, 0, 5, 5))).toEqual([]);
    expect(selection.getElementsInRect([element], rect(78, 78, 82, 82))).toEqual([element]);
    // Older copy/drag operations could materialize absent endpoint fields.
    Object.assign(element, { x2: 8, y2: 8, controlX: 8, controlY: 8 });
    expect(selection.getElementsInRect([element], rect(40, 40, 48, 48))).toEqual([]);
    expect(selection.getElementSelectionPoints(element)).toEqual([{ x: 80, y: 80 }]);
    const bounds = selection.getElementBounds(element);
    expect((bounds.left + bounds.right) / 2).toBe(80);
    expect((bounds.top + bounds.bottom) / 2).toBe(80);
  });
}

test("actual zero coordinates are selectable while absent coordinates are ignored", () => {
  const corner = cloneTacticalElement({ type: "cone", x: 0, y: 0 });
  expect(selection.getElementsInRect([corner], rect(0, 0, 1, 1))).toEqual([corner]);
  for (const absent of [null, undefined, "", " "]) {
    const line = { type: "line", x: 70, y: 70, x2: absent, y2: absent };
    expect(selection.getElementsInRect([line], rect(0, 0, 40, 40))).toEqual([]);
  }
});

test("copy and repeated movement never invent absent endpoints or curve controls", () => {
  const original = cloneTacticalElement({ id: "original", type: "blue-player", x: 70, y: 60 });
  const before = structuredClone(original);
  const copies = [0, 1, 2].flatMap((pasteCount) => duplicateSessionPlannerTacticalClipboard({
    clipboard: [original], cloneElement: cloneTacticalElement, createStableId,
    moveElementFromInitial: transforms.moveElementFromInitial, pasteCount,
  }));
  expect(new Set([original, ...copies].map((element) => element.id)).size).toBe(4);
  for (const copy of copies) {
    transforms.moveElementByDelta(copy, 2, 3);
    transforms.moveElementByDelta(copy, -1, -1);
    expect(copy).toMatchObject({ x2: null, y2: null, controlX: null, controlY: null });
    expect(selection.getElementsInRect([copy], rect(30, 25, 45, 40))).toEqual([]);
  }
  expect(original).toEqual(before);
});

test("real endpoint and control points at zero continue to move with drawn geometry", () => {
  const curve = cloneTacticalElement({ type: "curve", x: 20, y: 30, x2: 0, y2: 0, controlX: 0, controlY: 10 });
  transforms.moveElementByDelta(curve, 5, 6);
  expect(curve).toMatchObject({ x: 25, y: 36, x2: 5, y2: 6, controlX: 5, controlY: 16 });
  expect(selection.getElementsInRect([curve], rect(4, 5, 6, 7))).toEqual([curve]);
  const freehand = cloneTacticalElement({ type: "freehand", x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 20, y: 30 }] });
  transforms.moveElementByDelta(freehand, 5, 6);
  expect(freehand.points).toEqual([{ x: 5, y: 6 }, { x: 25, y: 36 }]);
  expect(freehand).toMatchObject({ x2: null, y2: null, controlX: null, controlY: null });
});
