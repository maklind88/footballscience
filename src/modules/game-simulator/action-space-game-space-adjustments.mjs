export function createGameSimulatorActionSpaceGameSpaceAdjustments(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingGameSpaceProfile,
    getNearestOpponentGap,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchSpaceProfile,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getTeamDensityAtPoint,
    getTeamSupportCountAroundPoint,
    isPlayerFacingForward,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotGameSpaceAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const teamId = carrier.team;
const startSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const targetSpace = getAttackingGameSpaceProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const startThreat = actionSpace.startThreat;
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const gameSpaceGain = targetSpace.index - startSpace.index;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const runner = candidate.principleRunnerPlayerId ? getPlayerById(candidate.principleRunnerPlayerId) : null;
const excludedIds = new Set([carrier.id, receiver?.id, runner?.id].filter(Boolean));
const supportNearTarget = getTeamSupportCountAroundPoint(teamId, candidate.target, excludedIds, passDistance >= 25 ? 16 : 12);
const receiverPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: receiver
? getPlayerPressureLoad(receiver, candidate.target)
: actionSpace.targetPressure;
const openTarget = actionSpace.openTarget;
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, candidate.target)
: 0.62;
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.25);
const labels = [];
let score = 0;
const entersSpaceTwo =
targetSpace.key === "space2" &&
gameSpaceGain >= 1 &&
forwardGain >= 2 &&
openTarget >= 0.36 &&
laneClarity >= 0.34;
const entersSpaceThree =
targetSpace.key === "space3" &&
gameSpaceGain >= 1 &&
forwardGain >= 5 &&
laneClarity >= 0.38;
const oneSpaceProgression =
gameSpaceGain === 1 &&
forwardGain >= 3 &&
actionSpace.lineBreakCount >= 1;
const skippedTooMuch =
candidate.actionType === "pass" &&
gameSpaceGain >= 2 &&
passDistance >= 30 &&
profile.routeOneBias < 0.58 &&
supportNearTarget <= 0 &&
targetThreat.box < 0.28 &&
targetThreat.behindLine < 0.42;
if (entersSpaceTwo) {
score += 0.26 + actionSpace.value * 0.28 + profile.lineBreakBias * 0.16;
labels.push("Enter space 2");
}
if (entersSpaceThree) {
score += 0.24 + targetThreat.behindLine * 0.32 + profile.directness * 0.14;
labels.push("Attack space 3");
}
if (oneSpaceProgression) {
score += 0.18 + profile.progressionUrgency * 0.14;
labels.push("Play through the next space");
}
if (
candidate.actionType === "pass" &&
targetSpace.key === "space2" &&
receiverPressure <= 0.58 &&
(targetThreat.betweenLines >= 0.34 || targetThreat.halfSpace >= 0.34)
) {
score += 0.2 + Math.max(0, targetThreat.value - startThreat.value) * 0.34;
labels.push("Find player between lines");
}
if (
candidate.actionType === "dribble" &&
startSpace.index >= 1 &&
targetSpace.index >= startSpace.index &&
forwardGain >= 4.5 &&
openTarget >= 0.52 &&
pressure <= 0.56
) {
score += 0.2 + openTarget * 0.18 + profile.carryBias * 0.12;
labels.push("Carry through open space");
}
if (
startSpace.key === "space2" &&
facingForward &&
pressure <= 0.48 &&
candidate.actionType === "pass" &&
forwardGain < 2 &&
!candidate.isSwitch &&
targetThreat.value <= startThreat.value + 0.04
) {
score -= 0.52 + profile.progressionUrgency * 0.22;
}
if (
gameSpaceGain < 0 &&
pressure <= 0.52 &&
!candidate.isSwitch &&
targetThreat.value <= startThreat.value + 0.05
) {
score -= Math.abs(gameSpaceGain) * (0.24 + profile.progressionUrgency * 0.12);
}
if (skippedTooMuch) {
score -= 0.46 + (1 - profile.directness) * 0.2;
}
if (
targetSpace.index >= 2 &&
actionSpace.targetPressure >= 0.72 &&
supportNearTarget <= 0 &&
!candidate.isBoxPass &&
candidate.actionType !== "shot"
) {
score -= 0.24;
}
if (
candidate.actionType === "shot" &&
(startSpace.key === "space3" || targetThreat.box >= 0.3 || startThreat.centralPocket >= 0.42)
) {
score += 0.16 + profile.shootBias * 0.12;
labels.push("Finish from space 3");
}
return {
score: clamp(score, -1.25, 1.25),
labels: uniquePrincipleLabels(labels),
context: {
startSpace,
targetSpace,
gameSpaceGain,
supportNearTarget,
receiverPressure,
openTarget,
laneClarity,
},
};
}
function getAutoPilotSpatialDecisionAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const teamId = carrier.team;
const startSpace = getPitchSpaceProfile(startPoint, teamId);
const targetSpace = getPitchSpaceProfile(candidate.target, teamId);
const startGameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const targetGameSpace = getAttackingGameSpaceProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const actionDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestOpponentGap = getNearestOpponentGap(carrier, startPoint);
const laneShift = Math.abs(getPitchLaneIndex(candidate.target) - getPitchLaneIndex(startPoint));
const startLane = getPitchLaneKey(startPoint);
const targetLane = getPitchLaneKey(candidate.target);
const startIsWide = startLane === "leftWide" || startLane === "rightWide";
const targetIsWide = targetLane === "leftWide" || targetLane === "rightWide";
const targetIsHalfSpace = targetLane === "leftHalf" || targetLane === "rightHalf";
const targetIsCentral = targetLane === "central";
const gameSpaceGain = targetGameSpace.index - startGameSpace.index;
const targetDensity = getTeamDensityAtPoint(
teamId,
candidate.target,
targetGameSpace.key === "space3" ? 8.8 : 10.5,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean))
);
const canFaceForward =
isPlayerFacingForward(carrier, Math.PI / 2.15) ||
(pressure <= 0.38 && nearestOpponentGap >= 3.8) ||
startSpace.betweenLines >= 0.42;
const underControl = pressure <= 0.5 && nearestOpponentGap >= 2.7;
const highValueForwardAction =
forwardGain >= 4 &&
(actionSpace.value >= 0.38 ||
targetSpace.value >= startSpace.value + 0.06 ||
targetSpace.gameSpaceIndex > startSpace.gameSpaceIndex ||
candidate.isLineBreak ||
candidate.isBoxPass);
const sterileAction =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2.5 &&
targetSpace.value <= startSpace.value + 0.035 &&
actionSpace.lineBreakCount === 0;
const excessiveJump =
candidate.actionType === "pass" &&
gameSpaceGain >= 2 &&
actionDistance >= 29 &&
profile.routeOneBias < 0.58 &&
targetSpace.box < 0.24 &&
targetSpace.behindLine < 0.42 &&
actionSpace.openTarget < 0.72;
const labels = [];
let score = 0;
if (startGameSpace.key === "outlet" || startGameSpace.key === "space1") {
if (gameSpaceGain === 1 && forwardGain >= 3 && actionSpace.lineBreakCount >= 1) {
score += 0.3 + profile.lineBreakBias * 0.16 + actionSpace.value * 0.18;
labels.push("Spelyta decision: enter next space");
}
if (
targetGameSpace.key === "space2" &&
(targetIsHalfSpace || targetIsCentral) &&
forwardGain >= 4 &&
actionSpace.targetPressure <= 0.64
) {
score += 0.22 + profile.shortSupport * 0.12;
labels.push("Spelyta decision: find pocket behind midfield");
}
if (excessiveJump) {
score -= 0.46 + (1 - profile.directness) * 0.22;
labels.push("Spelyta decision: avoid hopeful skip");
}
}
if (startGameSpace.key === "space2" || startSpace.betweenLines >= 0.36 || startSpace.centralPocket >= 0.26) {
if (canFaceForward && underControl && highValueForwardAction) {
score += 0.42 + actionSpace.value * 0.3 + profile.progressionUrgency * 0.16;
labels.push("Spelyta decision: attack forward-facing space 2");
}
if (
canFaceForward &&
underControl &&
candidate.actionType === "dribble" &&
forwardGain >= 4 &&
actionSpace.openTarget >= 0.48
) {
score += 0.24 + profile.carryBias * 0.16;
labels.push("Spelyta decision: drive at the back line");
}
if (
canFaceForward &&
underControl &&
!candidate.isSwitch &&
(forwardGain <= -4 || sterileAction)
) {
score -= 0.66 + startSpace.value * 0.22 + profile.progressionUrgency * 0.22;
labels.push("Spelyta decision: do not waste forward-facing space");
}
}
if (startGameSpace.key === "space3" || startSpace.box >= 0.18 || startSpace.centralPocket >= 0.38) {
if (candidate.actionType === "shot") {
score += 0.34 + profile.shootBias * 0.26 + startSpace.box * 0.18;
labels.push("Spelyta decision: finish from space 3");
}
if (
candidate.actionType === "pass" &&
(targetSpace.box >= 0.28 || targetSpace.cutbackZone >= 0.34 || candidate.isBoxPass)
) {
score += 0.26 + profile.shortSupport * 0.1;
labels.push("Spelyta decision: play final action");
}
if (
candidate.actionType !== "shot" &&
forwardGain <= -5 &&
pressure <= 0.48 &&
!candidate.isSwitch
) {
score -= 0.42 + profile.shootBias * 0.2;
}
}
if (startIsWide && !targetIsWide && (targetIsHalfSpace || targetIsCentral) && forwardGain >= 1.5) {
score += 0.18 + profile.overlapBias * 0.08 + profile.shortSupport * 0.08;
labels.push("Spelyta decision: come inside from width");
}
if (
!startIsWide &&
targetIsWide &&
(pressure >= 0.48 || profile.switchBias >= 0.62 || profile.widthDiscipline >= 0.68) &&
targetSpace.depth >= 38
) {
score += 0.14 + profile.switchBias * 0.12;
labels.push("Spelyta decision: stretch the block");
}
if (
laneShift === 0 &&
sterileAction &&
pressure <= 0.46 &&
targetSpace.depth < 72
) {
score -= 0.24 + profile.progressionUrgency * 0.18;
}
if (
targetDensity >= 3 &&
targetSpace.box < 0.26 &&
targetSpace.cutbackZone < 0.28 &&
!candidate.isSwitch
) {
score -= 0.18 + (targetDensity - 2) * 0.08;
labels.push("Spelyta decision: avoid crowding");
}
if (
candidate.actionType === "pass" &&
targetSpace.gameSpaceIndex < startSpace.gameSpaceIndex &&
pressure <= 0.42 &&
!candidate.isSwitch &&
startSpace.depth >= 44
) {
score -= 0.28 + profile.progressionUrgency * 0.12;
}
return {
score: clamp(score, -1.3, 1.35),
labels: uniquePrincipleLabels(labels),
context: {
startSpace,
targetSpace,
startGameSpace,
targetGameSpace,
gameSpaceGain,
laneShift,
canFaceForward,
underControl,
highValueForwardAction,
sterileAction,
targetDensity,
},
};
}

  return {
    getAutoPilotGameSpaceAdjustment,
    getAutoPilotSpatialDecisionAdjustment,
  };
}
