export function createGameSimulatorAutopilotDefensivePressureCoverTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    getActionSpaceValue,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDefensivePressTarget,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensivePressureCoverContext(teamId, ballPoint, presser, profile) {
if (!presser || isGoalkeeper(presser) || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
receiverPlayerId: state.ball.receiverPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!attackingTeamId || !targetPoint || !startPoint) {
return null;
}
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(presser) ||
getWideSideSign(startPoint) ||
1;
const isWidePressure = Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2) >= 0.54;
const centralDanger =
targetThreat.centralPocket >= 0.24 ||
targetThreat.betweenLines >= 0.32 ||
targetThreat.box >= 0.16 ||
ballFromOwnGoal <= 45;
const depthDanger =
targetThreat.behindLine >= 0.24 ||
actionSpace.lineBreakCount >= 1 ||
forwardGain >= 8;
return {
actionMeta,
attackingTeamId,
presser,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
targetThreat,
actionSpace,
ballFromOwnGoal,
sideSign,
isWidePressure,
centralDanger,
depthDanger,
forwardGain,
phaseKey: profile.phaseKey,
};
}
function getDefensivePressureCoverTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const presserTarget = context.presserTarget ?? goalSideOf(ball, 1.8);
const coverDistance =
context.phaseKey === "highPress"
? 4.8
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 6.8
: 5.8;
const supportDepth =
context.phaseKey === "highPress"
? 4.6
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 6.4
: 5.4;
const triangleWidth =
context.isWidePressure
? 4.8
: context.centralDanger
? 3.6
: 4.2;
const points = {
insideCover: {
...goalSideOf(presserTarget, supportDepth),
y: lerp(
presserTarget.y,
pitch.width / 2,
context.isWidePressure ? 0.72 : 0.82
),
},
pressCover: {
x: lerp(ball.x, ownGoal.x, context.depthDanger ? 0.38 : 0.28),
y: lerp(ball.y, pitch.width / 2, context.centralDanger ? 0.74 : 0.58),
},
laneScreen: {
x: lerp(context.startPoint.x, ball.x, 0.6) - sign * (2.4 + context.targetThreat.value * 1.1),
y: lerp(lerp(context.startPoint.y, ball.y, 0.6), pitch.width / 2, 0.18),
},
outsideLock: {
x: presserTarget.x - sign * 2.2,
y: clamp(ball.y + sideSign * triangleWidth, 3.5, pitch.width - 3.5),
},
weakSideBalance: {
x: lerp(ball.x, ownGoal.x, context.depthDanger ? 0.42 : 0.34),
y: clamp(pitch.width / 2 - sideSign * (context.phaseKey === "boxDefending" ? 7.8 : 10.8), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.insideCover, 2.2);
}
function applyDefensivePressureCoverBalanceTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile
) {
const context = getDefensivePressureCoverContext(teamId, ballPoint, presser, profile);
if (!context) {
return {
labels: [],
focusPoint: null,
protectedIds: new Set([presser?.id].filter(Boolean)),
};
}
context.presserTarget = cloneVector(
targets.get(presser.id) ?? getDefensivePressTarget(teamId, ballPoint, profile, presser)
);
const labels = [];
const assignedIds = new Set([
presser?.id,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensivePressureCoverTarget(teamId, context, slot);
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
assign("insideCover", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Second defender covers inside");
assign("pressCover", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Third defender covers behind press");
if (context.isWidePressure) {
assign("outsideLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Lock outside of press");
} else {
assign("laneScreen", ["midfield", "forward"], ["6", "8", "10", "9"], "Screen pass behind press");
}
if (context.depthDanger || context.centralDanger || context.isWidePressure) {
assign("weakSideBalance", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Balance far side");
}
return {
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensivePressureCoverContext,
    getDefensivePressureCoverTarget,
    applyDefensivePressureCoverBalanceTargets,
  };
}
