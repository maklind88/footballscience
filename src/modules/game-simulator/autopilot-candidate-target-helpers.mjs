export function createGameSimulatorAutopilotCandidateTargetHelpers(deps = {}) {
  const {
    angleBetween,
    clamp,
    clampToPitch,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getAttackDirectionSign,
    getAutoPilotRoleStrength,
    getFootUsageScore,
    getGoalMouthTarget,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getPlayerBallControlPoint,
    getPlayerPressureLoad,
    getShotWindowProfile,
    getState,
    getWideSideSign,
    isGoalkeeper,
    isWideChannel,
    pitch,
    resolveShotTarget,
    teams,
    win,
  } = deps;

  function getAutoPilotShotTarget(teamId, shooter) {
    const goal = getOpponentGoalCenter(teamId);
    if (!shooter) {
      return resolveShotTarget(goal, null);
    }
    const startPoint = getPlayerBallControlPoint(shooter);
    const shooterSide =
      Math.sign(startPoint.y - pitch.width / 2) ||
      (shooter.preferredFoot === "left" ? -1 : 1);
    const goalDistance = distance(startPoint, goal);
    const isWide = isWideChannel(startPoint);
    const isClose = goalDistance <= 19;
    const finisherStrength = getAutoPilotRoleStrength(shooter, "finisher");
    const options = [
      {
        key: "far-corner",
        label: "far corner",
        y: pitch.width / 2 - shooterSide * 3.08,
        baseScore: 0.34,
        closeBonus: 0.08,
      },
      {
        key: "near-post",
        label: "near post",
        y: pitch.width / 2 + shooterSide * 2.82,
        baseScore: isWide ? 0.28 : 0.04,
        closeBonus: 0.28,
      },
      {
        key: "across-goal",
        label: "across goal",
        y: pitch.width / 2 - shooterSide * 2.18,
        baseScore: 0.22,
        closeBonus: 0.14,
      },
      {
        key: "keeper-wrong-foot",
        label: "wrong-foot finish",
        y: pitch.width / 2 + shooterSide * 1.18,
        baseScore: finisherStrength >= 0.76 ? 0.18 : -0.02,
        closeBonus: 0.1,
      },
    ];
    const rankedTargets = options
      .map((option) => {
        const target = getGoalMouthTarget(teamId, option.y);
        const window = getShotWindowProfile(shooter, startPoint, target);
        const footScore = getFootUsageScore(shooter, angleBetween(startPoint, target));
        const cornerValue = clamp(Math.abs(target.y - pitch.width / 2) / (7.32 / 2), 0, 1);
        const score =
          option.baseScore +
          (isClose ? option.closeBonus : 0) +
          win.laneClarity * 0.34 +
          win.goalkeeperOpenness * 0.36 +
          win.angleQuality * 0.22 +
          footScore * 0.16 +
          cornerValue * 0.18 +
          finisherStrength * 0.14 -
          win.blockRisk * 0.34 -
          (goalDistance > 31 && option.key === "near-post" ? 0.16 : 0);
        return {
          ...option,
          target,
          window,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
    return rankedTargets[0]?.target ?? resolveShotTarget(goal, shooter);
  }

  function getAutoPilotBoxTarget(teamId, carrier, variant = "cross") {
    const sign = getAttackDirectionSign(teamId);
    const penaltySpot = getOpponentPenaltySpot(teamId);
    const farPostSide = Math.sign((carrier?.position.y ?? pitch.width / 2) - pitch.width / 2) || 1;
    if (variant === "far-post") {
      return clampToPitch({
        x: penaltySpot.x + sign * 3.8,
        y: pitch.width / 2 - farPostSide * 10.5,
      }, 1.5);
    }
    if (variant === "cutback") {
      return clampToPitch({
        x: penaltySpot.x - sign * 3.5,
        y: pitch.width / 2 + farPostSide * 2.5,
      }, 1.5);
    }
    return clampToPitch({
      x: penaltySpot.x + sign * 0.8,
      y: pitch.width / 2 - farPostSide * 4.2,
    }, 1.5);
  }

  function getCornerDeliveryTarget(teamId, sideY = 0, slot = "penaltySpot") {
    const sign = getAttackDirectionSign(teamId);
    const sideSign = sideY <= pitch.width / 2 ? -1 : 1;
    const penaltySpot = getOpponentPenaltySpot(teamId);
    const points = {
      nearPost: {
        x: penaltySpot.x + sign * 4.9,
        y: pitch.width / 2 + sideSign * 4.6,
      },
      farPost: {
        x: penaltySpot.x + sign * 4.2,
        y: pitch.width / 2 - sideSign * 7.8,
      },
      penaltySpot: {
        x: penaltySpot.x - sign * 0.4,
        y: pitch.width / 2 - sideSign * 0.8,
      },
      edge: {
        x: penaltySpot.x - sign * 8.4,
        y: pitch.width / 2 - sideSign * 3.2,
      },
      short: {
        x: teamId === "home" ? pitch.length - 9.4 : 9.4,
        y: sideY <= pitch.width / 2 ? 2.8 : pitch.width - 2.8,
      },
    };
    return clampToPitch(points[slot] ?? points.penaltySpot, 1.3);
  }

  function chooseCornerDeliveryRunner(teamId, target, carrierId = null, slot = "penaltySpot") {
    const state = getState();
    const slotRoleBonus = {
      nearPost: { striker: 0.3, secondStriker: 0.24, wideForward: 0.12, connector: 0.08 },
      farPost: { wideForward: 0.26, striker: 0.22, secondStriker: 0.2, connector: 0.1 },
      penaltySpot: { striker: 0.22, connector: 0.18, secondStriker: 0.18, wideForward: 0.12 },
      edge: { connector: 0.28, pivot: 0.24, wideBack: 0.1 },
      short: { wideBack: 0.26, wideForward: 0.24, connector: 0.18 },
    };
    return state.players
      .filter((player) => player.team === teamId && player.id !== carrierId && !isGoalkeeper(player))
      .map((player) => {
        const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
        const roleFit = slotRoleBonus[slot]?.[roleKey] ?? 0;
        const runnerStrength = getAutoPilotRoleStrength(player, "runner");
        const finisherStrength = getAutoPilotRoleStrength(player, "finisher");
        const receiverStrength = getAutoPilotRoleStrength(player, "receiver");
        const gap = distance(player.position, target);
        const timeToTarget = computeTimeToCoverDistance(player, gap, target);
        const score =
          0.5 +
          roleFit +
          runnerStrength * 0.32 +
          finisherStrength * 0.28 +
          receiverStrength * 0.18 -
          timeToTarget * 0.08 -
          gap * 0.006;
        return {
          player,
          roleKey,
          gap,
          timeToTarget,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)[0] ?? null;
  }

  function getFreeKickDeliveryTarget(teamId, freeKickPoint, slot = "penaltySpot") {
    const sign = getAttackDirectionSign(teamId);
    const sideSign = getWideSideSign(freeKickPoint) || 1;
    const penaltySpot = getOpponentPenaltySpot(teamId);
    const points = {
      nearPost: {
        x: penaltySpot.x + sign * 4.6,
        y: pitch.width / 2 + sideSign * 5.3,
      },
      farPost: {
        x: penaltySpot.x + sign * 4.1,
        y: pitch.width / 2 - sideSign * 9.2,
      },
      penaltySpot: {
        x: penaltySpot.x - sign * 0.7,
        y: pitch.width / 2 - sideSign * 1.2,
      },
      edge: {
        x: penaltySpot.x - sign * 8.6,
        y: pitch.width / 2 - sideSign * 4.8,
      },
    };
    return clampToPitch(points[slot] ?? points.penaltySpot, 1.5);
  }

  function chooseFreeKickShortReceiver(teamId, carrier, startPoint, profile) {
    const state = getState();
    const formation = teams[teamId]?.formation;
    return state.players
      .filter((receiver) => receiver.team === teamId && receiver.id !== carrier.id && !isGoalkeeper(receiver))
      .map((receiver) => {
        const target = getPlayerBallControlPoint(receiver);
        const passDistance = distance(startPoint, target);
        const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
        const roleKey = getOffensiveRoleKey(receiver, formation);
        const laneClarity = computePassLaneClarity(carrier, target);
        const receiverPressure = getPlayerPressureLoad(receiver, target);
        const roleFit =
          roleKey === "connector"
            ? 0.38
            : roleKey === "pivot"
              ? 0.34
              : roleKey === "wideBack"
                ? 0.28
                : roleKey === "wideForward"
                  ? 0.16
                  : 0.08;
        const score =
          1.5 +
          roleFit +
          laneClarity * 0.74 +
          profile.shortSupport * 0.52 +
          getAutoPilotRoleStrength(receiver, "receiver") * 0.28 -
          receiverPressure * 0.46 -
          Math.abs(passDistance - 10.5) * 0.04 -
          (forwardGain < -8 ? 0.18 : 0);
        return {
          receiver,
          roleKey,
          target,
          passDistance,
          forwardGain,
          laneClarity,
          receiverPressure,
          score,
        };
      })
      .filter((candidate) => (
        candidate.passDistance >= 4.5 &&
        candidate.passDistance <= 18 &&
        candidate.laneClarity >= 0.34 &&
        candidate.receiverPressure <= 0.76
      ))
      .sort((a, b) => b.score - a.score)[0] ?? null;
  }

  return {
    getAutoPilotShotTarget,
    getAutoPilotBoxTarget,
    getCornerDeliveryTarget,
    chooseCornerDeliveryRunner,
    getFreeKickDeliveryTarget,
    chooseFreeKickShortReceiver,
  };
}
