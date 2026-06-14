import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotTargetsRuntime } from "../src/modules/game-simulator/engine-autopilot-targets-wiring.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine autopilot targets wiring isolates target composition", () => {
  const autopilotWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-wiring.mjs");
  const autopilotTargetsWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-targets-wiring.mjs");

  expect(typeof createGameSimulatorAutopilotTargetsRuntime).toBe("function");
  expect(autopilotWiring).toContain('from "./engine-autopilot-targets-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotTargetsRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-targets.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotTargets({");
  expect(autopilotTargetsWiring).toContain('from "./autopilot-targets.mjs"');
  expect(autopilotTargetsWiring).toContain("createGameSimulatorAutopilotTargetsRuntime");
  expect(autopilotTargetsWiring).toContain("createGameSimulatorAutopilotTargets(context)");
});
