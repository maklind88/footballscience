export function createGameSimulatorCommandSimulationStep(deps = {}) {
  const {
    angleBetween,
    applyBestReceiveBodyAngle,
    applySnapshot,
    ballRadiusMeters,
    buildMovementPath,
    clamp,
    clearBallAction,
    cloneVector,
    completeBallTravelArrival,
    completeDribbleCarry,
    completeGoalkeeperSave,
    completeLooseBallRecoveryAction,
    completeShotGoal,
    completeShotOutOfPlay,
    completeTouchlineOutOfPlay,
    completeTransitOutcome,
    computeReachDistance,
    describeStep,
    detectShotGoal,
    detectShotOutOfPlay,
    detectTouchlineOutOfPlay,
    distance,
    finishSequencePlayback,
    getActionOrigin,
    getActionSpeed,
    getBallFlightControlFactor,
    getBallTravelPoint,
    getDefensiveAutoV2Intent,
    getDefensiveAutopilotFocusPoint,
    getDribbleCarryPathPoint,
    getLiveDefensiveDribblePressTarget,
    getLiveDribbleSpeed,
    getMovementPathPoint,
    getOffensiveAutoV2Intent,
    getOffensiveAutopilotFocusPoint,
    getPlayerBallControlPoint,
    getPlayerById,
    isDefensiveAutopilotPlayer,
    isDefensiveDribblePresser,
    isOffensiveAutopilotPlayer,
    logEvent,
    moveDefensiveAutoV2Player,
    moveOffensiveAutoV2Player,
    moveTowards,
    resolveDribbleDefensiveChallenge,
    resolveGoalkeeperSave,
    resolvePassTransitInterception,
    resolveShotBlockCommitment,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    rotatePlayerBodyTowardAngle,
    setDribbleCarryPathForBall,
    startRecordedAction,
    state,
    ui,
    updateBallFlightHeight,
  } = deps;

  function updateBall(dt) {
    if (!state.ball.inTransit) {
      return;
    }
    if (state.ball.actionType === "dribble") {
      updateDribble(dt);
      return;
    }
    if (state.ball.actionType === "recovery") {
      updateLooseBallRecovery(dt);
      return;
    }
    const previousPosition = cloneVector(state.ball.position);
    const speedBefore = Math.max(
      state.ball.currentSpeed || state.ball.launchSpeed || getActionSpeed(),
      0.01
    );
    const speedAfter = Math.max(
      state.ball.finalSpeed,
      speedBefore - state.ball.deceleration * dt
    );
    const moveDistance = Math.max(((speedBefore + speedAfter) * 0.5) * dt, 0);
    state.ball.trackDistanceCovered = clamp(
      state.ball.trackDistanceCovered + moveDistance,
      0,
      Math.max(state.ball.trackDistanceTotal, 0)
    );
    const progress = state.ball.trackDistanceTotal <= 0.01
      ? 1
      : state.ball.trackDistanceCovered / state.ball.trackDistanceTotal;
    state.ball.position = getBallTravelPoint(progress);
    state.ball.currentSpeed = speedAfter;
    state.ball.spinAngle += state.ball.spinRate * dt;
    state.ball.elapsedTravelTime += dt;
    updateBallFlightHeight();
    const transitOutcome =
      resolveShotBlockCommitment(previousPosition) ??
      resolvePassTransitInterception(previousPosition, state.ball.actionType);
    if (transitOutcome) {
      completeTransitOutcome(transitOutcome, state.ball.actionType);
      return;
    }
    const goalInfo = detectShotGoal(previousPosition, state.ball.position);
    if (goalInfo) {
      const saveOutcome = resolveGoalkeeperSave(goalInfo, previousPosition);
      if (saveOutcome) {
        completeGoalkeeperSave(saveOutcome, state.ball.elapsedTravelTime);
        return;
      }
      completeShotGoal(goalInfo, state.ball.elapsedTravelTime);
      return;
    }
    const shotOutInfo = detectShotOutOfPlay(previousPosition, state.ball.position);
    if (shotOutInfo) {
      completeShotOutOfPlay(shotOutInfo, state.ball.elapsedTravelTime);
      return;
    }
    const touchlineOutInfo = detectTouchlineOutOfPlay(previousPosition, state.ball.position);
    if (touchlineOutInfo) {
      completeTouchlineOutOfPlay(touchlineOutInfo, state.ball.elapsedTravelTime);
      return;
    }
    const receiver = state.ball.actionType === "pass" && state.ball.receiverPlayerId
      ? getPlayerById(state.ball.receiverPlayerId)
      : null;
    const receiverControlPoint = receiver ? getPlayerBallControlPoint(receiver) : null;
    const reachedReceiverControlZone =
      !!receiverControlPoint &&
      distance(state.ball.position, receiverControlPoint) <= state.ball.controlRadius &&
      getBallFlightControlFactor(state.ball.actionType) >= 0.6;
    const reachedTravelEnd =
      state.ball.trackDistanceTotal > 0 &&
      state.ball.trackDistanceCovered >= Math.max(state.ball.trackDistanceTotal - 0.01, 0);
    if (distance(state.ball.position, state.ball.target) <= 0.01 || reachedReceiverControlZone || reachedTravelEnd) {
      completeBallTravelArrival({
        previousPosition,
        receiverControlPoint,
        reachedReceiverControlZone,
        reachedTravelEnd,
      });
    }
  }

  function updateDribble(dt) {
    const carrier = getPlayerById(state.ball.carrierPlayerId);
    if (!carrier) {
      clearBallAction();
      state.isRunning = false;
      ui.playPauseButton.textContent = "Start";
      return;
    }
    if (!state.ball.dribblePath) {
      setDribbleCarryPathForBall(carrier, getActionOrigin(carrier), state.ball.target);
    }
    const currentCarrySpeed = getLiveDribbleSpeed(carrier, state.ball.target);
    const previousPosition = cloneVector(carrier.position);
    state.ball.trackDistanceCovered = clamp(
      (state.ball.trackDistanceCovered ?? 0) + currentCarrySpeed * dt,
      0,
      Math.max(state.ball.trackDistanceTotal, 0)
    );
    carrier.position = getDribbleCarryPathPoint(
      state.ball.dribblePath,
      state.ball.trackDistanceCovered
    );
    if (distance(previousPosition, carrier.position) > 0.006) {
      rotatePlayerBodyAlongMovement(carrier, previousPosition, carrier.position, 0.56);
    } else {
      rotatePlayerBodyToward(carrier, state.ball.target, 0.28);
    }
    state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
    state.ball.currentSpeed = currentCarrySpeed;
    state.ball.height = 0;
    state.ball.elapsedTravelTime += dt;
    state.ball.ownerPlayerId = carrier.id;
    if (
      state.ball.trackDistanceCovered >= Math.max(state.ball.trackDistanceTotal - 0.03, 0) ||
      distance(carrier.position, state.ball.target) <= 0.08
    ) {
      const completedTravelTime = state.ball.elapsedTravelTime;
      carrier.position = cloneVector(state.ball.target);
      state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
      completeDribbleCarry(carrier, completedTravelTime);
    }
  }

  function updateLooseBallRecovery(dt) {
    const carrier = getPlayerById(state.ball.carrierPlayerId);
    if (!carrier) {
      clearBallAction();
      state.isRunning = false;
      ui.playPauseButton.textContent = "Start";
      return;
    }
    state.ball.elapsedTravelTime += dt;
    state.ball.currentSpeed = 0;
    state.ball.height = 0;
    state.ball.ownerPlayerId = null;
    const recoveryDuration = Math.max(state.ball.recoveryDuration ?? 0, 0.05);
    const controlGap = distance(getPlayerBallControlPoint(carrier), state.ball.position);
    if (state.ball.elapsedTravelTime < recoveryDuration && controlGap > ballRadiusMeters * 1.1) {
      return;
    }
    completeLooseBallRecoveryAction(carrier);
  }

  function updateActionPlayers(targetMap, actionMeta) {
    if (!targetMap || !actionMeta) {
      return;
    }
    const elapsed = state.ball.elapsedTravelTime;
    const defensiveFocusPoint = getDefensiveAutopilotFocusPoint(actionMeta);
    const offensiveFocusPoint = getOffensiveAutopilotFocusPoint(actionMeta);
    const passIncomingPoint =
      actionMeta.actionType === "pass"
        ? actionMeta.beforeSnapshot?.ball?.position ?? state.ball.startPosition
        : null;
    state.players.forEach((player) => {
      if (actionMeta.actionType === "dribble" && player.id === actionMeta.carrierPlayerId) {
        return;
      }
      let targetPosition = targetMap.get(player.id);
      if (!targetPosition) {
        return;
      }
      const isPassReceiver = actionMeta.actionType === "pass" && player.id === actionMeta.receiverPlayerId;
      const isDefensiveAutopilotRunner = isDefensiveAutopilotPlayer(player, actionMeta);
      const isOffensiveAutopilotRunner = isOffensiveAutopilotPlayer(player, actionMeta);
      const isDribbleAutopilotPresser = isDefensiveDribblePresser(player, actionMeta);
      if (isDribbleAutopilotPresser) {
        targetPosition = getLiveDefensiveDribblePressTarget(player, actionMeta, targetPosition);
      }
      if (isDefensiveAutopilotRunner) {
        const intent = getDefensiveAutoV2Intent(player, actionMeta, targetPosition);
        moveDefensiveAutoV2Player(
          player,
          targetPosition,
          actionMeta,
          intent,
          elapsed,
          state.ball.inTransit ? state.ball.position : defensiveFocusPoint
        );
        return;
      }
      if (isOffensiveAutopilotRunner && !isPassReceiver) {
        const intent = getOffensiveAutoV2Intent(player, actionMeta, targetPosition);
        moveOffensiveAutoV2Player(
          player,
          targetPosition,
          actionMeta,
          intent,
          elapsed,
          state.ball.inTransit ? state.ball.position : offensiveFocusPoint
        );
        return;
      }
      const origin = getActionOrigin(player);
      const movementPath = isPassReceiver
        ? { start: origin, end: targetPosition, waypoint: null, totalDistance: distance(origin, targetPosition) }
        : buildMovementPath(player, origin, targetPosition, actionMeta);
      const fullDistance = movementPath.totalDistance;
      if (fullDistance <= 0.001) {
        player.position = cloneVector(targetPosition);
        if (isPassReceiver) {
          applyBestReceiveBodyAngle(player, passIncomingPoint, 0.22);
        } else if (isOffensiveAutopilotRunner && offensiveFocusPoint) {
          rotatePlayerBodyToward(player, state.ball.inTransit ? state.ball.position : offensiveFocusPoint, 0.82);
        } else if (isDefensiveAutopilotRunner && defensiveFocusPoint) {
          rotatePlayerBodyToward(player, defensiveFocusPoint, 0.92);
        }
        return;
      }
      const previousPosition = cloneVector(player.position);
      const reachableDistance = Math.min(
        fullDistance,
        computeReachDistance(player, elapsed, targetPosition)
      );
      const nextProgress = Math.max(player.movementProgress ?? 0, reachableDistance);
      player.movementProgress = nextProgress;
      player.position = getMovementPathPoint(movementPath, nextProgress);
      const movementDistance = distance(previousPosition, player.position);
      const hasArrived = nextProgress >= fullDistance - 0.02 || distance(player.position, targetPosition) <= 0.08;
      if (isPassReceiver) {
        applyBestReceiveBodyAngle(player, passIncomingPoint, 0.2);
      } else if (isDribbleAutopilotPresser) {
        rotatePlayerBodyToward(player, state.ball.position, 0.72);
      } else if (isOffensiveAutopilotRunner && offensiveFocusPoint && hasArrived) {
        rotatePlayerBodyToward(player, state.ball.inTransit ? state.ball.position : offensiveFocusPoint, 0.78);
      } else if (isDefensiveAutopilotRunner && defensiveFocusPoint && hasArrived) {
        rotatePlayerBodyToward(player, defensiveFocusPoint, 0.9);
      } else if (movementDistance > 0.006) {
        rotatePlayerBodyAlongMovement(player, previousPosition, player.position, 0.42);
      } else if (distance(player.position, targetPosition) > 0.02) {
        rotatePlayerBodyTowardAngle(
          player,
          angleBetween(player.position, targetPosition),
          0.18,
          0.08
        );
      }
    });
  }

  function updateSequenceActionPlayers() {
    if (!state.sequence.isPlaying || state.sequence.phase !== "action") {
      return;
    }
    const step = state.sequence.steps[state.sequence.playbackIndex];
    if (!step || !state.sequence.actionTargets) {
      return;
    }
    updateActionPlayers(state.sequence.actionTargets, step);
  }

  function updateLiveActionPlayers() {
    if (!state.isRunning || !state.activeActionTargets || !state.draftStep) {
      return;
    }
    updateActionPlayers(state.activeActionTargets, state.draftStep);
  }

  function updateSequenceTransition(dt) {
    const plan = state.sequence.transition;
    if (!plan) {
      return;
    }
    plan.elapsed = Math.min(plan.elapsed + dt, plan.duration);
    state.players.forEach((player) => {
      const target = plan.playerTargets.get(player.id);
      if (!target) {
        return;
      }
      const fullDistance = distance(target.start, target.end);
      const movementPath = buildMovementPath(player, target.start, target.end);
      if (movementPath.totalDistance <= 0.001) {
        player.position = cloneVector(target.end);
        player.movementProgress = 0;
        return;
      }
      const reachableDistance = Math.min(
        movementPath.totalDistance,
        computeReachDistance(player, plan.elapsed, target.end)
      );
      const nextProgress = Math.max(player.movementProgress ?? 0, reachableDistance);
      player.movementProgress = nextProgress;
      player.position = getMovementPathPoint(movementPath, nextProgress);
      if (distance(player.position, target.end) > 0.02) {
        rotatePlayerBodyToward(player, target.end, 0.28);
      }
    });
    if (plan.ballOwnerPlayerId) {
      const owner = getPlayerById(plan.ballOwnerPlayerId);
      if (owner) {
        state.ball.ownerPlayerId = owner.id;
        state.ball.position = cloneVector(getPlayerBallControlPoint(owner));
      }
    } else {
      const fullDistance = distance(plan.ballStart, plan.ballEnd);
      const progress =
        plan.duration <= 0.001 ? 1 : Math.min(1, plan.elapsed / plan.duration);
      state.ball.ownerPlayerId = null;
      state.ball.position = moveTowards(plan.ballStart, plan.ballEnd, fullDistance * progress);
    }
    state.ball.startPosition = cloneVector(state.ball.position);
    state.ball.target = cloneVector(state.ball.position);
    state.ball.inTransit = false;
    state.ball.elapsedTravelTime = 0;
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.carrierPlayerId = null;
    if (plan.elapsed >= plan.duration - 0.0001) {
      applySnapshot(plan.targetSnapshot);
      state.sequence.transition = null;
      state.sequence.phase = null;
      const nextStep = state.sequence.steps[state.sequence.playbackIndex];
      if (nextStep) {
        startRecordedAction(nextStep);
        logEvent(`Playing ${describeStep(nextStep, state.sequence.playbackIndex).title.toLowerCase()}.`);
      } else {
        finishSequencePlayback();
      }
    }
  }

  function stepSimulation(realDt) {
    const dt = realDt * state.playbackSpeed;
    if (state.sequence.isPlaying && state.sequence.phase === "transition") {
      state.time += dt;
      updateSequenceTransition(dt);
      return;
    }
    if (!state.ball.inTransit) {
      return;
    }
    state.time += dt;
    updateBall(dt);
    if (state.sequence.isPlaying && state.sequence.phase === "action") {
      updateSequenceActionPlayers();
      resolveDribbleDefensiveChallenge();
      return;
    }
    if (state.isRunning && state.activeActionTargets) {
      updateLiveActionPlayers();
      resolveDribbleDefensiveChallenge();
    }
  }

  return {
    updateBall,
    updateDribble,
    updateLooseBallRecovery,
    updateActionPlayers,
    updateSequenceActionPlayers,
    updateLiveActionPlayers,
    updateSequenceTransition,
    stepSimulation,
  };
}
