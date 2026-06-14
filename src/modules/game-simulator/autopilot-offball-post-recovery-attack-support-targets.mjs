export function createGameSimulatorAutopilotOffballPostRecoveryAttackSupportTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getCarryLaneOpenSpaceScore,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getNearestOpponentGapInCarryLane,
    getOpponentPressureAtPoint,
    getPlayerById,
    getPlayerPressureLoad,
    getRecordedStepDuration,
    getRecordedStepPattern,
    getRecordedStepPossessionTeamId,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    isTransitionAttackStyle,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

  const getLocalTeamSupportCountAroundPoint = getTeamSupportCountAroundPoint ?? ((teamId, point, excludedIds = new Set(), radius = 12) => {
    if (!teamId || !point) {
      return 0;
    }
    return (state.players ?? []).reduce((count, player) => {
      if (player.team !== teamId || excludedIds.has(player.id) || isGoalkeeper?.(player)) {
        return count;
      }
      return count + (distance(player.position, point) <= radius ? 1 : 0);
    }, 0);
  });

function getPostRecoveryAttackSupportContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile?.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (!["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const steps = state.sequence?.steps ?? [];
let recoveryIndex = -1;
for (let index = steps.length - 1; index >= 0; index -= 1) {
const step = steps[index];
const possessionTeamId = getRecordedStepPossessionTeamId(step);
const isRecovery =
step?.actionType === "recovery" ||
step?.profileKey === "loose-ball-recovery" ||
`${step?.profileLabel ?? ""}`.toLowerCase().includes("loose ball");
if (isRecovery && possessionTeamId === teamId) {
recoveryIndex = index;
break;
}
if (possessionTeamId && possessionTeamId !== teamId) {
break;
}
}
if (recoveryIndex < 0) {
return null;
}
const actionsAfterRecovery = steps.slice(recoveryIndex + 1);
if (actionsAfterRecovery.length > 4) {
return null;
}
if (actionsAfterRecovery.some((step) => getRecordedStepPossessionTeamId(step) !== teamId)) {
return null;
}
const elapsed = actionsAfterRecovery.reduce(
(total, step) => total + getRecordedStepDuration(step),
0
);
if (elapsed > 10.5) {
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
const recoveryStep = steps[recoveryIndex];
const recoveryPoint =
recoveryStep?.target ??
recoveryStep?.afterSnapshot?.ball?.position ??
startPoint;
const originDepth = getAttackingDepth(recoveryPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const targetDepth = getAttackingDepth(targetPoint, teamId);
const depthGainSinceRecovery = startDepth - originDepth;
const actionForwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const actionDistance = distance(startPoint, targetPoint);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const currentCarrier = getPlayerById(
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta?.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const pressure = currentCarrier?.team === teamId
? getPlayerPressureLoad(currentCarrier, startPoint)
: getOpponentPressureAtPoint(teamId, startPoint, 9.5);
const localSupport = getLocalTeamSupportCountAroundPoint(
teamId,
startPoint,
new Set([currentCarrier?.id, actionMeta?.receiverPlayerId].filter(Boolean)),
13
);
const forwardProbe = clampToPitch({
x: startPoint.x + getAttackDirectionSign(teamId) * 20,
y: lerp(startPoint.y, pitch.width / 2, 0.24),
}, 2.5);
const forwardOpenSpace = currentCarrier?.team === teamId
? getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(currentCarrier, forwardProbe))
: actionSpace.openTarget;
const patterns = actionsAfterRecovery
.map((step) => getRecordedStepPattern(step, teamId))
.filter(Boolean);
const sidewaysOrBackCount = patterns.filter((pattern) => pattern.forwardGain <= 2.5).length;
const lineBreakCount = patterns.filter((pattern) => pattern.family === "line-break" || pattern.forwardGain >= 9).length;
const lanes = patterns.map((pattern) => pattern.laneKey).filter(Boolean);
const laneVariety = new Set(lanes).size;
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const directStyle = isTransitionAttackStyle(profile.styleKey);
const transitionCue =
actionForwardGain >= 5.5 &&
(
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.4 ||
targetThreat.behindLine >= 0.2 ||
targetThreat.centralPocket >= 0.24 ||
forwardOpenSpace >= 0.58
);
const secureCue =
pressure >= 0.5 ||
localSupport <= 1 ||
(
actionType === "pass" &&
actionDistance <= 22 &&
actionForwardGain >= -8 &&
actionSpace.targetPressure <= 0.72
);
const staleCue =
actionsAfterRecovery.length >= 2 &&
depthGainSinceRecovery < 8 &&
sidewaysOrBackCount >= 1 &&
lineBreakCount === 0 &&
laneVariety <= 2;
const finalThirdCue =
targetDepth >= 66 ||
targetThreat.box >= 0.16 ||
targetThreat.cutbackZone >= 0.22 ||
targetThreat.assistZone >= 0.32;
const counterWindow = clamp(
(directStyle ? 0.34 : 0) +
(profile.directness ?? 0.5) * 0.26 +
(profile.progressionUrgency ?? 0.5) * 0.16 +
forwardOpenSpace * 0.24 +
(transitionCue ? 0.22 : 0) -
Math.max(0, actionsAfterRecovery.length - 2) * 0.08,
0,
1.15
);
const secureNeed = clamp(
pressure * 0.34 +
(localSupport <= 1 ? 0.2 : 0) +
(secureCue ? 0.16 : 0) +
(profile.shortSupport ?? 0.5) * 0.08,
0,
1.1
);
const mode =
counterWindow >= Math.max(0.58, secureNeed + 0.12)
? "counter"
: secureNeed >= 0.58
? "secure"
: "establish";
return {
active: true,
teamId,
actionType,
actionMeta,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
recoveryPoint: cloneVector(recoveryPoint),
actionsAfterRecovery: actionsAfterRecovery.length,
elapsed,
originDepth,
startDepth,
targetDepth,
depthGainSinceRecovery,
actionForwardGain,
actionDistance,
actionSpace,
targetThreat,
pressure,
localSupport,
forwardOpenSpace,
sidewaysOrBackCount,
lineBreakCount,
laneVariety,
sideSign,
directStyle,
transitionCue,
secureCue,
staleCue,
finalThirdCue,
counterWindow,
secureNeed,
mode,
};
}
function getPostRecoveryAttackSupportTarget(teamId, context, slot, sideSign = context.sideSign, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(context.targetPoint, teamId);
const startDepth = getAttackingDepth(context.startPoint, teamId);
const wideY = clamp(pitch.width / 2 + sideSign * lerp(23, 31, profile.widthDiscipline ?? 0.62), 4, pitch.width - 4);
const farWideY = clamp(pitch.width / 2 - sideSign * lerp(23, 31, profile.widthDiscipline ?? 0.62), 4, pitch.width - 4);
const halfY = clamp(pitch.width / 2 + sideSign * 12.5, 8, pitch.width - 8);
const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
const points = {
counterRunner: getDepthPoint(teamId, clamp(depth + 13 + (profile.directness ?? 0.5) * 8, Math.max(50, startDepth + 10), 98), {
y: clamp(lerp(context.targetPoint.y, farHalfY, 0.5), 9, pitch.width - 9),
}),
pinLastLine: getDepthPoint(teamId, clamp(depth + 10 + (profile.runnerBoost ?? 7) * 0.34, 48, 98), {
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.56), 11, pitch.width - 11),
}),
wideRelease: getDepthPoint(teamId, clamp(depth + 2 + (profile.widthDiscipline ?? 0.6) * 7, 34, 92), {
y: wideY,
}),
weakSideRelease: getDepthPoint(teamId, clamp(depth + 4 + (profile.switchBias ?? 0.5) * 8, 36, 92), {
y: farWideY,
}),
insideLink: getDepthPoint(teamId, clamp(depth + 1 + (profile.shortSupport ?? 0.55) * 5, 30, 86), {
y: clamp(lerp(context.targetPoint.y, halfY, context.finalThirdCue ? 0.42 : 0.58), 9, pitch.width - 9),
}),
underSupport: getDepthPoint(teamId, clamp(depth - 9 - (profile.supportCompactness ?? 0.55) * 5, 17, 78), {
y: clamp(lerp(context.targetPoint.y, pitch.width / 2 - sideSign * 4.5, 0.54), 9, pitch.width - 9),
}),
trailer: getDepthPoint(teamId, clamp(depth - 4 + (profile.shortSupport ?? 0.55) * 4, 28, 82), {
y: clamp(lerp(context.targetPoint.y, farHalfY, 0.34), 10, pitch.width - 10),
}),
boxArrive: getDepthPoint(teamId, clamp(84 + (profile.directness ?? 0.5) * 8, 80, 98), {
y: clamp(pitch.width / 2 + sideSign * 6.2, 12, pitch.width - 12),
}),
farPostArrive: getDepthPoint(teamId, clamp(86, 82, 98), {
y: clamp(pitch.width / 2 - sideSign * 10.8, 10, pitch.width - 10),
}),
restLock: clampToPitch({
x: context.targetPoint.x - sign * (18 + (profile.restBehind ?? 22) * 0.22),
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
farRestCover: clampToPitch({
x: context.targetPoint.x - sign * (22 + (profile.restBehind ?? 22) * 0.2),
y: clamp(pitch.width / 2 - sideSign * 10.4, 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function applyPostRecoveryAttackSupportTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getPostRecoveryAttackSupportContext(teamId, ballPoint, actionMeta, profile);
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
const protectedPostRecoveryIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
const target = getPostRecoveryAttackSupportTarget(teamId, context, slot, context.sideSign, profile);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedPostRecoveryIds.add(player.id);
labels.push(label);
return player;
};
if (context.mode === "counter") {
assign("counterRunner", ["striker", "wideForward", "secondStriker"], "Post-recovery attack: depth runner");
assign("wideRelease", ["wideForward", "wideBack"], "Post-recovery attack: width release", context.sideSign);
assign("insideLink", ["connector", "wideForward", "secondStriker"], "Post-recovery attack: inside link", context.sideSign);
assign("trailer", ["connector", "pivot", "wideForward"], "Post-recovery attack: trailer support");
if (context.finalThirdCue || context.targetDepth >= 62) {
assign("boxArrive", ["striker", "secondStriker", "wideForward"], "Post-recovery attack: box arrival");
}
} else if (context.mode === "secure") {
assign("underSupport", ["pivot", "connector", "wideBack", "rest"], "Post-recovery attack: secure under-support");
assign("insideLink", ["connector", "pivot", "wideForward"], "Post-recovery attack: inside angle");
if (context.pressure >= 0.48 || context.staleCue || profile.switchBias >= 0.54) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Post-recovery attack: weak-side release", -context.sideSign);
}
assign("trailer", ["connector", "pivot"], "Post-recovery attack: reset trailer");
} else {
assign("underSupport", ["pivot", "connector", "wideBack"], "Post-recovery attack: connect under");
assign("insideLink", ["connector", "wideForward", "secondStriker"], "Post-recovery attack: half-space link", context.sideSign);
assign("pinLastLine", ["striker", "wideForward", "secondStriker"], "Post-recovery attack: pin last line");
if (context.staleCue || profile.switchBias >= 0.56) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Post-recovery attack: change-side outlet", -context.sideSign);
} else {
assign("wideRelease", ["wideBack", "wideForward"], "Post-recovery attack: hold width", context.sideSign);
}
}
assign("restLock", ["pivot", "rest", "wideBack"], "Post-recovery attack: rest-defence lock");
if (context.targetDepth >= 48 || context.mode === "counter") {
assign("farRestCover", ["rest", "pivot", "wideBack"], "Post-recovery attack: far rest cover", -context.sideSign);
}
if (context.finalThirdCue && context.mode !== "secure") {
assign("farPostArrive", ["wideForward", "striker", "secondStriker"], "Post-recovery attack: far-post threat", -context.sideSign);
}
if (labels.length) {
labels.unshift(
context.mode === "counter"
? "Post-recovery attacking support: counter"
: context.mode === "secure"
? "Post-recovery attacking support: secure"
: "Post-recovery attacking support: establish"
);
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedPostRecoveryIds,
};
}

  return {
    getPostRecoveryAttackSupportContext,
    getPostRecoveryAttackSupportTarget,
    applyPostRecoveryAttackSupportTargets,
  };
}
