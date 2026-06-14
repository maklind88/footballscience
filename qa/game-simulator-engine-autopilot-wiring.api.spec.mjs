import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotRuntime } from "../src/modules/game-simulator/engine-autopilot-wiring.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator engine autopilot wiring owns autopilot runtime composition", () => {
  const engineWiring = readProjectFile("src/modules/game-simulator/engine-wiring.mjs");
  const autopilotWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-wiring.mjs");
  const autopilotCandidatesWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-candidates-wiring.mjs");
  const autopilotDefensiveWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-defensive-wiring.mjs");
  const autopilotDecisionWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-decision-wiring.mjs");
  const autopilotLiveWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-live-wiring.mjs");
  const autopilotOffballWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-offball-wiring.mjs");
  const autopilotTargetsWiring = readProjectFile("src/modules/game-simulator/engine-autopilot-targets-wiring.mjs");

  expect(typeof createGameSimulatorAutopilotRuntime).toBe("function");
  expect(engineWiring).toContain('from "./engine-autopilot-wiring.mjs"');
  expect(engineWiring).toContain("createGameSimulatorAutopilotRuntime({");
  expect(engineWiring).not.toContain('from "./autopilot-live-engine.mjs"');
  expect(engineWiring).not.toContain('from "./autopilot-targets.mjs"');
  expect(engineWiring).not.toContain("createGameSimulatorAutopilotLiveEngine({");
  expect(engineWiring).not.toContain("createGameSimulatorAutopilotTargets({");
  expect(autopilotWiring).toContain('from "./engine-autopilot-live-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotLiveRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-live-engine.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotLiveEngine({");
  expect(autopilotWiring).toContain('from "./engine-autopilot-decision-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotDecisionRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-decision-engine.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotDecisionEngine({");
  expect(autopilotWiring).toContain('from "./engine-autopilot-offball-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotOffballRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-offball-targets.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotOffballTargets({");
  expect(autopilotWiring).toContain('from "./engine-autopilot-candidates-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotCandidatesRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-candidates.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotCandidates({");
  expect(autopilotWiring).toContain('from "./engine-autopilot-defensive-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotDefensiveRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-defensive-targets.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotDefensiveTargets({");
  expect(autopilotWiring).toContain('from "./engine-autopilot-targets-wiring.mjs"');
  expect(autopilotWiring).toContain("createGameSimulatorAutopilotTargetsRuntime({");
  expect(autopilotWiring).not.toContain('from "./autopilot-targets.mjs"');
  expect(autopilotWiring).not.toContain("createGameSimulatorAutopilotTargets({");
  expect(autopilotCandidatesWiring).toContain('from "./autopilot-candidates.mjs"');
  expect(autopilotCandidatesWiring).toContain("createGameSimulatorAutopilotCandidatesRuntime");
  expect(autopilotCandidatesWiring).toContain("createGameSimulatorAutopilotCandidates(context)");
  expect(autopilotDefensiveWiring).toContain('from "./autopilot-defensive-targets.mjs"');
  expect(autopilotDefensiveWiring).toContain("createGameSimulatorAutopilotDefensiveRuntime");
  expect(autopilotDefensiveWiring).toContain("createGameSimulatorAutopilotDefensiveTargets(context)");
  expect(autopilotDecisionWiring).toContain('from "./autopilot-decision-engine.mjs"');
  expect(autopilotDecisionWiring).toContain("createGameSimulatorAutopilotDecisionRuntime");
  expect(autopilotDecisionWiring).toContain("createGameSimulatorAutopilotDecisionEngine(context)");
  expect(autopilotLiveWiring).toContain('from "./autopilot-live-engine.mjs"');
  expect(autopilotLiveWiring).toContain("createGameSimulatorAutopilotLiveRuntime");
  expect(autopilotLiveWiring).toContain("createGameSimulatorAutopilotLiveEngine(context)");
  expect(autopilotOffballWiring).toContain('from "./autopilot-offball-targets.mjs"');
  expect(autopilotOffballWiring).toContain("createGameSimulatorAutopilotOffballRuntime");
  expect(autopilotOffballWiring).toContain("createGameSimulatorAutopilotOffballTargets(context)");
  expect(autopilotTargetsWiring).toContain('from "./autopilot-targets.mjs"');
  expect(autopilotTargetsWiring).toContain("createGameSimulatorAutopilotTargetsRuntime");
  expect(autopilotTargetsWiring).toContain("createGameSimulatorAutopilotTargets(context)");
  expect(autopilotWiring).toContain("getAutoPilotRoleStrength");
  expect(autopilotWiring).toContain("updateActionPlayers");
});
