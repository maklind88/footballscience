import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotLiveRuntime } from "../src/modules/game-simulator/engine-autopilot-live-wiring.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine autopilot live wiring owns live runtime composition", () => {
  const autopilotWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-wiring.mjs");
  const liveWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-live-wiring.mjs");

  expect(typeof createGameSimulatorAutopilotLiveRuntime).toBe("function");
  expect(autopilotWiring).toContain('from "./engine-autopilot-live-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotLiveRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-live-engine.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotLiveEngine({");
  expect(liveWiring).toContain('from "./autopilot-live-engine.mjs"');
  expect(liveWiring).toContain("createGameSimulatorAutopilotLiveRuntime");
  expect(liveWiring).toContain("createGameSimulatorAutopilotLiveEngine(context)");
});
