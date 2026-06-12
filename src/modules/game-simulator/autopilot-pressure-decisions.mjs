import { createGameSimulatorAutopilotPressureEscapeCandidates } from "./autopilot-pressure-escape-candidates.mjs";
export function createGameSimulatorAutopilotPressureDecisions(deps = {}) {
  const {
    chooseScoredCandidateWithVariation,
    clamp,
    clampToPitch,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingGameSpaceProfile,
    getAutoPilotRoleStrength,
    getCarryLaneOpenSpaceScore,
    getNearestOpponentGapInCarryLane,
    getNearestOpponentGapToPoint,
    getOffensiveRoleKey,
    getOpponentBlockReadProfile,
    getOpponentDensityAtPoint,
    getOpponentPressureAtPoint,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getTeamDensityAtPoint,
    getWideSideSign,
    isFrontLineRole,
    isGoalkeeper,
    isPassReceiverOffside,
    isWidePrincipleZone,
    lerp,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotPressureEscapeContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGapToPoint(teamId, startPoint);
const opponentDensity = getOpponentDensityAtPoint(teamId, startPoint, 8.5);
const closeOpponentDensity = getOpponentDensityAtPoint(teamId, startPoint, 5.4);
const supportDensity = getTeamDensityAtPoint(teamId, startPoint, 11.5, new Set([carrier.id]));
const currentThreat = getPitchThreatProfile(startPoint, teamId);
const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const laneKey = getPitchLaneKey(startPoint);
const sideSign = getWideSideSign(startPoint) || 1;
const isWideTrap = isWidePrincipleZone(startPoint) && opponentDensity >= 2;
const centralTrap =
Math.abs(startPoint.y - pitch.width / 2) <= 15 &&
(pressure >= 0.54 || closeOpponentDensity >= 2);
const trapLoad = clamp(
pressure * 0.52 +
Math.min(opponentDensity, 4) * 0.13 +
Math.min(closeOpponentDensity, 3) * 0.13 -
Math.min(supportDensity, 3) * 0.05 +
(isWideTrap ? 0.12 : 0) +
(centralTrap ? 0.08 : 0) +
(profile.tempo >= 0.64 ? 0.04 : 0),
0,
1.35
);
const active =
trapLoad >= 0.48 ||
pressure >= 0.58 ||
nearestGap <= 3.6 ||
(opponentDensity >= 3 && supportDensity <= 1);
return {
active,
teamId,
pressure,
nearestGap,
opponentDensity,
closeOpponentDensity,
supportDensity,
currentThreat,
currentSpace,
laneKey,
sideSign,
isWideTrap,
centralTrap,
trapLoad,
};
}
const pressureEscapeCandidates = createGameSimulatorAutopilotPressureEscapeCandidates({
  chooseScoredCandidateWithVariation,
  clamp,
  clampToPitch,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAutoPilotPressureEscapeContext,
  getAutoPilotRoleStrength,
  getCarryLaneOpenSpaceScore,
  getNearestOpponentGapInCarryLane,
  getOffensiveRoleKey,
  getOpponentBlockReadProfile,
  getOpponentDensityAtPoint,
  getOpponentPressureAtPoint,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerBallControlPoint,
  getPlayerMagnetLabel,
  getPlayerPressureLoad,
  getTeamDensityAtPoint,
  getWideSideSign,
  isFrontLineRole,
  isGoalkeeper,
  isPassReceiverOffside,
  isWidePrincipleZone,
  lerp,
  pitch,
  state,
  teams,
});
const { buildAutoPilotPressureTrapEscapeCandidate } = pressureEscapeCandidates;
function getAutoPilotPressureEscapeAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotPressureEscapeContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: candidate.actionType === "pass"
? actionSpace.targetPressure
: getOpponentPressureAtPoint(teamId, target, 8.5);
const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, candidate.actionType === "pass" ? 10.5 : 8.5);
const targetSupport = getTeamDensityAtPoint(
teamId,
target,
candidate.actionType === "pass" && passDistance >= 22 ? 15 : 11.5,
new Set([carrier.id, candidate.receiverPlayerId, candidate.principleRunnerPlayerId].filter(Boolean))
);
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const targetLane = getPitchLaneKey(target);
const laneShift =
targetLane && context.laneKey
? Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(context.laneKey))
: 0;
const escapesPressure =
targetPressure <= context.pressure - 0.14 ||
targetOpponentDensity <= Math.max(0, context.opponentDensity - 1) ||
laneShift >= 1 ||
candidate.isSwitch;
const safeShortExit =
candidate.actionType === "pass" &&
passDistance >= 6 &&
passDistance <= 20 &&
laneClarity >= 0.52 &&
targetPressure <= 0.64 &&
targetSupport >= 1 &&
(escapesPressure || forwardGain >= 1.5);
const thirdPlayerExit =
candidate.actionType === "pass" &&
passDistance >= 7 &&
passDistance <= 24 &&
laneShift >= 1 &&
forwardGain >= -2 &&
laneClarity >= 0.48 &&
targetPressure <= 0.68 &&
(
targetThreat.halfSpace >= 0.26 ||
targetThreat.betweenLines >= 0.24 ||
candidate.receiverRoleKey === "connector" ||
candidate.receiverRoleKey === "pivot" ||
candidate.receiverRoleKey === "wideBack"
);
const switchExit =
candidate.actionType === "pass" &&
candidate.isSwitch &&
passDistance >= 20 &&
laneClarity >= 0.62 &&
targetPressure <= 0.58 &&
targetOpponentDensity <= Math.max(1, context.opponentDensity - 1);
const carryExit =
candidate.actionType === "dribble" &&
forwardGain >= 2.5 &&
laneClarity >= 0.5 &&
targetPressure <= context.pressure - 0.08 &&
targetOpponentDensity <= Math.max(1, context.opponentDensity);
const crowdedReturn =
candidate.actionType === "pass" &&
passDistance <= 12 &&
forwardGain <= 2 &&
laneShift === 0 &&
targetPressure >= 0.5 &&
targetOpponentDensity >= context.opponentDensity &&
!candidate.isSwitch;
const dribbleIntoTrap =
candidate.actionType === "dribble" &&
targetPressure >= 0.62 &&
targetOpponentDensity >= context.opponentDensity &&
actionSpace.lineBreakCount === 0;
const hopefulLongEscape =
candidate.actionType === "pass" &&
passDistance >= 28 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
!candidate.isLineBreak &&
targetSupport <= 0 &&
laneClarity < 0.62 &&
profile.routeOneBias < 0.6;
const labels = [];
let score = 0;
if (safeShortExit) {
score += 0.16 + context.trapLoad * 0.22 + (profile.shortSupport ?? 0.5) * 0.1;
labels.push("Pressure escape: safe exit");
}
if (thirdPlayerExit) {
score += 0.2 + context.trapLoad * 0.24 + (profile.tempo ?? 0.5) * 0.1;
labels.push("Pressure escape: third player");
}
if (switchExit) {
score += 0.18 + context.trapLoad * 0.28 + (profile.switchBias ?? 0.5) * 0.16;
labels.push("Pressure escape: switch away");
}
if (carryExit) {
score += 0.14 + context.trapLoad * 0.18 + (profile.carryBias ?? 0.5) * 0.12;
labels.push("Pressure escape: carry out");
}
if (crowdedReturn) {
score -= 0.34 + context.trapLoad * 0.34 + targetPressure * 0.14;
labels.push("Avoid passing back into trap");
}
if (dribbleIntoTrap) {
score -= 0.3 + context.trapLoad * 0.28;
labels.push("Avoid carrying into trap");
}
if (hopefulLongEscape) {
score -= 0.24 + context.trapLoad * 0.2;
labels.push("Avoid hopeful escape ball");
}
return {
score: clamp(score, -1.05, 0.95),
labels: uniquePrincipleLabels(labels),
context: {
trapLoad: context.trapLoad,
pressure: context.pressure,
nearestGap: context.nearestGap,
opponentDensity: context.opponentDensity,
targetOpponentDensity,
supportDensity: context.supportDensity,
targetSupport,
targetPressure,
laneClarity,
laneShift,
safeShortExit,
thirdPlayerExit,
switchExit,
carryExit,
crowdedReturn,
dribbleIntoTrap,
hopefulLongEscape,
},
};
}

  return {
    getAutoPilotPressureEscapeContext,
    buildAutoPilotPressureTrapEscapeCandidate,
    getAutoPilotPressureEscapeAdjustment,
  };
}
