export function createGameSimulatorActionSpacePassLaneMetrics(deps = {}) {
  const {
    ballRadiusMeters,
    clamp,
    computeTimeToCoverDistance,
    distance,
    getCoverShadowInfluence,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    isAerialFlightStyle,
    lerp,
    playerRadiusMeters,
    projectPointOnSegmentWithRatio,
    resolveAutoBallProfile,
    state,
  } = deps;

  function getPotentialPassReceiverAtTarget(initiator, target, receiverPlayerId = null) {
    if (!initiator || !target) {
      return null;
    }
    if (receiverPlayerId) {
      return getPlayerById(receiverPlayerId);
    }
    return state.players
      .filter((player) => player.team === initiator.team && player.id !== initiator.id)
      .map((player) => ({
        player,
        gap: distance(getPlayerBallControlPoint(player), target),
      }))
      .filter((entry) => entry.gap <= 2.2)
      .sort((a, b) => a.gap - b.gap)[0]?.player ?? null;
  }

  function getPassLaneRiskProfile(initiator, target, options = {}) {
    if (!initiator) {
      return {
        clarity: 0.72,
        obstruction: 0,
        timingRisk: 0,
        coverShadow: 0,
        interceptors: 0,
        averageSpeed: 11.5,
      };
    }
    const context = getPlayerDecisionContext(initiator);
    const startPoint = getPlayerBallControlPoint(initiator);
    const receiver = getPotentialPassReceiverAtTarget(initiator, target, options.receiverPlayerId ?? null);
    const ballProfile = resolveAutoBallProfile("pass", startPoint, target, initiator, receiver?.id ?? null);
    const laneLength = Math.max(distance(startPoint, target), 0.01);
    const averageSpeed = Math.max(ballProfile.averageSpeed ?? 11.5, 0.01);
    const isAerial = isAerialFlightStyle(ballProfile.flightStyle);
    const landingStart = ballProfile.landingPhaseStart ?? 0.58;
    let obstruction = 0;
    let timingRisk = 0;
    let coverShadow = 0;
    let interceptors = 0;
    state.players.forEach((player) => {
      if (player.team === initiator.team) {
        return;
      }
      const projection = projectPointOnSegmentWithRatio(player.position, startPoint, target);
      const lanePoint = projection.point;
      const laneProgress = clamp(projection.ratio, 0, 1);
      if (laneProgress < 0.07 || laneProgress > 0.96) {
        return;
      }
      const laneDistance = distance(player.position, lanePoint);
      const laneWidth = lerp(2.15, 4.65, clamp(laneLength / 34, 0, 1)) * (isAerial ? 0.78 : 1);
      if (laneDistance > laneWidth + 3.2) {
        return;
      }
      const centrality = 1 - Math.abs(0.5 - laneProgress) * 1.4;
      const coverInfluence = getCoverShadowInfluence(player, lanePoint, startPoint);
      const ballTimeToLane = (laneLength * laneProgress) / averageSpeed;
      const defenderReachDistance = Math.max(
        laneDistance - playerRadiusMeters * 0.68 - ballRadiusMeters * 0.42,
        0
      );
      const defenderTimeToLane = computeTimeToCoverDistance(player, defenderReachDistance, lanePoint);
      const aerialControlFactor = isAerial
        ? laneProgress >= landingStart
          ? 0.96
          : lerp(0.24, 0.58, laneProgress / Math.max(landingStart, 0.01))
        : 1;
      const timingFit = clamp((ballTimeToLane - defenderTimeToLane + 0.28) / 0.9, 0, 1);
      const staticBlock = clamp(1 - laneDistance / Math.max(laneWidth + 1.2, 0.01), 0, 1);
      const readQuality =
        player.intelligenceProfile.perception * 0.36 +
        player.intelligenceProfile.decisionSpeed * 0.26 +
        player.intelligenceProfile.tacticalDiscipline * 0.18 +
        player.intelligenceProfile.technicalSecurity * 0.1;
      const segmentRisk =
        staticBlock *
        Math.max(0.22, centrality) *
        aerialControlFactor *
        (0.38 + timingFit * 0.72 + coverInfluence * 0.24) *
        (0.74 + readQuality * 0.34);
      obstruction +=
        staticBlock * Math.max(0.25, centrality) * aerialControlFactor * (0.72 + coverInfluence * 0.42);
      timingRisk = Math.max(timingRisk, segmentRisk);
      coverShadow += coverInfluence * staticBlock * aerialControlFactor;
      if (segmentRisk >= 0.5) {
        interceptors += 1;
      }
    });
    const clarity = clamp(
      0.34 +
        context.profile.perception * 0.28 +
        context.profile.decisionQuality * 0.16 +
        context.profile.technicalSecurity * 0.1 -
        obstruction * 0.1 -
        timingRisk * 0.2 -
        Math.min(coverShadow, 2.4) * 0.035 -
        Math.min(interceptors, 3) * 0.045 -
        context.pressure * 0.1,
      0.12,
      0.98
    );
    return {
      clarity,
      obstruction,
      timingRisk,
      coverShadow,
      interceptors,
      averageSpeed,
    };
  }

  function computePassLaneClarity(initiator, target, options = {}) {
    return getPassLaneRiskProfile(initiator, target, options).clarity;
  }

  return {
    getPotentialPassReceiverAtTarget,
    getPassLaneRiskProfile,
    computePassLaneClarity,
  };
}
