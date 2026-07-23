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
  const focusCandidates = [];
  const canvasWrap = {
    innerHTML: "",
    querySelectorAll: () => focusCandidates,
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
        querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? canvasWrap : null,
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
  return { block, calls, controller, focusCandidates, localState };
}

function createCanvasEvent({
  clientX = 0,
  clientY = 0,
  detail = 1,
  elementId = "",
  handle = "",
  rotate = false,
  pointerType = "mouse",
  canvasRect = { left: 0, top: 0, width: 100, height: 100 },
} = {}) {
  const canvas = {
    getBoundingClientRect: () => canvasRect,
  };
  const elementTarget = elementId
    ? {
        dataset: {
          sessionTacticalElementId: elementId,
          ...(handle ? { sessionTacticalHandle: handle } : {}),
        },
      }
    : null;
  const event = {
    clientX,
    clientY,
    detail,
    pointerType,
    preventDefault: () => {},
    stopPropagation: () => {},
    target: {
      closest: (selector) => {
        if (selector === "[data-session-tactical-canvas]") return canvas;
        if (selector === "[data-session-tactical-element-id]") return elementTarget;
        if (selector === "[data-session-tactical-handle]") return handle ? elementTarget : null;
        if (selector === "[data-session-tactical-rotate-handle]") return rotate ? elementTarget : null;
        if (selector === ".session-tactical-number-picker") return null;
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

test("Session Planner tactical controller previews line drag before committing the stroke", () => {
  const { block, controller, localState } = createController();
  controller.setSessionPlannerTacticalTool("arrow");

  const start = createCanvasEvent({ clientX: 10, clientY: 15 });
  controller.startSessionPlannerTacticalDrag(start.event);
  expect(localState.sessionPlannerTacticalDraftLineState).toMatchObject({
    type: "arrow",
    startPoint: { x: 10, y: 15 },
    currentPoint: { x: 10, y: 15 },
    moved: false,
  });
  expect(block.tacticalElements).toHaveLength(0);

  const update = createCanvasEvent({ clientX: 55, clientY: 65 });
  controller.updateSessionPlannerTacticalDrag(update.event);
  expect(localState.sessionPlannerTacticalDraftLineState).toMatchObject({
    type: "arrow",
    currentPoint: { x: 55, y: 65 },
    moved: true,
  });
  expect(block.tacticalElements).toHaveLength(0);

  controller.finishSessionPlannerTacticalDrag();
  expect(localState.sessionPlannerTacticalDraftLineState).toBeNull();
  expect(block.tacticalElements).toHaveLength(1);
  expect(block.tacticalElements[0]).toMatchObject({
    type: "arrow",
    x: 10,
    y: 15,
    x2: 55,
    y2: 65,
  });
});

test("Session Planner tactical controller builds curves from start, control, and end points", () => {
  const { block, controller, localState } = createController();
  controller.setSessionPlannerTacticalTool("curve");

  const start = createCanvasEvent({ clientX: 20, clientY: 25, detail: 1 });
  controller.handleSessionPlannerTacticalCanvasClick(start.event, start.canvas);
  expect(block.tacticalElements).toHaveLength(0);
  expect(localState.sessionPlannerTacticalPendingPoint).toMatchObject({
    type: "curve",
    startPoint: { x: 20, y: 25 },
    controlPoint: null,
  });

  const control = createCanvasEvent({ clientX: 45, clientY: 65, detail: 1 });
  controller.handleSessionPlannerTacticalCanvasClick(control.event, control.canvas);
  expect(block.tacticalElements).toHaveLength(0);
  expect(localState.sessionPlannerTacticalPendingPoint).toMatchObject({
    type: "curve",
    startPoint: { x: 20, y: 25 },
    controlPoint: { x: 45, y: 65 },
  });

  const end = createCanvasEvent({ clientX: 80, clientY: 30, detail: 1 });
  controller.handleSessionPlannerTacticalCanvasClick(end.event, end.canvas);
  expect(localState.sessionPlannerTacticalPendingPoint).toBeNull();
  expect(block.tacticalElements).toHaveLength(1);
  expect(block.tacticalElements[0]).toMatchObject({
    type: "curve",
    x: 20,
    y: 25,
    x2: 80,
    y2: 30,
    controlX: 45,
    controlY: 65,
  });
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

test("Session Planner tactical controller edits only the element and endpoint owned by the active handle", () => {
  const { block, controller, localState } = createController();
  controller.addSessionPlannerTacticalElement({
    type: "curve",
    x: 10,
    y: 15,
    x2: 70,
    y2: 75,
    controlX: 40,
    controlY: 20,
  });
  controller.addSessionPlannerTacticalElement({
    type: "line",
    x: 20,
    y: 25,
    x2: 80,
    y2: 85,
  });
  const [curve, line] = block.tacticalElements;

  controller.startSessionPlannerTacticalDrag(
    createCanvasEvent({ clientX: 10, clientY: 15, elementId: curve.id, handle: "start" }).event
  );
  controller.updateSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 18, clientY: 22 }).event);
  controller.finishSessionPlannerTacticalDrag();

  expect(curve).toMatchObject({
    x: 17.5,
    y: 22.5,
    x2: 70,
    y2: 75,
    controlX: 40,
    controlY: 20,
  });
  expect(line).toMatchObject({ x: 20, y: 25, x2: 80, y2: 85 });
  expect(localState.sessionPlannerTacticalSelectedElementIds).toEqual([curve.id]);

  controller.startSessionPlannerTacticalDrag(
    createCanvasEvent({ clientX: 40, clientY: 20, elementId: curve.id, handle: "control" }).event
  );
  controller.updateSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 55, clientY: 35 }).event);
  controller.finishSessionPlannerTacticalDrag();

  expect(curve).toMatchObject({
    x: 17.5,
    y: 22.5,
    x2: 70,
    y2: 75,
    controlX: 55,
    controlY: 35,
  });
  expect(line).toMatchObject({ x: 20, y: 25, x2: 80, y2: 85 });
});

test("Session Planner tactical controller rotates only the goal owned by the active handle", () => {
  const { block, controller } = createController();
  controller.addSessionPlannerTacticalElement({ type: "big-goal", x: 50, y: 50, rotation: 0 });
  controller.addSessionPlannerTacticalElement({ type: "mini-goal", x: 25, y: 25, rotation: 45 });
  const [firstGoal, secondGoal] = block.tacticalElements;

  controller.startSessionPlannerTacticalDrag(
    createCanvasEvent({
      clientX: 50,
      clientY: 30,
      elementId: firstGoal.id,
      rotate: true,
    }).event
  );
  controller.updateSessionPlannerTacticalDrag(createCanvasEvent({ clientX: 70, clientY: 50 }).event);
  controller.finishSessionPlannerTacticalDrag();

  expect(firstGoal.rotation).toBe(90);
  expect(secondGoal.rotation).toBe(45);
});

test("Session Planner tactical controller places a selected tool with one touch tap", () => {
  const { block, controller, localState } = createController();
  controller.setSessionPlannerTacticalTool("cone");

  controller.startSessionPlannerTacticalDrag(
    createCanvasEvent({ clientX: 32, clientY: 44, pointerType: "touch" }).event
  );
  controller.finishSessionPlannerTacticalDrag();

  expect(block.tacticalElements).toHaveLength(1);
  expect(block.tacticalElements[0]).toMatchObject({ type: "cone", x: 32.5, y: 45 });
  expect(localState.sessionPlannerTacticalSuppressNextClick).toBe(true);
});

test("Session Planner tactical controller supports keyboard selection, nudge, handles, and goal rotation", () => {
  const { block, controller, focusCandidates, localState } = createController();
  controller.addSessionPlannerTacticalElement({ type: "blue-player", x: 10, y: 10 });
  controller.addSessionPlannerTacticalElement({ type: "line", x: 20, y: 20, x2: 40, y2: 40 });
  controller.addSessionPlannerTacticalElement({ type: "big-goal", x: 60, y: 60, rotation: 0 });
  const [player, line, goal] = block.tacticalElements;
  const focused = [];
  focusCandidates.push({
    dataset: { sessionTacticalElementId: player.id },
    focus: () => focused.push(player.id),
    getAttribute: () => null,
    hasAttribute: () => false,
  });
  const createKeyEvent = ({ key, elementId, handle = "", rotate = false, shiftKey = false }) => ({
    key,
    shiftKey,
    metaKey: false,
    ctrlKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
    target: {
      closest: (selector) => {
        if (selector === "[data-session-tactical-element-id]") {
          return {
            dataset: {
              sessionTacticalElementId: elementId,
              ...(handle ? { sessionTacticalHandle: handle } : {}),
            },
          };
        }
        if (selector === "[data-session-tactical-handle]") {
          return handle
            ? { dataset: { sessionTacticalElementId: elementId, sessionTacticalHandle: handle } }
            : null;
        }
        if (selector === "[data-session-tactical-rotate-handle]") {
          return rotate ? { dataset: { sessionTacticalElementId: elementId } } : null;
        }
        return null;
      },
    },
  });

  expect(
    controller.handleSessionPlannerTacticalKeyboardAction(
      createKeyEvent({ key: "Enter", elementId: player.id })
    )
  ).toBe(true);
  expect(localState.sessionPlannerTacticalSelectedElementIds).toEqual([player.id]);

  controller.handleSessionPlannerTacticalKeyboardAction(
    createKeyEvent({ key: "ArrowRight", elementId: player.id })
  );
  expect(player).toMatchObject({ x: 10.5, y: 10 });
  expect(line).toMatchObject({ x: 20, y: 20, x2: 40, y2: 40 });
  expect(focused).toContain(player.id);

  controller.handleSessionPlannerTacticalKeyboardAction(
    createKeyEvent({ key: "ArrowDown", elementId: line.id, handle: "end", shiftKey: true })
  );
  expect(line).toMatchObject({ x: 20, y: 20, x2: 40, y2: 42 });
  expect(player).toMatchObject({ x: 10.5, y: 10 });

  controller.handleSessionPlannerTacticalKeyboardAction(
    createKeyEvent({ key: "ArrowRight", elementId: goal.id, rotate: true, shiftKey: true })
  );
  expect(goal.rotation).toBe(15);
  expect(line).toMatchObject({ x: 20, y: 20, x2: 40, y2: 42 });
});
