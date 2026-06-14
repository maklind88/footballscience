export function createGameSimulatorAutopilotDefensiveCentralAccessGateTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingGameSpaceProfile,
    getDefendingDirectionSign,
    getDepthX,
    getDistanceFromOwnGoal,
    getOffensiveAutopilotProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveCentralAccessGateContext(defensiveTeamId, ballPoint, profile) {
if (state.restartPhase?.type || !ballPoint) {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
profileKey: state.ball.profileKey,
profileLabel: state.ball.profileLabel,
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (actionType !== "pass" && actionType !== "dribble") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const startThreat = getPitchThreatProfile(startPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(
startPoint,
targetPoint,
attackingTeamId,
getOffensiveAutopilotProfile(attackingTeamId, targetPoint)
);
const targetGameSpace = getAttackingGameSpaceProfile(targetPoint, attackingTeamId);
const startGameSpace = getAttackingGameSpaceProfile(startPoint, attackingTeamId);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const actionDistance = distance(startPoint, targetPoint);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const centrality = 1 - Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const carrierPressure = carrier ? getPlayerPressureLoad(carrier, startPoint) : 0.48;
const laneClarity =
carrier && actionType === "pass"
? computePassLaneClarity(carrier, targetPoint, { receiverPlayerId: receiver?.id })
: clamp(0.54 + actionSpace.openTarget * 0.18 - carrierPressure * 0.1, 0.22, 0.9);
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isSpaceTwoEntry =
targetGameSpace.key === "space2" ||
targetThreat.betweenLines >= 0.3 ||
(
targetGameSpace.index > startGameSpace.index &&
targetGameSpace.index >= 2 &&
forwardGain >= 3.5
);
const isCentralOrHalfSpace =
targetThreat.centralPocket >= 0.2 ||
targetThreat.halfSpace >= 0.32 ||
centrality >= 0.46 ||
Math.abs(targetPoint.y - pitch.width / 2) <= 18;
const canFaceForward =
carrierPressure <= 0.5 &&
laneClarity >= 0.42 &&
(
targetThreat.centralPocket >= 0.2 ||
targetThreat.betweenLines >= 0.28 ||
targetThreat.halfSpace >= 0.34 ||
actionSpace.value >= 0.32
);
const receiveToTurnCue =
receiver &&
actionType === "pass" &&
actionDistance >= 6 &&
(
isSpaceTwoEntry ||
principleText.includes("space 2") ||
principleText.includes("between") ||
principleText.includes("line-break")
);
const carryIntoGateCue =
actionType === "dribble" &&
forwardGain >= 4 &&
isCentralOrHalfSpace &&
(
targetThreat.betweenLines >= 0.24 ||
targetThreat.centralPocket >= 0.18 ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.28
);
const active =
ballFromOwnGoal <= 68 &&
isCentralOrHalfSpace &&
(
receiveToTurnCue ||
carryIntoGateCue ||
canFaceForward ||
(isSpaceTwoEntry && forwardGain >= 2.5)
);
if (!active) {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(receiver) ||
getWideSideSign(startPoint) ||
Math.sign(targetPoint.y - pitch.width / 2) ||
1;
const dangerScore = clamp(
targetThreat.centralPocket * 0.44 +
targetThreat.betweenLines * 0.42 +
targetThreat.halfSpace * 0.28 +
targetThreat.box * 0.22 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.26 +
clamp(forwardGain / 16, 0, 1) * 0.18 +
(canFaceForward ? 0.18 : 0) +
(receiveToTurnCue ? 0.12 : 0) -
carrierPressure * 0.08,
0,
1.35
);
return {
actionMeta,
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
targetThreat,
startThreat,
actionSpace,
targetGameSpace,
startGameSpace,
forwardGain,
actionDistance,
ballFromOwnGoal,
centrality,
carrierPressure,
laneClarity,
isSpaceTwoEntry,
isCentralOrHalfSpace,
canFaceForward,
receiveToTurnCue,
carryIntoGateCue,
sideSign,
dangerScore,
mode: carryIntoGateCue
? "carryGate"
: receiveToTurnCue
? "receiveGate"
: "centralScreen",
};
}

function getDefensiveCentralAccessGateTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const lanePoint = (ratio) => ({
x: lerp(context.startPoint.x, target.x, ratio),
y: lerp(context.startPoint.y, target.y, ratio),
});
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const gateDepth = clamp(
context.ballFromOwnGoal + (context.targetThreat.box >= 0.14 ? 2.6 : 5.4),
context.ballFromOwnGoal <= 34 ? 13 : 20,
context.ballFromOwnGoal <= 44 ? 45 : 58
);
const coverDepth = clamp(
context.ballFromOwnGoal - (context.targetThreat.behindLine >= 0.18 ? 4.6 : 2.4),
7.5,
context.ballFromOwnGoal <= 38 ? 32 : 48
);
const centralPull =
context.mode === "carryGate"
? 0.72
: context.targetThreat.centralPocket >= 0.24
? 0.86
: 0.66;
const points = {
frontGate: {
...goalSideOf(context.mode === "carryGate" ? lanePoint(0.66) : target, context.mode === "carryGate" ? 1.6 : 1.25),
y: lerp(target.y, pitch.width / 2, context.targetThreat.centralPocket >= 0.24 ? 0.16 : 0.08),
},
centralScreen: {
x: getDepthX(teamId, gateDepth),
y: lerp(target.y, pitch.width / 2, centralPull),
},
halfSpaceLock: {
x: getDepthX(teamId, clamp(gateDepth - 1.4, 14, 56)),
y: clamp(
lerp(target.y, pitch.width / 2 + sideSign * 8.2, context.targetThreat.halfSpace >= 0.34 ? 0.42 : 0.22),
6,
pitch.width - 6
),
},
bounceLock: {
...goalSideOf(lanePoint(context.actionType === "pass" ? 0.36 : 0.48), 2.6),
y: lerp(lanePoint(0.42).y, pitch.width / 2, 0.64),
},
backScreen: {
x: getDepthX(teamId, coverDepth),
y: lerp(target.y, pitch.width / 2, context.targetThreat.behindLine >= 0.18 ? 0.42 : 0.54),
},
weakSideTuck: {
x: lerp(target.x, ownGoal.x, context.ballFromOwnGoal <= 38 ? 0.4 : 0.3),
y: clamp(pitch.width / 2 - sideSign * (context.ballFromOwnGoal <= 38 ? 7.8 : 11.2), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.centralScreen, 2.1);
}

function applyDefensiveCentralAccessGateTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveCentralAccessGateContext(teamId, ballPoint, profile);
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
basePresser?.id,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
let presser = basePresser;
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveCentralAccessGateTarget(teamId, context, slot);
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
const frontGateTarget = getDefensiveCentralAccessGateTarget(teamId, context, "frontGate");
const canReusePresser =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, frontGateTarget) <= (context.mode === "carryGate" ? 19 : 15.5);
if (canReusePresser) {
targets.set(presser.id, frontGateTarget);
assignedIds.add(presser.id);
labels.push(context.mode === "carryGate" ? "Central gate: delay carry" : "Central gate: deny turn");
} else {
const gatePlayer = assign(
"frontGate",
context.ballFromOwnGoal <= 38 ? ["midfield", "back", "forward"] : ["midfield", "forward", "back"],
context.mode === "carryGate" ? ["6", "8", "10", "CB"] : ["6", "8", "10", "9"],
context.mode === "carryGate" ? "Central gate: delay carry" : "Central gate: deny turn"
);
presser = gatePlayer ?? presser;
}
assign("centralScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Central gate: screen space 2");
if (context.targetThreat.halfSpace >= 0.26 || Math.abs(context.targetPoint.y - pitch.width / 2) >= 8) {
assign("halfSpaceLock", ["midfield", "back"], ["8", "6", "WB", "LB", "RB", "CB"], "Central gate: lock half-space");
}
if (context.actionType === "pass" || context.laneClarity >= 0.46) {
assign("bounceLock", ["forward", "midfield"], ["10", "9", "8", "W", "6"], "Central gate: block bounce pass");
}
if (
context.actionSpace.lineBreakCount >= 1 ||
context.targetThreat.behindLine >= 0.18 ||
context.dangerScore >= 0.72
) {
assign("backScreen", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Central gate: protect depth behind");
}
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Central gate: weak side narrows");
if (labels.length) {
labels.unshift(
context.mode === "carryGate"
? "Protect central carry gate"
: context.mode === "receiveGate"
? "Protect space 2 receiving gate"
: "Protect central access"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveCentralAccessGateContext,
    getDefensiveCentralAccessGateTarget,
    applyDefensiveCentralAccessGateTargets,
  };
}
