export function createGameSimulatorCommandActionCommands(deps = {}) {
  const {
    applyAutopilotsForCurrentAction,
    applyBallExecutionProfile,
    applyBestReceiveBodyAngle,
    applyResolvedBallProfile,
    canEditScenario,
    captureSnapshot,
    clearAutoPilotReceiveMomentum,
    clearSecurePossession,
    cloneVector,
    configureBallTravelProfile,
    distance,
    formatSpeed,
    getActionSpeed,
    getBallOwner,
    getOffsideInfo,
    getPlayerBallControlPoint,
    getPlayerById,
    getRequestedActionMode,
    getSelectedPlayer,
    getTeamAttackAngle,
    hasBallAction,
    logEvent,
    render,
    resetPlayerMovementProgress,
    resolveBallActionProfile,
    resolveShotTarget,
    rotatePlayerBodyToward,
    setDribbleCarryPathForBall,
    state,
    clampToPitch,
  } = deps;

function refreshPlannedBallActionProfile() {
if (!state.draftStep || !hasBallAction() || state.isRunning || state.sequence.isPlaying) {
return;
}
const actionType = state.draftStep.actionType;
const target = cloneVector(state.ball.target);
const startPoint = cloneVector(state.ball.startPosition);
const initiator = getPlayerById(state.draftStep.beforeSnapshot?.ball?.ownerPlayerId);
const resolvedProfile = resolveBallActionProfile(
actionType,
startPoint,
target,
initiator,
state.draftStep.receiverPlayerId ?? null
);
state.draftStep.speed = resolvedProfile.averageSpeed;
state.draftStep.speedMode = resolvedProfile.source;
state.draftStep.profileKey = resolvedProfile.key;
state.draftStep.profileLabel = resolvedProfile.label;
state.draftStep.targetKind = resolvedProfile.targetKind;
if (actionType === "pass") {
state.draftStep.firstTouchMode = state.firstTouchMode;
state.ball.firstTouchMode = state.firstTouchMode;
}
applyResolvedBallProfile(resolvedProfile);
applyBallExecutionProfile(actionType, initiator, target, resolvedProfile);
configureBallTravelProfile(
actionType,
distance(startPoint, target),
getActionSpeed(),
resolvedProfile
);
}

function clearBallAction() {
state.ball.startPosition = cloneVector(state.ball.position);
state.ball.target = cloneVector(state.ball.position);
state.ball.currentSpeed = 0;
state.ball.launchSpeed = 0;
state.ball.finalSpeed = 0;
state.ball.deceleration = 0;
state.ball.profileKey = null;
state.ball.profileLabel = null;
state.ball.profileMode = state.ballSpeedMode;
state.ball.targetKind = null;
state.ball.firstTouchMode = state.firstTouchMode;
state.ball.flightStyle = "ground";
state.ball.peakHeight = 0;
state.ball.height = 0;
state.ball.controlHeightThreshold = 0.12;
state.ball.landingPhaseStart = 0.58;
state.ball.curveAmount = 0;
state.ball.curveDirection = 1;
state.ball.spinRate = 0;
state.ball.spinAngle = 0;
state.ball.trackDistanceTotal = 0;
state.ball.trackDistanceCovered = 0;
state.ball.dribblePath = null;
state.ball.bounceCount = 0;
state.ball.inTransit = false;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.laneClarity = 0.84;
state.ball.executionQuality = 0.84;
state.ball.shotPlacement = null;
state.ball.claimRadius = 2.2;
state.ball.controlRadius = 1.4;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = null;
state.ball.recoveryDuration = 0;
state.ball.secondBallContext = null;
state.activeActionTargets = null;
state.sequence.actionTargets = null;
state.draftStep = null;
state.players.forEach((player) => {
player.actionOrigin = null;
});
resetPlayerMovementProgress();
}

function setBallOwner(playerId) {
if (!canEditScenario()) {
return;
}
const player = getPlayerById(playerId);
if (!player) {
return;
}
rotatePlayerBodyToward(player, {
x: player.position.x + Math.cos(getTeamAttackAngle(player.team)) * 4,
y: player.position.y,
});
clearBallAction();
clearAutoPilotReceiveMomentum();
clearSecurePossession();
state.ball.ownerPlayerId = player.id;
const controlPoint = getPlayerBallControlPoint(player);
state.ball.position = cloneVector(controlPoint);
state.ball.startPosition = cloneVector(controlPoint);
state.ball.target = cloneVector(controlPoint);
state.ball.receiverPlayerId = null;
logEvent(`${player.shortLabel} ${player.role} is now the ball carrier.`);
}

function issuePassLikeCommand(actionType, targetPoint, receiverPlayerId = null) {
const receiver = receiverPlayerId ? getPlayerById(receiverPlayerId) : null;
const initiator = getBallOwner() ?? getSelectedPlayer();
if (actionType === "pass" && receiver) {
const passStartPoint = initiator ? getPlayerBallControlPoint(initiator) : state.ball.position;
const offsideInfo = getOffsideInfo(receiver, passStartPoint);
if (offsideInfo.isOffside) {
clearBallAction();
logEvent(`Offside: ${offsideInfo.reason}`);
render();
return;
}
}
if (state.ball.securePossession && state.ball.securePossession.ownerPlayerId !== initiator?.id) {
clearSecurePossession();
}
if (actionType === "pass" && receiver) {
const incomingPoint = initiator ? getPlayerBallControlPoint(initiator) : state.ball.position;
applyBestReceiveBodyAngle(receiver, incomingPoint, 0.9);
}
const target = receiver
? getPlayerBallControlPoint(receiver)
: actionType === "shot"
? resolveShotTarget(targetPoint, initiator)
: clampToPitch(targetPoint);
const travelDistance = distance(state.ball.position, target);
const isShot = actionType === "shot";
const label = isShot ? "Shot target" : "Ball target";
if (travelDistance <= 0.05) {
clearBallAction();
logEvent(`${label} was cleared because the start point and target were the same.`);
return;
}
const resolvedProfile = resolveBallActionProfile(
actionType,
state.ball.position,
target,
initiator,
receiver?.id ?? null
);
const startSnapshot = captureSnapshot();
state.draftStep = {
actionType,
target: cloneVector(target),
speed: resolvedProfile.averageSpeed,
speedMode: resolvedProfile.source,
profileKey: resolvedProfile.key,
profileLabel: resolvedProfile.label,
targetKind: resolvedProfile.targetKind,
firstTouchMode: !isShot ? state.firstTouchMode : null,
receiverPlayerId: !isShot ? receiver?.id ?? null : null,
beforeSnapshot: startSnapshot,
};
state.ball.startPosition = cloneVector(state.ball.position);
state.ball.target = target;
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = actionType;
state.ball.initiatorPlayerId = initiator?.id ?? null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = !isShot ? receiver?.id ?? null : null;
state.ball.firstTouchMode = !isShot ? state.firstTouchMode : null;
state.ball.ownerPlayerId = null;
applyResolvedBallProfile(resolvedProfile);
applyBallExecutionProfile(actionType, initiator, target, resolvedProfile);
configureBallTravelProfile(actionType, travelDistance, getActionSpeed(), resolvedProfile);
state.players.forEach((player) => {
player.actionOrigin = cloneVector(player.position);
});
if (initiator) {
rotatePlayerBodyToward(initiator, target, 0.8);
const launchPoint = getPlayerBallControlPoint(initiator);
state.ball.position = cloneVector(launchPoint);
state.ball.startPosition = cloneVector(launchPoint);
}
applyAutopilotsForCurrentAction();
if (!isShot && receiver) {
logEvent(
`New pass planned: ${resolvedProfile.label} at ${formatSpeed(resolvedProfile.averageSpeed)} to ${receiver.shortLabel} ${receiver.role}.`
);
} else if (isShot) {
logEvent(
`New shot planned: ${resolvedProfile.label} at ${formatSpeed(resolvedProfile.averageSpeed)} to x ${target.x.toFixed(1)}, y ${target.y.toFixed(1)}.`
);
} else {
logEvent(
`New pass planned: ${resolvedProfile.label} at ${formatSpeed(resolvedProfile.averageSpeed)} to x ${target.x.toFixed(1)}, y ${target.y.toFixed(1)}.`
);
}
}

function issuePassCommand(targetPoint, receiverPlayerId = null) {
issuePassLikeCommand("pass", targetPoint, receiverPlayerId);
}

function issueShotCommand(targetPoint) {
issuePassLikeCommand("shot", targetPoint);
}

function issueDribbleCommand(targetPoint) {
const owner = getBallOwner();
const carrier = owner ?? getSelectedPlayer();
if (!carrier) {
logEvent("Select a player or set a ball carrier before planning a dribble.");
return;
}
if (!owner && distance(state.ball.position, carrier.position) > 2.5) {
logEvent("Set the selected player as ball carrier before planning a dribble.");
return;
}
if (state.ball.securePossession && state.ball.securePossession.ownerPlayerId !== carrier.id) {
clearSecurePossession();
}
const target = clampToPitch(targetPoint);
const resolvedProfile = resolveBallActionProfile(
"dribble",
getPlayerBallControlPoint(carrier),
target,
carrier
);
const startSnapshot = captureSnapshot();
startSnapshot.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
startSnapshot.ball.ownerPlayerId = carrier.id;
state.draftStep = {
actionType: "dribble",
target: cloneVector(target),
speed: resolvedProfile.averageSpeed,
speedMode: resolvedProfile.source,
profileKey: resolvedProfile.key,
profileLabel: resolvedProfile.label,
targetKind: resolvedProfile.targetKind,
carrierPlayerId: carrier.id,
beforeSnapshot: startSnapshot,
};
state.ball.ownerPlayerId = carrier.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
const travelDistance = distance(carrier.position, target);
if (travelDistance <= 0.05) {
clearBallAction();
state.ball.ownerPlayerId = carrier.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
logEvent("The dribble was cleared because the start point and target were the same.");
return;
}
state.ball.startPosition = cloneVector(getPlayerBallControlPoint(carrier));
state.ball.target = target;
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = "dribble";
state.ball.initiatorPlayerId = carrier.id;
state.ball.carrierPlayerId = carrier.id;
state.ball.receiverPlayerId = null;
applyResolvedBallProfile(resolvedProfile);
applyBallExecutionProfile("dribble", carrier, target, resolvedProfile);
configureBallTravelProfile("dribble", travelDistance, getActionSpeed(), resolvedProfile);
state.players.forEach((player) => {
player.actionOrigin = cloneVector(player.position);
});
setDribbleCarryPathForBall(carrier, carrier.position, target);
rotatePlayerBodyToward(carrier, target, 0.92);
const carrierControlPoint = getPlayerBallControlPoint(carrier);
state.ball.position = cloneVector(carrierControlPoint);
state.ball.startPosition = cloneVector(carrierControlPoint);
applyAutopilotsForCurrentAction();
logEvent(
`${carrier.shortLabel} ${carrier.role} dribbles toward x ${target.x.toFixed(1)}, y ${target.y.toFixed(1)} at ${formatSpeed(resolvedProfile.averageSpeed)}.`
);
}

function issueBallCommand(targetPoint, forcedMode = null) {
const actionMode = forcedMode ?? getRequestedActionMode();
if (actionMode === null) {
logEvent("Press P, D or S, or arm a mode button, before placing a ball action.");
return;
}
if (actionMode === "dribble") {
issueDribbleCommand(targetPoint);
return;
}
if (actionMode === "shot") {
issueShotCommand(targetPoint);
return;
}
issuePassCommand(targetPoint);
}

  return {
    refreshPlannedBallActionProfile,
    clearBallAction,
    setBallOwner,
    issuePassLikeCommand,
    issuePassCommand,
    issueShotCommand,
    issueDribbleCommand,
    issueBallCommand,
  };
}
