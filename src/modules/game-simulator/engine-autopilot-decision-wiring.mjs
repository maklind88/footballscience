import { createGameSimulatorAutopilotDecisionEngine } from "./autopilot-decision-engine.mjs";

export function createGameSimulatorAutopilotDecisionRuntime(context = {}) {
  return createGameSimulatorAutopilotDecisionEngine(context);
}
