export function createGameSimulatorAutopilotDefensiveEmergencyCoverTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefendingDirectionSign,
    getDefensiveRunnerThreats,
    getDefensiveRunnerTrackingTarget,
    getDepthX,
    getDistanceFromOwnGoal,
    getDribblePressureReference,
    getOffensiveAutopilotProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveEmergencyCoverContext(
defensiveTeamId,
ballPoint,
profile,
reference = getDribblePressureReference()
) {
if (state.restartPhase?.type) {
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
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (actionType !== "dribble" && actionType !== "pass") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
reference?.startPoint ??
state.ball.position;
const targetPoint =
actionMeta.target ??
reference?.targetPoint ??
ballPoint ??
state.ball.target;
if (!startPoint || !targetPoint) {
return null;
}
const actionDistance = distance(startPoint, targetPoint);
if (actionDistance < 5.5) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const actionSpace = getActionSpaceValue(
startPoint,
targetPoint,
attackingTeamId,
getOffensiveAutopilotProfile(attackingTeamId, targetPoint)
);
const targetThreat = actionSpace.targetThreat;
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isRunway =
principleText.includes("runway") ||
principleText.includes("open-grass") ||
(
actionType === "dribble" &&
actionDistance >= 12 &&
forwardGain >= 6 &&
actionSpace.openTarget >= 0.52
);
const isLineBreak =
actionSpace.lineBreakCount >= 1 ||
targetThreat.behindLine >= 0.22 ||
(actionType === "pass" && forwardGain >= 10);
const isFinalThirdThreat =
ballFromOwnGoal <= 42 ||
targetDepth >= 63 ||
targetThreat.box >= 0.16 ||
targetThreat.cutbackZone >= 0.22;
const isCentralThreat =
targetThreat.centralPocket >= 0.24 ||
targetThreat.betweenLines >= 0.32 ||
Math.abs(targetPoint.y - pitch.width / 2) <= 13.5;
const isWideThreat =
isWidePrincipleZone(targetPoint) ||
isWidePrincipleZone(startPoint) ||
targetThreat.assistZone >= 0.3 ||
targetThreat.cutbackZone >= 0.2;
const runnerThreat = getDefensiveRunnerThreats(defensiveTeamId, targetPoint, profile)[0] ?? null;
const dangerScore = clamp(
targetThreat.box * 0.54 +
targetThreat.behindLine * 0.46 +
targetThreat.centralPocket * 0.36 +
targetThreat.cutbackZone * 0.34 +
targetThreat.betweenLines * 0.24 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.32 +
clamp(forwardGain / 24, 0, 1) * 0.24 +
clamp((48 - ballFromOwnGoal) / 26, 0, 1) * 0.26 +
(isRunway ? 0.28 : 0) +
(runnerThreat ? 0.12 : 0) -
actionSpace.targetPressure * 0.12,
0,
1.45
);
const active =
dangerScore >= 0.64 ||
(isRunway && isFinalThirdThreat) ||
(isLineBreak && ballFromOwnGoal <= 50) ||
(runnerThreat?.isDepthThreat && ballFromOwnGoal <= 52);
if (!active) {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
return {
actionMeta,
actionType,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
ballPoint: cloneVector(ballPoint ?? targetPoint),
actionDistance,
forwardGain,
targetDepth,
ballFromOwnGoal,
actionSpace,
targetThreat,
isRunway,
isLineBreak,
isFinalThirdThreat,
isCentralThreat,
isWideThreat,
runnerThreat,
dangerScore,
sideSign,
mode: isRunway
? "runwayEmergency"
: isLineBreak
? "lineBreakEmergency"
: "boxProtection",
};
}
function getDefensiveEmergencyCoverTarget(teamId, context, slot) {
if (slot === "runnerGoalSide" && context.runnerThreat) {
return getDefensiveRunnerTrackingTarget(teamId, context.runnerThreat, "goalSideMark");
}
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
const pressurePoint = lanePoint(context.actionType === "dribble" ? 0.6 : 0.72);
const lastLineDepth = clamp(
context.ballFromOwnGoal - (context.isFinalThirdThreat ? 4.8 : 7.2),
7.5,
context.isFinalThirdThreat ? 27 : 36
);
const screenDepth = clamp(
context.ballFromOwnGoal + (context.isFinalThirdThreat ? 5.6 : 3.2),
15,
44
);
const cutbackDepth = clamp(
context.ballFromOwnGoal + 2.5,
12,
32
);
const points = {
firstDelay: {
...goalSideOf(pressurePoint, context.isRunway ? 1.65 : 1.3),
y: lerp(pressurePoint.y, pitch.width / 2, context.isWideThreat ? 0.22 : 0.36),
},
lastLineCover: {
x: getDepthX(teamId, lastLineDepth),
y: lerp(target.y, pitch.width / 2, context.isWideThreat ? 0.44 : 0.3),
},
centralScreen: {
x: getDepthX(teamId, screenDepth),
y: lerp(target.y, pitch.width / 2, context.isWideThreat ? 0.76 : 0.86),
},
cutbackCover: {
x: getDepthX(teamId, cutbackDepth),
y: clamp(pitch.width / 2 + sideSign * 5.4, 11, pitch.width - 11),
},
farPostCover: {
x: getDepthX(teamId, clamp(lastLineDepth + 1.6, 7.5, 24)),
y: clamp(pitch.width / 2 - sideSign * 9.4, 7.5, pitch.width - 7.5),
},
weakSideCollapse: {
x: lerp(target.x, ownGoal.x, context.isFinalThirdThreat ? 0.44 : 0.34),
y: clamp(pitch.width / 2 - sideSign * (context.isFinalThirdThreat ? 7.4 : 10.6), 7, pitch.width - 7),
},
recoveryArc: {
x: getDepthX(teamId, clamp(context.ballFromOwnGoal + 9, 20, 48)),
y: lerp(target.y, pitch.width / 2, 0.58),
},
};
return clampToPitch(points[slot] ?? points.lastLineCover, 2.2);
}
function applyDefensiveEmergencyCoverTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveEmergencyCoverContext(teamId, ballPoint, profile, reference);
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
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveEmergencyCoverTarget(teamId, context, slot);
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
const firstDelayTarget = getDefensiveEmergencyCoverTarget(teamId, context, "firstDelay");
const presserCanDelay =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, firstDelayTarget) <= (context.isRunway ? 23 : 18);
if (presserCanDelay) {
targets.set(presser.id, firstDelayTarget);
assignedIds.add(presser.id);
labels.push(context.isRunway ? "Emergency: slow the runway" : "Emergency: delay the line break");
} else if (!presser || !assignedIds.has(presser.id)) {
const delayPlayer = assign(
"firstDelay",
context.isFinalThirdThreat ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.isWideThreat ? ["WB", "LB", "RB", "W", "8", "6"] : ["6", "8", "CB", "10", "9"],
context.isRunway ? "Emergency: slow the runway" : "Emergency: delay the line break"
);
presser = delayPlayer ?? presser;
}
assign("lastLineCover", ["back"], ["CB", "LB", "RB", "WB"], "Emergency: protect last line");
if (context.isCentralThreat || context.isLineBreak || context.isRunway) {
assign("centralScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Emergency: screen central finish");
}
if (context.runnerThreat) {
assign(
"runnerGoalSide",
context.runnerThreat.isDepthThreat || context.runnerThreat.isBoxThreat ? ["back", "midfield"] : ["midfield", "back"],
context.runnerThreat.isDepthThreat ? ["CB", "LB", "RB", "WB", "6"] : ["6", "8", "CB", "10"],
"Emergency: stay goal-side of runner"
);
}
if (context.isWideThreat || context.targetThreat.cutbackZone >= 0.2) {
assign("cutbackCover", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Emergency: lock cutback");
}
if (context.isFinalThirdThreat) {
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Emergency: cover far post");
} else {
assign("recoveryArc", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Emergency: recover behind ball");
}
assign("weakSideCollapse", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Emergency: weak side collapses");
if (labels.length) {
labels.unshift(
context.mode === "runwayEmergency"
? "Emergency cover against runway"
: context.mode === "lineBreakEmergency"
? "Emergency cover against line break"
: "Emergency box cover"
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
    getDefensiveEmergencyCoverContext,
    getDefensiveEmergencyCoverTarget,
    applyDefensiveEmergencyCoverTargets,
  };
}
