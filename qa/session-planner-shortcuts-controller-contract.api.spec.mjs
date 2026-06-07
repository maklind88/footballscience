import { expect, test } from "@playwright/test";
import {
  SESSION_TACTICALBOARD_KEY_HANDLED,
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
  const appSource = await import("node:fs/promises").then((fs) => fs.readFile("app-runtime.js", "utf8"));
  expect(appSource).not.toContain("function handleSessionPlannerTacticalboardKeydown");
  expect(appSource).toContain("bindSessionPlannerTacticalShortcutController");
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
