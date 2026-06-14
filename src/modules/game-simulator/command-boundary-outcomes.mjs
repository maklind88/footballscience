export function createGameSimulatorCommandBoundaryOutcomes(deps = {}) {
  const {
    ballRadiusMeters,
    clamp,
    getActionInitiator,
    getGoalDirectionSign,
    getGoalLineX,
    getGoalNetDisplayPoint,
    getOpponentGoalSide,
    getOtherTeamId,
    getPlannedPossessionTeamId,
    getPlayerById,
    isBetweenGoalPosts,
    lerp,
    pitch,
    state,
  } = deps;

  function detectShotGoal(previousPosition, currentPosition) {
    if (state.ball.actionType !== "shot") {
      return null;
    }
    const shooter =
      getPlayerById(state.ball.initiatorPlayerId) ??
      getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId);
    const scoringTeamId = shooter?.team ?? getPlannedPossessionTeamId();
    if (!scoringTeamId) {
      return null;
    }
    const side = getOpponentGoalSide(scoringTeamId);
    const sign = getGoalDirectionSign(side);
    const goalLineX = getGoalLineX(side);
    const previousSideValue = (previousPosition.x - goalLineX) * sign;
    const currentSideValue = (currentPosition.x - goalLineX) * sign;
    const targetSideValue = (state.ball.target.x - goalLineX) * sign;
    const crossedGoalLine =
      previousSideValue < -0.01 &&
      (currentSideValue >= -0.01 || targetSideValue > 0);
    if (!crossedGoalLine) {
      return null;
    }
    const segmentX = currentPosition.x - previousPosition.x;
    const ratio = Math.abs(segmentX) <= 0.001
      ? 1
      : clamp((goalLineX - previousPosition.x) / segmentX, 0, 1);
    const goalY = lerp(previousPosition.y, currentPosition.y, ratio);
    if (!isBetweenGoalPosts(goalY, ballRadiusMeters * 0.85)) {
      return null;
    }
    return {
      scoringTeamId,
      concedingTeamId: getOtherTeamId(scoringTeamId),
      side,
      scoredAt: state.time,
      point: { x: goalLineX, y: goalY },
      displayPoint: getGoalNetDisplayPoint(side, goalY),
    };
  }

  function detectShotOutOfPlay(previousPosition, currentPosition) {
    if (state.ball.actionType !== "shot") {
      return null;
    }
    const shooter =
      getPlayerById(state.ball.initiatorPlayerId) ??
      getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId);
    const shootingTeamId = shooter?.team ?? getPlannedPossessionTeamId();
    if (!shootingTeamId) {
      return null;
    }
    const side = getOpponentGoalSide(shootingTeamId);
    const sign = getGoalDirectionSign(side);
    const goalLineX = getGoalLineX(side);
    const previousSideValue = (previousPosition.x - goalLineX) * sign;
    const currentSideValue = (currentPosition.x - goalLineX) * sign;
    const targetSideValue = (state.ball.target.x - goalLineX) * sign;
    const crossedGoalLine =
      previousSideValue < -0.01 &&
      (currentSideValue >= -0.01 || targetSideValue > 0);
    if (!crossedGoalLine) {
      return null;
    }
    const segmentX = currentPosition.x - previousPosition.x;
    const ratio = Math.abs(segmentX) <= 0.001
      ? 1
      : clamp((goalLineX - previousPosition.x) / segmentX, 0, 1);
    const outY = clamp(lerp(previousPosition.y, currentPosition.y, ratio), 0, pitch.width);
    if (isBetweenGoalPosts(outY, ballRadiusMeters * 0.85)) {
      return null;
    }
    return {
      type: "goalKick",
      shootingTeamId,
      restartTeamId: getOtherTeamId(shootingTeamId),
      side,
      occurredAt: state.time,
      point: { x: goalLineX, y: outY },
      displayPoint: {
        x: goalLineX - sign * 0.45,
        y: outY,
      },
    };
  }

  function detectTouchlineOutOfPlay(previousPosition, currentPosition) {
    const actionType = state.ball.actionType;
    if (actionType !== "pass" && actionType !== "shot") {
      return null;
    }
    const crossedTop =
      previousPosition.y >= 0 &&
      currentPosition.y < 0;
    const crossedBottom =
      previousPosition.y <= pitch.width &&
      currentPosition.y > pitch.width;
    if (!crossedTop && !crossedBottom) {
      return null;
    }
    const touchlineY = crossedTop ? 0 : pitch.width;
    const segmentY = currentPosition.y - previousPosition.y;
    const ratio = Math.abs(segmentY) <= 0.001
      ? 1
      : clamp((touchlineY - previousPosition.y) / segmentY, 0, 1);
    const outX = clamp(lerp(previousPosition.x, currentPosition.x, ratio), 0, pitch.length);
    const initiator =
      getPlayerById(state.ball.initiatorPlayerId) ??
      getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId) ??
      getActionInitiator();
    const lastTouchTeamId = initiator?.team ?? getPlannedPossessionTeamId();
    if (!lastTouchTeamId) {
      return null;
    }
    return {
      type: "throwIn",
      lastTouchTeamId,
      restartTeamId: getOtherTeamId(lastTouchTeamId),
      sideY: touchlineY,
      occurredAt: state.time,
      point: { x: outX, y: touchlineY },
      displayPoint: {
        x: outX,
        y: touchlineY === 0 ? -0.45 : pitch.width + 0.45,
      },
    };
  }

  return {
    detectShotGoal,
    detectShotOutOfPlay,
    detectTouchlineOutOfPlay,
  };
}
