export function createGameSimulatorActionSpaceBallProfileBasics(deps = {}) {
  const {
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
  } = deps;

function getBallProfileDistanceRatio(profile, distanceMeters) {
const span = Math.max(profile.maxDistance - profile.minDistance, 0.01);
return clamp((distanceMeters - profile.minDistance) / span, 0, 1);
}
function getPitchSurfacePreset(surfaceKey = state.surfacePreset) {
return pitchSurfacePresets[surfaceKey] ?? pitchSurfacePresets["hybrid-grass"];
}
function getWeatherPreset(weatherKey = state.weatherPreset) {
return weatherPresets[weatherKey] ?? weatherPresets.damp;
}
function getDefensiveAggressionPreset() {
return (
defensiveAggressionPresets[state.defensiveAggressionPreset] ??
defensiveAggressionPresets.balanced
);
}
function isAerialFlightStyle(flightStyle) {
return flightStyle === "clipped" || flightStyle === "lofted";
}
function getFlightStyleLabel(flightStyle) {
if (flightStyle === "lofted") {
return "Lofted";
}
if (flightStyle === "clipped") {
return "Clipped";
}
if (flightStyle === "driven") {
return "Driven";
}
return "Ground";
}
function resolveBallCurveDirection(startPoint, targetPoint, initiator) {
const travelAngle = angleBetween(startPoint, targetPoint);
if (initiator) {
const bodyDelta = normalizeAngle(travelAngle - getPlayerFacingAngle(initiator));
if (Math.abs(bodyDelta) > 0.08) {
return bodyDelta >= 0 ? 1 : -1;
}
if (initiator.preferredFoot === "left") {
return 1;
}
if (initiator.preferredFoot === "right") {
return -1;
}
}
const lateralTravel = targetPoint.y - startPoint.y;
if (Math.abs(lateralTravel) > 0.4) {
return lateralTravel >= 0 ? 1 : -1;
}
return startPoint.y <= pitch.width / 2 ? 1 : -1;
}
function getBallTravelProgress() {
const totalDistance = state.ball.trackDistanceTotal || distance(state.ball.startPosition, state.ball.target);
if (totalDistance <= 0.01) {
return 1;
}
if (state.ball.trackDistanceCovered > 0) {
return clamp(state.ball.trackDistanceCovered / totalDistance, 0, 1);
}
return clamp(distance(state.ball.startPosition, state.ball.position) / totalDistance, 0, 1);
}
function getBallTravelPoint(progress) {
const clampedProgress = clamp(progress, 0, 1);
const basePoint = {
x: lerp(state.ball.startPosition.x, state.ball.target.x, clampedProgress),
y: lerp(state.ball.startPosition.y, state.ball.target.y, clampedProgress),
};
const totalDistance = state.ball.trackDistanceTotal || distance(state.ball.startPosition, state.ball.target);
if (totalDistance <= 0.01 || Math.abs(state.ball.curveAmount) <= 0.01) {
return basePoint;
}
const direction = normalize(state.ball.startPosition, state.ball.target);
const lateral = { x: -direction.y, y: direction.x };
const curveShape = Math.sin(Math.PI * clampedProgress) * (0.96 + (1 - clampedProgress) * 0.08);
const offset = state.ball.curveAmount * curveShape * (state.ball.curveDirection || 1);
return {
x: basePoint.x + lateral.x * offset,
y: basePoint.y + lateral.y * offset,
};
}
function materializeBallProfile(profileKey, distanceMeters, targetKind, source = "auto") {
const template = autoBallProfiles[profileKey] ?? autoBallProfiles["firm-feet"];
const ratio = getBallProfileDistanceRatio(template, distanceMeters);
const ballPowerMultiplier = source === "auto"
? getCompetitionPhysicalProfile().ballPowerMultiplier
: 1;
return {
key: template.key,
label: template.label,
source,
targetKind,
averageSpeed: lerp(template.averageSpeedRange[0], template.averageSpeedRange[1], ratio) * ballPowerMultiplier,
launchMultiplier: lerp(template.launchMultiplierRange[0], template.launchMultiplierRange[1], ratio),
rollFloor: lerp(template.rollFloorRange[0], template.rollFloorRange[1], ratio) * ballPowerMultiplier,
flightStyle: template.flightStyle ?? "ground",
peakHeight: lerp(template.peakHeightRange?.[0] ?? 0, template.peakHeightRange?.[1] ?? 0, ratio),
controlHeightThreshold: lerp(
template.controlHeightRange?.[0] ?? 0.12,
template.controlHeightRange?.[1] ?? 0.12,
ratio
),
landingPhaseStart: lerp(
template.landingPhaseRange?.[0] ?? 0.58,
template.landingPhaseRange?.[1] ?? 0.58,
ratio
),
curveAmount: lerp(template.curveRange?.[0] ?? 0, template.curveRange?.[1] ?? 0, ratio),
spinRate: lerp(template.spinRateRange?.[0] ?? 0, template.spinRateRange?.[1] ?? 0, ratio),
distanceRatio: ratio,
};
}
function getManualBallProfile(actionType, baseProfile = null) {
if (actionType === "dribble") {
return {
key: "carry",
label: "Carry",
source: "manual",
targetKind: "carry",
averageSpeed: state.dribbleSpeed,
launchMultiplier: 1,
rollFloor: state.dribbleSpeed,
flightStyle: "ground",
peakHeight: 0,
controlHeightThreshold: 0.12,
landingPhaseStart: 0.58,
curveAmount: 0,
spinRate: 0,
distanceRatio: 0,
};
}
if (baseProfile) {
return {
...baseProfile,
source: "manual",
averageSpeed: state.ball.manualSpeed,
};
}
return {
key: "firm-feet",
label: "Firm To Feet",
source: "manual",
targetKind: actionType === "shot" ? "goal" : "to-feet",
averageSpeed: state.ball.manualSpeed,
launchMultiplier: actionType === "shot" ? 1.24 : 1.14,
rollFloor: actionType === "shot" ? 2.4 : 1.2,
flightStyle: actionType === "shot" ? "driven" : "ground",
peakHeight: actionType === "shot" ? 0.5 : 0,
controlHeightThreshold: actionType === "shot" ? 0.26 : 0.12,
landingPhaseStart: actionType === "shot" ? 0.72 : 0.58,
curveAmount: 0,
spinRate: actionType === "shot" ? 2.2 : 0,
distanceRatio: 0,
};
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
  };
}
