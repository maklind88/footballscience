import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotOffballRuntime } from "../src/modules/game-simulator/engine-autopilot-offball-wiring.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine autopilot offball wiring owns offball runtime composition", () => {
  const autopilotWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-wiring.mjs");
  const offballWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-offball-wiring.mjs");

  expect(typeof createGameSimulatorAutopilotOffballRuntime).toBe("function");
  expect(autopilotWiring).toContain('from "./engine-autopilot-offball-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotOffballRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-offball-targets.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotOffballTargets({");
  expect(offballWiring).toContain('from "./autopilot-offball-targets.mjs"');
  expect(offballWiring).toContain("createGameSimulatorAutopilotOffballRuntime");
  expect(offballWiring).toContain("createGameSimulatorAutopilotOffballTargets(context)");
});
