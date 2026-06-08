import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSessionPlannerRuntimeDelegates,
  sessionPlannerRuntimeDelegateMethodNames,
} from "../src/modules/session-planner/session-planner-runtime-delegates.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Session Planner runtime delegates keep app-runtime pass-through out of the shell", () => {
  const app = readProjectFile("app-runtime.js");
  const index = readProjectFile("src/modules/session-planner/index.mjs");

  expect(sessionPlannerRuntimeDelegateMethodNames).toContain("renderSessionPlannerWorkspace");
  expect(sessionPlannerRuntimeDelegateMethodNames).toContain("updateSelectedSessionPlannerBlockField");
  expect(sessionPlannerRuntimeDelegateMethodNames).toContain("printSessionPlannerCurrentSession");
  expect(app).toContain("createSessionPlannerRuntimeDelegates({");
  expect(app).not.toContain("function renderSessionPlannerWorkspace(...args)");
  expect(app).not.toContain("} = sessionPlannerWorkspaceController;");
  expect(index).toContain('export * from "./session-planner-runtime-delegates.mjs";');
});

test("Session Planner runtime delegates forward calls to the active controller", () => {
  const calls = [];
  const controller = {
    renderSessionPlannerWorkspace(...args) {
      calls.push({ args, thisValue: this });
      return "rendered";
    },
  };
  const delegates = createSessionPlannerRuntimeDelegates({ getController: () => controller });

  expect(delegates.renderSessionPlannerWorkspace("date-strip")).toBe("rendered");
  expect(calls).toEqual([{ args: ["date-strip"], thisValue: controller }]);
});

test("Session Planner runtime delegates fail loudly when the controller boundary is stale", () => {
  const delegates = createSessionPlannerRuntimeDelegates({ getController: () => ({}) });

  expect(() => delegates.renderSessionPlannerWorkspace()).toThrow(/renderSessionPlannerWorkspace/);
});
