export function createGameSimulatorAutopilotDefensiveLooseBallTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getOffensiveAutopilotProfile,
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

function getDefensiveLooseBallRecoveryTrapContext(teamId, ballPoint, profile) {
if (!ballPoint || state.restartPhase?.type) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
profileKey: state.ball.profileKey,
targetKind: state.ball.targetKind,
};
const isRecoveryAction =
actionMeta.actionType === "recovery" ||
actionMeta.profileKey === "loose-ball-recovery" ||
state.ball.actionType === "recovery" ||
state.ball.profileKey === "loose-ball-recovery";
if (!isRecoveryAction) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
const collector = getPlayerById(actionMeta.carrierPlayerId ?? state.ball.carrierPlayerId);
if (!attackingTeamId || !collector || collector.team !== attackingTeamId) {
return null;
}
const targetPoint = cloneVector(actionMeta.target ?? ballPoint);
const attackingProfile = getOffensiveAutopilotProfile(attackingTeamId, targetPoint);
const threat = getPitchThreatProfile(targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(collector) ||
1;
const closeAccess = state.players.reduce((count, player) => {
if (player.team !== teamId || isGoalkeeper(player)) {
return count;
}
return count + (distance(player.position, targetPoint) <= 15.5 ? 1 : 0);
}, 0);
const pressStyle = ["counter-press", "gegenpress", "high-press", "press-trap-wide"].includes(profile.styleKey);
const protectStyle = ["low-block", "protect-box", "park-the-bus", "catenaccio"].includes(profile.styleKey);
const recoveryDuration = state.ball.recoveryDuration ?? actionMeta.recoveryDuration ?? 1.2;
const counterPressIntent = clamp(
profile.pressingIntensity * 0.44 +
profile.tackleIntent * 0.22 +
clamp(closeAccess / 3, 0, 1) * 0.2 +
(pressStyle ? 0.18 : 0) -
(protectStyle && ballFromOwnGoal <= 32 ? 0.12 : 0),
0,
1
);
const protectIntent = clamp(
(1 - profile.pressingIntensity) * 0.26 +
clamp((38 - ballFromOwnGoal) / 26, 0, 1) * 0.34 +
(protectStyle ? 0.18 : 0) +
threat.value * 0.12,
0,
1
);
const mode =
counterPressIntent >= Math.max(0.52, protectIntent * 0.9) && closeAccess >= 1
? "counterPressRecovery"
: "delayRecovery";
return {
actionMeta,
attackingTeamId,
collector,
targetPoint,
threat,
ballFromOwnGoal,
sideSign,
closeAccess,
counterPressIntent,
protectIntent,
mode,
recoveryDuration,
attackingDirectness: attackingProfile.directness ?? 0.52,
attackingWidth: attackingProfile.widthDiscipline ?? 0.62,
};
}
function getDefensiveLooseBallRecoveryTrapTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const attackSign = getAttackDirectionSign(context.attackingTeamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const underPassPoint = {
x: ball.x - attackSign * (8.5 + context.counterPressIntent * 2.2),
y: lerp(ball.y, pitch.width / 2, 0.36),
};
const forwardOutletPoint = {
x: ball.x + attackSign * lerp(10, 17, context.attackingDirectness),
y: clamp(lerp(ball.y, pitch.width / 2 - sideSign * 8, 0.34), 7, pitch.width - 7),
};
const widthExitPoint = {
x: ball.x + attackSign * 4.8,
y: clamp(pitch.width / 2 + sideSign * lerp(22, 30, context.attackingWidth), 4, pitch.width - 4),
};
const pressDistance = context.mode === "counterPressRecovery" ? 0.75 : 1.75;
const points = {
pressCollector: {
...goalSideOf(ball, pressDistance),
y: lerp(ball.y, pitch.width / 2, context.mode === "counterPressRecovery" ? 0.1 : 0.22),
},
insideCover: {
...goalSideOf(ball, context.mode === "counterPressRecovery" ? 4.2 : 6.2),
y: lerp(ball.y, pitch.width / 2, 0.72),
},
underPassLock: {
...goalSideOf(underPassPoint, 1.15),
y: lerp(underPassPoint.y, pitch.width / 2, 0.32),
},
forwardOutletLock: {
...goalSideOf(forwardOutletPoint, context.threat.behindLine >= 0.18 ? 2.1 : 1.3),
y: lerp(forwardOutletPoint.y, pitch.width / 2, 0.18),
},
widthExitLock: {
...goalSideOf(widthExitPoint, 1.2),
y: clamp(widthExitPoint.y - sideSign * 2.4, 3.5, pitch.width - 3.5),
},
restCover: {
x: lerp(ball.x, ownGoal.x, context.ballFromOwnGoal <= 34 ? 0.5 : 0.36),
y: clamp(lerp(ball.y, pitch.width / 2, 0.72), 11, pitch.width - 11),
},
weakSideTuck: {
x: lerp(ball.x, ownGoal.x, context.ballFromOwnGoal <= 42 ? 0.44 : 0.32),
y: clamp(pitch.width / 2 - sideSign * 9.6, 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.pressCollector, 2.1);
}
function applyDefensiveLooseBallRecoveryTrapTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveLooseBallRecoveryTrapContext(teamId, ballPoint, profile);
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
const pressTarget = getDefensiveLooseBallRecoveryTrapTarget(teamId, context, "pressCollector");
const basePresserFits =
presser &&
!isGoalkeeper(presser) &&
distance(presser.position, pressTarget) <= (context.mode === "counterPressRecovery" ? 19 : 15);
if (!basePresserFits) {
presser = pickDefensiveAutopilotPlayer(
groups,
context.mode === "counterPressRecovery"
? ["forward", "midfield", "back"]
: ["midfield", "forward", "back"],
assignedIds,
pressTarget,
context.mode === "counterPressRecovery"
? ["9", "10", "W", "8", "6"]
: ["6", "8", "10", "W", "CB"]
);
}
if (presser) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push(
context.mode === "counterPressRecovery"
? "Recovery trap: press collector"
: "Recovery trap: delay collector"
);
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveLooseBallRecoveryTrapTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
if (!player) {
return null;
}
targets.set(player.id, target);
assignedIds.add(player.id);
labels.push(label);
return player;
};
assign("insideCover", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Recovery trap: close inside");
assign("underPassLock", ["midfield", "forward"], ["8", "10", "6", "9", "W"], "Recovery trap: lock safe pass");
if (context.mode === "counterPressRecovery" || context.ballFromOwnGoal <= 52) {
assign("forwardOutletLock", ["back", "midfield", "forward"], ["CB", "6", "8", "LB", "RB", "WB"], "Recovery trap: block forward outlet");
}
if (isWidePrincipleZone(context.targetPoint) || context.counterPressIntent >= 0.58) {
assign("widthExitLock", ["back", "midfield", "forward"], ["WB", "LB", "RB", "W", "8"], "Recovery trap: lock width release");
}
assign("restCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Recovery trap: rest cover");
if (context.threat.centralPocket >= 0.22 || context.ballFromOwnGoal <= 42) {
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Recovery trap: weak-side tuck");
}
if (labels.length) {
labels.unshift("Defensive loose-ball recovery trap");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveLooseBallRecoveryTrapContext,
    getDefensiveLooseBallRecoveryTrapTarget,
    applyDefensiveLooseBallRecoveryTrapTargets,
  };
}
