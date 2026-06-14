export function createGameSimulatorAutopilotDefensiveChanceDenialTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAutoPilotShotTarget,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getDribblePressureReference,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getShotWindowProfile,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveChanceDenialContext(defensiveTeamId, ballPoint, profile, reference = getDribblePressureReference()) {
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
targetKind: state.ball.targetKind,
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
if (!["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
reference?.startPoint ??
state.ball.position ??
ballPoint;
const targetPoint =
actionMeta.target ??
reference?.targetPoint ??
state.ball.target ??
ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const threatPoint = actionType === "shot" ? startPoint : targetPoint;
const carrier = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const targetThreat = getPitchThreatProfile(threatPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, threatPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, threatPoint);
const goalDistance = distance(threatPoint, getOpponentGoalCenter(attackingTeamId));
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const shotTarget = actionType === "shot"
? targetPoint
: getAutoPilotShotTarget(attackingTeamId, carrier ?? receiver);
const shotWindow = carrier
? getShotWindowProfile(carrier, startPoint, shotTarget)
: null;
const pressure = carrier
? getPlayerPressureLoad(carrier, startPoint)
: getOpponentPressureAtPoint(defensiveTeamId, threatPoint, 8);
const sideSign =
getWideSideSign(threatPoint) ||
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const isShotCue =
actionType === "shot" ||
principleText.includes("shoot") ||
principleText.includes("finish") ||
principleText.includes("sweet spot") ||
(targetThreat.box >= 0.2 && goalDistance <= 31);
const isCutbackCue =
principleText.includes("cutback") ||
targetThreat.cutbackZone >= 0.24 ||
(actionType === "pass" && targetThreat.assistZone >= 0.34);
const isFinalPassCue =
actionType === "pass" &&
(
isCutbackCue ||
targetThreat.box >= 0.18 ||
targetThreat.centralPocket >= 0.32 ||
actionSpace.lineBreakCount >= 1
);
const isCarryChance =
actionType === "dribble" &&
(
targetThreat.box >= 0.14 ||
targetThreat.centralPocket >= 0.28 ||
principleText.includes("runway") ||
principleText.includes("open-grass")
);
const dangerScore = clamp(
targetThreat.box * 0.46 +
targetThreat.centralPocket * 0.34 +
targetThreat.cutbackZone * 0.32 +
targetThreat.assistZone * 0.2 +
targetThreat.behindLine * 0.18 +
clamp((36 - goalDistance) / 24, 0, 1) * 0.28 +
clamp((35 - ballFromOwnGoal) / 22, 0, 1) * 0.24 +
(isShotCue ? 0.28 : 0) +
(isFinalPassCue ? 0.18 : 0) +
(isCarryChance ? 0.16 : 0) +
(shotWindow?.quality ?? 0) * 0.22 -
pressure * 0.12,
0,
1.45
);
const active =
dangerScore >= 0.62 ||
isShotCue ||
isCutbackCue ||
(isFinalPassCue && ballFromOwnGoal <= 39);
if (!active) {
return null;
}
return {
actionMeta,
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
threatPoint: cloneVector(threatPoint),
shotTarget: cloneVector(shotTarget),
targetThreat,
actionSpace,
ballFromOwnGoal,
goalDistance,
forwardGain,
pressure,
shotWindow,
sideSign,
isShotCue,
isCutbackCue,
isFinalPassCue,
isCarryChance,
dangerScore,
phaseKey: profile.phaseKey,
};
}
function getDefensiveChanceDenialTarget(teamId, context, slot) {
const defendingSign = getDefendingDirectionSign(teamId);
const attackSign = getAttackDirectionSign(context.attackingTeamId);
const penaltySpot = getOpponentPenaltySpot(context.attackingTeamId);
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - defendingSign * meters,
y: point.y,
});
const shotLinePoint = (ratio) => ({
x: lerp(context.threatPoint.x, context.shotTarget.x, ratio),
y: lerp(context.threatPoint.y, context.shotTarget.y, ratio),
});
const points = {
closeShot: {
...goalSideOf(context.threatPoint, context.isShotCue ? 1.25 : 1.75),
y: lerp(context.threatPoint.y, pitch.width / 2, context.isCutbackCue ? 0.22 : 0.1),
},
shotBlock: {
...goalSideOf(shotLinePoint(context.goalDistance <= 23 ? 0.34 : 0.26), 0.85),
y: lerp(shotLinePoint(0.32).y, pitch.width / 2, 0.08),
},
penaltySpotGuard: {
x: penaltySpot.x - attackSign * 0.7,
y: pitch.width / 2,
},
cutbackScreen: {
x: penaltySpot.x - attackSign * 7.4,
y: clamp(pitch.width / 2 + sideSign * 5.7, 10, pitch.width - 10),
},
farPostCover: {
x: penaltySpot.x + attackSign * 3.5,
y: clamp(pitch.width / 2 - sideSign * 9.6, 7, pitch.width - 7),
},
reboundEdge: {
x: penaltySpot.x - attackSign * 10.4,
y: clamp(pitch.width / 2 - sideSign * 3.8, 12, pitch.width - 12),
},
};
return clampToPitch(points[slot] ?? points.shotBlock, 2.1);
}
function applyDefensiveChanceDenialTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveChanceDenialContext(teamId, ballPoint, profile, reference);
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
const target = getDefensiveChanceDenialTarget(teamId, context, slot);
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
const closeTarget = getDefensiveChanceDenialTarget(teamId, context, "closeShot");
const presserCanClose =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, closeTarget) <= (context.isShotCue ? 18 : 16);
if (presserCanClose) {
targets.set(presser.id, closeTarget);
assignedIds.add(presser.id);
labels.push(context.isShotCue ? "Chance denial: close shooter" : "Chance denial: close carrier");
} else {
const closePlayer = assign(
"closeShot",
context.ballFromOwnGoal <= 24 ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.isCutbackCue ? ["6", "8", "LB", "RB", "WB", "CB"] : ["CB", "6", "8", "LB", "RB", "WB"],
context.isShotCue ? "Chance denial: close shooter" : "Chance denial: close carrier"
);
presser = closePlayer ?? presser;
}
if (context.isShotCue || context.isCarryChance) {
assign("shotBlock", ["back", "midfield"], ["CB", "6", "8", "LB", "RB", "WB"], "Chance denial: block shot lane");
}
assign("penaltySpotGuard", ["back", "midfield"], ["CB", "6", "8", "LB", "RB", "WB"], "Chance denial: protect penalty spot");
if (context.isCutbackCue || context.isFinalPassCue || context.targetThreat.cutbackZone >= 0.18) {
assign("cutbackScreen", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Chance denial: lock cutback");
}
if (context.ballFromOwnGoal <= 27 || context.targetThreat.box >= 0.16) {
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Chance denial: cover far post");
}
if (context.isShotCue || context.dangerScore >= 0.78) {
assign("reboundEdge", ["midfield", "forward"], ["6", "8", "10", "W"], "Chance denial: secure rebound edge");
}
if (labels.length) {
labels.unshift("Defend the chance first");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.threatPoint,
protectedIds: assignedIds,
};
}
  return {
    getDefensiveChanceDenialContext,
    getDefensiveChanceDenialTarget,
    applyDefensiveChanceDenialTargets,
  };
}
