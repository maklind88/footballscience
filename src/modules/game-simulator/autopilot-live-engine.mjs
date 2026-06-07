export function createGameSimulatorAutopilotLiveEngine(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    buildDefensiveAutopilotTargets,
    buildOffensiveAutopilotTargets,
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    defensiveAutopilotProfiles,
    defensivePhaseProfiles,
    distance,
    getActionInitiator,
    getActionOrigin,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackStyleRhythmProfile,
    getAttackingGameSpaceProfile,
    getAutoPilotRoleStrength,
    getBallNearSupportTriangleTarget,
    getCurrentActionDuration,
    getDefensiveDribblePressTarget,
    getDefensiveThreatResponse,
    getDribblePressureReference,
    getFormationPositions,
    getKickoffDefensivePhaseKey,
    getOpponentPressureAtPoint,
    getOrientationTurnDelay,
    getOrientationMovementProfile,
    getPitchSurfacePreset,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getProjectedActionDuration,
    getSecondLastOpponentLineX,
    getTeamAttackAngle,
    getTeamAttackStyleKey,
    getTeamAttackStyleProfile,
    getTeamDefenseStyleKey,
    getTeamDefenseStyleProfile,
    getWeatherPreset,
    getWideSideSign,
    hasBallAction,
    isAerialFlightStyle,
    isGoalkeeper,
    lerp,
    logEvent,
    materializeBallProfile,
    moveTowards,
    normalize,
    normalizeAngle,
    offensiveAutopilotProfiles,
    offensivePhaseProfiles,
    pitch,
    resolveBallCurveDirection,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    teamRosterOrder,
    teams,
    uniquePrincipleLabels,
    updateActionPlayers,
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

function getDefensiveAutopilotFocusPoint(actionMeta, fallbackPoint = state.ball.target) {
if (!actionMeta?.defensiveAutopilot?.teamId) {
return null;
}
return actionMeta.defensiveAutopilot.ballFocusPoint
? cloneVector(actionMeta.defensiveAutopilot.ballFocusPoint)
: cloneVector(fallbackPoint ?? actionMeta.target ?? state.ball.target);
}
function getOffensiveAutopilotFocusPoint(actionMeta, fallbackPoint = state.ball.position) {
if (!actionMeta?.offensiveAutopilot?.teamId) {
return null;
}
return actionMeta.offensiveAutopilot.ballFocusPoint
? cloneVector(actionMeta.offensiveAutopilot.ballFocusPoint)
: cloneVector(fallbackPoint ?? actionMeta.target ?? state.ball.position);
}
function isDefensiveAutopilotPlayer(player, actionMeta) {
return (
!!player &&
!!actionMeta?.defensiveAutopilot?.teamId &&
player.team === actionMeta.defensiveAutopilot.teamId
);
}
function isOffensiveAutopilotPlayer(player, actionMeta) {
return (
!!player &&
!!actionMeta?.offensiveAutopilot?.teamId &&
player.team === actionMeta.offensiveAutopilot.teamId
);
}
function isDefensiveDribblePresser(player, actionMeta) {
return (
!!player &&
actionMeta?.actionType === "dribble" &&
isDefensiveAutopilotPlayer(player, actionMeta) &&
player.id === actionMeta.defensiveAutopilot?.presserPlayerId
);
}
function getLiveDefensiveDribblePressTarget(player, actionMeta, fallbackTarget) {
if (!isDefensiveDribblePresser(player, actionMeta)) {
return fallbackTarget;
}
const reference = getDribblePressureReference(actionMeta);
if (!reference) {
return fallbackTarget;
}
const profile = getDefensiveAutopilotProfile(
player.team,
actionMeta.target ?? reference.targetPoint,
actionMeta.defensiveAutopilot?.phaseKey ?? null
);
return getDefensiveDribblePressTarget(player, reference, profile, state.ball.position);
}
function cloneDefensiveAutopilotIntents(intents = null) {
if (!intents || typeof intents !== "object") {
return null;
}
return Object.fromEntries(
Object.entries(intents).map(([playerId, intent]) => [
playerId,
{
type: intent?.type ?? "protect-space",
label: intent?.label ?? "Protect space",
urgency: Number.isFinite(intent?.urgency) ? intent.urgency : 0.5,
lineKey: intent?.lineKey ?? null,
relationship: intent?.relationship ?? null,
},
])
);
}
function getDefensiveAutoV2Intent(player, actionMeta, targetPosition = null) {
const storedIntent = actionMeta?.defensiveAutopilot?.intents?.[player.id];
if (storedIntent) {
return {
type: storedIntent.type ?? "protect-space",
label: storedIntent.label ?? "Protect space",
urgency: Number.isFinite(storedIntent.urgency) ? storedIntent.urgency : 0.5,
lineKey: storedIntent.lineKey ?? getDefensiveAutopilotLineKey(
player,
teams[player.team]?.formation,
actionMeta?.defensiveAutopilot?.phaseKey ?? "midBlock"
),
relationship: storedIntent.relationship ?? null,
};
}
const phaseKey = actionMeta?.defensiveAutopilot?.phaseKey ?? getDefensivePhaseKey(player.team, targetPosition ?? state.ball.position);
const lineKey = getDefensiveAutopilotLineKey(player, teams[player.team]?.formation, phaseKey);
const presserId = actionMeta?.defensiveAutopilot?.presserPlayerId ?? null;
if (presserId && player.id === presserId) {
return {
type: "press-ball",
label: "Press ball",
urgency: phaseKey === "highPress" ? 1 : 0.88,
lineKey,
relationship: "nearest pressure",
};
}
if (lineKey === "back") {
return {
type: phaseKey === "highPress" ? "recover-goal-side" : "protect-space",
label: phaseKey === "highPress" ? "Recover goal-side" : "Protect space",
urgency: phaseKey === "boxDefending" ? 0.66 : 0.58,
lineKey,
relationship: "hold back-line relation",
};
}
if (lineKey === "midfield") {
const centralDistance = Math.abs((targetPosition?.y ?? player.position.y) - pitch.width / 2);
return {
type: centralDistance < pitch.width * 0.18 ? "screen-central-lane" : "cover-lane",
label: centralDistance < pitch.width * 0.18 ? "Screen central lane" : "Cover lane",
urgency: phaseKey === "lowBlock" || phaseKey === "boxDefending" ? 0.7 : 0.76,
lineKey,
relationship: "protect pass lane",
};
}
return {
type: phaseKey === "highPress" ? "cover-lane" : "support-behind",
label: phaseKey === "highPress" ? "Cover lane" : "Support behind",
urgency: phaseKey === "highPress" ? 0.82 : 0.62,
lineKey,
relationship: "cover behind pressure",
};
}
function buildDefensiveAutoV2Intents(teamId, defensivePlayers, plannedPositions, profile, presserId = null) {
const phaseKey = profile?.phaseKey ?? "midBlock";
const intents = {};
defensivePlayers.forEach((player) => {
const lineKey = getDefensiveAutopilotLineKey(player, teams[teamId]?.formation, phaseKey);
let intent;
if (presserId && player.id === presserId) {
intent = {
type: "press-ball",
label: "Press ball",
urgency: phaseKey === "highPress" ? 1 : 0.9,
lineKey,
relationship: "nearest pressure",
};
} else if (lineKey === "back") {
intent = {
type: profile?.lineActionAdjustment?.mode === "drop" ? "recover-goal-side" : "protect-space",
label: profile?.lineActionAdjustment?.mode === "drop" ? "Recover goal-side" : "Protect space",
urgency: phaseKey === "boxDefending" ? 0.66 : 0.58,
lineKey,
relationship: "hold back-line relation",
};
} else if (lineKey === "midfield") {
const target = plannedPositions.get(player.id) ?? player.position;
const centralDistance = Math.abs(target.y - pitch.width / 2);
intent = {
type: centralDistance < pitch.width * 0.18 ? "screen-central-lane" : "cover-lane",
label: centralDistance < pitch.width * 0.18 ? "Screen central lane" : "Cover lane",
urgency: phaseKey === "lowBlock" || phaseKey === "boxDefending" ? 0.7 : 0.76,
lineKey,
relationship: "protect pass lane",
};
} else {
intent = {
type: phaseKey === "highPress" ? "cover-lane" : "support-behind",
label: phaseKey === "highPress" ? "Cover lane" : "Support behind",
urgency: phaseKey === "highPress" ? 0.82 : 0.62,
lineKey,
relationship: "cover behind pressure",
};
}
intents[player.id] = intent;
});
return intents;
}
function setReachableDefensiveAutoV2Target(plannedPositions, player, target) {
if (!player || !target || !plannedPositions.has(player.id)) {
return false;
}
const origin = getActionOrigin(player);
const nextTarget = clampToPitch(
clampToCircle(target, origin, getEditableRadius(player)),
2
);
if (distance(plannedPositions.get(player.id), nextTarget) <= 0.04) {
return false;
}
plannedPositions.set(player.id, nextTarget);
return true;
}
function applyDefensiveAutoV2BackLineRelationship(
teamId,
plannedPositions,
groups,
profile,
ballPoint,
presserId = null
) {
const backs = (groups.back ?? [])
.filter((player) => !isGoalkeeper(player) && plannedPositions.has(player.id))
.sort((a, b) => plannedPositions.get(a.id).y - plannedPositions.get(b.id).y);
if (backs.length < 2) {
return [];
}
const desiredGap = clamp(
getDefensiveUnitGap(profile, "back"),
profile.phaseKey === "boxDefending" ? 7 : profile.phaseKey === "lowBlock" ? 7.6 : 8.2,
profile.phaseKey === "highPress" ? 11.6 : 9.8
);
const lineWidth = desiredGap * (backs.length - 1);
const lineX = getDefensiveLineX(teamId, "back", ballPoint, profile);
const centerY = getDefensiveLineCenterY("back", profile, ballPoint, lineWidth);
let adjusted = false;
backs.forEach((player, index) => {
const current = plannedPositions.get(player.id);
const isPresser = presserId && player.id === presserId;
const slot = {
x: lineX,
y: clamp(centerY - lineWidth / 2 + desiredGap * index, 3.1, pitch.width - 3.1),
};
const relationshipWeight =
profile.phaseKey === "boxDefending"
? 0.82
: profile.phaseKey === "lowBlock"
? 0.74
: profile.phaseKey === "highPress"
? 0.46
: 0.62;
const weight = isPresser ? relationshipWeight * 0.36 : relationshipWeight;
adjusted = setReachableDefensiveAutoV2Target(plannedPositions, player, {
x: lerp(current.x, slot.x, weight),
y: lerp(current.y, slot.y, weight),
}) || adjusted;
});
return adjusted ? ["Auto v2: back line stays connected"] : [];
}
function applyDefensiveAutoV2MidfieldPressCover(
teamId,
plannedPositions,
groups,
profile,
ballPoint,
presser = null
) {
if (!presser || !plannedPositions.has(presser.id)) {
return [];
}
const midfielders = (groups.midfield ?? [])
.filter((player) => !isGoalkeeper(player) && player.id !== presser.id && plannedPositions.has(player.id))
.sort((a, b) => {
const aTarget = plannedPositions.get(a.id);
const bTarget = plannedPositions.get(b.id);
return Math.abs(aTarget.y - ballPoint.y) - Math.abs(bTarget.y - ballPoint.y);
});
if (!midfielders.length) {
return [];
}
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const pressTarget = plannedPositions.get(presser.id);
const pressDepth = getDistanceFromOwnGoal(teamId, pressTarget);
const screenDepth = clamp(
pressDepth - (profile.phaseKey === "highPress" ? 6.2 : profile.phaseKey === "midBlock" ? 5.2 : 4.2),
profile.minBackLineFromOwnGoal + 5.8,
Math.max(profile.minBackLineFromOwnGoal + 6.2, getDefensiveLineDistanceFromOwnGoal(teamId, "midfield", ballPoint, profile))
);
const screenX = ownGoalX + sign * screenDepth;
const screenPlayers = midfielders.slice(0, Math.min(2, midfielders.length));
let adjusted = false;
screenPlayers.forEach((player, index) => {
const current = plannedPositions.get(player.id);
const side = index === 0 ? 0 : Math.sign(current.y - ballPoint.y) || getWideSideSign(ballPoint) || 1;
const screenY = clamp(
lerp(current.y, ballPoint.y + side * (index === 0 ? 0 : 7.2), 0.62),
5.2,
pitch.width - 5.2
);
const weight =
profile.phaseKey === "boxDefending"
? 0.78
: profile.phaseKey === "lowBlock"
? 0.7
: profile.phaseKey === "highPress"
? 0.42
: 0.58;
adjusted = setReachableDefensiveAutoV2Target(plannedPositions, player, {
x: lerp(current.x, screenX, weight),
y: screenY,
}) || adjusted;
});
return adjusted ? ["Auto v2: midfield covers behind press"] : [];
}
function applyDefensiveAutoV2PressTether(
teamId,
plannedPositions,
groups,
profile,
ballPoint,
presser = null
) {
if (!presser || !plannedPositions.has(presser.id)) {
return [];
}
const supportPool = [...(groups.midfield ?? []), ...(groups.back ?? [])]
.filter((player) => !isGoalkeeper(player) && player.id !== presser.id && plannedPositions.has(player.id));
if (!supportPool.length) {
return [];
}
const pressTarget = plannedPositions.get(presser.id);
const nearestSupport = supportPool
.map((player) => ({
player,
target: plannedPositions.get(player.id),
gap: distance(pressTarget, plannedPositions.get(player.id)),
}))
.sort((a, b) => a.gap - b.gap)[0];
const maxSupportGap =
profile.phaseKey === "highPress"
? 13.8
: profile.phaseKey === "midBlock"
? 11.8
: 9.8;
if (!nearestSupport || nearestSupport.gap <= maxSupportGap) {
return [];
}
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const pressDepth = getDistanceFromOwnGoal(teamId, pressTarget);
const supportDepth = clamp(
pressDepth - (profile.phaseKey === "highPress" ? 5.4 : 4.2),
profile.minBackLineFromOwnGoal + 4,
profile.maxBackLineFromOwnGoal + 12
);
const tetherTarget = {
x: ownGoalX + sign * supportDepth,
y: lerp(nearestSupport.target.y, pressTarget.y, 0.48),
};
const adjusted = setReachableDefensiveAutoV2Target(
plannedPositions,
nearestSupport.player,
tetherTarget
);
return adjusted ? ["Auto v2: press has close cover"] : [];
}
function applyDefensiveAutoV2AntiMagnetRelationships(
teamId,
plannedPositions,
groups,
profile,
ballPoint,
presser = null
) {
const labels = [];
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? [])
.filter((player) => !isGoalkeeper(player) && player.id !== presser?.id && plannedPositions.has(player.id));
if (!players.length) {
return;
}
const lineWidth = getDefensiveUnitGap(profile, lineKey) * Math.max(0, players.length - 1);
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const ballPullLimit =
lineKey === "forward"
? 13.5
: lineKey === "midfield"
? 10.8
: 8.2;
players.forEach((player, index) => {
const current = plannedPositions.get(player.id);
const overPulledToBall = distance(current, ballPoint) < ballPullLimit;
if (!overPulledToBall) {
return;
}
const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
const relationshipSlot = {
x: lineX,
y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.2, pitch.width - 3.2),
};
const weight = lineKey === "back" ? 0.64 : lineKey === "midfield" ? 0.5 : 0.34;
if (setReachableDefensiveAutoV2Target(plannedPositions, player, {
x: lerp(current.x, relationshipSlot.x, weight),
y: lerp(current.y, relationshipSlot.y, weight),
})) {
labels.push("Auto v2: non-pressers hold team shape");
}
});
});
return uniquePrincipleLabels(labels);
}
function applyDefensiveAutoV2RelationshipLayer(
teamId,
plannedPositions,
profile,
ballPoint,
presser = null
) {
if (!teamId || !plannedPositions?.size || !profile || !ballPoint) {
return [];
}
const groups = getDefensiveAutopilotGroupsForTeam(teamId, profile.phaseKey);
return uniquePrincipleLabels([
...applyDefensiveAutoV2MidfieldPressCover(teamId, plannedPositions, groups, profile, ballPoint, presser),
...applyDefensiveAutoV2PressTether(teamId, plannedPositions, groups, profile, ballPoint, presser),
...applyDefensiveAutoV2BackLineRelationship(teamId, plannedPositions, groups, profile, ballPoint, presser?.id ?? null),
...applyDefensiveAutoV2AntiMagnetRelationships(teamId, plannedPositions, groups, profile, ballPoint, presser),
]);
}
function getDefensiveAutoV2FrameDt(player, elapsed) {
const previousElapsed = Number.isFinite(player.autoV2LastElapsed) ? player.autoV2LastElapsed : 0;
let frameDt = elapsed - previousElapsed;
if (!Number.isFinite(frameDt) || frameDt <= 0 || frameDt > 0.12) {
frameDt = 0.05;
}
player.autoV2LastElapsed = elapsed;
return frameDt;
}
function moveDefensiveAutoV2Player(player, targetPosition, actionMeta, intent, elapsed, focusPoint = null) {
if (!targetPosition) {
return;
}
const context = getPlayerDecisionContext(player);
const frameDt = getDefensiveAutoV2FrameDt(player, elapsed);
const runTime = Math.max(0, elapsed - context.reactionTime * (intent.type === "press-ball" ? 0.42 : 0.78));
if (runTime <= 0) {
if (focusPoint) {
rotatePlayerBodyToward(player, focusPoint, 0.08);
}
return;
}
const previousPosition = cloneVector(player.position);
const remaining = distance(previousPosition, targetPosition);
if (remaining <= 0.025) {
player.position = cloneVector(targetPosition);
player.autoV2Velocity = { x: 0, y: 0 };
if (focusPoint) {
rotatePlayerBodyToward(player, focusPoint, intent.type === "press-ball" ? 0.42 : 0.3);
}
return;
}
const currentVelocity = player.autoV2Velocity ?? { x: 0, y: 0 };
const currentSpeed = Math.hypot(currentVelocity.x, currentVelocity.y);
const currentAngle =
currentSpeed > 0.05
? Math.atan2(currentVelocity.y, currentVelocity.x)
: getPlayerFacingAngle(player);
const desiredAngle = angleBetween(previousPosition, targetPosition);
const intentUrgency = clamp(intent.urgency ?? 0.65, 0.35, 1.08);
const turnRate =
(intent.type === "press-ball" ? 3.9 : intent.lineKey === "back" ? 2.35 : 2.9) *
(0.74 + context.profile.tacticalDiscipline * 0.24 + context.profile.perception * 0.18);
const angleDelta = normalizeAngle(desiredAngle - currentAngle);
const limitedAngle = currentAngle + clamp(angleDelta, -turnRate * frameDt, turnRate * frameDt);
const brakeDistance = intent.type === "press-ball" ? 1.35 : intent.lineKey === "back" ? 2.35 : 1.85;
const maxSpeed =
context.maxSpeed *
(intent.type === "press-ball" ? 0.94 : intent.lineKey === "back" ? 0.62 : 0.72) *
intentUrgency;
const acceleration =
context.acceleration *
(intent.type === "press-ball" ? 1.04 : intent.lineKey === "back" ? 0.72 : 0.84);
const brakingSpeed = Math.sqrt(Math.max(0, 2 * acceleration * Math.max(0, remaining - brakeDistance * 0.32)));
const desiredSpeed = clamp(Math.min(maxSpeed, brakingSpeed), 0, maxSpeed);
const nextSpeed = currentSpeed + clamp(desiredSpeed - currentSpeed, -acceleration * 1.34 * frameDt, acceleration * frameDt);
const nextVelocity = {
x: Math.cos(limitedAngle) * nextSpeed,
y: Math.sin(limitedAngle) * nextSpeed,
};
const rawNext = {
x: previousPosition.x + nextVelocity.x * frameDt,
y: previousPosition.y + nextVelocity.y * frameDt,
};
const nextPosition = clampToPitch(
distance(rawNext, targetPosition) < Math.max(0.05, nextSpeed * frameDt * 0.7)
? targetPosition
: rawNext,
2
);
player.position = nextPosition;
player.autoV2Velocity = nextVelocity;
player.movementProgress = distance(getActionOrigin(player), nextPosition);
if (distance(previousPosition, nextPosition) > 0.004) {
rotatePlayerBodyAlongMovement(player, previousPosition, nextPosition, intent.type === "press-ball" ? 0.36 : 0.28);
} else if (focusPoint) {
rotatePlayerBodyToward(player, focusPoint, 0.16);
}
}
function alignArrivedDefensiveAutopilotPlayers(actionMeta, targetMap, focusPoint = null) {
const defensiveFocusPoint = focusPoint ?? getDefensiveAutopilotFocusPoint(actionMeta);
if (!targetMap || !defensiveFocusPoint) {
return;
}
state.players.forEach((player) => {
if (!isDefensiveAutopilotPlayer(player, actionMeta)) {
return;
}
const targetPosition = targetMap.get(player.id);
if (!targetPosition || distance(player.position, targetPosition) > 0.12) {
return;
}
rotatePlayerBodyToward(player, defensiveFocusPoint, 0.92);
});
}
function completeLiveActionPlayersBeforeCommit(focusPoint = state.ball.position) {
if (!state.activeActionTargets || !state.draftStep) {
return;
}
updateActionPlayers(state.activeActionTargets, state.draftStep);
alignArrivedDefensiveAutopilotPlayers(
state.draftStep,
state.activeActionTargets,
focusPoint
);
}
function getActionSpeed() {
const dribbleDraftSpeed =
state.draftStep?.actionType === "dribble" ? state.draftStep.speed : null;
const baseSpeed = state.ball.actionType === "dribble"
? dribbleDraftSpeed ?? state.ball.speed ?? state.dribbleSpeed
: state.ball.speed;
const initiator = getActionInitiator();
if (!initiator) {
return baseSpeed;
}
const context = getPlayerDecisionContext(initiator);
const actionSecurity =
context.profile.executionUnderPressure * 0.75 +
context.profile.decisionQuality * 0.25;
const pressurePenalty =
context.pressure *
(state.ball.actionType === "dribble" ? 0.18 : 0.12) *
(1 - actionSecurity);
if (state.ball.actionType === "dribble") {
return baseSpeed;
}
const laneBonus = state.ball.actionType === "pass"
? 0.92 + state.ball.laneClarity * 0.08
: 1;
return baseSpeed * clamp((1 - pressurePenalty) * laneBonus, 0.82, 1.04);
}
function configureBallTravelProfile(actionType, distance, averageSpeed, ballProfile = null) {
if (actionType === "dribble") {
state.ball.launchSpeed = averageSpeed;
state.ball.currentSpeed = averageSpeed;
state.ball.finalSpeed = averageSpeed;
state.ball.deceleration = 0;
state.ball.flightStyle = "ground";
state.ball.peakHeight = 0;
state.ball.height = 0;
state.ball.controlHeightThreshold = 0.12;
state.ball.landingPhaseStart = 0.58;
state.ball.curveAmount = 0;
state.ball.curveDirection = 1;
state.ball.spinRate = 0;
state.ball.spinAngle = 0;
state.ball.trackDistanceTotal = Math.max(distance, 0);
state.ball.trackDistanceCovered = 0;
return;
}
const safeDistance = Math.max(distance, 0.01);
const safeAverageSpeed = Math.max(averageSpeed, 0.01);
const surfacePreset = getPitchSurfacePreset();
const weatherPreset = getWeatherPreset();
const resolvedProfile =
ballProfile ??
materializeBallProfile(
actionType === "shot" ? "shot" : "firm-feet",
safeDistance,
actionType === "shot" ? "goal" : "to-feet",
state.ball.profileMode ?? state.ballSpeedMode
);
const executionBlend = clamp(state.ball.executionQuality, 0.42, 0.98);
const isGroundLike = !isAerialFlightStyle(resolvedProfile.flightStyle);
const groundSurfaceRatio = clamp(
(surfacePreset.groundRollFactor - 0.94) / 0.13,
0,
1
);
const launchSurfaceFactor = isGroundLike
? lerp(0.985, 1.015, groundSurfaceRatio)
: surfacePreset.airCarryFactor;
const launchSpeed =
safeAverageSpeed *
(resolvedProfile.launchMultiplier + (1 - executionBlend) * (actionType === "shot" ? 0.04 : 0.03)) *
launchSurfaceFactor;
const finalFloor = Math.max(
actionType === "shot" ? 1.8 : 0.45,
resolvedProfile.rollFloor *
(isGroundLike ? surfacePreset.groundRollFactor : lerp(0.9, 1.03, groundSurfaceRatio)) *
weatherPreset.ballRollFactor *
(0.96 + executionBlend * 0.05)
);
const finalSpeed = clamp(
2 * safeAverageSpeed - launchSpeed,
finalFloor,
Math.max(finalFloor, launchSpeed - 0.12)
);
const travelDuration = (2 * safeDistance) / Math.max(launchSpeed + finalSpeed, 0.01);
const deceleration = Math.max((launchSpeed - finalSpeed) / Math.max(travelDuration, 0.01), 0);
state.ball.launchSpeed = launchSpeed;
state.ball.currentSpeed = launchSpeed;
state.ball.finalSpeed = finalSpeed;
state.ball.deceleration = deceleration;
state.ball.flightStyle = resolvedProfile.flightStyle ?? "ground";
state.ball.peakHeight = resolvedProfile.peakHeight ?? 0;
state.ball.height = 0;
state.ball.controlHeightThreshold = resolvedProfile.controlHeightThreshold ?? 0.12;
state.ball.landingPhaseStart = resolvedProfile.landingPhaseStart ?? 0.58;
state.ball.curveAmount = resolvedProfile.curveAmount ?? 0;
state.ball.curveDirection = resolveBallCurveDirection(
state.ball.startPosition,
state.ball.target,
getActionInitiator()
);
state.ball.spinRate = resolvedProfile.spinRate ?? 0;
state.ball.spinAngle = 0;
state.ball.trackDistanceTotal = safeDistance;
state.ball.trackDistanceCovered = 0;
}
function getActionDistance() {
if (state.ball.actionType !== null || state.ball.inTransit || state.draftStep) {
return distance(state.ball.startPosition, state.ball.target);
}
return 0;
}
function getRequestedActionMode() {
return state.keyboardActionMode ?? state.actionMode;
}
function computeReachDistance(player, actionDuration, targetPoint = state.ball.target) {
const context = getPlayerDecisionContext(player);
const orientationProfile = getOrientationMovementProfile(player, targetPoint);
const intendedDistance = targetPoint
? distance(getActionOrigin(player), targetPoint)
: 0;
const shortBurstRatio = clamp(
1 - intendedDistance / Math.max(context.sprintProfile.burstDistance, 0.01),
0,
1
);
const runTime = Math.max(0, actionDuration - context.reactionTime - getOrientationTurnDelay(player, targetPoint));
if (runTime <= 0) {
return 0;
}
const effectiveAcceleration = Math.max(
context.acceleration *
orientationProfile.accelerationMultiplier *
(1 + context.sprintProfile.shortBurstBoost * shortBurstRatio),
0.01
);
const effectiveMaxSpeed = Math.max(context.maxSpeed * orientationProfile.speedMultiplier, 0.01);
const timeToTopSpeed = effectiveMaxSpeed / effectiveAcceleration;
if (runTime <= timeToTopSpeed) {
return 0.5 * effectiveAcceleration * runTime * runTime;
}
const accelerationDistance = 0.5 * effectiveAcceleration * timeToTopSpeed * timeToTopSpeed;
const sprintTime = runTime - timeToTopSpeed;
return accelerationDistance + effectiveMaxSpeed * sprintTime;
}
function computeTimeToCoverDistance(player, targetDistance, targetPoint = state.ball.target) {
if (targetDistance <= 0) {
return 0;
}
const context = getPlayerDecisionContext(player);
const orientationProfile = getOrientationMovementProfile(player, targetPoint);
const intendedDistance = targetPoint
? distance(getActionOrigin(player), targetPoint)
: targetDistance;
const shortBurstRatio = clamp(
1 - intendedDistance / Math.max(context.sprintProfile.burstDistance, 0.01),
0,
1
);
const acceleration = Math.max(
context.acceleration *
orientationProfile.accelerationMultiplier *
(1 + context.sprintProfile.shortBurstBoost * shortBurstRatio),
0.01
);
const maxSpeed = Math.max(context.maxSpeed * orientationProfile.speedMultiplier, 0.01);
const timeToTopSpeed = maxSpeed / acceleration;
const accelerationDistance = 0.5 * acceleration * timeToTopSpeed * timeToTopSpeed;
if (targetDistance <= accelerationDistance) {
return context.reactionTime + getOrientationTurnDelay(player, targetPoint) + Math.sqrt((2 * targetDistance) / acceleration);
}
return (
context.reactionTime +
getOrientationTurnDelay(player, targetPoint) +
timeToTopSpeed +
(targetDistance - accelerationDistance) / maxSpeed
);
}
function shouldUseCurvedRecoveryRun(player, startPoint, endPoint) {
const straightDistance = distance(startPoint, endPoint);
if (straightDistance < 5.5) {
return false;
}
const label = getPlayerMagnetLabel(player);
const towardOwnGoal =
distance(endPoint, getOwnGoalCenter(player.team)) <
distance(startPoint, getOwnGoalCenter(player.team)) - 1.1;
const towardInside =
Math.abs(endPoint.y - pitch.width / 2) <
Math.abs(startPoint.y - pitch.width / 2) - 1.2;
return towardOwnGoal || towardInside || ["CB", "LB", "RB", "WB", "6", "8", "10"].includes(label);
}
function getCurvedRecoveryWaypoint(player, startPoint, endPoint) {
if (!shouldUseCurvedRecoveryRun(player, startPoint, endPoint)) {
return null;
}
const straightDistance = distance(startPoint, endPoint);
const distanceRatio = clamp(straightDistance / 18, 0, 1);
const ownGoalDirection = player.team === "home" ? -1 : 1;
const towardCenterSign = Math.sign(pitch.width / 2 - startPoint.y) || 1;
const xBias = ownGoalDirection * lerp(0.45, 2.2, distanceRatio);
const yBias = towardCenterSign * lerp(0.3, 1.9, distanceRatio);
const waypoint = clampToPitch({
x: lerp(startPoint.x, endPoint.x, 0.34) + xBias,
y: lerp(startPoint.y, endPoint.y, 0.34) + yBias,
}, 0.2);
if (distance(startPoint, waypoint) <= 0.55 || distance(waypoint, endPoint) <= 0.55) {
return null;
}
return waypoint;
}
function shouldUseOffBallCounterMovementRun(player, startPoint, endPoint, actionMeta = null) {
if (!player || !startPoint || !endPoint || !actionMeta || isGoalkeeper(player)) {
return false;
}
if (!isOffensiveAutopilotPlayer(player, actionMeta)) {
return false;
}
if (
player.id === actionMeta.carrierPlayerId ||
player.id === actionMeta.receiverPlayerId ||
player.id === actionMeta.beforeSnapshot?.ball?.ownerPlayerId
) {
return false;
}
const straightDistance = distance(startPoint, endPoint);
if (straightDistance < 5.75) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
if (!["wideForward", "striker", "secondStriker", "connector", "wideBack"].includes(roleKey)) {
return false;
}
const targetDepth = getAttackingDepth(endPoint, player.team);
const targetThreat = getPitchThreatProfile(endPoint, player.team);
const gameSpace = getAttackingGameSpaceProfile(endPoint, player.team);
const principleText = [
actionMeta.label,
actionMeta.autoReason,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isRunPrinciple =
principleText.includes("blindside") ||
principleText.includes("overlap") ||
principleText.includes("underlap") ||
principleText.includes("box") ||
principleText.includes("third-man") ||
principleText.includes("channel") ||
principleText.includes("run");
const isHighValueRun =
targetDepth >= 58 &&
(
gameSpace.key === "space2" ||
gameSpace.key === "space3" ||
targetThreat.box >= 0.18 ||
targetThreat.behindLine >= 0.22 ||
targetThreat.cutbackZone >= 0.22 ||
targetThreat.assistZone >= 0.3
);
return isRunPrinciple || isHighValueRun;
}
function getOffBallCounterMovementWaypoint(player, startPoint, endPoint, actionMeta = null) {
if (!shouldUseOffBallCounterMovementRun(player, startPoint, endPoint, actionMeta)) {
return null;
}
const straightDistance = distance(startPoint, endPoint);
const direction = normalize(startPoint, endPoint);
const lateral = { x: -direction.y, y: direction.x };
const attackSign = getAttackDirectionSign(player.team);
const targetThreat = getPitchThreatProfile(endPoint, player.team);
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const depthDip = clamp(straightDistance * 0.11, 0.75, targetThreat.box >= 0.2 ? 2.25 : 1.65);
const lateralDip = clamp(straightDistance * 0.08, 0.55, roleKey === "wideBack" ? 2.2 : 1.55);
const finalLaneSign =
Math.sign(endPoint.y - startPoint.y) ||
Math.sign(endPoint.y - pitch.width / 2) ||
1;
const lateralDirection = Math.sign(lateral.y) === -finalLaneSign ? 1 : -1;
const waypoint = clampToPitch({
x: startPoint.x - attackSign * depthDip + lateral.x * lateralDip * lateralDirection,
y: startPoint.y + lateral.y * lateralDip * lateralDirection,
}, 2.2);
if (
distance(startPoint, waypoint) <= 0.45 ||
distance(waypoint, endPoint) <= 0.75 ||
distance(startPoint, waypoint) > Math.max(straightDistance * 0.38, 3.4)
) {
return null;
}
return waypoint;
}
function buildMovementPath(player, startPoint, endPoint, actionMeta = null) {
const waypoint =
getOffBallCounterMovementWaypoint(player, startPoint, endPoint, actionMeta) ??
getCurvedRecoveryWaypoint(player, startPoint, endPoint);
if (!waypoint) {
const straightDistance = distance(startPoint, endPoint);
return {
start: startPoint,
end: endPoint,
waypoint: null,
totalDistance: straightDistance,
};
}
return {
start: startPoint,
end: endPoint,
waypoint,
segmentOneDistance: distance(startPoint, waypoint),
segmentTwoDistance: distance(waypoint, endPoint),
totalDistance: distance(startPoint, waypoint) + distance(waypoint, endPoint),
};
}
function getMovementPathPoint(path, traveledDistance) {
if (!path.waypoint) {
return moveTowards(path.start, path.end, traveledDistance);
}
if (traveledDistance <= path.segmentOneDistance) {
return moveTowards(path.start, path.waypoint, traveledDistance);
}
return moveTowards(
path.waypoint,
path.end,
traveledDistance - path.segmentOneDistance
);
}
function getSnapshotPlayerMap(snapshot) {
return new Map(
(snapshot?.players ?? []).map((player) => [player.id, cloneVector(player.position)])
);
}
function getRecordedStepEndSnapshot(step) {
return step.afterSnapshot ?? step.beforeSnapshot;
}
function getRecordedStepDuration(step) {
const startPoint = step.beforeSnapshot?.ball?.position ?? state.ball.position;
return distance(startPoint, step.target) / Math.max(step.speed, 0.01);
}
function snapshotsMatch(a, b, tolerance = 0.08) {
if (!a || !b) {
return false;
}
if (
(a.formations?.home ?? teams.home.formation) !==
(b.formations?.home ?? teams.home.formation) ||
(a.formations?.away ?? teams.away.formation) !==
(b.formations?.away ?? teams.away.formation)
) {
return false;
}
if (
(a.teamIdentities?.home?.attackStyle ?? teams.home.identity.attackStyle) !==
(b.teamIdentities?.home?.attackStyle ?? teams.home.identity.attackStyle) ||
(a.teamIdentities?.home?.defenseStyle ?? teams.home.identity.defenseStyle) !==
(b.teamIdentities?.home?.defenseStyle ?? teams.home.identity.defenseStyle) ||
(a.teamIdentities?.away?.attackStyle ?? teams.away.identity.attackStyle) !==
(b.teamIdentities?.away?.attackStyle ?? teams.away.identity.attackStyle) ||
(a.teamIdentities?.away?.defenseStyle ?? teams.away.identity.defenseStyle) !==
(b.teamIdentities?.away?.defenseStyle ?? teams.away.identity.defenseStyle)
) {
return false;
}
if ((a.physicalProfile ?? state.physicalProfile) !== (b.physicalProfile ?? state.physicalProfile)) {
return false;
}
if (distance(a.ball.position, b.ball.position) > tolerance) {
return false;
}
if ((a.ball.ownerPlayerId ?? null) !== (b.ball.ownerPlayerId ?? null)) {
return false;
}
const bPlayers = getSnapshotPlayerMap(b);
return a.players.every((player) => {
const targetPosition = bPlayers.get(player.id);
return targetPosition ? distance(player.position, targetPosition) <= tolerance : false;
});
}
function createTransitionPlan(startSnapshot, targetSnapshot) {
const startPositions = getSnapshotPlayerMap(startSnapshot);
const targetPositions = getSnapshotPlayerMap(targetSnapshot);
const playerTargets = new Map();
let duration = 0;
state.players.forEach((player) => {
const start = startPositions.get(player.id) ?? cloneVector(player.position);
const end = targetPositions.get(player.id) ?? cloneVector(start);
playerTargets.set(player.id, {
start,
end,
});
duration = Math.max(
duration,
computeTimeToCoverDistance(player, distance(start, end), end)
);
});
const ballStart = cloneVector(startSnapshot.ball.position);
const ballEnd = cloneVector(targetSnapshot.ball.position);
const hasFreeBall = !targetSnapshot.ball.ownerPlayerId;
if (hasFreeBall) {
duration = Math.max(duration, distance(ballStart, ballEnd) / Math.max(state.ball.speed, 12));
}
return {
startSnapshot,
targetSnapshot,
duration,
elapsed: 0,
playerTargets,
ballStart,
ballEnd,
ballOwnerPlayerId: targetSnapshot.ball.ownerPlayerId ?? null,
};
}
function clampToCircle(point, center, radius) {
if (!Number.isFinite(radius) || radius <= 0) {
return cloneVector(center);
}
const gap = distance(center, point);
if (gap <= radius) {
return point;
}
return moveTowards(center, point, radius);
}
function getEditableRadius(player) {
if (!hasBallAction()) {
return Infinity;
}
if (state.ball.elapsedTravelTime > 0) {
return computeReachDistance(player, getCurrentActionDuration());
}
return computeReachDistance(player, getProjectedActionDuration());
}
function getOtherTeamId(teamId) {
if (teamId === "home") return "away";
if (teamId === "away") return "home";
return null;
}
function getPlannedPossessionTeamId() {
const candidateIds = [
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.initiatorPlayerId,
state.draftStep?.carrierPlayerId,
state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId,
state.selectedPlayerId,
];
for (const playerId of candidateIds) {
const player = getPlayerById(playerId);
if (player?.team) {
return player.team;
}
}
return null;
}
function getDefendingDirectionSign(teamId) {
return teamId === "home" ? 1 : -1;
}
function getDepthX(teamId, depth) {
return teamId === "home" ? depth : pitch.length - depth;
}
function getDistanceFromOwnGoal(teamId, point) {
const ownGoalX = teamId === "home" ? 0 : pitch.length;
return clamp((point.x - ownGoalX) * getDefendingDirectionSign(teamId), 0, pitch.length);
}
function getOffensivePhaseKey(teamId, ballPoint, actionType = state.ball.actionType ?? state.draftStep?.actionType) {
if (state.restartPhase?.type) {
return "setPiece";
}
const ballDepth = getAttackingDepth(ballPoint, teamId);
if (actionType === "shot" || ballDepth >= 72) {
return "finalThird";
}
if (ballDepth <= 34) {
return "buildUp";
}
return "progression";
}
function getOffensiveAutopilotProfile(teamId, ballPoint = state.ball.target ?? state.ball.position, phaseKey = null) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const formationProfile = offensiveAutopilotProfiles[formation] ?? offensiveAutopilotProfiles["4-3-3"];
const resolvedPhaseKey = phaseKey ?? getOffensivePhaseKey(teamId, ballPoint);
const phaseProfile = offensivePhaseProfiles[resolvedPhaseKey] ?? offensivePhaseProfiles.progression;
const styleKey = getTeamAttackStyleKey(teamId);
const styleProfile = getTeamAttackStyleProfile(teamId);
const rhythmProfile = getAttackStyleRhythmProfile(styleKey);
return {
...formationProfile,
...phaseProfile,
formation,
phaseKey: resolvedPhaseKey,
phaseLabel: phaseProfile.label,
styleKey,
styleLabel: styleProfile.label,
stylePrincipleLabel: styleProfile.principleLabel,
principleLabel: `${formationProfile.principleLabel}; ${styleProfile.principleLabel}`,
width: clamp(formationProfile.width * phaseProfile.widthMultiplier * styleProfile.widthMultiplier, 40, 66),
restBehind: clamp(
formationProfile.restBehind + phaseProfile.restBehindOffset + styleProfile.restBehindOffset,
15,
33
),
frontAhead: clamp(
formationProfile.frontAhead + phaseProfile.depthStretch + styleProfile.frontAheadOffset,
7,
22
),
supportCompactness: clamp(
(phaseProfile.supportCompactness ?? 0.12) * styleProfile.supportCompactnessMultiplier,
0.04,
0.3
),
directness: styleProfile.directness,
shortSupport: styleProfile.shortSupport,
lineBreakBias: styleProfile.lineBreakBias,
switchBias: styleProfile.switchBias,
crossBias: styleProfile.crossBias,
overlapBias: styleProfile.overlapBias,
dribbleBias: styleProfile.dribbleBias,
shootBias: styleProfile.shootBias,
tempo: styleProfile.tempo,
risk: styleProfile.risk,
firstTouchForwardBias: styleProfile.firstTouchForwardBias,
passBias: styleProfile.passBias ?? clamp(0.4 + styleProfile.shortSupport * 0.35 - styleProfile.directness * 0.08, 0.2, 0.92),
carryBias: styleProfile.carryBias ?? styleProfile.dribbleBias,
deliveryBias: styleProfile.deliveryBias ?? styleProfile.crossBias,
routeOneBias: styleProfile.routeOneBias ?? 0,
rhythm: rhythmProfile,
targetPossessionSeconds: rhythmProfile.targetSeconds,
progressionUrgency: rhythmProfile.progressionUrgency,
sidewaysTolerance: rhythmProfile.sidewaysTolerance,
recycleWindow: rhythmProfile.recycleWindow,
widthDiscipline: clamp(
0.54 + styleProfile.switchBias * 0.16 + styleProfile.crossBias * 0.14 + (styleProfile.directness < 0.42 ? 0.08 : 0),
0.54,
0.88
),
};
}
function getOffensiveRoleKey(player, formation = teams[player.team]?.formation) {
const label = getPlayerMagnetLabel(player);
if (label === "GK") return "gk";
if (label === "CB") return "rest";
if (label === "LB" || label === "RB" || label === "WB") return "wideBack";
if (label === "6") return "pivot";
if (formation === "4-4-2" && label === "10") return "secondStriker";
if (label === "8" || label === "10") return "connector";
if (label === "W") return "wideForward";
if (label === "9") return "striker";
return "connector";
}
const pitchLaneKeys = ["leftWide", "leftHalf", "central", "rightHalf", "rightWide"];
function getPitchLaneKey(point) {
const y = point?.y ?? pitch.width / 2;
if (y <= 9.5) return "leftWide";
if (y <= 25.5) return "leftHalf";
if (y <= 42.5) return "central";
if (y <= 58.5) return "rightHalf";
return "rightWide";
}
function getPitchLaneIndex(pointOrLane) {
const laneKey = typeof pointOrLane === "string" ? pointOrLane : getPitchLaneKey(pointOrLane);
return Math.max(0, pitchLaneKeys.indexOf(laneKey));
}
function getAttackingThirdKey(point, teamId) {
const depth = getAttackingDepth(point, teamId);
if (depth < 34) return "build";
if (depth < 68) return "progress";
return "finish";
}
function getLaneCenterY(laneKey, profile = {}) {
const centerY = pitch.width / 2;
const width = clamp(profile.width ?? 58, 42, 66);
const wideOffset = clamp(width * 0.49, 25.5, 31.5);
const halfOffset = clamp(width * 0.24, 12, 17);
const centers = {
leftWide: centerY - wideOffset,
leftHalf: centerY - halfOffset,
central: centerY,
rightHalf: centerY + halfOffset,
rightWide: centerY + wideOffset,
};
return clamp(centers[laneKey] ?? centerY, 4, pitch.width - 4);
}
function getSideLaneKeys(baseY) {
return baseY <= pitch.width / 2
? { wide: "leftWide", half: "leftHalf" }
: { wide: "rightWide", half: "rightHalf" };
}
function getRecentPossessionSteps(teamId, limit = 5) {
const steps = state.sequence?.steps ?? [];
const recent = [];
for (let index = steps.length - 1; index >= 0 && recent.length < limit; index -= 1) {
const step = steps[index];
const ownerId =
step.beforeSnapshot?.ball?.ownerPlayerId ??
step.carrierPlayerId ??
step.initiatorPlayerId ??
null;
const owner = getPlayerById(ownerId);
const receiver = getPlayerById(step.receiverPlayerId);
if (owner?.team === teamId || receiver?.team === teamId) {
recent.push(step);
}
}
return recent;
}
function getRecordedStepPossessionTeamId(step) {
const ownerAfter = getPlayerById(step?.afterSnapshot?.ball?.ownerPlayerId);
if (ownerAfter?.team) {
return ownerAfter.team;
}
const receiver = getPlayerById(step?.receiverPlayerId);
if (receiver?.team) {
return receiver.team;
}
const carrier = getPlayerById(step?.carrierPlayerId);
if (carrier?.team) {
return carrier.team;
}
const ownerBefore = getPlayerById(step?.beforeSnapshot?.ball?.ownerPlayerId);
return ownerBefore?.team ?? null;
}
function getPossessionRhythmContext(teamId, limit = 8) {
const steps = state.sequence?.steps ?? [];
const context = {
steps: 0,
duration: 0,
sidewaysPasses: 0,
backPasses: 0,
forwardPasses: 0,
lineBreaks: 0,
lastActionType: null,
lastStep: null,
};
for (let index = steps.length - 1; index >= 0 && context.steps < limit; index -= 1) {
const step = steps[index];
const stepTeamId = getRecordedStepPossessionTeamId(step);
if (!stepTeamId || stepTeamId !== teamId) {
break;
}
const startPoint = step.beforeSnapshot?.ball?.position;
const target = step.target;
const forwardGain =
startPoint && target
? (target.x - startPoint.x) * getAttackDirectionSign(teamId)
: 0;
const lateralMeters = startPoint && target ? Math.abs(target.y - startPoint.y) : 0;
context.steps += 1;
context.duration += getRecordedStepDuration(step);
context.lastActionType = context.lastActionType ?? step.actionType;
context.lastStep = context.lastStep ?? step;
if (step.actionType !== "pass") {
continue;
}
if (Math.abs(forwardGain) < 4 && lateralMeters >= 6.5) {
context.sidewaysPasses += 1;
}
if (forwardGain <= -4.5) {
context.backPasses += 1;
}
if (forwardGain >= 6) {
context.forwardPasses += 1;
}
if (forwardGain >= 8.5) {
context.lineBreaks += 1;
}
}
return context;
}
const autoPilotPossessionIntentLabels = {
secure: "Secure possession",
progress: "Progress through pressure",
switch: "Change point of attack",
wide: "Build wide overload",
accelerate: "Accelerate into valuable space",
finish: "Finish the attack",
};
function getLaneForSideSign(sideSign, laneType = "half") {
if (laneType === "wide") {
return sideSign < 0 ? "leftWide" : "rightWide";
}
return sideSign < 0 ? "leftHalf" : "rightHalf";
}
function getWideOverlapPrincipleFit(profile) {
const formationFit = {
"4-3-3": 1,
"4-2-3-1": 0.88,
"3-4-3": 0.84,
"4-1-4-1": 0.7,
"3-5-2": 0.62,
"4-4-2": 0.52,
}[profile.formation] ?? 0.56;
const identityFit =
profile.overlapBias * 0.48 +
profile.widthDiscipline * 0.24 +
profile.crossBias * 0.18 +
profile.switchBias * 0.1;
return clamp(formationFit * 0.58 + identityFit * 0.72, 0, 1.35);
}
function getWideOverlapRunTarget(teamId, anchorPoint, sideSign, profile) {
const sign = getAttackDirectionSign(teamId);
const anchorDepth = getAttackingDepth(anchorPoint, teamId);
const forwardPush =
7.2 +
profile.overlapBias * 4.8 +
(profile.phaseKey === "finalThird" ? 2.2 : 0);
const outsideWidth = 4.4 + profile.widthDiscipline * 2.2;
const targetDepth = clamp(anchorDepth + forwardPush, 42, 96);
return clampToPitch({
x: getDepthX(teamId, targetDepth) + sign * 0.4,
y: clamp(anchorPoint.y + sideSign * outsideWidth, 3.4, pitch.width - 3.4),
}, 2);
}
function cloneOffensiveAutopilotIntents(intents = null) {
if (!intents || typeof intents !== "object") {
return null;
}
return Object.fromEntries(
Object.entries(intents).map(([playerId, intent]) => [
playerId,
{
type: intent?.type ?? "offer-angle",
label: intent?.label ?? "Offer angle",
urgency: Number.isFinite(intent?.urgency) ? intent.urgency : 0.55,
roleKey: intent?.roleKey ?? null,
startDelay: Number.isFinite(intent?.startDelay) ? intent.startDelay : 0,
relationship: intent?.relationship ?? null,
},
])
);
}
function cloneAutoV2DecisionTriggers(triggers = null) {
if (!triggers || typeof triggers !== "object") {
return null;
}
return {
ballPressure: Number.isFinite(triggers.ballPressure) ? triggers.ballPressure : 0,
forwardFacing: Number.isFinite(triggers.forwardFacing) ? triggers.forwardFacing : 0,
highBackLine: Number.isFinite(triggers.highBackLine) ? triggers.highBackLine : 0,
centralCongestion: Number.isFinite(triggers.centralCongestion) ? triggers.centralCongestion : 0,
receiverPressure: Number.isFinite(triggers.receiverPressure) ? triggers.receiverPressure : 0,
restDefenseBalance: Number.isFinite(triggers.restDefenseBalance) ? triggers.restDefenseBalance : 0,
poorTouchLooseBall: Number.isFinite(triggers.poorTouchLooseBall) ? triggers.poorTouchLooseBall : 0,
centralClosed: Number.isFinite(triggers.centralClosed) ? triggers.centralClosed : 0,
labels: Array.isArray(triggers.labels) ? [...triggers.labels] : [],
};
}
function scanAutoV2DecisionTriggers(teamId, ballPoint, actionMeta, profile = {}) {
const attackingTeamId = teamId;
const defendingTeamId = getOtherTeamId(attackingTeamId);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const carrier =
getPlayerById(actionMeta?.carrierPlayerId) ??
getPlayerById(actionMeta?.beforeSnapshot?.ball?.ownerPlayerId) ??
getPlayerById(state.ball.carrierPlayerId) ??
getPlayerById(state.ball.initiatorPlayerId) ??
getPlayerById(state.ball.ownerPlayerId);
const receiver = getPlayerById(actionMeta?.receiverPlayerId);
const actionType = actionMeta?.actionType ?? state.ball.actionType;
const ballPressure = getOpponentPressureAtPoint(attackingTeamId, startPoint ?? ballPoint, 12);
const receiverPressure = receiver || actionType === "pass"
? getOpponentPressureAtPoint(attackingTeamId, ballPoint, 10.5)
: 0;
const attackSign = getAttackDirectionSign(attackingTeamId);
const facingAngle = carrier ? getPlayerFacingAngle(carrier) : getTeamAttackAngle(attackingTeamId);
const forwardAngle = attackSign > 0 ? 0 : Math.PI;
const forwardFacing = carrier ? clamp(1 - angleDifference(facingAngle, forwardAngle) / (Math.PI * 0.62), 0, 1) : 0.5;
const centralCongestion = state.players.reduce((count, player) => {
if (player.team === attackingTeamId) {
return count;
}
const gap = Math.abs(player.position.y - pitch.width / 2);
const depthGap = Math.abs(getAttackingDepth(player.position, attackingTeamId) - getAttackingDepth(ballPoint, attackingTeamId));
return count + (gap <= 15 && depthGap <= 18 ? 1 : 0);
}, 0);
const centralCongestionScore = clamp(centralCongestion / 5, 0, 1);
const defenders = state.players.filter((player) => player.team === defendingTeamId && !isGoalkeeper(player));
const backLineDepth = defenders.length
? defenders.reduce((maxDepth, player) => Math.max(maxDepth, getDistanceFromOwnGoal(defendingTeamId, player.position)), 0)
: 0;
const highBackLine = clamp((backLineDepth - 42) / 22, 0, 1);
const ballDepth = getAttackingDepth(ballPoint, attackingTeamId);
const restDefenseCount = state.players.filter((player) => {
if (player.team !== attackingTeamId || isGoalkeeper(player)) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[attackingTeamId]?.formation);
const depth = getAttackingDepth(player.position, attackingTeamId);
return (roleKey === "pivot" || roleKey === "rest" || roleKey === "wideBack") && depth <= Math.max(28, ballDepth - 14);
}).length;
const restDefenseBalance = clamp(restDefenseCount / 2, 0, 1);
const passDistance = startPoint && ballPoint ? distance(startPoint, ballPoint) : 0;
const poorTouchLooseBall =
actionType === "recovery" ||
state.ball.actionType === "recovery" ||
state.ball.inTransit && !state.ball.ownerPlayerId && actionType !== "shot" && passDistance >= 9
? clamp(0.45 + receiverPressure * 0.35 + ballPressure * 0.2, 0, 1)
: 0;
const centralClosed = clamp(
centralCongestionScore * 0.58 +
getOpponentPressureAtPoint(attackingTeamId, {
x: ballPoint.x,
y: pitch.width / 2,
}, 16) * 0.42,
0,
1
);
const labels = [];
if (ballPressure >= 0.55) labels.push("ball-carrier pressured");
if (forwardFacing >= 0.62 && ballPressure <= 0.62) labels.push("ball-carrier forward-facing");
if (highBackLine >= 0.5) labels.push("high defensive line");
if (centralClosed >= 0.54) labels.push("central lane closed");
if (receiverPressure >= 0.5) labels.push("receiver pressured");
if (restDefenseBalance < 0.65 && ballDepth >= 38) labels.push("rest defense thin");
if (poorTouchLooseBall >= 0.48) labels.push("loose/poor-touch risk");
return {
ballPressure,
forwardFacing,
highBackLine,
centralCongestion: centralCongestionScore,
receiverPressure,
restDefenseBalance,
poorTouchLooseBall,
centralClosed,
labels,
};
}
function weightOffensiveAutoV2Intent(intent, triggers = null) {
if (!triggers) {
return intent;
}
const next = { ...intent };
if (next.type === "support-behind" || next.type === "offer-angle") {
next.urgency = clamp(next.urgency + triggers.ballPressure * 0.22 + triggers.receiverPressure * 0.12, 0.35, 1);
next.startDelay = Math.max(0, next.startDelay - triggers.ballPressure * 0.05);
}
if (next.type === "run-behind" || next.type === "pin-line" || next.type === "create-third-man-option") {
next.urgency = clamp(next.urgency + triggers.forwardFacing * 0.16 + triggers.highBackLine * 0.18 - triggers.ballPressure * 0.12, 0.34, 1);
next.startDelay = clamp(next.startDelay + triggers.ballPressure * 0.1 - triggers.forwardFacing * 0.06, 0, 0.34);
}
if (next.type === "hold-width") {
next.urgency = clamp(next.urgency + triggers.centralClosed * 0.24 + triggers.centralCongestion * 0.12, 0.35, 1);
next.startDelay = clamp(next.startDelay - triggers.centralClosed * 0.04, 0, 0.24);
}
if (next.type === "rest-defense") {
next.urgency = clamp(next.urgency + (1 - triggers.restDefenseBalance) * 0.32 + triggers.poorTouchLooseBall * 0.12, 0.34, 0.9);
next.startDelay = 0;
}
next.relationship = [
next.relationship,
...(triggers.labels?.slice(0, 2) ?? []),
].filter(Boolean).join(" / ");
return next;
}
function getOffensiveAutoV2Intent(player, actionMeta, targetPosition = null) {
const storedIntent = actionMeta?.offensiveAutopilot?.intents?.[player.id];
if (storedIntent) {
return {
type: storedIntent.type ?? "offer-angle",
label: storedIntent.label ?? "Offer angle",
urgency: Number.isFinite(storedIntent.urgency) ? storedIntent.urgency : 0.55,
roleKey: storedIntent.roleKey ?? getOffensiveRoleKey(player, teams[player.team]?.formation),
startDelay: Number.isFinite(storedIntent.startDelay) ? storedIntent.startDelay : 0,
relationship: storedIntent.relationship ?? null,
};
}
const triggers = actionMeta?.offensiveAutopilot?.triggers ?? null;
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const ballPoint = actionMeta?.offensiveAutopilot?.ballFocusPoint ?? actionMeta?.target ?? state.ball.position;
const attackSign = getAttackDirectionSign(player.team);
const target = targetPosition ?? player.position;
const forwardOffset = (target.x - ballPoint.x) * attackSign;
const lateralOffset = Math.abs(target.y - pitch.width / 2);
if (actionMeta?.offensiveAutopilot?.runnerPlayerId === player.id || forwardOffset >= 10) {
return weightOffensiveAutoV2Intent({
type: "run-behind",
label: "Run behind",
urgency: 0.86,
roleKey,
startDelay: 0.18,
relationship: "depth threat after support appears",
}, triggers);
}
if (roleKey === "rest" || (roleKey === "pivot" && forwardOffset < -7)) {
return weightOffensiveAutoV2Intent({
type: "rest-defense",
label: "Rest defense",
urgency: 0.46,
roleKey,
startDelay: 0,
relationship: "secure behind attack",
}, triggers);
}
if (roleKey === "wideBack" || roleKey === "wideForward" || lateralOffset >= pitch.width * 0.28) {
return weightOffensiveAutoV2Intent({
type: "hold-width",
label: "Hold width",
urgency: 0.52,
roleKey,
startDelay: 0.08,
relationship: "stretch outside lane",
}, triggers);
}
if (roleKey === "striker" || roleKey === "secondStriker") {
return weightOffensiveAutoV2Intent({
type: forwardOffset >= 5 ? "pin-line" : "offer-angle",
label: forwardOffset >= 5 ? "Pin line" : "Offer angle",
urgency: forwardOffset >= 5 ? 0.72 : 0.62,
roleKey,
startDelay: forwardOffset >= 5 ? 0.16 : 0.06,
relationship: "occupy last line",
}, triggers);
}
if (roleKey === "connector" && forwardOffset >= 2) {
return weightOffensiveAutoV2Intent({
type: "create-third-man-option",
label: "Create third-man option",
urgency: 0.66,
roleKey,
startDelay: 0.12,
relationship: "diagonal third player",
}, triggers);
}
return weightOffensiveAutoV2Intent({
type: forwardOffset < -3 ? "support-behind" : "offer-angle",
label: forwardOffset < -3 ? "Support behind" : "Offer angle",
urgency: forwardOffset < -3 ? 0.58 : 0.64,
roleKey,
startDelay: forwardOffset < -3 ? 0.02 : 0.07,
relationship: forwardOffset < -3 ? "bounce support" : "playable angle",
}, triggers);
}
function setReachableOffensiveAutoV2Target(plannedPositions, player, target) {
if (!player || !target || !plannedPositions.has(player.id)) {
return false;
}
const origin = getActionOrigin(player);
const nextTarget = clampToPitch(
clampToCircle(target, origin, getEditableRadius(player)),
2
);
if (distance(plannedPositions.get(player.id), nextTarget) <= 0.04) {
return false;
}
plannedPositions.set(player.id, nextTarget);
return true;
}
function pickOffensiveAutoV2Player(teamId, plannedPositions, excludedIds, roleKeys, referencePoint, preferredSide = 0) {
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !plannedPositions.has(player.id) || isGoalkeeper(player)) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
if (roleKeys.length && !roleKeys.includes(roleKey)) {
return false;
}
if (preferredSide) {
const side = Math.sign((plannedPositions.get(player.id)?.y ?? player.position.y) - pitch.width / 2) || 0;
if (side !== preferredSide) {
return false;
}
}
return true;
})
.map((player) => ({
player,
score: distance(plannedPositions.get(player.id), referencePoint) -
getAutoPilotRoleStrength(player, "receiver") * 4 -
getAutoPilotRoleStrength(player, "runner") * (roleKeys.includes("striker") || roleKeys.includes("wideForward") ? 3 : 0),
}))
.sort((a, b) => a.score - b.score)[0]?.player ?? null;
}
function applyOffensiveAutoV2RelationshipLayer(teamId, plannedPositions, profile, ballPoint, actionMeta, runner = null) {
if (!teamId || !plannedPositions?.size || !ballPoint || !profile) {
return [];
}
const labels = [];
const sideSign = getWideSideSign(ballPoint) || 1;
const attackSign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const triggers = actionMeta?.offensiveAutopilot?.triggers ?? scanAutoV2DecisionTriggers(teamId, ballPoint, actionMeta, profile);
const excludedIds = new Set([
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
runner?.id,
].filter(Boolean));
const relationTarget = (slot) => getBallNearSupportTriangleTarget(teamId, ballPoint, slot, sideSign, profile);
const supportBehind = pickOffensiveAutoV2Player(teamId, plannedPositions, excludedIds, ["pivot", "connector", "wideBack", "rest"], relationTarget("underSupport"));
if (supportBehind && setReachableOffensiveAutoV2Target(plannedPositions, supportBehind, relationTarget("underSupport"))) {
excludedIds.add(supportBehind.id);
labels.push(triggers.ballPressure >= 0.55 ? "Auto v2 trigger: pressure creates support behind" : "Auto v2: support behind ball");
}
const anglePlayer = pickOffensiveAutoV2Player(
teamId,
plannedPositions,
excludedIds,
["connector", "pivot", "wideForward", "secondStriker"],
relationTarget("insideAngle"),
isWidePrincipleZone(ballPoint) ? sideSign : 0
);
if (anglePlayer && setReachableOffensiveAutoV2Target(plannedPositions, anglePlayer, relationTarget("insideAngle"))) {
excludedIds.add(anglePlayer.id);
labels.push(triggers.receiverPressure >= 0.5 ? "Auto v2 trigger: receiver pressure creates escape angle" : "Auto v2: playable angle");
}
const thirdMan = pickOffensiveAutoV2Player(
teamId,
plannedPositions,
excludedIds,
["connector", "wideForward", "secondStriker", "striker"],
relationTarget("beyondOption")
);
if (
thirdMan &&
(depth >= 34 || triggers.forwardFacing >= 0.62 || triggers.highBackLine >= 0.5) &&
setReachableOffensiveAutoV2Target(plannedPositions, thirdMan, relationTarget("beyondOption"))
) {
excludedIds.add(thirdMan.id);
labels.push(triggers.forwardFacing >= 0.62 ? "Auto v2 trigger: forward-facing opens third man" : "Auto v2: diagonal third-man option");
}
const widthPlayer = pickOffensiveAutoV2Player(
teamId,
plannedPositions,
excludedIds,
["wideBack", "wideForward"],
relationTarget("outsideWidth"),
sideSign
);
if (
widthPlayer &&
(triggers.centralClosed >= 0.46 || isWidePrincipleZone(ballPoint) || profile.widthDiscipline >= 0.6) &&
setReachableOffensiveAutoV2Target(plannedPositions, widthPlayer, relationTarget("outsideWidth"))
) {
excludedIds.add(widthPlayer.id);
labels.push(triggers.centralClosed >= 0.46 ? "Auto v2 trigger: central lane closed, hold width" : "Auto v2: width held outside");
}
const restPlayer = pickOffensiveAutoV2Player(
teamId,
plannedPositions,
excludedIds,
["pivot", "rest", "wideBack"],
relationTarget("restLock")
);
if (restPlayer && setReachableOffensiveAutoV2Target(plannedPositions, restPlayer, relationTarget("restLock"))) {
excludedIds.add(restPlayer.id);
labels.push(triggers.restDefenseBalance < 0.65 ? "Auto v2 trigger: rest defense secured" : "Auto v2: rest defense secured");
}
if (runner && plannedPositions.has(runner.id) && (triggers.highBackLine >= 0.42 || triggers.forwardFacing >= 0.58 || depth >= 38)) {
const current = plannedPositions.get(runner.id);
const minDepthAhead = ballPoint.x + attackSign * 9;
const runTarget = {
x: attackSign > 0 ? Math.max(current.x, minDepthAhead) : Math.min(current.x, minDepthAhead),
y: lerp(current.y, pitch.width / 2 - sideSign * 7, 0.24),
};
if (setReachableOffensiveAutoV2Target(plannedPositions, runner, runTarget)) {
labels.push(triggers.highBackLine >= 0.42 ? "Auto v2 trigger: high line invites depth run" : "Auto v2: depth run timed after triangle");
}
}
return uniquePrincipleLabels(labels);
}
function buildOffensiveAutoV2Intents(teamId, attackingPlayers, plannedPositions, profile, ballPoint, actionMeta, runnerId = null) {
const intents = {};
attackingPlayers.forEach((player) => {
const target = plannedPositions.get(player.id);
if (!target) {
return;
}
const intent = getOffensiveAutoV2Intent(player, {
...actionMeta,
offensiveAutopilot: {
...(actionMeta?.offensiveAutopilot ?? {}),
teamId,
ballFocusPoint: ballPoint,
runnerPlayerId: runnerId,
phaseKey: profile?.phaseKey ?? null,
triggers: actionMeta?.offensiveAutopilot?.triggers ?? scanAutoV2DecisionTriggers(teamId, ballPoint, actionMeta, profile),
},
}, target);
intents[player.id] = intent;
});
return intents;
}
function moveOffensiveAutoV2Player(player, targetPosition, actionMeta, intent, elapsed, focusPoint = null) {
if (!targetPosition) {
return;
}
const context = getPlayerDecisionContext(player);
const frameDt = getDefensiveAutoV2FrameDt(player, elapsed);
const delayedElapsed = elapsed - (intent.startDelay ?? 0);
const runTime = Math.max(0, delayedElapsed - context.reactionTime * 0.58);
if (runTime <= 0) {
if (focusPoint) {
rotatePlayerBodyToward(player, focusPoint, 0.08);
}
return;
}
const previousPosition = cloneVector(player.position);
const remaining = distance(previousPosition, targetPosition);
if (remaining <= 0.025) {
player.position = cloneVector(targetPosition);
player.autoV2Velocity = { x: 0, y: 0 };
if (focusPoint) {
rotatePlayerBodyToward(player, focusPoint, 0.28);
}
return;
}
const currentVelocity = player.autoV2Velocity ?? { x: 0, y: 0 };
const currentSpeed = Math.hypot(currentVelocity.x, currentVelocity.y);
const currentAngle =
currentSpeed > 0.05
? Math.atan2(currentVelocity.y, currentVelocity.x)
: getPlayerFacingAngle(player);
const desiredAngle = angleBetween(previousPosition, targetPosition);
const urgency = clamp(intent.urgency ?? 0.6, 0.34, 1);
const turnRate =
(intent.type === "run-behind" || intent.type === "attack-box" ? 3.35 : intent.type === "rest-defense" ? 2.05 : 2.75) *
(0.72 + context.profile.perception * 0.18 + context.profile.decisionSpeed * 0.18);
const limitedAngle = currentAngle + clamp(normalizeAngle(desiredAngle - currentAngle), -turnRate * frameDt, turnRate * frameDt);
const maxSpeed =
context.maxSpeed *
(intent.type === "run-behind" || intent.type === "attack-box" ? 0.88 : intent.type === "rest-defense" ? 0.52 : 0.68) *
urgency;
const acceleration =
context.acceleration *
(intent.type === "run-behind" || intent.type === "counter-movement" ? 0.94 : intent.type === "rest-defense" ? 0.62 : 0.78);
const brakeDistance = intent.type === "hold-width" || intent.type === "rest-defense" ? 2.4 : 1.65;
const brakingSpeed = Math.sqrt(Math.max(0, 2 * acceleration * Math.max(0, remaining - brakeDistance * 0.34)));
const desiredSpeed = clamp(Math.min(maxSpeed, brakingSpeed), 0, maxSpeed);
const nextSpeed = currentSpeed + clamp(desiredSpeed - currentSpeed, -acceleration * 1.3 * frameDt, acceleration * frameDt);
const nextVelocity = {
x: Math.cos(limitedAngle) * nextSpeed,
y: Math.sin(limitedAngle) * nextSpeed,
};
const rawNext = {
x: previousPosition.x + nextVelocity.x * frameDt,
y: previousPosition.y + nextVelocity.y * frameDt,
};
const nextPosition = clampToPitch(
distance(rawNext, targetPosition) < Math.max(0.05, nextSpeed * frameDt * 0.7)
? targetPosition
: rawNext,
2
);
player.position = nextPosition;
player.autoV2Velocity = nextVelocity;
player.movementProgress = distance(getActionOrigin(player), nextPosition);
if (distance(previousPosition, nextPosition) > 0.004) {
rotatePlayerBodyAlongMovement(player, previousPosition, nextPosition, intent.type === "run-behind" ? 0.34 : 0.26);
} else if (focusPoint) {
rotatePlayerBodyToward(player, focusPoint, 0.14);
}
}
function getDefensivePhaseKey(teamId, ballPoint, actionType = state.ball.actionType ?? state.draftStep?.actionType) {
if (state.restartPhase?.type) {
if (state.restartPhase.type === "kickoff") {
return getKickoffDefensivePhaseKey(teamId);
}
return "setPiece";
}
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const wideRatio = Math.abs(ballPoint.y - pitch.width / 2) / (pitch.width / 2);
const styleProfile = getTeamDefenseStyleProfile(teamId);
if (
ballFromOwnGoal <= 22 ||
(actionType === "shot" && ballFromOwnGoal <= 34) ||
(ballFromOwnGoal <= 27 && wideRatio > 0.62)
) {
return "boxDefending";
}
if (ballFromOwnGoal <= 36) {
return "lowBlock";
}
if (styleProfile.preferredPhase === "lowBlock" && ballFromOwnGoal <= 52) {
return "lowBlock";
}
if (styleProfile.preferredPhase === "boxDefending" && ballFromOwnGoal <= 46) {
return ballFromOwnGoal <= 30 ? "boxDefending" : "lowBlock";
}
if (
ballFromOwnGoal >= 67 ||
(styleProfile.preferredPhase === "highPress" && ballFromOwnGoal >= 52)
) {
return "highPress";
}
return "midBlock";
}
function getDefensiveAutopilotLineKey(
player,
formation = teams[player.team]?.formation,
phaseKey = "midBlock"
) {
const label = getPlayerMagnetLabel(player);
const isHighPress = phaseKey === "highPress";
const isDeepDefending = phaseKey === "lowBlock" || phaseKey === "boxDefending";
if (label === "GK") {
return "gk";
}
if (label === "CB" || label === "LB" || label === "RB") {
return "back";
}
if (label === "WB") {
return isDeepDefending ? "back" : "midfield";
}
if (formation === "4-4-2") {
return label === "9" || label === "10" ? "forward" : "midfield";
}
if (formation === "4-1-4-1" || formation === "4-2-3-1") {
if (formation === "4-2-3-1") {
if (isHighPress) {
return label === "9" || label === "10" || label === "W" ? "forward" : "midfield";
}
if (phaseKey === "boxDefending") {
return label === "9" ? "forward" : "midfield";
}
return label === "9" || label === "10" ? "forward" : "midfield";
}
return label === "9" ? "forward" : "midfield";
}
if (formation === "3-4-3") {
if (isDeepDefending && label === "W") {
return "midfield";
}
return label === "9" || label === "W" ? "forward" : "midfield";
}
if (formation === "3-5-2") {
return label === "9" ? "forward" : "midfield";
}
if (formation === "4-3-3") {
if (isHighPress && (label === "9" || label === "W")) {
return "forward";
}
return label === "9" ? "forward" : "midfield";
}
if (label === "9" || (isHighPress && label === "W")) {
return "forward";
}
return "midfield";
}
function getDefensiveAutopilotProfile(teamId, ballPoint = state.ball.target ?? state.ball.position, phaseKey = null) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const formationProfile = defensiveAutopilotProfiles[formation] ?? defensiveAutopilotProfiles["4-3-3"];
const referenceProfile = defensiveAutopilotProfiles["4-3-3"];
const resolvedPhaseKey = phaseKey ?? getDefensivePhaseKey(teamId, ballPoint);
const phaseProfile = defensivePhaseProfiles[resolvedPhaseKey] ?? defensivePhaseProfiles.midBlock;
const styleKey = getTeamDefenseStyleKey(teamId);
const styleProfile = getTeamDefenseStyleProfile(teamId);
const threatResponse = getDefensiveThreatResponse(teamId, ballPoint);
const lineActionAdjustment = getDefensiveLineActionAdjustment(teamId, ballPoint, resolvedPhaseKey);
const gapWeight = phaseProfile.formationGapWeight ?? 0.4;
const widthWeight = phaseProfile.formationWidthWeight ?? 0.45;
return {
...phaseProfile,
formation,
phaseKey: resolvedPhaseKey,
phaseLabel: phaseProfile.label,
styleKey,
styleLabel: styleProfile.label,
stylePrincipleLabel: styleProfile.principleLabel,
threatResponse,
lineActionAdjustment,
pressingIntensity: styleProfile.pressingIntensity,
tackleIntent: styleProfile.tackleIntent,
blockWidth: clamp(
(phaseProfile.blockWidth + (formationProfile.blockWidth - referenceProfile.blockWidth) * widthWeight) *
styleProfile.blockWidthMultiplier,
phaseProfile.minBlockWidth,
phaseProfile.maxBlockWidth
),
ballSideShift: clamp(
phaseProfile.ballSideShift +
(formationProfile.ballSideShift - referenceProfile.ballSideShift) * 0.45 +
styleProfile.ballSideShiftOffset,
0.36,
0.82
),
wideCompression: clamp(
phaseProfile.wideCompression +
(formationProfile.wideCompression - referenceProfile.wideCompression) * 0.35,
0.7,
0.92
),
backToBall: clamp(
phaseProfile.backToBall +
(formationProfile.backToBall - referenceProfile.backToBall) * gapWeight +
styleProfile.backToBallOffset,
5,
30
),
backToMidfield: clamp(
phaseProfile.backToMidfield +
(formationProfile.backToMidfield - referenceProfile.backToMidfield) * gapWeight +
styleProfile.lineGapOffset,
4.5,
12.5
),
midfieldToForward: clamp(
phaseProfile.midfieldToForward +
(formationProfile.midfieldToForward - referenceProfile.midfieldToForward) * gapWeight +
styleProfile.lineGapOffset,
4.5,
12.5
),
pressOffset: clamp(
(phaseProfile.pressOffset + (formationProfile.pressOffset - referenceProfile.pressOffset) * 0.35) *
styleProfile.pressOffsetMultiplier,
0.55,
2.7
),
maxBackLineFromOwnGoal: clamp(
phaseProfile.maxBackLineFromOwnGoal +
(formationProfile.maxBackLineFromOwnGoal - referenceProfile.maxBackLineFromOwnGoal) * 0.35 +
styleProfile.lineHeightOffset,
phaseProfile.minBackLineFromOwnGoal + 3,
pitch.length - 8
),
minBackLineFromOwnGoal: clamp(
(phaseProfile.minBackLineFromOwnGoal ?? 9) + styleProfile.lineHeightOffset,
7,
pitch.length - 22
),
};
}
function getDefensiveLineActionAdjustment(teamId, ballPoint, phaseKey = "midBlock") {
if (state.restartPhase?.type || !ballPoint) {
return {
mode: "hold",
shift: 0,
heightDelta: 0,
label: null,
};
}
const attackingTeamId = getOtherTeamId(teamId);
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!attackingTeamId || !actionType || !startPoint || !targetPoint) {
return {
mode: "hold",
shift: 0,
heightDelta: 0,
label: null,
};
}
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const passDistance = distance(startPoint, targetPoint);
const startThreat = getPitchThreatProfile(startPoint, attackingTeamId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const targetSpace = getAttackingGameSpaceProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const carrierPressure = carrier ? getPlayerPressureLoad(carrier, startPoint) : 0.5;
const targetFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const startFromOwnGoal = getDistanceFromOwnGoal(teamId, startPoint);
const isHighPress = phaseKey === "highPress";
const isLowBlock = phaseKey === "lowBlock";
const isBoxDefending = phaseKey === "boxDefending";
const depthThreat =
actionType === "pass" &&
(
targetSpace.key === "space3" ||
targetThreat.behindLine >= 0.24 ||
actionSpace.lineBreakCount >= 1 ||
(forwardGain >= 9 && passDistance >= 13 && targetThreat.value >= startThreat.value + 0.03) ||
(targetFromOwnGoal <= 31 && forwardGain >= 5)
);
const carryThreat =
actionType === "dribble" &&
(
targetThreat.behindLine >= 0.2 ||
targetThreat.centralPocket >= 0.26 ||
targetFromOwnGoal <= 42 ||
(forwardGain >= 7 && actionSpace.value >= 0.3)
);
const backwardPass =
actionType === "pass" &&
forwardGain <= -4 &&
targetFromOwnGoal >= startFromOwnGoal + 1.2;
const lowRiskBackwardPass =
backwardPass &&
targetThreat.value <= startThreat.value + 0.04 &&
targetThreat.behindLine < 0.16 &&
carrierPressure >= 0.28;
if (depthThreat) {
const dropShift =
isBoxDefending
? -1.2
: isLowBlock
? -2.4
: isHighPress
? -5.2
: -3.6;
return {
mode: "drop",
shift: dropShift,
heightDelta: isHighPress ? -1.2 : -0.8,
label: "Back line drops with depth threat",
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
if (carryThreat) {
const carryDrop =
isBoxDefending
? -0.8
: isLowBlock
? -1.6
: isHighPress
? -3.4
: -2.4;
return {
mode: "delayDrop",
shift: carryDrop,
heightDelta: isHighPress ? -0.8 : -0.4,
label: "Back line delays and drops",
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
if (lowRiskBackwardPass) {
const stepShift =
isBoxDefending
? 0.6
: isLowBlock
? 1.8
: isHighPress
? 4.2
: 2.8;
return {
mode: "step",
shift: stepShift,
heightDelta: isLowBlock ? 0 : 0.6,
label: "Back line steps on backward pass",
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
return {
mode: "hold",
shift: 0,
heightDelta: 0,
label: null,
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
function getDefensiveLineDistanceFromOwnGoal(teamId, lineKey, ballPoint, profile) {
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const lineShift = profile.lineActionAdjustment?.shift ?? 0;
const backLine = clamp(
ballFromOwnGoal - profile.backToBall + lineShift,
profile.minBackLineFromOwnGoal ?? 9,
profile.maxBackLineFromOwnGoal
);
const targetBlockHeight = profile.targetBlockHeight
? clamp(
profile.targetBlockHeight + (profile.lineActionAdjustment?.heightDelta ?? 0),
profile.phaseKey === "boxDefending" ? 14 : 22,
profile.phaseKey === "boxDefending" ? 19 : 28
)
: null;
if (targetBlockHeight && lineKey !== "gk") {
const backToMidfield = clamp(
profile.targetBackToMidfield ?? profile.backToMidfield,
profile.phaseKey === "boxDefending" ? 6 : 8,
Math.max(8, targetBlockHeight - 6)
);
const midfieldLine = clamp(
backLine + backToMidfield,
backLine + 5.5,
Math.min(backLine + targetBlockHeight - 4.5, pitch.length - 10)
);
const forwardLine = clamp(
backLine + targetBlockHeight,
midfieldLine + 5,
Math.min(
Math.max(
ballFromOwnGoal + (profile.forwardAheadOfBall ?? 8),
backLine + targetBlockHeight
),
pitch.length - 8
)
);
if (lineKey === "back") {
return backLine;
}
if (lineKey === "forward") {
return forwardLine;
}
return midfieldLine;
}
const midfieldMinimum = Math.max(
(profile.minBackLineFromOwnGoal ?? 9) + profile.backToMidfield,
12
);
const forwardMinimum = midfieldMinimum + profile.midfieldToForward * 0.8;
const midfieldCap = Math.max(
midfieldMinimum,
Math.min(ballFromOwnGoal + (profile.midfieldAheadOfBall ?? 3), 72)
);
const forwardCap = Math.max(
forwardMinimum,
Math.min(ballFromOwnGoal + (profile.forwardAheadOfBall ?? 8), 86)
);
const midfieldLine = clamp(
backLine + profile.backToMidfield,
midfieldMinimum,
midfieldCap
);
const forwardLine = clamp(
midfieldLine + profile.midfieldToForward,
forwardMinimum,
forwardCap
);
if (lineKey === "gk") {
return clamp(
(profile.gkDepthMin ?? 6.5) +
Math.max(0, ballFromOwnGoal - (profile.gkSweepStart ?? 35)) *
(profile.gkSweepFactor ?? 0.08),
profile.gkDepthMin ?? 6.5,
profile.gkDepthMax ?? 11
);
}
if (lineKey === "back") {
return backLine;
}
if (lineKey === "forward") {
return forwardLine;
}
return midfieldLine;
}
function getDefensiveLineX(teamId, lineKey, ballPoint, profile) {
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const lineFromOwnGoal = getDefensiveLineDistanceFromOwnGoal(
teamId,
lineKey,
ballPoint,
profile
);
return ownGoalX + getDefendingDirectionSign(teamId) * lineFromOwnGoal;
}
function getDefensiveLineWidth(lineKey, profile, ballPoint, playerCount = 1) {
if (lineKey === "gk" || playerCount <= 1) {
return 0;
}
if (profile.unitPlayerGap) {
const gapValue =
typeof profile.unitPlayerGap === "number"
? profile.unitPlayerGap
: profile.unitPlayerGap?.[lineKey] ?? 8;
return gapValue * (playerCount - 1);
}
const wideRatio = Math.abs(ballPoint.y - pitch.width / 2) / (pitch.width / 2);
const dangerCompression =
1 -
(profile.threatResponse?.protectCenter ?? 0) *
(lineKey === "forward" ? 0.04 : lineKey === "midfield" ? 0.1 : 0.14);
const baseWidth = profile.blockWidth * lerp(1, profile.wideCompression, wideRatio) * dangerCompression;
const lineRatio =
profile.lineWidthRatio?.[lineKey] ??
(lineKey === "forward" ? 0.68 : lineKey === "midfield" ? 0.9 : 1);
const gap = profile.playerGap?.[lineKey] ?? { min: 7, max: 12 };
const segmentCount = playerCount - 1;
const minimumWidth = gap.min * segmentCount;
const maximumWidth = gap.max * segmentCount;
const shapeWidth = baseWidth * lineRatio;
return clamp(shapeWidth, minimumWidth, maximumWidth);
}
function getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth) {
const lineShift = lineKey === "forward" ? 1.12 : lineKey === "midfield" ? 1 : 0.86;
const centerProtection = profile.threatResponse?.protectCenter ?? 0;
const shiftReduction = 1 - centerProtection * (lineKey === "forward" ? 0.22 : lineKey === "midfield" ? 0.42 : 0.52);
const centerY = pitch.width / 2 + (ballPoint.y - pitch.width / 2) * profile.ballSideShift * lineShift * shiftReduction;
const margin = Math.max(4, lineWidth / 2 + 3);
return clamp(centerY, margin, pitch.width - margin);
}
function enforceDefensiveUnitCompactness(
teamId,
targets,
groups,
ballPoint,
profile,
protectedIds = new Set()
) {
const compactnessWeight =
profile.unitCompactnessWeight ??
(profile.phaseKey === "lowBlock" ? 0.7 : profile.phaseKey === "boxDefending" ? 0.76 : 0.42);
if (compactnessWeight <= 0) {
return [];
}
const labels = [];
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player));
if (!players.length) {
return;
}
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const lineWidth = getDefensiveLineWidth(lineKey, profile, ballPoint, players.length);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
players.forEach((player, index) => {
if (protectedIds.has(player.id)) {
return;
}
const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
const unitSlot = clampToPitch({
x: lineX,
y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3, pitch.width - 3),
}, 2.2);
const currentTarget = targets.get(player.id) ?? player.position;
const target = clampToPitch({
x: lerp(currentTarget.x, unitSlot.x, compactnessWeight),
y: lerp(currentTarget.y, unitSlot.y, compactnessWeight),
}, 2.2);
targets.set(player.id, target);
});
});
if (profile.phaseKey === "lowBlock") {
labels.push("Low-block unit spacing");
} else if (profile.phaseKey === "boxDefending") {
labels.push("Box unit spacing");
}
return labels;
}
function getDefensiveUnitGap(profile, lineKey) {
if (typeof profile.unitPlayerGap === "number") {
return profile.unitPlayerGap;
}
if (profile.unitPlayerGap?.[lineKey]) {
return profile.unitPlayerGap[lineKey];
}
const phaseDefault =
profile.phaseKey === "boxDefending"
? 7.5
: profile.phaseKey === "lowBlock"
? 8
: 9;
const gapRange = profile.playerGap?.[lineKey];
if (!gapRange) {
return phaseDefault;
}
return clamp((gapRange.min + gapRange.max) / 2, gapRange.min, gapRange.max);
}
function enforceDefensiveBlockGeometryLock(
teamId,
targets,
groups,
ballPoint,
profile,
protectedIds = new Set()
) {
if (profile.phaseKey !== "lowBlock" && profile.phaseKey !== "boxDefending") {
return [];
}
const labels = [];
const lockWeight = profile.phaseKey === "boxDefending" ? 0.96 : 0.92;
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player));
if (!players.length) {
return;
}
const gap = getDefensiveUnitGap(profile, lineKey);
const lineWidth = gap * Math.max(0, players.length - 1);
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const lineWeight = lineKey === "forward" ? lockWeight * 0.84 : lockWeight;
players.forEach((player, index) => {
if (protectedIds.has(player.id)) {
return;
}
const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
const slot = clampToPitch({
x: lineX,
y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3, pitch.width - 3),
}, 2.2);
const currentTarget = targets.get(player.id) ?? player.position;
targets.set(player.id, clampToPitch({
x: lerp(currentTarget.x, slot.x, lineWeight),
y: lerp(currentTarget.y, slot.y, lineWeight),
}, 2.2));
});
});
labels.push(profile.phaseKey === "boxDefending" ? "Box geometry lock" : "Low-block geometry lock");
return labels;
}
function enforceDefensiveLineStaggering(
teamId,
targets,
groups,
ballPoint,
profile,
protectedIds = new Set()
) {
if (!ballPoint || state.restartPhase?.type) {
return [];
}
const labels = [];
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ballSide = getWideSideSign(ballPoint) || 1;
const phaseDepthScale =
profile.phaseKey === "boxDefending"
? 0.68
: profile.phaseKey === "lowBlock"
? 0.86
: profile.phaseKey === "highPress"
? 1.16
: 1;
const actionMode = profile.lineActionAdjustment?.mode ?? "hold";
const actionDropBoost = actionMode === "drop" || actionMode === "delayDrop" ? 0.8 : 0;
const actionStepBoost = actionMode === "step" ? 0.7 : 0;
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player));
const available = players
.filter((player) => targets.has(player.id) && !protectedIds.has(player.id))
.map((player) => ({
player,
target: cloneVector(targets.get(player.id)),
}))
.sort((a, b) => Math.abs(a.target.y - ballPoint.y) - Math.abs(b.target.y - ballPoint.y));
if (!available.length) {
return;
}
const ballNearId = available[0].player.id;
const lineDepth = getDefensiveLineDistanceFromOwnGoal(teamId, lineKey, ballPoint, profile);
const maxCoverDrop =
lineKey === "back"
? (2.6 + actionDropBoost) * phaseDepthScale
: lineKey === "midfield"
? (1.8 + actionDropBoost * 0.5) * phaseDepthScale
: 1.1 * phaseDepthScale;
const maxStepOut =
lineKey === "back"
? (1.05 + actionStepBoost) * phaseDepthScale
: lineKey === "midfield"
? (1.55 + actionStepBoost) * phaseDepthScale
: (1.85 + actionStepBoost) * phaseDepthScale;
players.forEach((player) => {
if (protectedIds.has(player.id) || !targets.has(player.id) || isGoalkeeper(player)) {
return;
}
const currentTarget = cloneVector(targets.get(player.id));
const playerSide = Math.sign(currentTarget.y - pitch.width / 2) || ballSide;
const lateralGap = Math.abs(currentTarget.y - ballPoint.y);
const ballNear = player.id === ballNearId;
const sameSide = playerSide === ballSide;
const farSide = playerSide === -ballSide;
const centrality = 1 - Math.abs(currentTarget.y - pitch.width / 2) / (pitch.width / 2);
let depthAdjustment = 0;
let yAdjustment = 0;
if (ballNear) {
depthAdjustment += maxStepOut;
yAdjustment += (ballPoint.y - currentTarget.y) * (lineKey === "forward" ? 0.18 : 0.1);
} else if (sameSide && lateralGap <= 14) {
depthAdjustment -= maxCoverDrop * 0.5;
yAdjustment += (ballPoint.y - currentTarget.y) * 0.04;
} else if (farSide) {
depthAdjustment -= maxCoverDrop * 0.58;
yAdjustment += (pitch.width / 2 - currentTarget.y) * (lineKey === "back" ? 0.12 : 0.08);
} else if (centrality >= 0.62) {
depthAdjustment -= maxCoverDrop * 0.34;
}
if (
lineKey === "back" &&
(profile.threatResponse?.isBoxThreat || profile.threatResponse?.isGoldenZoneThreat)
) {
depthAdjustment -= maxCoverDrop * (ballNear ? 0.16 : 0.28);
}
const targetDepth = clamp(
lineDepth + depthAdjustment,
profile.minBackLineFromOwnGoal ?? 5,
profile.maxBackLineFromOwnGoal + (lineKey === "forward" ? 22 : lineKey === "midfield" ? 12 : 2)
);
const staggeredTarget = clampToPitch({
x: ownGoal.x + sign * targetDepth,
y: clamp(currentTarget.y + yAdjustment, 3.2, pitch.width - 3.2),
}, 2.2);
targets.set(player.id, staggeredTarget);
});
});
labels.push("Line staggering and cover depth");
return labels;
}
function enforceDefensiveLineChainSpacing(
teamId,
targets,
groups,
ballPoint,
profile,
fixedIds = new Set()
) {
const restartType = state.restartPhase?.type;
if (!ballPoint || (restartType && restartType !== "kickoff")) {
return [];
}
const labels = [];
let adjusted = false;
const phaseWeight =
profile.phaseKey === "boxDefending"
? 0.86
: profile.phaseKey === "lowBlock"
? 0.78
: profile.phaseKey === "highPress"
? 0.46
: 0.62;
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player) && targets.has(player.id));
if (players.length < 2) {
return;
}
const baseGap = getDefensiveUnitGap(profile, lineKey);
const minGap = clamp(
baseGap - (profile.phaseKey === "boxDefending" ? 1.05 : profile.phaseKey === "highPress" ? 1.55 : 1.25),
lineKey === "forward" ? 5.8 : 6.2,
9.4
);
const maxGap = clamp(
baseGap + (profile.phaseKey === "highPress" ? 3.1 : profile.phaseKey === "midBlock" ? 2.5 : 1.8),
minGap + 1.4,
lineKey === "forward" ? 14.2 : 12.4
);
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const maxLineDrift =
lineKey === "forward"
? (profile.phaseKey === "highPress" ? 11.5 : 8.4)
: lineKey === "midfield"
? (profile.phaseKey === "highPress" ? 8.6 : profile.phaseKey === "midBlock" ? 6.8 : 5.8)
: (profile.phaseKey === "highPress" ? 7.4 : profile.phaseKey === "midBlock" ? 5.8 : 4.8);
const entries = players
.map((player) => ({
player,
target: cloneVector(targets.get(player.id)),
}))
.sort((a, b) => a.target.y - b.target.y);
for (let pass = 0; pass < 3; pass += 1) {
entries.sort((a, b) => a.target.y - b.target.y);
for (let index = 0; index < entries.length - 1; index += 1) {
const upper = entries[index];
const lower = entries[index + 1];
if (fixedIds.has(upper.player.id) && fixedIds.has(lower.player.id)) {
continue;
}
const gap = lower.target.y - upper.target.y;
let correction = 0;
if (gap < minGap) {
correction = (minGap - gap) / 2;
} else if (gap > maxGap) {
correction = -(gap - maxGap) / 2;
}
if (Math.abs(correction) < 0.02) {
continue;
}
const upperWeight = fixedIds.has(upper.player.id) ? 0 : phaseWeight;
const lowerWeight = fixedIds.has(lower.player.id) ? 0 : phaseWeight;
upper.target.y = clamp(upper.target.y - correction * upperWeight, 3.2, pitch.width - 3.2);
lower.target.y = clamp(lower.target.y + correction * lowerWeight, 3.2, pitch.width - 3.2);
adjusted = adjusted || upperWeight > 0 || lowerWeight > 0;
}
}
entries.forEach(({ player, target }) => {
if (fixedIds.has(player.id)) {
return;
}
const currentTarget = targets.get(player.id) ?? target;
const xDrift = currentTarget.x - lineX;
const chainX =
Math.abs(xDrift) > maxLineDrift
? lineX + Math.sign(xDrift) * maxLineDrift
: currentTarget.x;
adjusted = adjusted || Math.abs(chainX - currentTarget.x) > 0.04;
targets.set(player.id, clampToPitch({
x: lerp(currentTarget.x, chainX, phaseWeight * 0.72),
y: target.y,
}, 2.2));
});
});
if (adjusted) {
labels.push("Defensive chain spacing");
}
return labels;
}
function enforceDefensiveVerticalBlockConnections(
teamId,
targets,
groups,
ballPoint,
profile,
fixedIds = new Set()
) {
if (!ballPoint || state.restartPhase?.type) {
return [];
}
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const sign = getDefendingDirectionSign(teamId);
const labels = [];
let adjusted = false;
const phaseWeight =
profile.phaseKey === "boxDefending"
? 0.82
: profile.phaseKey === "lowBlock"
? 0.74
: profile.phaseKey === "highPress"
? 0.42
: 0.56;
const phaseTolerance = {
back: profile.phaseKey === "boxDefending" ? 2.2 : profile.phaseKey === "lowBlock" ? 2.8 : profile.phaseKey === "highPress" ? 5.4 : 4.2,
midfield: profile.phaseKey === "boxDefending" ? 2.8 : profile.phaseKey === "lowBlock" ? 3.5 : profile.phaseKey === "highPress" ? 6.6 : 5.1,
forward: profile.phaseKey === "boxDefending" ? 4.2 : profile.phaseKey === "lowBlock" ? 5.2 : profile.phaseKey === "highPress" ? 9.2 : 7.4,
};
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player) && targets.has(player.id));
if (!players.length) {
return;
}
const lineDepth = getDefensiveLineDistanceFromOwnGoal(teamId, lineKey, ballPoint, profile);
const tolerance = phaseTolerance[lineKey] ?? 5;
players.forEach((player) => {
if (fixedIds.has(player.id)) {
return;
}
const currentTarget = targets.get(player.id);
const currentDepth = getDistanceFromOwnGoal(teamId, currentTarget);
const boundedDepth = lineDepth + clamp(currentDepth - lineDepth, -tolerance, tolerance);
const nextDepth = lerp(currentDepth, boundedDepth, phaseWeight);
if (Math.abs(nextDepth - currentDepth) > 0.05) {
adjusted = true;
}
targets.set(player.id, clampToPitch({
x: ownGoalX + sign * nextDepth,
y: currentTarget.y,
}, 2.2));
});
});
if (adjusted) {
labels.push("Vertical block connection");
}
return labels;
}
function enforceDefensiveMeasuredBlockEnvelope(
teamId,
targets,
groups,
ballPoint,
profile,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
if (!ballPoint || state.restartPhase?.type) {
return [];
}
const phaseSettings = {
highPress: {
height: 34,
backToMidfield: 11.2,
unitGap: 9.5,
weight: 0.28,
label: "High-press block envelope",
},
midBlock: {
height: 30,
backToMidfield: 10.2,
unitGap: 9,
weight: 0.46,
label: "Mid-block measured envelope",
},
lowBlock: {
height: 26,
backToMidfield: 10.2,
unitGap: 8,
weight: 0.72,
label: "Low-block measured envelope",
},
boxDefending: {
height: 17,
backToMidfield: 7.2,
unitGap: 7.5,
weight: 0.78,
label: "Box measured envelope",
},
};
const settings = phaseSettings[profile.phaseKey] ?? phaseSettings.midBlock;
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const targetHeight = clamp(
profile.targetBlockHeight ?? settings.height,
profile.phaseKey === "boxDefending" ? 15 : profile.phaseKey === "lowBlock" ? 24 : 26,
profile.phaseKey === "boxDefending" ? 19 : profile.phaseKey === "lowBlock" ? 28 : 36
);
const backDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const backToMidfield = clamp(
profile.targetBackToMidfield ?? settings.backToMidfield,
profile.phaseKey === "boxDefending" ? 6.4 : 8,
Math.max(profile.phaseKey === "boxDefending" ? 8.6 : 12, targetHeight - 5.2)
);
const depthByLine = {
back: backDepth,
midfield: clamp(backDepth + backToMidfield, backDepth + 5.6, backDepth + targetHeight - 4.8),
forward: clamp(backDepth + targetHeight, backDepth + backToMidfield + 4.8, pitch.length - 8),
};
const labels = [];
let adjusted = false;
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? [])
.filter((player) => !isGoalkeeper(player) && targets.has(player.id))
.sort((a, b) => {
const aY = targets.get(a.id)?.y ?? a.position.y;
const bY = targets.get(b.id)?.y ?? b.position.y;
return aY - bY;
});
if (!players.length) {
return;
}
const unitGap = clamp(
getDefensiveUnitGap(profile, lineKey) || settings.unitGap,
profile.phaseKey === "boxDefending" ? 7 : profile.phaseKey === "lowBlock" ? 7.6 : 8,
profile.phaseKey === "boxDefending" ? 8.2 : profile.phaseKey === "lowBlock" ? 8.6 : 10.8
);
const lineWidth = unitGap * Math.max(0, players.length - 1);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const lineX = ownGoalX + sign * depthByLine[lineKey];
const lineWeight =
lineKey === "forward"
? settings.weight * (profile.phaseKey === "highPress" ? 0.72 : 0.82)
: settings.weight;
players.forEach((player, index) => {
if (hardFixedIds.has(player.id)) {
return;
}
const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
const measuredSlot = clampToPitch({
x: lineX,
y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.1, pitch.width - 3.1),
}, 2.2);
const currentTarget = targets.get(player.id) ?? player.position;
const weight = softFixedIds.has(player.id) ? lineWeight * 0.42 : lineWeight;
const nextTarget = clampToPitch({
x: lerp(currentTarget.x, measuredSlot.x, weight),
y: lerp(currentTarget.y, measuredSlot.y, weight),
}, 2.2);
if (distance(currentTarget, nextTarget) > 0.08) {
adjusted = true;
}
targets.set(player.id, nextTarget);
});
});
if (adjusted) {
labels.push(settings.label);
}
return labels;
}
function enforceDefensiveCollectiveShiftCohesion(
teamId,
targets,
groups,
ballPoint,
profile,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
if (!ballPoint || state.restartPhase?.type) {
return [];
}
const phaseSettings = {
highPress: {
centerWeight: 0.28,
depthWeight: 0.22,
widthWeight: 0.3,
label: "High-press collective shift",
},
midBlock: {
centerWeight: 0.38,
depthWeight: 0.32,
widthWeight: 0.42,
label: "Mid-block collective shift",
},
lowBlock: {
centerWeight: 0.56,
depthWeight: 0.5,
widthWeight: 0.68,
label: "Low-block collective shift",
},
boxDefending: {
centerWeight: 0.62,
depthWeight: 0.54,
widthWeight: 0.72,
label: "Box collective shift",
},
};
const settings = phaseSettings[profile.phaseKey] ?? phaseSettings.midBlock;
const labels = [];
let adjusted = false;
["back", "midfield", "forward"].forEach((lineKey) => {
const entries = (groups[lineKey] ?? [])
.filter((player) => !isGoalkeeper(player) && targets.has(player.id))
.map((player) => ({
player,
target: cloneVector(targets.get(player.id)),
}))
.sort((a, b) => a.target.y - b.target.y);
if (!entries.length) {
return;
}
const desiredGap = clamp(
getDefensiveUnitGap(profile, lineKey),
profile.phaseKey === "boxDefending" ? 7 : profile.phaseKey === "lowBlock" ? 7.6 : 8,
profile.phaseKey === "boxDefending" ? 8.2 : profile.phaseKey === "lowBlock" ? 8.8 : 10.8
);
const desiredWidth = desiredGap * Math.max(0, entries.length - 1);
const desiredCenterY = getDefensiveLineCenterY(lineKey, profile, ballPoint, desiredWidth);
const desiredLineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const yValues = entries.map((entry) => entry.target.y);
const actualCenterY = yValues.length
? yValues.reduce((total, value) => total + value, 0) / yValues.length
: desiredCenterY;
const actualWidth = Math.max(0.1, Math.max(...yValues) - Math.min(...yValues));
const lineTooWide = actualWidth > desiredWidth * 1.16 + 1.1;
const lineTooNarrow = entries.length > 2 && actualWidth < desiredWidth * 0.78 - 0.8;
const widthRatio = desiredWidth > 0
? clamp(desiredWidth / actualWidth, 0.72, 1.22)
: 1;
entries.forEach(({ player, target }) => {
if (hardFixedIds.has(player.id)) {
return;
}
const softScale = softFixedIds.has(player.id) ? 0.38 : 1;
const centerPull = settings.centerWeight * softScale;
const depthPull = settings.depthWeight * softScale;
const widthPull = (lineTooWide || lineTooNarrow ? settings.widthWeight : settings.widthWeight * 0.24) * softScale;
const desiredOffset = (target.y - actualCenterY) * widthRatio;
const cohesiveY = desiredCenterY + desiredOffset;
const nextTarget = clampToPitch({
x: lerp(target.x, desiredLineX, depthPull),
y: lerp(
lerp(target.y, target.y + (desiredCenterY - actualCenterY), centerPull),
cohesiveY,
widthPull
),
}, 2.2);
if (distance(target, nextTarget) > 0.08) {
adjusted = true;
}
targets.set(player.id, nextTarget);
});
});
if (adjusted) {
labels.push(settings.label);
}
return labels;
}
function getDefensiveCompactLineIntegritySettings(profile, lineKey) {
if (!profile || profile.phaseKey === "highPress" || profile.phaseKey === "setPiece") {
return null;
}
const phaseSettings = {
boxDefending: {
gap: {
back: 7.5,
midfield: 7.5,
forward: 8.2,
},
xWeight: {
back: 0.98,
midfield: 0.96,
forward: 0.66,
},
yWeight: {
back: 0.98,
midfield: 0.96,
forward: 0.7,
},
protectedScale: {
back: 0.82,
midfield: 0.78,
forward: 0.52,
},
presserScale: {
back: 0.72,
midfield: 0.5,
forward: 0.42,
},
label: "Box line integrity",
},
lowBlock: {
gap: {
back: 8,
midfield: 8,
forward: 8.4,
},
xWeight: {
back: 0.97,
midfield: 0.94,
forward: 0.62,
},
yWeight: {
back: 0.98,
midfield: 0.95,
forward: 0.68,
},
protectedScale: {
back: 0.84,
midfield: 0.8,
forward: 0.56,
},
presserScale: {
back: 0.74,
midfield: 0.52,
forward: 0.44,
},
label: "Low-block 8m line integrity",
},
midBlock: {
gap: {
back: 9,
midfield: 8.8,
forward: 10.4,
},
xWeight: {
back: 0.62,
midfield: 0.58,
forward: 0.34,
},
yWeight: {
back: 0.66,
midfield: 0.62,
forward: 0.4,
},
protectedScale: {
back: 0.62,
midfield: 0.58,
forward: 0.42,
},
presserScale: {
back: 0.62,
midfield: 0.5,
forward: 0.42,
},
label: "Mid-block line integrity",
},
};
const settings = phaseSettings[profile.phaseKey];
if (!settings) {
return null;
}
return {
gap: settings.gap[lineKey] ?? settings.gap.midfield,
xWeight: settings.xWeight[lineKey] ?? settings.xWeight.midfield,
yWeight: settings.yWeight[lineKey] ?? settings.yWeight.midfield,
protectedScale: settings.protectedScale[lineKey] ?? settings.protectedScale.midfield,
presserScale: settings.presserScale[lineKey] ?? settings.presserScale.midfield,
label: settings.label,
};
}
function enforceDefensiveCompactLineIntegrity(
teamId,
targets,
groups,
ballPoint,
profile,
presserId = null,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
const restartType = state.restartPhase?.type;
if (!ballPoint || (restartType && restartType !== "kickoff")) {
return [];
}
const labels = new Set();
let adjusted = false;
["back", "midfield", "forward"].forEach((lineKey) => {
const settings = getDefensiveCompactLineIntegritySettings(profile, lineKey);
if (!settings) {
return;
}
const players = (groups[lineKey] ?? []).filter(
(player) => !isGoalkeeper(player) && targets.has(player.id)
);
if (players.length < 2) {
return;
}
const lineWidth = settings.gap * (players.length - 1);
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
players.forEach((player, index) => {
const slotTarget = clampToPitch({
x: lineX,
y: clamp(centerY - lineWidth / 2 + settings.gap * index, 3.1, pitch.width - 3.1),
}, 2.2);
const currentTarget = targets.get(player.id) ?? player.position;
const isPresser = presserId && player.id === presserId;
const protectedScale =
hardFixedIds.has(player.id) || softFixedIds.has(player.id)
? settings.protectedScale
: 1;
const presserScale = isPresser ? settings.presserScale : 1;
const xWeight = settings.xWeight * protectedScale * presserScale;
const yWeight = settings.yWeight * protectedScale * presserScale;
const nextTarget = clampToPitch({
x: lerp(currentTarget.x, slotTarget.x, xWeight),
y: lerp(currentTarget.y, slotTarget.y, yWeight),
}, 2.2);
if (distance(currentTarget, nextTarget) > 0.06) {
adjusted = true;
labels.add(settings.label);
}
targets.set(player.id, nextTarget);
});
});
return adjusted ? uniquePrincipleLabels([...labels]) : [];
}
function getDefensiveOffsideLineControlContext(teamId, ballPoint, profile) {
if (!ballPoint || state.restartPhase?.type || profile.phaseKey === "setPiece") {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (actionType !== "pass" && actionType !== "dribble") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const secondLastX = getSecondLastOpponentLineX(attackingTeamId);
if (secondLastX === null) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const ownGoal = getOwnGoalCenter(teamId);
const linePoint = { x: secondLastX, y: pitch.width / 2 };
const lineDepth = getAttackingDepth(linePoint, attackingTeamId);
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const startDepth = getAttackingDepth(startPoint, attackingTeamId);
const receiverPoint = receiver ? getPlayerBallControlPoint(receiver) : targetPoint;
const receiverDepth = getAttackingDepth(receiverPoint, attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const passDistance = distance(startPoint, targetPoint);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const carrierPressure = carrier ? getPlayerPressureLoad(carrier, startPoint) : 0.5;
const laneClarity = carrier && actionType === "pass"
? computePassLaneClarity(carrier, targetPoint)
: 0.58;
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const backLineDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const receiverBeyondLine = (receiverPoint.x - secondLastX) * attackSign > -0.4;
const targetBehindLine = (targetPoint.x - secondLastX) * attackSign > -1.2;
const depthThreat =
actionType === "pass" &&
forwardGain >= 4.5 &&
passDistance >= 8 &&
(
targetBehindLine ||
receiverBeyondLine ||
targetThreat.behindLine >= 0.18 ||
actionSpace.lineBreakCount >= 1
);
const carrierCanPickPass =
carrierPressure <= 0.42 &&
laneClarity >= 0.56 &&
(targetThreat.behindLine >= 0.2 || actionSpace.value >= 0.36);
const trapCondition =
depthThreat &&
(profile.phaseKey === "highPress" || profile.phaseKey === "midBlock") &&
backLineDepth >= 20 &&
(
carrierPressure >= 0.54 ||
laneClarity <= 0.44 ||
(receiverBeyondLine && forwardGain <= 10)
);
const emergencyCover =
depthThreat &&
(
profile.phaseKey === "boxDefending" ||
ballFromOwnGoal <= 30 ||
carrierCanPickPass ||
targetThreat.box >= 0.16
);
if (!depthThreat && !(receiverBeyondLine && receiverDepth >= pitch.length / 2)) {
return null;
}
const mode =
emergencyCover
? "coverDrop"
: trapCondition
? (carrierPressure >= 0.62 || laneClarity <= 0.38 ? "stepTrap" : "holdLine")
: "holdLine";
return {
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
receiverPoint: cloneVector(receiverPoint),
linePoint,
secondLastX,
ownGoal,
attackSign,
lineDepth,
startDepth,
targetDepth,
receiverDepth,
forwardGain,
passDistance,
targetThreat,
actionSpace,
carrierPressure,
laneClarity,
ballFromOwnGoal,
backLineDepth,
receiverBeyondLine,
targetBehindLine,
depthThreat,
carrierCanPickPass,
trapCondition,
emergencyCover,
mode,
};
}
function enforceDefensiveOffsideLineControl(
teamId,
targets,
groups,
ballPoint,
profile,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
const context = getDefensiveOffsideLineControlContext(teamId, ballPoint, profile);
if (!context) {
return [];
}
const backPlayers = (groups.back ?? [])
.filter((player) => !isGoalkeeper(player) && targets.has(player.id))
.sort((a, b) => (targets.get(a.id)?.y ?? a.position.y) - (targets.get(b.id)?.y ?? b.position.y));
if (!backPlayers.length) {
return [];
}
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const baseDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const lineDepthFromOwnGoal = getDistanceFromOwnGoal(teamId, context.linePoint);
const desiredDepth =
context.mode === "coverDrop"
? clamp(baseDepth - (profile.phaseKey === "boxDefending" ? 1.2 : 2.4), profile.minBackLineFromOwnGoal ?? 6, profile.maxBackLineFromOwnGoal)
: context.mode === "stepTrap"
? clamp(Math.max(baseDepth, lineDepthFromOwnGoal + 0.8), profile.minBackLineFromOwnGoal ?? 6, profile.maxBackLineFromOwnGoal)
: clamp(lerp(baseDepth, lineDepthFromOwnGoal, 0.5), profile.minBackLineFromOwnGoal ?? 6, profile.maxBackLineFromOwnGoal);
const unitGap = clamp(
getDefensiveUnitGap(profile, "back"),
profile.phaseKey === "highPress" ? 8.4 : 7.6,
profile.phaseKey === "highPress" ? 10.6 : 9.2
);
const lineWidth = unitGap * Math.max(0, backPlayers.length - 1);
const sideSign =
getWideSideSign(context.receiverPoint) ||
getWideSideSign(context.targetPoint) ||
getWideSideSign(ballPoint) ||
1;
const centerY = clamp(
lerp(pitch.width / 2, context.receiverPoint.y, context.mode === "coverDrop" ? 0.28 : 0.18),
Math.max(4, lineWidth / 2 + 3),
pitch.width - Math.max(4, lineWidth / 2 + 3)
);
const weightBase =
context.mode === "stepTrap"
? 0.72
: context.mode === "holdLine"
? 0.6
: 0.46;
const labels = [];
let adjusted = false;
backPlayers.forEach((player, index) => {
if (hardFixedIds.has(player.id)) {
return;
}
const spreadRatio = backPlayers.length === 1 ? 0.5 : index / (backPlayers.length - 1);
const slotY = clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.4, pitch.width - 3.4);
const ballSideCover =
context.mode === "coverDrop" &&
Math.sign(slotY - pitch.width / 2) === sideSign
? (context.receiverPoint.y - slotY) * 0.16
: 0;
const currentTarget = targets.get(player.id) ?? player.position;
const weight = softFixedIds.has(player.id) ? weightBase * 0.5 : weightBase;
const lineTarget = clampToPitch({
x: ownGoalX + sign * desiredDepth,
y: clamp(slotY + ballSideCover, 3.4, pitch.width - 3.4),
}, 2.2);
const nextTarget = clampToPitch({
x: lerp(currentTarget.x, lineTarget.x, weight),
y: lerp(currentTarget.y, lineTarget.y, weight),
}, 2.2);
if (distance(currentTarget, nextTarget) > 0.08) {
adjusted = true;
}
targets.set(player.id, nextTarget);
});
if (adjusted) {
labels.push(
context.mode === "coverDrop"
? "Offside line: cover depth"
: context.mode === "stepTrap"
? "Offside line: step together"
: "Offside line: hold shoulder"
);
}
return labels;
}
function applyOffensiveAutopilotForCurrentAction(options = {}) {
if (!state.offensiveAutopilot || !hasBallAction() || state.isRunning || state.sequence.isPlaying) {
return false;
}
const possessionTeamId = getPlannedPossessionTeamId();
if (!possessionTeamId) {
return false;
}
const ballPoint = cloneVector(state.ball.target ?? state.draftStep?.target ?? state.ball.position);
if (state.restartPhase?.type === "kickoff") {
const profile = getOffensiveAutopilotProfile(possessionTeamId, ballPoint, "setPiece");
if (state.draftStep) {
state.draftStep.offensiveAutopilot = {
teamId: possessionTeamId,
ballFocusPoint: cloneVector(ballPoint),
runnerPlayerId: null,
phaseKey: profile.phaseKey,
phaseLabel: profile.phaseLabel,
};
}
return false;
}
const { targets, runner, profile, principle } = buildOffensiveAutopilotTargets(possessionTeamId, ballPoint);
let movedPlayers = 0;
let autoV2RelationshipLabels = [];
const autoV2DecisionTriggers = scanAutoV2DecisionTriggers(
possessionTeamId,
ballPoint,
state.draftStep,
profile
);
if (state.draftStep) {
state.draftStep.offensiveAutopilot = {
teamId: possessionTeamId,
ballFocusPoint: cloneVector(ballPoint),
runnerPlayerId: runner?.id ?? null,
phaseKey: profile.phaseKey,
phaseLabel: profile.phaseLabel,
principleKey: principle?.key ?? null,
principleLabel: principle?.label ?? null,
triggers: autoV2DecisionTriggers,
};
}
const plannedPositions = new Map();
const attackingPlayers = state.players.filter((player) => player.team === possessionTeamId);
attackingPlayers.forEach((player) => {
if (player.team !== possessionTeamId) {
return;
}
const target = targets.get(player.id);
if (!target) {
return;
}
if (!player.actionOrigin) {
player.actionOrigin = cloneVector(player.position);
}
const origin = getActionOrigin(player);
const reachableTarget = clampToPitch(
clampToCircle(target, origin, getEditableRadius(player)),
2
);
plannedPositions.set(player.id, reachableTarget);
});
autoV2RelationshipLabels = applyOffensiveAutoV2RelationshipLayer(
possessionTeamId,
plannedPositions,
profile,
ballPoint,
state.draftStep,
runner ?? null
);
const offensiveIntents = buildOffensiveAutoV2Intents(
possessionTeamId,
attackingPlayers,
plannedPositions,
profile,
ballPoint,
state.draftStep,
runner?.id ?? null
);
if (state.draftStep?.offensiveAutopilot) {
state.draftStep.offensiveAutopilot.behaviorVersion = "v2";
state.draftStep.offensiveAutopilot.triggers = autoV2DecisionTriggers;
state.draftStep.offensiveAutopilot.intents = offensiveIntents;
const autoV2PrincipleLabel = uniquePrincipleLabels([
principle?.label,
...(autoV2RelationshipLabels ?? []),
]).join("; ");
state.draftStep.offensiveAutopilot.principleLabel = autoV2PrincipleLabel || (principle?.label ?? null);
}
attackingPlayers.forEach((player) => {
const reachableTarget = plannedPositions.get(player.id);
if (!reachableTarget) {
return;
}
const previousPosition = cloneVector(player.position);
if (distance(previousPosition, reachableTarget) > 0.03) {
movedPlayers += 1;
}
player.position = reachableTarget;
if (distance(previousPosition, reachableTarget) > 0.04) {
rotatePlayerBodyAlongMovement(player, previousPosition, reachableTarget, 0.72);
}
rotatePlayerBodyToward(player, ballPoint, runner?.id === player.id ? 0.38 : 0.52);
});
if (movedPlayers > 0 && !options.silent) {
const runnerText = runner ? ` ${getPlayerMagnetLabel(runner)} attacks depth.` : "";
const principleText = principle ? ` ${principle.label}.` : "";
const relationshipText = autoV2RelationshipLabels?.length ? ` ${autoV2RelationshipLabels.join("; ")}.` : "";
logEvent(
`Offensive autopilot shaped ${teams[possessionTeamId].name} into ${profile.phaseLabel.toLowerCase()} support from ${teams[possessionTeamId].formation} / ${profile.styleLabel}: ${profile.principleLabel}.${runnerText}${principleText}${relationshipText}`
);
}
return movedPlayers > 0;
}
function getDefensiveAutopilotGroupsForTeam(teamId, phaseKey, players = state.players) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const roster = teamRosterOrder[teamId] ?? [];
const basePositions = getFormationPositions(formation, teamId);
const baseYById = new Map(
roster.map((playerId, index) => [playerId, basePositions[index]?.y ?? pitch.width / 2])
);
const groups = {
gk: [],
back: [],
midfield: [],
forward: [],
};
players
.filter((player) => player.team === teamId)
.forEach((player) => {
groups[getDefensiveAutopilotLineKey(player, formation, phaseKey)].push(player);
});
Object.values(groups).forEach((group) => {
group.sort((a, b) => (baseYById.get(a.id) ?? a.position.y) - (baseYById.get(b.id) ?? b.position.y));
});
return groups;
}
function applyReachableDefensiveLineCohesion(
teamId,
plannedPositions,
profile,
ballPoint,
presserId = null
) {
if (!ballPoint || !profile || profile.phaseKey === "highPress" || profile.phaseKey === "setPiece") {
return;
}
const groups = getDefensiveAutopilotGroupsForTeam(teamId, profile.phaseKey);
const phaseWeights = {
boxDefending: {
center: 0.84,
depth: 0.8,
slot: 0.88,
forwardSlot: 0.56,
},
lowBlock: {
center: 0.78,
depth: 0.72,
slot: 0.84,
forwardSlot: 0.52,
},
midBlock: {
center: 0.48,
depth: 0.42,
slot: 0.54,
forwardSlot: 0.34,
},
};
const weights = phaseWeights[profile.phaseKey] ?? phaseWeights.midBlock;
["back", "midfield", "forward"].forEach((lineKey) => {
const settings = getDefensiveCompactLineIntegritySettings(profile, lineKey);
if (!settings) {
return;
}
const linePlayers = (groups[lineKey] ?? []).filter(
(player) => !isGoalkeeper(player) && plannedPositions.has(player.id)
);
if (linePlayers.length < 2) {
return;
}
const currentPositions = linePlayers.map((player) => plannedPositions.get(player.id));
const currentCenterY =
currentPositions.reduce((total, point) => total + point.y, 0) / currentPositions.length;
const currentLineX =
currentPositions.reduce((total, point) => total + point.x, 0) / currentPositions.length;
const lineWidth = settings.gap * (linePlayers.length - 1);
const desiredCenterY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const desiredLineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const cohesiveCenterY = lerp(currentCenterY, desiredCenterY, weights.center);
const cohesiveLineX = lerp(currentLineX, desiredLineX, weights.depth);
const slotWeight = lineKey === "forward" ? weights.forwardSlot : weights.slot;
linePlayers.forEach((player, index) => {
const currentPosition = plannedPositions.get(player.id);
const lineSlot = clampToPitch({
x: cohesiveLineX,
y: clamp(cohesiveCenterY - lineWidth / 2 + settings.gap * index, 3.1, pitch.width - 3.1),
}, 2.2);
const isPresser = presserId && player.id === presserId;
const playerSlotWeight = isPresser ? slotWeight * settings.presserScale : slotWeight;
const cohesiveTarget = clampToPitch({
x: lerp(currentPosition.x, lineSlot.x, playerSlotWeight),
y: lerp(currentPosition.y, lineSlot.y, playerSlotWeight),
}, 2.2);
const origin = getActionOrigin(player);
const reachableCohesiveTarget = clampToPitch(
clampToCircle(cohesiveTarget, origin, getEditableRadius(player)),
2
);
plannedPositions.set(player.id, reachableCohesiveTarget);
});
});
}
function applyDefensiveAutopilotForCurrentAction(options = {}) {
if (!state.defensiveAutopilot || !hasBallAction() || state.isRunning || state.sequence.isPlaying) {
return false;
}
const possessionTeamId = getPlannedPossessionTeamId();
const defensiveTeamId = getOtherTeamId(possessionTeamId);
if (!defensiveTeamId) {
return false;
}
const ballPoint = cloneVector(state.ball.target ?? state.draftStep?.target ?? state.ball.position);
const { targets, presser, profile, protectionLabels, focusPoint } = buildDefensiveAutopilotTargets(defensiveTeamId, ballPoint);
const orientationPoint = focusPoint ?? ballPoint;
let movedPlayers = 0;
let autoV2RelationshipLabels = [];
if (state.draftStep) {
state.draftStep.defensiveAutopilot = {
teamId: defensiveTeamId,
ballFocusPoint: cloneVector(orientationPoint),
presserPlayerId: presser?.id ?? null,
phaseKey: profile.phaseKey,
phaseLabel: profile.phaseLabel,
protectionLabels: protectionLabels ?? [],
};
}
const plannedPositions = new Map();
const defensivePlayers = state.players.filter((player) => player.team === defensiveTeamId);
defensivePlayers.forEach((player) => {
const target = targets.get(player.id);
if (!target) {
return;
}
if (!player.actionOrigin) {
player.actionOrigin = cloneVector(player.position);
}
const origin = getActionOrigin(player);
plannedPositions.set(
player.id,
clampToPitch(clampToCircle(target, origin, getEditableRadius(player)), 2)
);
});
applyReachableDefensiveLineCohesion(
defensiveTeamId,
plannedPositions,
profile,
ballPoint,
presser?.id ?? null
);
autoV2RelationshipLabels = applyDefensiveAutoV2RelationshipLayer(
defensiveTeamId,
plannedPositions,
profile,
ballPoint,
presser ?? null
);
const defensiveIntents = buildDefensiveAutoV2Intents(
defensiveTeamId,
defensivePlayers,
plannedPositions,
profile,
presser?.id ?? null
);
if (state.draftStep?.defensiveAutopilot) {
state.draftStep.defensiveAutopilot.behaviorVersion = "v2";
state.draftStep.defensiveAutopilot.intents = defensiveIntents;
state.draftStep.defensiveAutopilot.protectionLabels = uniquePrincipleLabels([
...(protectionLabels ?? []),
...(autoV2RelationshipLabels ?? []),
]);
}
defensivePlayers.forEach((player) => {
if (player.team !== defensiveTeamId) {
return;
}
const reachableTarget = plannedPositions.get(player.id);
if (!reachableTarget) {
return;
}
if (!player.actionOrigin) {
player.actionOrigin = cloneVector(player.position);
}
const previousPosition = cloneVector(player.position);
if (distance(previousPosition, reachableTarget) > 0.03) {
movedPlayers += 1;
}
player.position = reachableTarget;
if (distance(previousPosition, reachableTarget) > 0.04) {
rotatePlayerBodyAlongMovement(player, previousPosition, reachableTarget, 0.76);
}
rotatePlayerBodyToward(player, orientationPoint, presser?.id === player.id ? 0.62 : 0.42);
});
if (movedPlayers > 0 && !options.silent) {
const presserText = presser ? ` ${getPlayerMagnetLabel(presser)} starts the pressure.` : "";
const protectionText = protectionLabels?.length ? ` ${protectionLabels.join("; ")}.` : "";
const relationshipText = autoV2RelationshipLabels?.length ? ` ${autoV2RelationshipLabels.join("; ")}.` : "";
logEvent(
`Defensive autopilot shaped ${teams[defensiveTeamId].name} into a compact ${profile.phaseLabel.toLowerCase()} from ${teams[defensiveTeamId].formation} / ${profile.styleLabel}.${presserText}${protectionText}${relationshipText}`
);
}
return movedPlayers > 0;
}
function applyAutopilotsForCurrentAction(options = {}) {
const offensiveApplied = applyOffensiveAutopilotForCurrentAction(options);
const defensiveApplied = applyDefensiveAutopilotForCurrentAction(options);
return offensiveApplied || defensiveApplied;
}

  return {
    getDefensiveAutopilotFocusPoint,
    getOffensiveAutopilotFocusPoint,
    isDefensiveAutopilotPlayer,
    isOffensiveAutopilotPlayer,
    isDefensiveDribblePresser,
    getLiveDefensiveDribblePressTarget,
    cloneDefensiveAutopilotIntents,
    getDefensiveAutoV2Intent,
    buildDefensiveAutoV2Intents,
    setReachableDefensiveAutoV2Target,
    applyDefensiveAutoV2BackLineRelationship,
    applyDefensiveAutoV2MidfieldPressCover,
    applyDefensiveAutoV2PressTether,
    applyDefensiveAutoV2AntiMagnetRelationships,
    applyDefensiveAutoV2RelationshipLayer,
    getDefensiveAutoV2FrameDt,
    moveDefensiveAutoV2Player,
    alignArrivedDefensiveAutopilotPlayers,
    completeLiveActionPlayersBeforeCommit,
    getActionSpeed,
    configureBallTravelProfile,
    getActionDistance,
    getRequestedActionMode,
    computeReachDistance,
    computeTimeToCoverDistance,
    shouldUseCurvedRecoveryRun,
    getCurvedRecoveryWaypoint,
    shouldUseOffBallCounterMovementRun,
    getOffBallCounterMovementWaypoint,
    buildMovementPath,
    getMovementPathPoint,
    getSnapshotPlayerMap,
    getRecordedStepEndSnapshot,
    getRecordedStepDuration,
    snapshotsMatch,
    createTransitionPlan,
    clampToCircle,
    getEditableRadius,
    getOtherTeamId,
    getPlannedPossessionTeamId,
    getDefendingDirectionSign,
    getDepthX,
    getDistanceFromOwnGoal,
    getOffensivePhaseKey,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPitchLaneIndex,
    getAttackingThirdKey,
    getLaneCenterY,
    getSideLaneKeys,
    getRecentPossessionSteps,
    getRecordedStepPossessionTeamId,
    getPossessionRhythmContext,
    getLaneForSideSign,
    getWideOverlapPrincipleFit,
    getWideOverlapRunTarget,
    cloneOffensiveAutopilotIntents,
    cloneAutoV2DecisionTriggers,
    scanAutoV2DecisionTriggers,
    weightOffensiveAutoV2Intent,
    getOffensiveAutoV2Intent,
    setReachableOffensiveAutoV2Target,
    pickOffensiveAutoV2Player,
    applyOffensiveAutoV2RelationshipLayer,
    buildOffensiveAutoV2Intents,
    moveOffensiveAutoV2Player,
    getDefensivePhaseKey,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveLineActionAdjustment,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineX,
    getDefensiveLineWidth,
    getDefensiveLineCenterY,
    enforceDefensiveUnitCompactness,
    getDefensiveUnitGap,
    enforceDefensiveBlockGeometryLock,
    enforceDefensiveLineStaggering,
    enforceDefensiveLineChainSpacing,
    enforceDefensiveVerticalBlockConnections,
    enforceDefensiveMeasuredBlockEnvelope,
    enforceDefensiveCollectiveShiftCohesion,
    getDefensiveCompactLineIntegritySettings,
    enforceDefensiveCompactLineIntegrity,
    getDefensiveOffsideLineControlContext,
    enforceDefensiveOffsideLineControl,
    applyOffensiveAutopilotForCurrentAction,
    getDefensiveAutopilotGroupsForTeam,
    applyReachableDefensiveLineCohesion,
    applyDefensiveAutopilotForCurrentAction,
    applyAutopilotsForCurrentAction,
  };
}
