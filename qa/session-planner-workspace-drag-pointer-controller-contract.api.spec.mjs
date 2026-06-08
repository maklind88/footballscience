import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindSessionPlannerWorkspaceDragPointerController } from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createClassList() {
  const values = new Set();
  return {
    add: (...classNames) => classNames.forEach((className) => values.add(className)),
    remove: (...classNames) => classNames.forEach((className) => values.delete(className)),
    toggle: (className, force) => (force ? values.add(className) : values.delete(className)),
    has: (className) => values.has(className),
  };
}

function createTarget(matches = {}) {
  return {
    closest: (selector) => matches[selector] || null,
  };
}

function createDragEvent(target) {
  const data = {};
  return {
    target,
    dataTransfer: {
      effectAllowed: "",
      dropEffect: "",
      setData: (type, value) => {
        data[type] = value;
      },
      getData: (type) => data[type],
    },
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test("Session Planner drag and pointer controller owns workspace drag bindings outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const platformBindingsSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const bindingsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  const controllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-drag-pointer-controller.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindSessionPlannerRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceDragPointerController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceDragPointerController({");
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("dragstart"');
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("dragover"');
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("drop"');
  expect(controllerSource).toContain('workspaceElement?.addEventListener?.("dragstart"');
  expect(controllerSource).not.toContain("localStorage");
  expect(controllerSource).not.toContain("queueCentralStateWrite");
  expect(controllerSource).not.toContain("writeSessionPlannerState");
  expect(indexSource).toContain('export * from "./session-planner-workspace-drag-pointer-controller.mjs";');
});

test("Session Planner drag controller preserves library folder drop behavior", () => {
  const listeners = {};
  const calls = [];
  let draggedLibraryExerciseId = "";
  const existingDropTarget = { classList: createClassList() };
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelectorAll: () => [existingDropTarget],
  };
  bindSessionPlannerWorkspaceDragPointerController({
    workspaceElement,
    canEditSessionPlanner: () => true,
    getDraggedLibraryExerciseId: () => draggedLibraryExerciseId,
    setDraggedLibraryExerciseId: (exerciseId) => {
      draggedLibraryExerciseId = exerciseId;
    },
    addExerciseToLibraryFolder: (exerciseId, folderId) => calls.push(`folder:${exerciseId}:${folderId}`),
    clearLibraryDragState: () => calls.push("clear-library"),
  });

  const libraryItem = {
    classList: createClassList(),
    dataset: { sessionLibraryDragExercise: "exercise-1" },
  };
  const dragStart = createDragEvent(createTarget({ "[data-session-library-drag-exercise]": libraryItem }));
  listeners.dragstart(dragStart);
  expect(draggedLibraryExerciseId).toBe("exercise-1");
  expect(libraryItem.classList.has("is-dragging")).toBe(true);
  expect(dragStart.dataTransfer.effectAllowed).toBe("copy");
  expect(dragStart.dataTransfer.getData("text/plain")).toBe("exercise-1");

  const folderTarget = {
    classList: createClassList(),
    dataset: { sessionLibraryFolderDrop: "folder-1" },
  };
  const dragOver = createDragEvent(createTarget({ "[data-session-library-folder-drop]": folderTarget }));
  listeners.dragover(dragOver);
  expect(dragOver.defaultPrevented).toBe(true);
  expect(folderTarget.classList.has("is-drop-target")).toBe(true);
  expect(dragOver.dataTransfer.dropEffect).toBe("copy");

  const drop = createDragEvent(createTarget({ "[data-session-library-folder-drop]": folderTarget }));
  listeners.drop(drop);
  expect(calls).toEqual(["folder:exercise-1:folder-1", "clear-library"]);
});

test("Session Planner drag controller preserves block reorder and pointer short circuit behavior", () => {
  const listeners = {};
  const winListeners = {};
  const calls = [];
  let draggedBlockId = "";
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelectorAll: () => [],
  };
  bindSessionPlannerWorkspaceDragPointerController({
    workspaceElement,
    win: {
      addEventListener: (type, listener) => {
        winListeners[type] = listener;
      },
      removeEventListener: () => {},
    },
    canEditSessionPlanner: () => true,
    getDraggedBlockId: () => draggedBlockId,
    setDraggedBlockId: (blockId) => {
      draggedBlockId = blockId;
    },
    getBlockDropPlacement: () => "before",
    clearBlockDragState: () => calls.push("clear-block"),
    reorderBlock: (draggedId, targetId, placement) => calls.push(`reorder:${draggedId}:${targetId}:${placement}`),
    startLibraryPointerDrag: () => {
      calls.push("library-pointer");
      return true;
    },
    startTacticalDrag: () => calls.push("tactical-pointer"),
    updateLibraryPointerDrag: () => false,
    updatePlayerBoardDrag: () => true,
    updateTacticalDrag: () => calls.push("tactical-move"),
    finishLibraryPointerDrag: () => false,
    finishPlayerBoardDrag: () => false,
    finishPlayerBoardSelection: () => false,
    finishTacticalDrag: () => calls.push("tactical-up"),
  });

  const sourceRow = {
    classList: createClassList(),
    dataset: { sessionBlockDropId: "block-1" },
  };
  const dragStart = createDragEvent(createTarget({ "[data-session-block-drop-id]": sourceRow }));
  listeners.dragstart(dragStart);
  expect(draggedBlockId).toBe("block-1");
  expect(dragStart.dataTransfer.effectAllowed).toBe("move");

  const targetRow = {
    classList: createClassList(),
    dataset: { sessionBlockDropId: "block-2" },
  };
  const drop = createDragEvent(createTarget({ "[data-session-block-drop-id]": targetRow }));
  listeners.drop(drop);
  expect(calls).toContain("reorder:block-1:block-2:before");
  expect(calls).toContain("clear-block");

  listeners.pointerdown({ type: "pointerdown" });
  expect(calls).toContain("library-pointer");
  expect(calls).not.toContain("tactical-pointer");

  winListeners.pointermove({ type: "pointermove" });
  expect(calls).not.toContain("tactical-move");

  winListeners.pointerup({ type: "pointerup" });
  expect(calls).toContain("tactical-up");
});
