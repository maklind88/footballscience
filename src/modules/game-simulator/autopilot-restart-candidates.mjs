import { createGameSimulatorAutopilotKickoffCandidates } from "./autopilot-kickoff-candidates.mjs";
import { createGameSimulatorAutopilotSetPieceCandidates } from "./autopilot-set-piece-candidates.mjs";

export function createGameSimulatorAutopilotRestartCandidates(deps = {}) {
  const kickoffCandidates = createGameSimulatorAutopilotKickoffCandidates(deps);
  const setPieceCandidates = createGameSimulatorAutopilotSetPieceCandidates(deps);

  return {
    ...kickoffCandidates,
    ...setPieceCandidates,
  };
}
