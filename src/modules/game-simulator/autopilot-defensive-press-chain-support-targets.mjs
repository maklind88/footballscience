export function createGameSimulatorAutopilotDefensivePressChainSupportTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlayerById,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensivePressChainSupportContext(teamId, ballPoint, presser, profile) {
if (!presser || isGoalkeeper(presser) || !ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!targetPoint || !startPoint || !["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const carrier = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(receiver) ||
getWideSideSign(carrier) ||
getWideSideSign(startPoint) ||
1;
const isWidePress = isWidePrincipleZone(targetPoint) || Math.abs(targetPoint.y - pitch.width / 2) >= 17;
const centralRisk =
targetThreat.centralPocket >= 0.22 ||
targetThreat.betweenLines >= 0.28 ||
targetThreat.box >= 0.14 ||
actionSpace.lineBreakCount >= 1;
const shouldChain =
profile.pressingIntensity >= 0.48 ||
ballFromOwnGoal <= 46 ||
centralRisk ||
actionType === "dribble" ||
forwardGain >= 6;
if (!shouldChain) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const carrierId = carrier?.id ?? null;
const receiverId = receiver?.id ?? null;
const outlets = state.players
.filter((player) => player.team === attackingTeamId && player.id !== carrierId && !isGoalkeeper(player))
.map((player) => {
const point = player.position;
const gap = distance(targetPoint, point);
if (gap < 4.5 || gap > 30) {
return null;
}
const threat = getPitchThreatProfile(point, attackingTeamId);
const forwardFromBall = (point.x - targetPoint.x) * attackSign;
const centrality = 1 - Math.abs(point.y - pitch.width / 2) / (pitch.width / 2);
const receiverBoost = player.id === receiverId ? 0.18 : 0;
const score =
threat.value * 0.52 +
threat.centralPocket * 0.28 +
threat.betweenLines * 0.24 +
threat.box * 0.24 +
clamp(forwardFromBall / 18, -0.12, 0.28) +
centrality * 0.14 +
receiverBoost +
clamp((22 - gap) / 22, 0, 0.22);
return {
player,
point: cloneVector(point),
threat,
gap,
forwardFromBall,
score,
};
})
.filter(Boolean)
.sort((a, b) => b.score - a.score)
.slice(0, 3);
return {
actionMeta,
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
targetThreat,
actionSpace,
ballFromOwnGoal,
forwardGain,
sideSign,
isWidePress,
centralRisk,
outlets,
phaseKey: profile.phaseKey,
};
}
function getDefensivePressChainSupportTarget(teamId, context, slot, outlet = null) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const outletPoint = outlet?.point ?? ball;
const supportDepth =
context.phaseKey === "highPress"
? 4.6
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 7.2
: 5.8;
const points = {
secondWave: {
...goalSideOf(ball, supportDepth),
y: lerp(ball.y, pitch.width / 2, context.isWidePress ? 0.72 : 0.82),
},
insideGate: {
x: lerp(ball.x, ownGoal.x, context.centralRisk ? 0.22 : 0.16),
y: lerp(ball.y, pitch.width / 2, context.isWidePress ? 0.86 : 0.72),
},
touchlineLock: {
x: ball.x - sign * (context.phaseKey === "highPress" ? 2.8 : 3.8),
y: clamp(ball.y + sideSign * 5.2, 3.5, pitch.width - 3.5),
},
outletLock: {
...goalSideOf({
x: lerp(outletPoint.x, ball.x, 0.24),
y: lerp(outletPoint.y, pitch.width / 2, outlet?.threat?.centralPocket >= 0.22 ? 0.24 : 0.1),
}, outlet?.threat?.value >= 0.34 ? 1.65 : 1.1),
},
weakSideBalance: {
x: lerp(ball.x, ownGoal.x, context.centralRisk ? 0.38 : 0.3),
y: clamp(pitch.width / 2 - sideSign * (context.phaseKey === "boxDefending" ? 7.2 : 10.6), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.secondWave, 2.2);
}
function applyDefensivePressChainSupportTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensivePressChainSupportContext(teamId, ballPoint, presser, profile);
if (!context) {
return {
labels: [],
focusPoint: null,
protectedIds: new Set(protectedIds),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
presser?.id,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
const assign = (slot, lineKeys, preferLabels, label, outlet = null) => {
const target = getDefensivePressChainSupportTarget(teamId, context, slot, outlet);
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
assign("secondWave", ["midfield", "back"], ["6", "8", "CB", "10"], "Press chain: second wave covers");
assign("insideGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Press chain: close inside gate");
context.outlets.slice(0, context.centralRisk ? 2 : 1).forEach((outlet, index) => {
assign(
"outletLock",
index === 0 ? ["midfield", "forward", "back"] : ["midfield", "back", "forward"],
outlet.threat.box >= 0.12 || outlet.threat.centralPocket >= 0.22
? ["6", "8", "CB", "10"]
: ["W", "8", "LB", "RB", "WB", "10"],
index === 0 ? "Press chain: lock first outlet" : "Press chain: lock next outlet",
outlet
);
});
if (context.isWidePress) {
assign("touchlineLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Press chain: lock touchline");
}
if (context.centralRisk || context.ballFromOwnGoal <= 42 || context.isWidePress) {
assign("weakSideBalance", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Press chain: far side balances");
}
if (labels.length) {
labels.unshift("Defensive press chain support");
}
return {
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensivePressChainSupportContext,
    getDefensivePressChainSupportTarget,
    applyDefensivePressChainSupportTargets,
  };
}
