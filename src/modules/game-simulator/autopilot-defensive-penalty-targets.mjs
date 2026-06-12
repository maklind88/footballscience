export function createGameSimulatorAutopilotDefensivePenaltyTargets(deps = {}) {
  const {
    clampToPitch,
    cloneVector,
    getDefendingDirectionSign,
    getOtherTeamId,
    getOpponentPenaltySpot,
    getRestartActionMeta,
    getWideSideSign,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensivePenaltyContext(teamId, ballPoint) {
const actionMeta = getRestartActionMeta();
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "penalty" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const attackingTeamId = restart.teamId;
const penaltyPoint =
actionMeta.beforeSnapshot?.ball?.position ??
getOpponentPenaltySpot(attackingTeamId);
return {
actionMeta,
attackingTeamId,
penaltyPoint: cloneVector(penaltyPoint),
ownGoalX: teamId === "home" ? 0 : pitch.length,
sign: getDefendingDirectionSign(teamId),
sideSign: getWideSideSign(ballPoint) || 1,
};
}
function getDefensivePenaltyTarget(teamId, context, slot) {
const { ownGoalX, sign, sideSign } = context;
const points = {
goalkeeper: {
x: ownGoalX + sign * 0.55,
y: pitch.width / 2,
},
reboundLeft: {
x: ownGoalX + sign * 18.1,
y: pitch.width / 2 - 8.3,
},
reboundRight: {
x: ownGoalX + sign * 18.1,
y: pitch.width / 2 + 8.3,
},
arcScreen: {
x: ownGoalX + sign * 20.4,
y: pitch.width / 2,
},
farClearance: {
x: ownGoalX + sign * 24.6,
y: pitch.width / 2 - sideSign * 15.2,
},
wideClearance: {
x: ownGoalX + sign * 26.5,
y: pitch.width / 2 + sideSign * 19,
},
};
return clampToPitch(points[slot] ?? points.arcScreen, 1.5);
}
function applyDefensivePenaltySetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensivePenaltyContext(teamId, ballPoint);
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
groups.gk.forEach((goalkeeper) => {
targets.set(goalkeeper.id, getDefensivePenaltyTarget(teamId, context, "goalkeeper"));
excludedIds.add(goalkeeper.id);
labels.push("GK on penalty line");
});
[
["reboundLeft", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"]],
["reboundRight", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"]],
["arcScreen", ["midfield", "forward"], ["6", "8", "10"]],
["farClearance", ["forward", "midfield"], ["9", "W", "10"]],
["wideClearance", ["forward", "midfield"], ["W", "9", "10"]],
].forEach(([slot, lineKeys, preferLabels]) => {
const target = getDefensivePenaltyTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, target, preferLabels);
if (player) {
targets.set(player.id, target);
excludedIds.add(player.id);
}
});
labels.push("Penalty rebound line", "Clearance outlets");
return {
active: true,
presser: null,
labels: uniquePrincipleLabels(labels),
focusPoint: context.penaltyPoint,
};
}

  return {
    getDefensivePenaltyContext,
    getDefensivePenaltyTarget,
    applyDefensivePenaltySetPieceTargets,
  };
}
