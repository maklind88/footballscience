export function createGameSimulatorCommandLooseBallRecovery(deps = {}) {
  const {
    angleBetween,
    applyAutopilotsForCurrentAction,
    captureSnapshot,
    clamp,
    clampToPitch,
    clearAutoPilotReceiveMomentum,
    clearSecurePossession,
    cloneVector,
    computeTimeToCoverDistance,
    connectBallToPlayerForNextAction,
    distance,
    formatTime,
    getAttackDirectionSign,
    getAttackingDepth,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getPlayerPositionForControlPoint,
    getTeamAttackAngle,
    getTeamSupportCountAroundPoint,
    isGoalkeeper,
    isInsideOpponentBox,
    isInsideOwnBox,
    isWideChannel,
    keepSecurePossessionOnlyForOwner,
    lerp,
    logEvent,
    normalize,
    pitch,
    setSecurePossessionAfterControlledTouch,
    setSelectedPlayers,
    state,
    teams,
  } = deps;

  function getLooseBallRecoveryTarget(player, ballPoint = state.ball.position) {
    const facingAngle = getTeamAttackAngle(player.team);
    return {
      facingAngle,
      position: getPlayerPositionForControlPoint(player, ballPoint, facingAngle),
    };
  }

  function getSecondBallReactionAdjustment(player, ballPoint, recovery, context = state.ball.secondBallContext) {
    if (!context) {
      return {
        score: 0,
        label: null,
      };
    }
    const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
    const label = getPlayerMagnetLabel(player);
    const playerContext = getPlayerDecisionContext(player);
    const isPreferredPlayer = player.id === context.preferredPlayerId;
    const isPreferredTeam = player.team === context.preferredTeamId;
    const isAttackingTeam = player.team === context.attackingTeamId;
    const isDefendingTeam = player.team === context.defendingTeamId;
    const attackingBox = context.attackingTeamId ? isInsideOpponentBox(ballPoint, context.attackingTeamId) : false;
    const defensiveBox = context.defendingTeamId ? isInsideOwnBox(ballPoint, context.defendingTeamId) : false;
    const proximityUrgency = clamp(1 - recovery.runDistance / 12, 0, 1);
    const anticipation =
      playerContext.profile.perception * 0.28 +
      playerContext.profile.decisionSpeed * 0.22 +
      playerContext.profile.tacticalDiscipline * 0.16 +
      playerContext.profile.composure * 0.12;
    let score = 0;
    score -= anticipation * 0.2 * (context.urgency ?? 0.5);
    score -= proximityUrgency * 0.1;
    if (isPreferredPlayer) {
      score -= 0.32;
    } else if (isPreferredTeam) {
      score -= 0.12;
    }
    if (isAttackingTeam && attackingBox) {
      score -= ["striker", "secondStriker", "wideForward", "connector"].includes(roleKey) ? 0.24 : 0.08;
    }
    if (isDefendingTeam && (attackingBox || defensiveBox)) {
      score -= label === "CB" || label === "6" || label === "GK" ? 0.26 : 0.1;
    }
    if (roleKey === "gk" && !defensiveBox) {
      score += 0.42;
    }
    if (context.source?.includes?.("cross") || context.source?.includes?.("delivery")) {
      score -= label === "CB" || label === "9" || label === "6" ? 0.08 : 0;
    }
    return {
      score,
      label: isPreferredTeam ? "second-ball team reaction" : "second-ball counter reaction",
    };
  }

  function getLooseBallRecoveryStructureAdjustment(player, ballPoint, recovery, context = state.ball.secondBallContext) {
    if (!player || !ballPoint) {
      return {
        score: 0,
        label: null,
      };
    }
    const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
    const label = getPlayerMagnetLabel(player);
    const profile = getOffensiveAutopilotProfile(player.team, ballPoint);
    const threat = getPitchThreatProfile(ballPoint, player.team);
    const opponentPressure = getOpponentPressureAtPoint(player.team, ballPoint, 10.5);
    const supportCount = getTeamSupportCountAroundPoint(player.team, ballPoint, new Set([player.id]), 11.5);
    const attackSign = getAttackDirectionSign(player.team);
    const coverBehindCount = state.players.reduce((count, teammate) => {
      if (teammate.team !== player.team || teammate.id === player.id || isGoalkeeper(teammate)) {
        return count;
      }
      const behindBall = (ballPoint.x - teammate.position.x) * attackSign >= 1.4;
      return count + (behindBall && distance(teammate.position, ballPoint) <= 17 ? 1 : 0);
    }, 0);
    const depth = getAttackingDepth(ballPoint, player.team);
    const isPreferredTeam = context?.preferredTeamId && player.team === context.preferredTeamId;
    const finalThirdLooseBall = depth >= 64 || threat.box >= 0.18 || threat.assistZone >= 0.22;
    const roleFit =
      roleKey === "pivot"
        ? 0.2
        : roleKey === "connector"
          ? 0.18
          : roleKey === "wideForward" || roleKey === "striker" || roleKey === "secondStriker"
            ? finalThirdLooseBall ? 0.18 : 0.08
            : roleKey === "wideBack"
              ? 0.12
              : roleKey === "rest"
                ? finalThirdLooseBall ? 0.03 : 0.12
                : roleKey === "gk"
                  ? -0.18
                  : 0.08;
    let score = 0;
    score -= roleFit;
    score -= clamp(supportCount, 0, 3) * 0.045;
    score -= clamp(coverBehindCount, 0, 3) * 0.035;
    score -= profile.counterPress * 0.045;
    if (isPreferredTeam) {
      score -= 0.08;
    }
    if (opponentPressure >= 0.58 && supportCount === 0) {
      score += 0.16 + opponentPressure * 0.08;
    }
    if (finalThirdLooseBall && (label === "9" || label === "W" || label === "10")) {
      score -= 0.1 + threat.value * 0.04;
    }
    if (threat.depth <= 32 && (label === "CB" || label === "6" || label === "GK")) {
      score -= 0.07;
    }
    if (recovery?.runDistance >= 14 && supportCount <= 1 && opponentPressure >= 0.46) {
      score += 0.08;
    }
    return {
      score: clamp(score, -0.36, 0.28),
      label:
        supportCount >= 1 || coverBehindCount >= 1
          ? "loose-ball support structure"
          : null,
    };
  }

  function getLooseBallNearestOpponent(player, point) {
    if (!player || !point) {
      return null;
    }
    return state.players.reduce((nearest, opponent) => {
      if (opponent.team === player.team) {
        return nearest;
      }
      const gap = distance(opponent.position, point);
      if (!nearest || gap < nearest.gap) {
        return { player: opponent, gap };
      }
      return nearest;
    }, null);
  }

  function getLooseBallCollectControlTouch(player, ballPoint, context = state.ball.secondBallContext) {
    if (!player || !ballPoint) {
      return null;
    }
    const attackSign = getAttackDirectionSign(player.team);
    const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
    const playerContext = getPlayerDecisionContext(player);
    const pressure = getOpponentPressureAtPoint(player.team, ballPoint, 10.5);
    const nearestOpponent = getLooseBallNearestOpponent(player, ballPoint);
    const threat = getPitchThreatProfile(ballPoint, player.team);
    const isDefensiveRecovery = context?.defendingTeamId && player.team === context.defendingTeamId;
    const isAttackingRecovery = context?.attackingTeamId && player.team === context.attackingTeamId;
    const sideSign =
      Math.sign(ballPoint.y - pitch.width / 2) ||
      Math.sign(player.position.y - pitch.width / 2) ||
      1;
    const forwardVector = { x: attackSign, y: 0 };
    const awayFromPressure = nearestOpponent
      ? normalize(nearestOpponent.player.position, ballPoint)
      : forwardVector;
    const insideExitVector = normalize(ballPoint, {
      x: ballPoint.x + attackSign * 8,
      y: lerp(ballPoint.y, pitch.width / 2, isWideChannel(ballPoint) ? 0.58 : 0.28),
    });
    const wideSafetyVector = normalize(ballPoint, {
      x: ballPoint.x + attackSign * 5,
      y: clamp(ballPoint.y + sideSign * 7.5, 4, pitch.width - 4),
    });
    const goalVector = normalize(ballPoint, getOpponentGoalCenter(player.team));
    const security =
      playerContext.profile.technicalSecurity * 0.32 +
      playerContext.profile.pressResistance * 0.24 +
      playerContext.profile.composure * 0.2 +
      playerContext.profile.decisionQuality * 0.14;
    const forwardIntent =
      (isAttackingRecovery ? 0.16 : 0) +
      (threat.depth >= 46 ? 0.12 : 0) +
      (roleKey === "wideForward" || roleKey === "striker" || roleKey === "secondStriker" ? 0.14 : 0) -
      pressure * 0.1;
    const safetyIntent =
      (isDefensiveRecovery ? 0.18 : 0) +
      (threat.depth <= 38 ? 0.12 : 0) +
      pressure * 0.14 +
      (roleKey === "gk" || roleKey === "rest" ? 0.1 : 0);
    const weights = {
      away: clamp(0.48 + pressure * 0.24 + safetyIntent * 0.36, 0.42, 0.86),
      inside: clamp(0.34 + security * 0.18 + pressure * 0.08, 0.26, 0.62),
      forward: clamp(0.2 + forwardIntent + security * 0.1, 0.08, 0.56),
      wide: clamp(safetyIntent * 0.28 + (isWideChannel(ballPoint) ? 0.12 : 0), 0, 0.36),
      goal: clamp(threat.box * 0.18 + threat.goldenZone * 0.24 + (isAttackingRecovery ? 0.08 : 0), 0, 0.34),
    };
    const combined = {
      x:
        awayFromPressure.x * weights.away +
        insideExitVector.x * weights.inside +
        forwardVector.x * weights.forward +
        wideSafetyVector.x * weights.wide +
        goalVector.x * weights.goal,
      y:
        awayFromPressure.y * weights.away +
        insideExitVector.y * weights.inside +
        forwardVector.y * weights.forward +
        wideSafetyVector.y * weights.wide +
        goalVector.y * weights.goal,
    };
    const length = Math.hypot(combined.x, combined.y) || 1;
    const direction = {
      x: combined.x / length,
      y: combined.y / length,
    };
    const touchDistance = clamp(
      0.74 +
      security * 0.76 +
      (pressure <= 0.32 ? 0.42 : 0) +
      (threat.depth >= 58 ? 0.22 : 0) -
      pressure * 0.18,
      0.68,
      pressure <= 0.38 ? 2.55 : 1.85
    );
    const controlPoint = clampToPitch({
      x: ballPoint.x + direction.x * touchDistance,
      y: ballPoint.y + direction.y * touchDistance,
    }, 1.5);
    const facingAngle = angleBetween(ballPoint, controlPoint);
    return {
      controlPoint,
      playerTarget: clampToPitch(
        getPlayerPositionForControlPoint(player, controlPoint, facingAngle),
        1.5
      ),
      facingAngle,
      pressure,
      touchDistance,
    };
  }

  function applyLooseBallCollectControlTouch(player, ballPoint = state.ball.position) {
    const touch = getLooseBallCollectControlTouch(player, ballPoint);
    if (!touch) {
      return connectBallToPlayerForNextAction(player, ballPoint, 0.88);
    }
    clearAutoPilotReceiveMomentum(player.id);
    player.position = cloneVector(touch.playerTarget);
    player.bodyAngle = touch.facingAngle;
    player.movementProgress = 0;
    state.ball.ownerPlayerId = player.id;
    keepSecurePossessionOnlyForOwner(player.id);
    state.ball.position = cloneVector(getPlayerBallControlPoint(player));
    state.ball.target = cloneVector(state.ball.position);
    setSecurePossessionAfterControlledTouch(player, state.ball.position, {
      quality: clamp(0.58 + (1 - touch.pressure) * 0.18, 0.42, 0.86),
      reason: "loose-ball-collect",
      minDistanceToExpire: 4.6,
      minTimeToExpire: 1.02,
    });
    state.ball.secondBallContext = null;
    return true;
  }

  function chooseAutoPilotLooseBallRecovery(ballPoint = state.ball.position) {
    let bestRecovery = null;
    const secondBallContext = state.ball.secondBallContext ?? null;
    state.players.forEach((player) => {
      const recoveryTarget = getLooseBallRecoveryTarget(player, ballPoint);
      const runDistance = distance(player.position, recoveryTarget.position);
      const timeToBall = computeTimeToCoverDistance(player, runDistance, recoveryTarget.position);
      const context = getPlayerDecisionContext(player);
      const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
      const goalkeeperPenalty = roleKey === "gk" ? 0.85 : 0;
      const ballWinnerBonus =
        context.profile.perception * 0.18 +
        context.profile.decisionSpeed * 0.14 +
        context.profile.tacticalDiscipline * 0.08;
      const secondBallAdjustment = getSecondBallReactionAdjustment(
        player,
        ballPoint,
        {
          runDistance,
          timeToBall,
        },
        secondBallContext
      );
      const structureAdjustment = getLooseBallRecoveryStructureAdjustment(
        player,
        ballPoint,
        {
          runDistance,
          timeToBall,
        },
        secondBallContext
      );
      const score =
        timeToBall +
        runDistance * 0.012 +
        goalkeeperPenalty -
        ballWinnerBonus +
        secondBallAdjustment.score +
        structureAdjustment.score;
      const recovery = {
        player,
        ballPoint: cloneVector(ballPoint),
        targetPosition: recoveryTarget.position,
        facingAngle: recoveryTarget.facingAngle,
        runDistance,
        timeToBall,
        duration: Math.max(timeToBall + 0.12, 0.35),
        score,
        secondBallLabel: secondBallAdjustment.label ?? structureAdjustment.label,
      };
      if (!bestRecovery || recovery.score < bestRecovery.score) {
        bestRecovery = recovery;
      }
    });
    return bestRecovery;
  }

  function issueLooseBallRecoveryCommand(recovery) {
    if (!recovery?.player) {
      return false;
    }
    const player = recovery.player;
    const ballPoint = cloneVector(recovery.ballPoint ?? state.ball.position);
    const targetPosition = clampToPitch(recovery.targetPosition ?? player.position, 2);
    const facingAngle = Number.isFinite(recovery.facingAngle)
      ? recovery.facingAngle
      : getTeamAttackAngle(player.team);
    const recoverySpeed = recovery.runDistance / Math.max(recovery.duration, 0.01);
    const startSnapshot = captureSnapshot();
    startSnapshot.ball.position = cloneVector(ballPoint);
    startSnapshot.ball.ownerPlayerId = null;
    startSnapshot.ball.securePossession = null;
    clearSecurePossession();
    state.draftStep = {
      actionType: "recovery",
      target: cloneVector(ballPoint),
      speed: recoverySpeed,
      speedMode: "auto",
      profileKey: "loose-ball-recovery",
      profileLabel: "Loose Ball Recovery",
      targetKind: "loose-ball",
      recoveryDuration: recovery.duration,
      carrierPlayerId: player.id,
      receiverPlayerId: null,
      beforeSnapshot: startSnapshot,
      autoGenerated: true,
      autoReason: recovery.secondBallLabel ?? "nearest player attacks the loose ball",
      secondBallContext: state.ball.secondBallContext ? {
        ...state.ball.secondBallContext,
        originPoint: cloneVector(state.ball.secondBallContext.originPoint),
        spillPoint: cloneVector(state.ball.secondBallContext.spillPoint),
      } : null,
    };
    state.players.forEach((entry) => {
      entry.actionOrigin = cloneVector(entry.position);
    });
    player.position = cloneVector(targetPosition);
    player.bodyAngle = facingAngle;
    player.movementProgress = 0;
    setSelectedPlayers([player.id], player.id);
    state.ball.position = cloneVector(ballPoint);
    state.ball.startPosition = cloneVector(ballPoint);
    state.ball.target = cloneVector(ballPoint);
    state.ball.speed = recoverySpeed;
    state.ball.currentSpeed = 0;
    state.ball.launchSpeed = 0;
    state.ball.finalSpeed = 0;
    state.ball.deceleration = 0;
    state.ball.profileKey = "loose-ball-recovery";
    state.ball.profileLabel = "Loose Ball Recovery";
    state.ball.profileMode = "auto";
    state.ball.targetKind = "loose-ball";
    state.ball.firstTouchMode = null;
    state.ball.flightStyle = "ground";
    state.ball.peakHeight = 0;
    state.ball.height = 0;
    state.ball.trackDistanceTotal = 0;
    state.ball.trackDistanceCovered = 0;
    state.ball.inTransit = true;
    state.ball.elapsedTravelTime = 0;
    state.ball.actionType = "recovery";
    state.ball.ownerPlayerId = null;
    state.ball.initiatorPlayerId = player.id;
    state.ball.carrierPlayerId = player.id;
    state.ball.receiverPlayerId = null;
    state.ball.recoveryDuration = recovery.duration;
    applyAutopilotsForCurrentAction();
    player.position = cloneVector(targetPosition);
    player.bodyAngle = facingAngle;
    player.movementProgress = 0;
    logEvent(
      `${recovery.secondBallLabel ? "Second-ball recovery" : "Loose ball recovery"} planned: ${player.shortLabel} ${player.role} attacks the ball in ${formatTime(recovery.duration)}.`
    );
    return true;
  }

  return {
    getLooseBallRecoveryTarget,
    getSecondBallReactionAdjustment,
    getLooseBallRecoveryStructureAdjustment,
    getLooseBallNearestOpponent,
    getLooseBallCollectControlTouch,
    applyLooseBallCollectControlTouch,
    chooseAutoPilotLooseBallRecovery,
    issueLooseBallRecoveryCommand,
  };
}
