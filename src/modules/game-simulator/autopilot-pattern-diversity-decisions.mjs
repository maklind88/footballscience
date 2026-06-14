export function createGameSimulatorAutopilotPatternDiversityDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getAttackingThirdKey,
    getAutoPilotCandidatePattern,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getPlayerTendency,
    getRecentLaneRepeatCount,
    getRecentPossessionSteps,
    getRecordedStepDuration,
    getRecordedStepPattern,
    isTransitionAttackStyle,
    uniquePrincipleLabels,
  } = deps;

  function getAutoPilotPatternDiversityAdjustment(candidate, carrier, startPoint, profile) {
    const recent = getRecentPossessionSteps(carrier.team, 7)
      .map((step) => getRecordedStepPattern(step, carrier.team))
      .filter(Boolean);
    if (!recent.length) {
      return { score: 0, labels: [] };
    }
    const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
    const sameFamilyCount = recent.filter((entry) => entry.family === pattern.family).length;
    const sameLaneCount = recent.filter((entry) => entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey).length;
    const sameReceiverRoleCount = pattern.receiverRoleKey
      ? recent.filter((entry) => entry.receiverRoleKey === pattern.receiverRoleKey).length
      : 0;
    const sameSpaceCount = recent.filter((entry) => entry.targetSpaceLabel === pattern.targetSpaceLabel).length;
    const lastPattern = recent[0];
    let consecutiveFamily = 0;
    let consecutiveLane = 0;
    let consecutiveLastLane = 0;
    for (const entry of recent) {
      if (entry.family === pattern.family) {
        consecutiveFamily += 1;
      } else {
        break;
      }
    }
    for (const entry of recent) {
      if (entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey) {
        consecutiveLane += 1;
      } else {
        break;
      }
    }
    for (const entry of recent) {
      if (lastPattern && entry.laneKey === lastPattern.laneKey && entry.thirdKey === lastPattern.thirdKey) {
        consecutiveLastLane += 1;
      } else {
        break;
      }
    }
    const identityFamily =
      ((profile.styleKey === "wing-play" || profile.styleKey === "overlap-wide") &&
        ["wide-overload", "cross", "cutback", "switch"].includes(pattern.family)) ||
      ((profile.styleKey === "control-possession" || profile.styleKey === "tiki-taka" || profile.styleKey === "fluid-combinations") &&
        ["support-link", "line-break", "switch", "cutback"].includes(pattern.family)) ||
      (isTransitionAttackStyle(profile.styleKey) &&
        ["line-break", "carry-forward", "front-line", "shot"].includes(pattern.family));
    const familyTolerance = identityFamily ? 0.58 : 1;
    const highValueException =
      candidate.actionType === "shot" ||
      candidate.isBoxPass ||
      candidate.mustShoot ||
      candidate.isLineBreak ||
      getPitchThreatProfile(candidate.target, carrier.team).value >= 0.68;
    const stalePatternPenalty = highValueException
      ? 0
      : clamp(
          sameFamilyCount * 0.055 * familyTolerance +
            consecutiveFamily * 0.16 * familyTolerance +
            sameLaneCount * 0.045 +
            consecutiveLane * 0.13 +
            sameReceiverRoleCount * 0.035 +
            sameSpaceCount * 0.035,
          0,
          0.92
        );
    const laneShiftFromLast = lastPattern
      ? Math.abs(getPitchLaneIndex(pattern.laneKey) - getPitchLaneIndex(lastPattern.laneKey))
      : 0;
    const rhythmChangeBonus =
      ((consecutiveLane >= 2 || consecutiveLastLane >= 2) && laneShiftFromLast >= 2 ? 0.22 + profile.switchBias * 0.16 : 0) +
      (consecutiveFamily >= 2 && pattern.family !== lastPattern?.family ? 0.16 + profile.tempo * 0.08 : 0) +
      (recent.filter((entry) => entry.family === "recycle").length >= 1 && pattern.forwardGain >= 6
        ? 0.14 + profile.progressionUrgency * 0.18
        : 0);
    const labels = [];
    if (rhythmChangeBonus >= 0.18) {
      labels.push("Change rhythm");
    }
    if ((consecutiveLane >= 2 || consecutiveLastLane >= 2) && laneShiftFromLast >= 2) {
      labels.push("Move the block");
    }
    return {
      score: clamp(rhythmChangeBonus - stalePatternPenalty, -0.95, 0.58),
      labels: uniquePrincipleLabels(labels),
      pattern,
    };
  }

  function getAutoPilotRepetitionPenalty(candidate, carrier, startPoint, profile) {
    const recent = getRecentPossessionSteps(carrier.team, 5);
    if (!recent.length) {
      return 0;
    }
    const targetLane = getPitchLaneKey(candidate.target);
    const targetThird = getAttackingThirdKey(candidate.target, carrier.team);
    const sameLaneRepeats = getRecentLaneRepeatCount(carrier.team, targetLane, targetThird, 4);
    const lastStep = recent[0];
    const lastCarrierId = lastStep.beforeSnapshot?.ball?.ownerPlayerId ?? lastStep.carrierPlayerId ?? null;
    const lastReceiverId = lastStep.receiverPlayerId ?? null;
    const pressure = getPlayerPressureLoad(carrier, startPoint);
    const passDistance = distance(startPoint, candidate.target);
    let penalty = sameLaneRepeats * 0.24;
    if (lastStep.target && distance(lastStep.target, candidate.target) <= 7) {
      penalty += 0.52;
    }
    if (
      candidate.actionType === "pass" &&
      candidate.receiverPlayerId &&
      lastCarrierId === candidate.receiverPlayerId &&
      lastReceiverId === carrier.id
    ) {
      const wallPassAllowance =
        profile.tempo >= 0.72 &&
        getPlayerTendency(carrier, "passAndMove") >= 0.62 &&
        pressure >= 0.42;
      penalty += wallPassAllowance ? 0.26 : 1.05;
    }
    if (
      candidate.actionType === "pass" &&
      candidate.receiverPlayerId &&
      candidate.receiverPlayerId === lastReceiverId &&
      pressure < 0.58
    ) {
      penalty += 0.42;
    }
    const recentShortSameZone = recent
      .slice(0, 3)
      .filter((step) => step.target && getPitchLaneKey(step.target) === targetLane && getRecordedStepDuration(step) <= 1.4)
      .length;
    if (candidate.actionType === "pass" && passDistance <= 13 && recentShortSameZone >= 2) {
      penalty += 0.5;
    }
    if (candidate.actionType === "dribble" && lastStep.actionType === "dribble" && sameLaneRepeats >= 1) {
      penalty += 0.35;
    }
    if (candidate.actionType === "shot") {
      const recentShots = recent.filter((step) => step.actionType === "shot").length;
      const isLongShot = (candidate.goalDistance ?? passDistance) > 27;
      if (lastStep.actionType === "shot") {
        penalty += candidate.mustShoot && !isLongShot ? 0.35 : isLongShot ? 3.4 : 1.45;
      }
      if (lastStep.target && isLongShot && distance(lastStep.target, candidate.target) <= 7) {
        penalty += 2.25;
      }
      if (recentShots >= 1 && isLongShot) {
        penalty += recentShots * 1.55;
      }
      if (recentShots >= 2 && !candidate.insideBox) {
        penalty += 1.65;
      }
    }
    return penalty;
  }

  return {
    getAutoPilotPatternDiversityAdjustment,
    getAutoPilotRepetitionPenalty,
  };
}
