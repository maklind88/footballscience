export function createGameSimulatorAutopilotSetPieceCandidates(deps = {}) {
  const {
    chooseCornerDeliveryRunner,
    chooseFreeKickShortReceiver,
    clamp,
    clampToPitch,
    computePassLaneClarity,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getAutoPilotShotTarget,
    getCornerDeliveryTarget,
    getFreeKickDeliveryTarget,
    getGoalkeeperTargetOpenness,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getShotAngleQuality,
    getShotWindowProfile,
    getState,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    pitch,
    resolveBallActionProfile,
    teams,
  } = deps;

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

  return {
    buildAutoPilotCornerCandidate,
    buildAutoPilotThrowInCandidate,
    buildAutoPilotPenaltyCandidate,
    buildAutoPilotFreeKickCandidate,
  };
}
