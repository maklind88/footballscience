export function createGameSimulatorAutopilotAdvantageRetentionDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getNearestOpponentGap,
    getOpponentGoalCenter,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getPossessionRhythmContext,
    getShotWindowProfile,
    getTeamSupportCountAroundPoint,
    isPlayerFacingForward,
    uniquePrincipleLabels,
  } = deps;

  function getAutoPilotAdvantageRetentionContext(carrier, startPoint, profile = {}) {
    if (!carrier || !startPoint) {
      return { active: false };
    }
    const teamId = carrier.team;
    const currentThreat = getPitchThreatProfile(startPoint, teamId);
    const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
    const pressure = getPlayerPressureLoad(carrier, startPoint);
    const nearestGap = getNearestOpponentGap(carrier, startPoint);
    const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.25);
    const depth = getAttackingDepth(startPoint, teamId);
    const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
    const rhythm = getPossessionRhythmContext(teamId);
    const pressureMode =
      pressure >= 0.66 || nearestGap <= 2.15
        ? "direct"
        : pressure >= 0.44 || nearestGap <= 4.6
          ? "indirect"
          : "free";
    const inValuableSpace =
      currentSpace.key === "space2" ||
      currentSpace.key === "space3" ||
      currentThreat.betweenLines >= 0.34 ||
      currentThreat.centralPocket >= 0.24 ||
      currentThreat.halfSpace >= 0.38 ||
      currentThreat.box >= 0.14 ||
      currentThreat.cutbackZone >= 0.18;
    const canExploit =
      pressureMode !== "direct" &&
      (
        facingForward ||
        currentThreat.betweenLines >= 0.34 ||
        currentThreat.centralPocket >= 0.24 ||
        currentSpace.key === "space3"
      );
    const advantageStrength = clamp(
      currentThreat.value * 0.52 +
        currentThreat.betweenLines * 0.24 +
        currentThreat.centralPocket * 0.24 +
        currentThreat.halfSpace * 0.14 +
        currentThreat.box * 0.22 +
        currentThreat.cutbackZone * 0.18 +
        currentSpace.index * 0.08 +
        (facingForward ? 0.14 : 0) +
        (pressureMode === "free" ? 0.1 : pressureMode === "indirect" ? 0.04 : -0.08) -
        pressure * 0.16,
      0,
      1.35
    );
    const mustConvert =
      canExploit &&
      (
        currentSpace.key === "space3" ||
        currentThreat.box >= 0.18 ||
        currentThreat.cutbackZone >= 0.24 ||
        (depth >= 66 && goalDistance <= 42)
      );
    const mustAttackNextLine =
      canExploit &&
      !mustConvert &&
      (
        currentSpace.key === "space2" ||
        currentThreat.betweenLines >= 0.34 ||
        currentThreat.centralPocket >= 0.24
      );
    const active = inValuableSpace && (advantageStrength >= 0.26 || currentSpace.index >= 2);
    return {
      active,
      teamId,
      currentThreat,
      currentSpace,
      pressure,
      nearestGap,
      facingForward,
      depth,
      goalDistance,
      rhythm,
      pressureMode,
      inValuableSpace,
      canExploit,
      advantageStrength,
      mustConvert,
      mustAttackNextLine,
    };
  }

  function getAutoPilotAdvantageRetentionAdjustment(candidate, carrier, startPoint, profile = {}) {
    if (!candidate?.target || !carrier || !startPoint) {
      return {
        score: 0,
        labels: [],
        context: null,
      };
    }
    const context = getAutoPilotAdvantageRetentionContext(carrier, startPoint, profile);
    if (!context.active) {
      return {
        score: 0,
        labels: [],
        context,
      };
    }
    const teamId = carrier.team;
    const target = candidate.target;
    const targetThreat = getPitchThreatProfile(target, teamId);
    const targetSpace = getAttackingGameSpaceProfile(target, teamId);
    const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
    const forwardGain =
      candidate.forwardGain ??
      ((target.x - startPoint.x) * getAttackDirectionSign(teamId));
    const passDistance = candidate.passDistance ?? distance(startPoint, target);
    const laneClarity = Number.isFinite(candidate.laneClarity)
      ? candidate.laneClarity
      : candidate.actionType === "pass"
        ? computePassLaneClarity(carrier, target)
        : 0.62;
    const supportNearTarget = getTeamSupportCountAroundPoint(
      teamId,
      target,
      new Set([carrier.id, candidate.receiverPlayerId, candidate.principleRunnerPlayerId].filter(Boolean)),
      passDistance >= 24 ? 15 : 11
    );
    const targetPressure = Number.isFinite(candidate.receiverPressure)
      ? candidate.receiverPressure
      : actionSpace.targetPressure;
    const threatGain = targetThreat.value - context.currentThreat.value;
    const gameSpaceGain = targetSpace.index - context.currentSpace.index;
    const lineBreakAction =
      candidate.isLineBreak ||
      actionSpace.lineBreakCount >= 1 ||
      (gameSpaceGain >= 1 && forwardGain >= 3.5);
    const finalAction =
      candidate.actionType === "shot" ||
      candidate.isBoxPass ||
      targetThreat.box >= 0.24 ||
      targetThreat.cutbackZone >= 0.28 ||
      targetThreat.assistZone >= 0.36 ||
      targetThreat.behindLine >= 0.34;
    const carryAdvantage =
      candidate.actionType === "dribble" &&
      forwardGain >= 3.8 &&
      actionSpace.openTarget >= 0.42;
    const usefulSameSpace =
      candidate.actionType === "pass" &&
      targetSpace.index === context.currentSpace.index &&
      forwardGain >= -1.5 &&
      targetThreat.value >= context.currentThreat.value - 0.035 &&
      (supportNearTarget >= 1 || laneClarity >= 0.58) &&
      passDistance <= 23;
    const purposefulSwitch =
      candidate.isSwitch &&
      targetThreat.value >= context.currentThreat.value - 0.06 &&
      laneClarity >= 0.62 &&
      (profile.switchBias >= 0.58 || context.rhythm.sidewaysPasses >= 1 || targetPressure <= 0.5);
    const lowValueReset =
      candidate.actionType === "pass" &&
      !candidate.isSwitch &&
      !candidate.isBoxPass &&
      forwardGain <= -2.5 &&
      targetSpace.index < context.currentSpace.index &&
      targetThreat.value <= context.currentThreat.value + 0.025 &&
      context.pressureMode !== "direct";
    const sterileSideways =
      candidate.actionType === "pass" &&
      !candidate.isSwitch &&
      !candidate.isBoxPass &&
      Math.abs(forwardGain) < 2.4 &&
      targetSpace.index <= context.currentSpace.index &&
      targetThreat.value <= context.currentThreat.value + 0.035 &&
      actionSpace.lineBreakCount === 0 &&
      context.pressureMode !== "direct";
    const overplayedIntoPressure =
      candidate.actionType !== "shot" &&
      targetPressure >= 0.76 &&
      supportNearTarget <= 0 &&
      laneClarity < 0.52 &&
      !candidate.isBoxPass;
    const labels = [];
    let score = 0;
    if (candidate.actionType === "shot" && context.mustConvert) {
      const shotWindow = getShotWindowProfile(carrier, startPoint, target);
      score += 0.34 + shotWindow.quality * 0.42 + (profile.shootBias ?? 0.5) * 0.12;
      labels.push("Convert advantage");
    }
    if (lineBreakAction || finalAction) {
      score +=
        0.18 +
        context.advantageStrength * 0.18 +
        actionSpace.value * 0.24 +
        Math.max(0, threatGain) * 0.36 +
        (finalAction ? 0.22 : 0) +
        (lineBreakAction ? 0.18 : 0);
      labels.push(context.mustConvert ? "Turn advantage into final action" : "Keep advantage moving forward");
    }
    if (carryAdvantage) {
      score +=
        0.22 +
        (profile.carryBias ?? 0.5) * 0.18 +
        actionSpace.openTarget * 0.18 +
        (context.mustAttackNextLine ? 0.16 : 0);
      labels.push("Carry the advantage");
    }
    if (usefulSameSpace && !lineBreakAction && !finalAction) {
      score += 0.08 + (profile.shortSupport ?? 0.55) * 0.08;
      labels.push("Retain valuable space");
    }
    if (purposefulSwitch) {
      score += 0.12 + (profile.switchBias ?? 0.5) * 0.12;
      labels.push("Switch to keep advantage");
    }
    if (context.mustAttackNextLine && !lineBreakAction && !finalAction && !carryAdvantage && !purposefulSwitch) {
      score -= 0.28 + context.advantageStrength * 0.24;
    }
    if (context.mustConvert && !finalAction && !carryAdvantage && !purposefulSwitch) {
      score -= 0.34 + context.advantageStrength * 0.28 + (profile.shootBias ?? 0.5) * 0.12;
    }
    if (lowValueReset) {
      score -= 0.58 + context.advantageStrength * 0.34 + (profile.progressionUrgency ?? 0.5) * 0.22;
      labels.push("Do not reset the advantage");
    }
    if (sterileSideways) {
      score -= 0.32 + context.advantageStrength * 0.24;
      labels.push("Avoid sterile sideways after advantage");
    }
    if (overplayedIntoPressure) {
      score -= 0.22 + targetPressure * 0.18;
      labels.push("Do not force advantage into pressure");
    }
    if (
      context.rhythm.backPasses >= 1 &&
      context.rhythm.forwardPasses === 0 &&
      (lowValueReset || sterileSideways)
    ) {
      score -= 0.18 + (profile.progressionUrgency ?? 0.5) * 0.14;
    }
    return {
      score: clamp(score, -1.45, 1.35),
      labels: uniquePrincipleLabels(labels),
      context: {
        currentSpaceKey: context.currentSpace.key,
        targetSpaceKey: targetSpace.key,
        pressureMode: context.pressureMode,
        advantageStrength: context.advantageStrength,
        mustConvert: context.mustConvert,
        mustAttackNextLine: context.mustAttackNextLine,
        lineBreakAction,
        finalAction,
        carryAdvantage,
        usefulSameSpace,
        purposefulSwitch,
        lowValueReset,
        sterileSideways,
        targetPressure,
        supportNearTarget,
        laneClarity,
      },
    };
  }

  return {
    getAutoPilotAdvantageRetentionContext,
    getAutoPilotAdvantageRetentionAdjustment,
  };
}
