export function createGameSimulatorBallResolutionSecurePossession(deps = {}) {
  const {
    angleBetween,
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getOffensiveRoleKey,
    getPlayerBallControlPoint,
    getPlayerDecisionContext,
    getPlayerPositionForControlPoint,
    getPlayerPressureLoad,
    getTeamAttackStyleKey,
    isGoalkeeper,
    isTransitionAttackStyle,
    lerp,
    normalize,
    pitch,
    state,
    teams,
  } = deps;

  function clearSecurePossession() {
    state.ball.securePossession = null;
  }

  function getBallWinEscapeTouch(winner, loser, point = state.ball.position, reason = "tackle") {
    if (!winner || !loser || winner.team === loser.team) {
      return null;
    }

    const contestPoint = clampToPitch(point ?? getPlayerBallControlPoint(winner), 1.5);
    const winnerContext = getPlayerDecisionContext(winner);
    const roleKey = getOffensiveRoleKey(winner, teams[winner.team]?.formation);
    const attackSign = getAttackDirectionSign(winner.team);
    const awayFromLoser = normalize(loser.position ?? contestPoint, contestPoint);
    const forwardVector = { x: attackSign, y: 0 };
    const insideTarget = {
      x: contestPoint.x + attackSign * 2.8,
      y: pitch.width / 2,
    };
    const insideVector = normalize(contestPoint, insideTarget);
    const isRestOrBack = roleKey === "rest" || roleKey === "wideBack" || roleKey === "gk";
    const pressure = getPlayerPressureLoad(winner, contestPoint);
    const security =
      winnerContext.profile.pressResistance * 0.34 +
      winnerContext.profile.composure * 0.24 +
      winnerContext.profile.technicalSecurity * 0.22 +
      winnerContext.profile.decisionQuality * 0.12;
    const counterBias = isTransitionAttackStyle(getTeamAttackStyleKey(winner.team)) ? 0.22 : 0;
    const forwardWeight = clamp(
      0.2 +
        counterBias +
        (roleKey === "wideForward" || roleKey === "striker" || roleKey === "secondStriker" ? 0.16 : 0) -
        (isRestOrBack ? 0.1 : 0) -
        pressure * 0.08,
      0.08,
      0.54
    );
    const insideWeight = clamp(
      0.28 +
        (isRestOrBack ? 0.16 : 0) +
        pressure * 0.1,
      0.2,
      0.58
    );
    const awayWeight = clamp(
      0.62 +
        pressure * 0.16 +
        (reason === "tackle" ? 0.1 : 0),
      0.48,
      0.84
    );
    const combined = {
      x: awayFromLoser.x * awayWeight + insideVector.x * insideWeight + forwardVector.x * forwardWeight,
      y: awayFromLoser.y * awayWeight + insideVector.y * insideWeight + forwardVector.y * forwardWeight,
    };
    const combinedLength = Math.hypot(combined.x, combined.y) || 1;
    const escapeDirection = {
      x: combined.x / combinedLength,
      y: combined.y / combinedLength,
    };
    const touchDistance = clamp(
      0.78 +
        security * 0.58 +
        (reason === "interception" ? 0.32 : 0.16) -
        pressure * 0.24,
      0.68,
      reason === "interception" ? 1.72 : 1.42
    );
    const escapePoint = clampToPitch({
      x: contestPoint.x + escapeDirection.x * touchDistance,
      y: contestPoint.y + escapeDirection.y * touchDistance,
    }, 1.5);
    const playerTarget = getPlayerPositionForControlPoint(
      winner,
      escapePoint,
      angleBetween(contestPoint, escapePoint)
    );

    return {
      contestPoint,
      escapePoint,
      playerTarget: clampToPitch(playerTarget, 1.5),
      facingAngle: angleBetween(contestPoint, escapePoint),
      touchDistance,
      pressure,
    };
  }

  function applyBallWinEscapeTouch(winner, loser, point = state.ball.position, reason = "tackle") {
    const escape = getBallWinEscapeTouch(winner, loser, point, reason);
    if (!escape) {
      return null;
    }

    const currentControlPoint = getPlayerBallControlPoint(winner);
    const currentGap = distance(currentControlPoint, escape.escapePoint);
    const maxAdjustment = reason === "interception" ? 1.05 : 0.86;
    const adjustmentRatio = currentGap <= 0.01 ? 0 : clamp(maxAdjustment / currentGap, 0, 1);
    const nextControlPoint = {
      x: lerp(currentControlPoint.x, escape.escapePoint.x, adjustmentRatio),
      y: lerp(currentControlPoint.y, escape.escapePoint.y, adjustmentRatio),
    };
    const playerTarget = getPlayerPositionForControlPoint(winner, nextControlPoint, escape.facingAngle);
    winner.position = clampToPitch(playerTarget, 1.5);
    winner.bodyAngle = escape.facingAngle;
    winner.movementProgress = 0;
    state.ball.ownerPlayerId = winner.id;
    state.ball.position = cloneVector(getPlayerBallControlPoint(winner));
    state.ball.target = cloneVector(state.ball.position);

    return {
      ...escape,
      appliedPoint: cloneVector(state.ball.position),
    };
  }

  function setSecurePossessionAfterBallWin(winner, loser, point = state.ball.position, reason = "tackle") {
    if (!winner || !loser || winner.team === loser.team) {
      clearSecurePossession();
      return;
    }

    const escape = applyBallWinEscapeTouch(winner, loser, point, reason);
    state.ball.securePossession = {
      ownerPlayerId: winner.id,
      opponentPlayerId: loser.id,
      point: cloneVector(point),
      escapePoint: escape?.appliedPoint ? cloneVector(escape.appliedPoint) : null,
      createdAt: state.time,
      reason,
      minDistanceToExpire: reason === "interception" ? 6.1 : 7.8,
      minTimeToExpire: reason === "interception" ? 1.45 : 1.85,
    };
  }

  function getPossessionShieldOpponents(owner, point, radius = 4.8) {
    if (!owner || !point) {
      return [];
    }

    return state.players
      .filter((player) => player.team !== owner.team && !isGoalkeeper(player))
      .map((player) => ({
        player,
        gap: distance(player.position, point),
      }))
      .filter((entry) => entry.gap <= radius)
      .sort((a, b) => a.gap - b.gap);
  }

  function setSecurePossessionAfterControlledTouch(owner, point = state.ball.position, options = {}) {
    if (!owner || !point) {
      return;
    }

    const currentSecure = state.ball.securePossession;
    const currentReason = currentSecure?.reason ?? "";
    const keepStrongerBallWinShield =
      currentSecure?.ownerPlayerId === owner.id &&
      (currentReason === "tackle" || currentReason === "interception");
    if (keepStrongerBallWinShield) {
      return;
    }

    const context = getPlayerDecisionContext(owner);
    const quality = clamp(
      options.quality ??
        (
          context.profile.technicalSecurity * 0.36 +
          context.profile.pressResistance * 0.24 +
          context.profile.composure * 0.18 +
          context.profile.decisionQuality * 0.12 -
          context.pressure * 0.08
        ),
      0.34,
      0.98
    );
    const reason = options.reason ?? "controlled-reception";
    const shieldRadius = clamp(
      options.shieldRadius ?? lerp(3.15, 4.75, quality),
      2.6,
      5.4
    );
    const nearbyOpponents = getPossessionShieldOpponents(owner, point, shieldRadius + 0.85);
    const nearestOpponent = nearbyOpponents[0]?.player ?? null;
    const activePressure = Math.max(context.pressure, nearbyOpponents.length ? 0.34 : 0);
    const reasonStrength =
      reason === "loose-ball-collect"
        ? 0.44
        : reason === "rebound-control"
          ? 0.36
          : 0.48;
    state.ball.securePossession = {
      ownerPlayerId: owner.id,
      opponentPlayerId: nearestOpponent?.id ?? null,
      opponentPlayerIds: nearbyOpponents.slice(0, 4).map((entry) => entry.player.id),
      point: cloneVector(point),
      escapePoint: cloneVector(getPlayerBallControlPoint(owner)),
      createdAt: state.time,
      reason,
      shieldRadius,
      shieldStrength: clamp(
        reasonStrength +
          quality * 0.2 +
          activePressure * 0.08 +
          clamp(nearbyOpponents.length / 4, 0, 1) * 0.06,
        0.36,
        0.76
      ),
      minDistanceToExpire: clamp(
        options.minDistanceToExpire ?? lerp(3.7, 6.2, quality),
        3.1,
        6.8
      ),
      minTimeToExpire: clamp(
        options.minTimeToExpire ?? lerp(0.7, 1.28, quality),
        0.55,
        1.45
      ),
    };
  }

  function keepSecurePossessionOnlyForOwner(ownerPlayerId) {
    if (state.ball.securePossession && state.ball.securePossession.ownerPlayerId !== ownerPlayerId) {
      clearSecurePossession();
    }
  }

  function getSecurePossessionContext(owner, challenger) {
    const secure = state.ball.securePossession;
    if (!secure || !owner || !challenger || owner.id !== secure.ownerPlayerId) {
      return null;
    }

    const explicitOpponentMatch =
      challenger.id === secure.opponentPlayerId ||
      (Array.isArray(secure.opponentPlayerIds) && secure.opponentPlayerIds.includes(challenger.id));
    const controlledTouchShield =
      (secure.reason === "controlled-reception" ||
        secure.reason === "loose-ball-collect" ||
        secure.reason === "rebound-control") &&
      distance(challenger.position, owner.position) <= (secure.shieldRadius ?? 3.4);
    if (!explicitOpponentMatch && !controlledTouchShield) {
      return null;
    }

    const origin = secure.point ?? owner.position;
    const movedFromDuel = distance(owner.position, origin);
    const actionElapsed = state.ball.inTransit ? state.ball.elapsedTravelTime : 0;
    const distanceProgress = movedFromDuel / Math.max(secure.minDistanceToExpire ?? 5, 0.01);
    const timeProgress = actionElapsed / Math.max(secure.minTimeToExpire ?? 1, 0.01);
    const protectionRatio = clamp(
      (1 - Math.max(distanceProgress, timeProgress)) * (secure.shieldStrength ?? 1),
      0,
      1
    );
    if (protectionRatio <= 0.01) {
      clearSecurePossession();
      return null;
    }

    return {
      movedFromDuel,
      actionElapsed,
      protectionRatio,
    };
  }

  return {
    clearSecurePossession,
    getBallWinEscapeTouch,
    applyBallWinEscapeTouch,
    setSecurePossessionAfterBallWin,
    getPossessionShieldOpponents,
    setSecurePossessionAfterControlledTouch,
    keepSecurePossessionOnlyForOwner,
    getSecurePossessionContext,
  };
}
