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

