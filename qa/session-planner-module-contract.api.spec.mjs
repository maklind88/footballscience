import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createSessionPlannerAutosaveBoundary,
  createSessionPlannerRenderer,
  createSessionPlannerVisualRenderer,
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
    "src/modules/session-planner/session-planner-visual-renderer.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });

  expect(sessionPlannerModuleId).toBe("session-planner");
  expect(sessionPlannerStorageKey).toBe("football-session-planner-v3");
  expect(sessionPlannerAutosaveActiveWindowMs).toBeGreaterThanOrEqual(10000);
});

test("Session Planner visual renderer owns tactical board pitch, objects, preview, and toolbox markup", () => {
  const visualRenderer = createSessionPlannerVisualRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    getState: () => ({
      visualPreviewOpen: true,
      tacticalboardOpen: true,
      tool: "blue-player",
      color: "#111827",
      lineWidth: 1.1,
      lineStyle: "solid",
      pendingPoint: { x: 33, y: 44 },
      selectedElementId: "el-1",
      draftLineState: null,
      freehandState: null,
    }),
    getPitchModeOptions: () => [{ key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false }],
    normalizeTacticalPitchMode: (value) => String(value || "full").trim() || "full",
    getTacticalPitchModeOption: () => ({ key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false }),
    isTacticalElementSelected: (id) => id === "el-1",
    normalizeTacticalColor: (value, fallback = "#111827") => value || fallback,
    getDefaultTacticalColor: () => "#111827",
    getTacticalRenderStrokeWidth: () => 0.6,
    getTacticalStrokeDasharray: () => "",
    getDefaultTacticalLineStyle: () => "solid",
    getTacticalCurveControlPoint: () => ({ x: 40, y: 40 }),
    getTacticalDefaultCurveControlPoint: () => ({ x: 40, y: 40 }),
    isTacticalGoalType: () => false,
    isTacticalPlayerType: (type) => ["blue-player", "red-player", "neutral-player"].includes(type),
    normalizeTacticalRotation: (value) => Number(value) || 0,
    normalizeTacticalPlayerBadge: (value) => String(value || "").slice(0, 2),
    isTacticalEndpointElement: (element) => ["arrow", "line", "zone", "ellipse", "curve", "run", "dashed-line", "dashed-zone"].includes(element?.type),
    getTacticalPitchDimensionsForBlock: () => ({ x: 65, y: 105 }),
    cloneTacticalElement: (element) => ({ ...element }),
    createLineElement: (type, from, to) => ({ type, x: from.x, y: from.y, x2: to.x, y2: to.y }),
    renderSelectionBox: () => '<rect class="session-tactical-selection-box"></rect>',
    ensureTacticalFrames: (block) => block.tacticalFrames || [{ id: "frame-1", label: "Frame 1", elements: block.tacticalElements || [] }],
    getTacticalActiveFrameId: () => "frame-1",
    getTacticalSelectedElementIds: () => ["el-1"],
    getTacticalNumberPickerElementId: () => "el-2",
  });
  const block = {
    id: "block-1",
    title: "Tactical",
    diagram: "build-up",
    tacticalPitchMode: "full",
    tacticalElements: [
      { id: "el-1", type: "arrow", x: 10, y: 20, x2: 40, y2: 50, color: "#111827" },
      { id: "el-2", type: "blue-player", x: 35, y: 42, playerNumber: "9" },
    ],
    tacticalFrames: [{ id: "frame-1", label: "Frame 1", elements: [] }],
  };

  const pitchMarkup = visualRenderer.renderPitchDiagram("build-up");
  const boardMarkup = visualRenderer.renderExerciseVisual(block, { large: true, editor: true });
  const previewMarkup = visualRenderer.renderVisualPreviewOverlay(block);
  const tacticalboardMarkup = visualRenderer.renderTacticalboardOverlay(block);

  expect(pitchMarkup).toContain("session-pitch-diagram-build-up");
  expect(boardMarkup).toContain("data-session-tactical-canvas");
  expect(boardMarkup).toContain('data-session-tactical-element-id="el-1"');
  expect(boardMarkup).toContain("session-tactical-selection-box");
  expect(boardMarkup).toContain("session-tactical-player-badge");
  expect(boardMarkup).toContain("session-tactical-number-picker");
  expect(previewMarkup).toContain("data-session-visual-preview-overlay");
  expect(tacticalboardMarkup).toContain("data-session-tacticalboard-overlay");
  expect(tacticalboardMarkup).toContain('data-session-tactical-tool="blue-player"');
  expect(tacticalboardMarkup).toContain('data-session-tactical-frame="frame-1"');
  expect(tacticalboardMarkup).toContain("data-session-tactical-color");
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
  expect(app).toContain("createSessionPlannerVisualRenderer");
  expect(app).toContain("sessionPlannerAutosaveBoundary.markSessionPlannerWrite();");
  expect(app).toContain("sessionPlannerRenderer.renderBlockList(session)");
  expect(app).toContain("sessionPlannerRenderer.renderEditableField(block, key, label, options)");
  expect(app).toContain("sessionPlannerVisualRenderer.renderExerciseVisual(block, options)");
  expect(app).toContain("sessionPlannerVisualRenderer.renderTacticalboardOverlay(block)");
  expect(app).not.toContain('const sessionPlannerStorageKey = "football-session-planner-v3";');
  expect(app).not.toContain('return workspaceId === "session-planner";');
});

test("Session Planner is tracked as partial extraction while deeper UI remains in app.js", () => {
  const contract = moduleStandardRegistry.require("session-planner");

  expect(contract.migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
  expect(contract.currentFiles).toContain("src/modules/session-planner/index.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-autosave.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-renderer.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-visual-renderer.mjs");
  expect(contract.testFiles).toContain("qa/session-planner-module-contract.api.spec.mjs");
  expect(platformModuleImplementationStages["session-planner"]).toBe("partial-extraction");
});
