import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPeriodizationWorkspaceController } from "../src/modules/periodization/index.mjs";
import { createScopedTextDraftStore } from "../src/core/scoped-text-draft-store.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function functionSource(source, name) {
  const matcher = new RegExp(`(?:function\\s+${name}\\b|const\\s+${name}\\s*=)`);
  const match = matcher.exec(source);
  const start = match?.index ?? -1;
  expect(start, `Missing ${name}`).toBeGreaterThanOrEqual(0);
  const nextFunction = source.slice(start + 1).search(/\n  (?:function|const)\s/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

test("text input handlers stay draft-only until a clear commit boundary", () => {
  const sessionSource = readProjectFile("src/modules/session-planner/session-planner-workspace-input-change-controller.mjs");
  const periodizationSource = readProjectFile("src/modules/periodization/periodization-controller.mjs");
  const periodizationBridgeSource = readProjectFile("src/modules/periodization/periodization-session-bridge.mjs");
  const squadSource = readProjectFile("src/modules/squad/player-profile-runtime-bindings.mjs");
  const presentationSource = readProjectFile("src/modules/presentation-mode/presentation-mode-controller.mjs");

  const sessionInput = functionSource(sessionSource, "handleInput");
  expect(sessionInput).not.toContain("updateSelectedBlockField");
  expect(sessionInput).toContain("recordTextDraft(field)");

  const periodizationInput = functionSource(periodizationSource, "handleBoardInput");
  expect(periodizationInput).toContain("isTextEditingField(field)");
  expect(periodizationInput).toMatch(/isTextEditingField\(field\)[\s\S]{0,120}return;/);
  expect(functionSource(periodizationSource, "handleBoardChange")).toContain("writeSelectedDay");

  const embeddedPeriodizationInput = functionSource(periodizationBridgeSource, "handleInput");
  expect(embeddedPeriodizationInput).toContain("isTextEditingField(field)");
  expect(embeddedPeriodizationInput).toMatch(/isTextEditingField\(field\)[\s\S]{0,120}return true;/);
  expect(functionSource(periodizationBridgeSource, "handleChange")).toContain("options.writeDay");

  const squadInput = functionSource(squadSource, "onInput");
  expect(squadInput).not.toContain("queuePlayerProfileAutosave");
  expect(squadInput).not.toContain("savePlayerProfileEditForm");

  const presentationInput = functionSource(presentationSource, "handleInput");
  expect(presentationInput).not.toContain("updateInfoSlideField");
  expect(presentationInput).not.toContain("updateTextOverride");
  expect(presentationInput).toContain("recordPresentationTextDraft");
  expect(functionSource(presentationSource, "handleFocusout")).toContain("commitPresentationTextField");
});

test("Periodization text waits for a change boundary before writing the selected day", () => {
  const writes = [];
  const field = {
    dataset: { periodizationField: "objectives" },
    tagName: "TEXTAREA",
    value: "Build from the back",
    closest(selector) {
      return selector === "[data-periodization-field]" ? this : null;
    },
    matches: () => false,
  };
  const controller = createPeriodizationWorkspaceController({
    canEdit: () => true,
    getState: () => ({ selectedDate: "2026-09-23" }),
    writeDay: (...args) => writes.push(args),
  });

  controller.handleBoardInput({ target: field });
  expect(writes).toEqual([]);

  controller.handleBoardChange({ target: field });
  expect(writes).toEqual([["2026-09-23", { objectives: "Build from the back" }, false]]);
});

test("scoped text drafts restore only when the central value still matches the original base", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const timers = [];
  const store = createScopedTextDraftStore({
    storage,
    storageKey: "football-periodization-text-drafts-v1",
    getScope: () => "coach-1",
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: () => {},
  });
  const context = { field: "objectives", recordId: "2026-09-23" };

  store.record(context, "Draft objective", "Saved objective");
  timers.shift()();
  expect(store.restore(context, "Saved objective")).toEqual({ status: "restore", value: "Draft objective" });
  expect(store.restore(context, "A colleague changed this")).toEqual({
    status: "conflict",
    value: "A colleague changed this",
  });
});
