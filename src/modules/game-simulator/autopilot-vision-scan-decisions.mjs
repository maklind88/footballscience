export function createGameSimulatorAutopilotVisionScanDecisions(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    buildPlayerIntelligenceProfile,
    clamp,
    distance,
    getAttackDirectionSign,
    getAutoPilotCandidatePattern,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerPressureLoad,
    isSupportRole,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotVisionScanAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getPlayerDecisionContext(carrier);
const intelligence = context.profile ?? buildPlayerIntelligenceProfile(carrier);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const actionAngle =
candidate.actionType === "shot"
? angleBetween(startPoint, getOpponentGoalCenter(carrier.team))
: angleBetween(startPoint, candidate.target);
const bodyAngle = getPlayerFacingAngle(carrier);
const angleGap = angleDifference(bodyAngle, actionAngle);
const visibleCone = clamp(1 - angleGap / (Math.PI * 0.72), 0, 1);
const peripheralVision = clamp(1 - angleGap / (Math.PI * 0.95), 0, 1);
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const laneShift = Math.abs(getPitchLaneIndex(candidate.target) - getPitchLaneIndex(startPoint));
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
const shortSupport =
candidate.actionType === "pass" &&
passDistance <= 18 &&
forwardGain >= -7 &&
(isSupportRole(receiverRoleKey) || receiverRoleKey === "rest" || receiverRoleKey === "gk");
const highValueForward =
forwardGain >= 4 &&
(targetThreat.value >= 0.36 ||
targetThreat.betweenLines >= 0.34 ||
targetThreat.centralPocket >= 0.28 ||
candidate.isLineBreak ||
candidate.isBoxPass);
const scanCapacity = clamp(
intelligence.perception * 0.34 +
intelligence.decisionQuality * 0.24 +
intelligence.decisionSpeed * 0.18 +
intelligence.tacticalDiscipline * 0.14 +
intelligence.composure * 0.1 -
pressure * (0.18 + (1 - intelligence.pressResistance) * 0.2),
0,
1
);
const actionComplexity = clamp(
(passDistance >= 27 ? 0.22 : 0) +
(laneShift >= 2 ? 0.2 : 0) +
(candidate.isSwitch ? 0.16 : 0) +
(candidate.isLineBreak ? 0.18 : 0) +
(pattern.family === "third-player" ? 0.14 : 0) +
(targetThreat.behindLine >= 0.28 ? 0.12 : 0) +
(targetThreat.value >= 0.48 ? 0.1 : 0) +
pressure * 0.16,
0,
1
);
const scanGap = actionComplexity - scanCapacity * 0.72 - peripheralVision * 0.34;
const blindRisk = clamp(scanGap, 0, 1);
const labels = [];
let score = 0;
if (visibleCone >= 0.64 && highValueForward) {
score += 0.14 + scanCapacity * 0.16 + (profile.tempo ?? 0.5) * 0.04;
labels.push("Vision: sees forward option");
}
if (shortSupport && pressure >= 0.48 && peripheralVision >= 0.48) {
score += 0.12 + intelligence.decisionSpeed * 0.08 + intelligence.pressResistance * 0.06;
labels.push("Vision: simple support angle");
}
if (
candidate.actionType === "pass" &&
(candidate.isSwitch || laneShift >= 2) &&
passDistance >= 18
) {
if (scanCapacity >= 0.72 && pressure <= 0.62) {
score += 0.1 + intelligence.perception * 0.08 + (candidate.isSwitch ? 0.06 : 0);
labels.push("Vision: scanned weak side");
} else if (visibleCone < 0.34 && !candidate.isBoxPass) {
score -= 0.18 + blindRisk * 0.32;
labels.push("Vision: blind-side option");
}
}
if (
blindRisk >= 0.18 &&
!shortSupport &&
candidate.actionType !== "shot" &&
!candidate.mustShoot
) {
score -= 0.12 + blindRisk * 0.46;
}
if (
candidate.actionType === "dribble" &&
forwardGain >= 5 &&
visibleCone >= 0.58 &&
pressure <= 0.58
) {
score += 0.1 + intelligence.decisionSpeed * 0.06;
labels.push("Vision: carries what is open");
}
if (
candidate.actionType === "pass" &&
forwardGain <= -5 &&
visibleCone < 0.28 &&
pressure <= 0.46 &&
targetThreat.value <= getPitchThreatProfile(startPoint, carrier.team).value + 0.04
) {
score -= 0.16 + (profile.progressionUrgency ?? 0.5) * 0.16;
}
return {
score: clamp(score, -0.9, 0.72),
labels: uniquePrincipleLabels(labels),
context: {
visibleCone,
peripheralVision,
scanCapacity,
actionComplexity,
blindRisk,
angleGap,
pressure,
highValueForward,
shortSupport,
},
};
}

  return {
    getAutoPilotVisionScanAdjustment,
  };
}
