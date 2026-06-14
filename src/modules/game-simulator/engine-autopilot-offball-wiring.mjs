import { createGameSimulatorAutopilotOffballTargets } from "./autopilot-offball-targets.mjs";

export function createGameSimulatorAutopilotOffballRuntime(context = {}) {
  return createGameSimulatorAutopilotOffballTargets(context);
}
