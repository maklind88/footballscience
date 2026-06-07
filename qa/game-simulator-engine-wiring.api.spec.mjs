import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorEngineBundle } from "../src/modules/game-simulator/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine wiring is isolated from app.js", () => {
  const app = readProjectFile("app-runtime.js");
  const engineWiring = readProjectFile("src/modules/game-simulator/engine-wiring.mjs");
  const runtimeEntry = readProjectFile("src/modules/game-simulator/runtime-entry.mjs");
  const index = readProjectFile("src/modules/game-simulator/index.mjs");

  expect(typeof createGameSimulatorEngineBundle).toBe("function");
  expect(app).not.toContain("createGameSimulatorEngineBundle({");
  expect(runtimeEntry).toContain("createGameSimulatorEngineBundle({");
  expect(app).not.toContain("createGameSimulatorSetupEngine({");
  expect(app).not.toContain("createGameSimulatorCommandEngine({");
  expect(engineWiring).toContain("createGameSimulatorSetupEngine({");
  expect(engineWiring).toContain("createGameSimulatorCommandEngine({");
  expect(engineWiring).toContain("getState");
  expect(engineWiring).not.toContain("() => state");
  expect(index).toContain('export { createGameSimulatorEngineBundle } from "./engine-wiring.mjs";');
});
