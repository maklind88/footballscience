import { createGameSimulatorActionSpaceCarryRunwayTargets } from "./action-space-carry-runway-targets.mjs";

export function createGameSimulatorActionSpaceDribbleCarryProfiles(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    autoDribbleProfiles,
    clamp,
    clampToPitch,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getManualBallProfile,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPressureAtPoint,
    getPitchSurfacePreset,
    getPitchThreatProfile,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getTeamAttackAngle,
    getWeatherPreset,
    getWideSideSign,
    isWideChannel,
    lerp,
    normalize,
    normalizeAngle,
    pitch,
    state,
    subtract,
    teams,
  } = deps;

  function getDribbleRoleFamily(player) {
    const magnetLabel = getPlayerMagnetLabel(player);
    const role = player?.role ?? "";
    if (magnetLabel === "GK" || /goalkeeper/i.test(role)) {
      return "gk-carry";
    }
    if (magnetLabel === "CB" || /center back/i.test(role)) {
      return "centre-back-carry";
    }
    if (magnetLabel === "6" || /holding midfielder/i.test(role)) {
      return "six-carry";
    }
    if (magnetLabel === "10" || /attacking midfielder/i.test(role)) {
      return "ten-carry";
    }
    if (magnetLabel === "8" || /central midfielder/i.test(role)) {
      return "eight-carry";
    }
    if (magnetLabel === "W" || /winger/i.test(role)) {
      return "winger-carry";
    }
    if (magnetLabel === "WB" || /wing-back/i.test(role)) {
      return "wingback-carry";
    }
    if (magnetLabel === "LB" || magnetLabel === "RB" || /left back|right back/i.test(role)) {
      return "fullback-carry";
    }
    if (magnetLabel === "9" || /striker|centre forward/i.test(role)) {
      return "striker-carry";
    }
    return "eight-carry";
  }

  function resolveAutoDribbleProfile(startPoint, targetPoint, carrier) {
    if (!carrier) {
      return getManualBallProfile("dribble");
    }
    const context = getPlayerDecisionContext(carrier);
    const surfacePreset = getPitchSurfacePreset();
    const weatherPreset = getWeatherPreset();
    const profileKey = getDribbleRoleFamily(carrier);
    const profile = autoDribbleProfiles[profileKey] ?? autoDribbleProfiles["eight-carry"];
    const actionDistance = distance(startPoint, targetPoint);
    const forwardMeters = (targetPoint.x - startPoint.x) * getAttackDirectionSign(carrier.team);
    const isWideCarry = isWideChannel(startPoint) || isWideChannel(targetPoint);
    const isForwardCarry = forwardMeters >= 5;
    const distanceRatio = clamp(actionDistance / 18, 0, 1);
    const nearestOpponentGap = getNearestOpponentGapInCarryLane(carrier, targetPoint);
    const openSpaceScore = getCarryLaneOpenSpaceScore(nearestOpponentGap);
    const lanePressureScore = 1 - openSpaceScore;
    const carryAngle = angleBetween(startPoint, targetPoint);
    const turnPenalty = clamp(
      angleDifference(getPlayerFacingAngle(carrier), carryAngle) / (Math.PI * 0.75),
      0,
      1
    );
    const technicalScore =
      context.profile.technicalSecurity * 0.34 +
      context.profile.pressResistance * 0.2 +
      context.profile.decisionSpeed * 0.16 +
      context.profile.decisionQuality * 0.14 +
      context.profile.composure * 0.16;
    const directionalBonus =
      (isForwardCarry ? 0.015 : 0) +
      (isWideCarry && ["winger-carry", "wingback-carry", "fullback-carry"].includes(profileKey) ? 0.018 : 0) +
      (profileKey === "striker-carry" && actionDistance >= 10 ? 0.014 : 0);
    const pressureFactor = clamp(
      1 -
        context.pressure * profile.pressurePenalty * (1.15 - context.profile.pressResistance * 0.18) -
        lanePressureScore * profile.lanePressurePenalty,
      0.68,
      1
    );
    const surfaceFactor = surfacePreset.dribbleCarryFactor * weatherPreset.dribbleTractionFactor;
    const playerPaceFactor = lerp(
      0.92,
      1.1,
      clamp((context.maxSpeed - 6.8) / 2.3, 0, 1)
    );
    const technicalFactor = clamp(
      0.9 + technicalScore * 0.18 + weatherPreset.dribbleControlFactor * 0.02,
      0.86,
      1.06
    );
    const openSpaceSpeed = lerp(profile.tightSpeed, profile.openSpeed, openSpaceScore);
    const physicalCarryMultiplier = carrier.physicalProfile?.dribbleSpeedMultiplier ?? 1;
    const distanceBoost =
      lerp(profile.distanceBoost[0], profile.distanceBoost[1], distanceRatio) *
      lerp(0.28, 1, openSpaceScore);
    const turnFactor = lerp(1, 0.82, turnPenalty);
    const averageSpeed = clamp(
      (openSpaceSpeed + distanceBoost) *
        physicalCarryMultiplier *
        playerPaceFactor *
        technicalFactor *
        (1 + directionalBonus) *
        pressureFactor *
        surfaceFactor *
        turnFactor,
      profile.minSpeed * physicalCarryMultiplier,
      profile.maxSpeed * physicalCarryMultiplier
    );
    return {
      key: profile.key,
      label: profile.label,
      source: "auto",
      targetKind: "carry",
      averageSpeed,
      launchMultiplier: 1,
      rollFloor: averageSpeed,
      flightStyle: "ground",
      peakHeight: 0,
      controlHeightThreshold: 0.12,
      landingPhaseStart: 0.58,
      distanceRatio,
    };
  }

  function getNearestOpponentGapInCarryLane(carrier, targetPoint) {
    const carryDirection = normalize(carrier.position, targetPoint);
    const hasDirection = Math.abs(carryDirection.x) > 0.001 || Math.abs(carryDirection.y) > 0.001;
    if (!hasDirection) {
      return Infinity;
    }
    let nearestGap = Infinity;
    const carryDistance = distance(carrier.position, targetPoint);
    const scanDistance = Math.max(11, Math.min(carryDistance + 2.5, 32));
    const scanRadius = Math.max(14, Math.min(carryDistance + 4, 36));
    state.players.forEach((player) => {
      if (player.team === carrier.team) {
        return;
      }
      const toOpponent = subtract(player.position, carrier.position);
      const opponentGap = Math.sqrt(toOpponent.x * toOpponent.x + toOpponent.y * toOpponent.y);
      if (opponentGap > scanRadius) {
        return;
      }
      const projection = toOpponent.x * carryDirection.x + toOpponent.y * carryDirection.y;
      if (projection < -1.5 || projection > scanDistance) {
        return;
      }
      const lateral = Math.sqrt(Math.max(opponentGap * opponentGap - projection * projection, 0));
      const laneWidth = lerp(4.1, 5.4, clamp(carryDistance / 26, 0, 1));
      if (lateral > laneWidth) {
        return;
      }
      nearestGap = Math.min(nearestGap, opponentGap);
    });
    return nearestGap;
  }

  function getCarryLaneOpenSpaceScore(nearestOpponentGap) {
    return Number.isFinite(nearestOpponentGap)
      ? clamp((nearestOpponentGap - 2.4) / 9.6, 0, 1)
      : 1;
  }

  const {
    getCarryRunwayRoleCap,
    getCarryRunwayProfile,
    getRunwayCarryTarget,
    getBreakawayCarryTarget,
    getOpenGrassCarryContext,
  } = createGameSimulatorActionSpaceCarryRunwayTargets({
    angleBetween,
    clamp,
    clampToPitch,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getCarryLaneOpenSpaceScore,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getTeamAttackAngle,
    getWideSideSign,
    isWideChannel,
    lerp,
    normalizeAngle,
    pitch,
    teams,
  });

  return {
    getDribbleRoleFamily,
    resolveAutoDribbleProfile,
    getNearestOpponentGapInCarryLane,
    getCarryLaneOpenSpaceScore,
    getCarryRunwayRoleCap,
    getCarryRunwayProfile,
    getRunwayCarryTarget,
    getBreakawayCarryTarget,
    getOpenGrassCarryContext,
  };
}
