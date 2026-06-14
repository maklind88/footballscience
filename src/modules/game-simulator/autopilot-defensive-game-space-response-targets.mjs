export function createGameSimulatorAutopilotDefensiveGameSpaceResponseTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getAttackingGameSpaceProfile,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlayerMagnetLabel,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveGameSpaceResponseContext(defensiveTeamId, ballPoint, profile) {
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
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const startSpace = getAttackingGameSpaceProfile(startPoint, attackingTeamId);
const targetSpace = getAttackingGameSpaceProfile(targetPoint, attackingTeamId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const gameSpaceGain = targetSpace.index - startSpace.index;
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const centrality = 1 - Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const actionType = actionMeta.actionType ?? state.ball.actionType;
const lineEntry =
targetSpace.key === "space2" ||
targetThreat.betweenLines >= 0.34 ||
(targetSpace.index >= 2 && gameSpaceGain >= 1 && forwardGain >= 4.5);
const depthEntry =
targetSpace.key === "space3" ||
targetThreat.behindLine >= 0.3 ||
(targetSpace.index >= 3 && forwardGain >= 6) ||
(ballFromOwnGoal <= 28 && forwardGain >= 3.5);
const centralDanger =
centrality >= 0.48 &&
(targetThreat.centralPocket >= 0.26 || targetThreat.box >= 0.18 || ballFromOwnGoal <= 36);
if (!lineEntry && !depthEntry && !centralDanger) {
return null;
}
const mode = depthEntry
? "spaceThreeRecovery"
: lineEntry
? "spaceTwoJump"
: "centralProtection";
return {
actionMeta,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
startSpace,
targetSpace,
targetThreat,
forwardGain,
gameSpaceGain,
ballFromOwnGoal,
centrality,
sideSign,
actionType,
mode,
lineEntry,
depthEntry,
};
}
function getDefensiveGameSpaceResponseTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideX = (meters) => target.x - sign * meters;
const passLaneMidpoint = {
x: lerp(context.startPoint.x, target.x, 0.58),
y: lerp(context.startPoint.y, target.y, 0.58),
};
const isDepthEntry = context.mode === "spaceThreeRecovery";
const points = {
firstPressure: {
x: goalSideX(isDepthEntry ? 0.75 : 1.15),
y: lerp(target.y, pitch.width / 2, isDepthEntry ? 0.1 : 0.16),
},
bounceScreen: {
x: passLaneMidpoint.x - sign * 2.2,
y: lerp(passLaneMidpoint.y, pitch.width / 2, 0.34),
},
insideScreen: {
x: goalSideX(isDepthEntry ? 6.2 : 5.6),
y: lerp(target.y, pitch.width / 2, isDepthEntry ? 0.58 : 0.68),
},
depthCover: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.5 : 0.34),
y: lerp(target.y, pitch.width / 2, isDepthEntry ? 0.3 : 0.24),
},
runnerTrack: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.32 : 0.2),
y: clamp(target.y + sideSign * (isDepthEntry ? 3.4 : 4.8), 4.5, pitch.width - 4.5),
},
cutbackLock: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.42 : 0.36),
y: pitch.width / 2 + sideSign * (isDepthEntry ? 4.8 : 5.8),
},
farSideTuck: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.38 : 0.32),
y: clamp(pitch.width / 2 - sideSign * (isDepthEntry ? 9.2 : 10.6), 6.5, pitch.width - 6.5),
},
};
return clampToPitch(points[slot] ?? points.insideScreen, 2.2);
}
function applyDefensiveGameSpaceResponseTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveGameSpaceResponseContext(teamId, ballPoint, profile);
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
const firstPressurePoint = getDefensiveGameSpaceResponseTarget(teamId, context, "firstPressure");
const basePresserLabel = basePresser ? getPlayerMagnetLabel(basePresser) : null;
const canReuseBasePresser =
basePresser &&
!isGoalkeeper(basePresser) &&
(
context.mode !== "spaceThreeRecovery" ||
["CB", "LB", "RB", "WB", "6", "8"].includes(basePresserLabel) ||
distance(basePresser.position, firstPressurePoint) <= 15
);
if (canReuseBasePresser) {
targets.set(basePresser.id, firstPressurePoint);
assignedIds.add(basePresser.id);
labels.push(context.mode === "spaceThreeRecovery" ? "Recover first touch behind line" : "Press first touch in space 2");
} else {
const firstPress = pickDefensiveAutopilotPlayer(
groups,
context.mode === "spaceThreeRecovery" ? ["back", "midfield"] : ["midfield", "forward", "back"],
assignedIds,
firstPressurePoint,
context.mode === "spaceThreeRecovery" ? ["CB", "LB", "RB", "WB", "6"] : ["6", "8", "10", "9", "W"]
);
if (firstPress) {
targets.set(firstPress.id, firstPressurePoint);
assignedIds.add(firstPress.id);
presser = firstPress;
labels.push(context.mode === "spaceThreeRecovery" ? "Recover first touch behind line" : "Press first touch in space 2");
}
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveGameSpaceResponseTarget(teamId, context, slot);
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
if (context.mode === "spaceThreeRecovery") {
assign("runnerTrack", ["back"], ["CB", "LB", "RB", "WB"], "Track run behind");
assign("depthCover", ["back"], ["CB"], "Cover goal-side depth");
assign("cutbackLock", ["midfield", "back"], ["6", "8", "CB"], "Protect cutback lane");
assign("bounceScreen", ["midfield"], ["6", "8", "10"], "Prepare second ball");
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side tucks in");
} else {
assign("bounceScreen", ["forward", "midfield"], ["9", "10", "8", "W", "6"], "Block bounce pass");
assign("insideScreen", ["midfield", "back"], ["6", "8", "CB"], "Deny turn inside");
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover line behind");
if (context.targetThreat.cutbackZone >= 0.24 || context.ballFromOwnGoal <= 42) {
assign("cutbackLock", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Protect cutback lane");
}
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side tucks in");
}
if (labels.length) {
labels.unshift(`Respond to ${context.targetSpace.label}`);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveGameSpaceResponseContext,
    getDefensiveGameSpaceResponseTarget,
    applyDefensiveGameSpaceResponseTargets,
  };
}
