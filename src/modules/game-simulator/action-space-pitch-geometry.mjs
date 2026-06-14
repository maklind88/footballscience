export function createGameSimulatorActionSpacePitchGeometry(deps = {}) {
  const {
    clamp,
    clampToPitch,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getBallOwner,
    getPlannedPossessionTeamId,
    getPlayerBallControlPoint,
    pitch,
    state,
    vec,
  } = deps;

  function getOpponentGoalSide(teamId) {
    return teamId === "home" ? "right" : "left";
  }

  function getGoalLineX(side) {
    return side === "right" ? pitch.length : 0;
  }

  function getGoalDirectionSign(side) {
    return side === "right" ? 1 : -1;
  }

  function isBetweenGoalPosts(y, margin = 0) {
    const halfGoalWidth = 7.32 / 2;
    return y >= pitch.width / 2 - halfGoalWidth - margin &&
      y <= pitch.width / 2 + halfGoalWidth + margin;
  }

  function getGoalNetDisplayPoint(side, y) {
    return {
      x: side === "right" ? pitch.length - 0.55 : 0.55,
      y: clamp(y, pitch.width / 2 - 3.4, pitch.width / 2 + 3.4),
    };
  }

  function resolveShotTarget(targetPoint, initiator = null) {
    const teamId =
      initiator?.team ??
      getPlannedPossessionTeamId() ??
      getBallOwner()?.team ??
      (targetPoint.x >= pitch.length / 2 ? "home" : "away");
    const side = getOpponentGoalSide(teamId);
    const sign = getGoalDirectionSign(side);
    const goalLineX = getGoalLineX(side);
    const nearGoalLine =
      side === "right"
        ? targetPoint.x >= pitch.length - 8
        : targetPoint.x <= 8;
    if (!nearGoalLine) {
      return clampToPitch(targetPoint, 0);
    }
    return {
      x: goalLineX + sign * 2.6,
      y: clamp(targetPoint.y, 0, pitch.width),
    };
  }

  function getOwnGoalCenter(teamId) {
    return vec(teamId === "home" ? 0 : pitch.length, pitch.width / 2);
  }

  function getOpponentPenaltySpot(teamId) {
    return vec(teamId === "home" ? pitch.length - 11 : 11, pitch.width / 2);
  }

  function getSecondLastOpponentLineX(attackingTeamId) {
    const opponentXs = state.players
      .filter((player) => player.team !== attackingTeamId)
      .map((player) => player.position.x)
      .sort((a, b) => attackingTeamId === "home" ? b - a : a - b);
    if (opponentXs.length < 2) {
      return null;
    }
    return opponentXs[1];
  }

  function getOffsideInfo(receiver, passStartPoint) {
    if (!receiver || !passStartPoint) {
      return { isOffside: false, lineX: null, reason: null };
    }
    const teamId = receiver.team;
    const attackSign = getAttackDirectionSign(teamId);
    const receiverPoint = getPlayerBallControlPoint(receiver);
    const receiverDepth = getAttackingDepth(receiverPoint, teamId);
    const lineX = getSecondLastOpponentLineX(teamId);
    if (lineX === null || receiverDepth <= pitch.length / 2) {
      return { isOffside: false, lineX, reason: null };
    }
    const offsideTolerance = 0.25;
    const beyondBall = (receiverPoint.x - passStartPoint.x) * attackSign > offsideTolerance;
    const beyondSecondLast = (receiverPoint.x - lineX) * attackSign > offsideTolerance;
    const isOffside = beyondBall && beyondSecondLast;
    return {
      isOffside,
      lineX,
      receiverPoint,
      reason: isOffside
        ? `${receiver.shortLabel} ${receiver.role} is beyond the ball and the second-last defender.`
        : null,
    };
  }

  function isPassReceiverOffside(receiver, passStartPoint = state.ball.position) {
    return getOffsideInfo(receiver, passStartPoint).isOffside;
  }

  function isWideChannel(point) {
    return point.y <= 14 || point.y >= pitch.width - 14;
  }

  function isBylineZone(point, teamId) {
    return teamId === "home" ? point.x >= pitch.length - 8 : point.x <= 8;
  }

  function isInsideOpponentBox(point, teamId) {
    if (teamId === "home") {
      return point.x >= pitch.length - 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
    }
    return point.x <= 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
  }

  function isInsideOwnBox(point, teamId) {
    if (teamId === "home") {
      return point.x <= 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
    }
    return point.x >= pitch.length - 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
  }

  function isCutbackTarget(point, teamId) {
    const penaltySpot = getOpponentPenaltySpot(teamId);
    return distance(point, penaltySpot) <= 10.5;
  }

  function isGoalkeeper(player) {
    return /goalkeeper/i.test(player?.role ?? "") || player?.shortLabel === "GK";
  }

  return {
    getOpponentGoalSide,
    getGoalLineX,
    getGoalDirectionSign,
    isBetweenGoalPosts,
    getGoalNetDisplayPoint,
    resolveShotTarget,
    getOwnGoalCenter,
    getOpponentPenaltySpot,
    getSecondLastOpponentLineX,
    getOffsideInfo,
    isPassReceiverOffside,
    isWideChannel,
    isBylineZone,
    isInsideOpponentBox,
    isInsideOwnBox,
    isCutbackTarget,
    isGoalkeeper,
  };
}
