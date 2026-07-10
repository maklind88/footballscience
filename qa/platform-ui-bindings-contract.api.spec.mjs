import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatformUiBindings } from "../src/core/platform-ui-bindings.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("platform UI bindings keep DOM selectors outside the app shell", () => {
  const app = readProjectFile("app-runtime.js");
  const bindings = readProjectFile("src/core/platform-ui-bindings.mjs");

  expect(app).toContain('import { createPlatformUiBindings } from "./src/core/platform-ui-bindings.mjs";');
  expect(app).toContain("const ui = createPlatformUiBindings(document);");
  expect(app).not.toContain("const ui = {");
  expect(bindings).toContain("dashboardChatWidgetRoot");
  expect(bindings).toContain("sessionPlannerWorkspace");
});

test("platform UI bindings preserve element ids and non-id selectors", () => {
  const lookedUpIds = [];
  const queriedSelectors = [];
  const queriedAllSelectors = [];
  const documentRef = {
    getElementById(id) {
      lookedUpIds.push(id);
      return { id };
    },
    querySelector(selector) {
      queriedSelectors.push(selector);
      return { selector };
    },
    querySelectorAll(selector) {
      queriedAllSelectors.push(selector);
      return [{ selector }];
    },
  };

  const ui = createPlatformUiBindings(documentRef);

  expect(ui.hubShell).toEqual({ id: "hubShell" });
  expect(ui.dashboardChatWidgetRoot).toEqual({ id: "dashboardChatWidgetRoot" });
  expect(ui.platformInstallLoginSurface).toEqual({ id: "platformInstallLoginSurface" });
  expect(ui.platformInstallProfileSurface).toEqual({ id: "platformInstallProfileSurface" });
  expect(ui.platformInstallPromptHost).toEqual({ id: "platformInstallPromptHost" });
  expect(ui.platformInstallGuideHost).toEqual({ id: "platformInstallGuideHost" });
  expect(ui.sessionPlannerWorkspace).toEqual({ id: "sessionPlannerWorkspace" });
  expect(ui.scheduleOverviewSpanButtons).toEqual([{ selector: "[data-schedule-span]" }]);
  expect(lookedUpIds).toContain("pitchStage");
  expect(lookedUpIds).toContain("savedSequenceList");
  expect(queriedSelectors).toEqual([]);
  expect(queriedAllSelectors).toEqual(["[data-schedule-span]"]);
});
