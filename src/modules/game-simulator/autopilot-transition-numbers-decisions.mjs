export function createGameSimulatorAutopilotTransitionNumbersDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotPostRecoveryPhaseContext,
    getAutoPilotRegainContext,
    getAutoPilotRoleStrength,
    getCarryLaneOpenSpaceScore,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getOpponentPressureAtPoint,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlayerById,
    getTeamSupportCountAroundPoint,
    isFrontLineRole,
    isGoalkeeper,
    isSupportRole,
    isTransitionAttackStyle,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotTransitionNumbersContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
const postRecovery = getAutoPilotPostRecoveryPhaseContext(carrier, startPoint, profile);
const activeRegain = regain.active && regain.freshness >= 0.08;
const activePostRecovery = postRecovery.active && postRecovery.elapsed <= 8.5;
if (!activeRegain && !activePostRecovery) {
return { active: false, regain, postRecovery };
}
const sign = getAttackDirectionSign(teamId);
const pressure = activeRegain ? regain.pressure : postRecovery.pressure;
const forwardOpenSpace = activeRegain ? regain.forwardOpenSpace : postRecovery.forwardOpenSpace;
const currentDepth = getAttackingDepth(startPoint, teamId);
const maxForwardBand = currentDepth >= 68 ? 28 : 42;
const laneWidth = currentDepth >= 68 ? 28 : 34;
const attackersAhead = state.players
.filter((player) => {
if (player.team !== teamId || player.id === carrier.id || isGoalkeeper(player)) {
return false;
}
const forwardMeters = (player.position.x - startPoint.x) * sign;
return forwardMeters >= 1.5 &&
forwardMeters <= maxForwardBand &&
Math.abs(player.position.y - startPoint.y) <= laneWidth;
})
.reduce((total, player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const roleWeight = isFrontLineRole(roleKey)
? 1
: roleKey === "connector"
? 0.72
: roleKey === "wideBack"
? 0.58
: roleKey === "pivot"
? 0.46
: 0.34;
const runnerWeight = getAutoPilotRoleStrength(player, "runner") * 0.18;
return total + roleWeight + runnerWeight;
}, 0);
const defendersAhead = state.players
.filter((player) => {
if (player.team === teamId || isGoalkeeper(player)) {
return false;
}
const forwardMeters = (player.position.x - startPoint.x) * sign;
return forwardMeters >= -3 &&
forwardMeters <= maxForwardBand + 8 &&
Math.abs(player.position.y - startPoint.y) <= laneWidth + 5;
})
.reduce((total, player) => {
const forwardMeters = (player.position.x - startPoint.x) * sign;
const centralWeight = 1 - clamp(Math.abs(player.position.y - startPoint.y) / (laneWidth + 5), 0, 0.42);
const depthWeight = forwardMeters >= 0 ? 1 : 0.72;
return total + centralWeight * depthWeight;
}, 0);
const nearbySupport = getTeamSupportCountAroundPoint(teamId, startPoint, new Set([carrier.id]), 15);
const transitionAdvantage = clamp(
attackersAhead - defendersAhead * 0.82 + nearbySupport * 0.18 + forwardOpenSpace * 0.72 - pressure * 0.55,
-3.5,
3.5
);
const counterWindow = clamp(
(activeRegain ? regain.counterIntent * regain.freshness : postRecovery.counterWindow) +
forwardOpenSpace * 0.28 +
Math.max(transitionAdvantage, 0) * 0.16 +
(pressure <= 0.42 ? 0.12 : 0) +
(isTransitionAttackStyle(profile.styleKey) ? 0.18 : 0),
0,
1.45
);
const secureNeed = clamp(
(activeRegain ? regain.secureIntent * regain.freshness : postRecovery.secureNeed) +
pressure * 0.28 +
Math.max(defendersAhead - attackersAhead, 0) * 0.1 +
(nearbySupport <= 1 ? 0.14 : 0) -
forwardOpenSpace * 0.1,
0,
1.35
);
return {
active: true,
source: activeRegain ? "freshRegain" : "postRecovery",
pressure,
forwardOpenSpace,
currentDepth,
attackersAhead,
defendersAhead,
nearbySupport,
transitionAdvantage,
counterWindow,
secureNeed,
};
}
function getAutoPilotTransitionNumbersAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotTransitionNumbersContext(carrier, startPoint, profile);
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
const startThreat = getPitchThreatProfile(startPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const laneShift = Math.abs(getPitchLaneIndex(target) - getPitchLaneIndex(startPoint));
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getOpponentPressureAtPoint(teamId, target, candidate.actionType === "dribble" ? 8.5 : 11.5);
const supportNearTarget = Number.isFinite(candidate.supportNearTarget)
? candidate.supportNearTarget
: getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean)),
passDistance >= 24 ? 16 : 12
);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const directAction =
(candidate.actionType === "pass" || candidate.actionType === "dribble") &&
forwardGain >= 6 &&
(
candidate.isLineBreak ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.38 ||
targetThreat.value >= startThreat.value + 0.07 ||
targetThreat.behindLine >= 0.18
) &&
laneClarity >= 0.42 &&
targetPressure <= 0.78;
const secureAction =
candidate.actionType === "pass" &&
passDistance >= 5.5 &&
passDistance <= 22 &&
forwardGain >= -8 &&
targetPressure <= 0.72 &&
(
supportNearTarget >= 1 ||
isSupportRole(receiverRoleKey) ||
receiverRoleKey === "wideBack" ||
laneShift >= 1
);
const carryExploit =
candidate.actionType === "dribble" &&
forwardGain >= 4.5 &&
actionSpace.openTarget >= 0.48 &&
context.pressure <= 0.66;
const finishTransition =
candidate.actionType === "shot" &&
(
candidate.mustShoot ||
targetThreat.box >= 0.2 ||
startThreat.centralPocket >= 0.34 ||
context.currentDepth >= 66
);
const unsupportedForward =
candidate.actionType === "pass" &&
passDistance >= 24 &&
forwardGain >= 8 &&
!candidate.isSwitch &&
supportNearTarget <= 0 &&
targetPressure >= 0.56 &&
laneClarity < 0.68 &&
context.transitionAdvantage < 0.2;
const lowValueKill =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.045 &&
context.counterWindow >= 0.58 &&
context.pressure <= 0.52;
const labels = [];
let score = 0;
if (context.transitionAdvantage >= 0.35 && context.counterWindow >= 0.54) {
if (directAction) {
score += 0.24 + context.counterWindow * 0.24 + Math.max(context.transitionAdvantage, 0) * 0.08;
labels.push("Transition numbers: exploit advantage");
}
if (carryExploit) {
score += 0.16 + context.forwardOpenSpace * 0.22 + (profile.carryBias ?? 0.5) * 0.1;
labels.push("Transition numbers: carry into open grass");
}
if (finishTransition) {
score += 0.16 + (profile.shootBias ?? 0.5) * 0.14;
labels.push("Transition numbers: finish the break");
}
if (lowValueKill) {
score -= 0.32 + context.counterWindow * 0.22;
labels.push("Transition numbers: do not kill advantage");
}
}
if (context.transitionAdvantage <= -0.35 || context.secureNeed >= 0.68) {
if (secureAction) {
score += 0.2 + context.secureNeed * 0.24 + (profile.shortSupport ?? 0.5) * 0.1;
labels.push("Transition numbers: secure against pressure");
}
if (unsupportedForward) {
score -= 0.38 + Math.min(Math.abs(context.transitionAdvantage), 1.4) * 0.18;
labels.push("Transition numbers: avoid unsupported release");
}
}
if (
context.source === "freshRegain" &&
context.pressure <= 0.38 &&
context.transitionAdvantage >= 0 &&
candidate.actionType === "pass" &&
forwardGain <= -4 &&
!candidate.isSwitch
) {
score -= 0.22 + context.counterWindow * 0.16;
}
return {
score: clamp(score, -1.05, 1.05),
labels: uniquePrincipleLabels(labels),
context: {
source: context.source,
transitionAdvantage: context.transitionAdvantage,
attackersAhead: context.attackersAhead,
defendersAhead: context.defendersAhead,
nearbySupport: context.nearbySupport,
counterWindow: context.counterWindow,
secureNeed: context.secureNeed,
laneClarity,
targetPressure,
supportNearTarget,
directAction,
secureAction,
carryExploit,
finishTransition,
unsupportedForward,
lowValueKill,
},
};
}

  return {
    getAutoPilotTransitionNumbersContext,
    getAutoPilotTransitionNumbersAdjustment,
  };
}
