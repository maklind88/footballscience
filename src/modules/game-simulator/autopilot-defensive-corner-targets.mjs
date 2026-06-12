export function createGameSimulatorAutopilotDefensiveCornerTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneRestartPhase,
    cloneVector,
    distance,
    getCornerKickSpot,
    getDefendingDirectionSign,
    getOtherTeamId,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveCornerContext(teamId, ballPoint) {
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
beforeSnapshot: {
restartPhase: cloneRestartPhase(state.restartPhase),
ball: {
position: cloneVector(state.ball.position),
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "corner" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const sideY = Number.isFinite(restart.sideY)
? restart.sideY
: actionMeta.beforeSnapshot?.ball?.position?.y ?? ballPoint.y;
const attackingTeamId = restart.teamId;
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const sideSign = sideY <= pitch.width / 2 ? -1 : 1;
const cornerSpot = actionMeta.beforeSnapshot?.ball?.position ?? getCornerKickSpot(attackingTeamId, sideY);
const deliveryTarget = actionMeta.target ?? ballPoint;
return {
actionMeta,
attackingTeamId,
sideY,
sideSign,
ownGoalX,
sign,
cornerSpot: cloneVector(cornerSpot),
deliveryTarget: cloneVector(deliveryTarget),
isShortCorner: distance(cornerSpot, deliveryTarget) <= 13,
};
}
function getDefensiveCornerTarget(teamId, context, slot) {
const { ownGoalX, sign, sideSign, cornerSpot, deliveryTarget } = context;
const points = {
goalkeeper: {
x: ownGoalX + sign * 2.4,
y: clamp(lerp(pitch.width / 2, deliveryTarget.y, 0.1), pitch.width / 2 - 2.2, pitch.width / 2 + 2.2),
},
nearPost: {
x: ownGoalX + sign * 2.7,
y: pitch.width / 2 + sideSign * 3.05,
},
farPost: {
x: ownGoalX + sign * 2.9,
y: pitch.width / 2 - sideSign * 3.15,
},
sixYardCentral: {
x: ownGoalX + sign * 5.7,
y: pitch.width / 2 + sideSign * 0.9,
},
penaltySpot: {
x: ownGoalX + sign * 10.8,
y: pitch.width / 2 - sideSign * 0.6,
},
nearZone: {
x: ownGoalX + sign * 7.6,
y: pitch.width / 2 + sideSign * 6.6,
},
farZone: {
x: ownGoalX + sign * 8.9,
y: pitch.width / 2 - sideSign * 8.4,
},
edgeSecondBall: {
x: ownGoalX + sign * 18.2,
y: pitch.width / 2 - sideSign * 4.6,
},
shortCornerPress: {
x: lerp(cornerSpot.x, ownGoalX + sign * 12.5, 0.55),
y: lerp(cornerSpot.y, pitch.width / 2 + sideSign * 15, 0.44),
},
clearanceOutlet: {
x: ownGoalX + sign * 25,
y: pitch.width / 2 - sideSign * 18,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 1.8);
}
function applyDefensiveCornerSetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensiveCornerContext(teamId, ballPoint);
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
targets.set(goalkeeper.id, getDefensiveCornerTarget(teamId, context, "goalkeeper"));
excludedIds.add(goalkeeper.id);
labels.push("GK controls six-yard line");
});
const nearPost = pickDefensiveAutopilotPlayer(
groups,
["back", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "nearPost"),
["CB", "LB", "RB", "WB"]
);
if (nearPost) {
targets.set(nearPost.id, getDefensiveCornerTarget(teamId, context, "nearPost"));
excludedIds.add(nearPost.id);
labels.push("Near-post protection");
}
const farPost = pickDefensiveAutopilotPlayer(
groups,
["back", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "farPost"),
["CB", "LB", "RB", "WB"]
);
if (farPost) {
targets.set(farPost.id, getDefensiveCornerTarget(teamId, context, "farPost"));
excludedIds.add(farPost.id);
labels.push("Far-post protection");
}
const sixYard = pickDefensiveAutopilotPlayer(
groups,
["back"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "sixYardCentral"),
["CB"]
);
if (sixYard) {
targets.set(sixYard.id, getDefensiveCornerTarget(teamId, context, "sixYardCentral"));
excludedIds.add(sixYard.id);
labels.push("Six-yard zone");
}
const penaltySpot = pickDefensiveAutopilotPlayer(
groups,
["back", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "penaltySpot"),
["CB", "6", "8"]
);
if (penaltySpot) {
targets.set(penaltySpot.id, getDefensiveCornerTarget(teamId, context, "penaltySpot"));
excludedIds.add(penaltySpot.id);
labels.push("Penalty-spot duel");
}
const nearZone = pickDefensiveAutopilotPlayer(
groups,
["midfield", "back"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "nearZone"),
["6", "8", "WB", "LB", "RB"]
);
if (nearZone) {
targets.set(nearZone.id, getDefensiveCornerTarget(teamId, context, "nearZone"));
excludedIds.add(nearZone.id);
labels.push("Near-zone screen");
}
const farZone = pickDefensiveAutopilotPlayer(
groups,
["midfield", "back"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "farZone"),
["8", "10", "WB", "LB", "RB"]
);
if (farZone) {
targets.set(farZone.id, getDefensiveCornerTarget(teamId, context, "farZone"));
excludedIds.add(farZone.id);
labels.push("Far-zone screen");
}
const edge = pickDefensiveAutopilotPlayer(
groups,
["midfield", "forward"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "edgeSecondBall"),
["6", "8", "10"]
);
if (edge) {
targets.set(edge.id, getDefensiveCornerTarget(teamId, context, "edgeSecondBall"));
excludedIds.add(edge.id);
labels.push("Edge second ball");
}
if (context.isShortCorner) {
const shortPress = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "shortCornerPress"),
["W", "9", "10", "8"]
);
if (shortPress) {
targets.set(shortPress.id, getDefensiveCornerTarget(teamId, context, "shortCornerPress"));
excludedIds.add(shortPress.id);
presser = shortPress;
labels.push("Short-corner pressure");
}
}
const outlet = pickDefensiveAutopilotPlayer(
groups,
["forward"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "clearanceOutlet"),
["9", "W", "10"]
);
if (outlet) {
targets.set(outlet.id, getDefensiveCornerTarget(teamId, context, "clearanceOutlet"));
labels.push("Clearance outlet");
}
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.cornerSpot,
};
}

  return {
    getDefensiveCornerContext,
    getDefensiveCornerTarget,
    applyDefensiveCornerSetPieceTargets,
  };
}
