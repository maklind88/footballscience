export function createGameSimulatorAutopilotOffballBoxOccupationChainTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOpponentPenaltySpot,
    getPitchThreatProfile,
    getWideSideSign,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

function getAttackingBoxOccupationChainContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType === "shot" || actionType === "recovery") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta?.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const sourcePoint = actionType === "dribble" ? targetPoint : startPoint;
const sourceThreat = getPitchThreatProfile(sourcePoint, teamId);
const targetThreat = getPitchThreatProfile(targetPoint, teamId);
const sourceDepth = getAttackingDepth(sourcePoint, teamId);
const targetDepth = getAttackingDepth(targetPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const actionDistance = distance(startPoint, targetPoint);
const sideSign =
getWideSideSign(sourcePoint) ||
getWideSideSign(targetPoint) ||
1;
const principleText = [
actionMeta?.profileKey,
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.autoReason,
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const sourceIsWide =
isWidePrincipleZone(sourcePoint) ||
sourceThreat.assistZone >= 0.24 ||
Math.abs(sourcePoint.y - pitch.width / 2) >= 17;
const finalThirdCue =
sourceDepth >= 66 ||
targetDepth >= 68 ||
targetThreat.box >= 0.12 ||
targetThreat.cutbackZone >= 0.14 ||
targetThreat.assistZone >= 0.28 ||
actionSpace.targetThreat.behindLine >= 0.18;
const deliveryCue =
principleText.includes("cross") ||
principleText.includes("delivery") ||
principleText.includes("cutback") ||
principleText.includes("box") ||
principleText.includes("final-third") ||
principleText.includes("end product") ||
principleText.includes("wide") ||
(actionType === "pass" && (targetThreat.box >= 0.12 || targetThreat.cutbackZone >= 0.16)) ||
(actionType === "dribble" && sourceIsWide && sourceDepth >= 66);
const active =
finalThirdCue &&
(
deliveryCue ||
sourceIsWide ||
profile.crossBias >= 0.56 ||
profile.overlapBias >= 0.58 ||
(forwardGain >= 6 && targetThreat.behindLine >= 0.2)
);
if (!active) {
return null;
}
const deliveryKind =
principleText.includes("cutback") || targetThreat.cutbackZone >= 0.2 || (sourceIsWide && forwardGain <= 1.5 && targetDepth >= 72)
? "cutback"
: principleText.includes("cross") || principleText.includes("delivery") || sourceIsWide
? "cross"
: "finalPass";
return {
actionType,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
sourcePoint: cloneVector(sourcePoint),
sourceThreat,
targetThreat,
sourceDepth,
targetDepth,
actionSpace,
forwardGain,
actionDistance,
sideSign,
sourceIsWide,
deliveryKind,
};
}
function getAttackingBoxOccupationChainTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const sideSign = context.sideSign || 1;
const target = context.targetPoint;
const cutbackBias = context.deliveryKind === "cutback" ? 1 : 0;
const crossBias = context.deliveryKind === "cross" ? 1 : 0;
const points = {
nearPostPin: {
x: penaltySpot.x + sign * (4.8 + crossBias * 0.5),
y: clamp(pitch.width / 2 + sideSign * (5.4 + crossBias * 1.2), 8, pitch.width - 8),
},
penaltySpotArrive: {
x: penaltySpot.x - sign * (0.4 + cutbackBias * 1.2),
y: clamp(pitch.width / 2 - sideSign * 0.5, 10, pitch.width - 10),
},
farPostHold: {
x: penaltySpot.x + sign * (4.1 + crossBias * 0.4),
y: clamp(pitch.width / 2 - sideSign * (10.4 + crossBias * 1), 7, pitch.width - 7),
},
cutbackEdge: {
x: penaltySpot.x - sign * (7.4 + cutbackBias * 1.7),
y: clamp(pitch.width / 2 - sideSign * 5.2, 12, pitch.width - 12),
},
secondWave: {
x: penaltySpot.x - sign * 11.2,
y: clamp(pitch.width / 2 + sideSign * 4.6, 12, pitch.width - 12),
},
weakSideWidth: getDepthPoint(teamId, clamp(Math.max(context.targetDepth, 76), 70, 92), {
y: clamp(pitch.width / 2 - sideSign * 26, 3.8, pitch.width - 3.8),
}),
recycleSupport: clampToPitch({
x: target.x - sign * 11.5,
y: clamp(lerp(target.y, pitch.width / 2 + sideSign * 8.5, 0.52), 9, pitch.width - 9),
}, 3),
restLock: clampToPitch({
x: target.x - sign * (21 + (context.sourceIsWide ? 2.2 : 0)),
y: clamp(lerp(target.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
};
return clampToPitch(points[slot] ?? points.penaltySpotArrive, 2);
}
function applyAttackingBoxOccupationChainTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
const context = getAttackingBoxOccupationChainContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const protectedBoxIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getAttackingBoxOccupationChainTarget(teamId, context, slot);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedBoxIds.add(player.id);
labels.push(label);
return player;
};
assign("nearPostPin", ["striker", "secondStriker", "wideForward"], "Box chain: near-post pin");
if (context.deliveryKind === "cutback") {
assign("penaltySpotArrive", ["connector", "striker", "secondStriker"], "Box chain: cutback target");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Box chain: cutback edge");
assign("farPostHold", ["wideForward", "striker", "secondStriker"], "Box chain: far-post hold", -context.sideSign);
} else {
assign("penaltySpotArrive", ["striker", "secondStriker", "connector"], "Box chain: penalty-spot arrival");
assign("farPostHold", ["wideForward", "striker", "secondStriker"], "Box chain: far-post hold", -context.sideSign);
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Box chain: cutback edge");
}
if (context.sourceIsWide || profile.switchBias >= 0.56) {
assign("weakSideWidth", ["wideForward", "wideBack"], "Box chain: weak-side width", -context.sideSign);
}
assign("secondWave", ["connector", "pivot", "wideForward"], "Box chain: second wave");
assign("recycleSupport", ["wideBack", "connector", "pivot"], "Box chain: recycle support", context.sideSign);
assign("restLock", ["pivot", "rest", "wideBack"], "Box chain: rest-defence lock");
if (labels.length) {
labels.unshift(
context.deliveryKind === "cutback"
? "Prepare cutback occupation"
: context.deliveryKind === "cross"
? "Prepare box occupation"
: "Prepare final-pass occupation"
);
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedBoxIds,
};
}

  return {
    getAttackingBoxOccupationChainContext,
    getAttackingBoxOccupationChainTarget,
    applyAttackingBoxOccupationChainTargets,
  };
}
