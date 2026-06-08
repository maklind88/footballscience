import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionPlannerStateMergeHelpers } from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blockMergeFields = Object.freeze(["title", "focus", "minutes", "playerBoardPositions"]);

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function normalizeBlockFieldMeta(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }
  return Object.entries(source).reduce((meta, [field, timestampValue]) => {
    if (!blockMergeFields.includes(field)) {
      return meta;
    }
    const timestamp = new Date(timestampValue || 0).getTime();
    if (Number.isFinite(timestamp) && timestamp) {
      meta[field] = new Date(timestamp).toISOString();
    }
    return meta;
  }, {});
}

function createBlock(overrides = {}) {
  return {
    id: overrides.id || "block-1",
    createdAt: overrides.createdAt || "2026-05-01T08:00:00.000Z",
    updatedAt: overrides.updatedAt || "",
    fieldUpdatedAt: normalizeBlockFieldMeta(overrides.fieldUpdatedAt),
    title: overrides.title || "",
    focus: overrides.focus || "",
    minutes: Number.isFinite(Number(overrides.minutes)) ? Number(overrides.minutes) : 0,
    playerBoardPositions: overrides.playerBoardPositions || {},
  };
}

function createHelpers(stateRef = { current: null }) {
  return createSessionPlannerStateMergeHelpers({
    blockDeletionTombstoneKey: "blockDeletionTombstones",
    blockFieldUpdatedAtKey: "fieldUpdatedAt",
    blockMergeFields,
    blockMergeFieldSet: new Set(blockMergeFields),
    blockReductionGuardKey: "blockReductionGuard",
    blockReductionGuardMaxAgeMs: 30 * 60 * 1000,
    createBlock,
    createEmptySession: (dateValue) => ({
      id: `session-${dateValue}`,
      date: dateValue,
      title: "Session",
      theme: "",
      selectedBlockId: "",
      blocks: [],
    }),
    formatDateValue: () => "2026-05-01",
    getScheduledSessionTitleForDate: () => "",
    getSessionPlannerState: () => stateRef.current,
    normalizeBlockFieldMeta,
    parseTimestampMs: (value) => {
      const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    },
    shouldClearSessionForDate: () => false,
  });
}

test("Session Planner state merge helpers own pure merge logic outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const accessorsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const workspaceComposerSource = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const composerSource = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const helperSource = readProjectFile("src/modules/session-planner/session-planner-state-merge-helpers.mjs");
  const runtimeStateSource = readProjectFile("src/modules/session-planner/session-planner-runtime-state-service.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("createWorkspaceRuntimeComposition({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(workspaceComposerSource).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(appSource).not.toContain("createSessionPlannerStateMergeHelpers({");
  expect(composerSource).toContain("createSessionPlannerStateMergeHelpers({");
  expect(appSource).toContain("stateMergeHelpers: sessionPlannerStateMergeHelpers");
  expect(accessorsSource).toContain("function mergeSessionPlannerBlockForWrite(...args)");
  expect(accessorsSource).toContain("function cloneSessionPlannerState(...args)");
  expect(appSource).not.toContain("function mergeSessionPlannerBlockForWrite(existingBlock");
  expect(appSource).not.toContain("function cloneSessionPlannerState(source");
  expect(appSource).not.toContain("createSessionPlannerRuntimeService({");
  expect(composerSource).toContain("createSessionPlannerRuntimeService({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeStateService({");
  expect(appSource).not.toContain("function readSessionPlannerState()");
  expect(appSource).not.toContain("function writeSessionPlannerState()");
  expect(helperSource).toContain("mergeSessionPlannerBlockForWrite");
  expect(helperSource).toContain("mergeSessionPlannerStateFromBackup");
  expect(runtimeStateSource).toContain("function readState()");
  expect(runtimeStateSource).toContain("function writeState()");
  expect(indexSource).toContain('export * from "./session-planner-state-merge-helpers.mjs";');
  expect(indexSource).toContain('export * from "./session-planner-runtime-state-service.mjs";');
});

test("Session Planner state merge helpers do not own protected save pipelines", () => {
  const helperSource = readProjectFile("src/modules/session-planner/session-planner-state-merge-helpers.mjs");

  expect(helperSource).not.toContain("localStorage");
  expect(helperSource).not.toContain("setItem");
  expect(helperSource).not.toContain("rawDataSafetySetItem");
  expect(helperSource).not.toContain("queueCentralStateWrite");
  expect(helperSource).not.toContain("writeSessionPlannerState");
  expect(helperSource).not.toContain("writeMedicalState");
  expect(helperSource).not.toContain("writePlayerProfilesState");
});

test("Session Planner state merge helpers preserve newer block fields", () => {
  const helpers = createHelpers();
  const existingBlock = createBlock({
    id: "block-1",
    title: "Keep newer title",
    focus: "Keep focus",
    fieldUpdatedAt: {
      title: "2026-05-02T10:00:00.000Z",
      focus: "2026-05-02T10:00:00.000Z",
    },
    updatedAt: "2026-05-02T10:00:00.000Z",
  });
  const staleIncomingBlock = createBlock({
    id: "block-1",
    title: "",
    focus: "Old focus",
    fieldUpdatedAt: {
      title: "2026-05-01T10:00:00.000Z",
      focus: "2026-05-01T10:00:00.000Z",
    },
    updatedAt: "2026-05-01T10:00:00.000Z",
  });

  const merged = helpers.mergeSessionPlannerBlockForWrite(existingBlock, staleIncomingBlock);

  expect(merged.title).toBe("Keep newer title");
  expect(merged.focus).toBe("Keep focus");
  expect(merged.fieldUpdatedAt.title).toBe("2026-05-02T10:00:00.000Z");
  expect(merged.updatedAt).toBe("2026-05-02T10:00:00.000Z");
});

test("Session Planner state merge helpers protect deleted blocks unless reduction is allowed", () => {
  const helpers = createHelpers();
  const existingState = {
    selectedDate: "2026-05-01",
    sessions: {
      "2026-05-01": {
        id: "session-2026-05-01",
        date: "2026-05-01",
        title: "Training",
        theme: "",
        selectedBlockId: "keep",
        blocks: [
          createBlock({ id: "keep", title: "Keep" }),
          createBlock({ id: "deleted", title: "Deleted" }),
        ],
      },
    },
    blockDeletionTombstones: {
      "2026-05-01": {
        deleted: "2026-05-02T10:00:00.000Z",
      },
    },
  };
  const incomingState = {
    selectedDate: "2026-05-01",
    sessions: {
      "2026-05-01": {
        id: "session-2026-05-01",
        date: "2026-05-01",
        title: "Training",
        theme: "",
        selectedBlockId: "deleted",
        blocks: [
          createBlock({ id: "deleted", title: "Old tab tried to restore" }),
        ],
      },
    },
  };

  const merged = helpers.mergeSessionPlannerStateForWrite(existingState, incomingState);

  expect(merged.sessions["2026-05-01"].blocks.map((block) => block.id)).toEqual(["keep"]);
  expect(merged.sessions["2026-05-01"].selectedBlockId).toBe("keep");
  expect(merged.blockDeletionTombstones["2026-05-01"].deleted).toBe("2026-05-02T10:00:00.000Z");
});
