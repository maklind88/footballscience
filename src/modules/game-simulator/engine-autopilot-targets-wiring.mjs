import { createGameSimulatorAutopilotTargets } from "./autopilot-targets.mjs";

export function createGameSimulatorAutopilotTargetsRuntime(context = {}) {
  return createGameSimulatorAutopilotTargets(context);
}
