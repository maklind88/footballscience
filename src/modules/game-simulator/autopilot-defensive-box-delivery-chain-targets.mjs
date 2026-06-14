export function createGameSimulatorAutopilotDefensiveBoxDeliveryChainTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getDribblePressureReference,
    getOpponentPenaltySpot,
    getOtherTeamId,
    getPitchThreatProfile,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveBoxDeliveryChainContext(defensiveTeamId, ballPoint, profile, reference = getDribblePressureReference()) {
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
offensiveAutopilot: null,
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (actionType !== "pass" && actionType !== "dribble") {
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
const deliveryPoint = actionType === "pass" ? startPoint : targetPoint;
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const deliveryThreat = getPitchThreatProfile(deliveryPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const deliveryDepth = getAttackingDepth(deliveryPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const deliveryFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, deliveryPoint);
const actionDistance = distance(startPoint, targetPoint);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const lateralMeters = Math.abs(targetPoint.y - startPoint.y);
const sideSign =
getWideSideSign(deliveryPoint) ||
getWideSideSign(targetPoint) ||
1;
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.label,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const deliveryIsWide =
isWidePrincipleZone(deliveryPoint) ||
deliveryThreat.assistZone >= 0.24 ||
Math.abs(deliveryPoint.y - pitch.width / 2) >= 17;
const targetIsBox =
targetThreat.box >= 0.12 ||
targetThreat.cutbackZone >= 0.14 ||
targetThreat.centralPocket >= 0.3 ||
(targetDepth >= 78 && Math.abs(targetPoint.y - pitch.width / 2) <= 24);
const cutbackCue =
principleText.includes("cutback") ||
targetThreat.cutbackZone >= 0.18 ||
(
actionType === "pass" &&
deliveryIsWide &&
forwardGain <= 1.5 &&
targetDepth >= 72 &&
Math.abs(targetPoint.y - pitch.width / 2) <= 24
);
const crossCue =
principleText.includes("cross") ||
principleText.includes("delivery") ||
principleText.includes("box") ||
(
actionType === "pass" &&
deliveryIsWide &&
targetIsBox &&
lateralMeters >= 8
);
const wideCarryCue =
actionType === "dribble" &&
deliveryIsWide &&
deliveryFromOwnGoal <= 36 &&
(deliveryThreat.assistZone >= 0.24 || deliveryDepth >= 72);
const active =
(actionType === "pass" && deliveryIsWide && targetIsBox && deliveryFromOwnGoal <= 48) ||
cutbackCue ||
crossCue ||
wideCarryCue;
if (!active) {
return null;
}
const deliveryKind = cutbackCue
? "cutback"
: crossCue
? "cross"
: "wideThreat";
const dangerScore = clamp(
targetThreat.box * 0.38 +
targetThreat.cutbackZone * 0.34 +
targetThreat.centralPocket * 0.24 +
targetThreat.assistZone * 0.18 +
deliveryThreat.assistZone * 0.18 +
clamp((42 - ballFromOwnGoal) / 25, 0, 1) * 0.22 +
clamp(actionDistance / 24, 0, 1) * 0.1 +
(cutbackCue ? 0.22 : 0) +
(crossCue ? 0.16 : 0) +
(wideCarryCue ? 0.18 : 0),
0,
1.35
);
return {
actionMeta,
actionType,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
deliveryPoint: cloneVector(deliveryPoint),
targetThreat,
deliveryThreat,
actionSpace,
targetDepth,
deliveryDepth,
ballFromOwnGoal,
deliveryFromOwnGoal,
actionDistance,
forwardGain,
sideSign,
deliveryKind,
dangerScore,
wideCarryCue,
phaseKey: profile.phaseKey,
};
}
function getDefensiveBoxDeliveryChainTarget(teamId, context, slot) {
const defendingSign = getDefendingDirectionSign(teamId);
const attackSign = getAttackDirectionSign(context.attackingTeamId);
const penaltySpot = getOpponentPenaltySpot(context.attackingTeamId);
const delivery = context.deliveryPoint;
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const lanePoint = (ratio) => ({
x: lerp(delivery.x, target.x, ratio),
y: lerp(delivery.y, target.y, ratio),
});
const goalSideOf = (point, meters) => ({
x: point.x - defendingSign * meters,
y: point.y,
});
const cutbackPull = context.deliveryKind === "cutback" ? 1.4 : 0;
const points = {
deliveryPressure: {
x: delivery.x - defendingSign * 1.4,
y: clamp(delivery.y - sideSign * 1.7, 3.2, pitch.width - 3.2),
},
lowLaneBlock: {
...goalSideOf(lanePoint(context.deliveryKind === "cutback" ? 0.52 : 0.42), 0.9),
y: lerp(lanePoint(0.5).y, pitch.width / 2, context.deliveryKind === "cross" ? 0.22 : 0.1),
},
nearPostCover: {
x: penaltySpot.x + attackSign * 3.9,
y: clamp(pitch.width / 2 + sideSign * 4.4, 6.5, pitch.width - 6.5),
},
sixYardCover: {
x: penaltySpot.x + attackSign * 5.2,
y: clamp(pitch.width / 2 + sideSign * 1.6, 9, pitch.width - 9),
},
penaltySpotGuard: {
x: penaltySpot.x - attackSign * 0.7,
y: pitch.width / 2,
},
cutbackGate: {
x: penaltySpot.x - attackSign * (7.4 + cutbackPull),
y: clamp(pitch.width / 2 + sideSign * 5.4, 9.5, pitch.width - 9.5),
},
farPostCover: {
x: penaltySpot.x + attackSign * 2.9,
y: clamp(pitch.width / 2 - sideSign * 9.4, 6.5, pitch.width - 6.5),
},
edgeLock: {
x: penaltySpot.x - attackSign * 11.2,
y: clamp(pitch.width / 2 - sideSign * 3.8, 11, pitch.width - 11),
},
weakSideTuck: {
x: penaltySpot.x - attackSign * 2.8,
y: clamp(pitch.width / 2 - sideSign * 13.2, 6.5, pitch.width - 6.5),
},
};
return clampToPitch(points[slot] ?? points.penaltySpotGuard, 1.8);
}
function applyDefensiveBoxDeliveryChainTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveBoxDeliveryChainContext(teamId, ballPoint, profile, reference);
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
const target = getDefensiveBoxDeliveryChainTarget(teamId, context, slot);
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
if (context.wideCarryCue) {
const pressTarget = getDefensiveBoxDeliveryChainTarget(teamId, context, "deliveryPressure");
if (presser && !assignedIds.has(presser.id) && !isGoalkeeper(presser)) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push("Box delivery chain: press wide carrier");
} else {
const widePresser = assign(
"deliveryPressure",
["back", "midfield", "forward"],
["WB", "LB", "RB", "W", "8"],
"Box delivery chain: press wide carrier"
);
presser = widePresser ?? presser;
}
} else {
assign("lowLaneBlock", ["back", "midfield"], ["LB", "RB", "WB", "CB", "6"], "Box delivery chain: block delivery lane");
}
if (context.deliveryKind === "cross") {
assign("nearPostCover", ["back"], ["CB", "LB", "RB", "WB"], "Box delivery chain: near-post cover");
assign("sixYardCover", ["back"], ["CB"], "Box delivery chain: six-yard protection");
assign("penaltySpotGuard", ["back", "midfield"], ["CB", "6", "8"], "Box delivery chain: penalty-spot guard");
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Box delivery chain: far-post cover");
} else {
assign("cutbackGate", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Box delivery chain: lock cutback gate");
assign("penaltySpotGuard", ["back", "midfield"], ["CB", "6", "8"], "Box delivery chain: penalty-spot guard");
assign("nearPostCover", ["back"], ["CB", "LB", "RB", "WB"], "Box delivery chain: near-post cover");
if (context.ballFromOwnGoal <= 28 || context.targetThreat.box >= 0.18) {
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Box delivery chain: far-post cover");
}
}
if (context.dangerScore >= 0.72 || context.deliveryKind === "cutback") {
assign("edgeLock", ["midfield", "forward"], ["6", "8", "10", "W"], "Box delivery chain: second-wave edge");
}
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Box delivery chain: weak side tucks in");
if (labels.length) {
labels.unshift(
context.deliveryKind === "cutback"
? "Defend cutback chain"
: context.deliveryKind === "cross"
? "Defend box delivery chain"
: "Prepare box delivery chain"
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
    getDefensiveBoxDeliveryChainContext,
    getDefensiveBoxDeliveryChainTarget,
    applyDefensiveBoxDeliveryChainTargets,
  };
}
