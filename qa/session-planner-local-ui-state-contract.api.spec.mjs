import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionPlannerLocalUiState } from "../src/modules/session-planner/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Session Planner local UI state keeps transient state outside app-runtime wiring", () => {
  const stateController = createSessionPlannerLocalUiState({
    printSectionOptions: [{ key: "overview" }, { key: "blocks" }],
  });

  expect(stateController.state.sessionPlannerLibraryOpen).toBe(false);
  expect(stateController.state.sessionPlannerLibrarySelectedFolderId).toBe("all");
  expect(stateController.state.sessionPlannerPlayerBoardTeamCount).toBe(2);
  expect(stateController.state.sessionPlannerPrintSections).toEqual({ overview: true, blocks: true });

  stateController.applyPatch({
    sessionPlannerLibraryOpen: true,
    sessionPlannerLibrarySelectedFolderId: "warmups",
    sessionPlannerPlayerBoardTeamCount: 4,
    unknownKey: "ignored",
  });

  expect(stateController.getState().sessionPlannerLibraryOpen).toBe(true);
  expect(stateController.getState().sessionPlannerLibrarySelectedFolderId).toBe("warmups");
  expect(stateController.getState().sessionPlannerPlayerBoardTeamCount).toBe(4);
  expect(stateController.getState().unknownKey).toBeUndefined();
});

test("Session Planner local UI state does not own persistence or central sync", () => {
  const moduleSource = readProjectFile("src/modules/session-planner/session-planner-local-ui-state.mjs");
  const appRuntime = readProjectFile("app-runtime.js");
  const appRuntimeComposer = readProjectFile("src/modules/session-planner/session-planner-app-runtime-composer.mjs");

  expect(moduleSource).not.toContain("localStorage");
  expect(moduleSource).not.toContain("queueCentralStateWrite");
  expect(moduleSource).not.toContain("writeSessionPlannerState");
  expect(appRuntime).toContain("createSessionPlannerAppRuntimeComposition({");
  expect(appRuntimeComposer).toContain("createSessionPlannerLocalUiState");
  expect(appRuntimeComposer).toContain("getLocalState: () => sessionPlannerLocalUiState.state");
  expect(appRuntimeComposer).toContain("sessionPlannerLocalUiState.applyPatch(patch)");
});
