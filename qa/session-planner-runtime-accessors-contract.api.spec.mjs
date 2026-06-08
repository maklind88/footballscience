import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  configureSessionPlannerRuntimeAccessors,
  createSessionPlannerSessionForNewPlan,
  commitSessionPlannerExerciseToLibrary,
  mergeSessionPlannerStateForWrite,
  readSessionPlannerState,
  renderSessionPlannerWorkspace,
  sessionPlannerRuntimeAccessorNames,
  showSessionPlannerToast,
} from "../src/modules/session-planner/session-planner-runtime-accessors.mjs";
import { sessionPlannerRuntimeDelegateMethodNames } from "../src/modules/session-planner/session-planner-runtime-delegates.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const extraAccessorNames = Object.freeze([
  "renderSessionPlannerToast",
  "showSessionPlannerToast",
  "commitSessionPlannerExerciseToLibrary",
  "queueSessionPlannerLibrarySaveConflict",
  "resolveSessionPlannerLibrarySaveConflict",
  "saveSelectedSessionPlannerExerciseToLibrary",
  "deleteSessionPlannerLibraryExercise",
  "restoreSessionPlannerLibraryExercise",
  "createSessionPlannerDefaultSession",
  "createSessionPlannerEmptySession",
  "getSessionPlannerPeriodizationOverride",
  "isSessionPlannerOffDate",
  "createSessionPlannerSessionForNewPlan",
  "isGeneratedDefaultSessionPlannerSession",
  "shouldStripSessionPlannerGeneratedDefaultSession",
  "shouldClearSessionPlannerSessionForDate",
  "cloneSessionPlannerSession",
  "createSessionPlannerDefaultState",
  "parseSessionPlannerBlockReductionGuardTime",
  "normalizeSessionPlannerBlockReductionGuard",
  "canReduceSessionPlannerBlocksForDate",
  "normalizeSessionPlannerBlockDeletionTombstones",
  "markSessionPlannerBlockReductionAllowed",
  "markSessionPlannerBlockDeleted",
  "applySessionPlannerBlockReductionGuard",
  "applySessionPlannerBlockDeletionTombstones",
  "getSessionPlannerDeletedBlockIds",
  "cloneSessionPlannerBlockMergeValue",
  "isSessionPlannerBlockFieldEmptyValue",
  "getSessionPlannerBlockFieldUpdatedAtMs",
  "markSessionPlannerBlockFieldsUpdated",
  "mergeSessionPlannerBlockForWrite",
  "filterSessionPlannerDeletedBlocksForWrite",
  "mergeSessionPlannerSessionForWrite",
  "cloneSessionPlannerState",
  "mergeSessionPlannerStateForWrite",
  "mergeSessionPlannerStateFromBackup",
  "assignSessionPlannerBlockFieldValue",
  "syncSelectedSessionPlannerBlockFieldsFromDom",
  "readSessionPlannerState",
  "persistNormalizedSessionPlannerState",
  "findSessionPlannerStateInSnapshots",
  "queueSessionPlannerSnapshotRecovery",
  "writeSessionPlannerState",
]);

test("Session Planner runtime accessors own app-runtime pass-through names", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const packageJson = readProjectFile("package.json");

  expect(sessionPlannerRuntimeAccessorNames).toEqual([
    ...sessionPlannerRuntimeDelegateMethodNames,
    ...extraAccessorNames,
  ]);
  expect(app).toContain("session-planner-runtime-accessors.mjs");
  expect(app).toContain("configureSessionPlannerRuntimeAccessors(() => ({");
  expect(app).toContain("runtimeDelegates: sessionPlannerRuntimeDelegates");
  expect(app).toContain("runtimeStateService: sessionPlannerRuntimeStateService");
  expect(app).not.toContain("} = sessionPlannerRuntimeDelegates;");
  expect(app).not.toContain("function renderSessionPlannerActionIcon(...args)");
  expect(app).not.toContain("function writeSessionPlannerState(...args)");
  expect(app).not.toContain("function createSessionPlannerSessionForNewPlan(dateValue = formatScheduleDateValue(new Date()))");
  expect(accessors).not.toContain("localStorage");
  expect(accessors).not.toContain("rawDataSafetySetItem");
  expect(packageJson).toContain("src/modules/session-planner/session-planner-runtime-accessors.mjs");
});

test("Session Planner runtime accessors forward to configured runtime sources", () => {
  const calls = [];
  const sources = {
    runtimeDelegates: {
      renderSessionPlannerWorkspace(...args) {
        calls.push(["delegate", args, this]);
        return "workspace";
      },
    },
    toastController: {
      show(...args) {
        calls.push(["toast", args, this]);
        return "toast";
      },
    },
    exerciseLibraryActions: {
      commitExercise(...args) {
        calls.push(["exercise", args, this]);
        return "exercise";
      },
    },
    sessionFactory: {
      createSessionForNewPlan(...args) {
        calls.push(["session", args, this]);
        return { id: args[0] };
      },
    },
    stateMergeHelpers: {
      mergeSessionPlannerStateForWrite(...args) {
        calls.push(["merge", args, this]);
        return { merged: args };
      },
    },
    runtimeStateService: {
      readState(...args) {
        calls.push(["state", args, this]);
        return { selectedDate: "2026-05-09" };
      },
    },
    getDefaultDateValue: () => "2026-05-09",
  };
  configureSessionPlannerRuntimeAccessors(() => sources);

  expect(renderSessionPlannerWorkspace("preserve")).toBe("workspace");
  expect(showSessionPlannerToast("Saved")).toBe("toast");
  expect(commitSessionPlannerExerciseToLibrary({ id: "ex-1" })).toBe("exercise");
  expect(createSessionPlannerSessionForNewPlan()).toEqual({ id: "2026-05-09" });
  expect(mergeSessionPlannerStateForWrite({ selectedDate: "a" })).toEqual({ merged: [{ selectedDate: "a" }] });
  expect(readSessionPlannerState()).toEqual({ selectedDate: "2026-05-09" });
  expect(calls.map((call) => call[0])).toEqual(["delegate", "toast", "exercise", "session", "merge", "state"]);
  expect(calls[0][2]).toBe(sources.runtimeDelegates);
  expect(calls[3][1]).toEqual(["2026-05-09"]);
});
