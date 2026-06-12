export function createGameSimulatorAutopilotDefensiveFreeKickTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackingDepth,
    getDefendingDirectionSign,
    getOtherTeamId,
    getOpponentGoalCenter,
    getOwnGoalCenter,
    getRestartActionMeta,
    getShotAngleQuality,
    getWideSideSign,
    lerp,
    moveTowards,
    normalize,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveFreeKickContext(teamId, ballPoint) {
const actionMeta = getRestartActionMeta();
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "freeKick" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const attackingTeamId = restart.teamId;
const freeKickPoint =
restart.point ??
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.position ??
ballPoint;
const opponentGoal = getOpponentGoalCenter(attackingTeamId);
const goalDistance = distance(freeKickPoint, opponentGoal);
const centrality = 1 - Math.abs(freeKickPoint.y - pitch.width / 2) / (pitch.width / 2);
const shotAngle = getShotAngleQuality(freeKickPoint, attackingTeamId);
const deliveryTarget = actionMeta.target ?? ballPoint;
const deliveryDistance = distance(freeKickPoint, deliveryTarget);
const attackingDepth = getAttackingDepth(freeKickPoint, attackingTeamId);
const directShotThreat =
goalDistance <= 31.5 &&
centrality >= 0.14 &&
shotAngle >= 0.11 &&
(actionMeta.actionType === "shot" || deliveryDistance <= 18 || getAttackingDepth(deliveryTarget, attackingTeamId) >= 82);
const wideDeliveryThreat =
Math.abs(freeKickPoint.y - pitch.width / 2) >= 13 &&
attackingDepth >= 58;
return {
actionMeta,
attackingTeamId,
freeKickPoint: cloneVector(freeKickPoint),
deliveryTarget: cloneVector(deliveryTarget),
ownGoalX: teamId === "home" ? 0 : pitch.length,
sign: getDefendingDirectionSign(teamId),
sideSign: getWideSideSign(freeKickPoint) || getWideSideSign(deliveryTarget) || 1,
goalDistance,
centrality,
shotAngle,
directShotThreat,
wideDeliveryThreat,
isShortFreeKick: deliveryDistance <= 13.5,
};
}
function getFreeKickWallTarget(teamId, context, slotIndex = 0, wallCount = 3) {
const ownGoal = getOwnGoalCenter(teamId);
const wallBaseDistance = clamp(context.goalDistance > 25 ? 9.15 : 8.35, 7.8, 9.15);
const base = moveTowards(context.freeKickPoint, ownGoal, wallBaseDistance);
const lane = normalize(context.freeKickPoint, ownGoal);
const perpendicular = { x: -lane.y, y: lane.x };
const spread = clamp((wallCount - 1) * 0.68, 0.72, 2.4);
const offset = wallCount <= 1 ? 0 : -spread / 2 + (spread * slotIndex) / (wallCount - 1);
return clampToPitch({
x: base.x + perpendicular.x * offset,
y: base.y + perpendicular.y * offset,
}, 1.6);
}
function getDefensiveFreeKickTarget(teamId, context, slot) {
const { ownGoalX, sign, sideSign, freeKickPoint, deliveryTarget } = context;
const wallLeanY = lerp(pitch.width / 2, freeKickPoint.y, 0.12);
const points = {
goalkeeper: {
x: ownGoalX + sign * 1.2,
y: clamp(lerp(pitch.width / 2, deliveryTarget.y, context.directShotThreat ? 0.1 : 0.18), pitch.width / 2 - 3.05, pitch.width / 2 + 3.05),
},
blockerEdge: {
x: ownGoalX + sign * 19.2,
y: clamp(wallLeanY - sideSign * 5.2, 7, pitch.width - 7),
},
nearZone: {
x: ownGoalX + sign * 8.7,
y: pitch.width / 2 + sideSign * 7.8,
},
farZone: {
x: ownGoalX + sign * 9.4,
y: pitch.width / 2 - sideSign * 8.8,
},
penaltySpot: {
x: ownGoalX + sign * 11.4,
y: pitch.width / 2 - sideSign * 0.8,
},
sixYardCentral: {
x: ownGoalX + sign * 5.7,
y: pitch.width / 2 + sideSign * 0.7,
},
edgeSecondBall: {
x: ownGoalX + sign * 18.5,
y: clamp(pitch.width / 2 - sideSign * 4.8, 7, pitch.width - 7),
},
shortFreeKickPress: {
x: lerp(freeKickPoint.x, deliveryTarget.x, 0.42),
y: lerp(freeKickPoint.y, deliveryTarget.y, 0.42),
},
clearanceOutlet: {
x: ownGoalX + sign * 26,
y: pitch.width / 2 - sideSign * 18,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 1.8);
}
function applyDefensiveFreeKickSetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensiveFreeKickContext(teamId, ballPoint);
if (!context) {
return {
active: false,
presser: null,
labels: [],
focusPoint: null,
};
}
const labels = [];
const excludedIds = new Set();
let presser = null;
groups.gk.forEach((goalkeeper) => {
targets.set(goalkeeper.id, getDefensiveFreeKickTarget(teamId, context, "goalkeeper"));
excludedIds.add(goalkeeper.id);
labels.push(context.directShotThreat ? "GK sets the wall" : "GK commands delivery line");
});
const wallCount = context.directShotThreat
? clamp(Math.round(2 + (31.5 - context.goalDistance) / 6 + context.centrality * 1.2), 2, 4)
: context.wideDeliveryThreat
? 1
: 2;
for (let index = 0; index < wallCount; index += 1) {
const wallTarget = getFreeKickWallTarget(teamId, context, index, wallCount);
const wallPlayer = pickDefensiveAutopilotPlayer(
groups,
["midfield", "forward", "back"],
excludedIds,
wallTarget,
["6", "8", "10", "W", "9", "CB"]
);
if (wallPlayer) {
targets.set(wallPlayer.id, wallTarget);
excludedIds.add(wallPlayer.id);
}
}
if (wallCount > 0) {
labels.push(context.directShotThreat ? "Free-kick wall" : "Short wall");
}
if (context.isShortFreeKick) {
const shortPress = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getDefensiveFreeKickTarget(teamId, context, "shortFreeKickPress"),
["9", "W", "10", "8"]
);
if (shortPress) {
targets.set(shortPress.id, getDefensiveFreeKickTarget(teamId, context, "shortFreeKickPress"));
excludedIds.add(shortPress.id);
presser = shortPress;
labels.push("Short free-kick pressure");
}
}
const deliverySlots = context.directShotThreat
? [
["blockerEdge", ["midfield"], ["6", "8", "10"]],
["penaltySpot", ["back", "midfield"], ["CB", "6", "8"]],
["edgeSecondBall", ["midfield", "forward"], ["6", "8", "10"]],
]
: [
["sixYardCentral", ["back"], ["CB"]],
["nearZone", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"]],
["farZone", ["back", "midfield"], ["CB", "LB", "RB", "WB"]],
["penaltySpot", ["back", "midfield"], ["CB", "6", "8"]],
["edgeSecondBall", ["midfield", "forward"], ["6", "8", "10"]],
];
deliverySlots.forEach(([slot, lineKeys, preferLabels]) => {
const target = getDefensiveFreeKickTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, target, preferLabels);
if (player) {
targets.set(player.id, target);
excludedIds.add(player.id);
}
});
labels.push(context.directShotThreat ? "Rebound and block line" : "Box delivery protection");
const outlet = pickDefensiveAutopilotPlayer(
groups,
["forward"],
excludedIds,
getDefensiveFreeKickTarget(teamId, context, "clearanceOutlet"),
["9", "W", "10"]
);
if (outlet) {
targets.set(outlet.id, getDefensiveFreeKickTarget(teamId, context, "clearanceOutlet"));
labels.push("Clearance outlet");
}
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.freeKickPoint,
};
}

  return {
    getDefensiveFreeKickContext,
    getFreeKickWallTarget,
    getDefensiveFreeKickTarget,
    applyDefensiveFreeKickSetPieceTargets,
  };
}
