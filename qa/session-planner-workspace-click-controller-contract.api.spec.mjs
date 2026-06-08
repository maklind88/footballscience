import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindSessionPlannerWorkspaceClickController } from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createTarget({ matches = [], closest = {} } = {}) {
  return {
    matches: (selector) => matches.includes(selector),
    closest: (selector) => closest[selector] || null,
  };
}

function createClick(target) {
  return {
    target,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test("Session Planner click controller owns workspace click routing outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const controllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-click-controller.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("bindSessionPlannerWorkspaceClickController({");
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("click"');
  expect(controllerSource).toContain('workspaceElement?.addEventListener?.("click"');
  expect(controllerSource).not.toContain("localStorage");
  expect(controllerSource).not.toContain("queueCentralStateWrite");
  expect(controllerSource).not.toContain("writeSessionPlannerState");
  expect(indexSource).toContain('export * from "./session-planner-workspace-click-controller.mjs";');
});

test("Session Planner click controller preserves suppress, overlay, and conflict behavior", () => {
  const listeners = {};
  const calls = [];
  let suppressNextClick = true;
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  bindSessionPlannerWorkspaceClickController({
    workspaceElement,
    getSuppressNextClick: () => suppressNextClick,
    setSuppressNextClick: (value) => {
      suppressNextClick = value;
    },
    closeLibrary: () => calls.push("close-library"),
    resolveLibrarySaveConflict: (action) => calls.push(`save:${action}`),
    resolveCentralSyncConflict: (action) => calls.push(`central:${action}`),
  });

  const suppressedClick = createClick(createTarget());
  listeners.click(suppressedClick);
  expect(suppressedClick.defaultPrevented).toBe(true);
  expect(suppressNextClick).toBe(false);

  listeners.click(createClick(createTarget({ matches: ["[data-session-library-overlay]"] })));
  expect(calls).toContain("close-library");

  listeners.click(createClick(createTarget({ matches: ["[data-session-save-conflict-overlay]"] })));
  expect(calls).toContain("save:cancel");

  listeners.click(createClick(createTarget({ matches: ["[data-session-central-conflict-overlay]"] })));
  expect(calls).toContain("central:keep-central");

  const saveAction = { dataset: { sessionSaveConflictAction: "overwrite" } };
  listeners.click(createClick(createTarget({ closest: { "[data-session-save-conflict-action]": saveAction } })));
  expect(calls).toContain("save:overwrite");
});

test("Session Planner click controller preserves player board, history, and add actions", () => {
  const listeners = {};
  const calls = [];
  let assistantOpen = false;
  let selectedPlayerId = "player-1";
  let historyOpen = false;
  let addMenuOpen = false;
  let formationInput = "";
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: () => ({ value: "4-3-3" }),
  };
  bindSessionPlannerWorkspaceClickController({
    workspaceElement,
    setPlayerBoardAssistantOpen: (open) => {
      assistantOpen = open;
    },
    setPlayerBoardSelectedPlayerId: (playerId) => {
      selectedPlayerId = playerId;
    },
    renderWorkspace: (options) => calls.push(`render:${options.preserveDateStripScroll}`),
    normalizePlayerBoardFormationValue: (value) => `shape:${value}`,
    setPlayerBoardFormationInput: (value) => {
      formationInput = value;
    },
    applyPlayerBoardFormation: (options) => calls.push(`formation:${options.prioritize}`),
    getHistoryOpen: () => historyOpen,
    setHistoryOpen: (open) => {
      historyOpen = open;
    },
    getSelectedDate: () => "2026-05-01",
    loadHistory: (date, options = {}) => {
      calls.push(`history:${date}:${Boolean(options.force)}`);
      return Promise.resolve();
    },
    getAddMenuOpen: () => addMenuOpen,
    setAddMenuOpen: (open) => {
      addMenuOpen = open;
    },
    addBlock: () => calls.push("add-block"),
    setLibraryOpen: (open) => calls.push(`library:${open}`),
    setTacticalboardOpen: (open) => calls.push(`tactical:${open}`),
  });

  listeners.click(createClick(createTarget({ closest: { "[data-session-selection-assistant-open]": { dataset: {} } } })));
  expect(assistantOpen).toBe(true);
  expect(selectedPlayerId).toBe("");
  expect(calls).toContain("render:true");

  listeners.click(createClick(createTarget({ closest: { "[data-session-player-board-prioritize]": { dataset: {} } } })));
  expect(formationInput).toBe("shape:4-3-3");
  expect(calls).toContain("formation:true");

  listeners.click(createClick(createTarget({ closest: { "[data-session-toggle-history]": { dataset: {} } } })));
  expect(historyOpen).toBe(true);
  expect(calls).toContain("history:2026-05-01:false");

  listeners.click(createClick(createTarget({ closest: { "[data-session-refresh-history]": { dataset: {} } } })));
  expect(calls).toContain("history:2026-05-01:true");

  listeners.click(createClick(createTarget({ closest: { "[data-session-add-menu-toggle]": { dataset: {} } } })));
  expect(addMenuOpen).toBe(true);

  listeners.click(createClick(createTarget({ closest: { "[data-session-add-from-library]": { dataset: {} } } })));
  expect(calls).toContain("add-block");
  expect(calls).toContain("library:true");
});

test("Session Planner click controller preserves tactical and library dataset actions", () => {
  const listeners = {};
  const calls = [];
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  bindSessionPlannerWorkspaceClickController({
    workspaceElement,
    updateTacticalPlayerNumber: (elementId, number) => calls.push(`number:${elementId}:${number}`),
    undoBoardHistory: (type) => calls.push(`undo:${type}`),
    redoBoardHistory: (type) => calls.push(`redo:${type}`),
    moveBlock: (blockId, direction) => calls.push(`move:${blockId}:${direction}`),
    applyExercise: (exerciseId) => calls.push(`exercise:${exerciseId}`),
    removeExerciseFromLibraryFolder: (exerciseId, folderId) => calls.push(`remove:${exerciseId}:${folderId}`),
    toggleLibraryFilterValue: (filter, value) => calls.push(`filter:${filter}:${value}`),
    updateLibraryArchiveView: (view) => calls.push(`archive:${view}`),
  });

  listeners.click(createClick(createTarget({
    closest: {
      "[data-session-tactical-number]": {
        dataset: { sessionTacticalNumberElement: "shape-1", sessionTacticalNumber: "8" },
      },
    },
  })));
  expect(calls).toContain("number:shape-1:8");

  listeners.click(createClick(createTarget({ closest: { "[data-session-undo-board]": { dataset: {} } } })));
  expect(calls).toContain("undo:tactical");

  listeners.click(createClick(createTarget({
    closest: {
      "[data-session-move-block]": {
        dataset: { sessionMoveBlock: "block-1", sessionMoveDirection: "-1" },
      },
    },
  })));
  expect(calls).toContain("move:block-1:-1");

  listeners.click(createClick(createTarget({
    closest: {
      "[data-session-use-exercise]": { dataset: { sessionUseExercise: "exercise-1" } },
    },
  })));
  expect(calls).toContain("exercise:exercise-1");

  listeners.click(createClick(createTarget({
    closest: {
      "[data-session-remove-library-exercise-from-folder]": {
        dataset: { sessionRemoveLibraryExerciseFromFolder: "exercise-1", sessionRemoveLibraryFolder: "folder-1" },
      },
    },
  })));
  expect(calls).toContain("remove:exercise-1:folder-1");

  listeners.click(createClick(createTarget({
    closest: {
      "[data-session-library-filter-option]": {
        dataset: { sessionLibraryFilterOption: "focus", sessionLibraryFilterValue: "pressing" },
      },
    },
  })));
  expect(calls).toContain("filter:focus:pressing");

  listeners.click(createClick(createTarget({
    closest: {
      "[data-session-library-archive-view]": { dataset: { sessionLibraryArchiveView: "archived" } },
    },
  })));
  expect(calls).toContain("archive:archived");
});
