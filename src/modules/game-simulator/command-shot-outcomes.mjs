export function createGameSimulatorCommandShotOutcomes(deps = {}) {
  const {
    applyCommittedSnapshot,
    captureSnapshot,
    clamp,
    clampToPitch,
    clearSecurePossession,
    cloneGoalEvent,
    cloneSnapshot,
    cloneVector,
    completeLiveActionPlayersBeforeCommit,
    computeTimeToCoverDistance,
    connectBallToPlayerForNextAction,
    createLooseBallSpill,
    distance,
    finalizeCurrentActionStep,
    formatTime,
    getGoalDirectionSign,
    getOpponentPenaltySpot,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    isGoalkeeper,
    isInsideOwnBox,
    lerp,
    logEvent,
    pitch,
    queueNextSequenceStep,
    rotatePlayerBodyToward,
    scheduleAutoPilotContinuation,
    setPiecePhaseProfiles,
    state,
    teams,
    ui,
  } = deps;

  function getGoalkeeperForTeam(teamId) {
    return state.players.find((player) => player.team === teamId && isGoalkeeper(player)) ?? null;
  }

  function getPreferredParrySafetyPlayer(teamId, spillPoint, goalkeeperId) {
    if (!teamId || !spillPoint) {
      return null;
    }
    const safetyRoles = new Set(["CB", "LB", "RB", "WB", "6"]);
    let bestCandidate = null;
    state.players.forEach((player) => {
      if (player.team !== teamId || player.id === goalkeeperId || isGoalkeeper(player)) {
        return;
      }
      const label = getPlayerMagnetLabel(player);
      const context = getPlayerDecisionContext(player);
      const gap = distance(player.position, spillPoint);
      const timeToBall = computeTimeToCoverDistance(player, gap, spillPoint);
      const safetyRoleBonus = safetyRoles.has(label) ? 0.42 : label === "8" ? 0.16 : 0;
      const boxProtectionBonus = isInsideOwnBox(spillPoint, teamId) && safetyRoles.has(label) ? 0.18 : 0;
      const score =
        safetyRoleBonus +
        boxProtectionBonus +
        context.profile.perception * 0.2 +
        context.profile.tacticalDiscipline * 0.22 +
        context.profile.composure * 0.16 -
        timeToBall * 0.22 -
        gap * 0.018;
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { player, score };
      }
    });
    return bestCandidate?.player ?? null;
  }

  function getGoalkeeperParryProfile(goalInfo, savePoint, goalkeeper, metrics) {
    const goalSign = getGoalDirectionSign(goalInfo.side);
    const parrySide =
      Math.sign(goalInfo.point.y - pitch.width / 2) ||
      (goalkeeper.position.y >= pitch.width / 2 ? 1 : -1);
    const control = clamp(
      metrics.saveScore * 0.46 +
        metrics.catchScore * 0.24 +
        metrics.access * 0.16 +
        metrics.reading * 0.18 -
        metrics.closeRange * 0.22 -
        metrics.shotPower * 0.12,
      0,
      1
    );
    const lateralWeight = lerp(0.34, 1.22, control) + metrics.cornerReach * 0.2;
    const awayWeight = clamp(
      lerp(0.58, 1.46, control) - metrics.closeRange * 0.16,
      0.42,
      1.55
    );
    const angle = Math.atan2(parrySide * lateralWeight, -goalSign * awayWeight);
    const distanceMeters = clamp(
      2.1 +
        metrics.shotPower * 3.8 +
        metrics.cornerReach * 0.9 +
        control * 2.4 -
        metrics.closeRange * 1.15,
      1.8,
      9.4
    );
    const spillPoint = clampToPitch({
      x: savePoint.x + Math.cos(angle) * distanceMeters,
      y: savePoint.y + Math.sin(angle) * distanceMeters,
    }, 0.75);
    const penaltySpot = getOpponentPenaltySpot(goalInfo.scoringTeamId);
    const centralDanger =
      clamp(1 - Math.abs(spillPoint.y - pitch.width / 2) / 10, 0, 1) *
      clamp(1 - distance(spillPoint, penaltySpot) / 15, 0, 1);
    const safeParry = control >= 0.58 && centralDanger <= 0.45;
    return {
      angle,
      distanceMeters,
      spillPoint,
      control,
      centralDanger,
      safeParry,
      label: safeParry ? "safe parry" : centralDanger >= 0.55 ? "danger rebound" : "parry",
      urgency: clamp(
        0.72 +
          metrics.shotPower * 0.14 +
          metrics.closeRange * 0.14 +
          centralDanger * 0.12 -
          control * 0.26,
        safeParry ? 0.42 : 0.58,
        0.92
      ),
    };
  }

  function resolveGoalkeeperSave(goalInfo, previousPosition) {
    const goalkeeper = getGoalkeeperForTeam(goalInfo?.concedingTeamId);
    if (!goalkeeper || !goalInfo?.point) {
      return null;
    }
    const goalSign = getGoalDirectionSign(goalInfo.side);
    const savePoint = clampToPitch({
      x: goalInfo.point.x - goalSign * 0.9,
      y: goalInfo.point.y,
    }, 0.25);
    const shotStart = state.ball.startPosition ?? previousPosition;
    const shotDistance = distance(shotStart, goalInfo.point);
    const shotSpeed = Math.max(state.ball.currentSpeed || state.ball.launchSpeed || state.ball.speed || 0, 0.1);
    const shotPower = clamp((shotSpeed - 9.5) / 17, 0, 1);
    const shotQuality = clamp(state.ball.executionQuality ?? 0.72, 0.35, 0.98);
    const cornerReach = clamp(Math.abs(goalInfo.point.y - pitch.width / 2) / (7.32 / 2), 0, 1.15);
    const closeRange = clamp((23 - shotDistance) / 18, 0, 1);
    const context = getPlayerDecisionContext(goalkeeper);
    const distanceToSave = distance(goalkeeper.position, savePoint);
    const diveReach =
      1.35 +
      context.profile.perception * 0.45 +
      context.profile.decisionSpeed * 0.34 +
      context.profile.composure * 0.26 +
      clamp(context.maxSpeed / 8, 0, 1) * 0.42;
    const movementDistance = Math.max(distanceToSave - diveReach, 0);
    const saveTime = computeTimeToCoverDistance(goalkeeper, movementDistance, savePoint);
    const availableTime = Math.max(state.ball.elapsedTravelTime, 0.05);
    const access = clamp((availableTime - saveTime + 0.18) / 0.82, 0, 1);
    const positioning = clamp(1 - distanceToSave / 9.8, 0, 1);
    const reading =
      context.profile.perception * 0.24 +
      context.profile.decisionSpeed * 0.2 +
      context.profile.decisionQuality * 0.18 +
      context.profile.composure * 0.18 +
      context.profile.technicalSecurity * 0.12 +
      clamp(context.maxSpeed / 8, 0, 1) * 0.08;
    const difficulty =
      shotPower * 0.28 +
      shotQuality * 0.22 +
      cornerReach * 0.36 +
      closeRange * 0.26 +
      (state.ball.flightStyle === "driven" ? 0.08 : 0);
    const saveScore = access * 0.48 + reading * 0.36 + positioning * 0.24 - difficulty * 0.42;
    const catchScore =
      saveScore +
      context.profile.technicalSecurity * 0.2 +
      context.profile.composure * 0.16 -
      shotPower * 0.32 -
      cornerReach * 0.18 -
      closeRange * 0.1;
    const saveThreshold = closeRange > 0.68 ? 0.5 : cornerReach > 0.92 ? 0.48 : 0.38;
    if (saveScore < saveThreshold) {
      return null;
    }
    rotatePlayerBodyToward(goalkeeper, savePoint, 0.9);
    goalkeeper.position = clampToPitch({
      x: lerp(goalkeeper.position.x, savePoint.x, clamp(access * 0.72, 0.22, 0.88)),
      y: lerp(goalkeeper.position.y, savePoint.y, clamp(access * 0.86, 0.3, 0.94)),
    }, 0.8);
    if (catchScore >= 0.52 && shotPower <= 0.72 && closeRange <= 0.74) {
      connectBallToPlayerForNextAction(goalkeeper, savePoint, 0.92);
      clearSecurePossession();
      return {
        kind: "catch",
        goalkeeper,
        point: cloneVector(savePoint),
        saveScore,
      };
    }
    const parrySide = Math.sign(goalInfo.point.y - pitch.width / 2) || (goalkeeper.position.y >= pitch.width / 2 ? 1 : -1);
    const parryDistance = clamp(3.4 + shotPower * 4.2 + cornerReach * 1.2 - catchScore * 0.8, 2.4, 8.6);
    const shouldParryBehindForCorner =
      (cornerReach >= 0.78 && shotPower >= 0.42 && catchScore < 0.48) ||
      (cornerReach >= 0.94 && catchScore < 0.58) ||
      (closeRange >= 0.62 && cornerReach >= 0.72 && catchScore < 0.42);
    if (shouldParryBehindForCorner) {
      clearSecurePossession();
      state.ball.ownerPlayerId = null;
      const displayY = clamp(
        goalInfo.point.y + parrySide * clamp(1.05 + parryDistance * 0.18, 1.05, 2.4),
        0,
        pitch.width
      );
      return {
        kind: "corner",
        goalkeeper,
        point: {
          x: goalInfo.point.x - goalSign * 0.35,
          y: displayY,
        },
        displayPoint: {
          x: goalInfo.point.x - goalSign * 0.35,
          y: displayY,
        },
        restartTeamId: goalInfo.scoringTeamId,
        sideY: displayY <= pitch.width / 2 ? 0 : pitch.width,
        saveScore,
      };
    }
    const parryProfile = getGoalkeeperParryProfile(goalInfo, savePoint, goalkeeper, {
      saveScore,
      catchScore,
      access,
      reading,
      shotPower,
      closeRange,
      cornerReach,
    });
    const preferredSafetyPlayer = parryProfile.safeParry
      ? getPreferredParrySafetyPlayer(goalInfo.concedingTeamId, parryProfile.spillPoint, goalkeeper.id)
      : null;
    const spill = createLooseBallSpill(
      savePoint,
      parryProfile.angle,
      parryProfile.distanceMeters,
      preferredSafetyPlayer?.id ?? null,
      preferredSafetyPlayer ? 0.08 + parryProfile.control * 0.08 : -0.02,
      {
        canClaimPlayer: (player) => player.id !== goalkeeper.id,
        source: parryProfile.safeParry ? "goalkeeper-safe-parry" : "goalkeeper-danger-parry",
        reboundType: parryProfile.label,
        attackingTeamId: goalInfo.scoringTeamId,
        defendingTeamId: goalInfo.concedingTeamId,
        urgency: parryProfile.urgency,
        preferredTeamId: parryProfile.safeParry ? goalInfo.concedingTeamId : goalInfo.scoringTeamId,
      }
    );
    return {
      kind: "parry",
      goalkeeper,
      point: spill.spillPoint,
      winner: spill.winner,
      saveScore,
      saveControl: parryProfile.control,
      label: parryProfile.label,
    };
  }

  function registerGoalFlash(goalInfo) {
    const scoringTeamName = teams[goalInfo.scoringTeamId]?.name ?? "Team";
    state.goalFlash = {
      ...cloneGoalEvent(goalInfo),
      scoringTeamName,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 2600,
    };
  }

  function completeGoalkeeperSave(saveOutcome, completedTravelTime) {
    const savedGoalkeeperPosition = cloneVector(saveOutcome.goalkeeper.position);
    const isCornerRestart = saveOutcome.kind === "corner";
    const savedBallPosition = isCornerRestart
      ? cloneVector(saveOutcome.displayPoint ?? saveOutcome.point)
      : cloneVector(state.ball.position);
    const savedBallTarget = cloneVector(savedBallPosition);
    const savedBallOwnerId = isCornerRestart ? null : state.ball.ownerPlayerId ?? null;
    state.ball.inTransit = false;
    state.ball.height = 0;
    if (state.sequence.isPlaying) {
      state.ball.actionType = null;
      state.ball.initiatorPlayerId = null;
      state.ball.receiverPlayerId = null;
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step) {
        const afterSnapshot = cloneSnapshot(captureSnapshot());
        step.afterSnapshot = afterSnapshot;
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      if (isCornerRestart) {
        logEvent(
          `${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} saves and turns the shot behind for a corner after ${formatTime(completedTravelTime)}.`
        );
      } else {
        const saveAction = saveOutcome.kind === "catch"
          ? "catches"
          : saveOutcome.label === "safe parry"
            ? "saves and pushes away"
            : "saves and parries";
        logEvent(
          `${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} ${saveAction} the shot after ${formatTime(completedTravelTime)}.`
        );
      }
      queueNextSequenceStep();
      return;
    }
    completeLiveActionPlayersBeforeCommit(saveOutcome.point);
    saveOutcome.goalkeeper.position = savedGoalkeeperPosition;
    state.ball.position = savedBallPosition;
    state.ball.target = savedBallTarget;
    state.ball.ownerPlayerId = savedBallOwnerId;
    if (isCornerRestart && state.draftStep) {
      state.draftStep.nextRestartPhase = {
        type: "corner",
        teamId: saveOutcome.restartTeamId,
        label: setPiecePhaseProfiles.corner.label,
        sideY: saveOutcome.sideY,
      };
      state.draftStep.target = cloneVector(saveOutcome.point);
    }
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.receiverPlayerId = null;
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    if (isCornerRestart) {
      logEvent(
        `${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} saves and turns the shot behind for a corner after ${formatTime(completedTravelTime)}.`
      );
    } else {
      const saveAction = saveOutcome.kind === "catch"
        ? "catches"
        : saveOutcome.label === "safe parry"
          ? "saves and pushes away"
          : "saves and parries";
      logEvent(
        `${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} ${saveAction} the shot after ${formatTime(completedTravelTime)}.`
      );
    }
    scheduleAutoPilotContinuation(null, "shot");
  }

  function completeShotGoal(goalInfo, completedTravelTime) {
    registerGoalFlash(goalInfo);
    state.ball.position = cloneVector(goalInfo.displayPoint ?? goalInfo.point);
    state.ball.target = cloneVector(state.ball.position);
    state.ball.height = 0;
    state.ball.inTransit = false;
    if (state.sequence.isPlaying) {
      state.ball.actionType = null;
      state.ball.initiatorPlayerId = null;
      state.ball.receiverPlayerId = null;
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step?.afterSnapshot) {
        applyCommittedSnapshot(step.afterSnapshot);
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      logEvent(
        `GOAL: ${teams[goalInfo.scoringTeamId]?.name ?? "Team"} scores. ${teams[goalInfo.concedingTeamId]?.name ?? "Opponent"} restart with kick-off.`
      );
      queueNextSequenceStep();
      return;
    }
    completeLiveActionPlayersBeforeCommit(goalInfo.point);
    if (state.draftStep) {
      state.draftStep.goal = cloneGoalEvent(goalInfo);
      state.draftStep.target = cloneVector(goalInfo.point);
    }
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.receiverPlayerId = null;
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(
      `GOAL: ${teams[goalInfo.scoringTeamId]?.name ?? "Team"} scores after ${formatTime(completedTravelTime)}. ${teams[goalInfo.concedingTeamId]?.name ?? "Opponent"} restart with kick-off.`
    );
    scheduleAutoPilotContinuation(null, "shot");
  }

  function completeShotOutOfPlay(outInfo, completedTravelTime) {
    const displayPoint = outInfo.displayPoint ?? outInfo.point;
    const restartTeamName = teams[outInfo.restartTeamId]?.name ?? "Defending team";
    state.ball.position = cloneVector(displayPoint);
    state.ball.target = cloneVector(displayPoint);
    state.ball.height = 0;
    state.ball.inTransit = false;
    if (state.sequence.isPlaying) {
      state.ball.actionType = null;
      state.ball.initiatorPlayerId = null;
      state.ball.receiverPlayerId = null;
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step?.afterSnapshot) {
        applyCommittedSnapshot(step.afterSnapshot);
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      logEvent(`Shot misses after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a goal-kick.`);
      queueNextSequenceStep();
      return;
    }
    completeLiveActionPlayersBeforeCommit(outInfo.point);
    if (state.draftStep) {
      state.draftStep.nextRestartPhase = {
        type: "goalKick",
        teamId: outInfo.restartTeamId,
        label: setPiecePhaseProfiles.goalKick.label,
      };
      state.draftStep.target = cloneVector(outInfo.point);
    }
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.receiverPlayerId = null;
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(`Shot misses after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a goal-kick.`);
    scheduleAutoPilotContinuation(null, "shot");
  }

  function completeTouchlineOutOfPlay(outInfo, completedTravelTime) {
    const displayPoint = outInfo.displayPoint ?? outInfo.point;
    const restartTeamName = teams[outInfo.restartTeamId]?.name ?? "Restart team";
    const actionLabel = state.ball.actionType === "shot" ? "Shot" : "Pass";
    state.ball.position = cloneVector(displayPoint);
    state.ball.target = cloneVector(displayPoint);
    state.ball.height = 0;
    state.ball.inTransit = false;
    if (state.sequence.isPlaying) {
      state.ball.actionType = null;
      state.ball.initiatorPlayerId = null;
      state.ball.receiverPlayerId = null;
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step?.afterSnapshot) {
        applyCommittedSnapshot(step.afterSnapshot);
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      logEvent(`${actionLabel} goes out after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a throw-in.`);
      queueNextSequenceStep();
      return;
    }
    completeLiveActionPlayersBeforeCommit(outInfo.point);
    if (state.draftStep) {
      state.draftStep.nextRestartPhase = {
        type: "throwIn",
        teamId: outInfo.restartTeamId,
        label: setPiecePhaseProfiles.throwIn.label,
        point: cloneVector(outInfo.point),
        sideY: outInfo.sideY,
      };
      state.draftStep.target = cloneVector(outInfo.point);
    }
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.receiverPlayerId = null;
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(`${actionLabel} goes out after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a throw-in.`);
    scheduleAutoPilotContinuation(null, outInfo.type);
  }

  return {
    getGoalkeeperForTeam,
    getPreferredParrySafetyPlayer,
    getGoalkeeperParryProfile,
    resolveGoalkeeperSave,
    registerGoalFlash,
    completeGoalkeeperSave,
    completeShotGoal,
    completeShotOutOfPlay,
    completeTouchlineOutOfPlay,
  };
}
