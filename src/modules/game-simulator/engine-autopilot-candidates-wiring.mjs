import { createGameSimulatorAutopilotCandidates } from "./autopilot-candidates.mjs";

export function createGameSimulatorAutopilotCandidatesRuntime(context = {}) {
  return createGameSimulatorAutopilotCandidates(context);
}
