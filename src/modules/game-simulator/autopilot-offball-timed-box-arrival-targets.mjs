export function createGameSimulatorAutopilotOffballTimedBoxArrivalTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    computeTimeToCoverDistance,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getOffensiveRoleKey,
    getOpponentPenaltySpot,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerTendency,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pitch,
    resolveBallActionProfile,
    setAutopilotPrincipleTarget,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getTimedBoxArrivalContext(teamId, ballPoint, actionMeta, profile = {}) {
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
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const targetDepth = getAttackingDepth(ballPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const principleText = [
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.autoReason,
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isWideSource = isWidePrincipleZone(startPoint);
const isRunwayAction =
principleText.includes("runway") ||
principleText.includes("open-grass") ||
principleText.includes("carry end product") ||
principleText.includes("runway end product");
const isCentralCarry =
actionType === "dribble" &&
Math.abs(ballPoint.y - pitch.width / 2) <= 18 &&
targetDepth >= 56;
const isEndProductAction =
principleText.includes("end product") ||
principleText.includes("final pass") ||
principleText.includes("chance") ||
principleText.includes("shooting window");
const runwayFinishCue =
isRunwayAction &&
(
targetDepth >= 58 ||
targetThreat.behindLine >= 0.18 ||
targetThreat.centralPocket >= 0.24 ||
targetThreat.value >= 0.42
);
const isFinalAction =
targetDepth >= 70 ||
targetThreat.box >= 0.2 ||
targetThreat.cutbackZone >= 0.24 ||
runwayFinishCue ||
isEndProductAction ||
isCentralCarry ||
principleText.includes("cutback") ||
principleText.includes("cross") ||
principleText.includes("delivery") ||
principleText.includes("final-third") ||
principleText.includes("end product") ||
(actionType === "dribble" && targetDepth >= 64) ||
(actionType === "pass" && isWideSource && targetDepth >= 62);
if (!isFinalAction) {
return null;
}
const initiator = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const receiverPlayerId = actionMeta?.receiverPlayerId ?? null;
const actionDistance = distance(startPoint, ballPoint);
const resolvedProfile = resolveBallActionProfile(
actionType,
startPoint,
ballPoint,
initiator,
receiverPlayerId
);
const actionSpeed = Math.max(
actionMeta?.speed ??
state.ball.speed ??
resolvedProfile.averageSpeed ??
(actionType === "dribble" ? 5.2 : 12),
0.1
);
const eta = actionDistance / actionSpeed;
const sideSign =
getWideSideSign(startPoint) ||
getWideSideSign(ballPoint) ||
1;
const deliveryKind =
principleText.includes("cutback") || targetThreat.cutbackZone >= 0.24
? "cutback"
: principleText.includes("cross") || principleText.includes("delivery") || (isWideSource && targetThreat.box >= 0.16)
? "cross"
: runwayFinishCue
? "runway"
: actionType === "dribble"
? isCentralCarry ? "centralCarry" : "carry"
: "finalPass";
return {
actionType,
startPoint,
targetPoint: ballPoint,
targetThreat,
targetDepth,
startDepth,
eta,
arrivalWindow: eta + 0.65 + (profile.tempo ?? 0.5) * 0.26,
sideSign,
deliveryKind,
isWideSource,
isRunwayAction,
runwayFinishCue,
isCentralCarry,
isEndProductAction,
};
}
function getTimedBoxArrivalTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const sideSign = context.sideSign || 1;
const bylinePull = context.deliveryKind === "cutback" ? -1.8 : 0;
const centralCarryPull = context.deliveryKind === "centralCarry" || context.deliveryKind === "runway" ? 1 : 0;
const points = {
nearPost: {
x: penaltySpot.x + sign * (4.4 + (context.deliveryKind === "cross" ? 0.9 : centralCarryPull ? 0.35 : 0.2)),
y: pitch.width / 2 + sideSign * (centralCarryPull ? 4.6 : 5.6),
},
farPost: {
x: penaltySpot.x + sign * (4.2 + (context.deliveryKind === "cross" ? 0.7 : centralCarryPull ? 0.45 : 0.1)),
y: pitch.width / 2 - sideSign * (context.deliveryKind === "cross" ? 10.4 : 9.2),
},
centralGold: {
x: penaltySpot.x + sign * (context.deliveryKind === "runway" ? 1.6 : 0.9),
y: pitch.width / 2 + sideSign * (context.deliveryKind === "cross" ? 1.6 : 0.4),
},
penaltySpot: {
x: penaltySpot.x - sign * (0.8 + bylinePull),
y: pitch.width / 2 - sideSign * 0.7,
},
cutbackEdge: {
x: penaltySpot.x - sign * (7.2 + (context.deliveryKind === "cutback" ? 1.6 : centralCarryPull ? 0.9 : 0.4)),
y: pitch.width / 2 - sideSign * (centralCarryPull ? 5.8 : 4.8),
},
lateEdge: {
x: penaltySpot.x - sign * 10.6,
y: pitch.width / 2 + sideSign * 5.2,
},
reverseSquare: {
x: penaltySpot.x - sign * 5.8,
y: pitch.width / 2 + sideSign * 9.2,
},
restLock: clampToPitch({
x: context.targetPoint.x - sign * 20.5,
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
};
return clampToPitch(points[slot] ?? points.penaltySpot, 2);
}
function chooseTimedBoxArrivalPlayer(teamId, targets, excludedIds, roleKeys, target, context) {
const roleSet = new Set(roleKeys);
const arrivalWindow = Math.max(context.arrivalWindow, 0.75);
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id) || isGoalkeeper(player)) {
return false;
}
return roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation));
})
.map((player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const runDistance = distance(player.position, target);
const timeToTarget = computeTimeToCoverDistance(player, runDistance, target);
const timingFit = clamp(1 - Math.abs(timeToTarget - arrivalWindow) / 1.55, 0, 1);
const canArrive = timeToTarget <= arrivalWindow + 1.05;
const roleIndex = roleKeys.indexOf(roleKey);
const roleFit = roleIndex >= 0 ? 1 - roleIndex * 0.08 : 0.4;
const score =
roleFit * 0.34 +
timingFit * 0.42 +
getAutoPilotRoleStrength(player, "runner") * 0.22 +
getAutoPilotRoleStrength(player, "finisher") * 0.2 +
getPlayerTendency(player, "boxRun") * 0.14 -
Math.max(timeToTarget - arrivalWindow, 0) * 0.16 -
runDistance * 0.006 +
(canArrive ? 0.22 : -0.24);
return {
player,
score,
canArrive,
timeToTarget,
};
})
.filter((entry) => entry.canArrive || entry.score >= 0.42)
.sort((a, b) => b.score - a.score)[0]?.player ?? null;
}
function applyTimedFinalThirdBoxArrivals(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getTimedBoxArrivalContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const protectedArrivalIds = new Set();
const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
if (plannedRunner?.team === teamId) {
assignedIds.add(plannedRunner.id);
}
const assign = (slot, roleKeys, label) => {
const target = getTimedBoxArrivalTarget(teamId, context, slot);
const player = chooseTimedBoxArrivalPlayer(teamId, targets, assignedIds, roleKeys, target, context);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedArrivalIds.add(player.id);
labels.push(label);
return player;
};
if (context.deliveryKind === "cross") {
assign("nearPost", ["striker", "secondStriker", "wideForward"], "Timed box: near-post attack");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Timed box: far-post attack");
assign("penaltySpot", ["connector", "striker", "secondStriker"], "Timed box: penalty spot");
assign("lateEdge", ["connector", "pivot", "wideForward"], "Timed box: edge lock");
} else if (context.deliveryKind === "cutback") {
assign("penaltySpot", ["connector", "striker", "secondStriker"], "Timed box: cutback target");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Timed box: far-post hold");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Timed box: cutback edge");
assign("nearPost", ["striker", "secondStriker", "wideForward"], "Timed box: front run");
} else if (context.deliveryKind === "runway" || context.deliveryKind === "centralCarry") {
assign("centralGold", ["striker", "secondStriker", "wideForward"], "Finish lane: central goal run");
assign("nearPost", ["striker", "wideForward", "secondStriker"], "Finish lane: near-post pin");
assign("farPost", ["wideForward", "secondStriker", "striker"], "Finish lane: far-post hold");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Finish lane: cutback edge");
assign("reverseSquare", ["connector", "wideForward", "secondStriker"], "Finish lane: reverse pass option");
} else {
assign("penaltySpot", ["striker", "secondStriker", "wideForward"], "Timed box: central arrival");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Timed box: far-post arrival");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Timed box: second wave");
}
const restLock = chooseTimedBoxArrivalPlayer(
teamId,
targets,
assignedIds,
["pivot", "rest", "wideBack"],
getTimedBoxArrivalTarget(teamId, context, "restLock"),
{
...context,
arrivalWindow: context.arrivalWindow + 0.8,
}
);
if (setAutopilotPrincipleTarget(targets, restLock, getTimedBoxArrivalTarget(teamId, context, "restLock"))) {
protectedArrivalIds.add(restLock.id);
labels.push("Timed box: rest-defence lock");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedArrivalIds,
};
}

  return {
    getTimedBoxArrivalContext,
    getTimedBoxArrivalTarget,
    chooseTimedBoxArrivalPlayer,
    applyTimedFinalThirdBoxArrivals,
  };
}
