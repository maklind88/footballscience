export function createGameSimulatorAutopilotRecoveryFirstActionDecisions(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getCarryLaneOpenSpaceScore,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getOpponentDensityAtPoint,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getRecentPossessionSteps,
    getRecordedStepActorIds,
    getRecordedStepDuration,
    getTeamSupportCountAroundPoint,
    isTransitionAttackStyle,
    lerp,
    pitch,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotRecoveryFirstActionContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
}
const recent = getRecentPossessionSteps(carrier.team, 5);
const lastStep = recent[0] ?? null;
const isRecovery =
lastStep?.actionType === "recovery" ||
lastStep?.profileKey === "loose-ball-recovery" ||
`${lastStep?.profileLabel ?? ""}`.toLowerCase().includes("loose ball");
if (!isRecovery) {
return { active: false, lastStep };
}
const actors = getRecordedStepActorIds(lastStep);
const recoveredByCarrier =
actors.receiverId === carrier.id ||
actors.carrierId === carrier.id ||
lastStep?.carrierPlayerId === carrier.id ||
lastStep?.afterSnapshot?.ball?.ownerPlayerId === carrier.id;
if (!recoveredByCarrier) {
return { active: false, lastStep, recoveredByCarrier };
}
const recoveryPoint =
lastStep?.target ??
lastStep?.afterSnapshot?.ball?.position ??
startPoint;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const opponentDensity = getOpponentDensityAtPoint(carrier.team, startPoint, 8.5);
const closeOpponentDensity = getOpponentDensityAtPoint(carrier.team, startPoint, 5.2);
const localSupport = getTeamSupportCountAroundPoint(
carrier.team,
startPoint,
new Set([carrier.id]),
13
);
const forwardProbe = clampToPitch({
x: startPoint.x + getAttackDirectionSign(carrier.team) * 18,
y: lerp(startPoint.y, pitch.width / 2, 0.28),
}, 2.5);
const forwardOpenSpace = getCarryLaneOpenSpaceScore(
getNearestOpponentGapInCarryLane(carrier, forwardProbe)
);
const recoveryDuration =
lastStep?.recoveryDuration ??
getRecordedStepDuration(lastStep);
const localTrap = clamp(
pressure * 0.52 +
Math.min(opponentDensity, 4) * 0.12 +
Math.min(closeOpponentDensity, 3) * 0.08 +
(localSupport <= 0 ? 0.18 : 0) +
(recoveryDuration >= 0.9 ? 0.06 : 0),
0,
1.25
);
return {
active: true,
lastStep,
recoveryPoint: cloneVector(recoveryPoint),
recoveryDuration,
pressure,
opponentDensity,
closeOpponentDensity,
localSupport,
localTrap,
forwardOpenSpace,
directStyle: isTransitionAttackStyle(profile.styleKey),
carrierRoleKey: getOffensiveRoleKey(carrier, teams[carrier.team]?.formation),
startThreat: getPitchThreatProfile(startPoint, carrier.team),
};
}
function getAutoPilotRecoveryFirstActionAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotRecoveryFirstActionContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const targetRadius = candidate.actionType === "dribble"
? 8.5
: passDistance >= 24
? 13.5
: 10.5;
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getOpponentPressureAtPoint(teamId, target, targetRadius + 1.5);
const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, targetRadius);
const targetSupport = getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean)),
candidate.actionType === "pass" && passDistance >= 22 ? 15 : 12
);
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const escapeGain =
distance(target, context.recoveryPoint) -
distance(startPoint, context.recoveryPoint);
const spaceGain =
(targetThreat.value ?? 0) -
(context.startThreat?.value ?? 0);
const lateralEscape = Math.abs(target.y - startPoint.y);
const safeFirstPass =
candidate.actionType === "pass" &&
passDistance >= 6 &&
passDistance <= 22 &&
laneClarity >= 0.5 &&
targetPressure <= 0.68 &&
targetSupport >= 1 &&
forwardGain >= -8 &&
(escapeGain >= 1.2 || lateralEscape >= 5 || targetOpponentDensity <= context.opponentDensity);
const carryOut =
candidate.actionType === "dribble" &&
forwardGain >= 2.5 &&
laneClarity >= 0.48 &&
targetPressure <= Math.max(0.48, context.pressure + 0.03) &&
targetOpponentDensity <= Math.max(2, context.opponentDensity);
const transitionRelease =
candidate.actionType === "pass" &&
forwardGain >= 7 &&
laneClarity >= 0.52 &&
targetPressure <= 0.7 &&
targetSupport >= 0 &&
(
context.directStyle ||
(profile.directness ?? 0.5) >= 0.6 ||
context.forwardOpenSpace >= 0.6 ||
spaceGain >= 0.18
);
const forcedLong =
candidate.actionType === "pass" &&
passDistance >= 28 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
!transitionRelease &&
context.localTrap >= 0.42;
const backwardsTrap =
candidate.actionType === "pass" &&
forwardGain < -6 &&
targetPressure >= 0.46 &&
targetSupport <= 1 &&
targetOpponentDensity >= Math.max(1, context.opponentDensity - 1);
const crowdedSameZone =
candidate.actionType !== "shot" &&
Math.abs(forwardGain) <= 3.5 &&
lateralEscape <= 4.5 &&
targetOpponentDensity >= context.opponentDensity &&
targetPressure >= 0.5;
const lowValueInstantShot =
candidate.actionType === "shot" &&
!candidate.mustShoot &&
(targetThreat.value ?? 0) < (context.startThreat?.value ?? 0) + 0.16 &&
(context.pressure >= 0.42 || context.localTrap >= 0.52);
const labels = [];
let score = 0;
if (context.localTrap >= 0.42 && safeFirstPass) {
score += 0.22 + context.localTrap * 0.24 + (profile.shortSupport ?? 0.5) * 0.12;
labels.push("Recovery first action: secure first pass");
}
if (carryOut) {
score +=
0.12 +
laneClarity * 0.18 +
Math.max(0, escapeGain) * 0.02 +
(profile.carryBias ?? 0.5) * 0.1;
labels.push("Recovery first action: carry out");
}
if (transitionRelease) {
score +=
0.16 +
(profile.directness ?? 0.5) * 0.18 +
context.forwardOpenSpace * 0.14 +
Math.max(0, spaceGain) * 0.28;
labels.push("Recovery first action: attack transition");
}
if (forcedLong) {
score -= 0.42 + context.localTrap * 0.22 + Math.max(0, 0.58 - laneClarity) * 0.24;
labels.push("Recovery first action: avoid forced long ball");
}
if (backwardsTrap) {
score -= 0.28 + targetPressure * 0.18;
labels.push("Recovery first action: avoid backwards trap");
}
if (crowdedSameZone) {
score -= 0.18 + context.localTrap * 0.16;
labels.push("Recovery first action: leave the collision zone");
}
if (lowValueInstantShot) {
score -= 0.22;
}
if (context.localSupport <= 0 && candidate.actionType === "pass" && !transitionRelease) {
score -= 0.12;
}
return {
score: clamp(score, -0.9, 0.78),
labels: uniquePrincipleLabels(labels),
context: {
localTrap: context.localTrap,
pressure: context.pressure,
opponentDensity: context.opponentDensity,
targetOpponentDensity,
localSupport: context.localSupport,
targetSupport,
forwardOpenSpace: context.forwardOpenSpace,
laneClarity,
escapeGain,
spaceGain,
safeFirstPass,
carryOut,
transitionRelease,
forcedLong,
backwardsTrap,
crowdedSameZone,
},
};
}

  return {
    getAutoPilotRecoveryFirstActionContext,
    getAutoPilotRecoveryFirstActionAdjustment,
  };
}
