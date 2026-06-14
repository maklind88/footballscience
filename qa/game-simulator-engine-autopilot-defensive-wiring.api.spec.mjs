import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotDefensiveRuntime } from "../src/modules/game-simulator/engine-autopilot-defensive-wiring.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine autopilot defensive wiring owns defensive runtime composition", () => {
  const autopilotWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-wiring.mjs");
  const defensiveWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-defensive-wiring.mjs");

  expect(typeof createGameSimulatorAutopilotDefensiveRuntime).toBe("function");
  expect(autopilotWiring).toContain('from "./engine-autopilot-defensive-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotDefensiveRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-defensive-targets.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotDefensiveTargets({");
  expect(defensiveWiring).toContain('from "./autopilot-defensive-targets.mjs"');
  expect(defensiveWiring).toContain("createGameSimulatorAutopilotDefensiveRuntime");
  expect(defensiveWiring).toContain("createGameSimulatorAutopilotDefensiveTargets(context)");
});
