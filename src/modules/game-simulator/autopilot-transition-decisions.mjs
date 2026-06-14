import { createGameSimulatorAutopilotRecoveryFirstActionDecisions } from "./autopilot-recovery-first-action-decisions.mjs";
import { createGameSimulatorAutopilotPostRecoveryPhaseDecisions } from "./autopilot-post-recovery-phase-decisions.mjs";
import { createGameSimulatorAutopilotTransitionNumbersDecisions } from "./autopilot-transition-numbers-decisions.mjs";

export function createGameSimulatorAutopilotTransitionDecisions(deps = {}) {
  const recoveryFirstActionDecisions = createGameSimulatorAutopilotRecoveryFirstActionDecisions(deps);
  const postRecoveryPhaseDecisions = createGameSimulatorAutopilotPostRecoveryPhaseDecisions(deps);
  const transitionNumbersDecisions = createGameSimulatorAutopilotTransitionNumbersDecisions({
    ...deps,
    getAutoPilotPostRecoveryPhaseContext: postRecoveryPhaseDecisions.getAutoPilotPostRecoveryPhaseContext,
  });

  return {
    ...recoveryFirstActionDecisions,
    ...postRecoveryPhaseDecisions,
    ...transitionNumbersDecisions,
  };
}
