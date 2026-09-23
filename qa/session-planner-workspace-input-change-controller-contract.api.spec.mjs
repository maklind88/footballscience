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
  const platformBindingsSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const bindingsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  const controllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-input-change-controller.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindSessionPlannerRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerWorkspaceInputChangeController({");
  expect(bindingsSource).toContain("bindSessionPlannerWorkspaceInputChangeController({");
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("input"');
  expect(appSource).not.toContain('ui.sessionPlannerWorkspace?.addEventListener("change"');
  expect(controllerSource).toContain('workspaceElement?.addEventListener?.("input"');
  expect(controllerSource).toContain('workspaceElement?.addEventListener?.("focusout"');
  expect(controllerSource).toContain('workspaceElement?.addEventListener?.("focusin"');
  expect(controllerSource).toContain('win?.addEventListener?.("pagehide", drafts.flush)');
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
  expect(calls).not.toContain("field:focus:Press");
  expect(calls).toContain("resize");

  listeners.focusout({
    target: createTarget({ "[data-session-field]": field }),
  });
  expect(calls).toContain("field:focus:Press");

  let prevented = false;
  const titleField = {
    dataset: { sessionField: "title" },
    value: "Activation",
    tagName: "INPUT",
    blur: () => calls.push("blur"),
  };
  listeners.keydown({
    key: "Enter",
    target: createTarget({ "[data-session-field]": titleField }),
    preventDefault: () => {
      prevented = true;
    },
  });
  expect(prevented).toBe(true);
  expect(calls).toContain("field:title:Activation");
  expect(calls).toContain("blur");

  const notesField = {
    dataset: { sessionField: "principles" },
    value: "Keep possession",
    tagName: "TEXTAREA",
  };
  listeners.keydown({
    key: "Enter",
    target: createTarget({ "[data-session-field]": notesField }),
    preventDefault: () => calls.push("unexpected-textarea-commit"),
  });
  expect(calls).not.toContain("field:principles:Keep possession");
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

test("Session Planner keeps a typed text draft local until a successful field commit", () => {
  const listeners = {};
  const calls = [];
  const workspaceElement = {
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    removeEventListener: () => {},
  };
  const drafts = {
    restore: () => ({ status: "none", value: "" }),
    record: (context, value, baseValue) => calls.push({ type: "draft", context, value, baseValue }),
    clear: (context) => calls.push({ type: "clear", context }),
    flush: () => true,
  };
  const field = { dataset: { sessionField: "objectives" }, value: "Build from the back", tagName: "TEXTAREA" };
  bindSessionPlannerWorkspaceInputChangeController({
    workspaceElement,
    getSelectedBlock: () => ({ id: "block-1" }),
    getSelectedDate: () => "2026-09-23",
    textDraftStore: drafts,
    resizeTextarea: () => {},
    updateSelectedBlockField: (name, value) => {
      calls.push({ type: "central", name, value });
      return true;
    },
  });

  listeners.focusin({ target: createTarget({ "[data-session-field]": field }) });
  listeners.input({ target: createTarget({ "[data-session-field]": field }) });
  expect(calls).toContainEqual({
    type: "draft",
    context: { date: "2026-09-23", blockId: "block-1", field: "objectives" },
    value: "Build from the back",
    baseValue: "Build from the back",
  });
  expect(calls.some((call) => call.type === "central")).toBe(false);

  listeners.focusout({ target: createTarget({ "[data-session-field]": field }) });
  expect(calls).toContainEqual({ type: "central", name: "objectives", value: "Build from the back" });
  expect(calls).toContainEqual({
    type: "clear",
    context: { date: "2026-09-23", blockId: "block-1", field: "objectives" },
  });
});
