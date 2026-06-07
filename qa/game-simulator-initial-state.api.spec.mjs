import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorInitialStateFactory } from "../src/modules/game-simulator/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator initial state factory owns kickoff default state", () => {
  const app = readProjectFile("app.js");
  const initialState = readProjectFile("src/modules/game-simulator/initial-state.mjs");
  const index = readProjectFile("src/modules/game-simulator/index.mjs");

  expect(typeof createGameSimulatorInitialStateFactory).toBe("function");
  expect(app).toContain("createGameSimulatorInitialStateFactory({");
  expect(app).not.toContain("function createInitialState()");
  expect(initialState).toContain("return function createInitialState()");
  expect(initialState).toContain("Kick-off loaded: Blue Team starts from the centre mark.");
  expect(initialState).toContain("applyKickoffSetup(initialState");
  expect(index).toContain('export { createGameSimulatorInitialStateFactory } from "./initial-state.mjs";');
});
