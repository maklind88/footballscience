import { createGameSimulatorDefensiveOpenPlayTargetBuilder } from "./autopilot-defensive-open-play-target-builder.mjs";
import { createGameSimulatorDefensiveRestartTransitionTargets } from "./autopilot-defensive-restart-transition-targets.mjs";
import { createGameSimulatorDefensiveShapeTargetBuilder } from "./autopilot-defensive-shape-target-builder.mjs";

export function createGameSimulatorDefensiveAutopilotTargetBuilder(deps = {}) {
  const { buildDefensiveShapeTargets } = createGameSimulatorDefensiveShapeTargetBuilder(deps);
  const { resolveDefensiveRestartTransitionTargets } = createGameSimulatorDefensiveRestartTransitionTargets(deps);
  const { buildDefensiveOpenPlayTargets } = createGameSimulatorDefensiveOpenPlayTargetBuilder(deps);

  function buildDefensiveAutopilotTargets(teamId, ballPoint) {
    const { groups, targets, profile } = buildDefensiveShapeTargets(teamId, ballPoint);
    const restartTransitionResult = resolveDefensiveRestartTransitionTargets({
      teamId,
      targets,
      groups,
      ballPoint,
      profile,
    });

    if (restartTransitionResult) {
      return restartTransitionResult;
    }

    return buildDefensiveOpenPlayTargets({
      teamId,
      targets,
      groups,
      ballPoint,
      profile,
    });
  }

  return {
    buildDefensiveAutopilotTargets,
  };
}
