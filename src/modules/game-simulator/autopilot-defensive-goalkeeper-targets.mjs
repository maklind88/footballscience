export function createGameSimulatorAutopilotDefensiveGoalkeeperTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    computeTimeToCoverDistance,
    distance,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDefensiveAutopilotProfile,
    getDefensiveLineDistanceFromOwnGoal,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getWideSideSign,
    isAerialFlightStyle,
    lerp,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveLineActionLabels(profile) {
const label = profile.lineActionAdjustment?.label;
return label ? [label] : [];
}
function getDefensiveGoalkeeperTarget(teamId, ballPoint, profile = getDefensiveAutopilotProfile(teamId, ballPoint)) {
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const sweepDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "gk", ballPoint, profile);
const yClamp = profile.phaseKey === "boxDefending" ? [22.5, 45.5] : [28.5, 39.5];
const yInfluence = profile.phaseKey === "boxDefending" ? 0.28 : 0.12;
const y = clamp(lerp(pitch.width / 2, ballPoint.y, yInfluence), yClamp[0], yClamp[1]);
return clampToPitch({
x: ownGoalX + sign * sweepDepth,
y,
}, 3);
}
function getDefensiveGoalkeeperSweeperContext(teamId, goalkeeper, ballPoint, profile) {
if (!goalkeeper || !ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
targetKind: state.ball.targetKind,
profileKey: state.ball.profileKey,
profileLabel: state.ball.profileLabel,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!targetPoint || !startPoint || !["pass", "dribble"].includes(actionType)) {
return null;
}
const targetFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const startFromOwnGoal = getDistanceFromOwnGoal(teamId, startPoint);
const actionDistance = distance(startPoint, targetPoint);
const actionSpeed = Math.max(actionMeta.speed ?? state.ball.speed ?? state.ball.currentSpeed ?? 10, 0.1);
const eta = actionDistance / actionSpeed;
const profileText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const centrality = 1 - Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const ballMovingTowardGoal = targetFromOwnGoal <= startFromOwnGoal - 3 || forwardGain >= 5;
const isAerialDelivery =
isAerialFlightStyle(state.ball.flightStyle) ||
profileText.includes("cross") ||
profileText.includes("delivery") ||
profileText.includes("lofted") ||
profileText.includes("clipped");
const isThroughThreat =
ballMovingTowardGoal &&
(
targetThreat.behindLine >= 0.2 ||
targetThreat.box >= 0.18 ||
profileText.includes("through") ||
profileText.includes("line-break") ||
profileText.includes("into-space") ||
profileText.includes("run behind") ||
profileText.includes("channel")
);
const isCrossClaim =
actionType === "pass" &&
targetFromOwnGoal <= 18.5 &&
isAerialDelivery &&
(centrality >= 0.24 || targetThreat.box >= 0.16);
const isBreakawayDribble =
actionType === "dribble" &&
targetFromOwnGoal <= 24 &&
ballMovingTowardGoal &&
centrality >= 0.18;
if (!isThroughThreat && !isCrossClaim && !isBreakawayDribble) {
return null;
}
const baseTarget = getDefensiveGoalkeeperTarget(teamId, ballPoint, profile);
const maxSweepDepth =
profile.phaseKey === "highPress"
? 24
: profile.phaseKey === "midBlock"
? 19
: profile.phaseKey === "lowBlock"
? 15
: 11.5;
const desiredDepth = isCrossClaim
? clamp(targetFromOwnGoal * 0.46 + 3.4, 5.4, 11.8)
: isBreakawayDribble
? clamp(targetFromOwnGoal * 0.52 + 2.2, 6.2, 13.4)
: clamp(targetFromOwnGoal - 2.6, 8.2, maxSweepDepth);
const yInfluence = isCrossClaim ? 0.48 : isBreakawayDribble ? 0.62 : 0.72;
const yClamp = isCrossClaim
? [19.5, 48.5]
: isBreakawayDribble
? [20.5, 47.5]
: [13.5, 54.5];
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const desiredTarget = clampToPitch({
x: ownGoal.x + sign * desiredDepth,
y: clamp(lerp(pitch.width / 2, targetPoint.y, yInfluence), yClamp[0], yClamp[1]),
}, 2.5);
const timeToTarget = computeTimeToCoverDistance(
goalkeeper,
distance(goalkeeper.position, desiredTarget),
desiredTarget
);
const access = clamp((eta + 0.45) / Math.max(timeToTarget, 0.01), 0.22, 1);
const target = clampToPitch({
x: lerp(baseTarget.x, desiredTarget.x, access),
y: lerp(baseTarget.y, desiredTarget.y, access),
}, 2.5);
const label = isCrossClaim
? "GK claims box delivery"
: isBreakawayDribble
? "GK narrows breakaway angle"
: "GK sweeps behind back line";
return {
target,
label,
focusPoint: targetPoint,
};
}
function applyDefensiveGoalkeeperSweeperTarget(teamId, targets, groups, ballPoint, profile) {
const labels = [];
groups.gk.forEach((goalkeeper) => {
const context = getDefensiveGoalkeeperSweeperContext(teamId, goalkeeper, ballPoint, profile);
if (!context) {
return;
}
targets.set(goalkeeper.id, context.target);
labels.push(context.label);
});
return uniquePrincipleLabels(labels);
}
function getDefensiveGoalkeeperShotSetContext(teamId, goalkeeper, ballPoint, profile) {
if (!goalkeeper || !ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
targetKind: state.ball.targetKind,
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
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const threatPoint = actionType === "shot" ? startPoint : targetPoint;
const threat = getPitchThreatProfile(threatPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, threatPoint);
const goalDistance = distance(threatPoint, getOwnGoalCenter(teamId));
const profileText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isCutback =
profileText.includes("cutback") ||
threat.cutbackZone >= 0.24;
const isBoxDelivery =
profileText.includes("cross") ||
profileText.includes("delivery") ||
threat.assistZone >= 0.36 ||
(actionType === "pass" && threat.box >= 0.18);
const isShotThreat =
actionType === "shot" ||
profileText.includes("shoot") ||
profileText.includes("finish") ||
threat.box >= 0.2 ||
(ballFromOwnGoal <= 31 && threat.centralPocket >= 0.24);
const isBreakaway =
actionType === "dribble" &&
ballFromOwnGoal <= 25 &&
(threat.box >= 0.12 || threat.centralPocket >= 0.22);
const shouldSet =
isShotThreat ||
isCutback ||
isBoxDelivery ||
isBreakaway ||
(ballFromOwnGoal <= 28 && threat.value >= 0.42);
if (!shouldSet) {
return null;
}
const actionDistance = distance(startPoint, targetPoint);
const actionSpeed = Math.max(actionMeta.speed ?? state.ball.speed ?? state.ball.currentSpeed ?? 10, 0.1);
const eta = actionDistance / actionSpeed;
const sideSign =
getWideSideSign(threatPoint) ||
getWideSideSign(targetPoint) ||
1;
return {
actionType,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
threatPoint: cloneVector(threatPoint),
threat,
ballFromOwnGoal,
goalDistance,
eta,
sideSign,
isShotThreat,
isCutback,
isBoxDelivery,
isBreakaway,
phaseKey: profile.phaseKey,
};
}
function getDefensiveGoalkeeperShotSetTarget(teamId, goalkeeper, context, baseTarget) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const centerY = pitch.width / 2;
const sideDistance = Math.abs(context.threatPoint.y - centerY);
const wideRatio = clamp(sideDistance / (pitch.width / 2), 0, 1);
const nearPostLock = context.isShotThreat && wideRatio >= 0.52;
const depth =
context.isBoxDelivery && !context.isShotThreat
? clamp(context.ballFromOwnGoal * 0.24 + 2.4, 3.2, 8.8)
: context.isBreakaway
? clamp(context.ballFromOwnGoal * 0.32 + 1.7, 3.4, 9.2)
: context.isCutback
? clamp(context.ballFromOwnGoal * 0.18 + 2.1, 2.4, 6.8)
: clamp(context.ballFromOwnGoal * 0.16 + 1.45, 1.8, 7.4);
const yPull =
context.isBoxDelivery && !context.isShotThreat
? 0.3
: context.isCutback
? 0.24
: nearPostLock
? 0.42
: 0.32;
const nearPostBias = nearPostLock
? context.sideSign * clamp(0.75 + wideRatio * 1.65, 0.75, 2.25)
: 0;
const yLimit =
context.isBoxDelivery && !context.isShotThreat
? 7.2
: context.isBreakaway
? 6.2
: nearPostLock
? 4.7
: 4.15;
const desiredTarget = clampToPitch({
x: ownGoal.x + sign * depth,
y: clamp(
lerp(centerY, context.threatPoint.y, yPull) + nearPostBias,
centerY - yLimit,
centerY + yLimit
),
}, 1.6);
const timeToTarget = computeTimeToCoverDistance(
goalkeeper,
distance(goalkeeper.position, desiredTarget),
desiredTarget
);
const access = clamp((context.eta + 0.42) / Math.max(timeToTarget, 0.01), 0.3, 1);
return clampToPitch({
x: lerp(baseTarget.x, desiredTarget.x, access),
y: lerp(baseTarget.y, desiredTarget.y, access),
}, 1.6);
}
function applyDefensiveGoalkeeperShotSetTarget(teamId, targets, groups, ballPoint, profile) {
const labels = [];
groups.gk.forEach((goalkeeper) => {
const context = getDefensiveGoalkeeperShotSetContext(teamId, goalkeeper, ballPoint, profile);
if (!context) {
return;
}
const baseTarget = targets.get(goalkeeper.id) ?? getDefensiveGoalkeeperTarget(teamId, ballPoint, profile);
targets.set(goalkeeper.id, getDefensiveGoalkeeperShotSetTarget(teamId, goalkeeper, context, baseTarget));
labels.push(
context.isShotThreat
? "GK sets for shot"
: context.isCutback
? "GK protects cutback angle"
: context.isBreakaway
? "GK narrows breakaway"
: "GK adjusts to box delivery"
);
});
return uniquePrincipleLabels(labels);
}

  return {
    getDefensiveLineActionLabels,
    getDefensiveGoalkeeperTarget,
    getDefensiveGoalkeeperSweeperContext,
    applyDefensiveGoalkeeperSweeperTarget,
    getDefensiveGoalkeeperShotSetContext,
    getDefensiveGoalkeeperShotSetTarget,
    applyDefensiveGoalkeeperShotSetTarget,
  };
}
