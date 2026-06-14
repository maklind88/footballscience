export function createGameSimulatorAutopilotDefensiveCarryContainmentTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getBallTravelProgress,
    getDefendingDirectionSign,
    getDefensiveAutopilotLineKey,
    getOffensiveAutopilotProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getPlayerById,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    moveTowards,
    pickDefensiveAutopilotPlayer,
    pitch,
    playerRadiusMeters,
    projectPointOnSegmentWithRatio,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getDribblePressureReference(actionMeta = state.draftStep) {
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType !== "dribble") {
return null;
}
const carrier = getPlayerById(actionMeta?.carrierPlayerId ?? state.ball.carrierPlayerId);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
carrier?.position ??
state.ball.position;
const targetPoint = actionMeta?.target ?? state.ball.target;
if (!startPoint || !targetPoint || distance(startPoint, targetPoint) <= 0.25) {
return null;
}
return {
carrier,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
};
}
function chooseDefensiveDribblePresser(teamId, targets, profile, reference) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const { carrier, startPoint, targetPoint } = reference;
const laneDistance = Math.max(distance(startPoint, targetPoint), 0.01);
const candidates = state.players.filter(
(player) =>
player.team === teamId &&
!isGoalkeeper(player) &&
player.id !== carrier?.id
);
let bestCandidate = null;
let bestScore = Infinity;
candidates.forEach((player) => {
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
const laneGap = distance(player.position, projection.point);
const carrierGap = distance(player.position, carrier?.position ?? startPoint);
const baseTarget = targets.get(player.id) ?? player.position;
const baseTargetGap = distance(baseTarget, startPoint);
const lineKey = getDefensiveAutopilotLineKey(player, formation, profile.phaseKey);
const canPressCarrier = carrierGap <= 18.5;
const canCutLane =
projection.ratio >= 0.02 &&
projection.ratio <= 0.72 &&
laneGap <= Math.max(7.2, laneDistance * 0.34);
if (!canPressCarrier && !canCutLane) {
return;
}
const lanePointDistance = distance(player.position, projection.point);
const timeToCarrier = computeTimeToCoverDistance(
player,
Math.max(carrierGap - playerRadiusMeters * 1.35, 0),
carrier?.position ?? startPoint
);
const timeToLane = computeTimeToCoverDistance(player, lanePointDistance, projection.point);
const nearCarrierBonus = canPressCarrier ? 4.2 : 0;
const laneCutBonus = canCutLane ? 3.2 : 0;
const linePenalty =
lineKey === "forward"
? profile.phaseKey === "highPress" ? -1.2 : 1.4
: lineKey === "back" && profile.phaseKey === "highPress"
? 1.8
: 0;
const score =
carrierGap * 0.46 +
laneGap * 0.4 +
baseTargetGap * 0.12 +
timeToCarrier * 0.95 +
timeToLane * 0.55 +
Math.abs(projection.ratio - 0.22) * 4.2 +
linePenalty -
nearCarrierBonus -
laneCutBonus;
if (score < bestScore) {
bestScore = score;
bestCandidate = player;
}
});
return bestCandidate;
}
function getDefensiveDribblePressTarget(player, reference, profile, liveBallPoint = null) {
const { startPoint, targetPoint } = reference;
const laneDistance = Math.max(distance(startPoint, targetPoint), 0.01);
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
const liveProgress =
state.ball.actionType === "dribble" && state.ball.inTransit
? getBallTravelProgress()
: 0;
const ballPoint = liveBallPoint ?? (
state.ball.actionType === "dribble" && state.ball.inTransit
? state.ball.position
: startPoint
);
const closeToCarrier = distance(player.position, ballPoint) <= 8.5;
const laneRatio = closeToCarrier
? clamp(liveProgress + 0.045, 0.04, 0.62)
: clamp(
Math.max(projection.ratio, liveProgress + 0.08, laneDistance > 14 ? 0.18 : 0.12),
0.06,
laneDistance > 18 ? 0.58 : 0.68
);
const lanePoint = {
x: lerp(startPoint.x, targetPoint.x, laneRatio),
y: lerp(startPoint.y, targetPoint.y, laneRatio),
};
const pressureDistance = closeToCarrier ? 0.55 : 0.15;
const pressurePoint = moveTowards(ballPoint, lanePoint, pressureDistance);
const insideBias =
(profile.phaseKey === "highPress" ? 0.08 : 0.14) +
(profile.threatResponse?.protectCenter ?? 0) * 0.16;
return clampToPitch({
x: pressurePoint.x,
y: lerp(pressurePoint.y, pitch.width / 2, insideBias),
}, 2);
}
function getDefensiveCarryContainmentContext(defensiveTeamId, ballPoint, profile, reference = getDribblePressureReference()) {
if (!reference || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const { carrier, startPoint, targetPoint } = reference;
const carryDistance = distance(startPoint, targetPoint);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId, getOffensiveAutopilotProfile(attackingTeamId, targetPoint));
const targetThreat = actionSpace.targetThreat;
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const openGrassCarry =
principleText.includes("open-grass") ||
(
carryDistance >= 9 &&
forwardGain >= 5 &&
actionSpace.openTarget >= 0.48 &&
actionSpace.targetPressure <= 0.72
);
const dangerousCarry =
openGrassCarry ||
targetThreat.behindLine >= 0.24 ||
targetThreat.centralPocket >= 0.28 ||
targetThreat.box >= 0.18 ||
getAttackingDepth(targetPoint, attackingTeamId) >= 54;
if (!dangerousCarry) {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const isWideCarry = isWidePrincipleZone(targetPoint) || isWidePrincipleZone(startPoint);
const finalThirdCarry =
targetDepth >= 64 ||
targetThreat.box >= 0.18 ||
targetThreat.cutbackZone >= 0.24 ||
targetThreat.behindLine >= 0.3;
const laneMid = {
x: lerp(startPoint.x, targetPoint.x, 0.52),
y: lerp(startPoint.y, targetPoint.y, 0.52),
};
return {
actionMeta,
attackingTeamId,
carrier,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
ballPoint: cloneVector(ballPoint ?? targetPoint),
carryDistance,
forwardGain,
actionSpace,
targetThreat,
openGrassCarry,
targetDepth,
sideSign,
laneMid,
isWideCarry,
finalThirdCarry,
mode: finalThirdCarry
? "emergencyDelay"
: openGrassCarry
? "openGrassDelay"
: "normalDelay",
};
}
function getDefensiveCarryContainmentTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const { startPoint, targetPoint, laneMid, sideSign } = context;
const lanePoint = (ratio) => ({
x: lerp(startPoint.x, targetPoint.x, ratio),
y: lerp(startPoint.y, targetPoint.y, ratio),
});
const delayPoint = lanePoint(context.finalThirdCarry ? 0.42 : 0.36);
const secondPressurePoint = lanePoint(context.finalThirdCarry ? 0.64 : 0.58);
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const points = {
delayCarrier: {
...goalSideOf(delayPoint, context.openGrassCarry ? 1.45 : 1.1),
y: lerp(delayPoint.y, pitch.width / 2, context.isWideCarry ? 0.12 : 0.24),
},
insideContain: {
x: secondPressurePoint.x - sign * 2.8,
y: lerp(secondPressurePoint.y, pitch.width / 2, context.isWideCarry ? 0.58 : 0.72),
},
channelLock: {
x: secondPressurePoint.x - sign * 1.9,
y: clamp(secondPressurePoint.y + sideSign * (context.isWideCarry ? 3.8 : 6.2), 3.5, pitch.width - 3.5),
},
depthDrop: {
x: lerp(targetPoint.x, ownGoal.x, context.finalThirdCarry ? 0.48 : 0.36),
y: lerp(targetPoint.y, pitch.width / 2, context.isWideCarry ? 0.4 : 0.28),
},
secondBallScreen: {
x: laneMid.x - sign * 7.2,
y: lerp(laneMid.y, pitch.width / 2, 0.62),
},
cutbackScreen: {
x: lerp(targetPoint.x, ownGoal.x, context.finalThirdCarry ? 0.42 : 0.34),
y: clamp(pitch.width / 2 + sideSign * 5.6, 12, pitch.width - 12),
},
farSideTuck: {
x: lerp(targetPoint.x, ownGoal.x, context.finalThirdCarry ? 0.42 : 0.34),
y: clamp(pitch.width / 2 - sideSign * 10.2, 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.delayCarrier, 2.2);
}
function applyDefensiveCarryContainmentTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveCarryContainmentContext(teamId, ballPoint, profile, reference);
if (!context) {
return {
presser: basePresser,
labels: [],
focusPoint: null,
protectedIds: new Set(protectedIds),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
let presser = basePresser;
const delayTarget = getDefensiveCarryContainmentTarget(teamId, context, "delayCarrier");
const presserCanContain =
presser &&
!isGoalkeeper(presser) &&
distance(presser.position, delayTarget) <= (context.openGrassCarry ? 22 : 17);
if (presserCanContain) {
targets.set(presser.id, delayTarget);
assignedIds.add(presser.id);
labels.push(context.openGrassCarry ? "Delay open-grass carry" : "Delay ball carrier");
} else {
const containPlayer = pickDefensiveAutopilotPlayer(
groups,
context.finalThirdCarry ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
assignedIds,
delayTarget,
context.isWideCarry ? ["WB", "LB", "RB", "W", "8", "6"] : ["6", "8", "10", "CB", "9"]
);
if (containPlayer) {
targets.set(containPlayer.id, delayTarget);
assignedIds.add(containPlayer.id);
presser = containPlayer;
labels.push(context.openGrassCarry ? "Delay open-grass carry" : "Delay ball carrier");
}
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveCarryContainmentTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
if (!player) {
return null;
}
targets.set(player.id, target);
assignedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
assign("insideContain", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Block inside carry lane");
if (context.isWideCarry) {
assign("channelLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Lock outside channel");
} else {
assign("secondBallScreen", ["midfield", "forward"], ["6", "8", "10", "9"], "Screen next touch");
}
assign("depthDrop", ["back"], ["CB", "LB", "RB", "WB"], "Drop to protect depth");
if (context.finalThirdCarry) {
assign("cutbackScreen", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Protect cutback on carry");
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side protects box");
} else if (context.openGrassCarry) {
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side narrows behind carry");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDribblePressureReference,
    chooseDefensiveDribblePresser,
    getDefensiveDribblePressTarget,
    getDefensiveCarryContainmentContext,
    getDefensiveCarryContainmentTarget,
    applyDefensiveCarryContainmentTargets,
  };
}
