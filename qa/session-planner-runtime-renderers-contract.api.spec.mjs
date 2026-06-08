import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Session Planner runtime renderers own renderer wiring outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const runtimeSource = readProjectFile("src/modules/session-planner/session-planner-runtime-renderers.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("createSessionPlannerRuntimeRenderers({");
  expect(appSource).not.toContain("createSessionPlannerRenderer({");
  expect(appSource).not.toContain("createSessionPlannerWorkspaceRenderer({");
  expect(appSource).not.toContain("createSessionPlannerPlayerBoardRenderer({");
  expect(appSource).not.toContain("createSessionPlannerVisualRenderer({");
  expect(appSource).not.toContain("createSessionPlannerPrintRenderer({");
  expect(runtimeSource).toContain("createSessionPlannerRenderer({");
  expect(runtimeSource).toContain("createSessionPlannerWorkspaceRenderer({");
  expect(runtimeSource).toContain("createSessionPlannerPlayerBoardRenderer({");
  expect(runtimeSource).toContain("createSessionPlannerVisualRenderer({");
  expect(runtimeSource).toContain("createSessionPlannerPrintRenderer({");
  expect(indexSource).toContain('export * from "./session-planner-runtime-renderers.mjs";');
});

test("Session Planner runtime renderers stay render-only and do not own save pipelines", () => {
  const runtimeSource = readProjectFile("src/modules/session-planner/session-planner-runtime-renderers.mjs");

  expect(runtimeSource).not.toContain("localStorage");
  expect(runtimeSource).not.toContain("setItem");
  expect(runtimeSource).not.toContain("rawDataSafetySetItem");
  expect(runtimeSource).not.toContain("queueCentralStateWrite");
  expect(runtimeSource).not.toContain("writeSessionPlannerState");
  expect(runtimeSource).not.toContain("writeMedicalState");
  expect(runtimeSource).not.toContain("writePlayerProfilesState");
});
