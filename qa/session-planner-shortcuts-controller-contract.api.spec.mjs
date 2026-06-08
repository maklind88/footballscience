import { expect, test } from "@playwright/test";
import {
  SESSION_TACTICALBOARD_KEY_HANDLED,
  bindSessionPlannerWorkspaceKeydownController,
  createSessionPlannerTacticalShortcutController,
} from "../src/modules/session-planner/session-planner-shortcuts-controller.mjs";

function createKeyboardEvent(key, patch = {}) {
  return {
    key,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: { closest: () => null },
    ...patch,
  };
}

test("Session Planner shortcut controller owns tactical board keyboard events outside app.js", async ({}, testInfo) => {
  const fs = await import("node:fs/promises");
  const appSource = await fs.readFile("app-runtime.js", "utf8");
  const platformBindingsSource = await fs.readFile("src/core/platform-workspace-runtime-bindings.mjs", "utf8");
  const bindingsSource = await fs.readFile("src/modules/session-planner/session-planner-runtime-bindings.mjs", "utf8");
  expect(appSource).not.toContain("function handleSessionPlannerTacticalboardKeydown");
  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindSessionPlannerRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerTacticalShortcutController");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceKeydownController");
  expect(bindingsSource).toContain("bindSessionPlannerTacticalShortcutController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceKeydownController({");
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("keydown"');
  expect(SESSION_TACTICALBOARD_KEY_HANDLED).toBe("__sessionTacticalboardKeyHandled");
});

test("Session Planner shortcut controller preserves copy paste escape and delete behavior", () => {
  const calls = [];
  const listeners = {};
  const state = { clipboard: [1], pendingPoint: { x: 10 }, selectedIds: ["shape-1"] };
  const controller = createSessionPlannerTacticalShortcutController({
    clearPendingPoint: (options = {}) => {
      calls.push(options.clearSelection ? "clear-all" : "clear-pending");
      state.pendingPoint = null;
    },
    copySelectedElements: () => calls.push("copy"),
    getPlayerBadgeFromKeyboardEvent: (event) => (event.key === "8" ? "8" : ""),
    getPendingPoint: () => state.pendingPoint,
    getSelectedElementIds: () => state.selectedIds,
    hasClipboard: () => state.clipboard.length > 0,
    isTacticalboardOpen: () => true,
    pasteClipboard: () => calls.push("paste"),
    removeSelectedElement: () => calls.push("remove"),
    updateSelectedPlayerBadges: (badge) => {
      calls.push(`badge:${badge}`);
      return true;
    },
    undoSelectedBoardAction: () => calls.push("undo"),
    win: {
      addEventListener: (type, listener) => {
        listeners[type] = listener;
      },
      getSelection: () => ({ isCollapsed: true, toString: () => "" }),
    },
  });

  controller.bind();
  const copyEvent = createKeyboardEvent("c", { metaKey: true });
  listeners.keydown(copyEvent);
  expect(copyEvent.defaultPrevented).toBe(true);
  expect(copyEvent[SESSION_TACTICALBOARD_KEY_HANDLED]).toBe(true);
  expect(calls).toContain("copy");

  const pasteEvent = createKeyboardEvent("v", { ctrlKey: true });
  listeners.keydown(pasteEvent);
  expect(calls).toContain("paste");

  const badgeEvent = createKeyboardEvent("8");
  listeners.keydown(badgeEvent);
  expect(calls).toContain("badge:8");

  const escapeEvent = createKeyboardEvent("Escape");
  listeners.keydown(escapeEvent);
  expect(calls).toContain("clear-all");

  const deleteEvent = createKeyboardEvent("Delete");
  state.selectedIds = ["shape-2"];
  listeners.keyup(deleteEvent);
  expect(calls).toContain("remove");
});

test("Session Planner workspace keydown binding preserves overlay escape and undo behavior", () => {
  const calls = [];
  let keydownListener = null;
  const workspaceElement = {
    addEventListener: (type, listener) => {
      if (type === "keydown") {
        keydownListener = listener;
      }
    },
    removeEventListener: () => {},
  };
  const state = {
    assistantOpen: true,
    pendingPoint: true,
    playerBoardOpen: true,
    playerProfileOpen: false,
    printOverlayOpen: false,
    tacticalOpen: false,
  };

  const controller = bindSessionPlannerWorkspaceKeydownController({
    workspaceElement,
    isPlayerBoardOpen: () => state.playerBoardOpen,
    isPlayerBoardAssistantOpen: () => state.assistantOpen,
    closePlayerBoardAssistant: () => {
      state.assistantOpen = false;
      calls.push("close-assistant");
    },
    hasPlayerBoardProfile: () => state.playerProfileOpen,
    closePlayerBoardProfile: () => calls.push("close-profile"),
    setPlayerBoardOpen: (open) => {
      state.playerBoardOpen = open;
      calls.push(`player-board:${open}`);
    },
    isPrintOverlayOpen: () => state.printOverlayOpen,
    setPrintOverlayOpen: (open) => calls.push(`print:${open}`),
    isTacticalboardOpen: () => state.tacticalOpen,
    redoBoardHistory: (type) => calls.push(`redo:${type}`),
    undoBoardHistory: (type) => calls.push(`undo:${type}`),
    hasTacticalPendingPoint: () => state.pendingPoint,
    clearTacticalPendingPoint: (options = {}) => {
      state.pendingPoint = false;
      calls.push(options.clearSelectionState ? "clear-tactical-all" : "clear-tactical-pending");
    },
    clearTacticalSelection: () => calls.push("clear-selection"),
    refreshTacticalboardCanvas: () => calls.push("refresh-canvas"),
    getSelectedTacticalElementIds: () => ["shape-1"],
    removeSelectedTacticalElement: () => calls.push("remove-selected"),
    handlePeriodizationKeydown: () => calls.push("periodization"),
    renderWorkspace: () => calls.push("render"),
  });

  expect(typeof controller.handleKeydown).toBe("function");
  expect(typeof keydownListener).toBe("function");

  keydownListener(createKeyboardEvent("Escape"));
  expect(calls).toEqual(["close-assistant", "render"]);

  state.playerBoardOpen = false;
  state.tacticalOpen = true;
  keydownListener(createKeyboardEvent("z", { metaKey: true }));
  expect(calls).toContain("undo:tactical");

  keydownListener(createKeyboardEvent("Delete"));
  expect(calls).toContain("clear-tactical-pending");

  state.pendingPoint = false;
  keydownListener(createKeyboardEvent("Delete"));
  expect(calls).toContain("remove-selected");
});
