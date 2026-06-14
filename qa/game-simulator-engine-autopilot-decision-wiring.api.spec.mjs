import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotDecisionRuntime } from "../src/modules/game-simulator/engine-autopilot-decision-wiring.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine autopilot decision wiring owns decision runtime composition", () => {
  const autopilotWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-wiring.mjs");
  const decisionWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-decision-wiring.mjs");

  expect(typeof createGameSimulatorAutopilotDecisionRuntime).toBe("function");
  expect(autopilotWiring).toContain('from "./engine-autopilot-decision-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotDecisionRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-decision-engine.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotDecisionEngine({");
  expect(decisionWiring).toContain('from "./autopilot-decision-engine.mjs"');
  expect(decisionWiring).toContain("createGameSimulatorAutopilotDecisionRuntime");
  expect(decisionWiring).toContain("createGameSimulatorAutopilotDecisionEngine(context)");
});
