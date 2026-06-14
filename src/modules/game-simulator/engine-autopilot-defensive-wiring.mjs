import { createGameSimulatorAutopilotDefensiveTargets } from "./autopilot-defensive-targets.mjs";

export function createGameSimulatorAutopilotDefensiveRuntime(context = {}) {
  return createGameSimulatorAutopilotDefensiveTargets(context);
}
