import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorGeometryHelpers } from "../src/modules/game-simulator/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator geometry helpers own pure pitch math and personality weighting", () => {
  const app = readProjectFile("app.js");
  const engineWiring = readProjectFile("src/modules/game-simulator/engine-wiring.mjs");
  const helpers = readProjectFile("src/modules/game-simulator/geometry-helpers.mjs");

  expect(typeof createGameSimulatorGeometryHelpers).toBe("function");
  expect(app).not.toContain("createGameSimulatorGeometryHelpers");
  expect(engineWiring).toContain("createGameSimulatorGeometryHelpers");
  expect(engineWiring).toContain("} = createGameSimulatorGeometryHelpers({");
  expect(app).not.toContain("function chooseScoredCandidateWithVariation(candidates, profile = {}, options = {})");
  expect(helpers).toContain("function chooseScoredCandidateWithVariation(candidates, profile = {}, options = {})");
  expect(helpers).toContain("function getAutoPilotDecisionPersonalityWeight(candidate, profile = {}, options = {})");
  expect(helpers).toContain("function getPlayerBallControlPoint(player)");
  expect(helpers).toContain("function getSprintArchetype(blueprint)");
  expect(helpers).not.toContain("createGameSimulatorSetupEngine");
});
