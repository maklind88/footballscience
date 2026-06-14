export function createGameSimulatorActionSpaceShotMetrics(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    clamp,
    clampToPitch,
    cloneVector,
    computeTimeToCoverDistance,
    distance,
    getAutoPilotRoleStrength,
    getCoverShadowInfluence,
    getFootUsageScore,
    getGoalDirectionSign,
    getGoalLineX,
    getGoalkeeperForTeam,
    getOpponentGoalCenter,
    getOpponentGoalSide,
    getOtherTeamId,
    getPlayerBallControlPoint,
    getPlayerDecisionContext,
    getPlayerPressureLoad,
    isGoalkeeper,
    lerp,
    pitch,
    projectPointOnSegmentWithRatio,
    resolveAutoBallProfile,
    state,
  } = deps;

  function getGoalMouthTarget(teamId, y, netDepth = 2.6) {
    const side = getOpponentGoalSide(teamId);
    const sign = getGoalDirectionSign(side);
    const goalLineX = getGoalLineX(side);
    const postPadding = 0.18;
    return {
      x: goalLineX + sign * netDepth,
      y: clamp(y, pitch.width / 2 - 7.32 / 2 + postPadding, pitch.width / 2 + 7.32 / 2 - postPadding),
    };
  }

  function getShotAngleQuality(startPoint, teamId) {
    if (!startPoint || !teamId) {
      return 0.42;
    }
    const goalLineX = getGoalLineX(getOpponentGoalSide(teamId));
    const upperPost = { x: goalLineX, y: pitch.width / 2 - 7.32 / 2 };
    const lowerPost = { x: goalLineX, y: pitch.width / 2 + 7.32 / 2 };
    const openAngle = angleDifference(
      angleBetween(startPoint, upperPost),
      angleBetween(startPoint, lowerPost)
    );
    return clamp((openAngle - 0.055) / 0.62, 0, 1);
  }

  function getShotBlockRisk(shooter, target) {
    if (!shooter || !target) {
      return 0.18;
    }
    const startPoint = getPlayerBallControlPoint(shooter);
    const laneLength = Math.max(distance(startPoint, target), 0.01);
    const shotProfile = resolveAutoBallProfile("shot", startPoint, target, shooter, null);
    const averageShotSpeed = Math.max(shotProfile.averageSpeed ?? 18, 0.01);
    let obstruction = 0;
    state.players.forEach((player) => {
      if (player.team === shooter.team || isGoalkeeper(player)) {
        return;
      }
      const projection = projectPointOnSegmentWithRatio(player.position, startPoint, target);
      if (projection.ratio <= 0.05 || projection.ratio >= 0.96) {
        return;
      }
      const laneGap = distance(player.position, projection.point);
      const laneWidth = lerp(3.15, 4.75, clamp(laneLength / 34, 0, 1));
      if (laneGap > laneWidth) {
        return;
      }
      const ballTimeToLane = (laneLength * projection.ratio) / averageShotSpeed;
      const defenderTimeToLane = computeTimeToCoverDistance(
        player,
        distance(player.position, projection.point),
        projection.point
      );
      const timingFit = clamp((ballTimeToLane - defenderTimeToLane + 0.32) / 0.92, 0, 1);
      const progressWeight = projection.ratio < 0.28 ? 0.85 : projection.ratio < 0.72 ? 1 : 0.74;
      const coverInfluence = getCoverShadowInfluence(player, projection.point, startPoint);
      obstruction +=
        (1 - laneGap / laneWidth) *
        progressWeight *
        (0.48 + timingFit * 0.72) *
        (0.78 + coverInfluence * 0.34);
    });
    return clamp(obstruction * 0.38, 0, 0.94);
  }

  function getGoalkeeperTargetOpenness(teamId, target) {
    const goalkeeper = getGoalkeeperForTeam(getOtherTeamId(teamId));
    if (!goalkeeper || !target) {
      return 0.58;
    }
    const side = getOpponentGoalSide(teamId);
    const sign = getGoalDirectionSign(side);
    const savePoint = clampToPitch({
      x: getGoalLineX(side) - sign * 0.9,
      y: target.y,
    }, 0.25);
    const context = getPlayerDecisionContext(goalkeeper);
    const gap = distance(goalkeeper.position, savePoint);
    const reachProfile =
      1.25 +
      context.profile.perception * 0.42 +
      context.profile.decisionSpeed * 0.32 +
      clamp(context.maxSpeed / 8.2, 0, 1) * 0.46;
    return clamp((gap - reachProfile * 0.72) / 6.2, 0, 1);
  }

  function computeShotLaneClarity(shooter, target) {
    if (!shooter) {
      return 0.62;
    }
    const context = getPlayerDecisionContext(shooter);
    const blockRisk = getShotBlockRisk(shooter, target);
    const angleQuality = getShotAngleQuality(getPlayerBallControlPoint(shooter), shooter.team);
    const goalkeeperOpenness = getGoalkeeperTargetOpenness(shooter.team, target);
    return clamp(
      0.3 +
        context.profile.perception * 0.17 +
        context.profile.decisionQuality * 0.15 +
        context.profile.technicalSecurity * 0.12 +
        angleQuality * 0.22 +
        goalkeeperOpenness * 0.18 -
        blockRisk * 0.58 -
        context.pressure * 0.12,
      0.08,
      0.98
    );
  }

  function getShotWindowProfile(shooter, startPoint, target) {
    const teamId = shooter?.team;
    const goal = teamId ? getOpponentGoalCenter(teamId) : target;
    const goalDistance = distance(startPoint, goal);
    const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
    const angleQuality = teamId ? getShotAngleQuality(startPoint, teamId) : 0.42;
    const blockRisk = getShotBlockRisk(shooter, target);
    const laneClarity = computeShotLaneClarity(shooter, target);
    const goalkeeperOpenness = teamId ? getGoalkeeperTargetOpenness(teamId, target) : 0.58;
    const pressure = shooter ? getPlayerPressureLoad(shooter, getPlayerBallControlPoint(shooter)) : 0.5;
    const finisherStrength = getAutoPilotRoleStrength(shooter, "finisher");
    const quality = clamp(
      angleQuality * 0.28 +
        laneClarity * 0.26 +
        goalkeeperOpenness * 0.18 +
        finisherStrength * 0.18 +
        centrality * 0.1 -
        pressure * 0.18,
      0,
      1
    );
    return {
      goalDistance,
      centrality,
      angleQuality,
      blockRisk,
      laneClarity,
      goalkeeperOpenness,
      pressure,
      finisherStrength,
      quality,
    };
  }

  function getDeterministicShotNoise(seedText, salt = 0) {
    const text = `${seedText}|${salt}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const value = Math.sin((hash >>> 0) * 12.9898 + salt * 78.233) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  }

  function resolveExecutedShotTarget(shooter, intendedTarget, ballProfile = null) {
    if (!shooter || !intendedTarget) {
      state.ball.shotPlacement = null;
      return intendedTarget ? cloneVector(intendedTarget) : null;
    }
    const startPoint = cloneVector(state.ball.startPosition ?? getPlayerBallControlPoint(shooter));
    const shotWindow = getShotWindowProfile(shooter, startPoint, intendedTarget);
    const context = getPlayerDecisionContext(shooter);
    const footExecutionScore = getFootUsageScore(shooter, angleBetween(shooter.position, intendedTarget));
    const executionQuality = clamp(
      state.ball.executionQuality ??
        (context.profile.technicalSecurity * 0.28 +
          context.profile.executionUnderPressure * 0.22 +
          context.profile.composure * 0.16 +
          context.profile.decisionQuality * 0.14 +
          footExecutionScore * 0.1 +
          shotWindow.laneClarity * 0.1),
      0.36,
      0.98
    );
    const side = getOpponentGoalSide(shooter.team);
    const sign = getGoalDirectionSign(side);
    const goalLineX = getGoalLineX(side);
    const intendedSideValue = (intendedTarget.x - goalLineX) * sign;
    const intendedIsGoalward = intendedSideValue >= -1.25;
    const targetKind = ballProfile?.targetKind ?? state.ball.targetKind ?? "shot";
    const distanceStress = clamp((shotWindow.goalDistance - 13) / 30, 0, 1);
    const pressureStress = clamp(shotWindow.pressure, 0, 1);
    const angleStress = 1 - shotWindow.angleQuality;
    const blockStress = clamp(shotWindow.blockRisk, 0, 1);
    const opennessStress = 1 - shotWindow.goalkeeperOpenness;
    const missRisk = clamp(
      0.035 +
        distanceStress * 0.16 +
        pressureStress * 0.2 +
        angleStress * 0.15 +
        blockStress * 0.13 +
        opennessStress * 0.06 -
        executionQuality * 0.22 -
        shotWindow.finisherStrength * 0.08,
      0.02,
      0.42
    );
    const seed = [
      shooter.id,
      state.sequence.steps.length,
      startPoint.x.toFixed(2),
      startPoint.y.toFixed(2),
      intendedTarget.x.toFixed(2),
      intendedTarget.y.toFixed(2),
      targetKind,
      state.ball.profileKey ?? "",
    ].join("|");
    const lateralNoise = getDeterministicShotNoise(seed, 1);
    const shapeNoise = getDeterministicShotNoise(seed, 2);
    const mistakeNoise = getDeterministicShotNoise(seed, 3);
    const baseSpread =
      0.16 +
      shotWindow.goalDistance * 0.015 +
      pressureStress * 0.82 +
      blockStress * 0.58 +
      angleStress * 0.42 +
      (1 - executionQuality) * 1.15;
    const missBurst = mistakeNoise > 1 - missRisk * 2
      ? Math.sign(lateralNoise || 1) * lerp(0.55, 1.75, clamp(missRisk / 0.42, 0, 1))
      : 0;
    const lateralError = lateralNoise * baseSpread + shapeNoise * baseSpread * 0.34 + missBurst;
    const executedTarget = {
      x: intendedIsGoalward ? goalLineX + sign * 2.6 : intendedTarget.x,
      y: clamp(intendedTarget.y + lateralError, 0.4, pitch.width - 0.4),
    };
    state.ball.shotPlacement = {
      intendedTarget: cloneVector(intendedTarget),
      executedTarget: cloneVector(executedTarget),
      errorMeters: Math.abs(lateralError),
      missRisk,
      executionQuality,
      pressure: pressureStress,
      angleQuality: shotWindow.angleQuality,
      blockRisk: shotWindow.blockRisk,
      goalDistance: shotWindow.goalDistance,
    };
    return executedTarget;
  }

  return {
    getGoalMouthTarget,
    getShotAngleQuality,
    getShotBlockRisk,
    getGoalkeeperTargetOpenness,
    computeShotLaneClarity,
    getShotWindowProfile,
    getDeterministicShotNoise,
    resolveExecutedShotTarget,
  };
}
