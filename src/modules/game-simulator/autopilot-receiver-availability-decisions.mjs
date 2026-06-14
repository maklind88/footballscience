export function createGameSimulatorAutopilotReceiverAvailabilityDecisions(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    ballRadiusMeters,
    clamp,
    clampToPitch,
    computeTimeToCoverDistance,
    distance,
    getAttackDirectionSign,
    getAutoPilotCandidateReceiver,
    getCoverShadowInfluence,
    getNearestOpponentGap,
    getOffensiveRoleKey,
    getPassLaneRiskProfile,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerPressureLoad,
    getReceiveFootUsageScore,
    getReceiveOrientationScore,
    isFrontLineRole,
    isSupportRole,
    isWideChannel,
    lerp,
    pitch,
    playerRadiusMeters,
    projectPointOnSegmentWithRatio,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getReceiverAvailabilityProfile(candidate, carrier, startPoint, profile) {
const receiver = getAutoPilotCandidateReceiver(candidate, carrier);
if (!receiver || receiver.team !== carrier.team || !candidate?.target) {
return null;
}
const target = candidate.target;
const roleKey =
candidate.receiverRoleKey ??
getOffensiveRoleKey(receiver, teams[carrier.team]?.formation);
const pressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getPlayerPressureLoad(receiver, target);
const receiveOrientation = getReceiveOrientationScore(receiver, startPoint);
const receiveFoot = getReceiveFootUsageScore(receiver, startPoint);
const context = getPlayerDecisionContext(receiver);
const attackSign = getAttackDirectionSign(receiver.team);
const nearestGap = getNearestOpponentGap(receiver, target);
const receiveSpace = clamp((nearestGap - 1.4) / 5.4, 0, 1);
const exitPoint = clampToPitch({
x: target.x + attackSign * (isSupportRole(roleKey) ? 3.2 : 5.4),
y: lerp(target.y, pitch.width / 2, isWideChannel(target) ? 0.22 : 0.08),
}, 2);
const exitGap = getNearestOpponentGap(receiver, exitPoint);
const firstActionSpace = clamp((exitGap - 1.8) / 5.8, 0, 1);
let goalSidePressure = 0;
let touchTrap = 0;
let closeMarkers = 0;
state.players.forEach((opponent) => {
if (opponent.team === receiver.team) {
return;
}
const gap = distance(opponent.position, target);
if (gap > 7.5) {
return;
}
const goalSide = (opponent.position.x - target.x) * attackSign;
const closeness = clamp(1 - gap / 7.5, 0, 1);
const coverInfluence = getCoverShadowInfluence(opponent, target, startPoint);
if (gap <= 3.2) {
closeMarkers += 1;
}
if (goalSide >= -0.7 && goalSide <= 7.5) {
goalSidePressure = Math.max(
goalSidePressure,
closeness * (0.58 + coverInfluence * 0.42)
);
}
touchTrap += closeness * coverInfluence * 0.28;
});
const technicalSecurity =
context.profile.technicalSecurity * 0.34 +
context.profile.pressResistance * 0.26 +
context.profile.composure * 0.18 +
context.profile.perception * 0.12;
const availability = clamp(
receiveSpace * 0.28 +
(1 - pressure) * 0.2 +
receiveOrientation * 0.18 +
receiveFoot * 0.08 +
firstActionSpace * 0.16 +
technicalSecurity * 0.18 -
goalSidePressure * 0.24 -
Math.min(touchTrap, 1.2) * 0.1 -
Math.min(closeMarkers, 2) * 0.04,
0,
1
);
return {
receiver,
roleKey,
availability,
pressure,
nearestGap,
receiveSpace,
firstActionSpace,
receiveOrientation,
goalSidePressure,
closeMarkers,
};
}
function getAutoPilotReceiverAvailabilityAdjustment(candidate, carrier, startPoint, profile) {
if (candidate.actionType !== "pass" || !candidate.target) {
return { score: 0, labels: [] };
}
const availabilityProfile = getReceiverAvailabilityProfile(candidate, carrier, startPoint, profile);
if (!availabilityProfile) {
return { score: 0, labels: [] };
}
const {
availability,
roleKey,
pressure,
nearestGap,
firstActionSpace,
receiveOrientation,
goalSidePressure,
} = availabilityProfile;
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const supportRole = isSupportRole(roleKey) || roleKey === "gk" || roleKey === "rest";
const forwardRole = isFrontLineRole(roleKey);
const highValuePass = candidate.isLineBreak || candidate.isBoxPass || forwardGain >= 7;
const labels = [];
let score = 0;
if (availability <= 0.26) {
score -= highValuePass || passDistance >= 18 ? 0.62 : 0.34;
} else if (availability <= 0.38) {
score -= highValuePass ? 0.36 : 0.18;
}
if (pressure >= 0.72 && nearestGap <= 2.2 && receiveOrientation < 0.56) {
score -= supportRole ? 0.22 : 0.36;
}
if (goalSidePressure >= 0.58 && forwardRole && passDistance <= 24) {
score -= 0.18;
}
if (availability >= 0.66 && firstActionSpace >= 0.48) {
score += 0.14 + (supportRole ? (profile.shortSupport ?? 0) * 0.08 : (profile.lineBreakBias ?? 0) * 0.08);
labels.push("Available receiver");
}
if (availability >= 0.72 && highValuePass && pressure <= 0.48) {
score += 0.14;
labels.push("Receive and play forward");
}
if (supportRole && passDistance <= 18 && availability >= 0.52 && pressure <= 0.62) {
score += 0.08 + (profile.shortSupport ?? 0) * 0.08;
}
return {
score: clamp(score, -0.76, 0.42),
labels: uniquePrincipleLabels(labels),
availability,
};
}
function getAutoPilotReceivePressureTrapAdjustment(candidate, carrier, startPoint, profile = {}) {
if (candidate.actionType !== "pass" || !candidate.target) {
return { score: 0, labels: [], context: null };
}
const receiver = getAutoPilotCandidateReceiver(candidate, carrier);
if (!receiver || receiver.team !== carrier.team) {
return { score: 0, labels: [], context: null };
}
const target = candidate.target;
const roleKey =
candidate.receiverRoleKey ??
getOffensiveRoleKey(receiver, teams[carrier.team]?.formation);
const attackSign = getAttackDirectionSign(receiver.team);
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * attackSign);
const supportRole = isSupportRole(roleKey) || roleKey === "gk" || roleKey === "rest";
const forwardRole = isFrontLineRole(roleKey);
const touchlineTrap = isWideChannel(target);
const laneRisk = getPassLaneRiskProfile(carrier, target, {
receiverPlayerId: receiver.id,
});
const ballEta = passDistance / Math.max(laneRisk.averageSpeed ?? 11.5, 0.01);
const receiverContext = getPlayerDecisionContext(receiver);
const receiveOrientation = getReceiveOrientationScore(receiver, startPoint);
const receiveFoot = getReceiveFootUsageScore(receiver, startPoint);
const exitPoint = clampToPitch({
x: target.x + attackSign * (supportRole ? 4.2 : 6.4),
y: lerp(target.y, pitch.width / 2, touchlineTrap ? 0.32 : 0.12),
}, 2);
const exitGap = getNearestOpponentGap(receiver, exitPoint);
const exitSpace = clamp((exitGap - 1.8) / 6, 0, 1);
let trapPressure = 0;
let closeJumpers = 0;
let fastestTrapTime = Infinity;
let blindSidePressure = 0;
state.players.forEach((opponent) => {
if (opponent.team === receiver.team) {
return;
}
const gap = distance(opponent.position, target);
if (gap > 9) {
return;
}
const projection = projectPointOnSegmentWithRatio(opponent.position, startPoint, target);
const laneDistance = distance(opponent.position, projection.point);
const lateLane =
projection.ratio >= 0.72 &&
projection.ratio <= 1.02 &&
laneDistance <= 4.2;
const defenderReachDistance = Math.max(
gap - playerRadiusMeters * 0.75 - ballRadiusMeters * 0.35,
0
);
const defenderTime = computeTimeToCoverDistance(opponent, defenderReachDistance, target);
const canArrive = defenderTime <= ballEta + 0.58;
const closeness = clamp(1 - gap / 9, 0, 1);
const coverInfluence = getCoverShadowInfluence(opponent, target, startPoint);
const goalSide = (opponent.position.x - target.x) * attackSign;
const goalSidePressure = goalSide >= -1.2 && goalSide <= 7.5;
const receiverFacing = getPlayerFacingAngle(receiver);
const defenderAngle = angleBetween(target, opponent.position);
const blindSide = angleDifference(receiverFacing, defenderAngle) >= Math.PI / 2.15;
const trapInfluence =
closeness *
(0.28 +
coverInfluence * 0.28 +
(blindSide ? 0.18 : 0) +
(goalSidePressure ? 0.18 : 0) +
(lateLane && canArrive ? 0.22 : 0) +
(touchlineTrap && goalSidePressure ? 0.14 : 0));
trapPressure += trapInfluence;
fastestTrapTime = Math.min(fastestTrapTime, defenderTime);
blindSidePressure = Math.max(blindSidePressure, blindSide ? closeness : 0);
if ((canArrive && gap <= 4.2) || (lateLane && canArrive)) {
closeJumpers += 1;
}
});
trapPressure = clamp(trapPressure, 0, 1.4);
const receiverQuality =
receiverContext.profile.technicalSecurity * 0.3 +
receiverContext.profile.pressResistance * 0.24 +
receiverContext.profile.composure * 0.18 +
receiverContext.profile.perception * 0.16 +
receiverContext.profile.decisionSpeed * 0.12;
const escapeQuality = clamp(
receiveOrientation * 0.22 +
receiveFoot * 0.1 +
exitSpace * 0.22 +
receiverQuality * 0.32 +
(1 - (candidate.receiverPressure ?? getPlayerPressureLoad(receiver, target))) * 0.14 -
trapPressure * 0.34 -
Math.min(laneRisk.coverShadow ?? 0, 2) * 0.05,
0,
1
);
const labels = [];
let score = 0;
if (trapPressure >= 0.72 && escapeQuality < 0.52) {
score -= 0.34 + (trapPressure - escapeQuality) * 0.46 + (touchlineTrap ? 0.12 : 0);
labels.push("Receive trap: avoid locked feet");
} else if (escapeQuality >= 0.68 && trapPressure <= 0.74) {
score += 0.12 + exitSpace * 0.12 + receiverQuality * 0.08;
labels.push("Receive trap: first touch can escape");
}
if (closeJumpers >= 2 && !supportRole) {
score -= 0.14 + Math.min(closeJumpers - 1, 2) * 0.06;
}
if (supportRole && passDistance <= 18 && escapeQuality >= 0.56) {
score += 0.06 + (profile.shortSupport ?? 0) * 0.05;
labels.push("Receive trap: clean bounce option");
}
if (forwardRole && forwardGain >= 5 && blindSidePressure >= 0.45 && escapeQuality < 0.6) {
score -= 0.14;
}
return {
score: clamp(score, -0.92, 0.52),
labels: uniquePrincipleLabels(labels),
context: {
receiverId: receiver.id,
trapPressure: Number(trapPressure.toFixed(3)),
escapeQuality: Number(escapeQuality.toFixed(3)),
closeJumpers,
fastestTrapTime: Number.isFinite(fastestTrapTime)
? Number(fastestTrapTime.toFixed(2))
: null,
exitSpace: Number(exitSpace.toFixed(3)),
},
};
}

  return {
    getReceiverAvailabilityProfile,
    getAutoPilotReceiverAvailabilityAdjustment,
    getAutoPilotReceivePressureTrapAdjustment,
  };
}
