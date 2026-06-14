export function createGameSimulatorAutopilotFlowDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAutoPilotFlowContext,
    getAutoPilotRegainContext,
    getForwardProgressionWindow,
    getLastAutoPrincipleSet,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPlayerById,
    getPossessionRhythmContext,
    isFrontLineRole,
    isSupportRole,
    principleSetIncludes,
    teams,
  } = deps;

  function getAutoPilotFlowAdjustment(candidate, carrier, startPoint, profile) {
    const flow = getAutoPilotFlowContext(carrier, startPoint);
    const rhythm = getPossessionRhythmContext(carrier.team);
    const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
    const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
    const lastPrinciples = getLastAutoPrincipleSet(carrier.team);
    const possessionMaturity = clamp(
      rhythm.duration / Math.max(profile.targetPossessionSeconds ?? 8.8, 0.1),
      0,
      1.45
    );
    const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
    const receiverRoleKey =
      candidate.receiverRoleKey ??
      (receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
    const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
    const forwardGain =
      candidate.forwardGain ??
      ((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
    const targetLaneKey = getPitchLaneKey(candidate.target);
    const targetIsWide = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
    let adjustment = 0;
    if (candidate.actionType === "dribble") {
      if (progressionWindow.active && forwardGain >= 4) {
        adjustment += 0.28 + progressionWindow.openLane * 0.26 + progressionWindow.urgency * 0.18;
      }
      if (regain.active) {
        adjustment +=
          regain.counterIntent * regain.freshness * 0.34 +
          (forwardGain >= 6 ? regain.forwardOpenSpace * 0.24 : 0) -
          (forwardGain < 2 && regain.pressure <= 0.42 ? 0.22 : 0);
      }
      const previousWideQuestion =
        principleSetIncludes(lastPrinciples, "Ask question wide") ||
        principleSetIncludes(lastPrinciples, "overlap") ||
        principleSetIncludes(lastPrinciples, "wide");
      const previousHighValue =
        principleSetIncludes(lastPrinciples, "central pocket") ||
        principleSetIncludes(lastPrinciples, "valuable space") ||
        principleSetIncludes(lastPrinciples, "between-lines") ||
        principleSetIncludes(lastPrinciples, "cutback");
      if (
        previousWideQuestion &&
        (flow.carrierRoleKey === "wideForward" || flow.carrierRoleKey === "wideBack") &&
        forwardGain >= 3
      ) {
        adjustment += 0.34 + profile.dribbleBias * 0.2;
      }
      if (previousHighValue && forwardGain >= 4 && flow.pressure <= 0.62) {
        adjustment += 0.22 + profile.progressionUrgency * 0.18;
      }
      if (flow.carrierJustReceived) {
        adjustment += 0.72 + profile.carryBias * 0.28;
      }
      if (flow.consecutivePasses >= 2) {
        adjustment += 0.44 + Math.min(flow.consecutivePasses, 4) * 0.11;
      }
      if (isFrontLineRole(flow.carrierRoleKey) && flow.recentFrontLineTargets >= 2) {
        adjustment += 0.24;
      }
      if (profile.directness < 0.45 && flow.pressure <= 0.45) {
        adjustment += 0.14;
      }
      if (rhythm.sidewaysPasses >= 2 && profile.progressionUrgency >= 0.48) {
        adjustment += 0.28 + profile.progressionUrgency * 0.22;
      }
      return adjustment;
    }
    if (candidate.actionType !== "pass") {
      return adjustment;
    }
    const previousWideQuestion =
      principleSetIncludes(lastPrinciples, "Ask question wide") ||
      principleSetIncludes(lastPrinciples, "overlap") ||
      principleSetIncludes(lastPrinciples, "wide");
    const previousThirdPlayer = principleSetIncludes(lastPrinciples, "Find the Third");
    const previousChangeCorridor = principleSetIncludes(lastPrinciples, "Change corridor");
    const previousHighValue =
      principleSetIncludes(lastPrinciples, "central pocket") ||
      principleSetIncludes(lastPrinciples, "valuable space") ||
      principleSetIncludes(lastPrinciples, "between-lines") ||
      principleSetIncludes(lastPrinciples, "cutback");
    if (regain.active) {
      if (forwardGain >= 7 && (candidate.isLineBreak || isFrontLineRole(receiverRoleKey) || candidate.receiverPlayerId === null)) {
        adjustment += 0.2 + regain.counterIntent * regain.freshness * 0.48;
      }
      if (passDistance <= 19 && (isSupportRole(receiverRoleKey) || receiverRoleKey === "wideBack")) {
        adjustment += 0.16 + regain.secureIntent * regain.freshness * 0.34;
      }
      if (
        forwardGain <= -6 &&
        regain.pressure <= 0.42 &&
        profile.directness >= 0.58 &&
        !candidate.isSwitch
      ) {
        adjustment -= 0.32 + regain.counterIntent * 0.24;
      }
    }
    if (progressionWindow.active) {
      const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
      if (forwardGain >= 5 && (candidate.isLineBreak || actionSpace.lineBreakCount >= 1 || actionSpace.value >= 0.36)) {
        adjustment += 0.24 + actionSpace.value * 0.34 + progressionWindow.urgency * 0.2;
      }
      if (
        forwardGain < 2 &&
        !candidate.isSwitch &&
        actionSpace.value < 0.28 &&
        flow.pressure < 0.56
      ) {
        adjustment -= 0.36 + progressionWindow.urgency * 0.34;
      }
    }
    if (candidate.isPrinciplePattern) {
      adjustment += 0.32;
      if (candidate.principleKey === "wide-overlap-entry" && profile.overlapBias >= 0.56) {
        adjustment += 0.24 + profile.widthDiscipline * 0.18;
      }
      if (candidate.principleKey === "wide-overlap" && flow.carrierJustReceived) {
        adjustment += 0.42 + profile.overlapBias * 0.18;
      }
    }
    if (previousWideQuestion) {
      if (receiverRoleKey === "wideBack" && forwardGain >= -1) {
        adjustment += 0.46 + profile.overlapBias * 0.28;
      }
      if (candidate.label === "cutback" || candidate.label === "cross" || candidate.isBoxPass) {
        adjustment += 0.36 + profile.deliveryBias * 0.24;
      }
      if (
        receiverRoleKey === "wideForward" &&
        candidate.passDistance <= 16 &&
        !candidate.isLineBreak &&
        !candidate.isSwitch &&
        flow.pressure < 0.52
      ) {
        adjustment -= 0.34;
      }
    }
    if (previousThirdPlayer) {
      if (forwardGain >= 6 || candidate.isLineBreak || candidate.isBoxPass) {
        adjustment += 0.42 + profile.lineBreakBias * 0.24;
      }
      if (forwardGain <= -5 && flow.pressure < 0.48) {
        adjustment -= 0.32;
      }
    }
    if (previousChangeCorridor) {
      if (isFrontLineRole(receiverRoleKey) || targetIsWide || candidate.isBoxPass) {
        adjustment += 0.22 + profile.progressionUrgency * 0.18;
      }
      if (candidate.isSwitch && flow.pressure < 0.44) {
        adjustment -= 0.38;
      }
    }
    if (previousHighValue) {
      if (forwardGain >= 3 || candidate.isBoxPass || candidate.actionType === "shot") {
        adjustment += 0.2 + profile.progressionUrgency * 0.14;
      }
      if (forwardGain < -4 && flow.pressure < 0.54) {
        adjustment -= 0.26;
      }
    }
    if (flow.carrierJustReceived && !candidate.isLineBreak && !candidate.isSwitch && flow.pressure < 0.58) {
      adjustment -= 0.5;
    }
    if (flow.consecutivePasses >= 3 && !candidate.isLineBreak && !candidate.isSwitch && flow.pressure < 0.62) {
      adjustment -= 0.55 + Math.min(flow.consecutivePasses - 2, 3) * 0.18;
    }
    if (candidate.isSidewaysPass && rhythm.sidewaysPasses >= Math.max(1, Math.round(profile.sidewaysTolerance * 3))) {
      adjustment -= 0.46 + profile.progressionUrgency * 0.48 + possessionMaturity * 0.28;
    }
    if ((candidate.isLineBreak || candidate.isBoxPass) && possessionMaturity >= 0.34) {
      adjustment += 0.26 + profile.progressionUrgency * 0.44;
    }
    if (forwardGain <= -5 && rhythm.backPasses >= 1 && rhythm.forwardPasses === 0 && rhythm.steps >= 2) {
      adjustment -= 0.24 + profile.progressionUrgency * 0.34;
    }
    if (receiverRoleKey) {
      const roleRepeatCount = flow.receiverRoleCounts.get(receiverRoleKey) ?? 0;
      adjustment -= Math.min(roleRepeatCount, 3) * 0.18;
      if (
        isFrontLineRole(receiverRoleKey) &&
        flow.recentFrontLineTargets >= 2 &&
        profile.phaseKey !== "finalThird" &&
        !candidate.isLineBreak &&
        !candidate.isSwitch
      ) {
        adjustment -= 1.15;
      }
      if (
        isFrontLineRole(flow.carrierRoleKey) &&
        isFrontLineRole(receiverRoleKey) &&
        profile.phaseKey !== "finalThird" &&
        !candidate.isSwitch
      ) {
        adjustment -= 0.85;
      }
      if (isSupportRole(receiverRoleKey) && flow.recentFrontLineTargets >= 2 && passDistance <= 26) {
        adjustment += 0.86;
      }
      if (receiverRoleKey === "pivot" && profile.shortSupport >= 0.72 && passDistance <= 20) {
        adjustment += 0.45;
      }
      if (receiverRoleKey === "connector" && profile.shortSupport >= 0.64 && passDistance <= 22) {
        adjustment += 0.38;
      }
      if (receiverRoleKey === "wideBack" && (profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.68)) {
        adjustment += 0.45;
      }
    }
    if (targetIsWide && flow.recentWideTargets === 0) {
      adjustment += 0.28 + profile.widthDiscipline * 0.18;
    }
    if (
      flow.lastCarrierId === candidate.receiverPlayerId &&
      flow.lastReceiverId === carrier.id &&
      flow.pressure < 0.48 &&
      !candidate.isLineBreak
    ) {
      adjustment -= 0.42;
    }
    return adjustment;
  }

  return {
    getAutoPilotFlowAdjustment,
  };
}
