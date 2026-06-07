export function createGameSimulatorActionSpaceMetrics(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    autoBallProfiles,
    autoDribbleProfiles,
    ballRadiusMeters,
    blendAngles,
    buildPlayerIntelligenceProfile,
    clamp,
    clampToPitch,
    cloneVector,
    computeTimeToCoverDistance,
    defensiveAggressionPresets,
    distance,
    firstTouchModes,
    getActionSpeed,
    getAutoPilotFlowContext,
    getAutoPilotRoleStrength,
    getBallAwareBodyAngle,
    getBallControlOffsetMeters,
    getBallOwner,
    getCompetitionPhysicalProfile,
    getDefensiveAutopilotLineKey,
    getDefensivePhaseKey,
    getFootUsageScore,
    getGoalkeeperForTeam,
    getNearestOpponentGap,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOtherTeamId,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPlannedPossessionTeamId,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getTeamAttackAngle,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isFrontLineRole,
    isSupportRole,
    keepSecurePossessionOnlyForOwner,
    lerp,
    moveTowards,
    normalize,
    normalizeAngle,
    pitch,
    pitchSurfacePresets,
    playerRadiusMeters,
    projectPointOnSegmentWithRatio,
    rotatePlayerBodyTowardAngle,
    setSecurePossessionAfterControlledTouch,
    subtract,
    teams,
    uniquePrincipleLabels,
    vec,
    weatherPresets,
    getState,
  } = deps;
  const state = new Proxy({}, {
    get(_target, property) {
      return getState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const currentState = getState?.() ?? {};
      if (!Object.prototype.hasOwnProperty.call(currentState, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentState[property],
      };
    },
  });

function getRemainingBallDistance() {
if (state.ball.trackDistanceTotal > 0 && (state.ball.actionType !== "dribble" || state.ball.dribblePath)) {
return Math.max(0, state.ball.trackDistanceTotal - state.ball.trackDistanceCovered);
}
return distance(state.ball.position, state.ball.target);
}
function hasBallAction() {
return state.ball.actionType !== null && (getRemainingBallDistance() > 0.05 || state.ball.inTransit);
}
function getActionOrigin(player) {
return player.actionOrigin ?? player.position;
}
function getProjectedActionDuration() {
if (state.sequence.phase === "transition" && state.sequence.transition) {
return state.sequence.transition.duration;
}
if (!hasBallAction()) {
return 0;
}
return state.ball.elapsedTravelTime + getRemainingBallTravelTime();
}
function getCurrentActionDuration() {
if (state.sequence.phase === "transition" && state.sequence.transition) {
return state.sequence.transition.elapsed;
}
return hasBallAction() ? state.ball.elapsedTravelTime : 0;
}
function getActionInitiator() {
if (state.ball.actionType === "dribble") {
return getPlayerById(state.ball.carrierPlayerId ?? state.ball.initiatorPlayerId);
}
return getPlayerById(state.ball.initiatorPlayerId);
}
function getOrientationTurnDelay(player, targetPoint = state.ball.target) {
if (!targetPoint) {
return 0;
}
const desiredAngle = angleBetween(player.position, targetPoint);
const bodyAngle = getPlayerFacingAngle(player);
const angleGap = angleDifference(bodyAngle, desiredAngle) / Math.PI;
const profile = player.intelligenceProfile ?? buildPlayerIntelligenceProfile(player);
return clamp(
angleGap * (0.03 + (1 - profile.tacticalDiscipline) * 0.14 + (1 - profile.perception) * 0.06),
0,
0.22
);
}
function getOrientationMovementProfile(player, targetPoint = state.ball.target) {
if (!targetPoint) {
return {
angleGap: 0,
angleGapRatio: 0,
accelerationMultiplier: 1,
speedMultiplier: 1,
coverModifier: 1,
receiveModifier: 1,
recoveryModifier: 1,
};
}
const desiredAngle = angleBetween(player.position, targetPoint);
const angleGap = angleDifference(getPlayerFacingAngle(player), desiredAngle);
const angleGapDegrees = (angleGap * 180) / Math.PI;
if (angleGapDegrees <= 30) {
return {
angleGap,
angleGapRatio: angleGap / Math.PI,
accelerationMultiplier: 1,
speedMultiplier: 1,
coverModifier: 1,
receiveModifier: 1,
recoveryModifier: 1,
};
}
if (angleGapDegrees <= 75) {
return {
angleGap,
angleGapRatio: angleGap / Math.PI,
accelerationMultiplier: 0.93,
speedMultiplier: 0.97,
coverModifier: 0.92,
receiveModifier: 0.94,
recoveryModifier: 0.95,
};
}
if (angleGapDegrees <= 135) {
return {
angleGap,
angleGapRatio: angleGap / Math.PI,
accelerationMultiplier: 0.82,
speedMultiplier: 0.9,
coverModifier: 0.79,
receiveModifier: 0.82,
recoveryModifier: 0.84,
};
}
return {
angleGap,
angleGapRatio: angleGap / Math.PI,
accelerationMultiplier: 0.68,
speedMultiplier: 0.82,
coverModifier: 0.64,
receiveModifier: 0.7,
recoveryModifier: 0.72,
};
}
function getCoverShadowInfluence(player, lanePoint, sourcePoint = state.ball.position) {
const laneProfile = getOrientationMovementProfile(player, lanePoint);
const ballAngle = sourcePoint ? angleBetween(player.position, sourcePoint) : getPlayerFacingAngle(player);
const bodyAngle = getPlayerFacingAngle(player);
const bodyToBall = 1 - angleDifference(bodyAngle, ballAngle) / Math.PI;
const forwardCover = laneProfile.coverModifier;
return clamp(
0.34 + forwardCover * 0.46 + bodyToBall * 0.2,
0.3,
1.02
);
}
function getReceiveOrientationScore(player, incomingPoint = state.ball.startPosition) {
if (!incomingPoint) {
return 0.84;
}
const idealHalfOpenAngle = getBestReceiveBodyAngle(player, incomingPoint);
const bodyAngle = getPlayerFacingAngle(player);
const receiveProfile = getOrientationMovementProfile(player, incomingPoint);
const halfOpenAlignment = 1 - angleDifference(bodyAngle, idealHalfOpenAngle) / Math.PI;
return clamp(
halfOpenAlignment * 0.66 + receiveProfile.receiveModifier * 0.34,
0.18,
0.98
);
}
function getBestReceiveBodyAngle(player, incomingPoint = state.ball.startPosition) {
const nextPlayAngle = getTeamAttackAngle(player.team);
if (!incomingPoint) {
return normalizeAngle(nextPlayAngle + Math.PI / 7.5);
}
const receiveFromBallAngle = angleBetween(player.position, incomingPoint);
const relativeBallAngle = normalizeAngle(receiveFromBallAngle - nextPlayAngle);
const fallbackSide =
Math.sign(normalizeAngle(getPlayerFacingAngle(player) - nextPlayAngle)) ||
(incomingPoint.y < player.position.y ? -1 : 1);
const openSide = Math.sign(relativeBallAngle) || fallbackSide;
const openOffsetMagnitude = clamp(
Math.max(Math.abs(relativeBallAngle) * 0.28, Math.PI / 9),
Math.PI / 9,
Math.PI / 5.2
);
const openBodyAngle = normalizeAngle(nextPlayAngle + openSide * openOffsetMagnitude);
return blendAngles(receiveFromBallAngle, openBodyAngle, 0.28, 0.72);
}
function getReceiveFootUsageScore(player, incomingPoint = state.ball.startPosition) {
if (!player || !incomingPoint) {
return 0.82;
}
const receiveFromBallAngle = angleBetween(player.position, incomingPoint);
const idealReceiveAngle = getBestReceiveBodyAngle(player, incomingPoint);
return getFootUsageScore(player, receiveFromBallAngle, idealReceiveAngle);
}
function applyBestReceiveBodyAngle(player, incomingPoint = state.ball.startPosition, blend = 1) {
if (!player) {
return;
}
const desiredAngle = getBestReceiveBodyAngle(player, incomingPoint);
const currentAngle = getPlayerFacingAngle(player);
const delta = normalizeAngle(desiredAngle - currentAngle);
player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
}
function getFirstTouchModeLabel(mode) {
return firstTouchModes[mode] ?? firstTouchModes.auto;
}
function resolveFirstTouchMode(player, incomingPoint, requestedMode = state.firstTouchMode) {
if (!player) {
return "auto";
}
if (requestedMode && requestedMode !== "auto" && firstTouchModes[requestedMode]) {
return requestedMode;
}
const context = getPlayerDecisionContext(player);
const pressure = getPlayerPressureLoad(player, getPlayerBallControlPoint(player));
const isWide = isWideChannel(player.position);
const isPassToFeet = state.ball.targetKind === "to-feet" || state.ball.receiverPlayerId === player.id;
const profileKey = state.ball.profileKey ?? "";
const isProgressiveReceivingProfile =
profileKey === "line-break" ||
profileKey === "onto-9" ||
profileKey === "lead-space" ||
profileKey === "into-space";
const canPlayForward =
context.profile.decisionQuality >= 0.72 &&
context.profile.technicalSecurity >= 0.7 &&
pressure <= 0.5;
if (pressure >= 0.62) {
return "kill";
}
if (isPassToFeet && !isProgressiveReceivingProfile) {
return "kill";
}
if (isWide && pressure <= 0.42 && !isPassToFeet) {
return "inside";
}
if (canPlayForward) {
return "forward";
}
const incomingAngle = incomingPoint ? angleBetween(incomingPoint, player.position) : getPlayerFacingAngle(player);
const isPassAcrossBody =
angleDifference(incomingAngle, getTeamAttackAngle(player.team)) > Math.PI / 3.2;
return isPassAcrossBody && !isPassToFeet ? "across" : "kill";
}
function getFirstTouchDirectionAngle(player, mode, incomingPoint = state.ball.startPosition) {
const attackDirection = getAttackDirectionSign(player.team);
const towardCenterSign = Math.sign(pitch.width / 2 - player.position.y) || 1;
if (mode === "kill") {
return getBestReceiveBodyAngle(player, incomingPoint);
}
if (mode === "forward") {
return getTeamAttackAngle(player.team);
}
if (mode === "inside") {
return Math.atan2(towardCenterSign * 0.95, attackDirection * 0.65);
}
if (mode === "outside") {
return Math.atan2(-towardCenterSign * 0.95, attackDirection * 0.55);
}
if (mode === "back") {
return Math.atan2(towardCenterSign * 0.25, -attackDirection);
}
const incomingSide =
incomingPoint ? Math.sign(player.position.y - incomingPoint.y) || towardCenterSign : towardCenterSign;
return Math.atan2(-incomingSide * 0.88, attackDirection * 0.72);
}
function getFirstTouchDistance(player, mode, firstTouchQuality, requestedMode = state.ball.firstTouchMode) {
if (mode === "kill") {
return 0;
}
const pressure = getPlayerPressureLoad(player, getPlayerBallControlPoint(player));
const quality = clamp(firstTouchQuality, 0.2, 0.98);
const pressureReduction = pressure * 0.72;
const autoTouchMultiplier = requestedMode === "auto" ? 0.68 : 1;
const baseDistances = {
forward: [0.85, 2.05],
inside: [0.72, 1.75],
outside: [0.68, 1.65],
back: [0.45, 1.15],
across: [0.62, 1.55],
};
const [minDistance, maxDistance] = baseDistances[mode] ?? baseDistances.forward;
return clamp(
(lerp(minDistance, maxDistance, quality) - pressureReduction) * autoTouchMultiplier,
mode === "back" ? 0.28 : 0.42,
maxDistance * autoTouchMultiplier
);
}
function clearAutoPilotReceiveMomentum(ownerPlayerId = null) {
if (!state.autoPilotPlay?.receiveMomentum) {
return;
}
if (!ownerPlayerId || state.autoPilotPlay.receiveMomentum.ownerPlayerId !== ownerPlayerId) {
state.autoPilotPlay.receiveMomentum = null;
}
}
function setAutoPilotReceiveMomentum(
player,
mode,
incomingPoint,
firstTouchQuality,
directionAngle,
touchDistance
) {
if (!state.autoPilotPlay || !player) {
return;
}
const attackAngle = getTeamAttackAngle(player.team);
const receivePoint = cloneVector(getPlayerBallControlPoint(player));
const pressureAtReceive = getPlayerPressureLoad(player, receivePoint);
state.autoPilotPlay.receiveMomentum = {
ownerPlayerId: player.id,
teamId: player.team,
mode,
quality: clamp(firstTouchQuality, 0, 1),
directionAngle,
touchDistance: Math.max(0, touchDistance),
forwardIntent: Math.cos(normalizeAngle(directionAngle - attackAngle)),
lateralIntent: Math.sin(normalizeAngle(directionAngle - attackAngle)),
pressureAtReceive,
point: receivePoint,
createdAt: state.time,
expiresAt: state.time + 5.5,
stepIndex: (state.sequence?.steps?.length ?? 0) + 1,
};
}
function getAutoPilotReceiveMomentum(carrier, startPoint) {
const momentum = state.autoPilotPlay?.receiveMomentum;
if (!carrier || !momentum || momentum.ownerPlayerId !== carrier.id || momentum.teamId !== carrier.team) {
return null;
}
const currentStepIndex = state.sequence?.steps?.length ?? 0;
if (currentStepIndex > momentum.stepIndex) {
clearAutoPilotReceiveMomentum();
return null;
}
if (state.time > momentum.expiresAt) {
clearAutoPilotReceiveMomentum();
return null;
}
if (distance(momentum.point, startPoint) > 5.5) {
clearAutoPilotReceiveMomentum();
return null;
}
return momentum;
}
function getAutoPilotReceiveMomentumAdjustment(candidate, carrier, startPoint, profile) {
const momentum = getAutoPilotReceiveMomentum(carrier, startPoint);
if (!momentum || !candidate?.target) {
return { score: 0, labels: [] };
}
const pressure = getPlayerPressureLoad(carrier, startPoint);
const actionDistance = distance(startPoint, candidate.target);
const actionAngle = actionDistance > 0.2 ? angleBetween(startPoint, candidate.target) : momentum.directionAngle;
const alignment = Math.cos(normalizeAngle(actionAngle - momentum.directionAngle));
const attackSign = getAttackDirectionSign(carrier.team);
const forwardGain = Number.isFinite(candidate.forwardGain)
? candidate.forwardGain
: (candidate.target.x - startPoint.x) * attackSign;
const passDistance = candidate.actionType === "pass" ? actionDistance : 0;
const isControlledTouch = momentum.quality >= 0.62;
const labels = [];
let score = 0;
if (momentum.mode === "kill" || momentum.mode === "back") {
if (candidate.actionType === "pass" && passDistance <= 20 && forwardGain >= -6) {
score += 0.12 + Math.max(0, pressure - 0.25) * 0.18;
labels.push("Secure next action");
}
if (forwardGain >= 12 && pressure >= 0.55 && !candidate.isLineBreak) {
score -= 0.18 + pressure * 0.12;
}
} else {
if (candidate.actionType === "dribble" && forwardGain >= 3 && alignment >= 0.18) {
score += 0.2 + momentum.touchDistance * 0.08 + Math.max(0, alignment) * 0.12;
labels.push("Carry first touch");
}
if (
candidate.actionType === "pass" &&
(candidate.isLineBreak || forwardGain >= 6) &&
alignment >= -0.1
) {
score += 0.14 + (profile.tempo ?? 0) * 0.08 + momentum.quality * 0.08;
labels.push("Play from receive");
}
if (forwardGain <= -4 && pressure <= 0.48 && isControlledTouch) {
score -= 0.28 + Math.max(0, momentum.forwardIntent) * 0.18;
}
if (candidate.isSwitch && momentum.mode === "inside") {
score += 0.08 + (profile.switchBias ?? 0) * 0.08;
labels.push("Open body switch");
}
}
if (
momentum.touchDistance >= 0.8 &&
candidate.actionType === "dribble" &&
actionDistance <= 12 &&
alignment >= 0.45
) {
score += 0.14;
}
return {
score: clamp(score, -0.5, 0.7),
labels: uniquePrincipleLabels(labels),
};
}
function getAutoPilotFirstActionAfterReceiveAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier) {
return { score: 0, labels: [] };
}
const flow = getAutoPilotFlowContext(carrier, startPoint);
const momentum = getAutoPilotReceiveMomentum(carrier, startPoint);
if (!flow.carrierJustReceived && !momentum) {
return { score: 0, labels: [] };
}
const teamId = carrier.team;
const pressure = flow.pressure;
const depth = getAttackingDepth(startPoint, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const targetThreat = getPitchThreatProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const receivedBetweenLines =
startThreat.betweenLines >= 0.36 ||
startThreat.centralPocket >= 0.28 ||
(depth >= 42 && depth <= 74 && Math.abs(startPoint.y - pitch.width / 2) <= 23);
const openBody =
isPlayerFacingForward(carrier, Math.PI / 2.15) ||
(momentum?.forwardIntent ?? 0) >= 0.2 ||
momentum?.mode === "inside";
const hasForwardTime = pressure <= 0.52 && (openBody || startThreat.centrality >= 0.5);
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
const highValueNextAction =
candidate.isLineBreak ||
candidate.isBoxPass ||
targetThreat.value >= startThreat.value + 0.08 ||
actionSpace.value >= 0.46 ||
forwardGain >= 6.5;
const bounceBackToPasser =
candidate.actionType === "pass" &&
candidate.receiverPlayerId &&
candidate.receiverPlayerId === flow.lastCarrierId &&
flow.lastReceiverId === carrier.id;
const sterileSideways =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
Math.abs(forwardGain) < 3.2 &&
passDistance <= 18 &&
targetThreat.value <= startThreat.value + 0.04;
const supportSecure =
candidate.actionType === "pass" &&
passDistance <= 18 &&
(isSupportRole(receiverRoleKey) || receiverRoleKey === "gk" || receiverRoleKey === "rest");
const labels = [];
let score = 0;
if (hasForwardTime && receivedBetweenLines) {
if (candidate.actionType === "dribble" && forwardGain >= 3.5) {
score +=
0.42 +
(progressionWindow.openLane ?? 0) * 0.24 +
getPlayerTendency(carrier, "dribble") * 0.16;
labels.push("Carry from receive");
}
if (candidate.actionType === "pass" && highValueNextAction && forwardGain >= 1.5) {
score +=
0.34 +
actionSpace.value * 0.28 +
(candidate.isLineBreak ? 0.18 : 0) +
(isFrontLineRole(receiverRoleKey) ? 0.08 : 0);
labels.push("Receive to play forward");
}
if (candidate.actionType === "shot" && (startThreat.box >= 0.18 || depth >= 68)) {
score += 0.28 + profile.shootBias * 0.18;
labels.push("Face goal");
}
if (forwardGain <= -4.5 && !candidate.isSwitch) {
score -= 0.68 + profile.progressionUrgency * 0.28 + startThreat.value * 0.16;
} else if (sterileSideways) {
score -= 0.34 + profile.progressionUrgency * 0.18;
}
}
if (momentum) {
const actionAngle = passDistance > 0.2
? angleBetween(startPoint, candidate.target)
: momentum.directionAngle;
const receiveAlignment = Math.cos(normalizeAngle(actionAngle - momentum.directionAngle));
if (candidate.actionType === "dribble" && receiveAlignment >= 0.28 && forwardGain >= 3) {
score += 0.16 + momentum.quality * 0.12;
}
if (candidate.actionType === "pass" && highValueNextAction && receiveAlignment >= -0.15) {
score += 0.12 + momentum.quality * 0.08;
}
if (receiveAlignment <= -0.45 && pressure <= 0.5 && !supportSecure && !candidate.isSwitch) {
score -= 0.22 + momentum.quality * 0.12;
}
}
if (bounceBackToPasser) {
const thirdPlayerAllowance =
pressure >= 0.58 ||
candidate.isLineBreak ||
highValueNextAction ||
(supportSecure && getPlayerTendency(carrier, "passAndMove") >= 0.68);
score -= thirdPlayerAllowance ? 0.18 : 0.82;
}
if (pressure >= 0.62 && supportSecure && forwardGain >= -7) {
score += 0.22 + profile.shortSupport * 0.18;
labels.push("Secure under pressure");
}
if (
candidate.actionType === "pass" &&
forwardGain <= -6 &&
pressure <= 0.42 &&
receivedBetweenLines &&
targetThreat.value < startThreat.value + 0.02
) {
score -= 0.34 + profile.progressionUrgency * 0.22;
}
return {
score: clamp(score, -1.15, 0.9),
labels: uniquePrincipleLabels(labels),
};
}
function getAutoPilotReceiveFlowContext(carrier, startPoint, profile) {
if (!carrier || !startPoint) {
return { active: false };
}
const flow = getAutoPilotFlowContext(carrier, startPoint);
const momentum = getAutoPilotReceiveMomentum(carrier, startPoint);
if (!flow.carrierJustReceived && !momentum) {
return { active: false };
}
const teamId = carrier.team;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const depth = getAttackingDepth(startPoint, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const nearestOpponentGap = getNearestOpponentGap(carrier, startPoint);
const closeOpponents = getOpponentDensityAtPoint(teamId, startPoint, 6);
const supportCount = getTeamDensityAtPoint(teamId, startPoint, 13, new Set([carrier.id]));
const forwardProbe = clampToPitch({
x: startPoint.x + getAttackDirectionSign(teamId) * 14,
y: lerp(startPoint.y, pitch.width / 2, 0.22),
}, 2.5);
const openLane = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, forwardProbe));
const facingForward =
isPlayerFacingForward(carrier, Math.PI / 2.25) ||
(momentum?.forwardIntent ?? 0) >= 0.18 ||
momentum?.mode === "inside";
const receivedBetweenLines =
startThreat.betweenLines >= 0.34 ||
startThreat.centralPocket >= 0.26 ||
(depth >= 42 && depth <= 76 && Math.abs(startPoint.y - pitch.width / 2) <= 23);
const canTurn = clamp(
(facingForward ? 0.28 : 0) +
openLane * 0.28 +
clamp((nearestOpponentGap - 2.4) / 7.8, 0, 1) * 0.22 +
(receivedBetweenLines ? 0.18 : 0) +
(momentum?.quality ?? 0.6) * 0.1 -
pressure * 0.22 -
closeOpponents * 0.06,
0,
1
);
const secureNeed = clamp(
pressure * 0.52 +
closeOpponents * 0.15 +
(nearestOpponentGap <= 2.4 ? 0.18 : 0) -
supportCount * 0.06 -
(momentum?.quality ?? 0.6) * 0.08,
0,
1
);
const finishNeed = clamp(
startThreat.box * 0.42 +
startThreat.centralPocket * 0.28 +
(depth >= 70 ? 0.18 : 0) +
(pressure <= 0.5 ? 0.1 : 0) +
(profile.shootBias ?? 0.45) * 0.16,
0,
1
);
const switchWindow = clamp(
(profile.switchBias ?? 0.45) * 0.26 +
(flow.recentWideTargets >= 1 ? 0.14 : 0) +
(pressure >= 0.42 ? 0.12 : 0) +
(Math.abs(startPoint.y - pitch.width / 2) >= 13 ? 0.12 : 0),
0,
1
);
return {
active: true,
flow,
momentum,
pressure,
depth,
startThreat,
nearestOpponentGap,
closeOpponents,
supportCount,
openLane,
facingForward,
receivedBetweenLines,
canTurn,
secureNeed,
finishNeed,
switchWindow,
};
}
function getAutoPilotReceiveFlowAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier) {
return { score: 0, labels: [] };
}
const context = getAutoPilotReceiveFlowContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [] };
}
const teamId = carrier.team;
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const supportTarget =
candidate.actionType === "pass" &&
passDistance <= 19 &&
(isSupportRole(receiverRoleKey) || receiverRoleKey === "rest" || receiverRoleKey === "gk");
const progressiveTarget =
forwardGain >= 4.5 &&
(candidate.isLineBreak ||
candidate.isBoxPass ||
actionSpace.value >= 0.38 ||
targetThreat.value >= context.startThreat.value + 0.06);
const sterileRecycle =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2 &&
targetThreat.value <= context.startThreat.value + 0.04 &&
actionSpace.lineBreakCount === 0;
const bounceBackToPasser =
candidate.actionType === "pass" &&
candidate.receiverPlayerId &&
candidate.receiverPlayerId === context.flow.lastCarrierId &&
context.flow.lastReceiverId === carrier.id;
const labels = [];
let score = 0;
if (context.canTurn >= 0.58) {
if (candidate.actionType === "dribble" && forwardGain >= 3) {
score += 0.28 + context.canTurn * 0.26 + context.openLane * 0.18;
labels.push("Turn and carry");
}
if (candidate.actionType === "pass" && progressiveTarget) {
score += 0.24 + actionSpace.value * 0.24 + context.canTurn * 0.14;
labels.push("Turn to play forward");
}
if (candidate.actionType === "shot" && context.finishNeed >= 0.38) {
score += 0.26 + context.finishNeed * 0.28;
labels.push("Receive to finish");
}
if (sterileRecycle && context.pressure <= 0.52) {
score -= 0.42 + context.canTurn * 0.22 + (profile.progressionUrgency ?? 0.5) * 0.18;
}
}
if (context.secureNeed >= 0.56) {
if (supportTarget && forwardGain >= -8) {
score += 0.22 + context.secureNeed * 0.2 + (profile.shortSupport ?? 0.5) * 0.12;
labels.push("Secure next pass");
}
if (candidate.actionType === "dribble" && (context.closeOpponents >= 2 || context.openLane <= 0.42)) {
score -= 0.34 + context.secureNeed * 0.18;
}
if (
candidate.actionType === "pass" &&
passDistance >= 25 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
actionSpace.openTarget < 0.62
) {
score -= 0.28 + context.secureNeed * 0.16;
}
}
if (context.switchWindow >= 0.42 && candidate.isSwitch) {
score += 0.16 + context.switchWindow * 0.22 + (profile.switchBias ?? 0.45) * 0.08;
labels.push("Receive and switch");
}
if (bounceBackToPasser) {
const usefulBounce =
context.secureNeed >= 0.64 ||
context.pressure >= 0.62 ||
candidate.isLineBreak ||
(supportTarget && context.supportCount <= 1);
score += usefulBounce ? 0.08 : -0.5;
}
if (
context.receivedBetweenLines &&
candidate.actionType === "pass" &&
forwardGain <= -5 &&
context.pressure <= 0.44 &&
!candidate.isSwitch
) {
score -= 0.38 + context.startThreat.value * 0.18;
}
return {
score: clamp(score, -0.95, 1.05),
labels: uniquePrincipleLabels(labels),
context,
};
}
function getReceiveContinuationCarryTarget(carrier, startPoint, context, profile = {}) {
const attackAngle = getTeamAttackAngle(carrier.team);
const directionAngle = context.momentum?.directionAngle ?? attackAngle;
const forwardIntent = Math.cos(normalizeAngle(directionAngle - attackAngle));
const canDriveForward = context.canTurn >= 0.54 && context.openLane >= 0.42;
const distanceMeters = clamp(
5.5 +
context.openLane * 6.4 +
getAutoPilotRoleStrength(carrier, "dribbler") * 2.8 +
(profile.dribbleBias ?? 0.5) * 1.6 -
context.pressure * 2.6,
4.2,
canDriveForward ? 13.5 : 8.5
);
const correctedAngle =
forwardIntent >= 0.12 || context.momentum?.mode === "inside"
? blendAngles(directionAngle, attackAngle, 0.72, 0.28)
: blendAngles(directionAngle, attackAngle, 0.46, 0.54);
return clampToPitch({
x: startPoint.x + Math.cos(correctedAngle) * distanceMeters,
y: startPoint.y + Math.sin(correctedAngle) * distanceMeters,
}, 2.5);
}
function buildAutoPilotReceiveContinuationCandidate(carrier, startPoint, profile) {
const context = getAutoPilotReceiveFlowContext(carrier, startPoint, profile);
if (!context.active || state.restartPhase?.type) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const options = [];
const addPassOption = (receiver, target, meta = {}) => {
if (!receiver || receiver.team !== teamId || receiver.id === carrier.id || isPassReceiverOffside(receiver, startPoint)) {
return;
}
const passDistance = distance(startPoint, target);
if (passDistance < 3.4 || passDistance > (meta.maxDistance ?? 28)) {
return;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const laneClarity = computePassLaneClarity(carrier, target, { receiverPlayerId: receiver.id });
const receiverPressure = getPlayerPressureLoad(receiver, target);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const isLineBreak = forwardGain >= 6.5 && (actionSpace.lineBreakCount >= 1 || targetThreat.value >= context.startThreat.value + 0.08);
const isBoxPass = targetThreat.box >= 0.24 || (getAttackingDepth(target, teamId) >= 74 && Math.abs(target.y - pitch.width / 2) <= 17);
const isSwitch = Math.abs(getPitchLaneIndex(target) - getPitchLaneIndex(startPoint)) >= 2 && passDistance >= 15;
const isSidewaysPass = Math.abs(forwardGain) < 4 && Math.abs(target.y - startPoint.y) >= 6.5 && !isSwitch;
const bounceBackToPasser = receiver.id === context.flow.lastCarrierId && context.flow.lastReceiverId === carrier.id;
const supportNearTarget = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, receiver.id]), passDistance >= 22 ? 15 : 11);
const roleFit =
meta.kind === "escape"
? (isSupportRole(roleKey) || roleKey === "rest" || roleKey === "gk" ? 0.42 : 0.14)
: isFrontLineRole(roleKey)
? 0.36
: roleKey === "connector"
? 0.32
: roleKey === "pivot"
? 0.22
: 0.12;
const score =
(meta.baseScore ?? 1.35) +
laneClarity * 0.92 +
getAutoPilotRoleStrength(receiver, "receiver") * 0.34 +
roleFit +
actionSpace.value * 0.42 +
Math.max(0, targetThreat.value - context.startThreat.value) * 0.64 +
(isLineBreak ? 0.42 + (profile.lineBreakBias ?? 0.5) * 0.22 : 0) +
(isBoxPass ? 0.3 + (profile.deliveryBias ?? 0.45) * 0.16 : 0) +
(meta.kind === "escape" ? context.secureNeed * 0.46 + (profile.shortSupport ?? 0.5) * 0.2 : 0) +
(meta.kind === "thirdMan" ? context.canTurn * 0.24 + (profile.tempo ?? 0.5) * 0.14 : 0) +
(isSwitch ? context.switchWindow * 0.32 + (profile.switchBias ?? 0.45) * 0.16 : 0) +
clamp(supportNearTarget, 0, 3) * 0.08 -
receiverPressure * 0.42 -
Math.max(0, passDistance - 18) * 0.035 -
(bounceBackToPasser && context.pressure < 0.58 ? 0.78 : 0) -
(forwardGain <= -5 && context.canTurn >= 0.56 && context.pressure <= 0.48 ? 0.54 : 0);
if (score < (meta.minScore ?? 1.7)) {
return;
}
options.push({
actionType: "pass",
target,
receiverPlayerId: receiver.id,
receiverRoleKey: roleKey,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
supportNearTarget,
isLineBreak,
isSwitch,
isSidewaysPass,
isBoxPass,
isPrinciplePattern: true,
principleKey: meta.kind === "escape" ? "receive-escape" : "receive-third-player",
principleLabel: meta.kind === "escape"
? `Receive flow: ${getPlayerMagnetLabel(carrier)} secures the next pass under pressure`
: `Receive flow: ${getPlayerMagnetLabel(carrier)} finds the next player after first touch`,
score,
firstTouchMode: isLineBreak || isBoxPass ? "forward" : isSwitch ? "inside" : meta.kind === "escape" ? "inside" : "forward",
label: meta.kind === "escape" ? "receive escape" : isLineBreak ? "receive third-player" : "receive continuation",
reason: meta.kind === "escape"
? "receiver is under pressure and plays the next support angle"
: "first touch opens the next forward action",
});
};
state.players.forEach((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id) {
return;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
const target = getPlayerBallControlPoint(receiver);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const isThirdManRole =
isFrontLineRole(roleKey) ||
roleKey === "connector" ||
(roleKey === "wideBack" && (profile.overlapBias ?? 0) >= 0.56);
const isSupportRoleTarget =
isSupportRole(roleKey) ||
roleKey === "rest" ||
roleKey === "gk";
if (
context.canTurn >= 0.48 &&
isThirdManRole &&
forwardGain >= -1 &&
receiver.id !== context.flow.lastCarrierId
) {
addPassOption(receiver, target, {
kind: "thirdMan",
baseScore: 1.48,
minScore: 1.78,
maxDistance: context.receivedBetweenLines ? 30 : 24,
});
}
if (context.secureNeed >= 0.54 && isSupportRoleTarget) {
addPassOption(receiver, target, {
kind: "escape",
baseScore: 1.42,
minScore: 1.62,
maxDistance: 19,
});
}
});
if (context.canTurn >= 0.52 && context.openLane >= 0.38 && context.pressure <= 0.68) {
const target = getReceiveContinuationCarryTarget(carrier, startPoint, context, profile);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const actionDistance = distance(startPoint, target);
const score =
1.5 +
context.canTurn * 0.52 +
context.openLane * 0.42 +
getAutoPilotRoleStrength(carrier, "dribbler") * 0.38 +
(profile.carryBias ?? 0.5) * 0.22 +
Math.max(0, forwardGain) * 0.035 +
actionSpace.value * 0.32 -
context.pressure * 0.34;
if (forwardGain >= 2.5 && actionDistance >= 4 && score >= 1.72) {
options.push({
actionType: "dribble",
target,
receiverPlayerId: null,
passDistance: actionDistance,
forwardGain,
laneClarity: 0.72,
receiverPressure: context.pressure,
isLineBreak: actionSpace.lineBreakCount >= 1,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: actionSpace.targetThreat.box >= 0.22,
isPrinciplePattern: true,
principleKey: "receive-carry",
principleLabel: `Receive flow: ${getPlayerMagnetLabel(carrier)} takes the first touch into space`,
score,
firstTouchMode: null,
label: "receive and carry",
reason: "first touch opens a carry lane",
});
}
}
if (!options.length) {
return null;
}
return options.sort((a, b) => b.score - a.score)[0];
}
function applyControlledFirstTouch(player, incomingPoint, firstTouchQuality, requestedMode = state.ball.firstTouchMode) {
if (!player) {
return null;
}
const mode = resolveFirstTouchMode(player, incomingPoint, requestedMode);
const directionAngle = getFirstTouchDirectionAngle(player, mode, incomingPoint);
rotatePlayerBodyTowardAngle(player, directionAngle, mode === "kill" ? 0.55 : 0.86);
const touchDistance = getFirstTouchDistance(player, mode, firstTouchQuality, requestedMode);
if (touchDistance <= 0.05) {
state.ball.ownerPlayerId = player.id;
keepSecurePossessionOnlyForOwner(player.id);
state.ball.position = cloneVector(getPlayerBallControlPoint(player));
state.ball.target = cloneVector(state.ball.position);
setSecurePossessionAfterControlledTouch(player, state.ball.position, {
quality: firstTouchQuality,
reason: "controlled-reception",
minDistanceToExpire: mode === "kill" ? 3.6 : 4.6,
minTimeToExpire: mode === "kill" ? 0.78 : 1.08,
});
setAutoPilotReceiveMomentum(player, mode, incomingPoint, firstTouchQuality, directionAngle, touchDistance);
return mode;
}
const controlOffset = getBallControlOffsetMeters();
const currentControlPoint = getPlayerBallControlPoint(player);
const desiredControlPoint = clampToPitch({
x: currentControlPoint.x + Math.cos(directionAngle) * touchDistance,
y: currentControlPoint.y + Math.sin(directionAngle) * touchDistance,
});
player.position = clampToPitch({
x: desiredControlPoint.x - Math.cos(directionAngle) * controlOffset,
y: desiredControlPoint.y - Math.sin(directionAngle) * controlOffset,
});
player.bodyAngle = directionAngle;
state.ball.ownerPlayerId = player.id;
state.ball.secondBallContext = null;
keepSecurePossessionOnlyForOwner(player.id);
state.ball.position = cloneVector(getPlayerBallControlPoint(player));
state.ball.target = cloneVector(state.ball.position);
setSecurePossessionAfterControlledTouch(player, state.ball.position, {
quality: firstTouchQuality,
reason: "controlled-reception",
minDistanceToExpire: mode === "kill" ? 3.8 : 5.2,
minTimeToExpire: mode === "kill" ? 0.82 : 1.18,
});
setAutoPilotReceiveMomentum(player, mode, incomingPoint, firstTouchQuality, directionAngle, touchDistance);
return mode;
}
function shouldUseAutoPilotActiveFirstTouch(receiver, firstTouchQuality) {
const requestedMode = state.draftStep?.firstTouchMode ?? state.ball.firstTouchMode;
if (!state.draftStep?.autoGenerated || !requestedMode || requestedMode === "auto" || requestedMode === "kill") {
return false;
}
const pressure = receiver ? getPlayerPressureLoad(receiver, getPlayerBallControlPoint(receiver)) : 1;
return firstTouchQuality >= 0.56 && pressure <= 0.62;
}
function getLiveBallFocusPoint() {
if (!state.ball.inTransit) {
const owner = getBallOwner();
if (owner) {
return getPlayerBallControlPoint(owner);
}
}
return state.ball.position;
}
function getSpacePassTargetPoint() {
if (state.ball.actionType === "pass" && !state.ball.receiverPlayerId && state.ball.target) {
return state.ball.target;
}
if (state.draftStep?.actionType === "pass" && !state.draftStep.receiverPlayerId && state.draftStep.target) {
return state.draftStep.target;
}
return null;
}
function getPlayerOrientationFocus(player) {
const liveBallPoint = getLiveBallFocusPoint();
const spacePassTarget = getSpacePassTargetPoint();
if (!player || !spacePassTarget) {
return {
point: liveBallPoint,
influenceRange: 11.5,
};
}
const distanceToTarget = distance(player.position, spacePassTarget);
const distanceToLiveBall = distance(player.position, liveBallPoint);
const shouldPrioritizeTargetSpace =
distanceToTarget <= 15.5 ||
distanceToTarget <= distanceToLiveBall + 2.4;
return {
point: shouldPrioritizeTargetSpace ? spacePassTarget : liveBallPoint,
influenceRange: shouldPrioritizeTargetSpace ? 14.5 : 11.5,
};
}
function getActiveMovementTarget(playerId) {
if (state.sequence.isPlaying && state.sequence.phase === "action" && state.sequence.actionTargets?.has(playerId)) {
return state.sequence.actionTargets.get(playerId);
}
if (state.sequence.isPlaying && state.sequence.phase === "transition" && state.sequence.transition?.playerTargets?.has(playerId)) {
return state.sequence.transition.playerTargets.get(playerId).end;
}
if (state.isRunning && state.activeActionTargets?.has(playerId)) {
return state.activeActionTargets.get(playerId);
}
return null;
}
function isPlayerReservedForReceiveShape(player) {
if (!player) {
return false;
}
if (state.ball.actionType === "pass" && state.ball.receiverPlayerId === player.id) {
return true;
}
if (state.draftStep?.actionType === "pass" && state.draftStep.receiverPlayerId === player.id) {
return true;
}
if (state.sequence.isPlaying && state.sequence.phase === "action") {
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.actionType === "pass" && step.receiverPlayerId === player.id) {
return true;
}
}
return false;
}
function applyNearbyBallOrientation(dt) {
const isLivePhase = state.isRunning || state.sequence.isPlaying;
const draggedPlayerIds = new Set(
state.drag?.type === "player"
? state.drag.playerIds ?? [state.drag.playerId].filter(Boolean)
: []
);
state.players.forEach((player) => {
if (draggedPlayerIds.has(player.id)) {
return;
}
if (state.ball.ownerPlayerId === player.id || state.ball.carrierPlayerId === player.id) {
return;
}
if (isPlayerReservedForReceiveShape(player)) {
return;
}
const activeMovementTarget = getActiveMovementTarget(player.id);
if (activeMovementTarget && distance(player.position, activeMovementTarget) > 0.08) {
return;
}
const { point: focusPoint, influenceRange } = getPlayerOrientationFocus(player);
if (!focusPoint) {
return;
}
const distanceToBall = distance(player.position, focusPoint);
const proximity = clamp(1 - (distanceToBall - 2.2) / influenceRange, 0, 1);
if (proximity <= 0.001) {
return;
}
const blend = clamp(
dt * (isLivePhase ? 0.42 + proximity * 1.15 : 0.7 + proximity * 2.2),
0,
isLivePhase ? 0.07 : 0.12
);
const desiredAngle = getBallAwareBodyAngle(player, focusPoint);
const maxTurn = dt * (isLivePhase ? 0.58 + proximity * 1.05 : 0.95 + proximity * 1.8);
rotatePlayerBodyTowardAngle(player, desiredAngle, blend, maxTurn);
});
}
function getPotentialPassReceiverAtTarget(initiator, target, receiverPlayerId = null) {
if (!initiator || !target) {
return null;
}
if (receiverPlayerId) {
return getPlayerById(receiverPlayerId);
}
return state.players
.filter((player) => player.team === initiator.team && player.id !== initiator.id)
.map((player) => ({
player,
gap: distance(getPlayerBallControlPoint(player), target),
}))
.filter((entry) => entry.gap <= 2.2)
.sort((a, b) => a.gap - b.gap)[0]?.player ?? null;
}
function getPassLaneRiskProfile(initiator, target, options = {}) {
if (!initiator) {
return {
clarity: 0.72,
obstruction: 0,
timingRisk: 0,
coverShadow: 0,
interceptors: 0,
averageSpeed: 11.5,
};
}
const context = getPlayerDecisionContext(initiator);
const startPoint = getPlayerBallControlPoint(initiator);
const receiver = getPotentialPassReceiverAtTarget(initiator, target, options.receiverPlayerId ?? null);
const ballProfile = resolveAutoBallProfile("pass", startPoint, target, initiator, receiver?.id ?? null);
const laneLength = Math.max(distance(startPoint, target), 0.01);
const averageSpeed = Math.max(ballProfile.averageSpeed ?? 11.5, 0.01);
const isAerial = isAerialFlightStyle(ballProfile.flightStyle);
const landingStart = ballProfile.landingPhaseStart ?? 0.58;
let obstruction = 0;
let timingRisk = 0;
let coverShadow = 0;
let interceptors = 0;
state.players.forEach((player) => {
if (player.team === initiator.team) {
return;
}
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, target);
const lanePoint = projection.point;
const laneProgress = clamp(projection.ratio, 0, 1);
if (laneProgress < 0.07 || laneProgress > 0.96) {
return;
}
const laneDistance = distance(player.position, lanePoint);
const laneWidth = lerp(2.15, 4.65, clamp(laneLength / 34, 0, 1)) * (isAerial ? 0.78 : 1);
if (laneDistance > laneWidth + 3.2) {
return;
}
const centrality = 1 - Math.abs(0.5 - laneProgress) * 1.4;
const coverInfluence = getCoverShadowInfluence(player, lanePoint, startPoint);
const ballTimeToLane = (laneLength * laneProgress) / averageSpeed;
const defenderReachDistance = Math.max(
laneDistance - playerRadiusMeters * 0.68 - ballRadiusMeters * 0.42,
0
);
const defenderTimeToLane = computeTimeToCoverDistance(player, defenderReachDistance, lanePoint);
const aerialControlFactor = isAerial
? laneProgress >= landingStart
? 0.96
: lerp(0.24, 0.58, laneProgress / Math.max(landingStart, 0.01))
: 1;
const timingFit = clamp((ballTimeToLane - defenderTimeToLane + 0.28) / 0.9, 0, 1);
const staticBlock = clamp(1 - laneDistance / Math.max(laneWidth + 1.2, 0.01), 0, 1);
const readQuality =
player.intelligenceProfile.perception * 0.36 +
player.intelligenceProfile.decisionSpeed * 0.26 +
player.intelligenceProfile.tacticalDiscipline * 0.18 +
player.intelligenceProfile.technicalSecurity * 0.1;
const segmentRisk =
staticBlock *
Math.max(0.22, centrality) *
aerialControlFactor *
(0.38 + timingFit * 0.72 + coverInfluence * 0.24) *
(0.74 + readQuality * 0.34);
obstruction +=
staticBlock * Math.max(0.25, centrality) * aerialControlFactor * (0.72 + coverInfluence * 0.42);
timingRisk = Math.max(timingRisk, segmentRisk);
coverShadow += coverInfluence * staticBlock * aerialControlFactor;
if (segmentRisk >= 0.5) {
interceptors += 1;
}
});
const clarity = clamp(
0.34 +
context.profile.perception * 0.28 +
context.profile.decisionQuality * 0.16 +
context.profile.technicalSecurity * 0.1 -
obstruction * 0.1 -
timingRisk * 0.2 -
Math.min(coverShadow, 2.4) * 0.035 -
Math.min(interceptors, 3) * 0.045 -
context.pressure * 0.1,
0.12,
0.98
);
return {
clarity,
obstruction,
timingRisk,
coverShadow,
interceptors,
averageSpeed,
};
}
function computePassLaneClarity(initiator, target, options = {}) {
return getPassLaneRiskProfile(initiator, target, options).clarity;
}
function getGoalMouthTarget(teamId, y, netDepth = 2.6) {
const side = getOpponentGoalSide(teamId);
const sign = getGoalDirectionSign(side);
const goalLineX = getGoalLineX(side);
const postPadding = 0.18;
return {
x: goalLineX + sign * netDepth,
y: clamp(y, pitch.width / 2 - 7.32 / 2 + postPadding, pitch.width / 2 + 7.32 / 2 - postPadding),
};
}
function getShotAngleQuality(startPoint, teamId) {
if (!startPoint || !teamId) {
return 0.42;
}
const goalLineX = getGoalLineX(getOpponentGoalSide(teamId));
const upperPost = { x: goalLineX, y: pitch.width / 2 - 7.32 / 2 };
const lowerPost = { x: goalLineX, y: pitch.width / 2 + 7.32 / 2 };
const openAngle = angleDifference(
angleBetween(startPoint, upperPost),
angleBetween(startPoint, lowerPost)
);
return clamp((openAngle - 0.055) / 0.62, 0, 1);
}
function getShotBlockRisk(shooter, target) {
if (!shooter || !target) {
return 0.18;
}
const startPoint = getPlayerBallControlPoint(shooter);
const laneLength = Math.max(distance(startPoint, target), 0.01);
const shotProfile = resolveAutoBallProfile("shot", startPoint, target, shooter, null);
const averageShotSpeed = Math.max(shotProfile.averageSpeed ?? 18, 0.01);
let obstruction = 0;
state.players.forEach((player) => {
if (player.team === shooter.team || isGoalkeeper(player)) {
return;
}
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, target);
if (projection.ratio <= 0.05 || projection.ratio >= 0.96) {
return;
}
const laneGap = distance(player.position, projection.point);
const laneWidth = lerp(3.15, 4.75, clamp(laneLength / 34, 0, 1));
if (laneGap > laneWidth) {
return;
}
const ballTimeToLane = (laneLength * projection.ratio) / averageShotSpeed;
const defenderTimeToLane = computeTimeToCoverDistance(
player,
distance(player.position, projection.point),
projection.point
);
const timingFit = clamp((ballTimeToLane - defenderTimeToLane + 0.32) / 0.92, 0, 1);
const progressWeight = projection.ratio < 0.28 ? 0.85 : projection.ratio < 0.72 ? 1 : 0.74;
const coverInfluence = getCoverShadowInfluence(player, projection.point, startPoint);
obstruction +=
(1 - laneGap / laneWidth) *
progressWeight *
(0.48 + timingFit * 0.72) *
(0.78 + coverInfluence * 0.34);
});
return clamp(obstruction * 0.38, 0, 0.94);
}
function getGoalkeeperTargetOpenness(teamId, target) {
const goalkeeper = getGoalkeeperForTeam(getOtherTeamId(teamId));
if (!goalkeeper || !target) {
return 0.58;
}
const side = getOpponentGoalSide(teamId);
const sign = getGoalDirectionSign(side);
const savePoint = clampToPitch({
x: getGoalLineX(side) - sign * 0.9,
y: target.y,
}, 0.25);
const context = getPlayerDecisionContext(goalkeeper);
const gap = distance(goalkeeper.position, savePoint);
const reachProfile =
1.25 +
context.profile.perception * 0.42 +
context.profile.decisionSpeed * 0.32 +
clamp(context.maxSpeed / 8.2, 0, 1) * 0.46;
return clamp((gap - reachProfile * 0.72) / 6.2, 0, 1);
}
function computeShotLaneClarity(shooter, target) {
if (!shooter) {
return 0.62;
}
const context = getPlayerDecisionContext(shooter);
const blockRisk = getShotBlockRisk(shooter, target);
const angleQuality = getShotAngleQuality(getPlayerBallControlPoint(shooter), shooter.team);
const goalkeeperOpenness = getGoalkeeperTargetOpenness(shooter.team, target);
return clamp(
0.3 +
context.profile.perception * 0.17 +
context.profile.decisionQuality * 0.15 +
context.profile.technicalSecurity * 0.12 +
angleQuality * 0.22 +
goalkeeperOpenness * 0.18 -
blockRisk * 0.58 -
context.pressure * 0.12,
0.08,
0.98
);
}
function getShotWindowProfile(shooter, startPoint, target) {
const teamId = shooter?.team;
const goal = teamId ? getOpponentGoalCenter(teamId) : target;
const goalDistance = distance(startPoint, goal);
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const angleQuality = teamId ? getShotAngleQuality(startPoint, teamId) : 0.42;
const blockRisk = getShotBlockRisk(shooter, target);
const laneClarity = computeShotLaneClarity(shooter, target);
const goalkeeperOpenness = teamId ? getGoalkeeperTargetOpenness(teamId, target) : 0.58;
const pressure = shooter ? getPlayerPressureLoad(shooter, getPlayerBallControlPoint(shooter)) : 0.5;
const finisherStrength = getAutoPilotRoleStrength(shooter, "finisher");
const quality = clamp(
angleQuality * 0.28 +
laneClarity * 0.26 +
goalkeeperOpenness * 0.18 +
finisherStrength * 0.18 +
centrality * 0.1 -
pressure * 0.18,
0,
1
);
return {
goalDistance,
centrality,
angleQuality,
blockRisk,
laneClarity,
goalkeeperOpenness,
pressure,
finisherStrength,
quality,
};
}
function getDeterministicShotNoise(seedText, salt = 0) {
const text = `${seedText}|${salt}`;
let hash = 2166136261;
for (let index = 0; index < text.length; index += 1) {
hash ^= text.charCodeAt(index);
hash = Math.imul(hash, 16777619);
}
const value = Math.sin((hash >>> 0) * 12.9898 + salt * 78.233) * 43758.5453;
return (value - Math.floor(value)) * 2 - 1;
}
function resolveExecutedShotTarget(shooter, intendedTarget, ballProfile = null) {
if (!shooter || !intendedTarget) {
state.ball.shotPlacement = null;
return intendedTarget ? cloneVector(intendedTarget) : null;
}
const startPoint = cloneVector(state.ball.startPosition ?? getPlayerBallControlPoint(shooter));
const shotWindow = getShotWindowProfile(shooter, startPoint, intendedTarget);
const context = getPlayerDecisionContext(shooter);
const footExecutionScore = getFootUsageScore(shooter, angleBetween(shooter.position, intendedTarget));
const executionQuality = clamp(
state.ball.executionQuality ??
(context.profile.technicalSecurity * 0.28 +
context.profile.executionUnderPressure * 0.22 +
context.profile.composure * 0.16 +
context.profile.decisionQuality * 0.14 +
footExecutionScore * 0.1 +
shotWindow.laneClarity * 0.1),
0.36,
0.98
);
const side = getOpponentGoalSide(shooter.team);
const sign = getGoalDirectionSign(side);
const goalLineX = getGoalLineX(side);
const intendedSideValue = (intendedTarget.x - goalLineX) * sign;
const intendedIsGoalward = intendedSideValue >= -1.25;
const targetKind = ballProfile?.targetKind ?? state.ball.targetKind ?? "shot";
const distanceStress = clamp((shotWindow.goalDistance - 13) / 30, 0, 1);
const pressureStress = clamp(shotWindow.pressure, 0, 1);
const angleStress = 1 - shotWindow.angleQuality;
const blockStress = clamp(shotWindow.blockRisk, 0, 1);
const opennessStress = 1 - shotWindow.goalkeeperOpenness;
const missRisk = clamp(
0.035 +
distanceStress * 0.16 +
pressureStress * 0.2 +
angleStress * 0.15 +
blockStress * 0.13 +
opennessStress * 0.06 -
executionQuality * 0.22 -
shotWindow.finisherStrength * 0.08,
0.02,
0.42
);
const seed = [
shooter.id,
state.sequence.steps.length,
startPoint.x.toFixed(2),
startPoint.y.toFixed(2),
intendedTarget.x.toFixed(2),
intendedTarget.y.toFixed(2),
targetKind,
state.ball.profileKey ?? "",
].join("|");
const lateralNoise = getDeterministicShotNoise(seed, 1);
const shapeNoise = getDeterministicShotNoise(seed, 2);
const mistakeNoise = getDeterministicShotNoise(seed, 3);
const baseSpread =
0.16 +
shotWindow.goalDistance * 0.015 +
pressureStress * 0.82 +
blockStress * 0.58 +
angleStress * 0.42 +
(1 - executionQuality) * 1.15;
const missBurst = mistakeNoise > 1 - missRisk * 2
? Math.sign(lateralNoise || 1) * lerp(0.55, 1.75, clamp(missRisk / 0.42, 0, 1))
: 0;
const lateralError = lateralNoise * baseSpread + shapeNoise * baseSpread * 0.34 + missBurst;
const executedTarget = {
x: intendedIsGoalward ? goalLineX + sign * 2.6 : intendedTarget.x,
y: clamp(intendedTarget.y + lateralError, 0.4, pitch.width - 0.4),
};
state.ball.shotPlacement = {
intendedTarget: cloneVector(intendedTarget),
executedTarget: cloneVector(executedTarget),
errorMeters: Math.abs(lateralError),
missRisk,
executionQuality,
pressure: pressureStress,
angleQuality: shotWindow.angleQuality,
blockRisk: shotWindow.blockRisk,
goalDistance: shotWindow.goalDistance,
};
return executedTarget;
}
function getAttackDirectionSign(teamId) {
return teamId === "home" ? 1 : -1;
}
function getAttackingDepth(point, teamId) {
return teamId === "home" ? point.x : pitch.length - point.x;
}
function getOpponentGoalCenter(teamId) {
return vec(teamId === "home" ? pitch.length : 0, pitch.width / 2);
}
function getDepthZoneKey(point, teamId) {
const depth = getAttackingDepth(point, teamId);
if (depth < 24) return "firstLine";
if (depth < 42) return "buildUp";
if (depth < 64) return "progression";
if (depth < 83) return "creation";
if (depth < 100) return "box";
return "goalLine";
}
function getDepthZoneLabel(depthZoneKey) {
const labels = {
firstLine: "first build-up space",
buildUp: "build-up space",
progression: "progression space",
creation: "chance-creation space",
box: "box space",
goalLine: "goal-line space",
};
return labels[depthZoneKey] ?? "open space";
}
function getLaneLabel(laneKey) {
const labels = {
leftWide: "left wide corridor",
leftHalf: "left half-space",
central: "central corridor",
rightHalf: "right half-space",
rightWide: "right wide corridor",
};
return labels[laneKey] ?? "corridor";
}
function getGoldenZoneScore(point, teamId) {
if (!point || !teamId) {
return 0;
}
const depth = getAttackingDepth(point, teamId);
const centralDistance = Math.abs(point.y - pitch.width / 2);
const centrality = clamp(1 - centralDistance / 15.5, 0, 1);
const depthValue =
depth < 56
? 0
: depth < 68
? (depth - 56) / 12
: depth <= 82
? 1
: clamp(1 - (depth - 82) / 10, 0, 1);
return clamp(depthValue * centrality, 0, 1);
}
function isGoldenZone(point, teamId, threshold = 0.52) {
return getGoldenZoneScore(point, teamId) >= threshold;
}
function getMedianNumber(values, fallback = 0) {
const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
if (!finiteValues.length) {
return fallback;
}
const middle = Math.floor(finiteValues.length / 2);
return finiteValues.length % 2
? finiteValues[middle]
: (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}
function getDepthQuantile(values, ratio, fallback = 0) {
const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
if (!finiteValues.length) {
return fallback;
}
const index = clamp(Math.round((finiteValues.length - 1) * ratio), 0, finiteValues.length - 1);
return finiteValues[index];
}
function getOpponentLineDepthsForAttackingTeam(teamId, referencePoint = state.ball.position) {
const opponentTeamId = getOtherTeamId(teamId);
if (!opponentTeamId) {
return {
forward: 34,
midfield: 54,
back: 78,
gk: pitch.length - 2,
};
}
const formation = teams[opponentTeamId]?.formation ?? "4-3-3";
const phaseKey = getDefensivePhaseKey(opponentTeamId, referencePoint ?? state.ball.position);
const lineDepths = {
forward: [],
midfield: [],
back: [],
gk: [],
};
const fieldDepths = [];
state.players
.filter((player) => player.team === opponentTeamId)
.forEach((player) => {
const lineKey = getDefensiveAutopilotLineKey(player, formation, phaseKey);
const depth = getAttackingDepth(player.position, teamId);
if (lineDepths[lineKey]) {
lineDepths[lineKey].push(depth);
}
if (lineKey !== "gk") {
fieldDepths.push(depth);
}
});
let forward = getMedianNumber(lineDepths.forward, getDepthQuantile(fieldDepths, 0.2, 34));
let midfield = getMedianNumber(lineDepths.midfield, getDepthQuantile(fieldDepths, 0.5, 54));
let back = getMedianNumber(lineDepths.back, getDepthQuantile(fieldDepths, 0.82, 78));
let gk = getMedianNumber(lineDepths.gk, pitch.length - 2);
forward = clamp(forward, 8, pitch.length - 32);
midfield = clamp(Math.max(midfield, forward + 6.5), forward + 6.5, pitch.length - 20);
back = clamp(Math.max(back, midfield + 7), midfield + 7, pitch.length - 8);
gk = clamp(Math.max(gk, back + 5.5), back + 5.5, pitch.length);
return {
forward,
midfield,
back,
gk,
};
}
function getAttackingGameSpaceProfile(point, teamId) {
if (!point || !teamId) {
return {
key: "outlet",
label: "outlet space",
index: 0,
depth: 0,
size: 0,
nextLineDepth: 34,
previousLineDepth: 0,
lineDepths: getOpponentLineDepthsForAttackingTeam(teamId, point),
};
}
const depth = getAttackingDepth(point, teamId);
const lineDepths = getOpponentLineDepthsForAttackingTeam(teamId, point);
const spaces = [
{
key: "outlet",
label: "outlet space",
index: 0,
from: 0,
to: lineDepths.forward,
},
{
key: "space1",
label: "space 1",
index: 1,
from: lineDepths.forward,
to: lineDepths.midfield,
},
{
key: "space2",
label: "space 2",
index: 2,
from: lineDepths.midfield,
to: lineDepths.back,
},
{
key: "space3",
label: "space 3",
index: 3,
from: lineDepths.back,
to: lineDepths.gk,
},
];
const activeSpace =
spaces.find((space) => depth >= space.from - 0.5 && depth < space.to + 0.5) ??
spaces[spaces.length - 1];
return {
...activeSpace,
depth,
size: Math.max(0, activeSpace.to - activeSpace.from),
nextLineDepth: activeSpace.to,
previousLineDepth: activeSpace.from,
lineDepths,
};
}
function getPitchSpaceProfile(point, teamId) {
if (!point || !teamId) {
return {
laneKey: "central",
laneLabel: "central corridor",
depthZoneKey: "buildUp",
depthZoneLabel: "build-up space",
gameSpaceKey: "outlet",
gameSpaceLabel: "outlet space",
gameSpaceIndex: 0,
gameSpaceSize: 0,
centralPocket: 0,
halfSpace: 0,
wideCorridor: 0,
betweenLines: 0,
assistZone: 0,
cutbackZone: 0,
box: 0,
behindLine: 0,
depth: 0,
centrality: 0,
value: 0,
primaryLabel: "open space",
};
}
const depth = getAttackingDepth(point, teamId);
const centralDistance = Math.abs(point.y - pitch.width / 2);
const centrality = clamp(1 - centralDistance / (pitch.width / 2), 0, 1);
const laneKey = getPitchLaneKey(point);
const depthZoneKey = getDepthZoneKey(point, teamId);
const isHalfSpaceLane = laneKey === "leftHalf" || laneKey === "rightHalf";
const isWideLane = laneKey === "leftWide" || laneKey === "rightWide";
const gameSpace = getAttackingGameSpaceProfile(point, teamId);
const centralPocket = getGoldenZoneScore(point, teamId);
const dynamicBetweenLines = gameSpace.key === "space2"
? clamp(gameSpace.size / 18, 0.25, 1) *
clamp(0.42 + centrality * 0.26 + (isHalfSpaceLane ? 0.18 : 0) - (isWideLane ? 0.12 : 0), 0, 1)
: 0;
const dynamicBehindLine = gameSpace.key === "space3"
? clamp(gameSpace.size / 15, 0.18, 1) *
clamp(0.38 + centrality * 0.2 + (isHalfSpaceLane ? 0.12 : 0), 0, 1)
: 0;
const dynamicSpaceOne = gameSpace.key === "space1"
? clamp(gameSpace.size / 20, 0.2, 1) *
clamp(0.22 + centrality * 0.18 + (isHalfSpaceLane ? 0.1 : 0), 0, 0.62)
: 0;
const halfSpace = isHalfSpaceLane && depth >= 42 && depth <= 88
? clamp(0.28 + (depth >= 58 ? 0.34 : 0.12) + (depth >= 72 ? 0.18 : 0), 0, 1)
: 0;
const wideCorridor = isWideLane && depth >= 34
? clamp(0.22 + (depth >= 58 ? 0.22 : 0) + (depth >= 74 ? 0.18 : 0), 0, 0.82)
: 0;
const betweenLines = Math.max(
depth >= 42 && depth <= 74 && centralDistance <= 23
? clamp(0.34 + centrality * 0.24 + (isHalfSpaceLane ? 0.16 : 0), 0, 1)
: 0,
dynamicBetweenLines
);
const box = depth >= 83 && depth <= 100
? clamp((1 - centralDistance / 22) * 0.78 + (depth >= 88 ? 0.22 : 0), 0, 1)
: 0;
const assistZone = depth >= 70 && depth <= 96 && centralDistance >= 18
? clamp((depth - 70) / 18, 0, 1) * clamp((centralDistance - 18) / 12, 0, 1)
: 0;
const cutbackZone = depth >= 84 && depth <= 98 && centralDistance >= 8 && centralDistance <= 24
? clamp((depth - 84) / 8, 0, 1) * clamp(1 - Math.abs(centralDistance - 15) / 10, 0, 1)
: 0;
const behindLine = Math.max(
depth >= 78
? clamp((depth - 78) / 14, 0, 1) * clamp(1 - centralDistance / 30, 0, 1)
: 0,
dynamicBehindLine
);
const value = clamp(
centralPocket * 0.24 +
betweenLines * 0.2 +
dynamicSpaceOne * 0.06 +
halfSpace * 0.16 +
wideCorridor * 0.08 +
assistZone * 0.16 +
cutbackZone * 0.2 +
box * 0.3 +
behindLine * 0.18,
0,
1
);
const primaryLabel =
box >= 0.4
? "box space"
: cutbackZone >= 0.42
? "cutback space"
: centralPocket >= 0.42
? "central pocket"
: betweenLines >= 0.42
? "between-lines space"
: assistZone >= 0.42
? "assist corridor"
: halfSpace >= 0.42
? getLaneLabel(laneKey)
: wideCorridor >= 0.42
? getLaneLabel(laneKey)
: getDepthZoneLabel(depthZoneKey);
return {
laneKey,
laneLabel: getLaneLabel(laneKey),
depthZoneKey,
depthZoneLabel: getDepthZoneLabel(depthZoneKey),
gameSpaceKey: gameSpace.key,
gameSpaceLabel: gameSpace.label,
gameSpaceIndex: gameSpace.index,
gameSpaceSize: gameSpace.size,
opponentLineDepths: gameSpace.lineDepths,
centralPocket,
zone14: centralPocket,
halfSpace,
wideCorridor,
betweenLines,
assistZone,
cutbackZone,
box,
behindLine,
depth,
centrality,
value,
primaryLabel,
};
}
function getPitchThreatProfile(point, teamId) {
if (!point || !teamId) {
return {
value: 0,
goldenZone: 0,
centralPocket: 0,
zone14: 0,
box: 0,
assistZone: 0,
cutbackZone: 0,
halfSpace: 0,
wideCorridor: 0,
betweenLines: 0,
behindLine: 0,
centrality: 0,
depth: 0,
laneKey: "central",
laneLabel: "central corridor",
depthZoneKey: "buildUp",
depthZoneLabel: "build-up space",
gameSpaceKey: "outlet",
gameSpaceLabel: "outlet space",
gameSpaceIndex: 0,
gameSpaceSize: 0,
primaryLabel: "open space",
};
}
const space = getPitchSpaceProfile(point, teamId);
const value = clamp(
space.value +
(space.depth >= 58 ? space.centrality * 0.06 : 0),
0,
1
);
return {
value,
goldenZone: space.centralPocket,
centralPocket: space.centralPocket,
zone14: space.centralPocket,
box: space.box,
assistZone: space.assistZone,
cutbackZone: space.cutbackZone,
halfSpace: space.halfSpace,
wideCorridor: space.wideCorridor,
betweenLines: space.betweenLines,
behindLine: space.behindLine,
centrality: space.centrality,
depth: space.depth,
laneKey: space.laneKey,
laneLabel: space.laneLabel,
depthZoneKey: space.depthZoneKey,
depthZoneLabel: space.depthZoneLabel,
gameSpaceKey: space.gameSpaceKey,
gameSpaceLabel: space.gameSpaceLabel,
gameSpaceIndex: space.gameSpaceIndex,
gameSpaceSize: space.gameSpaceSize,
opponentLineDepths: space.opponentLineDepths,
primaryLabel: space.primaryLabel,
};
}
function getOpponentPressureAtPoint(teamId, point, radius = 14) {
if (!teamId || !point) {
return 1;
}
let pressure = 0;
state.players.forEach((player) => {
if (player.team === teamId) {
return;
}
const gap = distance(player.position, point);
if (gap > radius) {
return;
}
const closeWeight = gap <= 3.5 ? 1.1 : gap <= 7 ? 0.76 : 0.38;
pressure += (1 - gap / radius) * closeWeight;
});
return clamp(pressure / 1.85, 0, 1);
}
function getNearestOpponentGapToPoint(teamId, point) {
if (!teamId || !point) {
return Infinity;
}
return state.players.reduce((nearest, player) => {
if (player.team === teamId) {
return nearest;
}
return Math.min(nearest, distance(player.position, point));
}, Infinity);
}
function getOpponentsBypassedByAction(startPoint, targetPoint, teamId) {
if (!startPoint || !targetPoint || !teamId) {
return 0;
}
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
if (forwardGain <= 3) {
return 0;
}
const startDepth = getAttackingDepth(startPoint, teamId);
const targetDepth = getAttackingDepth(targetPoint, teamId);
const laneLength = Math.max(distance(startPoint, targetPoint), 0.01);
return state.players.reduce((count, player) => {
if (player.team === teamId) {
return count;
}
const playerDepth = getAttackingDepth(player.position, teamId);
if (playerDepth <= startDepth + 1.5 || playerDepth >= targetDepth - 1) {
return count;
}
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
if (projection.ratio <= 0.08 || projection.ratio >= 0.96) {
return count;
}
const laneGap = distance(player.position, projection.point);
const laneWidth = lerp(5.2, 8.8, clamp(laneLength / 36, 0, 1));
return count + (laneGap <= laneWidth ? 1 : 0);
}, 0);
}
function getFootballSpacePriority(startPoint, targetPoint, teamId, profile = {}) {
if (!startPoint || !targetPoint || !teamId) {
return {
score: 0,
label: "open space",
targetSpace: getPitchSpaceProfile(targetPoint, teamId),
startSpace: getPitchSpaceProfile(startPoint, teamId),
lineBreakCount: 0,
forwardGain: 0,
targetPressure: 1,
gameSpaceGain: 0,
targetGameSpaceKey: "outlet",
startGameSpaceKey: "outlet",
};
}
const targetSpace = getPitchSpaceProfile(targetPoint, teamId);
const startSpace = getPitchSpaceProfile(startPoint, teamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const gameSpaceGain = (targetSpace.gameSpaceIndex ?? 0) - (startSpace.gameSpaceIndex ?? 0);
const lineBreakCount = getOpponentsBypassedByAction(startPoint, targetPoint, teamId);
const targetPressure = getOpponentPressureAtPoint(teamId, targetPoint);
const wideStyle = clamp(
(profile.widthDiscipline ?? 0.48) * 0.34 +
(profile.crossBias ?? 0.42) * 0.28 +
(profile.overlapBias ?? 0.42) * 0.28 +
(profile.switchBias ?? 0.42) * 0.1,
0,
1
);
const centralStyle = clamp(
(profile.shortSupport ?? 0.5) * 0.25 +
(profile.lineBreakBias ?? 0.5) * 0.28 +
(profile.progressionUrgency ?? 0.5) * 0.25 +
(profile.tempo ?? 0.5) * 0.22,
0,
1
);
const verticalStyle = clamp(
(profile.directness ?? 0.5) * 0.36 +
(profile.lineBreakBias ?? 0.5) * 0.32 +
(profile.carryBias ?? 0.42) * 0.16 +
(profile.risk ?? 0.42) * 0.16,
0,
1
);
const progressionValue = clamp(forwardGain / 22, -0.18, 0.78);
const threatGain = targetSpace.value - startSpace.value;
const centralAccess =
targetSpace.centralPocket * (0.42 + centralStyle * 0.24) +
targetSpace.betweenLines * (0.38 + centralStyle * 0.26);
const halfSpaceAccess =
targetSpace.halfSpace * (0.22 + centralStyle * 0.16 + wideStyle * 0.14) +
(targetSpace.assistZone >= 0.38 ? targetSpace.assistZone * (0.18 + wideStyle * 0.22) : 0);
const wideAccess =
targetSpace.wideCorridor * (0.08 + wideStyle * 0.3) +
targetSpace.assistZone * (0.2 + wideStyle * 0.28);
const finalActionAccess =
targetSpace.box * 0.52 +
targetSpace.cutbackZone * (0.34 + wideStyle * 0.24) +
targetSpace.behindLine * (0.22 + verticalStyle * 0.34 + (lineBreakCount >= 1 ? 0.18 : 0));
const lineBreakValue = clamp(lineBreakCount / 3, 0, 1) * (0.18 + verticalStyle * 0.28);
const gameSpaceEntryValue = clamp(gameSpaceGain / 2, 0, 1) * (0.2 + verticalStyle * 0.2);
const targetGameSpaceValue =
targetSpace.gameSpaceKey === "space3"
? 0.22 + verticalStyle * 0.22 + targetSpace.centrality * 0.08
: targetSpace.gameSpaceKey === "space2"
? 0.16 + centralStyle * 0.22 + targetSpace.centrality * 0.08 + (targetSpace.halfSpace >= 0.34 ? 0.08 : 0)
: targetSpace.gameSpaceKey === "space1" && forwardGain >= 3
? 0.08 + centralStyle * 0.08
: 0;
const openTargetValue = clamp((getNearestOpponentGapToPoint(teamId, targetPoint) - 2.4) / 9.2, 0, 1) * 0.12;
const lowValueWidePenalty =
targetSpace.wideCorridor >= 0.42 &&
targetSpace.depth < 62 &&
forwardGain < 4 &&
targetSpace.assistZone < 0.24
? 0.18 - wideStyle * 0.08
: 0;
const sterileRecyclePenalty =
forwardGain < 1.5 &&
targetSpace.value <= startSpace.value + 0.03 &&
targetSpace.depth < 72
? 0.22 + (profile.progressionUrgency ?? 0.5) * 0.16
: 0;
const backwardsSpacePenalty =
gameSpaceGain < 0 &&
targetSpace.value <= startSpace.value + 0.04 &&
targetPressure < 0.62
? Math.abs(gameSpaceGain) * (0.16 + (profile.progressionUrgency ?? 0.5) * 0.08)
: 0;
const pressurePenalty = targetPressure * (targetSpace.depth >= 64 ? 0.18 : 0.12);
const score = clamp(
centralAccess +
halfSpaceAccess +
wideAccess +
finalActionAccess +
targetGameSpaceValue +
Math.max(0, threatGain) * 0.34 +
progressionValue * 0.22 +
lineBreakValue +
gameSpaceEntryValue +
openTargetValue -
pressurePenalty -
lowValueWidePenalty -
sterileRecyclePenalty,
-0.55,
1.2
);
const adjustedScore = clamp(
score - backwardsSpacePenalty,
-0.55,
1.2
);
return {
score: adjustedScore,
label: targetSpace.primaryLabel,
targetSpace,
startSpace,
lineBreakCount,
forwardGain,
targetPressure,
threatGain,
gameSpaceGain,
targetGameSpaceKey: targetSpace.gameSpaceKey,
startGameSpaceKey: startSpace.gameSpaceKey,
centralAccess,
halfSpaceAccess,
wideAccess,
finalActionAccess,
};
}
function getActionSpaceValue(startPoint, targetPoint, teamId, profile = {}) {
const targetThreat = getPitchThreatProfile(targetPoint, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const threatGain = targetThreat.value - startThreat.value;
const targetPressure = getOpponentPressureAtPoint(teamId, targetPoint);
const nearestOpponentGap = getNearestOpponentGapToPoint(teamId, targetPoint);
const openTarget = Number.isFinite(nearestOpponentGap)
? clamp((nearestOpponentGap - 2.2) / 8.8, 0, 1)
: 1;
const lineBreakCount = getOpponentsBypassedByAction(startPoint, targetPoint, teamId);
const progressionValue = clamp(forwardGain / 24, -0.2, 0.85);
const centralLaneValue =
Math.abs(targetPoint.y - pitch.width / 2) <= 20 && targetThreat.depth >= 42
? 0.16
: 0;
const spacePriority = getFootballSpacePriority(startPoint, targetPoint, teamId, profile);
const value = clamp(
targetThreat.value * 0.28 +
Math.max(0, threatGain) * 0.48 +
progressionValue * 0.24 +
openTarget * 0.16 +
clamp(lineBreakCount / 3, 0, 1) * 0.26 +
clamp(spacePriority.gameSpaceGain / 2, 0, 1) * 0.18 +
spacePriority.score * 0.34 +
centralLaneValue -
targetPressure * 0.12,
0,
1.35
);
return {
value,
targetPressure,
nearestOpponentGap,
openTarget,
lineBreakCount,
forwardGain,
threatGain,
targetThreat,
startThreat,
spacePriority,
gameSpaceGain: spacePriority.gameSpaceGain,
targetGameSpaceKey: spacePriority.targetGameSpaceKey,
startGameSpaceKey: spacePriority.startGameSpaceKey,
};
}
function getTeamDensityAtPoint(teamId, point, radius = 12, excludedIds = new Set()) {
if (!teamId || !point) {
return 0;
}
return state.players.reduce((count, player) => {
if (player.team !== teamId || excludedIds.has(player.id) || isGoalkeeper(player)) {
return count;
}
return count + (distance(player.position, point) <= radius ? 1 : 0);
}, 0);
}
function getOpponentDensityAtPoint(teamId, point, radius = 12) {
if (!teamId || !point) {
return 0;
}
return state.players.reduce((count, player) => {
if (player.team === teamId || isGoalkeeper(player)) {
return count;
}
return count + (distance(player.position, point) <= radius ? 1 : 0);
}, 0);
}
function getSpaceDominanceProfile(startPoint, targetPoint, teamId, profile = {}, options = {}) {
if (!startPoint || !targetPoint || !teamId) {
return {
score: 0,
labels: [],
openAccess: 0,
supportBalance: 0,
congestion: 0,
turnWindow: 0,
lineBreakReward: 0,
overloadAdvantage: 0,
actionSpace: getActionSpaceValue(startPoint, targetPoint, teamId, profile),
};
}
const actionType = options.actionType ?? "pass";
const excludedIds = new Set(options.excludedIds ?? []);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const startThreat = actionSpace.startThreat;
const forwardGain = actionSpace.forwardGain;
const passDistance = distance(startPoint, targetPoint);
const nearRadius = actionType === "dribble" ? 9.5 : passDistance >= 26 ? 14 : 11.5;
const supportCount = getTeamDensityAtPoint(teamId, targetPoint, nearRadius, excludedIds);
const opponentCount = getOpponentDensityAtPoint(teamId, targetPoint, nearRadius);
const closeOpponents = getOpponentDensityAtPoint(teamId, targetPoint, 5.6);
const nearestOpponentGap = Number.isFinite(actionSpace.nearestOpponentGap)
? actionSpace.nearestOpponentGap
: getNearestOpponentGapToPoint(teamId, targetPoint);
const openAccess = Number.isFinite(nearestOpponentGap)
? clamp((nearestOpponentGap - 2.4) / 8.6, 0, 1)
: 1;
const supportBalance = clamp((supportCount + 1) / Math.max(opponentCount + 1, 1), 0, 2.2);
const overloadAdvantage = clamp((supportCount - opponentCount + 1) / 4, -0.35, 0.85);
const congestion = clamp(
opponentCount * 0.18 +
closeOpponents * 0.26 +
actionSpace.targetPressure * 0.38 -
supportCount * 0.06,
0,
1.25
);
const targetIsValuable =
targetThreat.value >= 0.46 ||
targetThreat.betweenLines >= 0.44 ||
targetThreat.centralPocket >= 0.4 ||
targetThreat.halfSpace >= 0.46 ||
targetThreat.box >= 0.26 ||
targetThreat.cutbackZone >= 0.34;
const turnWindow = clamp(
openAccess * 0.46 +
(supportBalance >= 1 ? 0.14 : 0) +
(targetThreat.betweenLines >= 0.36 || targetThreat.halfSpace >= 0.42 ? 0.18 : 0) +
(forwardGain >= 2 ? 0.12 : 0) -
closeOpponents * 0.12,
0,
1
);
const lineBreakReward = clamp(
actionSpace.lineBreakCount * 0.18 +
Math.max(0, forwardGain) / 30 +
Math.max(0, actionSpace.threatGain) * 0.42,
0,
1
);
const sterileArea =
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.04 &&
actionSpace.lineBreakCount === 0 &&
targetThreat.depth < 72;
const isolatedLongBall =
actionType === "pass" &&
passDistance >= 27 &&
forwardGain >= 8 &&
supportCount <= 0 &&
targetThreat.box < 0.2 &&
targetThreat.behindLine < 0.34;
const dribbleIntoTraffic =
actionType === "dribble" &&
forwardGain >= 3 &&
(closeOpponents >= 2 || (nearestOpponentGap <= 4.4 && actionSpace.lineBreakCount === 0));
const score = clamp(
actionSpace.value * 0.36 +
actionSpace.spacePriority.score * 0.28 +
openAccess * 0.2 +
overloadAdvantage * 0.18 +
turnWindow * 0.22 +
lineBreakReward * 0.24 +
(targetIsValuable && openAccess >= 0.46 ? 0.18 : 0) -
congestion * (targetIsValuable ? 0.22 : 0.34) -
(sterileArea ? 0.34 + (profile.progressionUrgency ?? 0.5) * 0.18 : 0) -
(isolatedLongBall ? 0.42 + (1 - (profile.routeOneBias ?? 0)) * 0.18 : 0) -
(dribbleIntoTraffic ? 0.46 - (profile.dribbleBias ?? 0.45) * 0.14 : 0),
-0.95,
1.05
);
const labels = [];
if (targetIsValuable && openAccess >= 0.5) {
labels.push(`Own ${targetThreat.primaryLabel}`);
}
if (turnWindow >= 0.58) {
labels.push("Can receive on the turn");
}
if (overloadAdvantage >= 0.26 && targetThreat.depth >= 38) {
labels.push("Local overload");
}
if (lineBreakReward >= 0.42) {
labels.push("Space behind next line");
}
if (congestion >= 0.72 && !targetIsValuable) {
labels.push("Avoid crowded space");
}
return {
score,
labels: uniquePrincipleLabels(labels),
openAccess,
supportBalance,
supportCount,
opponentCount,
closeOpponents,
congestion,
turnWindow,
lineBreakReward,
overloadAdvantage,
sterileArea,
isolatedLongBall,
dribbleIntoTraffic,
targetIsValuable,
actionSpace,
};
}
function getAutoPilotSpaceDominanceAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier) {
return {
score: 0,
labels: [],
dominance: null,
};
}
const excludedIds = [
carrier.id,
candidate.receiverPlayerId,
].filter(Boolean);
const dominance = getSpaceDominanceProfile(startPoint, candidate.target, carrier.team, profile, {
actionType: candidate.actionType,
excludedIds,
});
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetThreat = dominance.actionSpace.targetThreat;
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const labels = [...dominance.labels];
let score = dominance.score;
if (candidate.actionType === "pass") {
if (
dominance.turnWindow >= 0.56 &&
forwardGain >= 1 &&
passDistance <= 26 &&
(targetThreat.betweenLines >= 0.34 || targetThreat.halfSpace >= 0.38 || targetThreat.centralPocket >= 0.28)
) {
score += 0.2 + profile.shortSupport * 0.08;
labels.push("Play into turn window");
}
if (dominance.isolatedLongBall && profile.routeOneBias < 0.56) {
score -= 0.32;
}
if (
dominance.sterileArea &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
profile.phaseKey !== "buildUp"
) {
score -= 0.2 + profile.progressionUrgency * 0.18;
}
}
if (candidate.actionType === "dribble") {
if (dominance.openAccess >= 0.62 && forwardGain >= 5) {
score += 0.18 + profile.carryBias * 0.12;
labels.push("Carry into open lane");
}
if (dominance.dribbleIntoTraffic) {
score -= 0.3;
}
}
if (candidate.actionType === "shot") {
score += targetThreat.box * 0.14 + targetThreat.centralPocket * 0.12;
if (targetThreat.box >= 0.3 || targetThreat.centralPocket >= 0.42) {
labels.push("Shot from high-value space");
}
}
return {
score: clamp(score, -1.1, 1.25),
labels: uniquePrincipleLabels(labels),
dominance,
};
}
function getAutoPilotGameSpaceAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const teamId = carrier.team;
const startSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const targetSpace = getAttackingGameSpaceProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const startThreat = actionSpace.startThreat;
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const gameSpaceGain = targetSpace.index - startSpace.index;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const runner = candidate.principleRunnerPlayerId ? getPlayerById(candidate.principleRunnerPlayerId) : null;
const excludedIds = new Set([carrier.id, receiver?.id, runner?.id].filter(Boolean));
const supportNearTarget = getTeamSupportCountAroundPoint(teamId, candidate.target, excludedIds, passDistance >= 25 ? 16 : 12);
const receiverPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: receiver
? getPlayerPressureLoad(receiver, candidate.target)
: actionSpace.targetPressure;
const openTarget = actionSpace.openTarget;
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, candidate.target)
: 0.62;
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.25);
const labels = [];
let score = 0;
const entersSpaceTwo =
targetSpace.key === "space2" &&
gameSpaceGain >= 1 &&
forwardGain >= 2 &&
openTarget >= 0.36 &&
laneClarity >= 0.34;
const entersSpaceThree =
targetSpace.key === "space3" &&
gameSpaceGain >= 1 &&
forwardGain >= 5 &&
laneClarity >= 0.38;
const oneSpaceProgression =
gameSpaceGain === 1 &&
forwardGain >= 3 &&
actionSpace.lineBreakCount >= 1;
const skippedTooMuch =
candidate.actionType === "pass" &&
gameSpaceGain >= 2 &&
passDistance >= 30 &&
profile.routeOneBias < 0.58 &&
supportNearTarget <= 0 &&
targetThreat.box < 0.28 &&
targetThreat.behindLine < 0.42;
if (entersSpaceTwo) {
score += 0.26 + actionSpace.value * 0.28 + profile.lineBreakBias * 0.16;
labels.push("Enter space 2");
}
if (entersSpaceThree) {
score += 0.24 + targetThreat.behindLine * 0.32 + profile.directness * 0.14;
labels.push("Attack space 3");
}
if (oneSpaceProgression) {
score += 0.18 + profile.progressionUrgency * 0.14;
labels.push("Play through the next space");
}
if (
candidate.actionType === "pass" &&
targetSpace.key === "space2" &&
receiverPressure <= 0.58 &&
(targetThreat.betweenLines >= 0.34 || targetThreat.halfSpace >= 0.34)
) {
score += 0.2 + Math.max(0, targetThreat.value - startThreat.value) * 0.34;
labels.push("Find player between lines");
}
if (
candidate.actionType === "dribble" &&
startSpace.index >= 1 &&
targetSpace.index >= startSpace.index &&
forwardGain >= 4.5 &&
openTarget >= 0.52 &&
pressure <= 0.56
) {
score += 0.2 + openTarget * 0.18 + profile.carryBias * 0.12;
labels.push("Carry through open space");
}
if (
startSpace.key === "space2" &&
facingForward &&
pressure <= 0.48 &&
candidate.actionType === "pass" &&
forwardGain < 2 &&
!candidate.isSwitch &&
targetThreat.value <= startThreat.value + 0.04
) {
score -= 0.52 + profile.progressionUrgency * 0.22;
}
if (
gameSpaceGain < 0 &&
pressure <= 0.52 &&
!candidate.isSwitch &&
targetThreat.value <= startThreat.value + 0.05
) {
score -= Math.abs(gameSpaceGain) * (0.24 + profile.progressionUrgency * 0.12);
}
if (skippedTooMuch) {
score -= 0.46 + (1 - profile.directness) * 0.2;
}
if (
targetSpace.index >= 2 &&
actionSpace.targetPressure >= 0.72 &&
supportNearTarget <= 0 &&
!candidate.isBoxPass &&
candidate.actionType !== "shot"
) {
score -= 0.24;
}
if (
candidate.actionType === "shot" &&
(startSpace.key === "space3" || targetThreat.box >= 0.3 || startThreat.centralPocket >= 0.42)
) {
score += 0.16 + profile.shootBias * 0.12;
labels.push("Finish from space 3");
}
return {
score: clamp(score, -1.25, 1.25),
labels: uniquePrincipleLabels(labels),
context: {
startSpace,
targetSpace,
gameSpaceGain,
supportNearTarget,
receiverPressure,
openTarget,
laneClarity,
},
};
}
function getAutoPilotSpatialDecisionAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const teamId = carrier.team;
const startSpace = getPitchSpaceProfile(startPoint, teamId);
const targetSpace = getPitchSpaceProfile(candidate.target, teamId);
const startGameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const targetGameSpace = getAttackingGameSpaceProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const actionDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestOpponentGap = getNearestOpponentGap(carrier, startPoint);
const laneShift = Math.abs(getPitchLaneIndex(candidate.target) - getPitchLaneIndex(startPoint));
const startLane = getPitchLaneKey(startPoint);
const targetLane = getPitchLaneKey(candidate.target);
const startIsWide = startLane === "leftWide" || startLane === "rightWide";
const targetIsWide = targetLane === "leftWide" || targetLane === "rightWide";
const targetIsHalfSpace = targetLane === "leftHalf" || targetLane === "rightHalf";
const targetIsCentral = targetLane === "central";
const gameSpaceGain = targetGameSpace.index - startGameSpace.index;
const targetDensity = getTeamDensityAtPoint(
teamId,
candidate.target,
targetGameSpace.key === "space3" ? 8.8 : 10.5,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean))
);
const canFaceForward =
isPlayerFacingForward(carrier, Math.PI / 2.15) ||
(pressure <= 0.38 && nearestOpponentGap >= 3.8) ||
startSpace.betweenLines >= 0.42;
const underControl = pressure <= 0.5 && nearestOpponentGap >= 2.7;
const highValueForwardAction =
forwardGain >= 4 &&
(actionSpace.value >= 0.38 ||
targetSpace.value >= startSpace.value + 0.06 ||
targetSpace.gameSpaceIndex > startSpace.gameSpaceIndex ||
candidate.isLineBreak ||
candidate.isBoxPass);
const sterileAction =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2.5 &&
targetSpace.value <= startSpace.value + 0.035 &&
actionSpace.lineBreakCount === 0;
const excessiveJump =
candidate.actionType === "pass" &&
gameSpaceGain >= 2 &&
actionDistance >= 29 &&
profile.routeOneBias < 0.58 &&
targetSpace.box < 0.24 &&
targetSpace.behindLine < 0.42 &&
actionSpace.openTarget < 0.72;
const labels = [];
let score = 0;
if (startGameSpace.key === "outlet" || startGameSpace.key === "space1") {
if (gameSpaceGain === 1 && forwardGain >= 3 && actionSpace.lineBreakCount >= 1) {
score += 0.3 + profile.lineBreakBias * 0.16 + actionSpace.value * 0.18;
labels.push("Spelyta decision: enter next space");
}
if (
targetGameSpace.key === "space2" &&
(targetIsHalfSpace || targetIsCentral) &&
forwardGain >= 4 &&
actionSpace.targetPressure <= 0.64
) {
score += 0.22 + profile.shortSupport * 0.12;
labels.push("Spelyta decision: find pocket behind midfield");
}
if (excessiveJump) {
score -= 0.46 + (1 - profile.directness) * 0.22;
labels.push("Spelyta decision: avoid hopeful skip");
}
}
if (startGameSpace.key === "space2" || startSpace.betweenLines >= 0.36 || startSpace.centralPocket >= 0.26) {
if (canFaceForward && underControl && highValueForwardAction) {
score += 0.42 + actionSpace.value * 0.3 + profile.progressionUrgency * 0.16;
labels.push("Spelyta decision: attack forward-facing space 2");
}
if (
canFaceForward &&
underControl &&
candidate.actionType === "dribble" &&
forwardGain >= 4 &&
actionSpace.openTarget >= 0.48
) {
score += 0.24 + profile.carryBias * 0.16;
labels.push("Spelyta decision: drive at the back line");
}
if (
canFaceForward &&
underControl &&
!candidate.isSwitch &&
(forwardGain <= -4 || sterileAction)
) {
score -= 0.66 + startSpace.value * 0.22 + profile.progressionUrgency * 0.22;
labels.push("Spelyta decision: do not waste forward-facing space");
}
}
if (startGameSpace.key === "space3" || startSpace.box >= 0.18 || startSpace.centralPocket >= 0.38) {
if (candidate.actionType === "shot") {
score += 0.34 + profile.shootBias * 0.26 + startSpace.box * 0.18;
labels.push("Spelyta decision: finish from space 3");
}
if (
candidate.actionType === "pass" &&
(targetSpace.box >= 0.28 || targetSpace.cutbackZone >= 0.34 || candidate.isBoxPass)
) {
score += 0.26 + profile.shortSupport * 0.1;
labels.push("Spelyta decision: play final action");
}
if (
candidate.actionType !== "shot" &&
forwardGain <= -5 &&
pressure <= 0.48 &&
!candidate.isSwitch
) {
score -= 0.42 + profile.shootBias * 0.2;
}
}
if (startIsWide && !targetIsWide && (targetIsHalfSpace || targetIsCentral) && forwardGain >= 1.5) {
score += 0.18 + profile.overlapBias * 0.08 + profile.shortSupport * 0.08;
labels.push("Spelyta decision: come inside from width");
}
if (
!startIsWide &&
targetIsWide &&
(pressure >= 0.48 || profile.switchBias >= 0.62 || profile.widthDiscipline >= 0.68) &&
targetSpace.depth >= 38
) {
score += 0.14 + profile.switchBias * 0.12;
labels.push("Spelyta decision: stretch the block");
}
if (
laneShift === 0 &&
sterileAction &&
pressure <= 0.46 &&
targetSpace.depth < 72
) {
score -= 0.24 + profile.progressionUrgency * 0.18;
}
if (
targetDensity >= 3 &&
targetSpace.box < 0.26 &&
targetSpace.cutbackZone < 0.28 &&
!candidate.isSwitch
) {
score -= 0.18 + (targetDensity - 2) * 0.08;
labels.push("Spelyta decision: avoid crowding");
}
if (
candidate.actionType === "pass" &&
targetSpace.gameSpaceIndex < startSpace.gameSpaceIndex &&
pressure <= 0.42 &&
!candidate.isSwitch &&
startSpace.depth >= 44
) {
score -= 0.28 + profile.progressionUrgency * 0.12;
}
return {
score: clamp(score, -1.3, 1.35),
labels: uniquePrincipleLabels(labels),
context: {
startSpace,
targetSpace,
startGameSpace,
targetGameSpace,
gameSpaceGain,
laneShift,
canFaceForward,
underControl,
highValueForwardAction,
sterileAction,
targetDensity,
},
};
}
function getActionThreatGain(startPoint, targetPoint, teamId) {
const startThreat = getPitchThreatProfile(startPoint, teamId).value;
const targetThreat = getPitchThreatProfile(targetPoint, teamId).value;
return targetThreat - startThreat;
}
function isPlayerFacingForward(player, tolerance = Math.PI / 3.2) {
if (!player) {
return false;
}
return angleDifference(getPlayerFacingAngle(player), getTeamAttackAngle(player.team)) <= tolerance;
}
function getForwardFacingSpaceTwoContext(player, point = player?.position) {
if (!player || !point) {
return {
active: false,
depth: 0,
pressure: 1,
facingForward: false,
goldenScore: 0,
};
}
const depth = getAttackingDepth(point, player.team);
const pressure = getPlayerPressureLoad(player, point);
const facingForward = isPlayerFacingForward(player);
const active = depth >= 38 && depth <= 72 && pressure <= 0.46 && facingForward;
return {
active,
depth,
pressure,
facingForward,
goldenScore: getGoldenZoneScore(point, player.team),
};
}
function getAutoPilotSpaceTwoAdvantageAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const teamId = carrier.team;
const gameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.45);
const isSpaceTwo =
gameSpace.key === "space2" ||
startThreat.betweenLines >= 0.28 ||
(gameSpace.index >= 2 && gameSpace.index <= 3 && startThreat.centrality >= 0.42);
const active =
isSpaceTwo &&
facingForward &&
pressure <= 0.56 &&
getAttackingDepth(startPoint, teamId) >= 38 &&
getAttackingDepth(startPoint, teamId) <= 78;
if (!active) {
return {
score: 0,
labels: [],
context: {
active: false,
gameSpaceKey: gameSpace.key,
pressure,
facingForward,
},
};
}
const target = candidate.target;
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const targetThreat = getPitchThreatProfile(target, teamId);
const targetSpace = getAttackingGameSpaceProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const targetGoalDistance = distance(target, getOpponentGoalCenter(teamId));
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const isProgressivePass =
candidate.actionType === "pass" &&
forwardGain >= 3.5 &&
(
actionSpace.lineBreakCount >= 1 ||
targetSpace.index > gameSpace.index ||
targetThreat.value >= startThreat.value + 0.04 ||
targetThreat.betweenLines >= 0.32 ||
targetThreat.centralPocket >= 0.26 ||
isFrontLineRole(receiverRoleKey)
);
const isProgressiveCarry =
candidate.actionType === "dribble" &&
forwardGain >= 3.5 &&
(
actionSpace.value >= 0.26 ||
targetThreat.value >= startThreat.value + 0.035 ||
targetGoalDistance <= goalDistance - 3.5
);
const isShotWindow =
candidate.actionType === "shot" &&
goalDistance <= 32 &&
pressure <= 0.62;
const isLowValueRecycle =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.05 &&
actionSpace.lineBreakCount === 0 &&
targetSpace.index <= gameSpace.index;
const isBackwardsEscape =
candidate.actionType === "pass" &&
forwardGain <= -4 &&
pressure <= 0.44 &&
passDistance <= 24;
const safeSupportAllowance =
pressure >= 0.42 &&
passDistance <= 13 &&
(receiverRoleKey === "pivot" || receiverRoleKey === "connector");
const score =
(isProgressivePass
? 0.42 +
actionSpace.value * 0.38 +
clamp(forwardGain / 18, 0, 0.46) +
(targetThreat.centralPocket >= 0.28 ? 0.18 : 0) +
(targetSpace.index > gameSpace.index ? 0.18 : 0)
: 0) +
(isProgressiveCarry
? 0.38 +
actionSpace.openTarget * 0.26 +
clamp(forwardGain / 16, 0, 0.42) +
getPlayerTendency(carrier, "dribble") * 0.12
: 0) +
(isShotWindow ? 0.24 + clamp((32 - goalDistance) / 18, 0, 0.28) : 0) -
(isLowValueRecycle
? (safeSupportAllowance ? 0.24 : 0.68 + profile.progressionUrgency * 0.36)
: 0) -
(isBackwardsEscape ? 0.5 + profile.progressionUrgency * 0.28 : 0);
const labels = [];
if (isProgressivePass || isProgressiveCarry || isShotWindow) {
labels.push("Use space 2 advantage");
}
if (isProgressivePass && actionSpace.lineBreakCount >= 1) {
labels.push("Attack the next line");
} else if (isProgressiveCarry) {
labels.push("Carry into open lane");
}
return {
score: clamp(score, -1.25, 1.25),
labels: uniquePrincipleLabels(labels),
context: {
active: true,
gameSpaceKey: gameSpace.key,
targetGameSpaceKey: targetSpace.key,
pressure,
facingForward,
forwardGain,
lineBreakCount: actionSpace.lineBreakCount,
isProgressivePass,
isProgressiveCarry,
isShotWindow,
isLowValueRecycle,
},
};
}
function getForwardProgressionWindow(carrier, startPoint = carrier?.position, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const sign = getAttackDirectionSign(carrier.team);
const depth = getAttackingDepth(startPoint, carrier.team);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.35);
const probe = clampToPitch({
x: startPoint.x + sign * 18,
y: lerp(startPoint.y, pitch.width / 2, 0.26),
}, 2.5);
const openLane = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, probe));
const goldenAhead = getGoldenZoneScore(probe, carrier.team);
const spaceTwo = depth >= 36 && depth <= 74;
const active =
spaceTwo &&
pressure <= 0.54 &&
openLane >= 0.42 &&
(facingForward || profile.firstTouchForwardBias >= 0.7 || profile.directness >= 0.64);
return {
active,
depth,
pressure,
facingForward,
openLane,
goldenAhead,
probe,
urgency: clamp((profile.progressionUrgency ?? 0.5) * 0.58 + openLane * 0.34 + (facingForward ? 0.16 : 0), 0, 1.2),
};
}
function getOpponentGoalSide(teamId) {
return teamId === "home" ? "right" : "left";
}
function getGoalLineX(side) {
return side === "right" ? pitch.length : 0;
}
function getGoalDirectionSign(side) {
return side === "right" ? 1 : -1;
}
function isBetweenGoalPosts(y, margin = 0) {
const halfGoalWidth = 7.32 / 2;
return y >= pitch.width / 2 - halfGoalWidth - margin &&
y <= pitch.width / 2 + halfGoalWidth + margin;
}
function getGoalNetDisplayPoint(side, y) {
return {
x: side === "right" ? pitch.length - 0.55 : 0.55,
y: clamp(y, pitch.width / 2 - 3.4, pitch.width / 2 + 3.4),
};
}
function resolveShotTarget(targetPoint, initiator = null) {
const teamId =
initiator?.team ??
getPlannedPossessionTeamId() ??
getBallOwner()?.team ??
(targetPoint.x >= pitch.length / 2 ? "home" : "away");
const side = getOpponentGoalSide(teamId);
const sign = getGoalDirectionSign(side);
const goalLineX = getGoalLineX(side);
const nearGoalLine =
side === "right"
? targetPoint.x >= pitch.length - 8
: targetPoint.x <= 8;
if (!nearGoalLine) {
return clampToPitch(targetPoint, 0);
}
return {
x: goalLineX + sign * 2.6,
y: clamp(targetPoint.y, 0, pitch.width),
};
}
function getOwnGoalCenter(teamId) {
return vec(teamId === "home" ? 0 : pitch.length, pitch.width / 2);
}
function getOpponentPenaltySpot(teamId) {
return vec(teamId === "home" ? pitch.length - 11 : 11, pitch.width / 2);
}
function getSecondLastOpponentLineX(attackingTeamId) {
const opponentXs = state.players
.filter((player) => player.team !== attackingTeamId)
.map((player) => player.position.x)
.sort((a, b) => attackingTeamId === "home" ? b - a : a - b);
if (opponentXs.length < 2) {
return null;
}
return opponentXs[1];
}
function getOffsideInfo(receiver, passStartPoint) {
if (!receiver || !passStartPoint) {
return { isOffside: false, lineX: null, reason: null };
}
const teamId = receiver.team;
const attackSign = getAttackDirectionSign(teamId);
const receiverPoint = getPlayerBallControlPoint(receiver);
const receiverDepth = getAttackingDepth(receiverPoint, teamId);
const ballDepth = getAttackingDepth(passStartPoint, teamId);
const lineX = getSecondLastOpponentLineX(teamId);
if (lineX === null || receiverDepth <= pitch.length / 2) {
return { isOffside: false, lineX, reason: null };
}
const offsideTolerance = 0.25;
const beyondBall = (receiverPoint.x - passStartPoint.x) * attackSign > offsideTolerance;
const beyondSecondLast = (receiverPoint.x - lineX) * attackSign > offsideTolerance;
const isOffside = beyondBall && beyondSecondLast;
return {
isOffside,
lineX,
receiverPoint,
reason: isOffside
? `${receiver.shortLabel} ${receiver.role} is beyond the ball and the second-last defender.`
: null,
};
}
function isPassReceiverOffside(receiver, passStartPoint = state.ball.position) {
return getOffsideInfo(receiver, passStartPoint).isOffside;
}
function isWideChannel(point) {
return point.y <= 14 || point.y >= pitch.width - 14;
}
function isBylineZone(point, teamId) {
return teamId === "home" ? point.x >= pitch.length - 8 : point.x <= 8;
}
function isInsideOpponentBox(point, teamId) {
if (teamId === "home") {
return point.x >= pitch.length - 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
}
return point.x <= 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
}
function isInsideOwnBox(point, teamId) {
if (teamId === "home") {
return point.x <= 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
}
return point.x >= pitch.length - 16.5 && point.y >= 13.8 && point.y <= pitch.width - 13.8;
}
function isCutbackTarget(point, teamId) {
const penaltySpot = getOpponentPenaltySpot(teamId);
return distance(point, penaltySpot) <= 10.5;
}
function isGoalkeeper(player) {
return /goalkeeper/i.test(player?.role ?? "") || player?.shortLabel === "GK";
}
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
function getDribbleRoleFamily(player) {
const magnetLabel = getPlayerMagnetLabel(player);
const role = player?.role ?? "";
if (magnetLabel === "GK" || /goalkeeper/i.test(role)) {
return "gk-carry";
}
if (magnetLabel === "CB" || /center back/i.test(role)) {
return "centre-back-carry";
}
if (magnetLabel === "6" || /holding midfielder/i.test(role)) {
return "six-carry";
}
if (magnetLabel === "10" || /attacking midfielder/i.test(role)) {
return "ten-carry";
}
if (magnetLabel === "8" || /central midfielder/i.test(role)) {
return "eight-carry";
}
if (magnetLabel === "W" || /winger/i.test(role)) {
return "winger-carry";
}
if (magnetLabel === "WB" || /wing-back/i.test(role)) {
return "wingback-carry";
}
if (magnetLabel === "LB" || magnetLabel === "RB" || /left back|right back/i.test(role)) {
return "fullback-carry";
}
if (magnetLabel === "9" || /striker|centre forward/i.test(role)) {
return "striker-carry";
}
return "eight-carry";
}
function resolveAutoDribbleProfile(startPoint, targetPoint, carrier) {
if (!carrier) {
return getManualBallProfile("dribble");
}
const context = getPlayerDecisionContext(carrier);
const surfacePreset = getPitchSurfacePreset();
const weatherPreset = getWeatherPreset();
const profileKey = getDribbleRoleFamily(carrier);
const profile = autoDribbleProfiles[profileKey] ?? autoDribbleProfiles["eight-carry"];
const actionDistance = distance(startPoint, targetPoint);
const forwardMeters = (targetPoint.x - startPoint.x) * getAttackDirectionSign(carrier.team);
const isWideCarry = isWideChannel(startPoint) || isWideChannel(targetPoint);
const isForwardCarry = forwardMeters >= 5;
const distanceRatio = clamp(actionDistance / 18, 0, 1);
const nearestOpponentGap = getNearestOpponentGapInCarryLane(carrier, targetPoint);
const openSpaceScore = getCarryLaneOpenSpaceScore(nearestOpponentGap);
const lanePressureScore = 1 - openSpaceScore;
const carryAngle = angleBetween(startPoint, targetPoint);
const turnPenalty = clamp(
angleDifference(getPlayerFacingAngle(carrier), carryAngle) / (Math.PI * 0.75),
0,
1
);
const technicalScore =
context.profile.technicalSecurity * 0.34 +
context.profile.pressResistance * 0.2 +
context.profile.decisionSpeed * 0.16 +
context.profile.decisionQuality * 0.14 +
context.profile.composure * 0.16;
const directionalBonus =
(isForwardCarry ? 0.015 : 0) +
(isWideCarry && ["winger-carry", "wingback-carry", "fullback-carry"].includes(profileKey) ? 0.018 : 0) +
(profileKey === "striker-carry" && actionDistance >= 10 ? 0.014 : 0);
const pressureFactor = clamp(
1 -
context.pressure * profile.pressurePenalty * (1.15 - context.profile.pressResistance * 0.18) -
lanePressureScore * profile.lanePressurePenalty,
0.68,
1
);
const surfaceFactor = surfacePreset.dribbleCarryFactor * weatherPreset.dribbleTractionFactor;
const playerPaceFactor = lerp(
0.92,
1.1,
clamp((context.maxSpeed - 6.8) / 2.3, 0, 1)
);
const technicalFactor = clamp(
0.9 + technicalScore * 0.18 + weatherPreset.dribbleControlFactor * 0.02,
0.86,
1.06
);
const openSpaceSpeed = lerp(profile.tightSpeed, profile.openSpeed, openSpaceScore);
const physicalCarryMultiplier = carrier.physicalProfile?.dribbleSpeedMultiplier ?? 1;
const distanceBoost =
lerp(profile.distanceBoost[0], profile.distanceBoost[1], distanceRatio) *
lerp(0.28, 1, openSpaceScore);
const turnFactor = lerp(1, 0.82, turnPenalty);
const averageSpeed = clamp(
(openSpaceSpeed + distanceBoost) *
physicalCarryMultiplier *
playerPaceFactor *
technicalFactor *
(1 + directionalBonus) *
pressureFactor *
surfaceFactor *
turnFactor,
profile.minSpeed * physicalCarryMultiplier,
profile.maxSpeed * physicalCarryMultiplier
);
return {
key: profile.key,
label: profile.label,
source: "auto",
targetKind: "carry",
averageSpeed,
launchMultiplier: 1,
rollFloor: averageSpeed,
flightStyle: "ground",
peakHeight: 0,
controlHeightThreshold: 0.12,
landingPhaseStart: 0.58,
distanceRatio,
};
}
function getNearestOpponentGapInCarryLane(carrier, targetPoint) {
const carryDirection = normalize(carrier.position, targetPoint);
const hasDirection = Math.abs(carryDirection.x) > 0.001 || Math.abs(carryDirection.y) > 0.001;
if (!hasDirection) {
return Infinity;
}
let nearestGap = Infinity;
const carryDistance = distance(carrier.position, targetPoint);
const scanDistance = Math.max(11, Math.min(carryDistance + 2.5, 32));
const scanRadius = Math.max(14, Math.min(carryDistance + 4, 36));
state.players.forEach((player) => {
if (player.team === carrier.team) {
return;
}
const toOpponent = subtract(player.position, carrier.position);
const opponentGap = Math.sqrt(toOpponent.x * toOpponent.x + toOpponent.y * toOpponent.y);
if (opponentGap > scanRadius) {
return;
}
const projection = toOpponent.x * carryDirection.x + toOpponent.y * carryDirection.y;
if (projection < -1.5 || projection > scanDistance) {
return;
}
const lateral = Math.sqrt(Math.max(opponentGap * opponentGap - projection * projection, 0));
const laneWidth = lerp(4.1, 5.4, clamp(carryDistance / 26, 0, 1));
if (lateral > laneWidth) {
return;
}
nearestGap = Math.min(nearestGap, opponentGap);
});
return nearestGap;
}
function getCarryLaneOpenSpaceScore(nearestOpponentGap) {
return Number.isFinite(nearestOpponentGap)
? clamp((nearestOpponentGap - 2.4) / 9.6, 0, 1)
: 1;
}
function getCarryRunwayRoleCap(roleKey, goalDistance) {
const baseCap =
roleKey === "wideForward"
? 36
: roleKey === "striker" || roleKey === "secondStriker"
? 33
: roleKey === "connector"
? 30
: roleKey === "wideBack"
? 28
: roleKey === "pivot"
? 21
: roleKey === "rest"
? 16
: 24;
return clamp(baseCap, 11, goalDistance <= 30 ? 24 : 38);
}
function getCarryRunwayProfile(carrier, startPoint, targetPoint, profile = {}) {
if (!carrier || !startPoint || !targetPoint) {
return {
active: false,
shouldExtend: false,
runwayScore: 0,
score: 0,
labels: [],
};
}
const teamId = carrier.team;
const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
const goal = getOpponentGoalCenter(teamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const targetDepth = getAttackingDepth(targetPoint, teamId);
const goalDistance = distance(startPoint, goal);
const targetGoalDistance = distance(targetPoint, goal);
const nearestLaneGap = getNearestOpponentGapInCarryLane(carrier, targetPoint);
const openSpaceScore = getCarryLaneOpenSpaceScore(nearestLaneGap);
const lanePressure = getOpponentPressureAtPoint(teamId, targetPoint, 10);
const carrierPressure = getPlayerPressureLoad(carrier, startPoint);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat ?? getPitchThreatProfile(targetPoint, teamId);
const startThreat = actionSpace.startThreat ?? getPitchThreatProfile(startPoint, teamId);
const threatGain = Math.max(0, targetThreat.value - startThreat.value);
const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
const runnerStrength = getAutoPilotRoleStrength(carrier, "runner");
const isWideRunway = isWideChannel(startPoint) || isWideChannel(targetPoint);
const isFinalThirdRunway =
goalDistance <= 52 &&
startDepth >= 44 &&
targetGoalDistance <= goalDistance - 6;
const roleFit =
roleKey === "wideForward"
? 0.14
: roleKey === "striker" || roleKey === "secondStriker"
? 0.12
: roleKey === "connector"
? 0.08
: roleKey === "wideBack"
? 0.06
: roleKey === "pivot"
? -0.06
: roleKey === "rest" || roleKey === "gk"
? -0.2
: 0;
const sterileCarryPenalty =
forwardGain < 4 &&
targetThreat.value <= startThreat.value + 0.04 &&
!isWideRunway
? 0.2
: 0;
const runwayScore = clamp(
openSpaceScore * 0.42 +
actionSpace.openTarget * 0.18 +
actionSpace.value * 0.22 +
clamp(forwardGain / 30, 0, 1) * 0.2 +
threatGain * 0.22 +
targetThreat.behindLine * 0.16 +
targetThreat.centralPocket * 0.1 +
dribbleStrength * 0.12 +
runnerStrength * 0.08 +
roleFit +
(isFinalThirdRunway ? 0.16 : 0) +
(isWideRunway && forwardGain >= 7 ? 0.06 : 0) -
lanePressure * 0.18 -
carrierPressure * 0.13 -
sterileCarryPenalty,
0,
1.35
);
const runwayKind =
isFinalThirdRunway && targetThreat.behindLine >= 0.3
? "breakaway"
: isWideRunway && targetDepth >= 56
? "wide-runway"
: targetThreat.centralPocket >= 0.34 || targetThreat.betweenLines >= 0.36
? "central-runway"
: "progressive-runway";
const requiredOpenSpace = carrierPressure <= 0.36 ? 0.52 : 0.58;
const shouldExtend =
roleKey !== "gk" &&
roleKey !== "rest" &&
forwardGain >= 6 &&
openSpaceScore >= requiredOpenSpace &&
carrierPressure <= 0.62 &&
lanePressure <= 0.74 &&
runwayScore >= 0.68;
return {
active: shouldExtend,
shouldExtend,
runwayKind,
runwayScore,
score: runwayScore,
forwardGain,
startDepth,
targetDepth,
goalDistance,
targetGoalDistance,
openSpaceScore,
nearestLaneGap,
lanePressure,
carrierPressure,
actionSpace,
targetThreat,
startThreat,
isWideRunway,
isFinalThirdRunway,
labels: shouldExtend ? ["Open-grass runway"] : [],
};
}
function getRunwayCarryTarget(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return null;
}
const teamId = carrier.team;
const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
if (roleKey === "gk" || roleKey === "rest") {
return null;
}
const sign = getAttackDirectionSign(teamId);
const goal = getOpponentGoalCenter(teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const goalDistance = distance(startPoint, goal);
if (pressure >= 0.66 || goalDistance <= 13) {
return null;
}
const attackAngle = getTeamAttackAngle(teamId);
const towardGoalAngle = angleBetween(startPoint, goal);
const sideToCenter = Math.sign(pitch.width / 2 - startPoint.y) || (getWideSideSign(startPoint) ? -getWideSideSign(startPoint) : 1);
const roleCap = getCarryRunwayRoleCap(roleKey, goalDistance);
const referenceTarget = clampToPitch({
x: startPoint.x + sign * Math.min(24, Math.max(12, goalDistance - 13)),
y: lerp(startPoint.y, pitch.width / 2, isWideChannel(startPoint) ? 0.48 : 0.22),
}, 2.5);
const referenceOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, referenceTarget));
const desiredDistance = clamp(
13 +
referenceOpenSpace * 12 +
getAutoPilotRoleStrength(carrier, "dribbler") * 5.5 +
getAutoPilotRoleStrength(carrier, "runner") * 3.6 +
(profile.carryBias ?? 0.5) * 4.4 +
(getAttackingDepth(startPoint, teamId) >= 50 ? 2.6 : 0) -
pressure * 5.8,
9.5,
Math.min(roleCap, Math.max(9, goalDistance - (goalDistance <= 30 ? 9.5 : 13)))
);
if (desiredDistance < 9) {
return null;
}
const breakawayBuffer = goalDistance <= 30 ? 10 : 13.5;
const buildAngleTarget = (angle, distanceLimit, key, weight) => ({
key,
weight,
target: clampToPitch({
x: startPoint.x + Math.cos(angle) * distanceLimit,
y: startPoint.y + Math.sin(angle) * distanceLimit,
}, 2.5),
});
const candidates = [
buildAngleTarget(towardGoalAngle, desiredDistance, "breakaway", goalDistance <= 52 ? 1.1 : 0.92),
buildAngleTarget(normalizeAngle(attackAngle + sideToCenter * 0.2), desiredDistance * 0.96, "inside-runway", isWideChannel(startPoint) ? 1.12 : 0.98),
{
key: "central-runway",
weight: isWideChannel(startPoint) ? 1.04 : 0.96,
target: clampToPitch({
x: startPoint.x + sign * desiredDistance,
y: lerp(startPoint.y, pitch.width / 2, isWideChannel(startPoint) ? 0.58 : 0.26),
}, 2.5),
},
{
key: "goal-runway",
weight: goalDistance <= 44 ? 1.14 : 0.88,
target: clampToPitch({
x: goal.x - sign * breakawayBuffer,
y: lerp(startPoint.y, pitch.width / 2, isWideChannel(startPoint) ? 0.66 : 0.42),
}, 2.5),
},
]
.map((candidate) => {
const forwardGain = (candidate.target.x - startPoint.x) * sign;
const travelDistance = distance(startPoint, candidate.target);
if (forwardGain < 6 || travelDistance < 8.5 || travelDistance > roleCap + 1) {
return null;
}
const runway = getCarryRunwayProfile(carrier, startPoint, candidate.target, profile);
return {
...runway,
key: candidate.key,
target: candidate.target,
score: runway.runwayScore + candidate.weight * 0.08 + clamp(travelDistance / 36, 0, 0.12),
distance: travelDistance,
};
})
.filter((candidate) => candidate?.shouldExtend)
.sort((a, b) => b.score - a.score);
const best = candidates[0] ?? null;
if (!best) {
return null;
}
return {
...best,
active: true,
label:
best.runwayKind === "breakaway"
? "open-grass runway"
: best.runwayKind === "wide-runway"
? "wide runway carry"
: "progressive runway carry",
};
}
function getBreakawayCarryTarget(carrier, startPoint, profile) {
const runway = getRunwayCarryTarget(carrier, startPoint, profile);
if (runway?.runwayKind === "breakaway" && runway.target) {
return runway.target;
}
const teamId = carrier.team;
const sign = getAttackDirectionSign(teamId);
const goal = getOpponentGoalCenter(teamId);
const goalDistance = distance(startPoint, goal);
const ballDepth = getAttackingDepth(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const towardGoalPoint = clampToPitch({
x: goal.x - sign * 15.5,
y: pitch.width / 2,
}, 2.5);
const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, towardGoalPoint));
const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
const canBreakAway =
goalDistance <= 48 &&
ballDepth >= 48 &&
pressure <= 0.46 &&
openSpaceScore >= 0.62 &&
roleKey !== "gk" &&
roleKey !== "rest" &&
roleKey !== "pivot";
if (!canBreakAway) {
return null;
}
const targetDistance = clamp(
14 +
openSpaceScore * 11 +
getAutoPilotRoleStrength(carrier, "dribbler") * 5 +
(profile?.tempo ?? 0.55) * 3,
13,
goalDistance <= 31 ? 19 : 30
);
const maxXBeforeShot = goal.x - sign * (goalDistance <= 26 ? 11.8 : 15.2);
const targetX =
sign > 0
? Math.min(startPoint.x + targetDistance, maxXBeforeShot)
: Math.max(startPoint.x - targetDistance, maxXBeforeShot);
const centralPull = isWideChannel(startPoint) ? 0.56 : 0.38;
return clampToPitch({
x: targetX,
y: lerp(startPoint.y, pitch.width / 2, centralPull),
}, 2.5);
}
function getOpenGrassCarryContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return null;
}
const teamId = carrier.team;
const roleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
if (roleKey === "gk") {
return null;
}
const runwayCarry = getRunwayCarryTarget(carrier, startPoint, profile);
if (runwayCarry?.target) {
return runwayCarry;
}
const pressure = getPlayerPressureLoad(carrier, startPoint);
const ballDepth = getAttackingDepth(startPoint, teamId);
const goal = getOpponentGoalCenter(teamId);
const goalDistance = distance(startPoint, goal);
const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
const runnerStrength = getAutoPilotRoleStrength(carrier, "runner");
const attackAngle = getTeamAttackAngle(teamId);
const towardGoalAngle = angleBetween(startPoint, goal);
const sideToCenter = Math.sign(pitch.width / 2 - startPoint.y) || (getWideSideSign(startPoint) ? -getWideSideSign(startPoint) : 1);
const roleDistanceCap =
roleKey === "wideForward"
? 33
: roleKey === "striker" || roleKey === "secondStriker"
? 30
: roleKey === "wideBack" || roleKey === "connector"
? 26
: roleKey === "pivot"
? 19
: 17;
const openDistanceBase = clamp(
12 +
dribbleStrength * 7 +
runnerStrength * 3.5 +
profile.carryBias * 5 +
profile.dribbleBias * 3 -
pressure * 6,
roleKey === "rest" ? 7.5 : 10,
roleDistanceCap
);
const distanceLimit = clamp(
Math.min(openDistanceBase, goalDistance - (goalDistance <= 26 ? 9.5 : 13.5)),
7,
roleDistanceCap
);
if (distanceLimit < 8.5 || pressure >= 0.62) {
return null;
}
const angleOptions = [
{
key: "through-centre",
angle: towardGoalAngle,
weight: roleKey === "wideForward" || roleKey === "wideBack" ? 0.88 : 1,
},
{
key: "inside-diagonal",
angle: normalizeAngle(attackAngle + sideToCenter * 0.24),
weight: isWideChannel(startPoint) ? 1.12 : 0.96,
},
{
key: "outside-arc",
angle: normalizeAngle(attackAngle - sideToCenter * 0.19),
weight: roleKey === "wideForward" || roleKey === "wideBack" ? 1.04 : 0.82,
},
];
const candidates = angleOptions
.map((option) => {
const target = clampToPitch({
x: startPoint.x + Math.cos(option.angle) * distanceLimit,
y: startPoint.y + Math.sin(option.angle) * distanceLimit,
}, 2.5);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
if (forwardGain < 5.5) {
return null;
}
const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const targetPressure = getOpponentPressureAtPoint(teamId, target, 9.5);
const finalThirdBonus = ballDepth >= 54 && goalDistance <= 48 ? 0.16 : 0;
const roleFit =
roleKey === "wideForward"
? 0.18
: roleKey === "striker" || roleKey === "secondStriker"
? 0.12
: roleKey === "connector"
? 0.08
: roleKey === "rest"
? -0.22
: 0;
const score =
openSpaceScore * 0.62 +
actionSpace.openTarget * 0.26 +
actionSpace.value * 0.36 +
clamp(forwardGain / 24, 0, 1) * 0.28 +
targetThreat.behindLine * 0.18 +
targetThreat.centralPocket * 0.12 +
finalThirdBonus +
roleFit +
option.weight * 0.08 -
pressure * 0.22 -
targetPressure * 0.18;
return {
...option,
target,
score,
openSpaceScore,
actionSpace,
targetThreat,
forwardGain,
targetPressure,
distance: distance(startPoint, target),
};
})
.filter(Boolean)
.sort((a, b) => b.score - a.score);
const best = candidates[0] ?? null;
if (!best || best.score < 0.72 || best.openSpaceScore < 0.56) {
return null;
}
return {
...best,
active: true,
label: goalDistance <= 42 || best.targetThreat.behindLine >= 0.38
? "open-grass attack"
: "progressive carry",
};
}
function getQuadraticPoint(startPoint, controlPoint, endPoint, progress) {
const inverse = 1 - progress;
return {
x:
inverse * inverse * startPoint.x +
2 * inverse * progress * controlPoint.x +
progress * progress * endPoint.x,
y:
inverse * inverse * startPoint.y +
2 * inverse * progress * controlPoint.y +
progress * progress * endPoint.y,
};
}
function buildSampledCurvePath(startPoint, controlPoint, endPoint, samples = 28) {
const points = [];
let previousPoint = cloneVector(startPoint);
let totalDistance = 0;
points.push({
distance: 0,
point: cloneVector(startPoint),
});
for (let index = 1; index <= samples; index += 1) {
const progress = index / samples;
const point = getQuadraticPoint(startPoint, controlPoint, endPoint, progress);
totalDistance += distance(previousPoint, point);
points.push({
distance: totalDistance,
point,
});
previousPoint = point;
}
return {
kind: "curve",
start: cloneVector(startPoint),
control: cloneVector(controlPoint),
end: cloneVector(endPoint),
points,
totalDistance,
};
}
function getSampledPathPoint(path, traveledDistance) {
if (!path?.points?.length) {
return cloneVector(path?.end ?? state.ball.target);
}
const clampedDistance = clamp(traveledDistance, 0, path.totalDistance ?? 0);
for (let index = 1; index < path.points.length; index += 1) {
const previous = path.points[index - 1];
const current = path.points[index];
if (clampedDistance > current.distance) {
continue;
}
const segmentDistance = Math.max(current.distance - previous.distance, 0.001);
const segmentProgress = (clampedDistance - previous.distance) / segmentDistance;
return {
x: lerp(previous.point.x, current.point.x, segmentProgress),
y: lerp(previous.point.y, current.point.y, segmentProgress),
};
}
return cloneVector(path.points[path.points.length - 1].point);
}
function buildDribbleCarryPath(carrier, startPoint, targetPoint) {
const straightDistance = distance(startPoint, targetPoint);
if (straightDistance <= 0.01) {
return {
kind: "straight",
start: cloneVector(startPoint),
end: cloneVector(targetPoint),
totalDistance: 0,
};
}
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(carrier.team);
const lateralGain = Math.abs(targetPoint.y - startPoint.y);
const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, targetPoint));
const runwayProfile = getCarryRunwayProfile(
carrier,
startPoint,
targetPoint,
getOffensiveAutopilotProfile(carrier.team, startPoint)
);
const shouldCurve =
straightDistance >= 8 &&
forwardGain >= 4 &&
(runwayProfile.shouldExtend || openSpaceScore >= 0.52 || lateralGain >= 4 || isWideChannel(startPoint));
if (!shouldCurve) {
return {
kind: "straight",
start: cloneVector(startPoint),
end: cloneVector(targetPoint),
totalDistance: straightDistance,
};
}
const direction = normalize(startPoint, targetPoint);
const lateral = { x: -direction.y, y: direction.x };
const towardCenterSign = Math.sign(pitch.width / 2 - startPoint.y);
const bendDirection =
towardCenterSign !== 0
? Math.sign(lateral.y) === towardCenterSign ? 1 : -1
: carrier.preferredFoot === "left" ? 1 : -1;
const bendAmount = clamp(
straightDistance * (
runwayProfile.shouldExtend
? lerp(0.11, 0.24, openSpaceScore)
: lerp(0.08, 0.18, openSpaceScore)
),
0.75,
runwayProfile.shouldExtend
? isWideChannel(startPoint) ? 7.2 : 4.8
: isWideChannel(startPoint) ? 5.2 : 3.4
);
const controlPoint = clampToPitch({
x: lerp(startPoint.x, targetPoint.x, runwayProfile.shouldExtend ? 0.5 : 0.46) + lateral.x * bendAmount * bendDirection,
y: lerp(startPoint.y, targetPoint.y, runwayProfile.shouldExtend ? 0.5 : 0.46) + lateral.y * bendAmount * bendDirection,
}, 2);
if (distance(startPoint, controlPoint) <= 0.45 || distance(controlPoint, targetPoint) <= 0.45) {
return {
kind: "straight",
start: cloneVector(startPoint),
end: cloneVector(targetPoint),
totalDistance: straightDistance,
};
}
const path = buildSampledCurvePath(startPoint, controlPoint, targetPoint);
path.runwayKind = runwayProfile.runwayKind;
path.openSpaceScore = openSpaceScore;
return path;
}
function getDribbleCarryPathPoint(path, traveledDistance) {
if (!path || path.kind === "straight") {
return moveTowards(path?.start ?? state.ball.startPosition, path?.end ?? state.ball.target, traveledDistance);
}
return getSampledPathPoint(path, traveledDistance);
}
function setDribbleCarryPathForBall(carrier, startPoint, targetPoint) {
const path = buildDribbleCarryPath(carrier, startPoint, targetPoint);
state.ball.dribblePath = path;
state.ball.trackDistanceTotal = Math.max(path.totalDistance, distance(startPoint, targetPoint));
state.ball.trackDistanceCovered = 0;
return path;
}
function getLiveDribbleSpeed(carrier, targetPoint) {
const context = getPlayerDecisionContext(carrier);
const orientationProfile = getOrientationMovementProfile(carrier, targetPoint);
const averageCarrySpeed = state.ball.speed || state.draftStep?.speed || state.dribbleSpeed;
const totalDistance = Math.max(
state.ball.trackDistanceTotal || distance(state.ball.startPosition, state.ball.target),
0.01
);
const progress = state.ball.trackDistanceTotal
? clamp((state.ball.trackDistanceCovered ?? 0) / totalDistance, 0, 1)
: clamp(1 - distance(carrier.position, targetPoint) / totalDistance, 0, 1);
const nearestOpponentGap = getNearestOpponentGapInCarryLane(carrier, targetPoint);
const openSpaceScore = getCarryLaneOpenSpaceScore(nearestOpponentGap);
const lanePressureScore = 1 - openSpaceScore;
const forwardAngle = angleBetween(carrier.position, targetPoint);
const bodyAngleDelta = angleDifference(getPlayerFacingAngle(carrier), forwardAngle);
const turnPenalty = clamp(bodyAngleDelta / (Math.PI * 0.8), 0, 1);
const footCarryScore = getFootUsageScore(carrier, forwardAngle);
const technicalSecurity =
context.profile.technicalSecurity * 0.4 +
context.profile.pressResistance * 0.22 +
context.profile.composure * 0.2 +
context.profile.decisionSpeed * 0.18;
const touchFreedom = clamp(
0.78 +
openSpaceScore * 0.16 +
technicalSecurity * 0.08 -
context.pressure * 0.14 -
lanePressureScore * 0.09,
0.62,
1.02
);
const carryPhaseFactor =
progress < 0.18
? lerp(0.86, 1, progress / 0.18)
: progress < 0.76
? lerp(1, 1.03 + openSpaceScore * 0.03, (progress - 0.18) / 0.58)
: lerp(1, 0.88, (progress - 0.76) / 0.24);
const pressurePenalty = clamp(
1 -
context.pressure * (0.18 + (1 - context.profile.pressResistance) * 0.14) -
lanePressureScore * 0.08,
0.66,
1
);
const turnPenaltyFactor = lerp(1, 0.82, turnPenalty);
const cap = Math.min(
context.maxSpeed * lerp(0.48, 0.68, openSpaceScore),
averageCarrySpeed * lerp(1.02, 1.12, openSpaceScore)
);
return clamp(
averageCarrySpeed *
orientationProfile.speedMultiplier *
lerp(0.9, 1.04, footCarryScore) *
touchFreedom *
carryPhaseFactor *
pressurePenalty *
turnPenaltyFactor,
1.95,
Math.max(2.05, cap)
);
}
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
    getRemainingBallDistance,
    hasBallAction,
    getActionOrigin,
    getProjectedActionDuration,
    getCurrentActionDuration,
    getActionInitiator,
    getOrientationTurnDelay,
    getOrientationMovementProfile,
    getCoverShadowInfluence,
    getReceiveOrientationScore,
    getBestReceiveBodyAngle,
    getReceiveFootUsageScore,
    applyBestReceiveBodyAngle,
    getFirstTouchModeLabel,
    resolveFirstTouchMode,
    getFirstTouchDirectionAngle,
    getFirstTouchDistance,
    clearAutoPilotReceiveMomentum,
    setAutoPilotReceiveMomentum,
    getAutoPilotReceiveMomentum,
    getAutoPilotReceiveMomentumAdjustment,
    getAutoPilotFirstActionAfterReceiveAdjustment,
    getAutoPilotReceiveFlowContext,
    getAutoPilotReceiveFlowAdjustment,
    getReceiveContinuationCarryTarget,
    buildAutoPilotReceiveContinuationCandidate,
    applyControlledFirstTouch,
    shouldUseAutoPilotActiveFirstTouch,
    getLiveBallFocusPoint,
    getSpacePassTargetPoint,
    getPlayerOrientationFocus,
    getActiveMovementTarget,
    isPlayerReservedForReceiveShape,
    applyNearbyBallOrientation,
    getPotentialPassReceiverAtTarget,
    getPassLaneRiskProfile,
    computePassLaneClarity,
    getGoalMouthTarget,
    getShotAngleQuality,
    getShotBlockRisk,
    getGoalkeeperTargetOpenness,
    computeShotLaneClarity,
    getShotWindowProfile,
    getDeterministicShotNoise,
    resolveExecutedShotTarget,
    getAttackDirectionSign,
    getAttackingDepth,
    getOpponentGoalCenter,
    getDepthZoneKey,
    getDepthZoneLabel,
    getLaneLabel,
    getGoldenZoneScore,
    isGoldenZone,
    getMedianNumber,
    getDepthQuantile,
    getOpponentLineDepthsForAttackingTeam,
    getAttackingGameSpaceProfile,
    getPitchSpaceProfile,
    getPitchThreatProfile,
    getOpponentPressureAtPoint,
    getNearestOpponentGapToPoint,
    getOpponentsBypassedByAction,
    getFootballSpacePriority,
    getActionSpaceValue,
    getTeamDensityAtPoint,
    getOpponentDensityAtPoint,
    getSpaceDominanceProfile,
    getAutoPilotSpaceDominanceAdjustment,
    getAutoPilotGameSpaceAdjustment,
    getAutoPilotSpatialDecisionAdjustment,
    getActionThreatGain,
    isPlayerFacingForward,
    getForwardFacingSpaceTwoContext,
    getAutoPilotSpaceTwoAdvantageAdjustment,
    getForwardProgressionWindow,
    getOpponentGoalSide,
    getGoalLineX,
    getGoalDirectionSign,
    isBetweenGoalPosts,
    getGoalNetDisplayPoint,
    resolveShotTarget,
    getOwnGoalCenter,
    getOpponentPenaltySpot,
    getSecondLastOpponentLineX,
    getOffsideInfo,
    isPassReceiverOffside,
    isWideChannel,
    isBylineZone,
    isInsideOpponentBox,
    isInsideOwnBox,
    isCutbackTarget,
    isGoalkeeper,
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
