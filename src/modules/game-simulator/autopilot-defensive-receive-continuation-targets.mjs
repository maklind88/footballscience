export function createGameSimulatorAutopilotDefensiveReceiveContinuationTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getDefendingDirectionSign,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlayerById,
    getWideSideSign,
    isGoalkeeper,
    isWideChannel,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveReceiveContinuationNextPoint(attackingTeamId, target, startPoint, firstTouchMode, intent, sideSign = 1) {
const sign = getAttackDirectionSign(attackingTeamId);
const targetIsWide = isWideChannel(target);
if (intent === "bounce") {
return clampToPitch({
x: lerp(target.x, startPoint.x, 0.48),
y: lerp(target.y, pitch.width / 2, 0.28),
}, 2.4);
}
const forwardMeters =
intent === "finish"
? 12.5
: intent === "carry"
? 9.8
: intent === "turn"
? 8.2
: 6.8;
const centerPull =
firstTouchMode === "inside"
? 0.5
: targetIsWide
? 0.42
: 0.22;
const yRelease =
targetIsWide
? lerp(target.y, pitch.width / 2, centerPull)
: clamp(target.y - sideSign * (intent === "finish" ? 2.8 : 1.4), 4, pitch.width - 4);
return clampToPitch({
x: target.x + sign * forwardMeters,
y: yRelease,
}, 2.4);
}
function getDefensiveReceiveContinuationContext(defensiveTeamId, ballPoint, profile) {
if (state.restartPhase?.type) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
principleRunnerPlayerId: null,
autoPrinciples: [],
firstTouchMode: state.ball.firstTouchMode,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
offensiveAutopilot: null,
};
if ((actionMeta.actionType ?? state.ball.actionType) !== "pass") {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
const target = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiverCandidate = getPlayerById(
actionMeta.receiverPlayerId ??
actionMeta.principleRunnerPlayerId ??
state.ball.receiverPlayerId
);
const receiver = receiverCandidate?.team === attackingTeamId ? receiverCandidate : null;
if (!attackingTeamId || !startPoint || !target || carrier?.team === defensiveTeamId) {
return null;
}
const passDistance = distance(startPoint, target);
if (passDistance < 5.2) {
return null;
}
const attackProfile = getOffensiveAutopilotProfile(attackingTeamId, target);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (target.x - startPoint.x) * attackSign;
const targetThreat = getPitchThreatProfile(target, attackingTeamId);
const targetSpace = getAttackingGameSpaceProfile(target, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, target, attackingTeamId, attackProfile);
const targetDepth = getAttackingDepth(target, attackingTeamId);
const firstTouchMode = actionMeta.firstTouchMode ?? state.ball.firstTouchMode ?? "auto";
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[attackingTeamId]?.formation) : null;
const sideSign =
getWideSideSign(target) ||
getWideSideSign(receiver) ||
getWideSideSign(startPoint) ||
1;
const spaceTwoCue =
principleText.includes("space 2") ||
principleText.includes("space-two") ||
principleText.includes("spelyta") ||
principleText.includes("between-line") ||
principleText.includes("between lines") ||
principleText.includes("open-body");
const spaceTwoReceive =
spaceTwoCue ||
targetSpace.key === "space2" ||
(targetSpace.index === 2 && targetThreat.centrality >= 0.38) ||
targetThreat.betweenLines >= 0.32 ||
targetThreat.centralPocket >= 0.27 ||
(targetThreat.halfSpace >= 0.44 && targetDepth >= 42 && targetDepth <= 78);
const receiveFlow =
principleText.includes("receive") ||
principleText.includes("third-player") ||
principleText.includes("first touch") ||
principleText.includes("next player") ||
spaceTwoCue;
const openBodyReceive =
firstTouchMode === "forward" ||
firstTouchMode === "inside" ||
spaceTwoReceive ||
(firstTouchMode === "auto" && targetSpace.index >= 2 && targetThreat.centrality >= 0.42);
const bounceReceive =
firstTouchMode === "back" ||
principleText.includes("escape") ||
principleText.includes("bounce");
const highThreatReceive =
targetThreat.box >= 0.18 ||
targetThreat.behindLine >= 0.26 ||
targetThreat.betweenLines >= 0.34 ||
targetThreat.centralPocket >= 0.28 ||
targetThreat.halfSpace >= 0.42 ||
spaceTwoReceive ||
actionSpace.lineBreakCount >= 1 ||
targetSpace.index >= 2 ||
forwardGain >= 7;
const receiverCanHurt =
["connector", "wideForward", "striker", "secondStriker"].includes(receiverRoleKey) ||
!receiver;
if (!receiveFlow && !(openBodyReceive && highThreatReceive && receiverCanHurt)) {
return null;
}
const intent =
bounceReceive
? "bounce"
: principleText.includes("carry")
? "carry"
: targetThreat.behindLine >= 0.28 || targetThreat.box >= 0.2 || targetDepth >= 72
? "finish"
: spaceTwoReceive || targetSpace.key === "space2" || targetThreat.betweenLines >= 0.34
? "turn"
: "connect";
const nextPoint = getDefensiveReceiveContinuationNextPoint(
attackingTeamId,
target,
startPoint,
firstTouchMode,
intent,
sideSign
);
return {
actionMeta,
attackingTeamId,
attackProfile,
carrier,
receiver,
receiverRoleKey,
startPoint: cloneVector(startPoint),
target: cloneVector(target),
nextPoint,
ballPoint: cloneVector(ballPoint ?? target),
passDistance,
forwardGain,
targetThreat,
targetSpace,
actionSpace,
targetDepth,
firstTouchMode,
principleText,
receiveFlow,
openBodyReceive,
spaceTwoReceive,
bounceReceive,
highThreatReceive,
sideSign,
targetIsWide: isWideChannel(target),
intent,
};
}
function getDefensiveReceiveContinuationTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.target;
const nextPoint = context.nextPoint;
const sideSign = context.sideSign || 1;
const passLaneMidpoint = {
x: lerp(context.startPoint.x, target.x, 0.58),
y: lerp(context.startPoint.y, target.y, 0.58),
};
const nextLaneMidpoint = {
x: lerp(target.x, nextPoint.x, 0.6),
y: lerp(target.y, nextPoint.y, 0.6),
};
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const points = {
receiverPress: {
...goalSideOf(target, context.intent === "finish" ? 0.65 : 1.05),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.1 : 0.17),
},
turnLock: {
...goalSideOf(nextLaneMidpoint, context.intent === "turn" ? 2.1 : 2.8),
y: lerp(nextLaneMidpoint.y, pitch.width / 2, context.targetIsWide ? 0.48 : 0.66),
},
thirdManScreen: {
x: nextLaneMidpoint.x - sign * 1.6,
y: lerp(nextLaneMidpoint.y, pitch.width / 2, context.intent === "finish" ? 0.38 : 0.26),
},
bounceBlock: {
x: passLaneMidpoint.x - sign * 1.7,
y: lerp(passLaneMidpoint.y, pitch.width / 2, 0.4),
},
outsideLock: {
x: target.x - sign * 2.2,
y: clamp(target.y + sideSign * (context.targetIsWide ? 3.6 : 6.2), 3.5, pitch.width - 3.5),
},
depthCover: {
x: lerp(nextPoint.x, ownGoal.x, context.intent === "finish" ? 0.5 : 0.36),
y: lerp(nextPoint.y, pitch.width / 2, context.targetIsWide ? 0.38 : 0.28),
},
farSideTuck: {
x: lerp(target.x, ownGoal.x, context.intent === "finish" ? 0.42 : 0.32),
y: clamp(pitch.width / 2 - sideSign * (context.intent === "finish" ? 8.6 : 10.8), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.turnLock, 2.2);
}
function applyDefensiveReceiveContinuationTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveReceiveContinuationContext(teamId, ballPoint, profile);
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
const pressTarget = getDefensiveReceiveContinuationTarget(teamId, context, "receiverPress");
const receiverPressLabel = context.spaceTwoReceive
? "Press space-2 receiver"
: "Press receiver's next touch";
const canReusePresser =
presser &&
!isGoalkeeper(presser) &&
distance(presser.position, pressTarget) <= (context.spaceTwoReceive ? 25 : context.highThreatReceive ? 23 : 18.5);
if (canReusePresser) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push(receiverPressLabel);
} else {
const pressPlayer = pickDefensiveAutopilotPlayer(
groups,
context.targetIsWide ? ["midfield", "back", "forward"] : ["midfield", "forward", "back"],
assignedIds,
pressTarget,
context.targetIsWide ? ["WB", "LB", "RB", "W", "8"] : ["6", "8", "10", "9", "CB"]
);
if (pressPlayer) {
targets.set(pressPlayer.id, pressTarget);
assignedIds.add(pressPlayer.id);
presser = pressPlayer;
labels.push(receiverPressLabel);
}
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveReceiveContinuationTarget(teamId, context, slot);
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
if (context.bounceReceive || context.intent === "bounce") {
assign("bounceBlock", ["forward", "midfield"], ["9", "10", "8", "6", "W"], "Block bounce after receive");
assign("turnLock", ["midfield"], ["6", "8", "10"], "Lock second touch inside");
} else if (context.spaceTwoReceive) {
assign("turnLock", ["midfield", "back"], ["6", "8", "CB", "10"], "Space 2: lock the turn");
assign("thirdManScreen", ["midfield", "back"], ["6", "8", "10", "CB"], "Space 2: screen third-player lane");
} else {
assign("turnLock", ["midfield", "back"], ["6", "8", "CB", "10"], "Deny open-body turn");
assign("thirdManScreen", ["midfield", "back"], ["6", "8", "10", "CB"], "Screen third-player lane");
}
if (context.targetIsWide) {
assign("outsideLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Lock outside escape");
}
if (context.spaceTwoReceive || context.highThreatReceive || context.intent === "finish") {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover receive-and-run depth");
}
if (
context.spaceTwoReceive ||
context.actionSpace.lineBreakCount >= 1 ||
context.intent === "finish" ||
Math.abs(context.target.y - context.startPoint.y) >= 16
) {
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side protects next action");
}
if (labels.length) {
labels.unshift(context.spaceTwoReceive ? "Defend space 2 receive" : "Read receive continuation");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.nextPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveReceiveContinuationNextPoint,
    getDefensiveReceiveContinuationContext,
    getDefensiveReceiveContinuationTarget,
    applyDefensiveReceiveContinuationTargets,
  };
}
