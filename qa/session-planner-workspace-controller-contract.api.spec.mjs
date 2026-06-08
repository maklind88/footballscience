import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionPlannerWorkspaceController } from "../src/modules/session-planner/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Session Planner workspace controller owns workspace UI flow without owning the save pipeline", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const composer = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const runtimeService = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");
  const controller = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const delegates = readProjectFile("src/modules/session-planner/session-planner-runtime-delegates.mjs");

  expect(typeof createSessionPlannerWorkspaceController).toBe("function");
  expect(app).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(app).not.toContain("createSessionPlannerRuntimeService({");
  expect(composer).toContain("createSessionPlannerRuntimeService({");
  expect(app).not.toContain("createSessionPlannerWorkspaceController({");
  expect(runtimeService).toContain("createSessionPlannerWorkspaceController({");
  expect(app).toContain("let sessionPlannerWorkspaceController;");
  expect(app).toContain("createSessionPlannerRuntimeDelegates({");
  expect(app).not.toContain("} = sessionPlannerWorkspaceController;");
  expect(app).not.toContain("function renderSessionPlannerWorkspace(...args)");
  expect(app).toContain("renderSessionPlannerWorkspace,");
  expect(delegates).toContain('"renderSessionPlannerWorkspace"');
  expect(delegates).toContain('"printSessionPlannerCurrentSession"');
  expect(controller).toContain("function renderSessionPlannerWorkspace(options = {})");
  expect(controller).toContain("function getSessionPlannerSelectedSession()");
  expect(controller).toContain("function setSessionPlannerPlayerBoardOpen(isOpen)");
  expect(controller).toContain("function printSessionPlannerCurrentSession()");
  expect(controller).toContain("createSessionPlannerTacticalController");
  expect(controller).toContain("getLocalState");
  expect(controller).toContain("setLocalState");
  expect(controller).toContain("setSessionPlannerExerciseLibrary");
  expect(controller).not.toContain("sessionPlannerExerciseLibrary = writeResult.exercises");
  expect(controller).toContain("writeSessionPlannerState,");
  expect(controller).not.toContain("function writeSessionPlannerState()");
  expect(app).not.toContain("createSessionPlannerRuntimeStateService({");
  expect(runtimeService).toContain("createSessionPlannerRuntimeStateService({");
  expect(app).toContain("runtimeStateService: sessionPlannerRuntimeStateService");
  expect(accessors).toContain("function writeSessionPlannerState(...args)");
  expect(app).not.toContain("const previousDateControls = ui.sessionPlannerWorkspace.querySelector");
});
