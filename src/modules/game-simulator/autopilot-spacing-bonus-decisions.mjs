export function createGameSimulatorAutopilotSpacingBonusDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getAttackDirectionSign,
    getAttackingThirdKey,
    getPitchLaneIndex,
    getPitchLaneKey,
    getRecentLaneRepeatCount,
  } = deps;

  function getAutoPilotSpacingBonus(candidate, carrier, startPoint, profile) {
    const startLaneIndex = getPitchLaneIndex(startPoint);
    const targetLaneKey = getPitchLaneKey(candidate.target);
    const targetLaneIndex = getPitchLaneIndex(targetLaneKey);
    const laneShift = Math.abs(targetLaneIndex - startLaneIndex);
    const passDistance = distance(startPoint, candidate.target);
    const forwardGain =
      candidate.forwardGain ??
      ((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
    const targetThird = getAttackingThirdKey(candidate.target, carrier.team);
    const repeatedLane = getRecentLaneRepeatCount(carrier.team, targetLaneKey, targetThird, 4);
    const isWideLane = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
    const isNonProgressiveLaneShift =
      candidate.actionType === "pass" &&
      Math.abs(forwardGain) < 4 &&
      passDistance < 24 &&
      !candidate.isSwitch;
    const lateralMultiplier = isNonProgressiveLaneShift
      ? clamp(profile.sidewaysTolerance + profile.switchBias * 0.22, 0.24, 0.86)
      : 1;
    let bonus = 0;
    if (laneShift >= 2 && passDistance >= 15) {
      bonus += (0.28 + profile.switchBias * 0.34 + repeatedLane * 0.12) * lateralMultiplier;
    }
    if (isWideLane && candidate.actionType === "pass") {
      bonus += (0.16 + profile.crossBias * 0.18 + profile.widthDiscipline * 0.2) * lateralMultiplier;
    }
    if (candidate.actionType === "pass" && passDistance >= 8 && passDistance <= 20 && laneShift >= 1) {
      bonus += (0.16 + profile.shortSupport * 0.14) * lateralMultiplier;
    }
    if (candidate.actionType === "dribble" && laneShift >= 1) {
      bonus += 0.12 + profile.carryBias * 0.16;
    }
    return bonus;
  }

  return {
    getAutoPilotSpacingBonus,
  };
}
