import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionPlannerToastController } from "../src/modules/session-planner/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Session Planner toast controller renders and clears transient UI only", () => {
  const workspace = {
    markup: "",
    existingToast: null,
    querySelector(selector) {
      return selector === "[data-session-toast]" ? this.existingToast : null;
    },
    insertAdjacentHTML(_position, markup) {
      this.markup = markup;
    },
  };
  const state = {
    sessionPlannerToastMessage: "",
    sessionPlannerToastTimeoutId: 0,
    sessionPlannerToastTone: "success",
  };
  const timers = [];
  const controller = createSessionPlannerToastController({
    escapeHtml: (value) => String(value).replaceAll("<", "&lt;"),
    getState: () => state,
    getWorkspace: () => workspace,
    win: {
      clearTimeout: () => {},
      setTimeout(callback, ms) {
        timers.push({ callback, ms });
        return timers.length;
      },
    },
  });

  controller.show("<Saved>", "warning");

  expect(state.sessionPlannerToastMessage).toBe("<Saved>");
  expect(state.sessionPlannerToastTone).toBe("warning");
  expect(workspace.markup).toContain("&lt;Saved>");
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBe(3200);
  timers[0].callback();
  expect(state.sessionPlannerToastMessage).toBe("");
});

test("Session Planner toast controller stays outside persistence boundaries", () => {
  const moduleSource = readProjectFile("src/modules/session-planner/session-planner-toast-controller.mjs");
  const appRuntime = readProjectFile("app-runtime.js");

  expect(moduleSource).not.toContain("localStorage");
  expect(moduleSource).not.toContain("queueCentralStateWrite");
  expect(moduleSource).not.toContain("writeSessionPlannerState");
  expect(appRuntime).toContain("createSessionPlannerToastController");
  expect(appRuntime).toContain("function renderSessionPlannerToast() { sessionPlannerToastController.render(); }");
});
