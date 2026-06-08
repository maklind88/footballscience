import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindSessionPlannerWorkspaceInputChangeController } from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createTarget(matches = {}) {
  return {
    closest: (selector) => matches[selector] || null,
  };
}

test("Session Planner input/change controller owns workspace field bindings outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const bindingsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  const controllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-input-change-controller.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("bindSessionPlannerRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceInputChangeController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceInputChangeController({");
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("input"');
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("change"');
  expect(controllerSource).toContain('workspaceElement?.addEventListener?.("input"');
  expect(controllerSource).not.toContain("localStorage");
  expect(controllerSource).not.toContain("queueCentralStateWrite");
  expect(controllerSource).not.toContain("writeSessionPlannerState");
  expect(indexSource).toContain('export * from "./session-planner-workspace-input-change-controller.mjs";');
});

test("Session Planner input controller preserves formation, tactical, and field input behavior", () => {
  const listeners = {};
  const calls = [];
  let formationInput = "";
  let tacticalColor = "red";
  let lineWidth = 2;
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  bindSessionPlannerWorkspaceInputChangeController({
    workspaceElement,
    cleanPlayerBoardFormationInput: (value) => value.replace(/x/g, ""),
    setPlayerBoardFormationInput: (value) => {
      formationInput = value;
    },
    normalizeTacticalColor: (value) => `color:${value}`,
    getTacticalColor: () => tacticalColor,
    setTacticalColor: (value) => {
      tacticalColor = value;
    },
    normalizeTacticalLineWidth: (value) => Number(value) + 1,
    getTacticalLineWidth: () => lineWidth,
    setTacticalLineWidth: (value) => {
      lineWidth = value;
    },
    getSelectedTacticalElementIds: () => ["shape-1"],
    getSelectedTacticalElements: () => [{ line: true }],
    isTacticalStrokeElement: (element) => element.line,
    updateSelectedTacticalElement: (patch) => calls.push(patch),
    updateSelectedBlockField: (field, value) => calls.push(`field:${field}:${value}`),
    resizeTextarea: () => calls.push("resize"),
  });

  const formationField = { value: "4x-3-3" };
  listeners.input({
    target: createTarget({ "[data-session-player-board-formation-input]": formationField }),
  });
  expect(formationInput).toBe("4-3-3");
  expect(formationField.value).toBe("4-3-3");

  listeners.input({
    target: createTarget({ "[data-session-tactical-color]": { value: "blue" } }),
  });
  expect(tacticalColor).toBe("color:blue");
  expect(calls).toContainEqual({ color: "color:blue" });

  listeners.input({
    target: createTarget({ "[data-session-tactical-width]": { value: "4" } }),
  });
  expect(lineWidth).toBe(5);
  expect(calls).toContainEqual({ lineWidth: 5 });

  const field = { dataset: { sessionField: "focus" }, value: "Press" };
  listeners.input({
    target: createTarget({ "[data-session-field]": field }),
  });
  expect(calls).toContain("field:focus:Press");
  expect(calls).toContain("resize");
});

test("Session Planner change controller preserves select/upload and render behavior", () => {
  const listeners = {};
  const calls = [];
  let teamCount = 0;
  let autoMode = "";
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  bindSessionPlannerWorkspaceInputChangeController({
    workspaceElement,
    updatePlayerBoardSelectedColor: (color) => calls.push(`color:${color}`),
    normalizePlayerBoardTeamCount: (value) => Number(value) + 1,
    setPlayerBoardTeamCount: (value) => {
      teamCount = value;
    },
    normalizePlayerBoardAutoMode: (value) => `mode:${value}`,
    setPlayerBoardAutoMode: (value) => {
      autoMode = value;
    },
    updatePrintPaper: (value) => calls.push(`paper:${value}`),
    updatePrintSection: (section, checked) => calls.push(`section:${section}:${checked}`),
    setTacticalPitchMode: (value) => calls.push(`pitch:${value}`),
    handleVisualUpload: (file) => calls.push(`upload:${file.name}`),
    updateLibraryFilter: (filter, value) => calls.push(`filter:${filter}:${value}`),
    updateLibrarySortMode: (value) => calls.push(`sort:${value}`),
    updateSelectedBlockField: (field, value, options) => calls.push(`field:${field}:${value}:${options.syncExerciseReview}`),
    renderWorkspace: (options) => calls.push(`render:${options.preserveDateStripScroll}`),
  });

  const colorSelect = { value: "gold" };
  listeners.change({
    target: createTarget({ "[data-session-player-board-color-select]": colorSelect }),
  });
  expect(calls).toContain("color:gold");
  expect(colorSelect.value).toBe("");

  const teamCountField = { value: "3" };
  listeners.change({
    target: createTarget({ "[data-session-player-board-team-count]": teamCountField }),
  });
  expect(teamCount).toBe(4);
  expect(teamCountField.value).toBe("4");

  const autoModeField = { value: "balanced" };
  listeners.change({
    target: createTarget({ "[data-session-player-board-auto-mode]": autoModeField }),
  });
  expect(autoMode).toBe("mode:balanced");
  expect(autoModeField.value).toBe("mode:balanced");

  listeners.change({
    target: createTarget({ "[data-session-print-paper]": { value: "a4" } }),
  });
  expect(calls).toContain("paper:a4");

  listeners.change({
    target: createTarget({
      "[data-session-print-section]": { checked: true, dataset: { sessionPrintSection: "notes" } },
    }),
  });
  expect(calls).toContain("section:notes:true");

  const uploadField = { files: [{ name: "visual.png" }], value: "visual.png" };
  listeners.change({
    target: createTarget({ "[data-session-upload-visual]": uploadField }),
  });
  expect(calls).toContain("upload:visual.png");
  expect(uploadField.value).toBe("");

  const field = { dataset: { sessionField: "postSessionNotes" }, value: "Done" };
  listeners.change({
    target: createTarget({ "[data-session-field]": field }),
  });
  expect(calls).toContain("field:postSessionNotes:Done:true");
  expect(calls).toContain("render:true");
});
