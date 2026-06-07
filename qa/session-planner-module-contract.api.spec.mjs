import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createSessionPlannerAutosaveBoundary,
  isSessionPlannerAutosaveKey,
  sessionPlannerAutosaveActiveWindowMs,
  sessionPlannerModuleId,
  sessionPlannerStorageKey,
  shouldShowSessionPlannerAutosaveStatus,
} from "../src/modules/session-planner/index.mjs";
import { moduleMigrationStatuses, moduleStandardRegistry } from "../src/core/index.mjs";
import { platformModuleImplementationStages } from "../src/core/platform-readiness-contracts.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Session Planner autosave extraction owns its first module boundary", () => {
  [
    "src/modules/session-planner/index.mjs",
    "src/modules/session-planner/session-planner-autosave.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });

  expect(sessionPlannerModuleId).toBe("session-planner");
  expect(sessionPlannerStorageKey).toBe("football-session-planner-v3");
  expect(sessionPlannerAutosaveActiveWindowMs).toBeGreaterThanOrEqual(10000);
});

test("Session Planner autosave status never becomes a global platform autosave", () => {
  expect(isSessionPlannerAutosaveKey("football-session-planner-v3")).toBe(true);
  expect(isSessionPlannerAutosaveKey("football-schedule-v1")).toBe(false);
  expect(isSessionPlannerAutosaveKey("football-medical-team-v1")).toBe(false);
  expect(shouldShowSessionPlannerAutosaveStatus("session-planner")).toBe(true);
  expect(shouldShowSessionPlannerAutosaveStatus("schedule")).toBe(false);
  expect(shouldShowSessionPlannerAutosaveStatus("medical-team")).toBe(false);
});

test("Session Planner autosave boundary only surfaces active session writes and sync issues", () => {
  let clock = 1000;
  const statuses = [];
  let workspaceId = "session-planner";
  let visible = null;
  const boundary = createSessionPlannerAutosaveBoundary({
    now: () => clock,
    getActiveWorkspaceId: () => workspaceId,
    setStatus: (...args) => statuses.push(args),
    setVisible: (nextVisible) => {
      visible = nextVisible;
    },
    activeWindowMs: 5000,
  });

  expect(boundary.syncVisibility()).toBe(true);
  expect(visible).toBe(true);
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saving", "Saving")).toBe(false);
  expect(statuses).toEqual([]);

  boundary.markSessionPlannerWrite();
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saving", "Saving")).toBe(true);
  expect(statuses).toEqual([["saving", "Saving"]]);

  clock += 6000;
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saved", "Saved")).toBe(false);
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "issue", "Sync needs attention")).toBe(true);
  expect(statuses.at(-1)).toEqual(["issue", "Sync needs attention"]);

  workspaceId = "schedule";
  expect(boundary.syncVisibility()).toBe(false);
  expect(visible).toBe(false);
  boundary.markSessionPlannerWrite();
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saving", "Saving")).toBe(false);
  expect(boundary.setStatusForKey("football-schedule-v1", "issue", "Schedule issue")).toBe(false);
});

test("Session Planner app integration delegates autosave policy to the module", () => {
  const app = readProjectFile("app.js");

  expect(app).toContain("./src/modules/session-planner/index.mjs");
  expect(app).toContain("createSessionPlannerAutosaveBoundary");
  expect(app).toContain("sessionPlannerAutosaveBoundary.markSessionPlannerWrite();");
  expect(app).not.toContain('const sessionPlannerStorageKey = "football-session-planner-v3";');
  expect(app).not.toContain('return workspaceId === "session-planner";');
});

test("Session Planner is tracked as partial extraction while legacy rendering remains in app.js", () => {
  const contract = moduleStandardRegistry.require("session-planner");

  expect(contract.migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
  expect(contract.currentFiles).toContain("src/modules/session-planner/index.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-autosave.mjs");
  expect(contract.testFiles).toContain("qa/session-planner-module-contract.api.spec.mjs");
  expect(platformModuleImplementationStages["session-planner"]).toBe("partial-extraction");
});
