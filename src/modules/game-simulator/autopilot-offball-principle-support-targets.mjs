export function createGameSimulatorAutopilotOffballPrincipleSupportTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getCornerDeliveryTarget,
    getDepthPoint,
    getFormationIdentityTarget,
    getHighValueAttackTarget,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOpponentPenaltySpot,
    getPlayerById,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
  } = deps;

function getSupportUnderBallTarget(teamId, ballPoint, sideSign, profile) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const supportDepth = clamp(depth - 8.5 - profile.supportCompactness * 8, 18, 78);
return getDepthPoint(teamId, supportDepth, {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 8.5, 0.42), 8, pitch.width - 8),
});
}
function getThirdManRunnerTarget(teamId, ballPoint, sideSign, profile) {
const depth = getAttackingDepth(ballPoint, teamId);
const runnerDepth = clamp(depth + 9 + profile.runnerBoost * 0.72, 38, 96);
return getDepthPoint(teamId, runnerDepth, {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 11, 0.42), 8, pitch.width - 8),
});
}
function getBoxOccupationTarget(teamId, ballPoint, slot) {
const sign = getAttackDirectionSign(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const ballSide = Math.sign(ballPoint.y - pitch.width / 2) || 1;
const points = {
nearPost: {
x: penaltySpot.x + sign * 3.4,
y: pitch.width / 2 + ballSide * 8.8,
},
farPost: {
x: penaltySpot.x + sign * 4.2,
y: pitch.width / 2 - ballSide * 12.5,
},
penaltySpot: {
x: penaltySpot.x - sign * 0.8,
y: pitch.width / 2,
},
edge: {
x: penaltySpot.x - sign * 8.2,
y: pitch.width / 2 - ballSide * 2.8,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 2);
}
function applyCornerDeliveryPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds = new Set()) {
const restart = actionMeta?.beforeSnapshot?.restartPhase;
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isCornerAction =
restart?.type === "corner" ||
state.restartPhase?.type === "corner" ||
principleText.includes("corner");
if (!isCornerAction) {
return [];
}
const sideY = Number.isFinite(restart?.sideY)
? restart.sideY
: Number.isFinite(state.restartPhase?.sideY)
? state.restartPhase.sideY
: actionMeta?.beforeSnapshot?.ball?.position?.y ?? ballPoint.y;
const labels = [];
const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
if (
plannedRunner?.team === teamId &&
!excludedIds.has(plannedRunner.id) &&
setAutopilotPrincipleTarget(targets, plannedRunner, clampToPitch(ballPoint, 2))
) {
excludedIds.add(plannedRunner.id);
labels.push("Primary corner runner");
}
const nearRunner = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "secondStriker", "wideForward"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, nearRunner, getCornerDeliveryTarget(teamId, sideY, "nearPost"))) {
excludedIds.add(nearRunner.id);
labels.push("Near-post corner run");
}
const farRunner = getMovableAutopilotPlayerByRoles(
teamId,
["wideForward", "striker", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, farRunner, getCornerDeliveryTarget(teamId, sideY, "farPost"))) {
excludedIds.add(farRunner.id);
labels.push("Far-post corner run");
}
const centralRunner = getMovableAutopilotPlayerByRoles(
teamId,
["connector", "striker", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, centralRunner, getCornerDeliveryTarget(teamId, sideY, "penaltySpot"))) {
excludedIds.add(centralRunner.id);
labels.push("Penalty-spot attack");
}
const edgePlayer = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector", "wideBack"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, edgePlayer, getCornerDeliveryTarget(teamId, sideY, "edge"))) {
excludedIds.add(edgePlayer.id);
labels.push("Edge box lock");
}
return labels;
}
function getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const widthScale = profile.widthDiscipline ?? 0.64;
const points = {
splitNear: getDepthPoint(teamId, 18, {
y: clamp(pitch.width / 2 + sideSign * lerp(10.5, 15.5, widthScale), 7, pitch.width - 7),
}),
splitFar: getDepthPoint(teamId, 20, {
y: clamp(pitch.width / 2 - sideSign * lerp(10.5, 15.5, widthScale), 7, pitch.width - 7),
}),
wideOutlet: getDepthPoint(teamId, 31, {
y: clamp(pitch.width / 2 + sideSign * lerp(24, 30, widthScale), 4.5, pitch.width - 4.5),
}),
pivotDrop: getDepthPoint(teamId, clamp(27 + (profile.shortSupport ?? 0.55) * 5, 27, 34), {
y: clamp(lerp(pitch.width / 2, ballPoint.y, 0.12), 20, 48),
}),
secondBall: getDepthPoint(teamId, 48, {
y: clamp(pitch.width / 2 - sideSign * 7, 12, pitch.width - 12),
}),
};
return points[slot] ?? points.pivotDrop;
}
function applyGoalkeeperBuildOutPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds = new Set()) {
const goalkeeper = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
if (!goalkeeper || !isGoalkeeper(goalkeeper)) {
return [];
}
const labels = [];
const sideSign = getWideSideSign(ballPoint) || 1;
const directRelease = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
]
.filter(Boolean)
.join(" ")
.toLowerCase()
.includes("gk release");
const nearCenterBack = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["rest"],
targets,
excludedIds,
sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, nearCenterBack, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, "splitNear", sideSign, profile))) {
excludedIds.add(nearCenterBack.id);
labels.push("Split centre-back");
}
const farCenterBack = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["rest"],
targets,
excludedIds,
-sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, farCenterBack, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, "splitFar", sideSign, profile))) {
excludedIds.add(farCenterBack.id);
labels.push("Opposite centre-back support");
}
const wideOutlet = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["wideBack"],
targets,
excludedIds,
sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, wideOutlet, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, "wideOutlet", sideSign, profile))) {
excludedIds.add(wideOutlet.id);
labels.push("Wide build-out outlet");
}
const pivot = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, pivot, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, directRelease ? "secondBall" : "pivotDrop", sideSign, profile))) {
excludedIds.add(pivot.id);
labels.push(directRelease ? "Second-ball screen" : "6 drops to connect");
}
return labels;
}
function applyBoxOccupationPrincipleTargets(teamId, targets, ballPoint, excludedIds = new Set()) {
const labels = [];
const striker = getMovableAutopilotPlayerByRoles(teamId, ["striker", "secondStriker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, striker, getBoxOccupationTarget(teamId, ballPoint, "nearPost"))) {
excludedIds.add(striker.id);
labels.push("Near-post run");
}
const farRunner = getMovableAutopilotPlayerByRoles(teamId, ["wideForward", "secondStriker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, farRunner, getBoxOccupationTarget(teamId, ballPoint, "farPost"))) {
excludedIds.add(farRunner.id);
labels.push("Far-post run");
}
const centralRunner = getMovableAutopilotPlayerByRoles(teamId, ["connector", "striker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, centralRunner, getBoxOccupationTarget(teamId, ballPoint, "penaltySpot"))) {
excludedIds.add(centralRunner.id);
labels.push("Penalty-spot occupation");
}
const edgePlayer = getMovableAutopilotPlayerByRoles(teamId, ["connector", "pivot"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, edgePlayer, getBoxOccupationTarget(teamId, ballPoint, "edge"))) {
labels.push("Edge support");
}
return labels;
}
function applyBetweenLinesPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
if (!principleText.includes("between-lines") && !principleText.includes("ficka")) {
return [];
}
const labels = [];
const sideSign = getWideSideSign(ballPoint) || 1;
const depthRunner = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "wideForward", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, depthRunner, getHighValueAttackTarget(teamId, ballPoint, "goldenRun", sideSign))) {
excludedIds.add(depthRunner.id);
labels.push("Depth threat beyond pocket");
}
const bounceSupport = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, bounceSupport, getSupportUnderBallTarget(teamId, ballPoint, sideSign, profile))) {
excludedIds.add(bounceSupport.id);
labels.push("Bounce support under pocket");
}
const weakSide = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["wideForward", "wideBack"],
targets,
excludedIds,
-sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, weakSide, getFormationIdentityTarget(teamId, ballPoint, "weakSideWidth", sideSign, profile))) {
excludedIds.add(weakSide.id);
labels.push("Weak-side width");
}
const restLock = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "rest"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, restLock, getFormationIdentityTarget(teamId, ballPoint, "restLock", sideSign, profile))) {
excludedIds.add(restLock.id);
labels.push("Rest-defence lock");
}
return labels;
}
  return {
    getSupportUnderBallTarget,
    getThirdManRunnerTarget,
    getBoxOccupationTarget,
    applyCornerDeliveryPrincipleTargets,
    getGoalkeeperBuildOutSupportTarget,
    applyGoalkeeperBuildOutPrincipleTargets,
    applyBoxOccupationPrincipleTargets,
    applyBetweenLinesPrincipleTargets,
  };
}
