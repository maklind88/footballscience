export function createGameSimulatorActionSpaceCarryRunwayTargets(deps = {}) {
  const {
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
  } = deps;

  function getCarryRunwayRoleCap(roleKey, goalDistance) {
    const baseCap =
      roleKey === "wideForward"
        ? 36
        : roleKey === "striker" || roleKey === "secondStriker"
          ? 33
          : roleKey === "connector"
            ? 30
            : roleKey === "wideBack"
              ? 28
              : roleKey === "pivot"
                ? 21
                : roleKey === "rest"
                  ? 16
                  : 24;
    return clamp(baseCap, 11, goalDistance <= 30 ? 24 : 38);
  }

  function getCarryRunwayProfile(carrier, startPoint, targetPoint, profile = {}) {
    if (!carrier || !startPoint || !targetPoint) {
      return {
        active: false,
        shouldExtend: false,
        runwayScore: 0,
        score: 0,
        labels: [],
      };
    }
    const teamId = carrier.team;
    const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
    const goal = getOpponentGoalCenter(teamId);
    const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
    const startDepth = getAttackingDepth(startPoint, teamId);
    const targetDepth = getAttackingDepth(targetPoint, teamId);
    const goalDistance = distance(startPoint, goal);
    const targetGoalDistance = distance(targetPoint, goal);
    const nearestLaneGap = getNearestOpponentGapInCarryLane(carrier, targetPoint);
    const openSpaceScore = getCarryLaneOpenSpaceScore(nearestLaneGap);
    const lanePressure = getOpponentPressureAtPoint(teamId, targetPoint, 10);
    const carrierPressure = getPlayerPressureLoad(carrier, startPoint);
    const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
    const targetThreat = actionSpace.targetThreat ?? getPitchThreatProfile(targetPoint, teamId);
    const startThreat = actionSpace.startThreat ?? getPitchThreatProfile(startPoint, teamId);
    const threatGain = Math.max(0, targetThreat.value - startThreat.value);
    const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
    const runnerStrength = getAutoPilotRoleStrength(carrier, "runner");
    const isWideRunway = isWideChannel(startPoint) || isWideChannel(targetPoint);
    const isFinalThirdRunway =
      goalDistance <= 52 &&
      startDepth >= 44 &&
      targetGoalDistance <= goalDistance - 6;
    const roleFit =
      roleKey === "wideForward"
        ? 0.14
        : roleKey === "striker" || roleKey === "secondStriker"
          ? 0.12
          : roleKey === "connector"
            ? 0.08
            : roleKey === "wideBack"
              ? 0.06
              : roleKey === "pivot"
                ? -0.06
                : roleKey === "rest" || roleKey === "gk"
                  ? -0.2
                  : 0;
    const sterileCarryPenalty =
      forwardGain < 4 &&
      targetThreat.value <= startThreat.value + 0.04 &&
      !isWideRunway
        ? 0.2
        : 0;
    const runwayScore = clamp(
      openSpaceScore * 0.42 +
        actionSpace.openTarget * 0.18 +
        actionSpace.value * 0.22 +
        clamp(forwardGain / 30, 0, 1) * 0.2 +
        threatGain * 0.22 +
        targetThreat.behindLine * 0.16 +
        targetThreat.centralPocket * 0.1 +
        dribbleStrength * 0.12 +
        runnerStrength * 0.08 +
        roleFit +
        (isFinalThirdRunway ? 0.16 : 0) +
        (isWideRunway && forwardGain >= 7 ? 0.06 : 0) -
        lanePressure * 0.18 -
        carrierPressure * 0.13 -
        sterileCarryPenalty,
      0,
      1.35
    );
    const runwayKind =
      isFinalThirdRunway && targetThreat.behindLine >= 0.3
        ? "breakaway"
        : isWideRunway && targetDepth >= 56
          ? "wide-runway"
          : targetThreat.centralPocket >= 0.34 || targetThreat.betweenLines >= 0.36
            ? "central-runway"
            : "progressive-runway";
    const requiredOpenSpace = carrierPressure <= 0.36 ? 0.52 : 0.58;
    const shouldExtend =
      roleKey !== "gk" &&
      roleKey !== "rest" &&
      forwardGain >= 6 &&
      openSpaceScore >= requiredOpenSpace &&
      carrierPressure <= 0.62 &&
      lanePressure <= 0.74 &&
      runwayScore >= 0.68;
    return {
      active: shouldExtend,
      shouldExtend,
      runwayKind,
      runwayScore,
      score: runwayScore,
      forwardGain,
      startDepth,
      targetDepth,
      goalDistance,
      targetGoalDistance,
      openSpaceScore,
      nearestLaneGap,
      lanePressure,
      carrierPressure,
      actionSpace,
      targetThreat,
      startThreat,
      isWideRunway,
      isFinalThirdRunway,
      labels: shouldExtend ? ["Open-grass runway"] : [],
    };
  }

  function getRunwayCarryTarget(carrier, startPoint, profile = {}) {
    if (!carrier || !startPoint) {
      return null;
    }
    const teamId = carrier.team;
    const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
    if (roleKey === "gk" || roleKey === "rest") {
      return null;
    }
    const sign = getAttackDirectionSign(teamId);
    const goal = getOpponentGoalCenter(teamId);
    const pressure = getPlayerPressureLoad(carrier, startPoint);
    const goalDistance = distance(startPoint, goal);
    if (pressure >= 0.66 || goalDistance <= 13) {
      return null;
    }
    const attackAngle = getTeamAttackAngle(teamId);
    const towardGoalAngle = angleBetween(startPoint, goal);
    const sideToCenter = Math.sign(pitch.width / 2 - startPoint.y) || (getWideSideSign(startPoint) ? -getWideSideSign(startPoint) : 1);
    const roleCap = getCarryRunwayRoleCap(roleKey, goalDistance);
    const referenceTarget = clampToPitch({
      x: startPoint.x + sign * Math.min(24, Math.max(12, goalDistance - 13)),
      y: lerp(startPoint.y, pitch.width / 2, isWideChannel(startPoint) ? 0.48 : 0.22),
    }, 2.5);
    const referenceOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, referenceTarget));
    const desiredDistance = clamp(
      13 +
        referenceOpenSpace * 12 +
        getAutoPilotRoleStrength(carrier, "dribbler") * 5.5 +
        getAutoPilotRoleStrength(carrier, "runner") * 3.6 +
        (profile.carryBias ?? 0.5) * 4.4 +
        (getAttackingDepth(startPoint, teamId) >= 50 ? 2.6 : 0) -
        pressure * 5.8,
      9.5,
      Math.min(roleCap, Math.max(9, goalDistance - (goalDistance <= 30 ? 9.5 : 13)))
    );
    if (desiredDistance < 9) {
      return null;
    }
    const breakawayBuffer = goalDistance <= 30 ? 10 : 13.5;
    const buildAngleTarget = (angle, distanceLimit, key, weight) => ({
      key,
      weight,
      target: clampToPitch({
        x: startPoint.x + Math.cos(angle) * distanceLimit,
        y: startPoint.y + Math.sin(angle) * distanceLimit,
      }, 2.5),
    });
    const candidates = [
      buildAngleTarget(towardGoalAngle, desiredDistance, "breakaway", goalDistance <= 52 ? 1.1 : 0.92),
      buildAngleTarget(normalizeAngle(attackAngle + sideToCenter * 0.2), desiredDistance * 0.96, "inside-runway", isWideChannel(startPoint) ? 1.12 : 0.98),
      {
        key: "central-runway",
        weight: isWideChannel(startPoint) ? 1.04 : 0.96,
        target: clampToPitch({
          x: startPoint.x + sign * desiredDistance,
          y: lerp(startPoint.y, pitch.width / 2, isWideChannel(startPoint) ? 0.58 : 0.26),
        }, 2.5),
      },
      {
        key: "goal-runway",
        weight: goalDistance <= 44 ? 1.14 : 0.88,
        target: clampToPitch({
          x: goal.x - sign * breakawayBuffer,
          y: lerp(startPoint.y, pitch.width / 2, isWideChannel(startPoint) ? 0.66 : 0.42),
        }, 2.5),
      },
    ]
      .map((candidate) => {
        const forwardGain = (candidate.target.x - startPoint.x) * sign;
        const travelDistance = distance(startPoint, candidate.target);
        if (forwardGain < 6 || travelDistance < 8.5 || travelDistance > roleCap + 1) {
          return null;
        }
        const runway = getCarryRunwayProfile(carrier, startPoint, candidate.target, profile);
        return {
          ...runway,
          key: candidate.key,
          target: candidate.target,
          score: runway.runwayScore + candidate.weight * 0.08 + clamp(travelDistance / 36, 0, 0.12),
          distance: travelDistance,
        };
      })
      .filter((candidate) => candidate?.shouldExtend)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0] ?? null;
    if (!best) {
      return null;
    }
    return {
      ...best,
      active: true,
      label:
        best.runwayKind === "breakaway"
          ? "open-grass runway"
          : best.runwayKind === "wide-runway"
            ? "wide runway carry"
            : "progressive runway carry",
    };
  }

  function getBreakawayCarryTarget(carrier, startPoint, profile) {
    const runway = getRunwayCarryTarget(carrier, startPoint, profile);
    if (runway?.runwayKind === "breakaway" && runway.target) {
      return runway.target;
    }
    const teamId = carrier.team;
    const sign = getAttackDirectionSign(teamId);
    const goal = getOpponentGoalCenter(teamId);
    const goalDistance = distance(startPoint, goal);
    const ballDepth = getAttackingDepth(startPoint, teamId);
    const pressure = getPlayerPressureLoad(carrier, startPoint);
    const towardGoalPoint = clampToPitch({
      x: goal.x - sign * 15.5,
      y: pitch.width / 2,
    }, 2.5);
    const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, towardGoalPoint));
    const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
    const canBreakAway =
      goalDistance <= 48 &&
      ballDepth >= 48 &&
      pressure <= 0.46 &&
      openSpaceScore >= 0.62 &&
      roleKey !== "gk" &&
      roleKey !== "rest" &&
      roleKey !== "pivot";
    if (!canBreakAway) {
      return null;
    }
    const targetDistance = clamp(
      14 +
        openSpaceScore * 11 +
        getAutoPilotRoleStrength(carrier, "dribbler") * 5 +
        (profile?.tempo ?? 0.55) * 3,
      13,
      goalDistance <= 31 ? 19 : 30
    );
    const maxXBeforeShot = goal.x - sign * (goalDistance <= 26 ? 11.8 : 15.2);
    const targetX =
      sign > 0
        ? Math.min(startPoint.x + targetDistance, maxXBeforeShot)
        : Math.max(startPoint.x - targetDistance, maxXBeforeShot);
    const centralPull = isWideChannel(startPoint) ? 0.56 : 0.38;
    return clampToPitch({
      x: targetX,
      y: lerp(startPoint.y, pitch.width / 2, centralPull),
    }, 2.5);
  }

  function getOpenGrassCarryContext(carrier, startPoint, profile = {}) {
    if (!carrier || !startPoint) {
      return null;
    }
    const teamId = carrier.team;
    const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
    if (roleKey === "gk") {
      return null;
    }
    const runwayCarry = getRunwayCarryTarget(carrier, startPoint, profile);
    if (runwayCarry?.target) {
      return runwayCarry;
    }
    const pressure = getPlayerPressureLoad(carrier, startPoint);
    const ballDepth = getAttackingDepth(startPoint, teamId);
    const goal = getOpponentGoalCenter(teamId);
    const goalDistance = distance(startPoint, goal);
    const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
    const runnerStrength = getAutoPilotRoleStrength(carrier, "runner");
    const attackAngle = getTeamAttackAngle(teamId);
    const towardGoalAngle = angleBetween(startPoint, goal);
    const sideToCenter = Math.sign(pitch.width / 2 - startPoint.y) || (getWideSideSign(startPoint) ? -getWideSideSign(startPoint) : 1);
    const roleDistanceCap =
      roleKey === "wideForward"
        ? 33
        : roleKey === "striker" || roleKey === "secondStriker"
          ? 30
          : roleKey === "wideBack" || roleKey === "connector"
            ? 26
            : roleKey === "pivot"
              ? 19
              : 17;
    const openDistanceBase = clamp(
      12 +
        dribbleStrength * 7 +
        runnerStrength * 3.5 +
        profile.carryBias * 5 +
        profile.dribbleBias * 3 -
        pressure * 6,
      roleKey === "rest" ? 7.5 : 10,
      roleDistanceCap
    );
    const distanceLimit = clamp(
      Math.min(openDistanceBase, goalDistance - (goalDistance <= 26 ? 9.5 : 13.5)),
      7,
      roleDistanceCap
    );
    if (distanceLimit < 8.5 || pressure >= 0.62) {
      return null;
    }
    const angleOptions = [
      {
        key: "through-centre",
        angle: towardGoalAngle,
        weight: roleKey === "wideForward" || roleKey === "wideBack" ? 0.88 : 1,
      },
      {
        key: "inside-diagonal",
        angle: normalizeAngle(attackAngle + sideToCenter * 0.24),
        weight: isWideChannel(startPoint) ? 1.12 : 0.96,
      },
      {
        key: "outside-arc",
        angle: normalizeAngle(attackAngle - sideToCenter * 0.19),
        weight: roleKey === "wideForward" || roleKey === "wideBack" ? 1.04 : 0.82,
      },
    ];
    const candidates = angleOptions
      .map((option) => {
        const target = clampToPitch({
          x: startPoint.x + Math.cos(option.angle) * distanceLimit,
          y: startPoint.y + Math.sin(option.angle) * distanceLimit,
        }, 2.5);
        const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
        if (forwardGain < 5.5) {
          return null;
        }
        const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
        const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
        const targetThreat = actionSpace.targetThreat;
        const targetPressure = getOpponentPressureAtPoint(teamId, target, 9.5);
        const finalThirdBonus = ballDepth >= 54 && goalDistance <= 48 ? 0.16 : 0;
        const roleFit =
          roleKey === "wideForward"
            ? 0.18
            : roleKey === "striker" || roleKey === "secondStriker"
              ? 0.12
              : roleKey === "connector"
                ? 0.08
                : roleKey === "rest"
                  ? -0.22
                  : 0;
        const score =
          openSpaceScore * 0.62 +
          actionSpace.openTarget * 0.26 +
          actionSpace.value * 0.36 +
          clamp(forwardGain / 24, 0, 1) * 0.28 +
          targetThreat.behindLine * 0.18 +
          targetThreat.centralPocket * 0.12 +
          finalThirdBonus +
          roleFit +
          option.weight * 0.08 -
          pressure * 0.22 -
          targetPressure * 0.18;
        return {
          ...option,
          target,
          score,
          openSpaceScore,
          actionSpace,
          targetThreat,
          forwardGain,
          targetPressure,
          distance: distance(startPoint, target),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0] ?? null;
    if (!best || best.score < 0.72 || best.openSpaceScore < 0.56) {
      return null;
    }
    return {
      ...best,
      active: true,
      label: goalDistance <= 42 || best.targetThreat.behindLine >= 0.38
        ? "open-grass attack"
        : "progressive carry",
    };
  }

  return {
    getCarryRunwayRoleCap,
    getCarryRunwayProfile,
    getRunwayCarryTarget,
    getBreakawayCarryTarget,
    getOpenGrassCarryContext,
  };
}
