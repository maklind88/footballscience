export function createGameSimulatorBallResolutionDribbleChallenges(deps = {}) {
  const {
    angleBetween,
    applyCommittedSnapshot,
    captureSnapshot,
    clamp,
    cloneSnapshot,
    cloneVector,
    completeLiveActionPlayersBeforeCommit,
    computeTimeToCoverDistance,
    connectBallToPlayerForNextAction,
    distance,
    finalizeCurrentActionStep,
    formatTime,
    getBallDuelScore,
    getBallTravelProgress,
    getDefensiveAggressionPreset,
    getLiveDribbleSpeed,
    getPlayerById,
    getPlayerDecisionContext,
    getSecurePossessionContext,
    isGoalkeeper,
    isInsideOpponentBox,
    logEvent,
    normalizeAngle,
    playerRadiusMeters,
    projectPointOnSegmentWithRatio,
    queueNextSequenceStep,
    scheduleAutoPilotContinuation,
    setPiecePhaseProfiles,
    clearSecurePossession,
    setSecurePossessionAfterBallWin,
    state,
    teams,
    ui,
  } = deps;

  function getDribbleTackleCandidate(carrier) {
    if (!carrier || state.ball.actionType !== "dribble" || state.ball.elapsedTravelTime < 0.28) {
      return null;
    }

    const startPoint = state.ball.startPosition;
    const targetPoint = state.ball.target;
    const totalLaneDistance = distance(startPoint, targetPoint);
    if (totalLaneDistance <= 0.25) {
      return null;
    }

    const ballProgress = getBallTravelProgress();
    const currentCarrySpeed = Math.max(state.ball.currentSpeed || getLiveDribbleSpeed(carrier, targetPoint), 0.1);
    const carrierContext = getPlayerDecisionContext(carrier);
    const aggression = getDefensiveAggressionPreset();
    const baseCarrierControlScore =
      getBallDuelScore(carrier, state.ball.position) +
      carrierContext.profile.pressResistance * 0.2 +
      carrierContext.profile.technicalSecurity * 0.15 +
      carrierContext.profile.composure * 0.12 +
      clamp(currentCarrySpeed / 8.5, 0, 1) * 0.07;
    let bestCandidate = null;

    state.players.forEach((player) => {
      if (player.team === carrier.team || player.id === carrier.id || isGoalkeeper(player)) {
        return;
      }

      const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
      const laneGap = distance(player.position, projection.point);
      const bodyGap = distance(player.position, carrier.position);
      const ballGap = distance(player.position, state.ball.position);
      const defenderContext = getPlayerDecisionContext(player);
      const tackleReach = clamp(
        (1.12 +
          defenderContext.profile.perception * 0.22 +
          defenderContext.profile.decisionSpeed * 0.2 +
          defenderContext.profile.tacticalDiscipline * 0.18) *
          aggression.reachMultiplier,
        1.12,
        2.05
      );
      const bodyContactScore = clamp(1 - (bodyGap - 1.35) / (1.35 * aggression.contactWindow), 0, 1);
      const ballContactScore = clamp(1 - (ballGap - 0.75) / (1.75 * aggression.contactWindow), 0, 1);
      const laneProgressWindow =
        projection.ratio >= ballProgress - aggression.laneBehindWindow &&
        projection.ratio <= ballProgress + aggression.laneAheadWindow;
      const carrierTimeToLane = distance(carrier.position, projection.point) / currentCarrySpeed;
      const defenderTimeToLane = computeTimeToCoverDistance(
        player,
        distance(player.position, projection.point),
        projection.point
      );
      const etaScore = laneProgressWindow
        ? clamp(1 - Math.abs(defenderTimeToLane - carrierTimeToLane) / aggression.etaTolerance, 0, 1)
        : 0;
      const laneScore = laneProgressWindow
        ? clamp(1 - laneGap / tackleReach, 0, 1) * etaScore
        : 0;
      const closeEnoughForTackle =
        (bodyGap <= playerRadiusMeters * 1.95 * aggression.contactWindow &&
          ballGap <= state.ball.controlRadius + 1.35 * aggression.contactWindow) ||
        laneScore >= aggression.laneScoreThreshold;
      if (!closeEnoughForTackle) {
        return;
      }

      const approachAngle = angleBetween(player.position, state.ball.position);
      const carrierCarryAngle = angleBetween(carrier.position, targetPoint);
      const frontOrSidePressure = clamp(
        1 - Math.max(0, Math.cos(normalizeAngle(approachAngle - carrierCarryAngle))) * 0.55,
        0.35,
        1
      );
      const defenderScore =
        getBallDuelScore(player, state.ball.position) +
        defenderContext.profile.tacticalDiscipline * 0.13 +
        defenderContext.profile.decisionSpeed * 0.1 +
        bodyContactScore * 0.28 +
        ballContactScore * 0.2 +
        laneScore * 0.34 +
        etaScore * 0.1 +
        frontOrSidePressure * 0.08 +
        aggression.scoreBonus;
      const secureContext = getSecurePossessionContext(carrier, player);
      const secureProtection = secureContext?.protectionRatio ?? 0;
      const adjustedCarrierControlScore =
        baseCarrierControlScore +
        secureProtection * 0.36 +
        clamp(currentCarrySpeed / 5.5, 0, 1) * secureProtection * 0.06;
      const adjustedDefenderScore = defenderScore - secureProtection * 0.2;
      const margin = adjustedDefenderScore - adjustedCarrierControlScore;
      const requiredMargin = aggression.marginThreshold + secureProtection * 0.22;
      const requiredContestedMargin = aggression.contestedMargin + secureProtection * 0.14;
      const decisiveContact =
        bodyContactScore >= 0.58 + secureProtection * 0.18 &&
        ballContactScore >= 0.42 + secureProtection * 0.18;
      const decisiveLaneTiming = laneScore >= 0.62 + secureProtection * 0.18;
      if (
        margin < requiredMargin &&
        !(margin >= requiredContestedMargin && (decisiveContact || decisiveLaneTiming))
      ) {
        return;
      }

      const candidate = {
        player,
        point: cloneVector(state.ball.position),
        bodyGap,
        ballGap,
        laneGap,
        laneScore,
        etaScore,
        score: adjustedDefenderScore + Math.max(bodyContactScore, laneScore) * 0.16 - secureProtection * 0.18,
      };
      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    });

    return bestCandidate;
  }

  function getDribbleFoulCandidate(carrier) {
    if (!carrier || state.ball.actionType !== "dribble" || state.ball.elapsedTravelTime < 0.34) {
      return null;
    }

    const startPoint = state.ball.startPosition;
    const targetPoint = state.ball.target;
    const totalLaneDistance = distance(startPoint, targetPoint);
    if (totalLaneDistance <= 0.25) {
      return null;
    }

    const ballProgress = getBallTravelProgress();
    const currentCarrySpeed = Math.max(state.ball.currentSpeed || getLiveDribbleSpeed(carrier, targetPoint), 0.1);
    const aggression = getDefensiveAggressionPreset();
    const aggressionFoulRisk =
      state.defensiveAggressionPreset === "aggressive"
        ? 0.13
        : state.defensiveAggressionPreset === "conservative"
          ? -0.08
          : 0.02;
    let bestCandidate = null;

    state.players.forEach((player) => {
      if (player.team === carrier.team || player.id === carrier.id || isGoalkeeper(player)) {
        return;
      }

      const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
      const bodyGap = distance(player.position, carrier.position);
      const ballGap = distance(player.position, state.ball.position);
      const laneGap = distance(player.position, projection.point);
      const defenderContext = getPlayerDecisionContext(player);
      const bodyContactScore = clamp(1 - (bodyGap - 1.25) / (1.4 * aggression.contactWindow), 0, 1);
      const ballContactScore = clamp(1 - (ballGap - 0.65) / (1.7 * aggression.contactWindow), 0, 1);
      const laneProgressWindow =
        projection.ratio >= ballProgress - aggression.laneBehindWindow * 1.25 &&
        projection.ratio <= ballProgress + aggression.laneAheadWindow * 0.75;
      const carrierTimeToLane = distance(carrier.position, projection.point) / currentCarrySpeed;
      const defenderTimeToLane = computeTimeToCoverDistance(
        player,
        distance(player.position, projection.point),
        projection.point
      );
      const lateScore = laneProgressWindow
        ? clamp((defenderTimeToLane - carrierTimeToLane + 0.18) / 0.62, 0, 1)
        : 0;
      const approachAngle = angleBetween(player.position, state.ball.position);
      const carrierCarryAngle = angleBetween(carrier.position, targetPoint);
      const behindScore = clamp(Math.cos(normalizeAngle(approachAngle - carrierCarryAngle)), 0, 1);
      const carelessContact =
        bodyContactScore >= 0.58 &&
        ballContactScore <= 0.42 &&
        (behindScore >= 0.38 || lateScore >= 0.28 || laneGap <= playerRadiusMeters * 1.55);
      if (!carelessContact) {
        return;
      }

      const foulScore =
        bodyContactScore * 0.4 +
        (1 - ballContactScore) * 0.24 +
        lateScore * 0.22 +
        behindScore * 0.18 +
        aggressionFoulRisk -
        defenderContext.profile.tacticalDiscipline * 0.13 -
        defenderContext.profile.decisionQuality * 0.07;
      const isPenalty = isInsideOpponentBox(state.ball.position, carrier.team);
      const threshold = isPenalty ? 0.74 : 0.66;
      if (foulScore < threshold) {
        return;
      }

      const candidate = {
        player,
        fouledPlayer: carrier,
        point: cloneVector(state.ball.position),
        restartType: isPenalty ? "penalty" : "freeKick",
        score: foulScore,
        bodyGap,
        ballGap,
        lateScore,
        behindScore,
      };
      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    });

    return bestCandidate;
  }

  function completeDribbleFoulRestart(foul, completedTravelTime) {
    const restartTeamName = teams[foul.fouledPlayer.team]?.name ?? "Attacking team";
    const foulTypeLabel = foul.restartType === "penalty" ? "penalty" : "free-kick";
    state.ball.inTransit = false;
    state.ball.height = 0;
    state.ball.position = cloneVector(foul.point);
    state.ball.target = cloneVector(foul.point);
    state.ball.ownerPlayerId = null;
    clearSecurePossession();

    if (state.sequence.isPlaying) {
      state.ball.actionType = null;
      state.ball.initiatorPlayerId = null;
      state.ball.carrierPlayerId = null;
      state.ball.receiverPlayerId = null;
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step?.afterSnapshot) {
        applyCommittedSnapshot(step.afterSnapshot);
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      logEvent(
        `${foul.player.shortLabel} ${foul.player.role} fouls ${foul.fouledPlayer.shortLabel} ${foul.fouledPlayer.role}. ${restartTeamName} restart with a ${foulTypeLabel}.`
      );
      queueNextSequenceStep();
      return;
    }

    completeLiveActionPlayersBeforeCommit(foul.point);
    if (state.draftStep) {
      state.draftStep.nextRestartPhase = {
        type: foul.restartType,
        teamId: foul.fouledPlayer.team,
        label: setPiecePhaseProfiles[foul.restartType].label,
        point: foul.restartType === "freeKick" ? cloneVector(foul.point) : null,
      };
      state.draftStep.target = cloneVector(foul.point);
    }
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.carrierPlayerId = null;
    state.ball.receiverPlayerId = null;
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(
      `${foul.player.shortLabel} ${foul.player.role} fouls ${foul.fouledPlayer.shortLabel} ${foul.fouledPlayer.role} after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a ${foulTypeLabel}.`
    );
    scheduleAutoPilotContinuation(null, "dribble");
  }

  function resolveDribbleDefensiveChallenge() {
    const carrier = getPlayerById(state.ball.carrierPlayerId);
    const candidate = getDribbleTackleCandidate(carrier);
    if (!candidate) {
      const foul = getDribbleFoulCandidate(carrier);
      if (foul) {
        completeDribbleFoulRestart(foul, state.ball.elapsedTravelTime);
        return true;
      }
      return false;
    }

    state.ball.inTransit = false;
    connectBallToPlayerForNextAction(candidate.player, candidate.point, 0.7);
    setSecurePossessionAfterBallWin(candidate.player, carrier, candidate.point, "tackle");
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.carrierPlayerId = null;
    state.ball.receiverPlayerId = null;

    if (state.sequence.isPlaying) {
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step) {
        step.afterSnapshot = cloneSnapshot(captureSnapshot());
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      logEvent(
        `${candidate.player.shortLabel} ${candidate.player.role} wins the ball with a tackle on ${carrier.shortLabel} ${carrier.role}.`
      );
      queueNextSequenceStep();
      return true;
    }

    completeLiveActionPlayersBeforeCommit(state.ball.position);
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(
      `${candidate.player.shortLabel} ${candidate.player.role} wins the ball with a tackle on ${carrier.shortLabel} ${carrier.role}.`
    );
    scheduleAutoPilotContinuation();
    return true;
  }

  return {
    getDribbleTackleCandidate,
    getDribbleFoulCandidate,
    completeDribbleFoulRestart,
    resolveDribbleDefensiveChallenge,
  };
}
