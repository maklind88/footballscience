export function createGameSimulatorAutopilotRegainEscapeCandidates(deps = {}) {
  const {
    chooseScoredCandidateWithVariation,
    clamp,
    clampToPitch,
    computePassLaneClarity,
    distance,
    getAttackDirectionSign,
    getAutoPilotRegainContext,
    getAutoPilotRoleStrength,
    getCarryLaneOpenSpaceScore,
    getDistanceFromOwnGoal,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getOpponentPressureAtPoint,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getState,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    isInsideOwnBox,
    isTransitionAttackStyle,
    normalize,
    pitch,
    teams,
  } = deps;

function getPressedRegainExitVector(carrier, startPoint) {
const state = getState();
if (!carrier || !startPoint) {
return { x: getAttackDirectionSign(carrier?.team), y: 0 };
}
let pressureX = 0;
let pressureY = 0;
let pressureWeight = 0;
state.players.forEach((player) => {
if (player.team === carrier.team) {
return;
}
const gap = distance(player.position, startPoint);
if (gap > 10.5) {
return;
}
const weight = clamp(1 - gap / 10.5, 0, 1) ** 1.25;
pressureX += (player.position.x - startPoint.x) * weight;
pressureY += (player.position.y - startPoint.y) * weight;
pressureWeight += weight;
});
const attackSign = getAttackDirectionSign(carrier.team);
const touchlineSide =
Math.sign(startPoint.y - pitch.width / 2) ||
(startPoint.y <= pitch.width / 2 ? -1 : 1);
if (pressureWeight <= 0.01) {
return normalize(
startPoint,
{
x: startPoint.x + attackSign * 8,
y: clamp(startPoint.y + touchlineSide * 6, 3, pitch.width - 3),
}
);
}
const awayFromPressure = normalize(
{
x: startPoint.x + pressureX / pressureWeight,
y: startPoint.y + pressureY / pressureWeight,
},
startPoint
);
const forwardVector = { x: attackSign, y: 0 };
const insideTarget = {
x: startPoint.x + attackSign * 5,
y: pitch.width / 2,
};
const insideVector = normalize(startPoint, insideTarget);
const combined = {
x: awayFromPressure.x * 0.68 + forwardVector.x * 0.2 + insideVector.x * 0.12,
y: awayFromPressure.y * 0.68 + insideVector.y * 0.18 + touchlineSide * 0.08,
};
const length = Math.hypot(combined.x, combined.y) || 1;
return {
x: combined.x / length,
y: combined.y / length,
};
}

function buildAutoPilotPressedRegainExitCandidate(carrier, startPoint, profile) {
const state = getState();
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
if (
!carrier ||
!startPoint ||
!regain.active ||
regain.freshness < 0.28 ||
regain.pressure < 0.5 ||
isInsideOwnBox(startPoint, carrier.team)
) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const attackSign = getAttackDirectionSign(teamId);
const exitVector = getPressedRegainExitVector(carrier, startPoint);
const directStyle = isTransitionAttackStyle(profile.styleKey);
const candidates = [];
state.players
.filter((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return roleKey === "pivot" || roleKey === "connector" || roleKey === "wideBack" || roleKey === "rest";
})
.forEach((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * attackSign;
const passVector = normalize(startPoint, target);
const escapeFit = clamp((passVector.x * exitVector.x + passVector.y * exitVector.y + 1) / 2, 0, 1);
const lateralEscape = Math.abs(target.y - startPoint.y);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const targetPressure = getOpponentPressureAtPoint(teamId, target, 9);
const roleKey = getOffensiveRoleKey(receiver, formation);
const roleFit =
roleKey === "pivot"
? 0.38
: roleKey === "connector"
? 0.34
: roleKey === "wideBack"
? 0.24
: 0.14;
const distanceFit = clamp(1 - Math.abs(passDistance - 12.5) / 13, 0, 1);
const score =
2.02 +
regain.freshness * 0.34 +
regain.secureIntent * 0.46 +
laneClarity * 0.98 +
escapeFit * 0.62 +
distanceFit * 0.26 +
roleFit +
getAutoPilotRoleStrength(receiver, "receiver") * 0.32 +
clamp(lateralEscape / 14, 0, 0.24) -
receiverPressure * 0.52 -
targetPressure * 0.38 -
(forwardGain < -8 && directStyle ? 0.34 : 0) -
(passDistance > 22 ? 0.2 : 0);
if (
passDistance >= 5.5 &&
passDistance <= 24 &&
forwardGain >= -12 &&
forwardGain <= 13 &&
laneClarity >= 0.34 &&
receiverPressure <= 0.82 &&
targetPressure <= 0.78 &&
escapeFit >= 0.36 &&
score >= 1.68
) {
candidates.push({
actionType: "pass",
target,
receiverPlayerId: receiver.id,
receiverRoleKey: roleKey,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, receiver.id]), 12),
isLineBreak: false,
isSwitch: false,
isSidewaysPass: Math.abs(forwardGain) < 4 && lateralEscape >= 6,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "pressed-regain-exit-pass",
principleLabel: `Pressed regain exit: ${getPlayerMagnetLabel(receiver)} opens the first safe angle`,
score,
firstTouchMode: forwardGain >= 2 && profile.firstTouchForwardBias >= 0.58 ? "forward" : "inside",
label: "pressed regain exit",
reason: "fresh ball win under pressure; first pass exits the counter-press before building",
});
}
});
const carryDistance = clamp(4.8 + regain.pressure * 4.2 + profile.carryBias * 1.8, 4.2, 10.2);
const carryTarget = clampToPitch({
x: startPoint.x + exitVector.x * carryDistance + attackSign * clamp(profile.directness * 2.2, 0.4, 2.4),
y: startPoint.y + exitVector.y * carryDistance,
}, 2);
const carryForwardGain = (carryTarget.x - startPoint.x) * attackSign;
const carryTargetPressure = getOpponentPressureAtPoint(teamId, carryTarget, 8);
const carryOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, carryTarget));
const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
const carryScore =
1.82 +
regain.freshness * 0.28 +
regain.pressure * 0.32 +
carryOpenSpace * 0.7 +
dribbleStrength * 0.42 +
profile.carryBias * 0.28 +
clamp(carryForwardGain / 10, -0.08, 0.28) -
carryTargetPressure * 0.56;
if (carryOpenSpace >= 0.42 && carryTargetPressure <= 0.68 && carryScore >= 1.62) {
candidates.push({
actionType: "dribble",
target: carryTarget,
receiverPlayerId: null,
score: carryScore,
isOpenGrassCarry: false,
isRunwayCarry: false,
isPrinciplePattern: true,
principleKey: "pressed-regain-carry-out",
principleLabel: `Pressed regain exit: ${getPlayerMagnetLabel(carrier)} carries first touch away from pressure`,
principleLabels: ["Exit counter-press with first touch"],
label: "pressed regain carry",
reason: "fresh ball win under pressure; first touch carries out of the counter-press",
});
}
const preferredPass = candidates
.filter((candidate) => candidate.actionType === "pass")
.sort((a, b) => b.score - a.score)[0] ?? null;
return chooseScoredCandidateWithVariation(candidates, profile, {
tolerance: 0.3,
temperature: 0.12,
preferredCandidate: preferredPass,
carrier,
startPoint,
});
}

function buildAutoPilotDangerZoneEscapeCandidate(carrier, startPoint, profile) {
const state = getState();
if (!carrier || !startPoint || isGoalkeeper(carrier)) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
const ownGoalDistance = getDistanceFromOwnGoal(teamId, startPoint);
const insideOwnBox = isInsideOwnBox(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const dangerActive =
insideOwnBox ||
ownGoalDistance <= 22 ||
(ownGoalDistance <= 31 && pressure >= 0.46) ||
(regain.active && regain.freshness >= 0.18 && ownGoalDistance <= 36);
if (!dangerActive) {
return null;
}
const attackSign = getAttackDirectionSign(teamId);
const sideSign = getWideSideSign(startPoint) || (startPoint.y <= pitch.width / 2 ? -1 : 1);
const directness = profile.directness ?? 0.5;
const shortSupport = profile.shortSupport ?? 0.5;
const boxStress = insideOwnBox ? 1 : clamp((36 - ownGoalDistance) / 22, 0, 1);
const clearanceDistance = clamp(
24 + pressure * 12 + directness * 14 + boxStress * 10,
24,
58
);
const clearanceTarget = clampToPitch(
{
x: startPoint.x + attackSign * clearanceDistance,
y: pitch.width / 2 + sideSign * clamp(21 + pressure * 8 + boxStress * 4, 20, 31),
},
2
);
const clearancePassDistance = distance(startPoint, clearanceTarget);
const clearanceForwardGain = (clearanceTarget.x - startPoint.x) * attackSign;
const clearanceLaneClarity = computePassLaneClarity(carrier, clearanceTarget);
const clearanceScore =
2.12 +
boxStress * 0.68 +
pressure * 0.5 +
directness * 0.36 +
clearanceLaneClarity * 0.58 -
shortSupport * 0.14;
const clearanceCandidate = {
actionType: "pass",
target: clearanceTarget,
receiverPlayerId: null,
receiverRoleKey: null,
passDistance: clearancePassDistance,
forwardGain: clearanceForwardGain,
laneClarity: clearanceLaneClarity,
receiverPressure: 0.38,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, clearanceTarget, new Set([carrier.id]), 18),
isLineBreak: clearanceForwardGain >= 18,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "danger-zone-clearance",
principleLabel: "Danger-zone escape: clear first contact away from goal",
score: clearanceScore,
firstTouchMode: "forward",
label: "danger clearance",
reason: "ball recovered near own goal; first priority is to move danger away from the box",
};
const outletCandidates = state.players
.filter((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return roleKey === "wideBack" || roleKey === "pivot" || roleKey === "connector" || roleKey === "rest";
})
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * attackSign;
const lateralEscape = Math.abs(target.y - startPoint.y);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const roleKey = getOffensiveRoleKey(receiver, formation);
const receiverStrength = getAutoPilotRoleStrength(receiver, "receiver");
const roleFit =
roleKey === "wideBack"
? 0.38
: roleKey === "pivot"
? 0.3
: roleKey === "connector"
? 0.2
: 0.12;
const score =
1.88 +
laneClarity * 1.08 +
receiverStrength * 0.44 +
roleFit +
shortSupport * 0.36 +
clamp(lateralEscape / 18, 0, 0.26) +
(forwardGain >= -3 ? 0.14 : 0) -
receiverPressure * 0.66 -
pressure * 0.12 -
Math.abs(passDistance - 13) * 0.025 -
(forwardGain < -8 ? 0.36 : 0);
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
score,
};
})
.filter((candidate) => (
candidate.passDistance >= 5 &&
candidate.passDistance <= 25 &&
candidate.forwardGain >= -10 &&
candidate.laneClarity >= 0.3 &&
candidate.receiverPressure <= 0.82 &&
candidate.score >= 1.48
))
.sort((a, b) => b.score - a.score);
const outlet = outletCandidates[0] ?? null;
const outletCandidate = outlet
? {
actionType: "pass",
target: outlet.target,
receiverPlayerId: outlet.receiver.id,
receiverRoleKey: outlet.roleKey,
passDistance: outlet.passDistance,
forwardGain: outlet.forwardGain,
laneClarity: outlet.laneClarity,
receiverPressure: outlet.receiverPressure,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, outlet.target, new Set([carrier.id, outlet.receiver.id]), 13),
isLineBreak: false,
isSwitch: false,
isSidewaysPass: Math.abs(outlet.forwardGain) < 4 && Math.abs(outlet.target.y - startPoint.y) >= 6,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "danger-zone-wide-outlet",
principleLabel: `Danger-zone escape: ${getPlayerMagnetLabel(outlet.receiver)} is the first safe outlet`,
score: outlet.score + (boxStress >= 0.58 && pressure < 0.64 ? 0.2 : 0),
firstTouchMode: outlet.forwardGain >= 2 ? "forward" : "inside",
label: "danger outlet",
reason: "ball recovered near own goal; first pass finds a safe support outside the pressure",
}
: null;
if (insideOwnBox && pressure >= 0.62) {
return clearanceCandidate;
}
return chooseScoredCandidateWithVariation(
[clearanceCandidate, outletCandidate],
profile,
{
tolerance: 0.24,
temperature: 0.12,
preferredCandidate: outletCandidate && outletCandidate.score >= clearanceCandidate.score - 0.12
? outletCandidate
: clearanceCandidate,
carrier,
startPoint,
}
);
}

  return {
    getPressedRegainExitVector,
    buildAutoPilotPressedRegainExitCandidate,
    buildAutoPilotDangerZoneEscapeCandidate,
  };
}
