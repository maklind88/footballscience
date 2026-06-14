export function createGameSimulatorActionSpaceReceiveFlow(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    blendAngles,
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    distance,
    firstTouchModes,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotFlowContext,
    getAutoPilotRoleStrength,
    getBallControlOffsetMeters,
    getBestReceiveBodyAngle,
    getCarryLaneOpenSpaceScore,
    getForwardProgressionWindow,
    getNearestOpponentGap,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getOpponentDensityAtPoint,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getTeamAttackAngle,
    getTeamDensityAtPoint,
    getTeamSupportCountAroundPoint,
    isFrontLineRole,
    isPassReceiverOffside,
    isPlayerFacingForward,
    isSupportRole,
    isWideChannel,
    keepSecurePossessionOnlyForOwner,
    lerp,
    normalizeAngle,
    pitch,
    rotatePlayerBodyTowardAngle,
    setSecurePossessionAfterControlledTouch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

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

  return {
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
  };
}
