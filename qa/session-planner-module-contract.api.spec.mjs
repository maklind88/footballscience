import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createSessionPlannerAutosaveBoundary,
  createSessionPlannerRenderer,
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

test("Session Planner extraction owns autosave and renderer module boundaries", () => {
  [
    "src/modules/session-planner/index.mjs",
    "src/modules/session-planner/session-planner-autosave.mjs",
    "src/modules/session-planner/session-planner-renderer.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });

  expect(sessionPlannerModuleId).toBe("session-planner");
  expect(sessionPlannerStorageKey).toBe("football-session-planner-v3");
  expect(sessionPlannerAutosaveActiveWindowMs).toBeGreaterThanOrEqual(10000);
});

test("Session Planner renderer owns block form fields, multiselects, notes, and block list markup", () => {
  const renderer = createSessionPlannerRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    canEdit: () => true,
    normalizeMultiValue: (value) => (Array.isArray(value) ? value : String(value || "").split(",").map((item) => item.trim()).filter(Boolean)),
    getMultiSelectOpenField: () => "phase",
    multiSelectFields: new Set(["phase", "subPhase"]),
    getReviewNotesForBlock: () => [
      {
        sessionDate: "2026-05-19",
        blockTitle: "QA Exercise",
        notes: "Good transfer",
      },
    ],
    formatLibraryDate: (value) => `Date ${value}`,
    getScheduleSessionEventForDate: () => ({ title: "Team training" }),
  });
  const block = {
    id: "block-1",
    label: "Block 1",
    title: "Pressing Game",
    phase: "Pressing",
    postSessionNotes: "",
    minutes: 18,
  };
  const fieldMarkup = renderer.renderEditableField(block, "phase", "Phase", {
    long: false,
    listOptions: ["Pressing", "Build Up"],
  });
  const headerMarkup = renderer.renderHeaderField(block, "title", "New Exercise", {
    tag: "textarea",
    className: "session-builder-title-input",
  });
  const notesMarkup = renderer.renderPostSessionNotesCard(block);
  const blockListMarkup = renderer.renderBlockList({
    date: "2026-05-19",
    selectedBlockId: "block-1",
    blocks: [block],
  });
  const emptyBlockMarkup = renderer.renderBlockList({
    date: "2026-05-20",
    selectedBlockId: "",
    blocks: [],
  });

  expect(fieldMarkup).toContain('data-session-multiselect="phase"');
  expect(fieldMarkup).toContain('data-session-multiselect-option="phase"');
  expect(fieldMarkup).toContain('aria-expanded="true"');
  expect(headerMarkup).toContain('data-session-field="title"');
  expect(notesMarkup).toContain("Post Session Notes");
  expect(notesMarkup).toContain("Previous Review Notes");
  expect(notesMarkup).toContain("Good transfer");
  expect(blockListMarkup).toContain('data-session-block-id="block-1"');
  expect(blockListMarkup).toContain('data-session-move-block="block-1"');
  expect(blockListMarkup).toContain('data-session-delete-block="block-1"');
  expect(emptyBlockMarkup).toContain("Training is scheduled");
  expect(emptyBlockMarkup).toContain("Team training is in Schedule");
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

test("Session Planner app integration delegates autosave policy and block rendering to the module", () => {
  const app = readProjectFile("app.js");

  expect(app).toContain("./src/modules/session-planner/index.mjs");
  expect(app).toContain("createSessionPlannerAutosaveBoundary");
  expect(app).toContain("createSessionPlannerRenderer");
  expect(app).toContain("sessionPlannerAutosaveBoundary.markSessionPlannerWrite();");
  expect(app).toContain("sessionPlannerRenderer.renderBlockList(session)");
  expect(app).toContain("sessionPlannerRenderer.renderEditableField(block, key, label, options)");
  expect(app).not.toContain('const sessionPlannerStorageKey = "football-session-planner-v3";');
  expect(app).not.toContain('return workspaceId === "session-planner";');
});

test("Session Planner is tracked as partial extraction while deeper UI remains in app.js", () => {
  const contract = moduleStandardRegistry.require("session-planner");

  expect(contract.migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
  expect(contract.currentFiles).toContain("src/modules/session-planner/index.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-autosave.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-renderer.mjs");
  expect(contract.testFiles).toContain("qa/session-planner-module-contract.api.spec.mjs");
  expect(platformModuleImplementationStages["session-planner"]).toBe("partial-extraction");
});
