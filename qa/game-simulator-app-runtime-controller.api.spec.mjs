import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAppRuntimeController } from "../src/modules/game-simulator/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator app runtime controller owns simulator runtime wiring", () => {
  const app = readProjectFile("app.js");
  const controller = readProjectFile("src/modules/game-simulator/app-runtime-controller.mjs");
  const facade = readProjectFile("src/modules/game-simulator/runtime-facade.mjs");

  expect(typeof createGameSimulatorAppRuntimeController).toBe("function");
  expect(app).toContain("createGameSimulatorAppRuntimeController");
  expect(app).toContain("createGameSimulatorRuntimeFacade");
  expect(app).toContain("function invokeGameSimulatorAppRuntime");
  expect(app).not.toContain("function executePlannedAction(...args)");
  expect(facade).toContain('"executePlannedAction"');
  expect(app).not.toContain("const gameSimulatorCanvasRenderer = createGameSimulatorCanvasRenderer");
  expect(app).not.toContain("const gameSimulatorPointerController = createGameSimulatorPointerController");
  expect(controller).toContain("createGameSimulatorSequenceEngine");
  expect(controller).toContain("createGameSimulatorCanvasRenderer");
  expect(controller).toContain("createGameSimulatorPointerController");
  expect(controller).toContain("function executePlannedAction()");
  expect(controller).toContain("function pauseSimulatorForWorkspaceSwitch()");
  expect(controller).toContain("function createStateProxy(getAppState)");
  expect(controller).toContain('import("./controllers.mjs")');
  expect(controller).toContain('import("./runtime.mjs")');
  expect(controller).toContain('getHubState()?.activeWorkspaceId === "game-simulator"');
});
