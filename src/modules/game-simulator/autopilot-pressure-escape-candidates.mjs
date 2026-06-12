export function createGameSimulatorAutopilotPressureEscapeCandidates(deps = {}) {
  const {
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
  } = deps;

function buildAutoPilotPressureTrapEscapeCandidate(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint || state.restartPhase?.type) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const context = getAutoPilotPressureEscapeContext(carrier, startPoint, profile);
const block = getOpponentBlockReadProfile(teamId, startPoint);
const sideSign = context.sideSign || getWideSideSign(startPoint) || 1;
const sideLocked =
block.ballSideCompression >= 0.52 &&
(
isWidePrincipleZone(startPoint) ||
context.pressure >= 0.36 ||
(profile.switchBias ?? 0.5) >= 0.56
);
if (!context.active && !sideLocked) {
return null;
}
const options = [];
const startLaneIndex = getPitchLaneIndex(getPitchLaneKey(startPoint));
const startThreat = getPitchThreatProfile(startPoint, teamId);
const attackSign = getAttackDirectionSign(teamId);
const trapLoad = Math.max(context.trapLoad ?? 0, sideLocked ? 0.54 + block.ballSideCompression * 0.18 : 0);
const addPassOption = (receiver, kind) => {
if (!receiver || receiver.team !== teamId || receiver.id === carrier.id || isPassReceiverOffside(receiver, startPoint)) {
return;
}
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
if (passDistance < 4.2 || passDistance > (kind === "switchAway" ? 44 : kind === "highestOutlet" ? 32 : 24)) {
return;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
const targetLaneIndex = getPitchLaneIndex(getPitchLaneKey(target));
const laneShift = Math.abs(targetLaneIndex - startLaneIndex);
const forwardGain = (target.x - startPoint.x) * attackSign;
const laneClarity = computePassLaneClarity(carrier, target, { receiverPlayerId: receiver.id });
const receiverPressure = getPlayerPressureLoad(receiver, target);
const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, kind === "switchAway" ? 13.5 : 10.5);
const targetSupport = getTeamDensityAtPoint(
teamId,
target,
kind === "switchAway" ? 15.5 : 11.5,
new Set([carrier.id, receiver.id])
);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const receiverSide = getWideSideSign(target) || getWideSideSign(receiver) || 0;
const isSwitch = kind === "switchAway" || (laneShift >= 2 && passDistance >= 16);
const isLineBreak =
forwardGain >= 6.5 &&
(actionSpace.lineBreakCount >= 1 || targetThreat.value >= startThreat.value + 0.07);
const isBoxPass = targetThreat.box >= 0.22 || targetThreat.cutbackZone >= 0.26;
const escapesCrowd =
receiverPressure <= Math.max(0, context.pressure - 0.12) ||
targetOpponentDensity <= Math.max(0, context.opponentDensity - 1) ||
laneShift >= 1 ||
isSwitch;
const sameTrap =
!isSwitch &&
laneShift === 0 &&
receiverPressure >= Math.max(0.44, context.pressure - 0.08) &&
targetOpponentDensity >= Math.max(2, context.opponentDensity);
const roleFit =
kind === "switchAway"
? (["wideBack", "wideForward"].includes(roleKey) ? 0.42 : roleKey === "connector" ? 0.24 : 0.08)
: kind === "thirdMan"
? (["pivot", "connector", "wideBack", "secondStriker"].includes(roleKey) ? 0.4 : 0.1)
: kind === "underEscape"
? (["pivot", "rest", "wideBack", "connector"].includes(roleKey) ? 0.38 : 0.08)
: isFrontLineRole(roleKey)
? 0.32
: 0.08;
const kindBonus =
kind === "switchAway"
? (profile.switchBias ?? 0.5) * 0.36 + block.ballSideCompression * 0.28 + (receiverSide === -sideSign ? 0.18 : 0)
: kind === "thirdMan"
? (profile.tempo ?? 0.5) * 0.24 + (profile.shortSupport ?? 0.5) * 0.18
: kind === "underEscape"
? (profile.shortSupport ?? 0.5) * 0.26 + trapLoad * 0.12
: (profile.directness ?? 0.5) * 0.2 + (profile.lineBreakBias ?? 0.5) * 0.18;
const score =
1.18 +
laneClarity * 0.95 +
clamp(1 - receiverPressure, 0, 1) * 0.42 +
clamp(targetSupport, 0, 3) * 0.08 +
trapLoad * 0.38 +
roleFit +
kindBonus +
(escapesCrowd ? 0.3 : -0.16) +
(isLineBreak ? 0.28 + actionSpace.value * 0.18 : actionSpace.value * 0.16) +
(isBoxPass ? 0.18 : 0) +
clamp(forwardGain / 18, -0.12, 0.3) -
Math.max(0, passDistance - (kind === "switchAway" ? 28 : 16)) * (kind === "switchAway" ? 0.018 : 0.028) -
(sameTrap ? 0.72 + trapLoad * 0.2 : 0) -
(forwardGain < -8 && kind !== "underEscape" && !isSwitch ? 0.28 : 0) -
(laneClarity < 0.42 && !isSwitch && !isLineBreak ? 0.24 : 0);
const minScore =
kind === "switchAway"
? 1.72
: kind === "highestOutlet"
? 1.78
: 1.6;
if (score < minScore) {
return;
}
const label =
kind === "switchAway"
? "pressure switch"
: kind === "thirdMan"
? "third-man escape"
: kind === "underEscape"
? "under escape"
: "highest outlet";
const reason =
kind === "switchAway"
? "the ball-side is locked, so the team changes corridor away from pressure"
: kind === "thirdMan"
? "the carrier finds a third-player angle to escape the trap"
: kind === "underEscape"
? "the carrier secures the ball through support under the pressure"
: "the carrier releases the highest playable outlet before the trap closes";
options.push({
actionType: "pass",
target,
receiverPlayerId: receiver.id,
receiverRoleKey: roleKey,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
supportNearTarget: targetSupport,
isLineBreak,
isSwitch,
isSidewaysPass: Math.abs(forwardGain) < 4 && laneShift >= 1 && !isSwitch,
isBoxPass,
isPrinciplePattern: true,
principleKey: `pressure-trap-${kind}`,
principleLabel: `Pressure trap escape: ${getPlayerMagnetLabel(receiver)} opens the ${kind === "switchAway" ? "weak-side" : kind === "thirdMan" ? "third-man" : "support"} exit`,
principleLabels: ["Press escape", kind === "switchAway" ? "Switch away from trap" : "Third-man escape"],
score,
firstTouchMode: isSwitch ? "inside" : isLineBreak || forwardGain >= 5 ? "forward" : "inside",
label,
reason,
});
};
state.players.forEach((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
const receiverSide = getWideSideSign(receiver) || getWideSideSign(receiver.position) || 0;
const target = getPlayerBallControlPoint(receiver);
const forwardGain = (target.x - startPoint.x) * attackSign;
const laneShift = Math.abs(getPitchLaneIndex(getPitchLaneKey(target)) - startLaneIndex);
if (
(sideLocked || context.isWideTrap || (profile.switchBias ?? 0.5) >= 0.6) &&
receiverSide === -sideSign &&
laneShift >= 2 &&
["wideForward", "wideBack", "connector"].includes(roleKey)
) {
addPassOption(receiver, "switchAway");
}
if (
laneShift >= 1 &&
forwardGain >= -3 &&
["pivot", "connector", "wideBack", "secondStriker"].includes(roleKey)
) {
addPassOption(receiver, "thirdMan");
}
if (
context.pressure >= 0.54 &&
forwardGain <= 1.5 &&
forwardGain >= -10 &&
["pivot", "rest", "wideBack", "connector"].includes(roleKey)
) {
addPassOption(receiver, "underEscape");
}
if (
trapLoad >= 0.62 &&
forwardGain >= 6 &&
isFrontLineRole(roleKey)
) {
addPassOption(receiver, "highestOutlet");
}
});
const carryMeters = clamp(
5.2 +
(profile.carryBias ?? 0.5) * 3.6 +
getAutoPilotRoleStrength(carrier, "dribbler") * 2.2 -
context.pressure * 2.1,
4.4,
10.5
);
const centralExitSide = (() => {
const leftTarget = clampToPitch({ x: startPoint.x + attackSign * 4.8, y: startPoint.y - 6.5 }, 2.5);
const rightTarget = clampToPitch({ x: startPoint.x + attackSign * 4.8, y: startPoint.y + 6.5 }, 2.5);
const leftDensity = getOpponentDensityAtPoint(teamId, leftTarget, 8);
const rightDensity = getOpponentDensityAtPoint(teamId, rightTarget, 8);
return leftDensity <= rightDensity ? -1 : 1;
})();
const carryTarget = clampToPitch({
x: startPoint.x + attackSign * carryMeters,
y: isWidePrincipleZone(startPoint)
? lerp(startPoint.y, pitch.width / 2, 0.54)
: clamp(startPoint.y + centralExitSide * Math.min(carryMeters * 0.78, 7.5), 5, pitch.width - 5),
}, 2.5);
const carryForwardGain = (carryTarget.x - startPoint.x) * attackSign;
const carryPressure = getOpponentPressureAtPoint(teamId, carryTarget, 8.5);
const carryOpponentDensity = getOpponentDensityAtPoint(teamId, carryTarget, 8.5);
const carryOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, carryTarget));
const carryActionSpace = getActionSpaceValue(startPoint, carryTarget, teamId, profile);
const carryScore =
1.22 +
trapLoad * 0.26 +
carryOpenSpace * 0.64 +
getAutoPilotRoleStrength(carrier, "dribbler") * 0.36 +
(profile.carryBias ?? 0.5) * 0.22 +
clamp(carryForwardGain / 12, 0, 0.32) +
carryActionSpace.value * 0.22 -
carryPressure * 0.48 -
Math.max(0, carryOpponentDensity - Math.max(1, context.opponentDensity)) * 0.16;
if (
carryForwardGain >= 3.2 &&
carryOpenSpace >= 0.48 &&
carryPressure <= Math.max(0.68, context.pressure + 0.06) &&
carryScore >= 1.58
) {
options.push({
actionType: "dribble",
target: carryTarget,
receiverPlayerId: null,
passDistance: distance(startPoint, carryTarget),
forwardGain: carryForwardGain,
laneClarity: carryOpenSpace,
receiverPressure: carryPressure,
supportNearTarget: getTeamDensityAtPoint(teamId, carryTarget, 11.5, new Set([carrier.id])),
isLineBreak: carryActionSpace.lineBreakCount >= 1,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: carryActionSpace.targetThreat.box >= 0.22,
isPrinciplePattern: true,
principleKey: "pressure-trap-carry-out",
principleLabel: `Pressure trap escape: ${getPlayerMagnetLabel(carrier)} carries out of the trap`,
principleLabels: ["Press escape", "Carry out of trap"],
score: carryScore,
firstTouchMode: null,
label: "carry out of trap",
reason: "the closest escape is to carry diagonally away from the pressure",
});
}
if (!options.length) {
return null;
}
return chooseScoredCandidateWithVariation(options, profile, {
carrier,
startPoint,
tolerance: 0.42,
temperature: 0.18,
});
}

  return { buildAutoPilotPressureTrapEscapeCandidate };
}
