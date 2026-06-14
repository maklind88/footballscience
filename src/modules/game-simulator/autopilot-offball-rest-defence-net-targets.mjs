export function createGameSimulatorAutopilotOffballRestDefenceNetTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthX,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getWideSideSign,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

function getOffensiveRestDefenceNetContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile?.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType === "recovery") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = clampToPitch(actionMeta?.target ?? ballPoint, 2.5);
const ballDepth = getAttackingDepth(targetPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
if (ballDepth < 34 && startDepth < 34) {
return null;
}
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const actionForwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const highAttack =
ballDepth >= 58 ||
targetThreat.assistZone >= 0.28 ||
targetThreat.cutbackZone >= 0.18 ||
targetThreat.box >= 0.12;
const transitionRisk = clamp(
ballDepth / 100 * 0.34 +
(profile.risk ?? 0.5) * 0.22 +
(profile.directness ?? 0.5) * 0.12 +
(actionForwardGain >= 6 ? 0.12 : 0) +
(actionType === "dribble" ? 0.08 : 0) +
(actionType === "shot" ? 0.16 : 0) +
actionSpace.value * 0.18 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.14,
0,
1.3
);
const counterPressReadiness = clamp(
(profile.tempo ?? 0.5) * 0.22 +
(profile.risk ?? 0.5) * 0.18 +
(profile.supportCompactness ?? 0.55) * 0.14 +
(profile.styleKey === "gegenpress" ? 0.22 : 0) +
(profile.styleKey === "vertical-tiki-taka" ? 0.08 : 0) +
(actionSpace.targetPressure >= 0.44 ? 0.08 : 0) +
(highAttack ? 0.12 : 0),
0,
1.25
);
const restNeed = clamp(
transitionRisk * 0.64 +
(highAttack ? 0.16 : 0) +
((profile.restBehind ?? 22) <= 21 ? 0.1 : 0),
0,
1.2
);
return {
actionType,
actionForwardGain,
actionSpace,
ballDepth,
counterPressReadiness,
highAttack,
restNeed,
sideSign,
startPoint: cloneVector(startPoint),
targetPoint,
targetThreat,
transitionRisk,
};
}
function getOffensiveRestDefenceNetTarget(teamId, context, slot, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = context.ballDepth;
const sideSign = context.sideSign || 1;
const restBehind = profile.restBehind ?? 22;
const compactness = profile.supportCompactness ?? 0.56;
const ball = context.targetPoint;
const points = {
centralAnchor: clampToPitch({
x: ball.x - sign * (19 + restBehind * 0.2 + context.restNeed * 2.2),
y: clamp(lerp(ball.y, pitch.width / 2, 0.78), 14, pitch.width - 14),
}, 3),
farAnchor: clampToPitch({
x: ball.x - sign * (23 + restBehind * 0.18 + context.transitionRisk * 2),
y: clamp(pitch.width / 2 - sideSign * 11.5, 10, pitch.width - 10),
}, 3),
ballSideScreen: clampToPitch({
x: ball.x - sign * (9 + context.restNeed * 3.2),
y: clamp(lerp(ball.y, pitch.width / 2 + sideSign * 5.5, 0.5 + compactness * 0.12), 9, pitch.width - 9),
}, 3),
closeCounterPress: clampToPitch({
x: ball.x - sign * lerp(5.8, 2.8, context.counterPressReadiness),
y: clamp(ball.y + sideSign * lerp(4.8, 2.7, context.counterPressReadiness), 4.5, pitch.width - 4.5),
}, 3),
farSidePrevent: clampToPitch({
x: ball.x - sign * (14.5 + context.restNeed * 3),
y: clamp(pitch.width / 2 - sideSign * lerp(17, 24, profile.widthDiscipline ?? 0.62), 5, pitch.width - 5),
}, 3),
recoveryLine: clampToPitch({
x: ball.x - sign * (29 + restBehind * 0.12 + context.transitionRisk * 2.4),
y: clamp(pitch.width / 2 + sideSign * 5.5, 12, pitch.width - 12),
}, 3),
};
if (slot === "centralAnchor" && depth < 46) {
points.centralAnchor.x = getDepthX(teamId, clamp(depth - restBehind * 0.72, 14, 48));
}
return points[slot] ?? points.centralAnchor;
}
function applyOffensiveRestDefenceNetTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getOffensiveRestDefenceNetContext(teamId, ballPoint, actionMeta, profile);
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
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean));
const protectedRestIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getOffensiveRestDefenceNetTarget(teamId, context, slot, profile);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedRestIds.add(player.id);
labels.push(label);
return player;
};
assign("centralAnchor", ["rest", "pivot", "wideBack"], "Rest-defence net: central anchor");
if (context.restNeed >= 0.42 || context.ballDepth >= 48) {
assign("farAnchor", ["rest", "wideBack", "pivot"], "Rest-defence net: far cover", -context.sideSign);
}
if (context.counterPressReadiness >= 0.46 || context.actionType === "dribble" || context.actionSpace.targetPressure >= 0.44) {
assign("ballSideScreen", ["pivot", "connector", "wideBack"], "Rest-defence net: ball-side screen", context.sideSign);
assign("closeCounterPress", ["connector", "wideForward", "secondStriker", "pivot"], "Rest-defence net: counter-press support", context.sideSign);
}
if (context.highAttack || profile.switchBias >= 0.56 || profile.widthDiscipline >= 0.64) {
assign("farSidePrevent", ["wideBack", "wideForward", "connector"], "Rest-defence net: stop weak-side break", -context.sideSign);
}
if (context.ballDepth >= 66 || context.actionType === "shot" || context.transitionRisk >= 0.72) {
assign("recoveryLine", ["rest", "pivot", "wideBack"], "Rest-defence net: recovery line");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedRestIds,
};
}

  return {
    getOffensiveRestDefenceNetContext,
    getOffensiveRestDefenceNetTarget,
    applyOffensiveRestDefenceNetTargets,
  };
}
