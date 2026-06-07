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
  const app = readProjectFile("app.js");
  const controller = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");

  expect(typeof createSessionPlannerWorkspaceController).toBe("function");
  expect(app).toContain("createSessionPlannerWorkspaceController");
  expect(app).toContain("var sessionPlannerWorkspaceController;");
  expect(app).toContain("} = sessionPlannerWorkspaceController;");
  expect(app).toContain("renderSessionPlannerWorkspace,");
  expect(controller).toContain("function renderSessionPlannerWorkspace(options = {})");
  expect(controller).toContain("function getSessionPlannerSelectedSession()");
  expect(controller).toContain("function setSessionPlannerPlayerBoardOpen(isOpen)");
  expect(controller).toContain("function printSessionPlannerCurrentSession()");
  expect(controller).toContain("createSessionPlannerTacticalController");
  expect(controller).toContain("getLocalState");
  expect(controller).toContain("setLocalState");
  expect(controller).toContain("writeSessionPlannerState,");
  expect(controller).not.toContain("function writeSessionPlannerState()");
  expect(app).toContain("function writeSessionPlannerState()");
  expect(app).not.toContain("const previousDateControls = ui.sessionPlannerWorkspace.querySelector");
});
