export function createGameSimulatorAutopilotRegainReleaseCandidates(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getAttackDirectionSign,
    getAutoPilotRegainContext,
    getAutoPilotRoleStrength,
    getHighValueAttackTarget,
    getOffensiveRoleKey,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getState,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    isPassReceiverOffside,
    resolveBallActionProfile,
    teams,
  } = deps;

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

  return {
    buildAutoPilotRegainReleaseCandidate,
  };
}
