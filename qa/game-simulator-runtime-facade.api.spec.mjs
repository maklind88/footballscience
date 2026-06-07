import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorRuntimeFacade } from "../src/modules/game-simulator/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator runtime facade owns app runtime wrappers and fallbacks", () => {
  const app = readProjectFile("app-runtime.js");
  const facade = readProjectFile("src/modules/game-simulator/runtime-facade.mjs");
  const runtimeEntry = readProjectFile("src/modules/game-simulator/runtime-entry.mjs");
  const index = readProjectFile("src/modules/game-simulator/index.mjs");

  expect(typeof createGameSimulatorRuntimeFacade).toBe("function");
  expect(app).not.toContain("createGameSimulatorRuntimeFacade({");
  expect(app).toContain("gameSimulatorRuntime = createGameSimulatorRuntimeEntry({");
  expect(runtimeEntry).toContain("createGameSimulatorRuntimeFacade({");
  expect(runtimeEntry).toContain("} = gameSimulatorRuntimeFacade;");
  expect(app).not.toContain('function canEditScenario(...args) { return invokeGameSimulatorAppRuntime("canEditScenario", args); }');
  expect(app).not.toContain("function cloneTeamIdentity(identity)");
  expect(facade).toContain("const runtimeMethodNames = Object.freeze");
  expect(facade).toContain("function readSavedSequenceLibrary(...args)");
  expect(facade).toContain("function cloneTeamIdentity(identity)");
  expect(facade).toContain("facade.shouldIgnoreHotkey");
  expect(index).toContain('export { createGameSimulatorRuntimeEntry } from "./runtime-entry.mjs";');
  expect(index).toContain('export { createGameSimulatorRuntimeFacade } from "./runtime-facade.mjs";');
});
