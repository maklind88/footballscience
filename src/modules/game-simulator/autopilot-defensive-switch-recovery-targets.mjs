export function createGameSimulatorAutopilotDefensiveSwitchRecoveryTargets(deps = {}) {
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
    getPitchLaneIndex,
    getPitchLaneKey,
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

function getDefensiveSwitchRecoveryContext(defensiveTeamId, ballPoint, profile) {
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
profileLabel: state.ball.profileLabel,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
if ((actionMeta.actionType ?? state.ball.actionType) !== "pass") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position;
const targetPoint = actionMeta.target ?? ballPoint ?? state.ball.target;
if (!startPoint || !targetPoint) {
return null;
}
const startLane = getPitchLaneKey(startPoint);
const targetLane = getPitchLaneKey(targetPoint);
const laneShift =
startLane && targetLane
? Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(startLane))
: 0;
const passDistance = distance(startPoint, targetPoint);
const lateralMeters = Math.abs(targetPoint.y - startPoint.y);
const startSide = getWideSideSign(startPoint);
const targetSide =
getWideSideSign(targetPoint) ||
Math.sign(targetPoint.y - pitch.width / 2) ||
1;
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.label,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const oppositeSideSwitch = startSide && targetSide && startSide !== targetSide;
const switchCue =
principleText.includes("switch") ||
principleText.includes("change corridor") ||
principleText.includes("weak-side") ||
principleText.includes("spelvänd") ||
(
passDistance >= 20 &&
lateralMeters >= 17 &&
(laneShift >= 2 || oppositeSideSwitch)
);
if (!switchCue) {
return null;
}
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const actionSpeed = Math.max(actionMeta.speed ?? state.ball.speed ?? state.ball.currentSpeed ?? 13, 0.1);
const eta = passDistance / actionSpeed;
const finalThirdSwitch =
ballFromOwnGoal <= 42 ||
targetThreat.assistZone >= 0.32 ||
targetThreat.box >= 0.12 ||
targetThreat.cutbackZone >= 0.18;
const centralDanger =
targetThreat.centralPocket >= 0.22 ||
targetThreat.betweenLines >= 0.28 ||
actionSpace.lineBreakCount >= 1 ||
forwardGain >= 7;
return {
actionMeta,
attackingTeamId,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
startLane,
targetLane,
laneShift,
passDistance,
lateralMeters,
startSide: startSide || -targetSide,
targetSide,
targetThreat,
actionSpace,
ballFromOwnGoal,
forwardGain,
eta,
finalThirdSwitch,
centralDanger,
targetIsWide: isWidePrincipleZone(targetPoint),
phaseKey: profile.phaseKey,
};
}
function getDefensiveSwitchRecoveryTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const targetSide = context.targetSide || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const pressureDistance =
context.phaseKey === "highPress"
? 1.2
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 2.3
: 1.8;
const lineCoverRatio =
context.finalThirdSwitch
? 0.42
: context.centralDanger
? 0.34
: 0.28;
const points = {
firstPressure: {
...goalSideOf(target, pressureDistance),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.08 : 0.18),
},
wideLock: {
x: target.x - sign * 3.1,
y: clamp(target.y + targetSide * 4.8, 3.4, pitch.width - 3.4),
},
centralGate: {
x: target.x - sign * (context.centralDanger ? 7.8 : 6.2),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.72 : 0.84),
},
midfieldSlide: {
x: target.x - sign * (context.finalThirdSwitch ? 8.4 : 10.2),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.48 : 0.62),
},
backLineShift: {
x: lerp(target.x, ownGoal.x, lineCoverRatio),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.34 : 0.24),
},
depthCover: {
x: lerp(target.x, ownGoal.x, context.finalThirdSwitch ? 0.5 : 0.4),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.46 : 0.32),
},
oldSideRecover: {
x: lerp(target.x, ownGoal.x, context.finalThirdSwitch ? 0.38 : 0.3),
y: clamp(pitch.width / 2 - targetSide * (context.finalThirdSwitch ? 8.2 : 11.5), 7, pitch.width - 7),
},
boxBalance: {
x: lerp(target.x, ownGoal.x, 0.46),
y: clamp(pitch.width / 2 - targetSide * 4.8, 10, pitch.width - 10),
},
};
return clampToPitch(points[slot] ?? points.centralGate, 2.2);
}
function applyDefensiveSwitchRecoveryTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveSwitchRecoveryContext(teamId, ballPoint, profile);
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
const target = getDefensiveSwitchRecoveryTarget(teamId, context, slot);
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
const pressTarget = getDefensiveSwitchRecoveryTarget(teamId, context, "firstPressure");
const presserCanRecover =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, pressTarget) <= (context.eta <= 1.6 ? 18 : 23);
if (presserCanRecover) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push("Switch recovery: arrive to new ball side");
} else {
const newPresser = assign(
"firstPressure",
context.targetIsWide ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.targetIsWide ? ["WB", "LB", "RB", "W", "8"] : ["6", "8", "10", "CB"],
"Switch recovery: arrive to new ball side"
);
presser = newPresser ?? presser;
}
if (context.targetIsWide) {
assign("wideLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Switch recovery: lock outside");
}
assign("centralGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Switch recovery: close central gate");
assign("midfieldSlide", ["midfield", "forward"], ["6", "8", "10", "W"], "Switch recovery: midfield slides across");
assign("backLineShift", ["back"], ["CB", "LB", "RB", "WB"], "Switch recovery: back line shifts");
if (context.centralDanger || context.forwardGain >= 6 || context.actionSpace.lineBreakCount >= 1) {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Switch recovery: protect depth");
}
assign("oldSideRecover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Switch recovery: old ball side narrows");
if (context.finalThirdSwitch) {
assign("boxBalance", ["back", "midfield"], ["CB", "6", "8", "LB", "RB", "WB"], "Switch recovery: box balance");
}
if (labels.length) {
labels.unshift("Recover after switch");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveSwitchRecoveryContext,
    getDefensiveSwitchRecoveryTarget,
    applyDefensiveSwitchRecoveryTargets,
  };
}
