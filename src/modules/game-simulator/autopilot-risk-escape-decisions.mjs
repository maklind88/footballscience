export function createGameSimulatorAutopilotRiskEscapeDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getAttackDirectionSign,
    getAutoPilotRegainContext,
    getCarryLaneOpenSpaceScore,
    getNearestOpponentGapInCarryLane,
    getOpponentDensityAtPoint,
    getOpponentPressureAtPoint,
    getPassLaneRiskProfile,
    getPitchThreatProfile,
    getTeamDensityAtPoint,
    uniquePrincipleLabels,
  } = deps;

  function getAutoPilotPassLaneDenialAdjustment(candidate, carrier, startPoint, profile = {}) {
    if (!carrier || candidate?.actionType !== "pass" || !candidate.target) {
      return {
        score: 0,
        labels: [],
        context: null,
      };
    }
    const risk = getPassLaneRiskProfile(carrier, candidate.target, {
      receiverPlayerId: candidate.receiverPlayerId ?? null,
    });
    const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
    const laneDanger = clamp(
      Math.max(0, 0.58 - risk.clarity) * 0.7 +
        Math.max(0, risk.timingRisk - 0.48) * 0.46 +
        Math.max(0, risk.coverShadow - 0.9) * 0.14 +
        Math.min(risk.interceptors, 3) * 0.09,
      0,
      1.25
    );
    const valueTolerance = clamp(
      (profile.risk ?? 0.5) * 0.22 +
        targetThreat.value * 0.18 +
        (candidate.isLineBreak ? 0.16 : 0) +
        (candidate.isBoxPass ? 0.16 : 0) +
        (candidate.isSwitch ? 0.12 : 0),
      0.08,
      0.58
    );
    const avoidRisk = Math.max(0, laneDanger - valueTolerance);
    const score =
      avoidRisk > 0
        ? -clamp(avoidRisk * (0.58 + (profile.directness ?? 0.5) * 0.12), 0, 0.72)
        : risk.clarity >= 0.74 && candidate.forwardGain >= 3
          ? 0.04
          : 0;
    const labels = [];
    if (score < -0.08) {
      labels.push("Respect cover shadow");
    }
    if (risk.interceptors >= 1 && risk.clarity <= 0.5) {
      labels.push("Avoid covered lane");
    }
    return {
      score,
      labels: uniquePrincipleLabels(labels),
      context: {
        clarity: risk.clarity,
        timingRisk: risk.timingRisk,
        coverShadow: risk.coverShadow,
        interceptors: risk.interceptors,
        laneDanger,
        valueTolerance,
      },
    };
  }

  function getAutoPilotCounterPressEscapeAdjustment(candidate, carrier, startPoint, profile = {}) {
    if (!carrier || !candidate?.target) {
      return {
        score: 0,
        labels: [],
        context: null,
      };
    }
    const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
    if (!regain.active || regain.freshness < 0.08) {
      return {
        score: 0,
        labels: [],
        context: null,
      };
    }
    const teamId = carrier.team;
    const target = candidate.target;
    const passDistance = candidate.passDistance ?? distance(startPoint, target);
    const forwardGain =
      candidate.forwardGain ??
      ((target.x - startPoint.x) * getAttackDirectionSign(teamId));
    const lossPoint = regain.origin ?? startPoint;
    const startLossDistance = distance(startPoint, lossPoint);
    const targetLossDistance = distance(target, lossPoint);
    const escapeGain = targetLossDistance - startLossDistance;
    const targetRadius = candidate.actionType === "dribble" ? 8.5 : passDistance >= 22 ? 13.5 : 10.5;
    const startPressure = regain.pressure;
    const targetPressure = candidate.receiverPressure ?? getOpponentPressureAtPoint(teamId, target, targetRadius + 2);
    const startOpponentDensity = getOpponentDensityAtPoint(teamId, startPoint, 7.5);
    const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, targetRadius);
    const targetSupport = getTeamDensityAtPoint(
      teamId,
      target,
      targetRadius,
      new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean))
    );
    const laneClarity =
      candidate.actionType === "pass"
        ? candidate.laneClarity ?? computePassLaneClarity(carrier, target, {
            receiverPlayerId: candidate.receiverPlayerId ?? null,
          })
        : getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
    const trapLoad = clamp(
      startPressure * 0.44 +
        Math.min(startOpponentDensity, 4) * 0.13 +
        regain.freshness * 0.26 +
        (regain.reason === "tackle" ? 0.08 : 0),
      0,
      1.25
    );
    const escapesCrowd =
      escapeGain >= 2.8 ||
      targetPressure <= startPressure - 0.16 ||
      targetOpponentDensity <= Math.max(0, startOpponentDensity - 1);
    const safeOutlet =
      candidate.actionType === "pass" &&
      passDistance >= 7 &&
      passDistance <= 24 &&
      laneClarity >= 0.54 &&
      targetPressure <= 0.62 &&
      targetSupport >= 1;
    const transitionRelease =
      candidate.actionType === "pass" &&
      forwardGain >= 7 &&
      laneClarity >= 0.5 &&
      targetPressure <= 0.68 &&
      (profile.directness >= 0.58 || regain.counterIntent >= 0.58);
    const escapeCarry =
      candidate.actionType === "dribble" &&
      forwardGain >= 3 &&
      laneClarity >= 0.5 &&
      (escapesCrowd || targetPressure <= 0.52);
    const crowdedReturn =
      candidate.actionType === "pass" &&
      passDistance <= 11.5 &&
      escapeGain < 1.2 &&
      targetOpponentDensity >= Math.max(2, startOpponentDensity) &&
      targetPressure >= 0.5;
    const backwardsIntoTrap =
      candidate.actionType === "pass" &&
      forwardGain < -5 &&
      !escapesCrowd &&
      targetPressure >= 0.46;
    let score = 0;
    const labels = [];
    if (safeOutlet && trapLoad >= 0.38) {
      score += 0.18 + trapLoad * 0.22 + regain.secureIntent * 0.14;
      labels.push("Secure away from regain crowd");
    }
    if (transitionRelease && trapLoad <= 0.94) {
      score += 0.14 + regain.counterIntent * regain.freshness * 0.3 + Math.max(0, forwardGain) * 0.006;
      labels.push("Attack transition space");
    }
    if (escapeCarry) {
      score += 0.12 + laneClarity * 0.18 + Math.max(0, escapeGain) * 0.025 + regain.counterIntent * 0.08;
      labels.push("Carry out of counter-press");
    }
    if (crowdedReturn) {
      score -= 0.34 + trapLoad * 0.28 + targetPressure * 0.18;
      labels.push("Avoid regain crowd");
    }
    if (backwardsIntoTrap) {
      score -= 0.18 + trapLoad * 0.18;
      labels.push("Avoid counter-press trap");
    }
    if (trapLoad >= 0.58 && !escapesCrowd && candidate.actionType !== "shot") {
      score -= clamp((trapLoad - 0.5) * 0.24 + targetPressure * 0.08, 0, 0.22);
    }
    return {
      score: clamp(score, -0.86, 0.74),
      labels: uniquePrincipleLabels(labels),
      context: {
        trapLoad,
        escapeGain,
        startPressure,
        targetPressure,
        startOpponentDensity,
        targetOpponentDensity,
        targetSupport,
        laneClarity,
        safeOutlet,
        transitionRelease,
        escapeCarry,
        crowdedReturn,
      },
    };
  }

  return {
    getAutoPilotPassLaneDenialAdjustment,
    getAutoPilotCounterPressEscapeAdjustment,
  };
}
