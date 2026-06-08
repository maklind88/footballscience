import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionPlannerBoardHistoryController } from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Session Planner board history owns undo redo outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const accessorsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const workspaceComposerSource = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const composerSource = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const runtimeServiceSource = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");
  const controllerSource = readProjectFile("src/modules/session-planner/session-planner-board-history-controller.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("createWorkspaceRuntimeComposition({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(workspaceComposerSource).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeService({");
  expect(composerSource).toContain("createSessionPlannerRuntimeService({");
  expect(appSource).not.toContain("createSessionPlannerBoardHistoryController({");
  expect(runtimeServiceSource).toContain("createSessionPlannerBoardHistoryController({");
  expect(appSource).not.toContain("function undoSessionPlannerBoardHistory(");
  expect(appSource).not.toContain("function redoSessionPlannerBoardHistory(");
  expect(appSource).not.toContain("createSessionPlannerRuntimeStateService({");
  expect(runtimeServiceSource).toContain("createSessionPlannerRuntimeStateService({");
  expect(appSource).toContain("runtimeStateService: sessionPlannerRuntimeStateService");
  expect(accessorsSource).toContain("function writeSessionPlannerState(...args)");
  expect(controllerSource).toContain("function undo(type)");
  expect(controllerSource).toContain("function redo(type)");
  expect(controllerSource).toContain("writeState();");
  expect(indexSource).toContain('export * from "./session-planner-board-history-controller.mjs";');
});

test("Session Planner board history controller does not own protected save pipelines", () => {
  const controllerSource = readProjectFile("src/modules/session-planner/session-planner-board-history-controller.mjs");

  expect(controllerSource).not.toContain("localStorage");
  expect(controllerSource).not.toContain("setItem");
  expect(controllerSource).not.toContain("rawDataSafetySetItem");
  expect(controllerSource).not.toContain("queueCentralStateWrite");
  expect(controllerSource).not.toContain("writeSessionPlannerState");
  expect(controllerSource).not.toContain("writeMedicalState");
  expect(controllerSource).not.toContain("writePlayerProfilesState");
});

test("Session Planner board history controller restores tactical snapshots through injected callbacks", () => {
  const block = {
    id: "block-1",
    tacticalPitchMode: "full",
    tacticalFrames: [{ id: "frame-1", label: "Start" }],
    tacticalActiveFrameId: "frame-1",
    tacticalElements: [],
  };
  const calls = {
    cleared: 0,
    markedFields: [],
    rendered: 0,
    reset: 0,
    written: 0,
  };
  const controller = createSessionPlannerBoardHistoryController({
    canEdit: () => true,
    clearTacticalSelection: () => {
      calls.cleared += 1;
    },
    cloneTacticalElement: (element) => ({ ...element }),
    getSelectedBlock: () => block,
    getSelectedDate: () => "2026-05-01",
    markBlockFieldsUpdated: (targetBlock, fields) => {
      calls.markedFields = fields;
      targetBlock.updated = true;
    },
    normalizeTacticalActiveFrameId: (activeFrameId, frames = []) =>
      frames.some((frame) => frame.id === activeFrameId) ? activeFrameId : frames[0]?.id || "",
    normalizeTacticalFrames: (frames = []) => frames.map((frame) => ({ ...frame })),
    normalizeTacticalPitchMode: (mode) => mode || "full",
    renderWorkspace: () => {
      calls.rendered += 1;
    },
    resetTacticalDraftState: () => {
      calls.reset += 1;
    },
    showToast: () => {},
    writeState: () => {
      calls.written += 1;
      return true;
    },
  });

  controller.syncBaseline("tactical", block);
  block.tacticalElements = [{ id: "element-1" }];
  controller.captureFromState();
  block.tacticalElements = [{ id: "element-2" }];
  controller.captureFromState();

  expect(controller.undo("tactical")).toBe(true);

  expect(block.tacticalElements).toEqual([{ id: "element-1" }]);
  expect(calls.markedFields).toEqual(["tacticalPitchMode", "tacticalElements", "tacticalFrames", "tacticalActiveFrameId"]);
  expect(calls.cleared).toBe(1);
  expect(calls.reset).toBe(1);
  expect(calls.rendered).toBe(1);
  expect(calls.written).toBe(1);
});

test("Session Planner board history controller protects player board undo when editing is unavailable", () => {
  const block = {
    id: "block-1",
    playerBoardLayoutMode: "auto",
    playerBoardPositions: { p1: { x: 10, y: 20 } },
    playerBoardColors: {},
    playerBoardCustomPeople: [],
  };
  let toast = "";
  let writes = 0;
  const controller = createSessionPlannerBoardHistoryController({
    canEdit: () => false,
    getSelectedBlock: () => block,
    getSelectedDate: () => "2026-05-01",
    normalizePlayerBoardColors: (source = {}) => ({ ...source }),
    normalizePlayerBoardCustomPeople: (source = []) => [...source],
    normalizePlayerBoardPositions: (source = {}) => ({ ...source }),
    showToast: (message) => {
      toast = message;
    },
    writeState: () => {
      writes += 1;
    },
  });

  controller.syncBaseline("player", block);
  block.playerBoardPositions = { p1: { x: 30, y: 40 } };
  controller.captureFromState();

  expect(controller.undo("player")).toBe(false);
  expect(writes).toBe(0);
  expect(toast).toBe("");
  expect(block.playerBoardPositions).toEqual({ p1: { x: 30, y: 40 } });
});
