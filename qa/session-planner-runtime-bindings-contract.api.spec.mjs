import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindSessionPlannerRuntimeBindings } from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createRuntimeDelegates(calls = []) {
  return new Proxy(
    {
      getSessionPlannerTacticalSelectedElementIds: () => ["shape-1"],
      removeSessionPlannerPrintRoot: () => calls.push("afterprint"),
      renderSessionPlannerWorkspace: () => calls.push("render"),
    },
    {
      get(target, property) {
        if (property in target) return target[property];
        return (...args) => calls.push(`${String(property)}:${args.length}`);
      },
    }
  );
}

test("Session Planner runtime bindings own controller composition outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const platformBindingsSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const bindingsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindSessionPlannerRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceClickController({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceFormController({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceDragPointerController({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceInputChangeController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceClickController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceFormController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceDragPointerController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceInputChangeController({");
  expect(bindingsSource).toContain("bindSessionPlannerTacticalShortcutController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceKeydownController({");
  expect(bindingsSource).toContain("openLeaderboardAward,");
  expect(bindingsSource).not.toContain("localStorage");
  expect(bindingsSource).not.toContain("queueCentralStateWrite");
  expect(bindingsSource).not.toContain("writeSessionPlannerState");
  expect(indexSource).toContain('export * from "./session-planner-runtime-bindings.mjs";');
});

test("Session Planner runtime bindings register workspace, window, and print listeners", () => {
  const calls = [];
  const workspaceListeners = {};
  const winListeners = {};
  const workspaceElement = {
    addEventListener: (type, listener) => {
      workspaceListeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  const win = {
    addEventListener: (type, listener) => {
      winListeners[type] = listener;
    },
    getSelection: () => ({ isCollapsed: true, toString: () => "" }),
  };

  const controllers = bindSessionPlannerRuntimeBindings({
    workspaceElement,
    win,
    localUiState: {
      state: {
        sessionPlannerTacticalClipboard: ["shape-1"],
        sessionPlannerTacticalboardOpen: true,
      },
    },
    runtimeDelegates: createRuntimeDelegates(calls),
    exerciseLibrary: {},
    exerciseLibraryActions: {},
    periodizationBridge: {},
    boardHistory: {
      undo: () => calls.push("undo"),
      redo: () => calls.push("redo"),
    },
    openLeaderboardAward: (command, opener) => calls.push({ command, opener }),
    getPlayerBadgeFromKeyboardEvent: () => "",
  });

  expect(Object.keys(controllers).sort()).toEqual(["click", "dragPointer", "form", "inputChange", "keydown", "tacticalShortcut"]);
  expect(typeof workspaceListeners.click).toBe("function");
  expect(typeof workspaceListeners.submit).toBe("function");
  expect(typeof workspaceListeners.dragstart).toBe("function");
  expect(typeof workspaceListeners.input).toBe("function");
  expect(typeof workspaceListeners.keydown).toBe("function");
  expect(typeof winListeners.keydown).toBe("function");
  expect(typeof winListeners.keyup).toBe("function");
  expect(typeof winListeners.copy).toBe("function");
  expect(typeof winListeners.paste).toBe("function");
  expect(typeof winListeners.afterprint).toBe("function");

  const awardOpener = {
    disabled: false,
    dataset: {
      sessionLeaderboardAwardEnabled: "true",
      sessionLeaderboardAwardDate: "2026-08-24",
      sessionLeaderboardAwardTitle: "Training",
    },
  };
  workspaceListeners.click({
    target: {
      closest: (selector) => selector === "[data-session-open-leaderboard-award]" ? awardOpener : null,
      matches: () => false,
    },
  });
  expect(calls).toContainEqual({
    command: { occurredOn: "2026-08-24", title: "Training" },
    opener: awardOpener,
  });

  winListeners.afterprint();
  expect(calls).toContain("afterprint");
});
