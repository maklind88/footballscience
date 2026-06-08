import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindSessionPlannerWorkspaceFormController } from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createTarget(matches = {}) {
  return {
    closest: (selector) => matches[selector] || null,
  };
}

function createForm(fields = {}) {
  return {
    querySelector: (selector) => fields[selector] || null,
  };
}

test("Session Planner form controller owns workspace form bindings outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const platformBindingsSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const bindingsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  const controllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-form-controller.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindSessionPlannerRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceFormController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceFormController({");
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("dblclick"');
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("contextmenu"');
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("submit"');
  expect(controllerSource).toContain('workspaceElement?.addEventListener?.("submit"');
  expect(controllerSource).not.toContain("localStorage");
  expect(controllerSource).not.toContain("queueCentralStateWrite");
  expect(controllerSource).not.toContain("writeSessionPlannerState");
  expect(indexSource).toContain('export * from "./session-planner-workspace-form-controller.mjs";');
});

test("Session Planner form controller preserves double click and context menu routing", () => {
  const listeners = {};
  const calls = [];
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  bindSessionPlannerWorkspaceFormController({
    workspaceElement,
    openPlayerBoardProfile: (playerId) => calls.push(`profile:${playerId}`),
    handleTacticalCanvasDoubleClick: (_event, canvas) => calls.push(`canvas:${canvas.id}`),
    handlePlayerBoardContextMenu: () => calls.push("context"),
  });

  const playerToken = { dataset: { sessionPlayerBoardToken: "player-1" } };
  listeners.dblclick({ target: createTarget({ "[data-session-player-board-token]": playerToken }) });
  expect(calls).toContain("profile:player-1");

  const canvas = { id: "canvas-1" };
  listeners.dblclick({ target: createTarget({ "[data-session-tactical-canvas]": canvas }) });
  expect(calls).toContain("canvas:canvas-1");

  listeners.contextmenu({ target: createTarget() });
  expect(calls).toContain("context");
});

test("Session Planner form controller preserves player board submit behavior", () => {
  const listeners = {};
  const calls = [];
  let teamCount = "";
  let autoMode = "";
  let formationValue = "";
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  bindSessionPlannerWorkspaceFormController({
    workspaceElement,
    normalizePlayerBoardTeamCount: (value) => `teams:${value}`,
    normalizePlayerBoardAutoMode: (value) => `mode:${value}`,
    normalizePlayerBoardFormationValue: (value) => `shape:${value}`,
    setPlayerBoardTeamCount: (value) => {
      teamCount = value;
    },
    setPlayerBoardAutoMode: (value) => {
      autoMode = value;
    },
    setPlayerBoardFormationInput: (value) => {
      formationValue = value;
    },
    applyPlayerBoardAutoSelect: () => calls.push("auto"),
    copyPlayerBoardTeamsFromBlock: (blockId) => calls.push(`copy:${blockId}`),
    applyPlayerBoardFormation: () => calls.push("formation"),
  });

  const autoForm = createForm({
    "[data-session-player-board-team-count]": { value: "3" },
    "[data-session-player-board-auto-mode]": { value: "balanced" },
  });
  const autoEvent = {
    target: createTarget({ "[data-session-player-board-auto-form]": autoForm }),
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  listeners.submit(autoEvent);
  expect(autoEvent.defaultPrevented).toBe(true);
  expect(teamCount).toBe("teams:3");
  expect(autoMode).toBe("mode:balanced");
  expect(calls).toContain("auto");

  const copyForm = createForm({
    "[data-session-player-board-copy-source]": { value: "block-1" },
  });
  listeners.submit({
    target: createTarget({ "[data-session-player-board-copy-form]": copyForm }),
    preventDefault() {},
  });
  expect(calls).toContain("copy:block-1");

  const formationForm = createForm({
    "[data-session-player-board-formation-input]": { value: "4-3-3" },
  });
  listeners.submit({
    target: createTarget({ "[data-session-player-board-formation-form]": formationForm }),
    preventDefault() {},
  });
  expect(formationValue).toBe("shape:4-3-3");
  expect(calls).toContain("formation");
});
