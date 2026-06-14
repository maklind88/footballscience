export function createGameSimulatorAutopilotCandidatePrincipleMetricsDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getActionThreatGain,
    getAttackDirectionSign,
    getAttackingDepth,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getPlayerTendency,
    pitch,
    teams,
  } = deps;

  function getAutoPilotCandidatePrincipleMetrics(candidate, carrier, startPoint, profile, model) {
    const targetLaneKey = getPitchLaneKey(candidate.target);
    const startLaneKey = getPitchLaneKey(startPoint);
    const laneShift = Math.abs(getPitchLaneIndex(targetLaneKey) - getPitchLaneIndex(startLaneKey));
    const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
    const forwardGain =
      candidate.forwardGain ??
      ((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
    const targetDepth = getAttackingDepth(candidate.target, carrier.team);
    const targetIsWide = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
    const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
    const receiverRoleKey =
      candidate.receiverRoleKey ??
      (receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
    const goalDistance = distance(startPoint, getOpponentGoalCenter(carrier.team));
    const targetGoalDistance = distance(candidate.target, getOpponentGoalCenter(carrier.team));
    const receiverPressure = Number.isFinite(candidate.receiverPressure)
      ? candidate.receiverPressure
      : receiver
      ? getPlayerPressureLoad(receiver, candidate.target)
      : 0.35;
    const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
    const threatGain = getActionThreatGain(startPoint, candidate.target, carrier.team);
    const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
    const centralPocketScore = targetThreat.centralPocket;
    const supportRole = receiverRoleKey === "pivot" || receiverRoleKey === "connector" || receiverRoleKey === "secondStriker";
    const forwardRole = receiverRoleKey === "striker" || receiverRoleKey === "wideForward" || receiverRoleKey === "secondStriker";
    const isLongForwardPass = candidate.actionType === "pass" && passDistance >= 26 && forwardGain >= 8;
    const insideBoxShot = candidate.actionType === "shot" && (candidate.insideBox || goalDistance <= 22);
    const metrics = {
      secure: 0,
      attractPressure: 0,
      goldenZone: 0,
      breakLine: 0,
      thirdPlayer: 0,
      switchPlay: 0,
      wideOverload: 0,
      overlapUnderlap: 0,
      driveSpace: 0,
      isolate1v1: 0,
      boxDelivery: 0,
      cutback: 0,
      shoot: 0,
      secondBall: 0,
      counterAttack: 0,
      restDefence: 0,
    };
    if (candidate.actionType === "pass") {
      metrics.secure = clamp(
        (passDistance <= 18 ? 0.62 : 0.26) +
          (receiverPressure <= 0.52 ? 0.24 : 0) +
          (forwardGain >= -7 ? 0.12 : -0.16) +
          (supportRole ? 0.18 : 0),
        0,
        1
      );
      metrics.attractPressure = clamp(
        (Math.abs(forwardGain) < 4 && passDistance <= 16 ? 0.42 : 0) +
          (model.flow.pressure >= 0.46 ? 0.24 : 0) +
          (supportRole ? 0.18 : 0),
        0,
        1
      );
      metrics.breakLine = clamp(
        (candidate.isLineBreak ? 0.76 : 0) +
          clamp(forwardGain / 18, 0, 0.62) +
          (forwardRole && targetDepth >= model.ballDepth + 6 ? 0.2 : 0) +
          clamp(actionSpace.lineBreakCount / 3, 0, 1) * 0.22,
        0,
        1
      );
      metrics.goldenZone = clamp(
        centralPocketScore * 0.68 +
          targetThreat.betweenLines * 0.24 +
          targetThreat.cutbackZone * 0.18 +
          Math.max(0, threatGain) * 0.24 +
          actionSpace.value * 0.16 +
          (forwardGain >= 5 ? 0.16 : 0) +
          (receiverPressure <= 0.56 ? 0.12 : 0) +
          (model.forwardFacingSpaceTwo.active && forwardGain >= 2 ? 0.2 : 0) +
          (model.progressionWindow?.active && forwardGain >= 3 ? 0.16 : 0),
        0,
        1
      );
      metrics.thirdPlayer = clamp(
        (supportRole && passDistance <= 24 ? 0.48 : 0) +
          (model.flow.consecutivePasses >= 1 || model.flow.carrierJustReceived ? 0.28 : 0) +
          (receiver ? getPlayerTendency(receiver, "passAndMove") * 0.22 : 0),
        0,
        1
      );
      metrics.switchPlay = clamp(
        (candidate.isSwitch ? 0.78 : 0) +
          (laneShift >= 2 && passDistance >= 16 ? 0.42 : 0) +
          (model.rhythm.sidewaysPasses >= 1 ? 0.22 : 0),
        0,
        1
      );
      metrics.wideOverload = clamp(
        (targetIsWide && (receiverRoleKey === "wideForward" || receiverRoleKey === "wideBack") ? 0.58 : 0) +
          (candidate.isPrinciplePattern ? 0.32 : 0) +
          (targetDepth >= 42 ? 0.14 : 0),
        0,
        1
      );
      metrics.overlapUnderlap = clamp(
        (candidate.principleKey === "wide-overlap" || candidate.principleKey === "wide-overlap-entry" ? 0.86 : 0) +
          (receiverRoleKey === "wideBack" && targetIsWide && forwardGain >= -1 ? 0.28 : 0),
        0,
        1
      );
      metrics.isolate1v1 = clamp(
        (receiverRoleKey === "wideForward" && targetIsWide && targetDepth >= 48 ? 0.48 : 0) +
          (candidate.laneClarity >= 0.72 ? 0.16 : 0),
        0,
        1
      );
      metrics.boxDelivery = clamp(
        (candidate.isBoxPass ? 0.62 : 0) +
          (candidate.label === "cross" ? 0.76 : 0) +
          targetThreat.assistZone * 0.26 +
          (targetDepth >= 72 && Math.abs(candidate.target.y - pitch.width / 2) <= 18 ? 0.28 : 0),
        0,
        1
      );
      metrics.cutback = candidate.label === "cutback" ? 1 : 0;
      metrics.secondBall = clamp(
        (isLongForwardPass && (receiverRoleKey === "striker" || receiverRoleKey === "secondStriker") ? 0.68 : 0) +
          (isLongForwardPass ? clamp(candidate.supportNearTarget ?? 0, 0, 3) * 0.12 : 0) +
          (profile.routeOneBias >= 0.55 ? 0.22 : 0),
        0,
        1
      );
      metrics.counterAttack = clamp(
        (forwardGain >= 10 && passDistance >= 12 ? 0.44 : 0) +
          (targetGoalDistance <= goalDistance - 8 ? 0.32 : 0) +
          (profile.directness >= 0.68 ? 0.18 : 0) +
          (actionSpace.openTarget >= 0.62 && forwardGain >= 7 ? 0.16 : 0),
        0,
        1
      );
      metrics.restDefence = clamp(
        ((receiverRoleKey === "pivot" || receiverRoleKey === "rest" || receiverRoleKey === "gk") && targetDepth <= 58 ? 0.56 : 0) +
          (forwardGain <= -4 && model.rhythm.steps <= 1 ? 0.22 : 0),
        0,
        1
      );
    }
    if (candidate.actionType === "dribble") {
      metrics.driveSpace = clamp(
        (forwardGain >= 4.5 ? 0.46 : 0) +
          (targetGoalDistance <= goalDistance - 3 ? 0.26 : 0) +
          Math.max(0, threatGain) * 0.28 +
          actionSpace.value * 0.18 +
          (model.flow.pressure <= 0.58 ? 0.18 : 0) +
          getPlayerTendency(carrier, "dribble") * 0.18,
        0,
        1
      );
      metrics.goldenZone = clamp(
        centralPocketScore * 0.58 +
          targetThreat.betweenLines * 0.22 +
          targetThreat.halfSpace * 0.16 +
          Math.max(0, threatGain) * 0.28 +
          (model.forwardFacingSpaceTwo.active && forwardGain >= 3 ? 0.26 : 0) +
          (targetGoalDistance <= goalDistance - 4 ? 0.12 : 0),
        0,
        1
      );
      metrics.breakLine = clamp(forwardGain / 18, 0, 0.72);
      metrics.breakLine = clamp(metrics.breakLine + clamp(actionSpace.lineBreakCount / 3, 0, 1) * 0.18, 0, 1);
      metrics.isolate1v1 = clamp(
        ((model.carrierRoleKey === "wideForward" || model.carrierRoleKey === "wideBack") && targetIsWide ? 0.52 : 0) +
          (model.flow.pressure >= 0.28 && model.flow.pressure <= 0.68 ? 0.16 : 0),
        0,
        1
      );
      metrics.counterAttack = clamp(
        (targetGoalDistance <= goalDistance - 7 ? 0.48 : 0) +
          (profile.directness >= 0.62 ? 0.22 : 0) +
          (forwardGain >= 10 ? 0.18 : 0),
        0,
        1
      );
    }
    if (candidate.actionType === "shot") {
      metrics.shoot = clamp(
        (insideBoxShot ? 0.82 : 0.38) +
          (candidate.mustShoot ? 0.28 : 0) +
          (candidate.laneClarity >= 0.45 ? 0.16 : 0),
        0,
        1
      );
      metrics.goldenZone = clamp(getPitchThreatProfile(startPoint, carrier.team).centralPocket * 0.74, 0, 1);
      metrics.cutback = insideBoxShot && model.rhythm.lastStep?.label === "cutback" ? 0.42 : 0;
    }
    if (model.regain?.active) {
      const transitionForce = model.regain.freshness;
      const counterFit = model.regain.counterIntent * transitionForce;
      const secureFit = model.regain.secureIntent * transitionForce;
      if (candidate.actionType === "pass") {
        metrics.secure = clamp(
          metrics.secure +
            secureFit * (passDistance <= 19 && receiverPressure <= 0.68 ? 0.46 : 0.16) +
            (supportRole ? 0.18 : 0),
          0,
          1.12
        );
        metrics.thirdPlayer = clamp(metrics.thirdPlayer + (supportRole ? secureFit * 0.2 : 0), 0, 1.08);
        metrics.counterAttack = clamp(
          metrics.counterAttack +
            counterFit * (forwardGain >= 6 ? 0.52 : 0.12) +
            (candidate.principleKey === "regain-forward-release" ? 0.38 : 0) +
            (targetGoalDistance <= goalDistance - 8 ? 0.16 : 0),
          0,
          1.15
        );
        metrics.breakLine = clamp(metrics.breakLine + counterFit * (candidate.isLineBreak ? 0.28 : 0.1), 0, 1.12);
        metrics.restDefence = clamp(
          metrics.restDefence +
            (forwardGain <= -3 && (receiverRoleKey === "pivot" || receiverRoleKey === "rest" || receiverRoleKey === "gk")
              ? secureFit * 0.24
              : 0),
          0,
          1.08
        );
      }
      if (candidate.actionType === "dribble") {
        metrics.driveSpace = clamp(metrics.driveSpace + counterFit * 0.34 + model.regain.forwardOpenSpace * 0.14, 0, 1.1);
        metrics.counterAttack = clamp(metrics.counterAttack + counterFit * (forwardGain >= 6 ? 0.34 : 0.08), 0, 1.08);
      }
      if (candidate.actionType === "shot") {
        metrics.shoot = clamp(metrics.shoot + counterFit * 0.16 + (goalDistance <= 28 ? 0.12 : 0), 0, 1.08);
      }
    }
    return metrics;
  }

  return {
    getAutoPilotCandidatePrincipleMetrics,
  };
}
