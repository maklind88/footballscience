import { expect, test } from "@playwright/test";
import {
  createSessionPlannerTacticalController,
  createSessionPlannerTacticalHelpers,
  sessionPlannerTacticalSnapStep,
} from "../src/modules/session-planner/index.mjs";

function createController() {
  const block = {
    tacticalElements: [],
    tacticalPitchMode: "full",
  };
  const localState = {
    sessionPlannerTacticalboardOpen: true,
    sessionPlannerTacticalTool: "blue-player",
    sessionPlannerTacticalColor: "#0d4f86",
    sessionPlannerTacticalLineWidth: 1.1,
    sessionPlannerTacticalLineStyle: "solid",
    sessionPlannerTacticalSnapEnabled: true,
    sessionPlannerTacticalPendingPoint: null,
    sessionPlannerTacticalSelectedElementId: "",
    sessionPlannerTacticalSelectedElementIds: [],
    sessionPlannerTacticalDragState: null,
    sessionPlannerTacticalDraftLineState: null,
    sessionPlannerTacticalFreehandState: null,
    sessionPlannerTacticalSelectionState: null,
    sessionPlannerTacticalSuppressNextClick: false,
    sessionPlannerTacticalSuppressNextClickAt: 0,
    sessionPlannerTacticalLastPlacementClick: null,
    sessionPlannerTacticalLastPlacement: null,
    sessionPlannerTacticalClipboard: [],
    sessionPlannerTacticalClipboardPasteCount: 0,
    sessionPlannerTacticalNumberPickerElementId: "",
  };
  const calls = {
    renders: 0,
    toasts: [],
    writes: 0,
  };
  const helpers = createSessionPlannerTacticalHelpers({
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    getLineState: () => ({
      color: localState.sessionPlannerTacticalColor,
      lineWidth: localState.sessionPlannerTacticalLineWidth,
      lineStyle: localState.sessionPlannerTacticalLineStyle,
    }),
    getSelectedBlock: () => block,
  });
  const controller = createSessionPlannerTacticalController({
    canEditSessionPlanner: () => true,
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    cloneSessionPlannerTacticalElement: helpers.cloneTacticalElement,
    createSessionPlannerLineElement: helpers.createLineElement,
    createSessionPlannerStableId: helpers.createStableId,
    getDefaultTacticalColor: helpers.getDefaultTacticalColor,
    getDefaultTacticalLineStyle: helpers.getDefaultTacticalLineStyle,
    getSessionPlannerSelectedBlock: () => block,
    getSessionPlannerTacticalEndpointCoordinates: (element = {}) => ({
      x: element.x,
      y: element.y,
      x2: element.x2,
      y2: element.y2,
      controlX: element.controlX,
      controlY: element.controlY,
    }),
    isSessionPlannerTacticalGoalType: helpers.isTacticalGoalType,
    isSessionPlannerTacticalPlayerType: helpers.isTacticalPlayerType,
    markSessionPlannerBlockFieldsUpdated: (targetBlock, fields) => {
      targetBlock.updatedFields = fields;
    },
    normalizeSessionPlannerTacticalPitchMode: helpers.normalizeTacticalPitchMode,
    normalizeSessionPlannerTacticalPlayerBadge: helpers.normalizeTacticalPlayerBadge,
    normalizeTacticalColor: helpers.normalizeTacticalColor,
    normalizeTacticalLineStyle: helpers.normalizeTacticalLineStyle,
    normalizeTacticalLineWidth: helpers.normalizeTacticalLineWidth,
    normalizeTacticalRotation: helpers.normalizeTacticalRotation,
    persistSessionPlannerTacticalElements: () => {
      calls.writes += 1;
    },
    renderSessionPlannerExerciseVisual: () => "<svg></svg>",
    renderSessionPlannerWorkspace: () => {
      calls.renders += 1;
    },
    sessionPlannerTacticalSnapStep,
    showSessionPlannerToast: (message, tone = "success") => {
      calls.toasts.push({ message, tone });
    },
    ui: {
      sessionPlannerWorkspace: {
        querySelector: () => null,
        querySelectorAll: () => [],
      },
    },
    undoSessionPlannerBoardHistory: () => {
      calls.undo = true;
    },
    win: {
      confirm: () => true,
      prompt: () => "Note",
    },
    writeSessionPlannerState: () => {
      calls.writes += 1;
    },
    getLocalState: () => localState,
    setLocalState: (patch = {}) => {
      Object.assign(localState, patch);
    },
  });
  return { block, calls, controller, localState };
}

function createCanvasEvent({
  clientX = 0,
  clientY = 0,
  detail = 1,
  elementId = "",
  canvasRect = { left: 0, top: 0, width: 100, height: 100 },
} = {}) {
  const canvas = {
    getBoundingClientRect: () => canvasRect,
  };
  const elementTarget = elementId
    ? {
        dataset: { sessionTacticalElementId: elementId },
      }
    : null;
  const event = {
    clientX,
    clientY,
    detail,
    preventDefault: () => {},
    stopPropagation: () => {},
    target: {
      closest: (selector) => {
        if (selector === "[data-session-tactical-canvas]") return canvas;
        if (selector === "[data-session-tactical-element-id]") return elementTarget;
        return null;
      },
    },
  };
  return { canvas, event };
}

test("Session Planner tactical controller owns tool state, selection, placement, and arrange hooks", () => {
  const { block, calls, controller, localState } = createController();

  controller.setSessionPlannerTacticalTool("pass");
  expect(localState.sessionPlannerTacticalTool).toBe("pass");
  expect(localState.sessionPlannerTacticalLineStyle).toBe("dashed");
  expect(calls.renders).toBeGreaterThan(0);

  controller.addSessionPlannerTacticalElement({ type: "blue-player", x: 10, y: 10, playerNumber: "8" });
  controller.addSessionPlannerTacticalElement({ type: "red-player", x: 30, y: 20, playerNumber: "6" });
  expect(block.tacticalElements).toHaveLength(2);
  expect(localState.sessionPlannerTacticalSelectedElementIds).toHaveLength(1);
  expect(calls.writes).toBeGreaterThanOrEqual(2);

  const ids = block.tacticalElements.map((element) => element.id);
  controller.setSessionPlannerTacticalSelectedElements(ids, ids[0]);
  expect(controller.copySelectedSessionPlannerTacticalElements()).toBe(true);
  expect(localState.sessionPlannerTacticalClipboard).toHaveLength(2);
  expect(controller.pasteSessionPlannerTacticalClipboard()).toBe(true);
  expect(block.tacticalElements).toHaveLength(4);

  controller.setSessionPlannerTacticalSelectedElements(ids, ids[0]);
  controller.arrangeSelectedSessionPlannerTacticalElements("row");
  expect(calls.toasts.at(-1).message).toContain("Arranged 2 selected");
  expect(block.tacticalElements[0].x).not.toBe(block.tacticalElements[1].x);
});

test("Session Planner tactical controller places tools only from double-click and clears selection on empty click", () => {
  const { block, controller, localState } = createController();
  controller.setSessionPlannerTacticalTool("cone");

  const singleClick = createCanvasEvent({ clientX: 28, clientY: 32, detail: 1 });
  controller.handleSessionPlannerTacticalCanvasClick(singleClick.event, singleClick.canvas);
  expect(block.tacticalElements).toHaveLength(0);

  const doubleClick = createCanvasEvent({ clientX: 28, clientY: 32, detail: 2 });
  controller.handleSessionPlannerTacticalCanvasDoubleClick(doubleClick.event, doubleClick.canvas);
  expect(block.tacticalElements).toHaveLength(1);
  expect(block.tacticalElements[0]).toMatchObject({ type: "cone", x: 27.5, y: 32.5 });

  controller.addSessionPlannerTacticalElement({ type: "blue-player", x: 12, y: 12 });
  controller.addSessionPlannerTacticalElement({ type: "red-player", x: 18, y: 18 });
  controller.setSessionPlannerTacticalSelectedElements(
    block.tacticalElements.map((element) => element.id),
    block.tacticalElements[0].id
  );
  expect(localState.sessionPlannerTacticalSelectedElementIds).toHaveLength(3);

  const emptyClick = createCanvasEvent({ clientX: 72, clientY: 72, detail: 1 });
  controller.handleSessionPlannerTacticalCanvasClick(emptyClick.event, emptyClick.canvas);
  expect(localState.sessionPlannerTacticalSelectedElementIds).toEqual([]);
  expect(block.tacticalElements).toHaveLength(3);
});

test("Session Planner tactical controller box-selects without placing and moves only selected items", () => {
  const { block, controller, localState } = createController();
  controller.setSessionPlannerTacticalTool("blue-player");
  controller.addSessionPlannerTacticalElement({ type: "blue-player", x: 10, y: 10 });
  controller.addSessionPlannerTacticalElement({ type: "red-player", x: 24, y: 24 });
  controller.addSessionPlannerTacticalElement({ type: "neutral-player", x: 82, y: 82 });
  const [first, second, third] = block.tacticalElements;

  const startSelection = createCanvasEvent({ clientX: 5, clientY: 5 });
  controller.startSessionPlannerTacticalDrag(startSelection.event);
  controller.updateSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 40, clientY: 40 }).event);
  controller.finishSessionPlannerTacticalDrag();

  expect(localState.sessionPlannerTacticalSelectedElementIds).toEqual([first.id, second.id]);
  expect(block.tacticalElements).toHaveLength(3);

  controller.setSessionPlannerTacticalSelectedElements([first.id, second.id], first.id);
  controller.startSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 10, clientY: 10, elementId: first.id }).event);
  controller.updateSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 20, clientY: 15 }).event);
  controller.finishSessionPlannerTacticalDrag();

  expect(first).toMatchObject({ x: 20, y: 15 });
  expect(second).toMatchObject({ x: 34, y: 29 });
  expect(third).toMatchObject({ x: 82, y: 82 });

  controller.setSessionPlannerTacticalSelectedElements([first.id, second.id], first.id);
  controller.startSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 82, clientY: 82, elementId: third.id }).event);
  controller.updateSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 92, clientY: 92 }).event);
  controller.finishSessionPlannerTacticalDrag();

  expect(first).toMatchObject({ x: 20, y: 15 });
  expect(second).toMatchObject({ x: 34, y: 29 });
  expect(third).toMatchObject({ x: 92, y: 92 });
  expect(localState.sessionPlannerTacticalSelectedElementIds).toEqual([third.id]);
});

test("Session Planner tactical controller applies colour to every selected object and stroke settings only to drawn elements", () => {
  const { block, controller } = createController();
  controller.addSessionPlannerTacticalElement({ type: "blue-player", x: 10, y: 10 });
  controller.addSessionPlannerTacticalElement({ type: "red-player", x: 20, y: 20 });
  controller.addSessionPlannerTacticalElement({ type: "line", x: 30, y: 30, x2: 60, y2: 60 });

  const [firstPlayer, secondPlayer, line] = block.tacticalElements;
  controller.setSessionPlannerTacticalSelectedElements([firstPlayer.id, secondPlayer.id, line.id], firstPlayer.id);
  controller.updateSelectedSessionPlannerTacticalElement({
    color: "#10b981",
    lineStyle: "dotted",
    lineWidth: 4,
  });

  expect(firstPlayer.color).toBe("#10b981");
  expect(secondPlayer.color).toBe("#10b981");
  expect(line.color).toBe("#10b981");
  expect(firstPlayer.lineStyle).toBe("solid");
  expect(secondPlayer.lineStyle).toBe("solid");
  expect(line.lineStyle).toBe("dotted");
  expect(firstPlayer.lineWidth).toBe(1.1);
  expect(secondPlayer.lineWidth).toBe(1.1);
  expect(line.lineWidth).toBe(4);
});
