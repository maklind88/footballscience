export function createGameSimulatorAutopilotGoalkeeperDistributionCandidates(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getAttackDirectionSign,
    getAutoPilotRoleStrength,
    getDepthPoint,
    getOffensiveRoleKey,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getState,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    pitch,
    resolveBallActionProfile,
    teams,
  } = deps;

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

  return {
    getGoalkeeperDistributionPressure,
    getGoalkeeperDirectReleaseTarget,
    buildAutoPilotGoalkeeperDistributionCandidate,
  };
}
