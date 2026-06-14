import { createGameSimulatorActionSpaceBallProfileBasics } from "./action-space-ball-profile-basics.mjs";
import { createGameSimulatorActionSpaceDribbleCarryPaths } from "./action-space-dribble-carry-paths.mjs";
import { createGameSimulatorActionSpaceDribbleCarryProfiles } from "./action-space-dribble-carry-profiles.mjs";
export function createGameSimulatorActionSpaceBallProfiles(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    autoBallProfiles,
    autoDribbleProfiles,
    clamp,
    clampToPitch,
    cloneVector,
    defensiveAggressionPresets,
    distance,
    getActionSpeed,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getBallOwner,
    getCompetitionPhysicalProfile,
    getFootUsageScore,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPressureAtPoint,
    getOrientationMovementProfile,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getRemainingBallDistance,
    getTeamAttackAngle,
    getWideSideSign,
    hasBallAction,
    isBylineZone,
    isCutbackTarget,
    isGoalkeeper,
    isInsideOpponentBox,
    isWideChannel,
    lerp,
    moveTowards,
    normalize,
    normalizeAngle,
    pitch,
    pitchSurfacePresets,
    state,
    subtract,
    teams,
    weatherPresets,
  } = deps;

const {
  getBallProfileDistanceRatio,
  getPitchSurfacePreset,
  getWeatherPreset,
  getDefensiveAggressionPreset,
  isAerialFlightStyle,
  getFlightStyleLabel,
  resolveBallCurveDirection,
  getBallTravelProgress,
  getBallTravelPoint,
  materializeBallProfile,
  getManualBallProfile,
} = createGameSimulatorActionSpaceBallProfileBasics({
  angleBetween,
  autoBallProfiles,
  clamp,
  defensiveAggressionPresets,
  distance,
  getCompetitionPhysicalProfile,
  getPlayerFacingAngle,
  lerp,
  normalize,
  normalizeAngle,
  pitch,
  pitchSurfacePresets,
  state,
  weatherPresets,
});

const {
  getDribbleRoleFamily,
  resolveAutoDribbleProfile,
  getNearestOpponentGapInCarryLane,
  getCarryLaneOpenSpaceScore,
  getCarryRunwayRoleCap,
  getCarryRunwayProfile,
  getRunwayCarryTarget,
  getBreakawayCarryTarget,
  getOpenGrassCarryContext,
} = createGameSimulatorActionSpaceDribbleCarryProfiles({
  angleBetween,
  angleDifference,
  autoDribbleProfiles,
  clamp,
  clampToPitch,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotRoleStrength,
  getManualBallProfile,
  getOffensiveRoleKey,
  getOpponentGoalCenter,
  getOpponentPressureAtPoint,
  getPitchSurfacePreset,
  getPitchThreatProfile,
  getPlayerDecisionContext,
  getPlayerFacingAngle,
  getPlayerMagnetLabel,
  getPlayerPressureLoad,
  getTeamAttackAngle,
  getWeatherPreset,
  getWideSideSign,
  isWideChannel,
  lerp,
  normalize,
  normalizeAngle,
  pitch,
  state,
  subtract,
  teams,
});

const {
  getQuadraticPoint,
  buildSampledCurvePath,
  getSampledPathPoint,
  buildDribbleCarryPath,
  getDribbleCarryPathPoint,
  setDribbleCarryPathForBall,
  getLiveDribbleSpeed,
} = createGameSimulatorActionSpaceDribbleCarryPaths({
  angleBetween,
  angleDifference,
  clamp,
  clampToPitch,
  cloneVector,
  distance,
  getAttackDirectionSign,
  getCarryLaneOpenSpaceScore,
  getCarryRunwayProfile,
  getFootUsageScore,
  getNearestOpponentGapInCarryLane,
  getOffensiveAutopilotProfile,
  getOrientationMovementProfile,
  getPlayerDecisionContext,
  getPlayerFacingAngle,
  isWideChannel,
  lerp,
  moveTowards,
  normalize,
  pitch,
  state,
});
function resolveAutoBallProfile(actionType, startPoint, targetPoint, initiator, receiverPlayerId = null) {
const actionDistance = distance(startPoint, targetPoint);
const teamId = initiator?.team ?? getBallOwner()?.team ?? "home";
const forwardMeters = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const lateralMeters = Math.abs(targetPoint.y - startPoint.y);
const attackingDepth = getAttackingDepth(startPoint, teamId);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
if (actionType === "shot") {
if (goalDistance <= 12) {
return materializeBallProfile("box-shot", actionDistance, "goal");
}
if (goalDistance <= 23.5) {
return materializeBallProfile("edge-shot", actionDistance, "goal");
}
return materializeBallProfile("long-shot", actionDistance, "goal");
}
if (actionType === "dribble") {
return getManualBallProfile("dribble");
}
if (actionType === "pass" && state.restartPhase?.type === "throwIn") {
return materializeBallProfile("throw-in", actionDistance, receiverPlayerId ? "to-feet" : "into-space");
}
const receiver = receiverPlayerId ? getPlayerById(receiverPlayerId) : null;
const receiverRole = receiver?.role ?? "";
const startsWide = isWideChannel(startPoint);
const startsByline = isBylineZone(startPoint, teamId);
const targetInBox = isInsideOpponentBox(targetPoint, teamId);
const targetIsCutback = isCutbackTarget(targetPoint, teamId);
const finalThirdDelivery = attackingDepth >= 68 && startsWide;
const freeKickDelivery = state.restartPhase?.type === "freeKick" && targetInBox;
if (freeKickDelivery) {
return materializeBallProfile("cross", actionDistance, receiver ? "to-feet" : "into-space");
}
if (receiver) {
if (isGoalkeeper(initiator) && actionDistance <= 18) {
return materializeBallProfile("gk-short-build", actionDistance, "to-feet");
}
if (finalThirdDelivery && targetIsCutback) {
return materializeBallProfile("cutback", actionDistance, "to-feet");
}
if (finalThirdDelivery && targetInBox) {
return materializeBallProfile("cross", actionDistance, "to-feet");
}
if (lateralMeters >= 18 && actionDistance >= 24) {
return materializeBallProfile("switch", actionDistance, "to-feet");
}
if (/striker|centre forward/i.test(receiverRole) && actionDistance >= 16 && forwardMeters >= 8) {
return materializeBallProfile("onto-9", actionDistance, "to-feet");
}
if (actionDistance <= 8.5) {
return materializeBallProfile("short-feet", actionDistance, "to-feet");
}
if (forwardMeters >= 6 && actionDistance <= 22) {
return materializeBallProfile("line-break", actionDistance, "to-feet");
}
if (actionDistance >= 18) {
return materializeBallProfile("driven-feet", actionDistance, "to-feet");
}
return materializeBallProfile("firm-feet", actionDistance, "to-feet");
}
if (finalThirdDelivery && (targetIsCutback || (startsByline && forwardMeters <= 2))) {
return materializeBallProfile("cutback", actionDistance, "into-space");
}
if (finalThirdDelivery && targetInBox) {
return materializeBallProfile("cross", actionDistance, "into-space");
}
if (lateralMeters >= 18 && actionDistance >= 24) {
return materializeBallProfile("switch", actionDistance, "into-space");
}
if (actionDistance <= 12) {
return materializeBallProfile("lead-space", actionDistance, "into-space");
}
return materializeBallProfile("into-space", actionDistance, "into-space");
}
function resolveBallActionProfile(
actionType,
startPoint,
targetPoint,
initiator,
receiverPlayerId = null,
speedMode = null
) {
const resolvedSpeedMode =
speedMode ?? (actionType === "dribble" ? state.dribbleSpeedMode : state.ballSpeedMode);
if (actionType === "dribble") {
return resolvedSpeedMode === "manual"
? getManualBallProfile("dribble")
: resolveAutoDribbleProfile(startPoint, targetPoint, initiator);
}
if (resolvedSpeedMode === "manual") {
const autoProfile = resolveAutoBallProfile(
actionType,
startPoint,
targetPoint,
initiator,
receiverPlayerId
);
return getManualBallProfile(actionType, autoProfile);
}
return resolveAutoBallProfile(actionType, startPoint, targetPoint, initiator, receiverPlayerId);
}
function resolveRecordedStepProfile(step) {
const startPoint = step.beforeSnapshot?.ball?.position ?? state.ball.position;
const initiator = getPlayerById(step.beforeSnapshot?.ball?.ownerPlayerId);
const distanceMeters = distance(startPoint, step.target);
if (step.actionType === "dribble") {
return {
...getManualBallProfile("dribble"),
key: step.profileKey ?? "carry",
label: step.profileLabel ?? "Carry",
source: step.speedMode ?? "manual",
averageSpeed: step.speed,
targetKind: step.targetKind ?? "carry",
};
}
if (step.actionType === "recovery") {
return {
key: step.profileKey ?? "loose-ball-recovery",
label: step.profileLabel ?? "Loose Ball Recovery",
source: step.speedMode ?? "auto",
averageSpeed: step.speed ?? 0,
targetKind: step.targetKind ?? "loose-ball",
launchMultiplier: 1,
rollFloor: 0,
flightStyle: "ground",
peakHeight: 0,
controlHeightThreshold: 0.12,
landingPhaseStart: 0.58,
curveAmount: 0,
spinRate: 0,
};
}
if ((step.speedMode ?? state.ballSpeedMode) === "manual") {
const savedProfileKey = step.profileKey && step.profileKey !== "manual"
? step.profileKey
: null;
const autoContextProfile = savedProfileKey
? materializeBallProfile(
savedProfileKey,
distanceMeters,
step.targetKind ?? (step.receiverPlayerId ? "to-feet" : "into-space"),
"auto"
)
: resolveAutoBallProfile(
step.actionType,
startPoint,
step.target,
initiator,
step.receiverPlayerId ?? null
);
return {
...getManualBallProfile(step.actionType, autoContextProfile),
key: savedProfileKey ?? autoContextProfile.key,
label: step.profileLabel && step.profileLabel !== "Manual Speed"
? step.profileLabel
: autoContextProfile.label,
source: "manual",
averageSpeed: step.speed,
targetKind: step.targetKind ?? autoContextProfile.targetKind,
};
}
const autoProfile = step.profileKey
? materializeBallProfile(
step.profileKey,
distanceMeters,
step.targetKind ?? (step.receiverPlayerId ? "to-feet" : "into-space"),
"auto"
)
: resolveAutoBallProfile(
step.actionType,
startPoint,
step.target,
initiator,
step.receiverPlayerId ?? null
);
return {
...autoProfile,
label: step.profileLabel ?? autoProfile.label,
averageSpeed: step.speed,
targetKind: step.targetKind ?? autoProfile.targetKind,
};
}
function applyResolvedBallProfile(profile) {
state.ball.profileKey = profile?.key ?? null;
state.ball.profileLabel = profile?.label ?? null;
state.ball.profileMode = profile?.source ?? state.ballSpeedMode;
state.ball.targetKind = profile?.targetKind ?? null;
state.ball.flightStyle = profile?.flightStyle ?? "ground";
state.ball.peakHeight = profile?.peakHeight ?? 0;
state.ball.height = 0;
state.ball.controlHeightThreshold = profile?.controlHeightThreshold ?? 0.12;
state.ball.landingPhaseStart = profile?.landingPhaseStart ?? 0.58;
state.ball.curveAmount = profile?.curveAmount ?? 0;
state.ball.spinRate = profile?.spinRate ?? 0;
state.ball.spinAngle = 0;
state.ball.trackDistanceCovered = 0;
state.ball.bounceCount = 0;
if (profile) {
state.ball.speed = profile.averageSpeed;
}
}
function getBallProfileLabel() {
if (state.sequence.phase === "transition") {
return "Transition";
}
if (state.ball.profileLabel) {
const flightLabel = getFlightStyleLabel(state.ball.flightStyle);
return state.ball.flightStyle === "ground"
? state.ball.profileLabel
: `${state.ball.profileLabel} • ${flightLabel}`;
}
if (state.ball.actionType === "dribble") {
return "Carry";
}
if (state.ball.actionType === "recovery") {
return "Loose Ball Recovery";
}
return state.ballSpeedMode === "auto" ? "Auto" : "Manual";
}
function getDisplayedBallSpeed() {
if (state.sequence.phase === "transition" && state.sequence.transition) {
const freeBallDistance = distance(
state.sequence.transition.ballStart,
state.sequence.transition.ballEnd
);
if (
state.sequence.transition.ballOwnerPlayerId ||
freeBallDistance <= 0.05 ||
state.sequence.transition.duration <= 0.01
) {
return null;
}
return freeBallDistance / state.sequence.transition.duration;
}
if (state.ball.inTransit) {
return state.ball.currentSpeed || state.ball.launchSpeed || getActionSpeed();
}
if (hasBallAction()) {
return state.ball.speed;
}
return null;
}
function getRemainingBallTravelTime() {
if (!hasBallAction()) {
return 0;
}
if (state.ball.actionType === "recovery") {
return Math.max((state.ball.recoveryDuration ?? 0) - state.ball.elapsedTravelTime, 0);
}
if (state.ball.actionType === "dribble") {
return getRemainingBallDistance() / Math.max(getActionSpeed(), 0.01);
}
const remainingDistance = getRemainingBallDistance();
if (remainingDistance <= 0.01) {
return 0;
}
const speedStart = Math.max(
state.ball.currentSpeed || state.ball.launchSpeed || getActionSpeed(),
0.01
);
const speedEnd = clamp(
state.ball.finalSpeed || Math.max(0.45, speedStart * 0.22),
0.01,
speedStart
);
return (2 * remainingDistance) / Math.max(speedStart + speedEnd, 0.01);
}
function updateBallFlightHeight() {
if (!isAerialFlightStyle(state.ball.flightStyle)) {
state.ball.height = 0;
return;
}
const progress = getBallTravelProgress();
const arcHeight = 4 * progress * (1 - progress);
const styleMultiplier =
state.ball.flightStyle === "clipped"
? 0.72
: state.ball.flightStyle === "driven"
? 0.46
: 1;
state.ball.height = Math.max(0, state.ball.peakHeight * arcHeight * styleMultiplier);
}
function getBallFlightControlFactor(actionType = state.ball.actionType) {
if (!isAerialFlightStyle(state.ball.flightStyle)) {
return 1;
}
const progress = getBallTravelProgress();
const threshold = Math.max(state.ball.controlHeightThreshold, 0.12);
const heightFactor = clamp(1 - state.ball.height / (threshold * 2.4), 0, 1);
const landingFactor = clamp(
(progress - (state.ball.landingPhaseStart - 0.12)) / 0.22,
0,
1
);
if (actionType === "shot" && state.ball.flightStyle === "driven") {
return clamp(0.42 + Math.max(heightFactor, landingFactor) * 0.58, 0.42, 1);
}
return Math.max(heightFactor, landingFactor);
}

  return {
    getBallProfileDistanceRatio,
    getPitchSurfacePreset,
    getWeatherPreset,
    getDefensiveAggressionPreset,
    isAerialFlightStyle,
    getFlightStyleLabel,
    resolveBallCurveDirection,
    getBallTravelProgress,
    getBallTravelPoint,
    materializeBallProfile,
    getManualBallProfile,
    getDribbleRoleFamily,
    resolveAutoDribbleProfile,
    getNearestOpponentGapInCarryLane,
    getCarryLaneOpenSpaceScore,
    getCarryRunwayRoleCap,
    getCarryRunwayProfile,
    getRunwayCarryTarget,
    getBreakawayCarryTarget,
    getOpenGrassCarryContext,
    getQuadraticPoint,
    buildSampledCurvePath,
    getSampledPathPoint,
    buildDribbleCarryPath,
    getDribbleCarryPathPoint,
    setDribbleCarryPathForBall,
    getLiveDribbleSpeed,
    resolveAutoBallProfile,
    resolveBallActionProfile,
    resolveRecordedStepProfile,
    applyResolvedBallProfile,
    getBallProfileLabel,
    getDisplayedBallSpeed,
    getRemainingBallTravelTime,
    updateBallFlightHeight,
    getBallFlightControlFactor,
  };
}
