export function createGameSimulatorActionSpaceSpatialDominanceMetrics(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getNearestOpponentGapToPoint,
    isGoalkeeper,
    state,
    uniquePrincipleLabels,
  } = deps;

function getTeamDensityAtPoint(teamId, point, radius = 12, excludedIds = new Set()) {
if (!teamId || !point) {
return 0;
}
return state.players.reduce((count, player) => {
if (player.team !== teamId || excludedIds.has(player.id) || isGoalkeeper(player)) {
return count;
}
return count + (distance(player.position, point) <= radius ? 1 : 0);
}, 0);
}
function getOpponentDensityAtPoint(teamId, point, radius = 12) {
if (!teamId || !point) {
return 0;
}
return state.players.reduce((count, player) => {
if (player.team === teamId || isGoalkeeper(player)) {
return count;
}
return count + (distance(player.position, point) <= radius ? 1 : 0);
}, 0);
}
function getSpaceDominanceProfile(startPoint, targetPoint, teamId, profile = {}, options = {}) {
if (!startPoint || !targetPoint || !teamId) {
return {
score: 0,
labels: [],
openAccess: 0,
supportBalance: 0,
congestion: 0,
turnWindow: 0,
lineBreakReward: 0,
overloadAdvantage: 0,
actionSpace: getActionSpaceValue(startPoint, targetPoint, teamId, profile),
};
}
const actionType = options.actionType ?? "pass";
const excludedIds = new Set(options.excludedIds ?? []);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const startThreat = actionSpace.startThreat;
const forwardGain = actionSpace.forwardGain;
const passDistance = distance(startPoint, targetPoint);
const nearRadius = actionType === "dribble" ? 9.5 : passDistance >= 26 ? 14 : 11.5;
const supportCount = getTeamDensityAtPoint(teamId, targetPoint, nearRadius, excludedIds);
const opponentCount = getOpponentDensityAtPoint(teamId, targetPoint, nearRadius);
const closeOpponents = getOpponentDensityAtPoint(teamId, targetPoint, 5.6);
const nearestOpponentGap = Number.isFinite(actionSpace.nearestOpponentGap)
? actionSpace.nearestOpponentGap
: getNearestOpponentGapToPoint(teamId, targetPoint);
const openAccess = Number.isFinite(nearestOpponentGap)
? clamp((nearestOpponentGap - 2.4) / 8.6, 0, 1)
: 1;
const supportBalance = clamp((supportCount + 1) / Math.max(opponentCount + 1, 1), 0, 2.2);
const overloadAdvantage = clamp((supportCount - opponentCount + 1) / 4, -0.35, 0.85);
const congestion = clamp(
opponentCount * 0.18 +
closeOpponents * 0.26 +
actionSpace.targetPressure * 0.38 -
supportCount * 0.06,
0,
1.25
);
const targetIsValuable =
targetThreat.value >= 0.46 ||
targetThreat.betweenLines >= 0.44 ||
targetThreat.centralPocket >= 0.4 ||
targetThreat.halfSpace >= 0.46 ||
targetThreat.box >= 0.26 ||
targetThreat.cutbackZone >= 0.34;
const turnWindow = clamp(
openAccess * 0.46 +
(supportBalance >= 1 ? 0.14 : 0) +
(targetThreat.betweenLines >= 0.36 || targetThreat.halfSpace >= 0.42 ? 0.18 : 0) +
(forwardGain >= 2 ? 0.12 : 0) -
closeOpponents * 0.12,
0,
1
);
const lineBreakReward = clamp(
actionSpace.lineBreakCount * 0.18 +
Math.max(0, forwardGain) / 30 +
Math.max(0, actionSpace.threatGain) * 0.42,
0,
1
);
const sterileArea =
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.04 &&
actionSpace.lineBreakCount === 0 &&
targetThreat.depth < 72;
const isolatedLongBall =
actionType === "pass" &&
passDistance >= 27 &&
forwardGain >= 8 &&
supportCount <= 0 &&
targetThreat.box < 0.2 &&
targetThreat.behindLine < 0.34;
const dribbleIntoTraffic =
actionType === "dribble" &&
forwardGain >= 3 &&
(closeOpponents >= 2 || (nearestOpponentGap <= 4.4 && actionSpace.lineBreakCount === 0));
const score = clamp(
actionSpace.value * 0.36 +
actionSpace.spacePriority.score * 0.28 +
openAccess * 0.2 +
overloadAdvantage * 0.18 +
turnWindow * 0.22 +
lineBreakReward * 0.24 +
(targetIsValuable && openAccess >= 0.46 ? 0.18 : 0) -
congestion * (targetIsValuable ? 0.22 : 0.34) -
(sterileArea ? 0.34 + (profile.progressionUrgency ?? 0.5) * 0.18 : 0) -
(isolatedLongBall ? 0.42 + (1 - (profile.routeOneBias ?? 0)) * 0.18 : 0) -
(dribbleIntoTraffic ? 0.46 - (profile.dribbleBias ?? 0.45) * 0.14 : 0),
-0.95,
1.05
);
const labels = [];
if (targetIsValuable && openAccess >= 0.5) {
labels.push(`Own ${targetThreat.primaryLabel}`);
}
if (turnWindow >= 0.58) {
labels.push("Can receive on the turn");
}
if (overloadAdvantage >= 0.26 && targetThreat.depth >= 38) {
labels.push("Local overload");
}
if (lineBreakReward >= 0.42) {
labels.push("Space behind next line");
}
if (congestion >= 0.72 && !targetIsValuable) {
labels.push("Avoid crowded space");
}
return {
score,
labels: uniquePrincipleLabels(labels),
openAccess,
supportBalance,
supportCount,
opponentCount,
closeOpponents,
congestion,
turnWindow,
lineBreakReward,
overloadAdvantage,
sterileArea,
isolatedLongBall,
dribbleIntoTraffic,
targetIsValuable,
actionSpace,
};
}
function getAutoPilotSpaceDominanceAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier) {
return {
score: 0,
labels: [],
dominance: null,
};
}
const excludedIds = [
carrier.id,
candidate.receiverPlayerId,
].filter(Boolean);
const dominance = getSpaceDominanceProfile(startPoint, candidate.target, carrier.team, profile, {
actionType: candidate.actionType,
excludedIds,
});
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetThreat = dominance.actionSpace.targetThreat;
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const labels = [...dominance.labels];
let score = dominance.score;
if (candidate.actionType === "pass") {
if (
dominance.turnWindow >= 0.56 &&
forwardGain >= 1 &&
passDistance <= 26 &&
(targetThreat.betweenLines >= 0.34 || targetThreat.halfSpace >= 0.38 || targetThreat.centralPocket >= 0.28)
) {
score += 0.2 + profile.shortSupport * 0.08;
labels.push("Play into turn window");
}
if (dominance.isolatedLongBall && profile.routeOneBias < 0.56) {
score -= 0.32;
}
if (
dominance.sterileArea &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
profile.phaseKey !== "buildUp"
) {
score -= 0.2 + profile.progressionUrgency * 0.18;
}
}
if (candidate.actionType === "dribble") {
if (dominance.openAccess >= 0.62 && forwardGain >= 5) {
score += 0.18 + profile.carryBias * 0.12;
labels.push("Carry into open lane");
}
if (dominance.dribbleIntoTraffic) {
score -= 0.3;
}
}
if (candidate.actionType === "shot") {
score += targetThreat.box * 0.14 + targetThreat.centralPocket * 0.12;
if (targetThreat.box >= 0.3 || targetThreat.centralPocket >= 0.42) {
labels.push("Shot from high-value space");
}
}
return {
score: clamp(score, -1.1, 1.25),
labels: uniquePrincipleLabels(labels),
dominance,
};
}

  return {
    getTeamDensityAtPoint,
    getOpponentDensityAtPoint,
    getSpaceDominanceProfile,
    getAutoPilotSpaceDominanceAdjustment,
  };
}
