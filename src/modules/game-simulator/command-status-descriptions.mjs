export function createGameSimulatorCommandStatusDescriptions(deps = {}) {
  const {
    getFirstTouchModeLabel,
    getPlayerById,
    getRequestedActionMode,
    hasBallAction,
    setPiecePhaseProfiles,
    state,
    teams,
  } = deps;

  function getBallStatus() {
    if (state.sequence.isPlaying && state.sequence.phase === "transition") {
      return state.isRunning ? "Transition" : "Transition Paused";
    }
    if (state.isRunning && state.ball.inTransit) {
      return "In Motion";
    }
    if (!state.isRunning && state.ball.inTransit && state.ball.elapsedTravelTime > 0) {
      return "Paused";
    }
    if (hasBallAction()) {
      return "Planned";
    }
    return "Still";
  }

  function getActionTypeLabel() {
    if (state.sequence.isPlaying && state.sequence.phase === "transition") {
      return "Transition";
    }
    if (state.ball.actionType === "pass") {
      return "Pass";
    }
    if (state.ball.actionType === "dribble") {
      return "Dribble";
    }
    if (state.ball.actionType === "shot") {
      return "Shot";
    }
    if (state.ball.actionType === "recovery") {
      return "Loose Ball";
    }
    const requestedMode = getRequestedActionMode();
    if (requestedMode === "dribble") {
      return "Dribble Selected";
    }
    if (requestedMode === "shot") {
      return "Shot Selected";
    }
    if (requestedMode === "pass") {
      return "Pass Selected";
    }
    return "Free Move";
  }

  function describeStep(step, index) {
    const target = `x ${step.target.x.toFixed(1)}, y ${step.target.y.toFixed(1)}`;
    const profileText = step.profileLabel ? `${step.profileLabel} • ` : "";
    const restartPrefix = step.restartPhase?.type
      ? `${setPiecePhaseProfiles[step.restartPhase.type]?.label ?? "Restart"} `
      : "";
    if (step.nextRestartPhase?.type === "penalty") {
      const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Attacking team";
      return {
        title: `Step ${index + 1}: Penalty Won`,
        meta: `${profileText}Foul in the box. Next restart: ${restartTeam} penalty`,
      };
    }
    if (step.nextRestartPhase?.type === "freeKick") {
      const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Attacking team";
      return {
        title: `Step ${index + 1}: Foul`,
        meta: `${profileText}Next restart: ${restartTeam} free-kick`,
      };
    }
    if (step.nextRestartPhase?.type === "throwIn") {
      const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Restart team";
      return {
        title: `Step ${index + 1}: Ball Out`,
        meta: `${profileText}Next restart: ${restartTeam} throw-in`,
      };
    }
    if (step.actionType === "recovery") {
      const carrier = step.carrierPlayerId
        ? getPlayerById(step.carrierPlayerId)?.shortLabel ?? step.carrierPlayerId
        : "player";
      return {
        title: `Step ${index + 1}: ${restartPrefix}Loose Ball Recovery`,
        meta: `${profileText}${carrier} collects the loose ball`,
      };
    }
    if (step.actionType === "dribble") {
      const carrier = step.carrierPlayerId
        ? getPlayerById(step.carrierPlayerId)?.shortLabel ?? step.carrierPlayerId
        : "player";
      return {
        title: `Step ${index + 1}: ${restartPrefix}Dribble`,
        meta: `${profileText}${carrier} to ${target}`,
      };
    }
    if (step.actionType === "shot") {
      if (step.goal) {
        const scoringTeam = teams[step.goal.scoringTeamId]?.name ?? "Team";
        const concedingTeam = teams[step.goal.concedingTeamId]?.name ?? "Opponent";
        return {
          title: `Step ${index + 1}: Goal`,
          meta: `${profileText}${scoringTeam} score. Next restart: ${concedingTeam} kick-off`,
        };
      }
      if (step.nextRestartPhase?.type === "corner") {
        const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Attacking team";
        return {
          title: `Step ${index + 1}: Shot Saved`,
          meta: `${profileText}Turned behind. Next restart: ${restartTeam} corner`,
        };
      }
      if (step.nextRestartPhase?.type === "goalKick") {
        const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Defending team";
        return {
          title: `Step ${index + 1}: Shot Wide`,
          meta: `${profileText}Missed target. Next restart: ${restartTeam} goal-kick`,
        };
      }
      return {
        title: `Step ${index + 1}: ${restartPrefix}Shot`,
        meta: `${profileText}To ${target}`,
      };
    }
    if (step.receiverPlayerId) {
      const receiver = getPlayerById(step.receiverPlayerId)?.shortLabel ?? step.receiverPlayerId;
      const firstTouchText = step.firstTouchMode
        ? ` • First Touch: ${getFirstTouchModeLabel(step.firstTouchMode)}`
        : "";
      return {
        title: `Step ${index + 1}: ${restartPrefix}Pass`,
        meta: `${profileText}To ${receiver}${firstTouchText}`,
      };
    }
    return {
      title: `Step ${index + 1}: ${restartPrefix}Pass`,
      meta: `${profileText}To ${target}`,
    };
  }

  return {
    getBallStatus,
    getActionTypeLabel,
    describeStep,
  };
}
