import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotCandidatesRuntime } from "../src/modules/game-simulator/engine-autopilot-candidates-wiring.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine autopilot candidates wiring owns candidates runtime composition", () => {
  const autopilotWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-wiring.mjs");
  const candidatesWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-candidates-wiring.mjs");

  expect(typeof createGameSimulatorAutopilotCandidatesRuntime).toBe("function");
  expect(autopilotWiring).toContain('from "./engine-autopilot-candidates-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotCandidatesRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-candidates.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotCandidates({");
  expect(candidatesWiring).toContain('from "./autopilot-candidates.mjs"');
  expect(candidatesWiring).toContain("createGameSimulatorAutopilotCandidatesRuntime");
  expect(candidatesWiring).toContain("createGameSimulatorAutopilotCandidates(context)");
});
