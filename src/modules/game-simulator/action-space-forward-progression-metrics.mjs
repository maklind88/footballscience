export function createGameSimulatorActionSpaceForwardProgressionMetrics(deps = {}) {
  const {
    angleDifference,
    clamp,
    clampToPitch,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getCarryLaneOpenSpaceScore,
    getGoldenZoneScore,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerFacingAngle,
    getPlayerPressureLoad,
    getPlayerTendency,
    getTeamAttackAngle,
    isFrontLineRole,
    lerp,
    pitch,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getActionThreatGain(startPoint, targetPoint, teamId) {
const startThreat = getPitchThreatProfile(startPoint, teamId).value;
const targetThreat = getPitchThreatProfile(targetPoint, teamId).value;
return targetThreat - startThreat;
}
function isPlayerFacingForward(player, tolerance = Math.PI / 3.2) {
if (!player) {
return false;
}
return angleDifference(getPlayerFacingAngle(player), getTeamAttackAngle(player.team)) <= tolerance;
}
function getForwardFacingSpaceTwoContext(player, point = player?.position) {
if (!player || !point) {
return {
active: false,
depth: 0,
pressure: 1,
facingForward: false,
goldenScore: 0,
};
}
const depth = getAttackingDepth(point, player.team);
const pressure = getPlayerPressureLoad(player, point);
const facingForward = isPlayerFacingForward(player);
const active = depth >= 38 && depth <= 72 && pressure <= 0.46 && facingForward;
return {
active,
depth,
pressure,
facingForward,
goldenScore: getGoldenZoneScore(point, player.team),
};
}
function getAutoPilotSpaceTwoAdvantageAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const teamId = carrier.team;
const gameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.45);
const isSpaceTwo =
gameSpace.key === "space2" ||
startThreat.betweenLines >= 0.28 ||
(gameSpace.index >= 2 && gameSpace.index <= 3 && startThreat.centrality >= 0.42);
const active =
isSpaceTwo &&
facingForward &&
pressure <= 0.56 &&
getAttackingDepth(startPoint, teamId) >= 38 &&
getAttackingDepth(startPoint, teamId) <= 78;
if (!active) {
return {
score: 0,
labels: [],
context: {
active: false,
gameSpaceKey: gameSpace.key,
pressure,
facingForward,
},
};
}
const target = candidate.target;
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const targetThreat = getPitchThreatProfile(target, teamId);
const targetSpace = getAttackingGameSpaceProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const targetGoalDistance = distance(target, getOpponentGoalCenter(teamId));
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const isProgressivePass =
candidate.actionType === "pass" &&
forwardGain >= 3.5 &&
(
actionSpace.lineBreakCount >= 1 ||
targetSpace.index > gameSpace.index ||
targetThreat.value >= startThreat.value + 0.04 ||
targetThreat.betweenLines >= 0.32 ||
targetThreat.centralPocket >= 0.26 ||
isFrontLineRole(receiverRoleKey)
);
const isProgressiveCarry =
candidate.actionType === "dribble" &&
forwardGain >= 3.5 &&
(
actionSpace.value >= 0.26 ||
targetThreat.value >= startThreat.value + 0.035 ||
targetGoalDistance <= goalDistance - 3.5
);
const isShotWindow =
candidate.actionType === "shot" &&
goalDistance <= 32 &&
pressure <= 0.62;
const isLowValueRecycle =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.05 &&
actionSpace.lineBreakCount === 0 &&
targetSpace.index <= gameSpace.index;
const isBackwardsEscape =
candidate.actionType === "pass" &&
forwardGain <= -4 &&
pressure <= 0.44 &&
passDistance <= 24;
const safeSupportAllowance =
pressure >= 0.42 &&
passDistance <= 13 &&
(receiverRoleKey === "pivot" || receiverRoleKey === "connector");
const score =
(isProgressivePass
? 0.42 +
actionSpace.value * 0.38 +
clamp(forwardGain / 18, 0, 0.46) +
(targetThreat.centralPocket >= 0.28 ? 0.18 : 0) +
(targetSpace.index > gameSpace.index ? 0.18 : 0)
: 0) +
(isProgressiveCarry
? 0.38 +
actionSpace.openTarget * 0.26 +
clamp(forwardGain / 16, 0, 0.42) +
getPlayerTendency(carrier, "dribble") * 0.12
: 0) +
(isShotWindow ? 0.24 + clamp((32 - goalDistance) / 18, 0, 0.28) : 0) -
(isLowValueRecycle
? (safeSupportAllowance ? 0.24 : 0.68 + profile.progressionUrgency * 0.36)
: 0) -
(isBackwardsEscape ? 0.5 + profile.progressionUrgency * 0.28 : 0);
const labels = [];
if (isProgressivePass || isProgressiveCarry || isShotWindow) {
labels.push("Use space 2 advantage");
}
if (isProgressivePass && actionSpace.lineBreakCount >= 1) {
labels.push("Attack the next line");
} else if (isProgressiveCarry) {
labels.push("Carry into open lane");
}
return {
score: clamp(score, -1.25, 1.25),
labels: uniquePrincipleLabels(labels),
context: {
active: true,
gameSpaceKey: gameSpace.key,
targetGameSpaceKey: targetSpace.key,
pressure,
facingForward,
forwardGain,
lineBreakCount: actionSpace.lineBreakCount,
isProgressivePass,
isProgressiveCarry,
isShotWindow,
isLowValueRecycle,
},
};
}
function getForwardProgressionWindow(carrier, startPoint = carrier?.position, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const sign = getAttackDirectionSign(carrier.team);
const depth = getAttackingDepth(startPoint, carrier.team);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.35);
const probe = clampToPitch({
x: startPoint.x + sign * 18,
y: lerp(startPoint.y, pitch.width / 2, 0.26),
}, 2.5);
const openLane = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, probe));
const goldenAhead = getGoldenZoneScore(probe, carrier.team);
const spaceTwo = depth >= 36 && depth <= 74;
const active =
spaceTwo &&
pressure <= 0.54 &&
openLane >= 0.42 &&
(facingForward || profile.firstTouchForwardBias >= 0.7 || profile.directness >= 0.64);
return {
active,
depth,
pressure,
facingForward,
openLane,
goldenAhead,
probe,
urgency: clamp((profile.progressionUrgency ?? 0.5) * 0.58 + openLane * 0.34 + (facingForward ? 0.16 : 0), 0, 1.2),
};
}

  return {
    getActionThreatGain,
    isPlayerFacingForward,
    getForwardFacingSpaceTwoContext,
    getAutoPilotSpaceTwoAdvantageAdjustment,
    getForwardProgressionWindow,
  };
}
