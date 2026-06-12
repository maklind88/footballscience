export function createGameSimulatorAutopilotDefensiveThrowInTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getDefendingDirectionSign,
    getOtherTeamId,
    getRestartActionMeta,
    getWideSideSign,
    lerp,
    moveTowards,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveThrowInContext(teamId, ballPoint) {
const actionMeta = getRestartActionMeta();
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "throwIn" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const throwPoint =
restart.point ??
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.position ??
ballPoint;
const sideSign = getWideSideSign(throwPoint) || (throwPoint.y <= pitch.width / 2 ? -1 : 1);
return {
actionMeta,
attackingTeamId: restart.teamId,
throwPoint: cloneVector(throwPoint),
deliveryTarget: cloneVector(actionMeta.target ?? ballPoint),
sign: getDefendingDirectionSign(teamId),
sideSign,
ownGoalX: teamId === "home" ? 0 : pitch.length,
isShortThrow: distance(throwPoint, actionMeta.target ?? ballPoint) <= 12.5,
};
}
function getDefensiveThrowInTarget(teamId, context, slot) {
const { throwPoint, deliveryTarget, sign, sideSign, ownGoalX } = context;
const insideY = clamp(throwPoint.y - sideSign * 7.5, 4, pitch.width - 4);
const points = {
twoMeterPress: moveTowards(
{
x: throwPoint.x,
y: insideY,
},
throwPoint,
Math.max(distance({ x: throwPoint.x, y: insideY }, throwPoint) - 2.15, 0)
),
receiverPress: {
x: lerp(throwPoint.x, deliveryTarget.x, 0.58),
y: lerp(insideY, deliveryTarget.y, 0.44),
},
insideScreen: {
x: clamp(throwPoint.x - sign * 3.8, 4, pitch.length - 4),
y: clamp(insideY - sideSign * 5.4, 7, pitch.width - 7),
},
downLineCover: {
x: clamp(throwPoint.x - sign * 9.4, 4, pitch.length - 4),
y: clamp(throwPoint.y - sideSign * 2.4, 3.2, pitch.width - 3.2),
},
backLineCover: {
x: ownGoalX + sign * 24,
y: clamp(insideY - sideSign * 9.5, 8, pitch.width - 8),
},
centralScreen: {
x: ownGoalX + sign * 34,
y: lerp(pitch.width / 2, insideY, 0.35),
},
};
return clampToPitch(points[slot] ?? points.insideScreen, 1.8);
}
function applyDefensiveThrowInSetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensiveThrowInContext(teamId, ballPoint);
if (!context) {
return {
active: false,
presser: null,
labels: [],
focusPoint: null,
};
}
const labels = [];
const excludedIds = new Set(groups.gk.map((goalkeeper) => goalkeeper.id));
let presser = null;
const firstPress = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getDefensiveThrowInTarget(teamId, context, "twoMeterPress"),
["W", "9", "10", "8", "WB"]
);
if (firstPress) {
targets.set(firstPress.id, getDefensiveThrowInTarget(teamId, context, "twoMeterPress"));
excludedIds.add(firstPress.id);
presser = firstPress;
labels.push("Two-metre throw-in pressure");
}
const receiverPress = pickDefensiveAutopilotPlayer(
groups,
["midfield", "back"],
excludedIds,
getDefensiveThrowInTarget(teamId, context, "receiverPress"),
["WB", "LB", "RB", "6", "8"]
);
if (receiverPress) {
targets.set(receiverPress.id, getDefensiveThrowInTarget(teamId, context, "receiverPress"));
excludedIds.add(receiverPress.id);
labels.push("Receiver touch pressure");
}
[
["insideScreen", ["midfield"], ["6", "8", "10"]],
["downLineCover", ["back", "midfield"], ["LB", "RB", "WB", "CB"]],
["backLineCover", ["back"], ["CB", "LB", "RB", "WB"]],
["centralScreen", ["midfield", "forward"], ["6", "8", "10", "9"]],
].forEach(([slot, lineKeys, preferLabels]) => {
const target = getDefensiveThrowInTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, target, preferLabels);
if (player) {
targets.set(player.id, target);
excludedIds.add(player.id);
}
});
labels.push("Touchline trap", "Inside lane cover");
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.throwPoint,
};
}

  return {
    getDefensiveThrowInContext,
    getDefensiveThrowInTarget,
    applyDefensiveThrowInSetPieceTargets,
  };
}
