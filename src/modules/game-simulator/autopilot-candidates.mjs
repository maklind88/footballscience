export function createGameSimulatorAutopilotCandidates(deps = {}) {
  const {
    angleBetween,
    chooseScoredCandidateWithVariation,
    chooseWideOverlapRunner,
    clamp,
    clampToPitch,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getActionThreatGain,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotCarryEndProductContext,
    getAutoPilotFlowContext,
    getAutoPilotRegainContext,
    getAutoPilotRoleStrength,
    getBreakawayCarryTarget,
    getCarryLaneOpenSpaceScore,
    getCarryRunwayProfile,
    getDepthPoint,
    getDepthX,
    getDistanceFromOwnGoal,
    getFootUsageScore,
    getForwardFacingSpaceTwoContext,
    getForwardProgressionWindow,
    getGoalMouthTarget,
    getGoalkeeperTargetOpenness,
    getHighValueAttackTarget,
    getKickoffSupportId,
    getNearestOpponentGapInCarryLane,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOpenGrassCarryContext,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOpponentPressureAtPoint,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getPossessionRhythmContext,
    getRecentPossessionSteps,
    getRecordedStepDuration,
    getRunwayCarryTarget,
    getShotAngleQuality,
    getShotWindowProfile,
    getState,
    getSwitchLandingAttackTarget,
    getWideEntryPrincipleContext,
    getWideSideSign,
    isBylineZone,
    isGoalkeeper,
    isInsideOpponentBox,
    isInsideOwnBox,
    isLastStepKickoffResetForTeam,
    isPassReceiverOffside,
    isTransitionAttackStyle,
    isWideChannel,
    isWidePrincipleZone,
    kickoffOpeningProfiles,
    lerp,
    normalize,
    pitch,
    resolveBallActionProfile,
    resolveShotTarget,
    teams,
    uniquePrincipleLabels,
    win,
  } = deps;

function getAutoPilotShotTarget(teamId, shooter) {
const state = getState();
const goal = getOpponentGoalCenter(teamId);
if (!shooter) {
return resolveShotTarget(goal, null);
}
const startPoint = getPlayerBallControlPoint(shooter);
const shooterSide =
Math.sign(startPoint.y - pitch.width / 2) ||
(shooter.preferredFoot === "left" ? -1 : 1);
const goalDistance = distance(startPoint, goal);
const isWide = isWideChannel(startPoint);
const isClose = goalDistance <= 19;
const finisherStrength = getAutoPilotRoleStrength(shooter, "finisher");
const options = [
{
key: "far-corner",
label: "far corner",
y: pitch.width / 2 - shooterSide * 3.08,
baseScore: 0.34,
closeBonus: 0.08,
},
{
key: "near-post",
label: "near post",
y: pitch.width / 2 + shooterSide * 2.82,
baseScore: isWide ? 0.28 : 0.04,
closeBonus: 0.28,
},
{
key: "across-goal",
label: "across goal",
y: pitch.width / 2 - shooterSide * 2.18,
baseScore: 0.22,
closeBonus: 0.14,
},
{
key: "keeper-wrong-foot",
label: "wrong-foot finish",
y: pitch.width / 2 + shooterSide * 1.18,
baseScore: finisherStrength >= 0.76 ? 0.18 : -0.02,
closeBonus: 0.1,
},
];
const rankedTargets = options
.map((option) => {
const target = getGoalMouthTarget(teamId, option.y);
const window = getShotWindowProfile(shooter, startPoint, target);
const footScore = getFootUsageScore(shooter, angleBetween(startPoint, target));
const cornerValue = clamp(Math.abs(target.y - pitch.width / 2) / (7.32 / 2), 0, 1);
const score =
option.baseScore +
(isClose ? option.closeBonus : 0) +
win.laneClarity * 0.34 +
win.goalkeeperOpenness * 0.36 +
win.angleQuality * 0.22 +
footScore * 0.16 +
cornerValue * 0.18 +
finisherStrength * 0.14 -
win.blockRisk * 0.34 -
(goalDistance > 31 && option.key === "near-post" ? 0.16 : 0);
return {
...option,
target,
window,
score,
};
})
.sort((a, b) => b.score - a.score);
return rankedTargets[0]?.target ?? resolveShotTarget(goal, shooter);
}

function getAutoPilotBoxTarget(teamId, carrier, variant = "cross") {
const state = getState();
const sign = getAttackDirectionSign(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const farPostSide = Math.sign((carrier?.position.y ?? pitch.width / 2) - pitch.width / 2) || 1;
if (variant === "far-post") {
return clampToPitch({
x: penaltySpot.x + sign * 3.8,
y: pitch.width / 2 - farPostSide * 10.5,
}, 1.5);
}
if (variant === "cutback") {
return clampToPitch({
x: penaltySpot.x - sign * 3.5,
y: pitch.width / 2 + farPostSide * 2.5,
}, 1.5);
}
return clampToPitch({
x: penaltySpot.x + sign * 0.8,
y: pitch.width / 2 - farPostSide * 4.2,
}, 1.5);
}

function getCornerDeliveryTarget(teamId, sideY = 0, slot = "penaltySpot") {
const state = getState();
const sign = getAttackDirectionSign(teamId);
const sideSign = sideY <= pitch.width / 2 ? -1 : 1;
const penaltySpot = getOpponentPenaltySpot(teamId);
const points = {
nearPost: {
x: penaltySpot.x + sign * 4.9,
y: pitch.width / 2 + sideSign * 4.6,
},
farPost: {
x: penaltySpot.x + sign * 4.2,
y: pitch.width / 2 - sideSign * 7.8,
},
penaltySpot: {
x: penaltySpot.x - sign * 0.4,
y: pitch.width / 2 - sideSign * 0.8,
},
edge: {
x: penaltySpot.x - sign * 8.4,
y: pitch.width / 2 - sideSign * 3.2,
},
short: {
x: teamId === "home" ? pitch.length - 9.4 : 9.4,
y: sideY <= pitch.width / 2 ? 2.8 : pitch.width - 2.8,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 1.3);
}

function chooseCornerDeliveryRunner(teamId, target, carrierId = null, slot = "penaltySpot") {
const state = getState();
const slotRoleBonus = {
nearPost: { striker: 0.3, secondStriker: 0.24, wideForward: 0.12, connector: 0.08 },
farPost: { wideForward: 0.26, striker: 0.22, secondStriker: 0.2, connector: 0.1 },
penaltySpot: { striker: 0.22, connector: 0.18, secondStriker: 0.18, wideForward: 0.12 },
edge: { connector: 0.28, pivot: 0.24, wideBack: 0.1 },
short: { wideBack: 0.26, wideForward: 0.24, connector: 0.18 },
};
return state.players
.filter((player) => player.team === teamId && player.id !== carrierId && !isGoalkeeper(player))
.map((player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const roleFit = slotRoleBonus[slot]?.[roleKey] ?? 0;
const runnerStrength = getAutoPilotRoleStrength(player, "runner");
const finisherStrength = getAutoPilotRoleStrength(player, "finisher");
const receiverStrength = getAutoPilotRoleStrength(player, "receiver");
const gap = distance(player.position, target);
const timeToTarget = computeTimeToCoverDistance(player, gap, target);
const score =
0.5 +
roleFit +
runnerStrength * 0.32 +
finisherStrength * 0.28 +
receiverStrength * 0.18 -
timeToTarget * 0.08 -
gap * 0.006;
return {
player,
roleKey,
gap,
timeToTarget,
score,
};
})
.sort((a, b) => b.score - a.score)[0] ?? null;
}

function getFreeKickDeliveryTarget(teamId, freeKickPoint, slot = "penaltySpot") {
const state = getState();
const sign = getAttackDirectionSign(teamId);
const sideSign = getWideSideSign(freeKickPoint) || 1;
const penaltySpot = getOpponentPenaltySpot(teamId);
const points = {
nearPost: {
x: penaltySpot.x + sign * 4.6,
y: pitch.width / 2 + sideSign * 5.3,
},
farPost: {
x: penaltySpot.x + sign * 4.1,
y: pitch.width / 2 - sideSign * 9.2,
},
penaltySpot: {
x: penaltySpot.x - sign * 0.7,
y: pitch.width / 2 - sideSign * 1.2,
},
edge: {
x: penaltySpot.x - sign * 8.6,
y: pitch.width / 2 - sideSign * 4.8,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 1.5);
}

function chooseFreeKickShortReceiver(teamId, carrier, startPoint, profile) {
const state = getState();
const formation = teams[teamId]?.formation;
return state.players
.filter((receiver) => receiver.team === teamId && receiver.id !== carrier.id && !isGoalkeeper(receiver))
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const roleKey = getOffensiveRoleKey(receiver, formation);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const roleFit =
roleKey === "connector"
? 0.38
: roleKey === "pivot"
? 0.34
: roleKey === "wideBack"
? 0.28
: roleKey === "wideForward"
? 0.16
: 0.08;
const score =
1.5 +
roleFit +
laneClarity * 0.74 +
profile.shortSupport * 0.52 +
getAutoPilotRoleStrength(receiver, "receiver") * 0.28 -
receiverPressure * 0.46 -
Math.abs(passDistance - 10.5) * 0.04 -
(forwardGain < -8 ? 0.18 : 0);
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
score,
};
})
.filter((candidate) => (
candidate.passDistance >= 4.5 &&
candidate.passDistance <= 18 &&
candidate.laneClarity >= 0.34 &&
candidate.receiverPressure <= 0.76
))
.sort((a, b) => b.score - a.score)[0] ?? null;
}

function getAutoPilotDribbleTarget(carrier, profile = getOffensiveAutopilotProfile(carrier.team, carrier.position)) {
const teamId = carrier.team;
const sign = getAttackDirectionSign(teamId);
const startPoint = getPlayerBallControlPoint(carrier);
const runwayCarry = getRunwayCarryTarget(carrier, startPoint, profile);
if (runwayCarry?.target) {
return runwayCarry.target;
}
const breakawayTarget = getBreakawayCarryTarget(carrier, startPoint, profile);
if (breakawayTarget) {
return breakawayTarget;
}
const openGrassCarry = getOpenGrassCarryContext(carrier, startPoint, profile);
if (openGrassCarry?.target) {
return openGrassCarry.target;
}
const ballDepth = getAttackingDepth(carrier.position, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
const isWide = isWideChannel(carrier.position);
const openForwardPoint = clampToPitch({
x: carrier.position.x + sign * 22,
y: lerp(carrier.position.y, pitch.width / 2, isWide ? 0.42 : 0.22),
}, 2.5);
const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, openForwardPoint));
const centralPull = forwardFacingSpaceTwo.active
? 0.34
: isWide ? lerp(0.24, 0.5, openSpaceScore) : pressure > 0.52 ? 0.12 : lerp(0.06, 0.2, openSpaceScore);
const tendency = getPlayerTendency(carrier, "dribble");
const carryDistance = clamp(
6.5 +
getAutoPilotRoleStrength(carrier, "dribbler") * 4.1 +
profile.dribbleBias * 2.2 +
tendency * 1.2 -
pressure * 3.4 +
openSpaceScore * 8.5 +
(forwardFacingSpaceTwo.active ? 4.2 : 0) +
(ballDepth < 35 ? 1.1 : 0),
4.5,
openSpaceScore >= 0.72 && pressure <= 0.36 ? 22 : 14.5
);
return clampToPitch({
x: carrier.position.x + sign * carryDistance,
y: lerp(carrier.position.y, pitch.width / 2, centralPull),
}, 2.5);
}

function getTeamSupportCountAroundPoint(teamId, point, excludedIds = new Set(), radius = 12) {
return state.players.reduce((count, player) => {
if (player.team !== teamId || excludedIds.has(player.id) || isGoalkeeper(player)) {
return count;
}
return count + (distance(player.position, point) <= radius ? 1 : 0);
}, 0);
}

function getGoalkeeperDistributionPressure(teamId, startPoint) {
const state = getState();
const opponents = state.players.filter((player) => player.team !== teamId && !isGoalkeeper(player));
const highPressers = opponents.filter((player) => distance(player.position, startPoint) <= 26).length;
const closePressers = opponents.filter((player) => distance(player.position, startPoint) <= 15).length;
const nearest = opponents.reduce(
(best, player) => Math.min(best, distance(player.position, startPoint)),
Infinity
);
return clamp(
(Number.isFinite(nearest) ? clamp((24 - nearest) / 18, 0, 1) : 0) * 0.42 +
clamp(highPressers / 4, 0, 1) * 0.34 +
clamp(closePressers / 2, 0, 1) * 0.24,
0,
1
);
}

function getGoalkeeperDirectReleaseTarget(teamId, runner, startPoint, profile) {
const state = getState();
const sideSign = getWideSideSign(runner) || getWideSideSign(startPoint) || 1;
const roleKey = getOffensiveRoleKey(runner, teams[teamId]?.formation);
const targetDepth =
roleKey === "striker"
? clamp(58 + profile.frontAhead + profile.routeOneBias * 16, 58, 88)
: clamp(54 + profile.frontAhead + profile.directness * 13, 52, 84);
return getDepthPoint(teamId, targetDepth, {
y: clamp(
roleKey === "wideForward"
? pitch.width / 2 + sideSign * 22
: pitch.width / 2 + sideSign * 7,
5,
pitch.width - 5
),
});
}

function buildAutoPilotGoalkeeperDistributionCandidate(carrier, startPoint, profile) {
const state = getState();
if (!isGoalkeeper(carrier) || state.restartPhase?.type === "kickoff") {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const gkPressure = getGoalkeeperDistributionPressure(teamId, startPoint);
const shouldInviteAndPlay =
profile.shortSupport >= 0.68 &&
profile.routeOneBias < 0.48 &&
gkPressure <= 0.72;
const shortOptions = state.players
.filter((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return roleKey === "rest" || roleKey === "wideBack" || roleKey === "pivot" || roleKey === "connector";
})
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const roleKey = getOffensiveRoleKey(receiver, formation);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const roleFit =
roleKey === "rest"
? 0.48
: roleKey === "pivot"
? 0.38
: roleKey === "wideBack"
? 0.28
: 0.16;
const score =
2.05 +
profile.shortSupport * 0.82 +
laneClarity * 1.16 +
getAutoPilotRoleStrength(receiver, "receiver") * 0.44 +
roleFit -
receiverPressure * 0.72 -
Math.abs(passDistance - 13.5) * 0.034 -
(passDistance > 24 ? 0.34 : 0) -
(gkPressure > 0.62 && receiverPressure > 0.56 ? 0.46 : 0);
return {
receiver,
roleKey,
target,
passDistance,
laneClarity,
receiverPressure,
score,
};
})
.filter((candidate) => (
candidate.passDistance >= 4.5 &&
candidate.passDistance <= 30 &&
candidate.laneClarity >= 0.32 &&
candidate.receiverPressure <= 0.84 &&
candidate.score >= 1.55
))
.sort((a, b) => b.score - a.score);
const directOptions =
profile.routeOneBias >= 0.42 || profile.directness >= 0.68 || gkPressure >= 0.58
? state.players
.filter((runner) => {
if (runner.team !== teamId || runner.id === carrier.id || isGoalkeeper(runner)) {
return false;
}
const roleKey = getOffensiveRoleKey(runner, formation);
return roleKey === "striker" || roleKey === "wideForward" || roleKey === "secondStriker";
})
.map((runner) => {
const target = getGoalkeeperDirectReleaseTarget(teamId, runner, startPoint, profile);
const passDistance = distance(startPoint, target);
const laneClarity = computePassLaneClarity(carrier, target);
const runnerDistance = distance(runner.position, target);
const runnerTime = computeTimeToCoverDistance(runner, runnerDistance, target);
const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / 1.65, 0, 1);
const supportNearTarget = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, runner.id]), 18);
const score =
1.42 +
profile.directness * 0.72 +
profile.routeOneBias * 0.92 +
gkPressure * 0.46 +
laneClarity * 0.72 +
timingFit * 0.54 +
getAutoPilotRoleStrength(runner, "runner") * 0.5 +
getAutoPilotRoleStrength(runner, "receiver") * 0.24 +
clamp(supportNearTarget, 0, 3) * 0.12 -
(passDistance > 58 && profile.routeOneBias < 0.72 ? 0.32 : 0);
return {
runner,
target,
passDistance,
laneClarity,
timingFit,
supportNearTarget,
score,
};
})
.filter((candidate) => (
candidate.passDistance >= 24 &&
candidate.passDistance <= 68 &&
candidate.laneClarity >= 0.24 &&
candidate.timingFit >= 0.1 &&
candidate.score >= 1.6
))
.sort((a, b) => b.score - a.score)
: [];
const shortChoice = shortOptions[0] ?? null;
const directChoice = directOptions[0] ?? null;
const playDirect =
directChoice &&
(!shouldInviteAndPlay ||
directChoice.score >= (shortChoice?.score ?? 0) + 0.24 ||
(gkPressure >= 0.74 && directChoice.score >= 1.75));
if (playDirect) {
return {
actionType: "pass",
target: directChoice.target,
receiverPlayerId: null,
passDistance: directChoice.passDistance,
laneClarity: directChoice.laneClarity,
receiverPressure: 0.42,
supportNearTarget: directChoice.supportNearTarget,
isLineBreak: true,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "gk-direct-release",
principleLabel: `GK release: ${getPlayerMagnetLabel(directChoice.runner)} attacks territory with support for the second ball`,
principleRunnerPlayerId: directChoice.runner.id,
score: directChoice.score,
firstTouchMode: "forward",
label: "gk release",
reason: "goalkeeper bypasses pressure into an attacking runner",
};
}
if (!shortChoice) {
return null;
}
return {
actionType: "pass",
target: shortChoice.target,
receiverPlayerId: shortChoice.receiver.id,
receiverRoleKey: shortChoice.roleKey,
passDistance: shortChoice.passDistance,
laneClarity: shortChoice.laneClarity,
receiverPressure: shortChoice.receiverPressure,
isLineBreak: false,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "gk-build-out",
principleLabel: `GK build-out: ${getPlayerMagnetLabel(shortChoice.receiver)} opens the first line`,
score: shortChoice.score + (shouldInviteAndPlay ? 0.28 : 0),
firstTouchMode: shortChoice.roleKey === "rest" || shortChoice.roleKey === "pivot" ? "inside" : "forward",
label: "gk build-out",
reason: "goalkeeper secures the first pass and sets the build-up shape",
};
}

function buildAutoPilotShotCandidate(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const goalTarget = getAutoPilotShotTarget(teamId, carrier);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const attackingDepth = getAttackingDepth(startPoint, teamId);
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const pressure = getPlayerPressureLoad(carrier, getPlayerBallControlPoint(carrier));
const finisherStrength = getAutoPilotRoleStrength(carrier, "finisher");
const shotWindow = getShotWindowProfile(carrier, startPoint, goalTarget);
const carryEndProduct = getAutoPilotCarryEndProductContext(carrier, startPoint, profile);
const laneClarity = shotWindow.laneClarity;
const angleQuality = shotWindow.angleQuality;
const blockRisk = shotWindow.blockRisk;
const insideBox = isInsideOpponentBox(startPoint, teamId);
const centralEdgeShot =
goalDistance <= 30.5 &&
centrality >= 0.42 &&
laneClarity >= 0.38 &&
angleQuality >= 0.22 &&
blockRisk <= 0.74 &&
pressure <= 0.78;
const finalThirdShot =
goalDistance <= 34.5 &&
attackingDepth >= 67 &&
centrality >= 0.18 &&
angleQuality >= 0.18 &&
blockRisk <= 0.78 &&
pressure <= 0.82;
const finisherRangeShot =
goalDistance <= 37 &&
attackingDepth >= 69 &&
centrality >= 0.22 &&
laneClarity >= 0.42 &&
angleQuality >= 0.2 &&
blockRisk <= 0.66 &&
pressure <= 0.72 &&
finisherStrength >= 0.76;
const nearGoalThreat =
goalDistance <= 30 &&
centrality >= 0.16 &&
angleQuality >= 0.16 &&
blockRisk <= 0.82 &&
pressure <= 0.84;
const clearBreakawayShot =
goalDistance <= 35 &&
attackingDepth >= 66 &&
laneClarity >= 0.34 &&
angleQuality >= 0.2 &&
blockRisk <= 0.74 &&
pressure <= 0.62 &&
(centrality >= 0.28 || finisherStrength >= 0.78);
const wideBoxAngle =
attackingDepth >= 78 &&
goalDistance <= 29 &&
centrality >= 0.1 &&
angleQuality >= 0.14 &&
pressure <= 0.82;
const finalThirdCarryShot =
attackingDepth >= 74 &&
goalDistance <= 36 &&
centrality >= 0.1 &&
angleQuality >= 0.15 &&
blockRisk <= 0.82 &&
pressure <= 0.86;
const carryEndProductShot =
carryEndProduct.active &&
carryEndProduct.finishWindow &&
goalDistance <= 36 &&
attackingDepth >= 66 &&
laneClarity >= 0.32 &&
angleQuality >= 0.14 &&
blockRisk <= 0.84 &&
pressure <= 0.84;
const runwayExitShot =
carryEndProduct.active &&
carryEndProduct.wasRunwayCarry &&
goalDistance <= 39 &&
attackingDepth >= 63 &&
laneClarity >= 0.3 &&
angleQuality >= 0.12 &&
blockRisk <= 0.88 &&
pressure <= 0.86;
const openShotWindow =
(insideBox && shotWindow.quality >= 0.22) ||
centralEdgeShot ||
finalThirdShot ||
finisherRangeShot ||
nearGoalThreat ||
clearBreakawayShot ||
wideBoxAngle ||
finalThirdCarryShot ||
carryEndProductShot ||
runwayExitShot ||
goalDistance <= 25.5 ||
(goalDistance <= 31 &&
attackingDepth >= 72 &&
laneClarity >= 0.58 &&
angleQuality >= 0.2 &&
blockRisk <= 0.68 &&
pressure <= 0.55 &&
finisherStrength >= 0.64);
if (!openShotWindow && goalDistance > 38 && !(finisherStrength >= 0.9 && attackingDepth >= 72)) {
return null;
}
const recentTeamSteps = getRecentPossessionSteps(teamId, 4);
const recentTeamShots = recentTeamSteps.filter((step) => step.actionType === "shot").length;
const lastTeamStep = recentTeamSteps[0] ?? null;
if (
!insideBox &&
goalDistance > 24 &&
(lastTeamStep?.actionType === "shot" || recentTeamShots >= 2)
) {
return null;
}
const distanceScore = clamp(1 - (goalDistance - 10) / 28, 0, 1);
const score =
1.18 +
distanceScore * 1.78 +
centrality * 0.82 +
finisherStrength * 1.34 +
(profile?.shootBias ?? 0.48) * 1.1 +
laneClarity * 0.85 -
blockRisk * 0.78 +
angleQuality * 0.62 +
shotWindow.goalkeeperOpenness * 0.48 +
shotWindow.quality * 0.66 -
pressure * 0.65 -
(attackingDepth < 62 ? 0.92 : attackingDepth < 68 ? 0.36 : 0) +
(insideBox ? 1.05 : 0) +
(centralEdgeShot ? 0.62 : 0) +
(finalThirdShot ? 0.42 : 0) +
(finisherRangeShot ? 0.36 : 0) +
(nearGoalThreat ? 0.7 : 0) +
(clearBreakawayShot ? 0.85 : 0) +
(wideBoxAngle ? 0.55 : 0) +
(finalThirdCarryShot ? 0.45 : 0) +
(carryEndProductShot ? 0.6 + carryEndProduct.endProductUrgency * 0.28 : 0) +
(runwayExitShot ? 0.62 + carryEndProduct.endProductUrgency * 0.32 : 0) +
(openShotWindow ? 0.42 : 0);
if (score < (openShotWindow ? 1.45 : 2.0)) {
return null;
}
return {
actionType: "shot",
target: goalTarget,
receiverPlayerId: null,
score,
goalDistance,
laneClarity,
blockRisk,
angleQuality,
goalkeeperOpenness: shotWindow.goalkeeperOpenness,
shotQuality: shotWindow.quality,
insideBox,
mustShoot:
(insideBox && shotWindow.quality >= 0.28) ||
nearGoalThreat ||
clearBreakawayShot ||
wideBoxAngle ||
(finalThirdCarryShot && (finisherStrength >= 0.62 || laneClarity >= 0.35)) ||
(carryEndProductShot && (shotWindow.quality >= 0.22 || finisherStrength >= 0.64 || goalDistance <= 29)) ||
(runwayExitShot && (shotWindow.quality >= 0.18 || finisherStrength >= 0.62 || goalDistance <= 31)) ||
(centralEdgeShot && goalDistance <= 31) ||
(finisherRangeShot && finisherStrength >= 0.84),
label: "shot",
reason: insideBox
? "box chance"
: runwayExitShot
? "runway carry has created a shooting window"
: carryEndProductShot
? "end product after carrying the ball"
: clearBreakawayShot
? "clear route to goal"
: centralEdgeShot || nearGoalThreat || finalThirdCarryShot
? "central shooting lane"
: wideBoxAngle
? "shooting angle in the box"
: "goal threat",
};
}

function buildAutoPilotKickoffCandidate(carrier, startPoint, profile) {
const state = getState();
if (state.restartPhase?.type !== "kickoff" || state.restartPhase.teamId !== carrier.team) {
return null;
}
const support = getPlayerById(state.restartPhase.supportPlayerId) ?? getPlayerById(getKickoffSupportId(carrier.team));
if (!support || support.id === carrier.id) {
return null;
}
const target = getPlayerBallControlPoint(support);
const passDistance = distance(startPoint, target);
if (passDistance < 2.5 || passDistance > 12) {
return null;
}
return {
actionType: "pass",
target,
receiverPlayerId: support.id,
receiverRoleKey: getOffensiveRoleKey(support, teams[carrier.team]?.formation),
passDistance,
forwardGain: (target.x - startPoint.x) * getAttackDirectionSign(carrier.team),
laneClarity: computePassLaneClarity(carrier, target),
receiverPressure: getPlayerPressureLoad(support, target),
isLineBreak: false,
isSwitch: false,
isBoxPass: false,
score: 4.6,
firstTouchMode: "back",
label: "kick-off reset",
reason: "play home first and let the possession identity start from a stable shape",
};
}

function getLastKickoffOpeningProfile(teamId) {
const state = getState();
const lastStep = state.sequence?.steps?.[state.sequence.steps.length - 1];
const openingKey =
lastStep?.restartPhase?.openingKey ??
state.restartPhase?.openingKey ??
null;
if (!openingKey || lastStep?.restartPhase?.teamId !== teamId) {
return kickoffOpeningProfiles["secure-backline"];
}
return kickoffOpeningProfiles[openingKey] ?? kickoffOpeningProfiles["secure-backline"];
}

function getKickoffOpeningCandidateFit(openingProfile, candidate, startPoint, teamId, profile) {
const state = getState();
if (!openingProfile || !candidate?.receiver) {
return {
score: 0,
label: "kick-off build-up reset",
reason: "drop the second touch into the back line before the chosen identity takes over",
firstTouchMode: profile.directness >= 0.68 ? "forward" : "inside",
};
}
const targetLane = getPitchLaneKey(candidate.target);
const startLane = getPitchLaneKey(startPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(startLane));
const isWeakSide =
getWideSideSign(candidate.target) &&
getWideSideSign(startPoint) &&
getWideSideSign(candidate.target) === -getWideSideSign(startPoint);
const forwardFit = clamp(candidate.forwardGain / 11, -0.2, 1);
const backwardFit = clamp((-candidate.forwardGain - 3) / 20, 0, 1);
const roleFit = openingProfile.receiverRoles.includes(candidate.roleKey) ? 0.72 : -0.38;
let score = roleFit;
if (openingProfile.key === "secure-backline") {
score += backwardFit * 0.46 + candidate.laneClarity * 0.2 - Math.max(candidate.forwardGain - 1, 0) * 0.08;
} else if (openingProfile.key === "pivot-turnout") {
score +=
(candidate.roleKey === "pivot" || candidate.roleKey === "connector" ? 0.38 : 0) +
clamp(Math.abs(candidate.forwardGain) <= 8 ? 0.22 : -0.12, -0.12, 0.22) +
candidate.laneClarity * 0.24 -
candidate.receiverPressure * 0.18;
} else if (openingProfile.key === "wide-release") {
score +=
(candidate.roleKey === "wideBack" || candidate.roleKey === "wideForward" ? 0.42 : 0) +
laneShift * 0.13 +
(targetLane.includes("Wide") ? 0.28 : 0) +
clamp(candidate.forwardGain / 8, -0.08, 0.22);
} else if (openingProfile.key === "weak-side-shift") {
score +=
(isWeakSide ? 0.44 : 0) +
laneShift * 0.16 +
candidate.laneClarity * 0.22 +
profile.switchBias * 0.18;
} else if (openingProfile.key === "vertical-second-touch") {
score +=
forwardFit * 0.58 +
(candidate.roleKey === "connector" || candidate.roleKey === "secondStriker" ? 0.34 : 0) +
profile.lineBreakBias * 0.22 -
candidate.receiverPressure * 0.2;
}
return {
score,
label: openingProfile.key,
reason: `${openingProfile.label} after the kick-off reset`,
firstTouchMode: openingProfile.firstTouchMode,
};
}

function buildAutoPilotPostKickoffResetCandidate(carrier, startPoint, profile) {
const state = getState();
if (!isLastStepKickoffResetForTeam(carrier.team)) {
return null;
}
const formation = teams[carrier.team]?.formation;
const openingProfile = getLastKickoffOpeningProfile(carrier.team);
const candidates = state.players
.filter((receiver) => {
if (receiver.team !== carrier.team || receiver.id === carrier.id) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return (
roleKey === "rest" ||
roleKey === "gk" ||
roleKey === "wideBack" ||
roleKey === "pivot" ||
openingProfile.receiverRoles.includes(roleKey)
);
})
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(carrier.team);
const roleKey = getOffensiveRoleKey(receiver, formation);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const roleBase =
roleKey === "rest"
? 1.45
: roleKey === "gk"
? 0.92
: roleKey === "wideBack"
? 0.48
: 0.24;
const backwardFit = clamp((-forwardGain - 4) / 22, 0, 1);
const centralFit = 1 - Math.abs(target.y - pitch.width / 2) / (pitch.width / 2);
const styleFit =
profile.directness < 0.45
? roleKey === "rest" || roleKey === "gk" ? 0.42 : 0.14
: roleKey === "rest" ? 0.32 : 0.05;
const openingFit = getKickoffOpeningCandidateFit(
openingProfile,
{
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
},
startPoint,
carrier.team,
profile
);
const score =
3.55 +
roleBase +
openingFit.score +
laneClarity * 0.62 +
backwardFit * 0.88 +
centralFit * 0.22 +
profile.recycleWindow * 0.46 +
styleFit -
receiverPressure * 0.34 -
Math.abs(passDistance - 24) * 0.014;
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
openingFit,
score,
};
})
.filter((candidate) => {
if (candidate.passDistance < 7 || candidate.passDistance > 38) {
return false;
}
if (openingProfile.key === "vertical-second-touch") {
return candidate.forwardGain <= 10 && candidate.receiverPressure <= 0.72;
}
if (openingProfile.key === "wide-release" || openingProfile.key === "weak-side-shift") {
return candidate.forwardGain <= 6 || candidate.roleKey === "wideBack";
}
return candidate.forwardGain <= 2 || candidate.roleKey === "gk";
})
.sort((a, b) => b.score - a.score);
const selected = chooseScoredCandidateWithVariation(candidates, profile, {
tolerance: 0.9,
temperature: 0.34,
carrier,
startPoint,
});
if (!selected) {
return null;
}
return {
actionType: "pass",
target: selected.target,
receiverPlayerId: selected.receiver.id,
receiverRoleKey: selected.roleKey,
passDistance: selected.passDistance,
forwardGain: selected.forwardGain,
laneClarity: selected.laneClarity,
receiverPressure: selected.receiverPressure,
isLineBreak: false,
isSwitch: false,
isBoxPass: false,
score: selected.score,
firstTouchMode: selected.openingFit.firstTouchMode,
label: selected.openingFit.label,
reason: selected.openingFit.reason,
principleLabels: [selected.openingFit.reason],
};
}

function buildAutoPilotCornerCandidate(carrier, startPoint, profile) {
const state = getState();
if (state.restartPhase?.type !== "corner" || state.restartPhase.teamId !== carrier.team) {
return null;
}
const teamId = carrier.team;
const sideY = Number.isFinite(state.restartPhase.sideY) ? state.restartPhase.sideY : startPoint.y;
const deliverySlots = [
{
key: "near-post-corner",
slot: "nearPost",
label: "near-post corner",
styleFit: 0.42 + profile.directness * 0.18 + profile.crossBias * 0.28,
},
{
key: "far-post-corner",
slot: "farPost",
label: "far-post corner",
styleFit: 0.38 + profile.crossBias * 0.42 + profile.risk * 0.12,
},
{
key: "penalty-spot-corner",
slot: "penaltySpot",
label: "penalty-spot corner",
styleFit: 0.52 + profile.shortSupport * 0.12 + profile.deliveryBias * 0.22,
},
{
key: "edge-corner",
slot: "edge",
label: "edge-box corner",
styleFit: 0.28 + profile.shortSupport * 0.36 + (profile.directness < 0.48 ? 0.16 : 0),
},
];
const options = deliverySlots
.map((option) => {
const target = getCornerDeliveryTarget(teamId, sideY, option.slot);
const runner = chooseCornerDeliveryRunner(teamId, target, carrier.id, option.slot);
const passDistance = distance(startPoint, target);
const profileForPass = resolveBallActionProfile("pass", startPoint, target, carrier, null);
const passTime = passDistance / Math.max(profileForPass.averageSpeed, 0.01);
const timingFit = runner
? clamp(1 - Math.abs(runner.timeToTarget - passTime) / 2.35, 0, 1)
: 0.35;
const targetThreat = getPitchThreatProfile(target, teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const runnerScore = runner
? runner.score + getAutoPilotRoleStrength(runner.player, "finisher") * 0.24
: 0;
const score =
2.15 +
option.styleFit +
laneClarity * 0.42 +
timingFit * 0.62 +
targetThreat.box * 0.42 +
runnerScore * 0.44 -
Math.abs(passDistance - 23) * 0.008;
return {
...option,
target,
runner,
passDistance,
laneClarity,
timingFit,
score,
};
})
.sort((a, b) => b.score - a.score);
const selected = options[0];
if (!selected) {
return null;
}
return {
actionType: "pass",
target: selected.target,
receiverPlayerId: null,
passDistance: selected.passDistance,
laneClarity: selected.laneClarity,
receiverPressure: 0.54,
supportNearTarget: getTeamSupportCountAroundPoint(
teamId,
selected.target,
new Set([carrier.id, selected.runner?.player.id].filter(Boolean)),
13
),
isLineBreak: false,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: true,
isPrinciplePattern: true,
principleKey: selected.key,
principleLabel: `Corner routine: ${selected.label}${selected.runner ? ` for ${getPlayerMagnetLabel(selected.runner.player)}` : ""}`,
principleRunnerPlayerId: selected.runner?.player.id ?? null,
score: selected.score,
firstTouchMode: "kill",
label: selected.label,
reason: `${profile.styleLabel.toLowerCase()} set-piece delivery attacks ${selected.slot.replace(/([A-Z])/g, " $1").toLowerCase()}`,
};
}

function buildAutoPilotThrowInCandidate(carrier, startPoint, profile) {
const state = getState();
if (state.restartPhase?.type !== "throwIn" || state.restartPhase.teamId !== carrier.team) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const throwPoint = state.restartPhase.point ?? startPoint;
const sideSign = getWideSideSign(throwPoint) || (throwPoint.y <= pitch.width / 2 ? -1 : 1);
const insideY = clamp(throwPoint.y - sideSign * 8, 4, pitch.width - 4);
const downLinePoint = clampToPitch({
x: throwPoint.x + getAttackDirectionSign(teamId) * 11,
y: clamp(throwPoint.y - sideSign * 2.6, 2.8, pitch.width - 2.8),
}, 2.2);
const receiverOptions = state.players
.filter((receiver) => receiver.team === teamId && receiver.id !== carrier.id && !isGoalkeeper(receiver))
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const roleKey = getOffensiveRoleKey(receiver, formation);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const sideFit = clamp(1 - Math.abs(target.y - insideY) / 18, 0, 1);
const roleFit =
roleKey === "wideBack"
? 0.38
: roleKey === "wideForward"
? 0.34
: roleKey === "connector" || roleKey === "pivot"
? 0.28
: roleKey === "striker"
? 0.16
: 0.08;
const score =
1.7 +
sideFit * 0.52 +
roleFit +
laneClarity * 0.74 +
getAutoPilotRoleStrength(receiver, "receiver") * 0.36 +
profile.shortSupport * 0.28 +
clamp(forwardGain / 14, -0.25, 0.42) -
receiverPressure * 0.58 -
Math.abs(passDistance - 9.5) * 0.035;
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
score,
};
})
.filter((candidate) => (
candidate.passDistance >= 3.5 &&
candidate.passDistance <= 18.5 &&
candidate.receiverPressure <= 0.88 &&
candidate.laneClarity >= 0.22
))
.sort((a, b) => b.score - a.score);
const bestReceiver = receiverOptions[0];
if (bestReceiver) {
return {
actionType: "pass",
target: bestReceiver.target,
receiverPlayerId: bestReceiver.receiver.id,
receiverRoleKey: bestReceiver.roleKey,
passDistance: bestReceiver.passDistance,
forwardGain: bestReceiver.forwardGain,
laneClarity: bestReceiver.laneClarity,
receiverPressure: bestReceiver.receiverPressure,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, bestReceiver.target, new Set([carrier.id, bestReceiver.receiver.id]), 10),
isLineBreak: bestReceiver.forwardGain >= 6,
isSwitch: false,
isSidewaysPass: Math.abs(bestReceiver.forwardGain) < 4,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "throw-in-support",
principleLabel: `Throw-in: ${getPlayerMagnetLabel(bestReceiver.receiver)} shows inside the touchline`,
score: bestReceiver.score,
firstTouchMode: profile.directness >= 0.62 ? "forward" : "inside",
label: "throw-in support",
reason: "restart through the nearest safe support angle",
};
}
return {
actionType: "pass",
target: downLinePoint,
receiverPlayerId: null,
passDistance: distance(startPoint, downLinePoint),
laneClarity: computePassLaneClarity(carrier, downLinePoint),
receiverPressure: 0.52,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, downLinePoint, new Set([carrier.id]), 12),
isLineBreak: true,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "throw-in-down-line",
principleLabel: "Throw-in: play down the line when inside support is blocked",
score: 1.65 + profile.directness * 0.42,
firstTouchMode: "forward",
label: "throw-in down line",
reason: "blocked throw-in support releases the ball down the touchline",
};
}

function buildAutoPilotPenaltyCandidate(carrier, startPoint, profile) {
const state = getState();
if (state.restartPhase?.type !== "penalty" || state.restartPhase.teamId !== carrier.team) {
return null;
}
const teamId = carrier.team;
const target = getAutoPilotShotTarget(teamId, carrier);
const finisherStrength = getAutoPilotRoleStrength(carrier, "finisher");
return {
actionType: "shot",
target,
receiverPlayerId: null,
score: 6.8 + finisherStrength * 0.42 + profile.shootBias * 0.18,
goalDistance: distance(startPoint, getOpponentGoalCenter(teamId)),
laneClarity: 0.98,
blockRisk: 0,
angleQuality: 0.9,
goalkeeperOpenness: getGoalkeeperTargetOpenness(teamId, target),
shotQuality: clamp(0.72 + finisherStrength * 0.18, 0.72, 0.94),
insideBox: true,
mustShoot: true,
isPrinciplePattern: true,
principleKey: "penalty-execution",
principleLabel: `Penalty: ${getPlayerMagnetLabel(carrier)} isolates the finish`,
label: "penalty",
reason: "penalty execution",
};
}

function buildAutoPilotFreeKickCandidate(carrier, startPoint, profile) {
const state = getState();
if (state.restartPhase?.type !== "freeKick" || state.restartPhase.teamId !== carrier.team) {
return null;
}
const teamId = carrier.team;
const freeKickPoint = state.restartPhase.point ?? startPoint;
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const attackingDepth = getAttackingDepth(startPoint, teamId);
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const angleQuality = getShotAngleQuality(startPoint, teamId);
const finisherStrength = getAutoPilotRoleStrength(carrier, "finisher");
const creatorStrength = getAutoPilotRoleStrength(carrier, "creator");
const directShotViable =
goalDistance <= 30 &&
attackingDepth >= 70 &&
centrality >= 0.2 &&
angleQuality >= 0.12;
const candidates = [];
if (directShotViable) {
const target = getAutoPilotShotTarget(teamId, carrier);
const shotWindow = getShotWindowProfile(carrier, startPoint, target);
candidates.push({
actionType: "shot",
target,
receiverPlayerId: null,
score:
2.35 +
profile.shootBias * 0.9 +
finisherStrength * 0.72 +
shotWindow.quality * 0.64 +
angleQuality * 0.38 +
centrality * 0.22 -
Math.max(goalDistance - 23, 0) * 0.05,
goalDistance,
laneClarity: shotWindow.laneClarity,
blockRisk: shotWindow.blockRisk,
angleQuality,
goalkeeperOpenness: shotWindow.goalkeeperOpenness,
shotQuality: shotWindow.quality,
insideBox: false,
mustShoot: shotWindow.quality >= 0.58 || goalDistance <= 23,
isPrinciplePattern: true,
principleKey: "direct-free-kick",
principleLabel: `Free-kick: ${getPlayerMagnetLabel(carrier)} can shoot directly`,
label: "direct free-kick",
reason: "direct free-kick shooting window",
});
}
if (attackingDepth >= 56 && goalDistance <= 48) {
["penaltySpot", "farPost", "nearPost", "edge"].forEach((slot) => {
const target = getFreeKickDeliveryTarget(teamId, freeKickPoint, slot);
const runner = chooseCornerDeliveryRunner(teamId, target, carrier.id, slot);
const passDistance = distance(startPoint, target);
const profileForPass = resolveBallActionProfile("pass", startPoint, target, carrier, null);
const passTime = passDistance / Math.max(profileForPass.averageSpeed, 0.01);
const timingFit = runner
? clamp(1 - Math.abs(runner.timeToTarget - passTime) / 2.45, 0, 1)
: 0.34;
const targetThreat = getPitchThreatProfile(target, teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const slotFit =
slot === "farPost"
? profile.crossBias * 0.36 + profile.risk * 0.12
: slot === "edge"
? profile.shortSupport * 0.32
: profile.deliveryBias * 0.34 + profile.directness * 0.12;
const score =
1.92 +
slotFit +
creatorStrength * 0.34 +
laneClarity * 0.36 +
timingFit * 0.58 +
targetThreat.box * 0.4 +
(runner ? runner.score * 0.34 : 0) -
Math.abs(passDistance - 24) * 0.01;
candidates.push({
actionType: "pass",
target,
receiverPlayerId: null,
passDistance,
laneClarity,
receiverPressure: 0.46,
supportNearTarget: getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, runner?.player.id].filter(Boolean)),
13
),
isLineBreak: false,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: true,
isPrinciplePattern: true,
principleKey: `free-kick-${slot}`,
principleLabel: `Free-kick delivery: ${slot.replace(/([A-Z])/g, " $1").toLowerCase()}${runner ? ` for ${getPlayerMagnetLabel(runner.player)}` : ""}`,
principleRunnerPlayerId: runner?.player.id ?? null,
score,
firstTouchMode: "kill",
label: slot === "edge" ? "free-kick second ball" : "free-kick delivery",
reason: `${profile.styleLabel.toLowerCase()} free-kick delivery attacks ${slot.replace(/([A-Z])/g, " $1").toLowerCase()}`,
});
});
}
const shortReceiver = chooseFreeKickShortReceiver(teamId, carrier, startPoint, profile);
if (shortReceiver) {
candidates.push({
actionType: "pass",
target: shortReceiver.target,
receiverPlayerId: shortReceiver.receiver.id,
receiverRoleKey: shortReceiver.roleKey,
passDistance: shortReceiver.passDistance,
forwardGain: shortReceiver.forwardGain,
laneClarity: shortReceiver.laneClarity,
receiverPressure: shortReceiver.receiverPressure,
isLineBreak: false,
isSwitch: false,
isSidewaysPass: Math.abs(shortReceiver.forwardGain) < 4,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "short-free-kick",
principleLabel: `Free-kick restart: ${getPlayerMagnetLabel(shortReceiver.receiver)} receives short`,
score: shortReceiver.score + (profile.shortSupport >= 0.72 || goalDistance > 42 ? 0.52 : 0),
firstTouchMode: profile.firstTouchForwardBias >= 0.6 ? "forward" : "inside",
label: "short free-kick",
reason: "short free-kick to restart possession",
});
}
if (!candidates.length) {
return null;
}
candidates.sort((a, b) => b.score - a.score);
return candidates[0];
}

function buildAutoPilotRegainReleaseCandidate(carrier, startPoint, profile) {
const state = getState();
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
if (!regain.active || regain.freshness < 0.12) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const directAllowed =
regain.directStyle ||
profile.directness >= 0.62 ||
(regain.forwardOpenSpace >= 0.66 && regain.pressure <= 0.46);
const shouldSecureFirst =
regain.pressure >= 0.5 ||
(!directAllowed && profile.shortSupport >= 0.54) ||
(regain.localSupport >= 2 && profile.directness < 0.58);
const secureCandidates = state.players
.filter((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return roleKey === "pivot" || roleKey === "connector" || roleKey === "wideBack" || roleKey === "rest";
})
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const roleKey = getOffensiveRoleKey(receiver, formation);
const roleFit =
roleKey === "pivot"
? 0.42
: roleKey === "connector"
? 0.36
: roleKey === "wideBack"
? 0.22
: 0.14;
const score =
1.72 +
laneClarity * 1.08 +
getAutoPilotRoleStrength(receiver, "receiver") * 0.46 +
regain.secureIntent * regain.freshness * 0.74 +
roleFit +
(forwardGain >= -4 && forwardGain <= 7 ? 0.22 : 0) -
receiverPressure * 0.54 -
Math.abs(passDistance - 13) * 0.025 -
(forwardGain < -8 && regain.pressure <= 0.38 ? 0.32 : 0);
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
score,
};
})
.filter((candidate) => (
candidate.passDistance >= 5 &&
candidate.passDistance <= 24 &&
candidate.forwardGain >= -11 &&
candidate.laneClarity >= 0.34 &&
candidate.receiverPressure <= 0.82 &&
candidate.score >= 1.55
))
.sort((a, b) => b.score - a.score);
const directCandidates = directAllowed
? state.players
.filter((runner) => {
if (runner.team !== teamId || runner.id === carrier.id || isGoalkeeper(runner)) {
return false;
}
const roleKey = getOffensiveRoleKey(runner, formation);
return ["striker", "wideForward", "secondStriker", "connector"].includes(roleKey) &&
!isPassReceiverOffside(runner, startPoint);
})
.map((runner) => {
const roleKey = getOffensiveRoleKey(runner, formation);
const sideSign = getWideSideSign(runner) || getWideSideSign(startPoint) || 1;
const target = getHighValueAttackTarget(
teamId,
startPoint,
roleKey === "wideForward" ? "halfSpaceRun" : "goldenRun",
sideSign
);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const targetThreat = getPitchThreatProfile(target, teamId);
const runnerDistance = distance(runner.position, target);
const runnerTime = computeTimeToCoverDistance(runner, runnerDistance, target);
const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / 1.45, 0, 1);
const supportNearTarget = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, runner.id]), 17);
const score =
1.48 +
regain.counterIntent * regain.freshness * 0.96 +
regain.forwardOpenSpace * 0.4 +
targetThreat.value * 0.88 +
laneClarity * 0.82 +
timingFit * 0.46 +
getAutoPilotRoleStrength(runner, "runner") * 0.42 +
clamp(forwardGain / 24, 0, 0.8) +
clamp(supportNearTarget, 0, 3) * 0.08 -
regain.pressure * 0.22 -
(passDistance > 32 && profile.routeOneBias < 0.35 ? 0.36 : 0);
return {
runner,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
targetThreat,
supportNearTarget,
score,
timingFit,
};
})
.filter((candidate) => (
candidate.passDistance >= 10 &&
candidate.passDistance <= 36 &&
candidate.forwardGain >= 6 &&
candidate.laneClarity >= 0.38 &&
candidate.timingFit >= 0.12 &&
candidate.targetThreat.value >= 0.34 &&
candidate.score >= 1.7
))
.sort((a, b) => b.score - a.score)
: [];
const secure = secureCandidates[0] ?? null;
const direct = directCandidates[0] ?? null;
const selectedDirect =
direct &&
(!shouldSecureFirst || direct.score >= (secure?.score ?? 0) + 0.28 || regain.forwardOpenSpace >= 0.76);
if (selectedDirect) {
return {
actionType: "pass",
target: direct.target,
receiverPlayerId: null,
receiverRoleKey: direct.roleKey,
passDistance: direct.passDistance,
forwardGain: direct.forwardGain,
laneClarity: direct.laneClarity,
receiverPressure: 0.42,
supportNearTarget: direct.supportNearTarget,
isLineBreak: true,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: direct.targetThreat.box >= 0.28,
isPrinciplePattern: true,
principleKey: "regain-forward-release",
principleLabel: `Regain release: ${getPlayerMagnetLabel(direct.runner)} attacks open transition space`,
principleRunnerPlayerId: direct.runner.id,
score: direct.score,
firstTouchMode: "forward",
label: "regain release",
reason: "fresh regain with open forward space",
};
}
if (!secure) {
return null;
}
return {
actionType: "pass",
target: secure.target,
receiverPlayerId: secure.receiver.id,
receiverRoleKey: secure.roleKey,
passDistance: secure.passDistance,
forwardGain: secure.forwardGain,
laneClarity: secure.laneClarity,
receiverPressure: secure.receiverPressure,
isLineBreak: false,
isSwitch: false,
isSidewaysPass: Math.abs(secure.forwardGain) < 4 && Math.abs(secure.target.y - startPoint.y) >= 6.5,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "secure-regain",
principleLabel: `Secure first pass: ${getPlayerMagnetLabel(secure.receiver)} supports the regain`,
score: secure.score + (shouldSecureFirst ? 0.34 : 0),
firstTouchMode: secure.forwardGain >= 2 && profile.firstTouchForwardBias >= 0.62 ? "forward" : "inside",
label: "secure regain",
reason: "fresh regain needs a stable first pass before the next attacking action",
};
}

function getPressedRegainExitVector(carrier, startPoint) {
const state = getState();
if (!carrier || !startPoint) {
return { x: getAttackDirectionSign(carrier?.team), y: 0 };
}
let pressureX = 0;
let pressureY = 0;
let pressureWeight = 0;
state.players.forEach((player) => {
if (player.team === carrier.team) {
return;
}
const gap = distance(player.position, startPoint);
if (gap > 10.5) {
return;
}
const weight = clamp(1 - gap / 10.5, 0, 1) ** 1.25;
pressureX += (player.position.x - startPoint.x) * weight;
pressureY += (player.position.y - startPoint.y) * weight;
pressureWeight += weight;
});
const attackSign = getAttackDirectionSign(carrier.team);
const touchlineSide =
Math.sign(startPoint.y - pitch.width / 2) ||
(startPoint.y <= pitch.width / 2 ? -1 : 1);
if (pressureWeight <= 0.01) {
return normalize(
startPoint,
{
x: startPoint.x + attackSign * 8,
y: clamp(startPoint.y + touchlineSide * 6, 3, pitch.width - 3),
}
);
}
const awayFromPressure = normalize(
{
x: startPoint.x + pressureX / pressureWeight,
y: startPoint.y + pressureY / pressureWeight,
},
startPoint
);
const forwardVector = { x: attackSign, y: 0 };
const insideTarget = {
x: startPoint.x + attackSign * 5,
y: pitch.width / 2,
};
const insideVector = normalize(startPoint, insideTarget);
const combined = {
x: awayFromPressure.x * 0.68 + forwardVector.x * 0.2 + insideVector.x * 0.12,
y: awayFromPressure.y * 0.68 + insideVector.y * 0.18 + touchlineSide * 0.08,
};
const length = Math.hypot(combined.x, combined.y) || 1;
return {
x: combined.x / length,
y: combined.y / length,
};
}

function buildAutoPilotPressedRegainExitCandidate(carrier, startPoint, profile) {
const state = getState();
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
if (
!carrier ||
!startPoint ||
!regain.active ||
regain.freshness < 0.28 ||
regain.pressure < 0.5 ||
isInsideOwnBox(startPoint, carrier.team)
) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const attackSign = getAttackDirectionSign(teamId);
const exitVector = getPressedRegainExitVector(carrier, startPoint);
const directStyle = isTransitionAttackStyle(profile.styleKey);
const candidates = [];
state.players
.filter((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return roleKey === "pivot" || roleKey === "connector" || roleKey === "wideBack" || roleKey === "rest";
})
.forEach((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * attackSign;
const passVector = normalize(startPoint, target);
const escapeFit = clamp((passVector.x * exitVector.x + passVector.y * exitVector.y + 1) / 2, 0, 1);
const lateralEscape = Math.abs(target.y - startPoint.y);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const targetPressure = getOpponentPressureAtPoint(teamId, target, 9);
const roleKey = getOffensiveRoleKey(receiver, formation);
const roleFit =
roleKey === "pivot"
? 0.38
: roleKey === "connector"
? 0.34
: roleKey === "wideBack"
? 0.24
: 0.14;
const distanceFit = clamp(1 - Math.abs(passDistance - 12.5) / 13, 0, 1);
const score =
2.02 +
regain.freshness * 0.34 +
regain.secureIntent * 0.46 +
laneClarity * 0.98 +
escapeFit * 0.62 +
distanceFit * 0.26 +
roleFit +
getAutoPilotRoleStrength(receiver, "receiver") * 0.32 +
clamp(lateralEscape / 14, 0, 0.24) -
receiverPressure * 0.52 -
targetPressure * 0.38 -
(forwardGain < -8 && directStyle ? 0.34 : 0) -
(passDistance > 22 ? 0.2 : 0);
if (
passDistance >= 5.5 &&
passDistance <= 24 &&
forwardGain >= -12 &&
forwardGain <= 13 &&
laneClarity >= 0.34 &&
receiverPressure <= 0.82 &&
targetPressure <= 0.78 &&
escapeFit >= 0.36 &&
score >= 1.68
) {
candidates.push({
actionType: "pass",
target,
receiverPlayerId: receiver.id,
receiverRoleKey: roleKey,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, receiver.id]), 12),
isLineBreak: false,
isSwitch: false,
isSidewaysPass: Math.abs(forwardGain) < 4 && lateralEscape >= 6,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "pressed-regain-exit-pass",
principleLabel: `Pressed regain exit: ${getPlayerMagnetLabel(receiver)} opens the first safe angle`,
score,
firstTouchMode: forwardGain >= 2 && profile.firstTouchForwardBias >= 0.58 ? "forward" : "inside",
label: "pressed regain exit",
reason: "fresh ball win under pressure; first pass exits the counter-press before building",
});
}
});
const carryDistance = clamp(4.8 + regain.pressure * 4.2 + profile.carryBias * 1.8, 4.2, 10.2);
const carryTarget = clampToPitch({
x: startPoint.x + exitVector.x * carryDistance + attackSign * clamp(profile.directness * 2.2, 0.4, 2.4),
y: startPoint.y + exitVector.y * carryDistance,
}, 2);
const carryForwardGain = (carryTarget.x - startPoint.x) * attackSign;
const carryTargetPressure = getOpponentPressureAtPoint(teamId, carryTarget, 8);
const carryOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, carryTarget));
const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
const carryScore =
1.82 +
regain.freshness * 0.28 +
regain.pressure * 0.32 +
carryOpenSpace * 0.7 +
dribbleStrength * 0.42 +
profile.carryBias * 0.28 +
clamp(carryForwardGain / 10, -0.08, 0.28) -
carryTargetPressure * 0.56;
if (carryOpenSpace >= 0.42 && carryTargetPressure <= 0.68 && carryScore >= 1.62) {
candidates.push({
actionType: "dribble",
target: carryTarget,
receiverPlayerId: null,
score: carryScore,
isOpenGrassCarry: false,
isRunwayCarry: false,
isPrinciplePattern: true,
principleKey: "pressed-regain-carry-out",
principleLabel: `Pressed regain exit: ${getPlayerMagnetLabel(carrier)} carries first touch away from pressure`,
principleLabels: ["Exit counter-press with first touch"],
label: "pressed regain carry",
reason: "fresh ball win under pressure; first touch carries out of the counter-press",
});
}
const preferredPass = candidates
.filter((candidate) => candidate.actionType === "pass")
.sort((a, b) => b.score - a.score)[0] ?? null;
return chooseScoredCandidateWithVariation(candidates, profile, {
tolerance: 0.3,
temperature: 0.12,
preferredCandidate: preferredPass,
carrier,
startPoint,
});
}

function buildAutoPilotDangerZoneEscapeCandidate(carrier, startPoint, profile) {
const state = getState();
if (!carrier || !startPoint || isGoalkeeper(carrier)) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
const ownGoalDistance = getDistanceFromOwnGoal(teamId, startPoint);
const insideOwnBox = isInsideOwnBox(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const dangerActive =
insideOwnBox ||
ownGoalDistance <= 22 ||
(ownGoalDistance <= 31 && pressure >= 0.46) ||
(regain.active && regain.freshness >= 0.18 && ownGoalDistance <= 36);
if (!dangerActive) {
return null;
}
const attackSign = getAttackDirectionSign(teamId);
const sideSign = getWideSideSign(startPoint) || (startPoint.y <= pitch.width / 2 ? -1 : 1);
const directness = profile.directness ?? 0.5;
const shortSupport = profile.shortSupport ?? 0.5;
const boxStress = insideOwnBox ? 1 : clamp((36 - ownGoalDistance) / 22, 0, 1);
const clearanceDistance = clamp(
24 + pressure * 12 + directness * 14 + boxStress * 10,
24,
58
);
const clearanceTarget = clampToPitch(
{
x: startPoint.x + attackSign * clearanceDistance,
y: pitch.width / 2 + sideSign * clamp(21 + pressure * 8 + boxStress * 4, 20, 31),
},
2
);
const clearancePassDistance = distance(startPoint, clearanceTarget);
const clearanceForwardGain = (clearanceTarget.x - startPoint.x) * attackSign;
const clearanceLaneClarity = computePassLaneClarity(carrier, clearanceTarget);
const clearanceScore =
2.12 +
boxStress * 0.68 +
pressure * 0.5 +
directness * 0.36 +
clearanceLaneClarity * 0.58 -
shortSupport * 0.14;
const clearanceCandidate = {
actionType: "pass",
target: clearanceTarget,
receiverPlayerId: null,
receiverRoleKey: null,
passDistance: clearancePassDistance,
forwardGain: clearanceForwardGain,
laneClarity: clearanceLaneClarity,
receiverPressure: 0.38,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, clearanceTarget, new Set([carrier.id]), 18),
isLineBreak: clearanceForwardGain >= 18,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "danger-zone-clearance",
principleLabel: "Danger-zone escape: clear first contact away from goal",
score: clearanceScore,
firstTouchMode: "forward",
label: "danger clearance",
reason: "ball recovered near own goal; first priority is to move danger away from the box",
};
const outletCandidates = state.players
.filter((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return roleKey === "wideBack" || roleKey === "pivot" || roleKey === "connector" || roleKey === "rest";
})
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * attackSign;
const lateralEscape = Math.abs(target.y - startPoint.y);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const roleKey = getOffensiveRoleKey(receiver, formation);
const receiverStrength = getAutoPilotRoleStrength(receiver, "receiver");
const roleFit =
roleKey === "wideBack"
? 0.38
: roleKey === "pivot"
? 0.3
: roleKey === "connector"
? 0.2
: 0.12;
const score =
1.88 +
laneClarity * 1.08 +
receiverStrength * 0.44 +
roleFit +
shortSupport * 0.36 +
clamp(lateralEscape / 18, 0, 0.26) +
(forwardGain >= -3 ? 0.14 : 0) -
receiverPressure * 0.66 -
pressure * 0.12 -
Math.abs(passDistance - 13) * 0.025 -
(forwardGain < -8 ? 0.36 : 0);
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
score,
};
})
.filter((candidate) => (
candidate.passDistance >= 5 &&
candidate.passDistance <= 25 &&
candidate.forwardGain >= -10 &&
candidate.laneClarity >= 0.3 &&
candidate.receiverPressure <= 0.82 &&
candidate.score >= 1.48
))
.sort((a, b) => b.score - a.score);
const outlet = outletCandidates[0] ?? null;
const outletCandidate = outlet
? {
actionType: "pass",
target: outlet.target,
receiverPlayerId: outlet.receiver.id,
receiverRoleKey: outlet.roleKey,
passDistance: outlet.passDistance,
forwardGain: outlet.forwardGain,
laneClarity: outlet.laneClarity,
receiverPressure: outlet.receiverPressure,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, outlet.target, new Set([carrier.id, outlet.receiver.id]), 13),
isLineBreak: false,
isSwitch: false,
isSidewaysPass: Math.abs(outlet.forwardGain) < 4 && Math.abs(outlet.target.y - startPoint.y) >= 6,
isBoxPass: false,
isPrinciplePattern: true,
principleKey: "danger-zone-wide-outlet",
principleLabel: `Danger-zone escape: ${getPlayerMagnetLabel(outlet.receiver)} is the first safe outlet`,
score: outlet.score + (boxStress >= 0.58 && pressure < 0.64 ? 0.2 : 0),
firstTouchMode: outlet.forwardGain >= 2 ? "forward" : "inside",
label: "danger outlet",
reason: "ball recovered near own goal; first pass finds a safe support outside the pressure",
}
: null;
if (insideOwnBox && pressure >= 0.62) {
return clearanceCandidate;
}
return chooseScoredCandidateWithVariation(
[clearanceCandidate, outletCandidate],
profile,
{
tolerance: 0.24,
temperature: 0.12,
preferredCandidate: outletCandidate && outletCandidate.score >= clearanceCandidate.score - 0.12
? outletCandidate
: clearanceCandidate,
carrier,
startPoint,
}
);
}

function buildAutoPilotBoxDeliveryCandidate(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const attackingDepth = getAttackingDepth(startPoint, teamId);
const startsWide = isWideChannel(startPoint);
if (!startsWide || attackingDepth < 63) {
return null;
}
const isCutback = isBylineZone(startPoint, teamId);
const target = getAutoPilotBoxTarget(teamId, carrier, isCutback ? "cutback" : "cross");
const creatorStrength = Math.max(
getAutoPilotRoleStrength(carrier, "crosser"),
getAutoPilotRoleStrength(carrier, "creator")
);
const runners = state.players.filter((player) => {
if (player.team !== teamId || player.id === carrier.id) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
return roleKey === "striker" || roleKey === "secondStriker" || roleKey === "wideForward" || roleKey === "connector";
});
const runnerThreat = runners.reduce(
(best, player) => Math.max(best, getAutoPilotRoleStrength(player, "runner") + getAutoPilotRoleStrength(player, "finisher") * 0.55),
0.3
);
const boxSupportCount = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id]), 20);
const laneClarity = computePassLaneClarity(carrier, target);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const hopefulDelivery =
!isCutback &&
boxSupportCount <= 1 &&
profile.crossBias < 0.74 &&
laneClarity < 0.66;
const score =
1.35 +
creatorStrength * 1.1 +
runnerThreat * 0.82 +
laneClarity * 0.6 +
actionSpace.value * 0.36 +
profile.crossBias * 0.74 +
profile.deliveryBias * 0.36 +
getPlayerTendency(carrier, "earlyCross") * 0.42 +
clamp(boxSupportCount, 0, 4) * 0.16 -
(boxSupportCount <= 1 && !isCutback ? 0.46 : 0) +
(isCutback ? 0.36 : 0) +
(profile.phaseKey === "finalThird" ? 0.32 : 0) -
(hopefulDelivery ? 0.62 : 0);
if (score < (isCutback ? 1.48 : 1.72) || (hopefulDelivery && score < 2.05)) {
return null;
}
return {
actionType: "pass",
target,
receiverPlayerId: null,
score,
label: isCutback ? "cutback" : "cross",
reason: isCutback ? "cutback from wide final-third position" : `${profile.styleLabel.toLowerCase()} delivery into the box`,
};
}

function getFinalThirdCombinationVariants(teamId, carrier, startPoint, profile) {
const state = getState();
const attackingDepth = getAttackingDepth(startPoint, teamId);
const startsWide = isWideChannel(startPoint);
const byline = isBylineZone(startPoint, teamId);
const sideSign = getWideSideSign(startPoint) || 1;
const cutbackBias = profile.cutbackBias ?? clamp(0.24 + profile.shortSupport * 0.28 + profile.overlapBias * 0.22, 0.22, 0.82);
const variants = [];
if (startsWide && attackingDepth >= 62) {
variants.push({
key: "cutback",
label: "cutback",
target: getAutoPilotBoxTarget(teamId, carrier, "cutback"),
roles: ["connector", "striker", "secondStriker", "wideForward"],
styleFit: 0.48 + cutbackBias * 0.3 + (byline ? 0.36 : 0),
maxDistance: 30,
timingWindow: 1.55,
});
variants.push({
key: "far-post-cross",
label: "cross",
target: getAutoPilotBoxTarget(teamId, carrier, "far-post"),
roles: ["striker", "wideForward", "secondStriker"],
styleFit: 0.28 + profile.crossBias * 0.44,
maxDistance: 38,
timingWindow: 1.85,
});
}
if (attackingDepth >= 58) {
variants.push({
key: "golden-zone-slip",
label: "final pass",
target: getHighValueAttackTarget(teamId, startPoint, "goldenRun", sideSign),
roles: ["striker", "secondStriker", "wideForward"],
styleFit: 0.28 + profile.lineBreakBias * 0.34 + profile.shootBias * 0.12,
maxDistance: 27,
timingWindow: 1.45,
});
variants.push({
key: "edge-cutback",
label: "cutback",
target: getHighValueAttackTarget(teamId, startPoint, "reboundEdge", sideSign),
roles: ["connector", "pivot", "wideForward"],
styleFit: 0.22 + cutbackBias * 0.28 + profile.shortSupport * 0.16,
maxDistance: 24,
timingWindow: 1.5,
});
}
return variants;
}

function buildAutoPilotFinalThirdCombinationCandidate(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const attackingDepth = getAttackingDepth(startPoint, teamId);
const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
if (attackingDepth < 58 || ownerPressure > 0.86) {
return null;
}
const formation = teams[teamId]?.formation;
const creatorQuality = Math.max(
getAutoPilotRoleStrength(carrier, "creator"),
getAutoPilotRoleStrength(carrier, "crosser")
);
const variants = getFinalThirdCombinationVariants(teamId, carrier, startPoint, profile);
const candidates = [];
variants.forEach((variant) => {
state.players.forEach((runner) => {
if (runner.team !== teamId || runner.id === carrier.id || isGoalkeeper(runner)) {
return;
}
const roleKey = getOffensiveRoleKey(runner, formation);
if (!variant.roles.includes(roleKey) || isPassReceiverOffside(runner, startPoint)) {
return;
}
const runnerBlend = roleKey === "connector" || roleKey === "pivot" ? 0.14 : 0.08;
const target = clampToPitch({
x: lerp(variant.target.x, runner.position.x, runnerBlend),
y: lerp(variant.target.y, runner.position.y, runnerBlend),
}, 2);
const passDistance = distance(startPoint, target);
if (passDistance < 5 || passDistance > variant.maxDistance) {
return;
}
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const runnerDistance = distance(runner.position, target);
const runnerTime = computeTimeToCoverDistance(runner, runnerDistance, target);
const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / variant.timingWindow, 0, 1);
const boxThreat = actionSpace.targetThreat.box;
const cutbackThreat = variant.key.includes("cutback") ? actionSpace.targetThreat.centrality * 0.18 : 0;
const runnerQuality =
getAutoPilotRoleStrength(runner, "finisher") * 0.42 +
getAutoPilotRoleStrength(runner, "runner") * 0.28 +
getAutoPilotRoleStrength(runner, "receiver") * 0.18 +
getPlayerTendency(runner, "boxRun") * 0.18;
const supportCount = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, runner.id]), 18);
const hopefulCrossPenalty =
variant.key === "far-post-cross" && supportCount <= 1
? 0.36
: 0;
const score =
1.24 +
creatorQuality * 0.72 +
runnerQuality * 0.82 +
laneClarity * 0.78 +
actionSpace.value * 1.04 +
boxThreat * 0.46 +
cutbackThreat +
timingFit * 0.56 +
variant.styleFit +
clamp(supportCount, 0, 4) * 0.1 +
(forwardGain >= -2 ? 0.16 : -0.1) -
ownerPressure * 0.32 -
actionSpace.targetPressure * 0.46 -
hopefulCrossPenalty -
(passDistance > 28 && variant.key !== "far-post-cross" ? 0.18 : 0);
candidates.push({
variant,
runner,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
actionSpace,
supportCount,
score,
timingFit,
});
});
});
const selected = candidates
.filter((candidate) => (
candidate.laneClarity >= 0.34 &&
candidate.timingFit >= 0.12 &&
candidate.actionSpace.value >= 0.32 &&
candidate.score >= 1.7
))
.sort((a, b) => b.score - a.score)[0];
if (!selected) {
return null;
}
const isCutback = selected.variant.key.includes("cutback");
return {
actionType: "pass",
target: selected.target,
receiverPlayerId: null,
receiverRoleKey: selected.roleKey,
passDistance: selected.passDistance,
forwardGain: selected.forwardGain,
laneClarity: selected.laneClarity,
receiverPressure: selected.actionSpace.targetPressure,
supportNearTarget: selected.supportCount,
isLineBreak: selected.forwardGain >= 4 || selected.actionSpace.lineBreakCount >= 1,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: true,
isPrinciplePattern: true,
principleKey: `final-third-${selected.variant.key}`,
principleLabel: `${isCutback ? "Cutback" : "Final-third delivery"}: ${getPlayerMagnetLabel(selected.runner)} attacks the chance`,
principleRunnerPlayerId: selected.runner.id,
score: selected.score,
firstTouchMode: "forward",
label: selected.variant.label,
reason: isCutback
? "final-third cutback to a runner arriving in the highest-value zone"
: "final-third chance creation before the defence can reset",
};
}

function buildAutoPilotWideOverlapCandidate(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const carrierRoleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
const attackingDepth = getAttackingDepth(startPoint, teamId);
const sideSign = getWideSideSign(startPoint) || getWideSideSign(carrier);
if (carrierRoleKey !== "wideForward" || attackingDepth < 42 || !isWidePrincipleZone(startPoint)) {
return null;
}
const overlap = chooseWideOverlapRunner(
teamId,
sideSign,
startPoint,
profile,
new Set([carrier.id])
);
if (!overlap) {
return null;
}
const runnerPoint = getPlayerBallControlPoint(overlap.player);
const runnerDepth = getAttackingDepth(runnerPoint, teamId);
const overlapDepth = getAttackingDepth(overlap.target, teamId);
const runnerHasArrived = runnerDepth >= attackingDepth - 1.5 && distance(runnerPoint, overlap.target) <= 9.5;
const target = runnerHasArrived ? runnerPoint : overlap.target;
const passDistance = distance(startPoint, target);
if (passDistance < 5 || passDistance > 30 || isPassReceiverOffside(overlap.player, startPoint)) {
return null;
}
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(overlap.player, target);
const runnerQuality =
getAutoPilotRoleStrength(overlap.player, "runner") +
getAutoPilotRoleStrength(overlap.player, "crosser") * 0.42 +
getPlayerTendency(overlap.player, "overlap") * 0.35;
const score =
1.35 +
overlap.principleFit * 0.96 +
runnerQuality * 0.74 +
laneClarity * 0.72 +
profile.overlapBias * 0.72 +
profile.crossBias * 0.26 +
clamp(forwardGain / 20, -0.12, 0.55) -
receiverPressure * 0.48 -
Math.max(0, Math.abs(overlapDepth - runnerDepth) - 10) * 0.025;
if (score < 1.62) {
return null;
}
return {
actionType: "pass",
target,
receiverPlayerId: overlap.player.id,
receiverRoleKey: "wideBack",
passDistance,
forwardGain,
laneClarity,
receiverPressure,
isLineBreak: forwardGain >= 7.5,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: getAttackingDepth(target, teamId) >= 73 && isWidePrincipleZone(target),
isPrinciplePattern: true,
principleKey: "wide-overlap",
principleLabel: `Wide overload: W releases ${getPlayerMagnetLabel(overlap.player)} on the overlap`,
score,
firstTouchMode: attackingDepth >= 64 ? "forward" : "inside",
label: "overlap pass",
reason: "wide-overload principle: winger receives high, then releases the outside full-back or wing-back run",
};
}

function getLastSwitchLandingActionContext(carrier, startPoint, profile) {
const state = getState();
if (!carrier || !startPoint || state.restartPhase?.type) {
return null;
}
const teamId = carrier.team;
const lastStep = getRecentPossessionSteps(teamId, 4)[0] ?? null;
if (
!lastStep ||
lastStep.actionType !== "pass" ||
lastStep.receiverPlayerId !== carrier.id ||
getRecordedStepDuration(lastStep) > 5
) {
return null;
}
const start = lastStep.beforeSnapshot?.ball?.position;
const target = lastStep.target ?? startPoint;
if (!start || !target) {
return null;
}
const actionDistance = distance(start, target);
const laneShift = Math.abs(getPitchLaneIndex(start) - getPitchLaneIndex(target));
const principleText = [
lastStep.profileLabel,
lastStep.offensiveAutopilot?.principleKey,
lastStep.offensiveAutopilot?.principleLabel,
...(lastStep.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const wasSwitch =
(actionDistance >= 18 && laneShift >= 2) ||
principleText.includes("switch") ||
principleText.includes("weak-side") ||
principleText.includes("far side");
if (!wasSwitch) {
return null;
}
const sideSign =
getWideSideSign(startPoint) ||
getWideSideSign(target) ||
1;
const depth = getAttackingDepth(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const targetThreat = getPitchThreatProfile(startPoint, teamId);
const startsWide = isWidePrincipleZone(startPoint);
const finalThirdCue =
depth >= 62 ||
targetThreat.assistZone >= 0.22 ||
targetThreat.cutbackZone >= 0.18 ||
targetThreat.box >= 0.14;
if (!startsWide && depth < 44 && pressure >= 0.46) {
return null;
}
return {
actionDistance,
depth,
finalThirdCue,
lastStep,
laneShift,
pressure,
sideSign,
start,
target,
targetThreat,
startsWide,
switchBias: profile.switchBias ?? 0.5,
};
}

function buildAutoPilotSwitchLandingContinuationCandidate(carrier, startPoint, profile) {
const state = getState();
const context = getLastSwitchLandingActionContext(carrier, startPoint, profile);
if (!context) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const carrierRoleKey = getOffensiveRoleKey(carrier, formation);
const options = [];
const addOption = (option) => {
if (option && Number.isFinite(option.score)) {
options.push(option);
}
};
const addPassToReceiver = (receiver, target, meta = {}) => {
if (!receiver || receiver.team !== teamId || receiver.id === carrier.id || isPassReceiverOffside(receiver, startPoint)) {
return;
}
const passDistance = distance(startPoint, target);
if (passDistance < (meta.minDistance ?? 4) || passDistance > (meta.maxDistance ?? 30)) {
return;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target, { receiverPlayerId: receiver.id });
const receiverPressure = getPlayerPressureLoad(receiver, target);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const supportNearTarget = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, receiver.id]), 14);
const score =
(meta.baseScore ?? 1.55) +
laneClarity * 0.84 +
getAutoPilotRoleStrength(receiver, "receiver") * 0.24 +
getAutoPilotRoleStrength(receiver, "runner") * (meta.runnerWeight ?? 0.28) +
actionSpace.value * 0.36 +
clamp(forwardGain / 18, -0.1, 0.48) +
clamp(supportNearTarget, 0, 3) * 0.08 +
(meta.bonus ?? 0) -
receiverPressure * 0.42 -
Math.max(0, passDistance - 22) * 0.026;
if (score < (meta.minScore ?? 1.72)) {
return;
}
addOption({
actionType: "pass",
target,
receiverPlayerId: receiver.id,
receiverRoleKey: roleKey,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
supportNearTarget,
isLineBreak: forwardGain >= 6 || actionSpace.lineBreakCount >= 1,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: actionSpace.targetThreat.box >= 0.18 || actionSpace.targetThreat.assistZone >= 0.28,
isPrinciplePattern: true,
principleKey: meta.principleKey ?? "switch-landing-continuation",
principleLabel: meta.principleLabel ?? `Switch landing: ${getPlayerMagnetLabel(carrier)} continues the far-side attack`,
principleRunnerPlayerId: receiver.id,
score,
firstTouchMode: actionSpace.targetThreat.box >= 0.18 || forwardGain >= 5 ? "forward" : "inside",
label: meta.label ?? "switch continuation",
reason: meta.reason ?? "switch landing has opened the far side, so the next action continues that advantage",
});
};
if (context.startsWide && context.depth >= 42 && (profile.overlapBias ?? 0.5) >= 0.48) {
const overlap = chooseWideOverlapRunner(teamId, context.sideSign, startPoint, profile, new Set([carrier.id]));
if (overlap) {
const runnerPoint = getPlayerBallControlPoint(overlap.player);
const runnerArrived = distance(runnerPoint, overlap.target) <= 8.8;
addPassToReceiver(overlap.player, runnerArrived ? runnerPoint : overlap.target, {
baseScore: 1.72,
bonus: overlap.principleFit * 0.42 + getPlayerTendency(overlap.player, "overlap") * 0.22,
label: "overlap after switch",
maxDistance: 31,
minScore: 1.68,
principleKey: "switch-overlap-continuation",
principleLabel: `Switch landing: ${getPlayerMagnetLabel(overlap.player)} overlaps outside`,
reason: "far-side switch creates the timing for an outside overlap",
runnerWeight: 0.42,
});
}
}
const halfSpaceTarget = getSwitchLandingAttackTarget(teamId, {
sideSign: context.sideSign,
targetDepth: context.depth,
targetPoint: startPoint,
}, context.finalThirdCue ? "cutbackEdge" : "insidePocket", profile);
const insideReceiver = state.players
.filter((player) => {
if (player.team !== teamId || player.id === carrier.id || isGoalkeeper(player)) {
return false;
}
const roleKey = getOffensiveRoleKey(player, formation);
return ["connector", "secondStriker", "wideForward", "striker"].includes(roleKey);
})
.sort((a, b) => distance(a.position, halfSpaceTarget) - distance(b.position, halfSpaceTarget))[0] ?? null;
addPassToReceiver(insideReceiver, halfSpaceTarget, {
baseScore: context.finalThirdCue ? 1.82 : 1.58,
bonus: (profile.shortSupport ?? 0.55) * 0.18 + (context.finalThirdCue ? 0.3 : 0),
label: context.finalThirdCue ? "cutback edge" : "underlap pass",
maxDistance: context.finalThirdCue ? 26 : 24,
minScore: context.finalThirdCue ? 1.66 : 1.78,
principleKey: context.finalThirdCue ? "switch-cutback-edge" : "switch-underlap-continuation",
principleLabel: context.finalThirdCue
? "Switch landing: cutback edge arrives"
: "Switch landing: underlap into half-space",
reason: context.finalThirdCue
? "switch lands wide in the final third and the cutback edge is available"
: "switch lands wide and the half-space support is the next forward option",
});
if (context.finalThirdCue) {
const boxCandidate = buildAutoPilotBoxDeliveryCandidate(carrier, startPoint, profile);
if (boxCandidate) {
addOption({
...boxCandidate,
score: boxCandidate.score + 0.34 + (profile.deliveryBias ?? 0.45) * 0.16,
isPrinciplePattern: true,
principleKey: "switch-final-third-delivery",
principleLabel: "Switch landing: deliver before the block resets",
principleLabels: uniquePrincipleLabels([
...(boxCandidate.principleLabels ?? []),
"Switch landing: deliver before the block resets",
]),
reason: "far-side switch reaches the final third before the block can slide across",
});
}
}
if (
context.pressure <= 0.52 &&
(carrierRoleKey === "wideForward" || carrierRoleKey === "wideBack" || carrierRoleKey === "connector")
) {
const carryTarget = getSwitchLandingAttackTarget(teamId, {
sideSign: context.sideSign,
targetDepth: context.depth,
targetPoint: startPoint,
}, context.finalThirdCue ? "cutbackEdge" : "underlap", profile);
const actionDistance = distance(startPoint, carryTarget);
const forwardGain = (carryTarget.x - startPoint.x) * getAttackDirectionSign(teamId);
const actionSpace = getActionSpaceValue(startPoint, carryTarget, teamId, profile);
const score =
1.5 +
getAutoPilotRoleStrength(carrier, "dribbler") * 0.48 +
(profile.carryBias ?? 0.5) * 0.26 +
(profile.dribbleBias ?? 0.5) * 0.2 +
Math.max(0, forwardGain) * 0.045 +
actionSpace.value * 0.34 -
context.pressure * 0.36;
if (actionDistance >= 4.5 && forwardGain >= 2 && score >= 1.68) {
addOption({
actionType: "dribble",
target: carryTarget,
receiverPlayerId: null,
passDistance: actionDistance,
forwardGain,
laneClarity: 0.72,
receiverPressure: context.pressure,
isLineBreak: actionSpace.lineBreakCount >= 1,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: actionSpace.targetThreat.box >= 0.18,
isPrinciplePattern: true,
principleKey: "switch-landing-carry",
principleLabel: `Switch landing: ${getPlayerMagnetLabel(carrier)} attacks the isolated side`,
score,
firstTouchMode: null,
label: "carry after switch",
reason: "far-side switch creates a moment to carry before pressure arrives",
});
}
}
if (!options.length) {
return null;
}
return options.sort((a, b) => b.score - a.score)[0];
}

function buildAutoPilotThroughBallCandidate(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const ballDepth = getAttackingDepth(startPoint, teamId);
const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
if (
ballDepth < 42 ||
ownerPressure > 0.72 ||
(profile.phaseKey === "buildUp" && profile.directness < 0.75)
) {
return null;
}
const formation = teams[teamId]?.formation;
const candidates = state.players
.filter((runner) => {
if (runner.team !== teamId || runner.id === carrier.id || isGoalkeeper(runner)) {
return false;
}
const roleKey = getOffensiveRoleKey(runner, formation);
if (!["striker", "wideForward", "secondStriker", "connector"].includes(roleKey)) {
return false;
}
return !isPassReceiverOffside(runner, startPoint);
})
.map((runner) => {
const roleKey = getOffensiveRoleKey(runner, formation);
const sideSign = getWideSideSign(runner) || getWideSideSign(startPoint) || 1;
const baseTarget = getHighValueAttackTarget(
teamId,
startPoint,
roleKey === "wideForward" ? "halfSpaceRun" : "goldenRun",
sideSign
);
const target = clampToPitch({
x: lerp(baseTarget.x, runner.position.x, roleKey === "connector" ? 0.18 : 0.08),
y: lerp(baseTarget.y, runner.position.y, roleKey === "wideForward" ? 0.22 : 0.12),
}, 2.5);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const targetDepth = getAttackingDepth(target, teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const targetThreat = getPitchThreatProfile(target, teamId);
const runnerDistance = distance(runner.position, target);
const runnerTime = computeTimeToCoverDistance(runner, runnerDistance, target);
const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / 1.35, 0, 1);
const runnerStrength =
getAutoPilotRoleStrength(runner, "runner") * 0.56 +
getAutoPilotRoleStrength(runner, "receiver") * 0.28 +
getPlayerTendency(runner, "boxRun") * 0.16;
const supportNearTarget = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, runner.id]), 16);
const score =
1.02 +
targetThreat.value * 1.05 +
targetThreat.centralPocket * 0.42 +
targetThreat.behindLine * 0.28 +
laneClarity * 0.92 +
runnerStrength * 0.8 +
timingFit * 0.64 +
clamp(forwardGain / 22, 0, 0.82) +
profile.lineBreakBias * 0.58 +
profile.directness * 0.34 +
clamp(supportNearTarget, 0, 3) * 0.08 -
ownerPressure * 0.38 -
(passDistance > 34 && profile.routeOneBias < 0.5 ? 0.38 : 0) -
(runnerTime > passTime + 1.1 ? 0.42 : 0);
return {
runner,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
targetDepth,
targetThreat,
supportNearTarget,
score,
timingFit,
};
})
.filter((candidate) => (
candidate.passDistance >= 11 &&
candidate.passDistance <= 38 &&
candidate.forwardGain >= 7 &&
candidate.laneClarity >= 0.42 &&
candidate.targetThreat.value >= 0.42 &&
candidate.timingFit >= 0.18 &&
candidate.score >= 1.72
))
.sort((a, b) => b.score - a.score);
const selected = candidates[0];
if (!selected) {
return null;
}
return {
actionType: "pass",
target: selected.target,
receiverPlayerId: null,
receiverRoleKey: selected.roleKey,
passDistance: selected.passDistance,
forwardGain: selected.forwardGain,
laneClarity: selected.laneClarity,
receiverPressure: 0.42,
supportNearTarget: selected.supportNearTarget,
isLineBreak: true,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: selected.targetDepth >= 72 && Math.abs(selected.target.y - pitch.width / 2) <= 18,
isPrinciplePattern: true,
principleKey: "pass-into-space",
principleLabel: `Pass into space: ${getPlayerMagnetLabel(selected.runner)} attacks ${selected.targetThreat.primaryLabel}`,
principleRunnerPlayerId: selected.runner.id,
score: selected.score,
firstTouchMode: "forward",
label: "through ball",
reason: `${profile.styleLabel.toLowerCase()} pass into space for ${getPlayerMagnetLabel(selected.runner)} to attack the next line`,
};
}

function buildAutoPilotBetweenLinesCandidate(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const ballDepth = getAttackingDepth(startPoint, teamId);
const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
if (ballDepth < 34 || ballDepth > 76 || ownerPressure > 0.7) {
return null;
}
const formation = teams[teamId]?.formation;
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
const startSide = getWideSideSign(startPoint) || 1;
const candidates = state.players
.filter((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
if (!["connector", "striker", "secondStriker", "wideForward"].includes(roleKey)) {
return false;
}
return !isPassReceiverOffside(receiver, startPoint);
})
.map((receiver) => {
const roleKey = getOffensiveRoleKey(receiver, formation);
const receiverSide = getWideSideSign(receiver) || startSide;
const pocketSide =
roleKey === "wideForward"
? receiverSide
: Math.abs(startPoint.y - pitch.width / 2) < 10
? receiverSide
: -startSide;
const pocketDepth = clamp(
ballDepth +
(roleKey === "connector" ? 8 : roleKey === "secondStriker" ? 10 : 12) +
profile.lineBreakBias * 4,
45,
78
);
const halfSpaceY = pitch.width / 2 + pocketSide * (roleKey === "striker" ? 8.5 : 13.5);
const target = clampToPitch({
x: getDepthX(teamId, pocketDepth),
y: clamp(lerp(receiver.position.y, halfSpaceY, roleKey === "wideForward" ? 0.54 : 0.7), 9, pitch.width - 9),
}, 2.5);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const runnerDistance = distance(receiver.position, target);
const runnerTime = computeTimeToCoverDistance(receiver, runnerDistance, target);
const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / 1.4, 0, 1);
const receiverRoleFit =
roleKey === "connector"
? 0.48
: roleKey === "secondStriker"
? 0.42
: roleKey === "striker"
? 0.34
: 0.28;
const receiveQuality =
getAutoPilotRoleStrength(receiver, "receiver") * 0.44 +
getPlayerTendency(receiver, "passAndMove") * 0.22 +
getAutoPilotRoleStrength(receiver, "creator") * 0.18;
const score =
1.18 +
laneClarity * 0.92 +
actionSpace.value * 1.15 +
clamp(actionSpace.lineBreakCount, 0, 3) * 0.18 +
timingFit * 0.52 +
receiveQuality +
receiverRoleFit +
profile.shortSupport * 0.2 +
profile.lineBreakBias * 0.4 +
(progressionWindow.active ? 0.48 + progressionWindow.urgency * 0.24 : 0) +
(
targetThreat.centralPocket >= 0.34 ||
targetThreat.betweenLines >= 0.46 ||
targetThreat.halfSpace >= 0.45
? 0.34
: 0
) -
ownerPressure * 0.36 -
actionSpace.targetPressure * 0.38 -
Math.abs(passDistance - 18) * 0.012;
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
actionSpace,
score,
timingFit,
};
})
.filter((candidate) => (
candidate.passDistance >= 7 &&
candidate.passDistance <= 29 &&
candidate.forwardGain >= 3.5 &&
candidate.laneClarity >= 0.38 &&
candidate.timingFit >= 0.14 &&
candidate.actionSpace.value >= 0.34 &&
candidate.score >= 1.74
))
.sort((a, b) => b.score - a.score);
const selected = candidates[0];
if (!selected) {
return null;
}
return {
actionType: "pass",
target: selected.target,
receiverPlayerId: null,
receiverRoleKey: selected.roleKey,
passDistance: selected.passDistance,
forwardGain: selected.forwardGain,
laneClarity: selected.laneClarity,
receiverPressure: selected.actionSpace.targetPressure,
supportNearTarget: getTeamSupportCountAroundPoint(teamId, selected.target, new Set([carrier.id, selected.receiver.id]), 14),
isLineBreak: selected.actionSpace.lineBreakCount >= 1 || selected.forwardGain >= 8,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: selected.actionSpace.targetThreat.box >= 0.24,
isPrinciplePattern: true,
principleKey: "between-lines-pocket",
principleLabel: `Between-lines pocket: ${getPlayerMagnetLabel(selected.receiver)} receives in ${selected.actionSpace.targetThreat.primaryLabel}`,
principleRunnerPlayerId: selected.receiver.id,
score: selected.score,
firstTouchMode:
selected.actionSpace.targetThreat.centralPocket >= 0.36 ||
selected.actionSpace.targetThreat.betweenLines >= 0.5
? "forward"
: "inside",
label: "between-lines pass",
reason: `${profile.styleLabel.toLowerCase()} finds ${getPlayerMagnetLabel(selected.receiver)} between lines to attack ${selected.actionSpace.targetThreat.primaryLabel}`,
};
}

function buildAutoPilotPassCandidates(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
const ballDepth = getAttackingDepth(startPoint, teamId);
const maxPassDistance = profile.routeOneBias >= 0.55
? 36 + profile.directness * 22 + profile.routeOneBias * 18 + (profile.phaseKey === "finalThird" ? 8 : 0)
: profile.shortSupport >= 0.78 && profile.directness < 0.5
? 26 + profile.lineBreakBias * 9 + (profile.phaseKey === "finalThird" ? 5 : 0)
: 34 + profile.directness * 18 + (profile.phaseKey === "finalThird" ? 7 : 0);
const rhythm = getPossessionRhythmContext(teamId);
const possessionMaturity = clamp(
rhythm.duration / Math.max(profile.targetPossessionSeconds ?? 8.8, 0.1),
0,
1.45
);
const candidates = [];
state.players.forEach((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id) {
return;
}
if (isPassReceiverOffside(receiver, startPoint)) {
return;
}
const receiverRoleKey = getOffensiveRoleKey(receiver, formation);
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
if (passDistance < 3.2 || passDistance > maxPassDistance) {
return;
}
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const targetDepth = getAttackingDepth(target, teamId);
const lateralMeters = Math.abs(target.y - startPoint.y);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const supportNearTarget = getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, receiver.id]),
passDistance >= 26 ? 15 : 11
);
const wideEntryPrinciple = getWideEntryPrincipleContext(carrier, receiver, startPoint, target, profile);
const receiverStrength = getAutoPilotRoleStrength(receiver, "receiver");
const runnerStrength = getAutoPilotRoleStrength(receiver, "runner");
const creatorStrength = getAutoPilotRoleStrength(carrier, "creator");
const switchStrength = getAutoPilotRoleStrength(carrier, "switcher");
const passAndMoveTendency = getPlayerTendency(receiver, "passAndMove");
const lineBreakTendency = getPlayerTendency(carrier, "lineBreakPass");
const retainTendency = getPlayerTendency(carrier, "retain");
const isSwitch = lateralMeters >= 19 && passDistance >= 22;
const isRouteOnePass =
profile.routeOneBias >= 0.55 &&
passDistance >= 20 &&
forwardGain >= 10 &&
(receiverRoleKey === "striker" || receiverRoleKey === "secondStriker" || receiverRoleKey === "wideForward");
const isSwitchOpportunity =
isSwitch &&
(ownerPressure >= 0.46 ||
(profile.switchBias >= 0.68 && laneClarity >= 0.72 && receiverPressure <= 0.48) ||
(switchStrength >= 0.82 && laneClarity >= 0.78 && receiverPressure <= 0.42));
const isLineBreak = forwardGain >= 7.5 && targetDepth >= ballDepth + 5;
const isBoxPass = targetDepth >= 73 && Math.abs(target.y - pitch.width / 2) <= 17;
const isBackPass = forwardGain < -6;
const sameLanePass = getPitchLaneKey(startPoint) === getPitchLaneKey(target);
const isSidewaysPass = Math.abs(forwardGain) < 4 && lateralMeters >= 6.5 && !isSwitch;
const threatGain = getActionThreatGain(startPoint, target, teamId);
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const centralPocketScore = targetThreat.centralPocket;
const centralPocketPassBonus =
centralPocketScore > 0.42
? 0.48 +
centralPocketScore * 0.92 +
(forwardFacingSpaceTwo.active ? 0.42 : 0) +
(receiverPressure <= 0.56 ? 0.16 : 0)
: 0;
const highValueSpaceBonus =
Math.max(0, threatGain) * 0.86 +
targetThreat.value * 0.34 +
targetThreat.halfSpace * 0.14 +
targetThreat.betweenLines * 0.14 +
targetThreat.cutbackZone * 0.18 +
actionSpace.spacePriority.score * 0.42 +
targetThreat.assistZone * (profile.crossBias >= 0.56 || profile.overlapBias >= 0.56 ? 0.18 : 0.08);
const progressionSpaceBonus =
forwardGain >= 3
? actionSpace.value * (0.34 + profile.progressionUrgency * 0.42) +
clamp(actionSpace.lineBreakCount, 0, 3) * 0.15 +
(actionSpace.openTarget >= 0.68 && targetDepth >= 48 ? 0.12 : 0)
: 0;
const rightWayBackPassPenalty =
forwardFacingSpaceTwo.active && isBackPass
? 1.15 + profile.progressionUrgency * 0.42 + (ownerPressure <= 0.28 ? 0.28 : 0)
: 0;
const lowValueSafetyPenalty =
forwardFacingSpaceTwo.active &&
!isLineBreak &&
!isSwitch &&
targetThreat.value < getPitchThreatProfile(startPoint, teamId).value + 0.05 &&
centralPocketScore < 0.35 &&
forwardGain < 2
? 0.72
: 0;
const lowValueProgressionWindowPenalty =
forwardFacingSpaceTwo.active &&
!isLineBreak &&
!isSwitch &&
actionSpace.value < 0.28 &&
actionSpace.lineBreakCount === 0 &&
forwardGain < 2 &&
ownerPressure < 0.55
? 0.36 + profile.progressionUrgency * 0.36
: 0;
const possessionHasSettled = rhythm.steps >= 2 || possessionMaturity >= 0.38;
const sidewaysRepeatPenalty = isSidewaysPass
? clamp(rhythm.sidewaysPasses - profile.sidewaysTolerance * 2, 0, 4) *
(0.28 + profile.progressionUrgency * 0.22) +
(possessionHasSettled ? possessionMaturity * (0.22 + profile.directness * 0.36) : 0)
: 0;
const progressionRhythmBonus =
isLineBreak || isBoxPass || isRouteOnePass
? (0.24 + profile.progressionUrgency * 0.48) * clamp(possessionMaturity + 0.4, 0.35, 1.25)
: 0;
const controlledRecycleBonus =
isBackPass && rhythm.steps <= 1
? profile.recycleWindow * Math.max(0.2, 0.54 - profile.directness * 0.18)
: 0;
const sterileRecyclePenalty =
isBackPass && rhythm.backPasses >= 1 && rhythm.forwardPasses === 0
? 0.26 + profile.progressionUrgency * 0.38
: 0;
const lowValueSwitchPenalty =
isSwitch && forwardGain < 4 && ownerPressure < 0.42 && profile.switchBias < 0.72
? 0.32 + possessionMaturity * 0.3
: 0;
if (isSwitch && !isSwitchOpportunity) {
return;
}
if (passDistance > 42 && profile.phaseKey !== "finalThird" && profile.directness < 0.72 && !isRouteOnePass) {
return;
}
const rolePreference = profile.runnerPreferences?.[receiverRoleKey] ?? 0.2;
const distancePenalty = passDistance <= 22
? passDistance * 0.006
: 0.13 + (passDistance - 22) * (0.058 - profile.directness * 0.026);
const supportPassBonus = passDistance >= 6 && passDistance <= 18 && forwardGain > -4
? 0.18 + profile.shortSupport * 0.42 + passAndMoveTendency * 0.18
: 0;
const pressureEscape = ownerPressure >= 0.5 && passDistance <= 18 ? 0.32 : 0;
const longPassPenalty =
passDistance >= 32 && !isBoxPass && !isSwitchOpportunity && !isRouteOnePass
? 0.8 - profile.directness * 0.52 - profile.routeOneBias * 0.28 + (supportNearTarget <= 0 ? 0.36 : 0)
: passDistance >= 26 && !isBoxPass
? 0.38 - profile.directness * 0.22 - profile.routeOneBias * 0.2 + (supportNearTarget <= 0 ? 0.22 : 0)
: 0;
const secondBallSupportBonus =
passDistance >= 24 && forwardGain >= 8
? clamp(supportNearTarget, 0, 3) * (0.1 + profile.directness * 0.06 + profile.routeOneBias * 0.08)
: 0;
const activeFirstTouchMode = isSwitch
? isWideChannel(target) ? "inside" : "forward"
: isLineBreak || isBoxPass
? "forward"
: supportPassBonus > 0 && receiverPressure <= 0.52 && forwardGain >= 1.5 &&
(profile.firstTouchForwardBias >= 0.56 || passAndMoveTendency >= 0.68)
? "forward"
: profile.tempo >= 0.62 && forwardGain >= -1.5
? "inside"
: receiverPressure <= 0.65
? "inside"
: "kill";
const score =
0.72 +
laneClarity * 1.55 +
receiverStrength * 0.82 +
creatorStrength * 0.42 +
profile.passBias * 0.24 +
clamp(forwardGain / 24, -0.32, 0.74) * (0.72 + profile.directness * 0.62) +
clamp(targetDepth / 100, 0, 1) * 0.35 +
rolePreference * 0.22 +
(isLineBreak ? 0.42 + profile.lineBreakBias * 0.72 + lineBreakTendency * 0.32 + runnerStrength * 0.38 : 0) +
(isSwitch ? 0.12 + profile.switchBias * 0.42 + switchStrength * 0.34 + ownerPressure * 0.32 : 0) +
(isRouteOnePass ? 0.42 + profile.routeOneBias * 0.58 + runnerStrength * 0.26 : 0) +
(isBoxPass ? 0.48 + getAutoPilotRoleStrength(receiver, "finisher") * 0.5 : 0) +
secondBallSupportBonus +
centralPocketPassBonus +
highValueSpaceBonus +
progressionSpaceBonus +
(wideEntryPrinciple ? wideEntryPrinciple.scoreBonus : 0) +
progressionRhythmBonus +
supportPassBonus +
controlledRecycleBonus +
pressureEscape -
receiverPressure * 0.52 -
distancePenalty -
longPassPenalty -
sidewaysRepeatPenalty -
sterileRecyclePenalty -
lowValueSwitchPenalty -
rightWayBackPassPenalty -
lowValueSafetyPenalty -
lowValueProgressionWindowPenalty -
(sameLanePass && forwardGain < 7 && ownerPressure < 0.5 ? 0.32 : 0) -
(isBackPass ? 0.28 + profile.directness * 0.4 - retainTendency * 0.18 : 0);
if (score < 1.55) {
return;
}
candidates.push({
actionType: "pass",
target,
receiverPlayerId: receiver.id,
receiverRoleKey,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
supportNearTarget,
isLineBreak,
isSwitch,
isSidewaysPass,
isBoxPass,
isPrinciplePattern: !!wideEntryPrinciple,
principleKey: wideEntryPrinciple?.key ?? null,
principleLabel: wideEntryPrinciple
? `Wide overload: W receives high, ${getPlayerMagnetLabel(wideEntryPrinciple.runner)} overlaps outside`
: null,
principleRunnerPlayerId: wideEntryPrinciple?.runner.id ?? null,
score,
firstTouchMode: activeFirstTouchMode,
label: wideEntryPrinciple ? "wide entry" : isSwitch ? "switch" : isLineBreak ? "line-breaking pass" : "pass",
reason: isSwitch
? "switching play away from pressure"
: isRouteOnePass
? "route-one territory and second-ball pressure"
: wideEntryPrinciple
? `${profile.styleLabel.toLowerCase()} wide overload: play into W and trigger the outside overlap`
: isLineBreak
? `${profile.styleLabel.toLowerCase()} line break`
: `${profile.styleLabel.toLowerCase()} support option`,
});
});
return candidates;
}

function buildAutoPilotDribbleCandidate(carrier, startPoint, profile) {
const state = getState();
const target = getAutoPilotDribbleTarget(carrier, profile);
const travelDistance = distance(startPoint, target);
if (travelDistance < 3.5) {
return null;
}
const openGrassCarry = getOpenGrassCarryContext(carrier, startPoint, profile);
const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const runwayProfile = getCarryRunwayProfile(carrier, startPoint, target, profile);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
const dribbleTendency = getPlayerTendency(carrier, "dribble");
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(carrier.team);
const goalDistance = distance(startPoint, getOpponentGoalCenter(carrier.team));
const targetGoalDistance = distance(target, getOpponentGoalCenter(carrier.team));
const flow = getAutoPilotFlowContext(carrier, startPoint);
const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
const threatGain = getActionThreatGain(startPoint, target, carrier.team);
const targetThreat = getPitchThreatProfile(target, carrier.team);
const actionSpace = getActionSpaceValue(startPoint, target, carrier.team, profile);
const valuableCarryBonus =
targetThreat.centralPocket * 0.58 +
targetThreat.betweenLines * 0.24 +
targetThreat.halfSpace * 0.18 +
Math.max(0, threatGain) * 0.62 +
targetThreat.value * 0.22 +
actionSpace.spacePriority.score * 0.28 +
(forwardFacingSpaceTwo.active && forwardGain >= 3 ? 0.46 : 0);
const isBreakawayCarry =
goalDistance <= 50 &&
targetGoalDistance <= goalDistance - 7 &&
openSpaceScore >= 0.62 &&
pressure <= 0.46;
const isOpenGrassCarry =
!!openGrassCarry &&
distance(openGrassCarry.target, target) <= 1.4 &&
openGrassCarry.openSpaceScore >= 0.56;
const isRunwayCarry =
runwayProfile.shouldExtend &&
runwayProfile.openSpaceScore >= 0.56 &&
runwayProfile.forwardGain >= 6;
const roleKey = getOffensiveRoleKey(carrier, teams[carrier.team]?.formation);
const roleFreedom =
roleKey === "wideForward" || roleKey === "wideBack" || roleKey === "connector"
? 0.18
: roleKey === "rest" || roleKey === "gk"
? -0.18
: 0;
const score =
0.58 +
openSpaceScore * 1.28 +
dribbleStrength * 1.05 +
profile.dribbleBias * 0.55 +
profile.carryBias * 0.36 +
dribbleTendency * 0.28 +
clamp(forwardGain / 18, 0, 0.72) +
valuableCarryBonus +
actionSpace.value * 0.34 +
roleFreedom +
(isBreakawayCarry ? 0.72 : 0) +
(isOpenGrassCarry ? 0.42 + openGrassCarry.score * 0.34 + profile.carryBias * 0.16 : 0) +
(isRunwayCarry ? 0.36 + runwayProfile.runwayScore * 0.28 + clamp(runwayProfile.forwardGain / 30, 0, 0.18) : 0) +
(progressionWindow.active ? 0.3 + progressionWindow.openLane * 0.28 + progressionWindow.urgency * 0.22 : 0) +
(flow.carrierJustReceived ? 0.4 + profile.carryBias * 0.22 : 0) +
(flow.consecutivePasses >= 2 ? 0.32 + Math.min(flow.consecutivePasses, 4) * 0.08 : 0) +
(profile.phaseKey === "buildUp" ? -0.12 : 0.08) -
pressure * 0.62;
const minimumScore = progressionWindow.active || flow.carrierJustReceived || flow.consecutivePasses >= 2 ? 1.5 : 1.85;
if (score < minimumScore) {
return null;
}
return {
actionType: "dribble",
target,
receiverPlayerId: null,
score,
isOpenGrassCarry: isOpenGrassCarry || isRunwayCarry,
isRunwayCarry,
runwayProfile,
label: isBreakawayCarry
? "breakaway carry"
: isRunwayCarry
? "open-grass runway"
: isOpenGrassCarry
? openGrassCarry.label
: "carry",
reason: isBreakawayCarry
? "open grass to attack the goal"
: isRunwayCarry
? "open grass gives the carrier a longer runway toward goal"
: isOpenGrassCarry
? "open grass ahead allows a longer natural carry"
: "space to commit the next defender",
principleLabels: isRunwayCarry
? ["Open-grass runway"]
: isOpenGrassCarry ? ["Open-grass carry"] : [],
};
}

  return {
    getAutoPilotShotTarget,
    getAutoPilotBoxTarget,
    getCornerDeliveryTarget,
    chooseCornerDeliveryRunner,
    getFreeKickDeliveryTarget,
    chooseFreeKickShortReceiver,
    getAutoPilotDribbleTarget,
    getTeamSupportCountAroundPoint,
    getGoalkeeperDistributionPressure,
    getGoalkeeperDirectReleaseTarget,
    buildAutoPilotGoalkeeperDistributionCandidate,
    buildAutoPilotShotCandidate,
    buildAutoPilotKickoffCandidate,
    getLastKickoffOpeningProfile,
    getKickoffOpeningCandidateFit,
    buildAutoPilotPostKickoffResetCandidate,
    buildAutoPilotCornerCandidate,
    buildAutoPilotThrowInCandidate,
    buildAutoPilotPenaltyCandidate,
    buildAutoPilotFreeKickCandidate,
    buildAutoPilotRegainReleaseCandidate,
    getPressedRegainExitVector,
    buildAutoPilotPressedRegainExitCandidate,
    buildAutoPilotDangerZoneEscapeCandidate,
    buildAutoPilotBoxDeliveryCandidate,
    getFinalThirdCombinationVariants,
    buildAutoPilotFinalThirdCombinationCandidate,
    buildAutoPilotWideOverlapCandidate,
    getLastSwitchLandingActionContext,
    buildAutoPilotSwitchLandingContinuationCandidate,
    buildAutoPilotThroughBallCandidate,
    buildAutoPilotBetweenLinesCandidate,
    buildAutoPilotPassCandidates,
    buildAutoPilotDribbleCandidate,
  };
}
