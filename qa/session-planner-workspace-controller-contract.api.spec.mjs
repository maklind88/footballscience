import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionPlannerWorkspaceController } from "../src/modules/session-planner/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createWorkspaceNavigationHarness(options = {}) {
  const calls = [];
  const state = {
    selectedDate: "2026-05-01",
    sessions: {
      "2026-05-01": {
        id: "session-2026-05-01",
        date: "2026-05-01",
        title: "Training",
        selectedBlockId: "block-1",
        blocks: [
          {
            id: "block-1",
            title: "Warm-up",
            phase: ["Build-up"],
            libraryExerciseId: "exercise-1",
            postSessionNotes: "Review",
            fieldUpdatedAt: {},
          },
          { id: "block-2", title: "Game", phase: ["Pressing"], fieldUpdatedAt: {} },
        ],
      },
    },
  };
  const local = {
    sessionPlannerState: state,
    sessionPlannerPlayerBoardSelectedPlayerIds: [],
  };
  const workspaceElement = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const noop = () => {};
  const valuesEqual = (previousValue, nextValue) => {
    if (Object.is(previousValue, nextValue)) return true;
    try {
      return JSON.stringify(previousValue) === JSON.stringify(nextValue);
    } catch {
      return false;
    }
  };
  const deps = new Proxy({
    areSessionPlannerBlockFieldValuesEqual: valuesEqual,
    assignSessionPlannerBlockFieldValue: (block, field, rawValue) => {
      if (!block || !(field in block)) return false;
      block[field] = Array.isArray(rawValue) ? [...rawValue] : rawValue;
      return true;
    },
    canEditSessionPlanner: () => options.canEdit ?? false,
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    createSessionPlannerDefaultState: () => state,
    createSessionPlannerEmptySession: (dateValue) => ({
      id: `session-${dateValue}`,
      date: dateValue,
      title: "Session",
      selectedBlockId: "",
      blocks: [],
    }),
    ensurePeriodizationState: noop,
    getDashboardSessionTotalMinutes: () => 0,
    getLocalState: () => local,
    getPeriodizationDay: () => ({ matchDay: 0 }),
    getPeriodizationMatchDayLabel: () => "",
    getScheduledSessionTitleForDate: () => "",
    getSessionPlannerExerciseLibrary: () => [{ id: "exercise-1", reviewNotes: [] }],
    getSessionPlannerExerciseReviewNotes: (exercise) => exercise.reviewNotes || [],
    cloneSessionPlannerLibraryExercise: (exercise) => JSON.parse(JSON.stringify(exercise)),
    createSessionPlannerReviewNoteId: () => "review-1",
    createSessionPlannerReviewNoteFromBlock: (block) => ({
      id: "review-1",
      notes: block.postSessionNotes,
      sessionDate: state.selectedDate,
      blockId: block.id,
    }),
    getSessionPlannerLibraryNow: () => "2026-05-01T12:00:00.000Z",
    getSessionPlannerLibraryUserId: () => "coach-1",
    getSessionPlannerPeriodizationBridge: () => ({
      close: () => calls.push("periodization-close"),
    }),
    isCurrentPlatformUserAdmin: () => false,
    markSessionPlannerBlockFieldsUpdated: (_block, fields) => calls.push(["marked", fields]),
    parseScheduleDateValue: (dateValue) => new Date(`${dateValue}T12:00:00.000Z`),
    readSessionPlannerState: () => state,
    renderSessionPlannerToast: noop,
    sessionPlannerWorkspaceRenderer: { renderWorkspace: () => "" },
    setSessionPlannerExerciseLibrary: () => calls.push("library-set"),
    setLocalState: (patch) => Object.assign(local, patch),
    syncSessionPlannerBoardHistoryBaseline: (type, block) => calls.push(["baseline", type, block?.id || ""]),
    ui: { sessionPlannerWorkspace: workspaceElement },
    win: {
      requestAnimationFrame: (callback) => callback(),
    },
    writeSessionPlannerState: () => {
      calls.push("write");
      return true;
    },
    writeSessionPlannerExerciseLibraryToStorage: (library) => {
      calls.push("library-write");
      return { saved: true, exercises: library };
    },
  }, {
    get(target, property) {
      return Reflect.has(target, property) ? target[property] : noop;
    },
  });

  return {
    calls,
    controller: createSessionPlannerWorkspaceController(deps),
    local,
    state,
  };
}

test("Session Planner workspace controller owns workspace UI flow without owning the save pipeline", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const appRuntimeComposer = readProjectFile("src/modules/session-planner/session-planner-app-runtime-composer.mjs");
  const workspaceComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const composer = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const runtimeService = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");
  const controller = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const delegates = readProjectFile("src/modules/session-planner/session-planner-runtime-delegates.mjs");

  expect(typeof createSessionPlannerWorkspaceController).toBe("function");
  expect(app).toContain("createWorkspaceRuntimeComposition({");
  expect(app).not.toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(workspaceComposer).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(app).not.toContain("createSessionPlannerRuntimeService({");
  expect(composer).toContain("createSessionPlannerRuntimeService({");
  expect(app).not.toContain("createSessionPlannerWorkspaceController({");
  expect(runtimeService).toContain("createSessionPlannerWorkspaceController({");
  expect(app).toContain("let sessionPlannerWorkspaceController;");
  expect(app).toContain("createSessionPlannerAppRuntimeComposition({");
  expect(appRuntimeComposer).toContain("createSessionPlannerRuntimeDelegates({");
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
  expect(appRuntimeComposer).toContain("runtimeStateService: sources.getSessionPlannerRuntimeStateService()");
  expect(accessors).toContain("function writeSessionPlannerState(...args)");
  expect(app).not.toContain("const previousDateControls = ui.sessionPlannerWorkspace.querySelector");
});

test("Session Planner date and block navigation stays read-only and keeps board history baselines current", () => {
  const { calls, controller, state } = createWorkspaceNavigationHarness({ canEdit: false });

  controller.selectSessionPlannerDate("2026-05-02");

  expect(state.selectedDate).toBe("2026-05-02");
  expect(state.sessions["2026-05-02"]).toBeUndefined();
  expect(calls).not.toContain("write");
  expect(calls).toContainEqual(["baseline", "tactical", ""]);
  expect(calls).toContainEqual(["baseline", "player", ""]);

  calls.length = 0;
  controller.selectSessionPlannerDate("2026-05-01");
  calls.length = 0;
  controller.selectSessionPlannerBlock("block-2");

  expect(state.sessions["2026-05-01"].selectedBlockId).toBe("block-2");
  expect(calls).not.toContain("write");
  expect(calls).toContainEqual(["baseline", "tactical", "block-2"]);
  expect(calls).toContainEqual(["baseline", "player", "block-2"]);
});

test("Session Planner block fields only write after a semantic value change", () => {
  const { calls, controller, state } = createWorkspaceNavigationHarness({ canEdit: true });

  expect(controller.updateSelectedSessionPlannerBlockField("title", "Warm-up")).toBe(false);
  expect(controller.updateSelectedSessionPlannerBlockField("phase", ["Build-up"])).toBe(false);
  expect(calls).not.toContain("write");
  expect(calls.some((call) => Array.isArray(call) && call[0] === "marked")).toBe(false);

  expect(controller.updateSelectedSessionPlannerBlockField("title", "Activation")).toBe(true);
  expect(state.sessions["2026-05-01"].blocks[0].title).toBe("Activation");
  expect(calls).toContainEqual(["marked", ["title"]]);
  expect(calls).toContain("write");
});

test("Session Planner unchanged post-session notes still complete the explicit library sync", () => {
  const { calls, controller } = createWorkspaceNavigationHarness({ canEdit: true });

  expect(controller.updateSelectedSessionPlannerBlockField("postSessionNotes", "Review", {
    syncExerciseReview: true,
  })).toBe(true);

  expect(calls).not.toContain("write");
  expect(calls).toContain("library-write");
  expect(calls).toContain("library-set");
});
