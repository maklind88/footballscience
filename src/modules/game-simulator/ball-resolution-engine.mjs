export function createGameSimulatorBallResolutionEngine(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    applyCommittedSnapshot,
    applyControlledFirstTouch,
    blendAngles,
    captureSnapshot,
    clamp,
    clampToPitch,
    clearAutoPilotReceiveMomentum,
    cloneSnapshot,
    cloneVector,
    completeLiveActionPlayersBeforeCommit,
    computePassLaneClarity,
    computeShotLaneClarity,
    computeTimeToCoverDistance,
    configureBallTravelProfile,
    distance,
    finalizeCurrentActionStep,
    getActionInitiator,
    getAttackDirectionSign,
    getAutoPilotRoleStrength,
    getBallFlightControlFactor,
    getBallTravelProgress,
    getCoverShadowInfluence,
    getDefensiveAggressionPreset,
    getDistanceFromOwnGoal,
    getFirstTouchModeLabel,
    getFootUsageScore,
    getLiveDribbleSpeed,
    getNearestOpponentGap,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOrientationMovementProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchSurfacePreset,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPositionForControlPoint,
    getPlayerPressureLoad,
    getReceiveFootUsageScore,
    getReceiveOrientationScore,
    getShotWindowProfile,
    getTeamAttackAngle,
    getTeamAttackStyleKey,
    getWeatherPreset,
    isAerialFlightStyle,
    isGoalkeeper,
    isInsideOpponentBox,
    isInsideOwnBox,
    isTransitionAttackStyle,
    lerp,
    logEvent,
    normalize,
    normalizeAngle,
    pitch,
    placePlayerWithControlPoint,
    playerRadiusMeters,
    projectPointOnSegment,
    projectPointOnSegmentWithRatio,
    queueNextSequenceStep,
    rotatePlayerBodyToward,
    scheduleAutoPilotContinuation,
    setPiecePhaseProfiles,
    shouldUseAutoPilotActiveFirstTouch,
    teams,
    ui,
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

function applyBallExecutionProfile(actionType, initiator, target, ballProfile = null) {
const laneClarity =
actionType === "pass"
? computePassLaneClarity(initiator, target)
: actionType === "shot"
? computeShotLaneClarity(initiator, target)
: 0.84;
const context = initiator ? getPlayerDecisionContext(initiator) : null;
const footExecutionScore =
initiator && target
? getFootUsageScore(initiator, angleBetween(initiator.position, target))
: 0.84;
const shotWindow =
actionType === "shot" && initiator
? getShotWindowProfile(initiator, getPlayerBallControlPoint(initiator), target)
: null;
const executionQuality = clamp(
initiator && context
? (actionType === "shot"
? 0.22 * context.profile.decisionQuality +
0.28 * context.profile.technicalSecurity +
0.2 * context.profile.executionUnderPressure +
0.12 * context.profile.composure +
0.08 * footExecutionScore +
0.12 * laneClarity +
0.12 * (shotWindow?.angleQuality ?? 0.42) +
0.08 * (shotWindow?.goalkeeperOpenness ?? 0.5) -
context.pressure * 0.12 -
(shotWindow?.blockRisk ?? 0) * 0.08
: 0.26 * context.profile.decisionQuality +
0.32 * context.profile.technicalSecurity +
0.24 * context.profile.executionUnderPressure +
0.1 * context.profile.composure +
0.06 * footExecutionScore +
0.08 * laneClarity -
context.pressure * 0.08)
: 0.76,
0.42,
0.98
);
const targetKind = ballProfile?.targetKind ?? null;
const claimBase = targetKind === "into-space" ? 2.15 : 1.8;
const claimCeiling = targetKind === "into-space"
? actionType === "shot" ? 6 : 5.2
: actionType === "shot" ? 5.8 : 4.8;
const claimRadius = clamp(
claimBase + (1 - executionQuality) * (actionType === "shot" ? 4.2 : 3.2),
1.6,
claimCeiling
);
const controlBase = targetKind === "to-feet" ? 0.82 : 0.68;
const controlRadius = clamp(
controlBase + executionQuality * 1.4 + laneClarity * 0.55,
0.8,
targetKind === "to-feet" ? 2.3 : 2.55
);
state.ball.laneClarity = laneClarity;
state.ball.executionQuality = executionQuality;
state.ball.claimRadius = claimRadius;
state.ball.controlRadius = controlRadius;
}
function getLooseBallClaimScore(player, point) {
const context = getPlayerDecisionContext(player);
const gap = distance(player.position, point);
const timeToBall = computeTimeToCoverDistance(player, gap, point);
const proximity = clamp(1 - gap / 8.5, 0, 1);
return (
context.profile.perception * 0.17 +
context.profile.decisionSpeed * 0.16 +
context.profile.decisionQuality * 0.14 +
context.profile.technicalSecurity * 0.17 +
context.profile.pressResistance * 0.14 +
context.profile.composure * 0.12 +
proximity * 0.5 -
timeToBall * 0.16
);
}
function getShotReboundClaimContext(point, options = {}) {
if (!point) {
return { active: false };
}
const sourceText = [
options.source,
options.reboundType,
state.ball.secondBallContext?.source,
state.ball.profileKey,
state.ball.actionType,
]
.filter(Boolean)
.join(" ")
.toLowerCase();
const isShotRebound =
sourceText.includes("shot") ||
sourceText.includes("parry") ||
sourceText.includes("save") ||
sourceText.includes("block");
if (!isShotRebound) {
return { active: false };
}
const initiator = getActionInitiator();
const attackingTeamId =
options.attackingTeamId ??
state.ball.secondBallContext?.attackingTeamId ??
initiator?.team ??
getPlayerById(state.ball.initiatorPlayerId)?.team ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId)?.team ??
getPlannedPossessionTeamId() ??
null;
if (!attackingTeamId) {
return { active: false };
}
const defendingTeamId =
options.defendingTeamId ??
state.ball.secondBallContext?.defendingTeamId ??
getOtherTeamId(attackingTeamId);
const attackSign = Math.cos(getTeamAttackAngle(attackingTeamId)) >= 0 ? 1 : -1;
const goalPoint = {
x: attackSign > 0 ? pitch.length : 0,
y: pitch.width / 2,
};
const penaltySpot = {
x: goalPoint.x - attackSign * 11,
y: pitch.width / 2,
};
const threat = getPitchThreatProfile(point, attackingTeamId);
return {
active: true,
sourceText,
attackingTeamId,
defendingTeamId,
attackSign,
goalPoint,
penaltySpot,
threat,
insideAttackingBox: isInsideOpponentBox(point, attackingTeamId),
insideDefendingBox: defendingTeamId ? isInsideOwnBox(point, defendingTeamId) : false,
urgency: clamp(
options.urgency ?? state.ball.secondBallContext?.urgency ?? 0.56,
0.2,
0.96
),
isParry: sourceText.includes("parry") || sourceText.includes("save"),
isBlockedShot: sourceText.includes("block") || sourceText.includes("deflection"),
};
}
function getShotReboundClaimAdjustment(player, point, context) {
if (!context?.active || !player || !point) {
return 0;
}
const label = getPlayerMagnetLabel(player);
const gap = distance(player.position, point);
const proximity = clamp(1 - gap / 12, 0, 1);
const orientation = getOrientationMovementProfile(player, point).receiveModifier;
const contextProfile = getPlayerDecisionContext(player).profile;
const isAttacking = player.team === context.attackingTeamId;
const isDefending = player.team === context.defendingTeamId;
const goalSide = context.attackSign * (player.position.x - point.x);
const poacherSide = clamp(goalSide / 8, 0, 1);
const defenderGoalSide = clamp(goalSide / 7, 0, 1);
const centralRebound =
context.threat.centrality * 0.08 +
context.threat.box * 0.05 +
clamp(1 - distance(point, context.penaltySpot) / 16, 0, 1) * 0.08;
let adjustment = (orientation - 0.5) * 0.05 + proximity * 0.04;
if (isAttacking) {
if (isGoalkeeper(player)) {
return adjustment - 0.45;
}
if (label === "9") adjustment += 0.2;
if (label === "W") adjustment += 0.15;
if (label === "10") adjustment += 0.13;
if (label === "8") adjustment += 0.1;
if (label === "6") adjustment += 0.04;
if (label === "LB" || label === "RB" || label === "WB") adjustment += context.threat.cutbackZone * 0.05;
adjustment +=
context.threat.value * 0.1 +
context.urgency * 0.05 +
poacherSide * 0.08 +
centralRebound +
contextProfile.decisionSpeed * 0.04 +
contextProfile.composure * 0.04;
if (!context.insideAttackingBox && context.threat.depth < 55) {
adjustment -= 0.04;
}
}
if (isDefending) {
if (isGoalkeeper(player)) adjustment += context.insideDefendingBox ? 0.23 : 0.08;
if (label === "CB") adjustment += 0.21;
if (label === "LB" || label === "RB" || label === "WB") adjustment += 0.14;
if (label === "6") adjustment += 0.13;
if (label === "8" || label === "10") adjustment += 0.07;
if (label === "W" || label === "9") adjustment += context.insideDefendingBox ? -0.04 : 0.02;
adjustment +=
defenderGoalSide * 0.1 +
centralRebound * 0.9 +
context.threat.value * 0.07 +
context.urgency * 0.04 +
contextProfile.perception * 0.035 +
contextProfile.tacticalDiscipline * 0.055;
}
return clamp(adjustment, -0.5, 0.5);
}
function getBallContestControlScore(player, point, actionType) {
const context = getPlayerDecisionContext(player);
const orientation = getOrientationMovementProfile(player, point).receiveModifier;
const actionDifficulty = actionType === "shot" ? 0.12 : 0;
return clamp(
context.profile.technicalSecurity * 0.28 +
context.profile.perception * 0.18 +
context.profile.decisionSpeed * 0.14 +
context.profile.pressResistance * 0.16 +
context.profile.composure * 0.14 +
orientation * 0.14 -
context.pressure * 0.1 -
actionDifficulty,
0.18,
0.98
);
}
function getAerialPresence(player) {
const label = getPlayerMagnetLabel(player);
if (label === "GK") return 0.96;
if (label === "CB") return 0.9;
if (label === "9") return 0.84;
if (label === "6") return 0.78;
if (label === "8" || label === "10") return 0.74;
if (label === "WB" || label === "LB" || label === "RB") return 0.72;
if (label === "W") return 0.64;
return 0.72;
}
function getAerialContestScore(player, point, incomingPoint, preferredPlayerId = null, preferredBoost = 0) {
const context = getPlayerDecisionContext(player);
const gap = distance(player.position, point);
const proximity = clamp(1 - gap / 3.6, 0, 1);
const orientation = getOrientationMovementProfile(player, point).coverModifier;
const ballSight = incomingPoint
? clamp(1 - angleDifference(getPlayerFacingAngle(player), angleBetween(player.position, incomingPoint)) / Math.PI, 0, 1)
: 0.82;
return (
getAerialPresence(player) * 0.28 +
context.profile.perception * 0.14 +
context.profile.decisionSpeed * 0.12 +
context.profile.composure * 0.12 +
context.profile.pressResistance * 0.1 +
context.profile.technicalSecurity * 0.08 +
orientation * 0.08 +
ballSight * 0.08 +
proximity * 0.22 +
(player.id === preferredPlayerId ? preferredBoost : 0)
);
}
function getAerialFirstContactContext(actionType, point, incomingPoint, receiver = null) {
const initiator = getActionInitiator();
const attackingTeamId =
initiator?.team ??
receiver?.team ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId)?.team ??
getPlayerById(state.ball.initiatorPlayerId)?.team ??
null;
const defendingTeamId = attackingTeamId ? getOtherTeamId(attackingTeamId) : null;
const profileText = [
state.ball.profileKey,
state.ball.profileLabel,
state.ball.targetKind,
state.draftStep?.profileKey,
state.draftStep?.profileLabel,
...(state.draftStep?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const targetThreat = attackingTeamId ? getPitchThreatProfile(point, attackingTeamId) : null;
const inAttackingBox = attackingTeamId ? isInsideOpponentBox(point, attackingTeamId) : false;
const inDefendingBox = defendingTeamId ? isInsideOwnBox(point, defendingTeamId) : false;
const crossLike =
profileText.includes("cross") ||
profileText.includes("delivery") ||
profileText.includes("lofted") ||
(inAttackingBox && state.ball.flightStyle === "lofted");
const secondBallZone =
inAttackingBox ||
(targetThreat?.assistZone ?? 0) >= 0.28 ||
(targetThreat?.behindLine ?? 0) >= 0.22;
return {
actionType,
attackingTeamId,
defendingTeamId,
incomingPoint,
point,
profileText,
targetThreat,
inAttackingBox,
inDefendingBox,
crossLike,
secondBallZone,
};
}
function getAerialFirstContactScore(player, point, incomingPoint, context, preferredPlayerId = null, preferredBoost = 0) {
const baseScore = getAerialContestScore(player, point, incomingPoint, preferredPlayerId, preferredBoost);
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const teamIsAttacking = player.team === context.attackingTeamId;
const teamIsDefending = player.team === context.defendingTeamId;
const gap = distance(player.position, point);
const timeToBall = computeTimeToCoverDistance(player, gap, point);
const arrivalFit = clamp(1 - timeToBall / 1.25, -0.12, 0.22);
const ownBoxClaim =
isGoalkeeper(player) && teamIsDefending && context.inDefendingBox
? 0.24 + getAerialPresence(player) * 0.08
: 0;
const defensiveClearanceBonus =
teamIsDefending && context.secondBallZone
? (roleKey === "rest" ? 0.08 : 0) + (getPlayerMagnetLabel(player) === "CB" ? 0.12 : 0.04)
: 0;
const attackingContactBonus =
teamIsAttacking && context.crossLike && context.inAttackingBox
? (roleKey === "striker" || roleKey === "wideForward" || roleKey === "secondStriker" ? 0.14 : 0.05)
: 0;
const underBallBonus =
Math.abs(player.position.y - point.y) <= 2.8 ? 0.04 : 0;
return (
baseScore +
arrivalFit +
ownBoxClaim +
defensiveClearanceBonus +
attackingContactBonus +
underBallBonus
);
}
function getAerialDefensiveClearanceAngle(winner, contestPoint, incomingAngle) {
const teamExitAngle = getTeamAttackAngle(winner.team);
const sideSign = Math.sign(contestPoint.y - pitch.width / 2) || (winner.position.y >= pitch.width / 2 ? 1 : -1);
const wideExit = normalizeAngle(teamExitAngle + sideSign * 0.22);
return blendAngles(wideExit, incomingAngle, 0.74, 0.26);
}
function getAerialAttackingKnockdownAngle(winner, contestPoint, context) {
const goal = getOpponentGoalCenter(winner.team);
const penaltySpot = getOpponentPenaltySpot(winner.team);
const towardGoal = angleBetween(contestPoint, goal);
const towardSecondBall = angleBetween(contestPoint, {
x: lerp(contestPoint.x, penaltySpot.x, 0.58),
y: lerp(contestPoint.y, pitch.width / 2, 0.72),
});
if ((context.targetThreat?.box ?? 0) >= 0.28 && getAerialPresence(winner) >= 0.78) {
return blendAngles(towardGoal, towardSecondBall, 0.58, 0.42);
}
return blendAngles(towardSecondBall, getTeamAttackAngle(winner.team), 0.72, 0.28);
}
function getAerialControlScore(player, incomingPoint) {
const context = getPlayerDecisionContext(player);
const receiveOrientationScore = getReceiveOrientationScore(player, incomingPoint);
const footScore = getReceiveFootUsageScore(player, incomingPoint);
return clamp(
context.profile.technicalSecurity * 0.26 +
context.profile.pressResistance * 0.18 +
context.profile.composure * 0.16 +
context.profile.decisionQuality * 0.12 +
getAerialPresence(player) * 0.14 +
receiveOrientationScore * 0.08 +
footScore * 0.06 -
context.pressure * 0.08,
0.18,
0.98
);
}
function getBallDuelScore(player, point) {
const context = getPlayerDecisionContext(player);
const gap = distance(player.position, point);
const orientation = getOrientationMovementProfile(player, point).coverModifier;
const proximity = clamp(1 - gap / 3.2, 0, 1);
return (
context.profile.pressResistance * 0.24 +
context.profile.composure * 0.16 +
context.profile.technicalSecurity * 0.14 +
context.profile.tacticalDiscipline * 0.12 +
context.profile.decisionQuality * 0.12 +
orientation * 0.12 +
proximity * 0.22
);
}
function clearSecurePossession() {
state.ball.securePossession = null;
}
function getBallWinEscapeTouch(winner, loser, point = state.ball.position, reason = "tackle") {
if (!winner || !loser || winner.team === loser.team) {
return null;
}
const contestPoint = clampToPitch(point ?? getPlayerBallControlPoint(winner), 1.5);
const winnerContext = getPlayerDecisionContext(winner);
const roleKey = getOffensiveRoleKey(winner, teams[winner.team]?.formation);
const attackSign = getAttackDirectionSign(winner.team);
const awayFromLoser = normalize(loser.position ?? contestPoint, contestPoint);
const forwardVector = { x: attackSign, y: 0 };
const insideTarget = {
x: contestPoint.x + attackSign * 2.8,
y: pitch.width / 2,
};
const insideVector = normalize(contestPoint, insideTarget);
const isRestOrBack = roleKey === "rest" || roleKey === "wideBack" || roleKey === "gk";
const pressure = getPlayerPressureLoad(winner, contestPoint);
const security =
winnerContext.profile.pressResistance * 0.34 +
winnerContext.profile.composure * 0.24 +
winnerContext.profile.technicalSecurity * 0.22 +
winnerContext.profile.decisionQuality * 0.12;
const counterBias = isTransitionAttackStyle(getTeamAttackStyleKey(winner.team)) ? 0.22 : 0;
const forwardWeight = clamp(
0.2 +
counterBias +
(roleKey === "wideForward" || roleKey === "striker" || roleKey === "secondStriker" ? 0.16 : 0) -
(isRestOrBack ? 0.1 : 0) -
pressure * 0.08,
0.08,
0.54
);
const insideWeight = clamp(
0.28 +
(isRestOrBack ? 0.16 : 0) +
pressure * 0.1,
0.2,
0.58
);
const awayWeight = clamp(
0.62 +
pressure * 0.16 +
(reason === "tackle" ? 0.1 : 0),
0.48,
0.84
);
const combined = {
x: awayFromLoser.x * awayWeight + insideVector.x * insideWeight + forwardVector.x * forwardWeight,
y: awayFromLoser.y * awayWeight + insideVector.y * insideWeight + forwardVector.y * forwardWeight,
};
const combinedLength = Math.hypot(combined.x, combined.y) || 1;
const escapeDirection = {
x: combined.x / combinedLength,
y: combined.y / combinedLength,
};
const touchDistance = clamp(
0.78 +
security * 0.58 +
(reason === "interception" ? 0.32 : 0.16) -
pressure * 0.24,
0.68,
reason === "interception" ? 1.72 : 1.42
);
const escapePoint = clampToPitch({
x: contestPoint.x + escapeDirection.x * touchDistance,
y: contestPoint.y + escapeDirection.y * touchDistance,
}, 1.5);
const playerTarget = getPlayerPositionForControlPoint(
winner,
escapePoint,
angleBetween(contestPoint, escapePoint)
);
return {
contestPoint,
escapePoint,
playerTarget: clampToPitch(playerTarget, 1.5),
facingAngle: angleBetween(contestPoint, escapePoint),
touchDistance,
pressure,
};
}
function applyBallWinEscapeTouch(winner, loser, point = state.ball.position, reason = "tackle") {
const escape = getBallWinEscapeTouch(winner, loser, point, reason);
if (!escape) {
return null;
}
const currentControlPoint = getPlayerBallControlPoint(winner);
const currentGap = distance(currentControlPoint, escape.escapePoint);
const maxAdjustment = reason === "interception" ? 1.05 : 0.86;
const adjustmentRatio = currentGap <= 0.01 ? 0 : clamp(maxAdjustment / currentGap, 0, 1);
const nextControlPoint = {
x: lerp(currentControlPoint.x, escape.escapePoint.x, adjustmentRatio),
y: lerp(currentControlPoint.y, escape.escapePoint.y, adjustmentRatio),
};
const playerTarget = getPlayerPositionForControlPoint(winner, nextControlPoint, escape.facingAngle);
winner.position = clampToPitch(playerTarget, 1.5);
winner.bodyAngle = escape.facingAngle;
winner.movementProgress = 0;
state.ball.ownerPlayerId = winner.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(winner));
state.ball.target = cloneVector(state.ball.position);
return {
...escape,
appliedPoint: cloneVector(state.ball.position),
};
}
function setSecurePossessionAfterBallWin(winner, loser, point = state.ball.position, reason = "tackle") {
if (!winner || !loser || winner.team === loser.team) {
clearSecurePossession();
return;
}
const escape = applyBallWinEscapeTouch(winner, loser, point, reason);
state.ball.securePossession = {
ownerPlayerId: winner.id,
opponentPlayerId: loser.id,
point: cloneVector(point),
escapePoint: escape?.appliedPoint ? cloneVector(escape.appliedPoint) : null,
createdAt: state.time,
reason,
minDistanceToExpire: reason === "interception" ? 6.1 : 7.8,
minTimeToExpire: reason === "interception" ? 1.45 : 1.85,
};
}
function getPossessionShieldOpponents(owner, point, radius = 4.8) {
if (!owner || !point) {
return [];
}
return state.players
.filter((player) => player.team !== owner.team && !isGoalkeeper(player))
.map((player) => ({
player,
gap: distance(player.position, point),
}))
.filter((entry) => entry.gap <= radius)
.sort((a, b) => a.gap - b.gap);
}
function setSecurePossessionAfterControlledTouch(owner, point = state.ball.position, options = {}) {
if (!owner || !point) {
return;
}
const currentSecure = state.ball.securePossession;
const currentReason = currentSecure?.reason ?? "";
const keepStrongerBallWinShield =
currentSecure?.ownerPlayerId === owner.id &&
(currentReason === "tackle" || currentReason === "interception");
if (keepStrongerBallWinShield) {
return;
}
const context = getPlayerDecisionContext(owner);
const quality = clamp(
options.quality ??
(
context.profile.technicalSecurity * 0.36 +
context.profile.pressResistance * 0.24 +
context.profile.composure * 0.18 +
context.profile.decisionQuality * 0.12 -
context.pressure * 0.08
),
0.34,
0.98
);
const reason = options.reason ?? "controlled-reception";
const shieldRadius = clamp(
options.shieldRadius ?? lerp(3.15, 4.75, quality),
2.6,
5.4
);
const nearbyOpponents = getPossessionShieldOpponents(owner, point, shieldRadius + 0.85);
const nearestOpponent = nearbyOpponents[0]?.player ?? null;
const activePressure = Math.max(context.pressure, nearbyOpponents.length ? 0.34 : 0);
const reasonStrength =
reason === "loose-ball-collect"
? 0.44
: reason === "rebound-control"
? 0.36
: 0.48;
state.ball.securePossession = {
ownerPlayerId: owner.id,
opponentPlayerId: nearestOpponent?.id ?? null,
opponentPlayerIds: nearbyOpponents.slice(0, 4).map((entry) => entry.player.id),
point: cloneVector(point),
escapePoint: cloneVector(getPlayerBallControlPoint(owner)),
createdAt: state.time,
reason,
shieldRadius,
shieldStrength: clamp(
reasonStrength +
quality * 0.2 +
activePressure * 0.08 +
clamp(nearbyOpponents.length / 4, 0, 1) * 0.06,
0.36,
0.76
),
minDistanceToExpire: clamp(
options.minDistanceToExpire ?? lerp(3.7, 6.2, quality),
3.1,
6.8
),
minTimeToExpire: clamp(
options.minTimeToExpire ?? lerp(0.7, 1.28, quality),
0.55,
1.45
),
};
}
function keepSecurePossessionOnlyForOwner(ownerPlayerId) {
if (state.ball.securePossession && state.ball.securePossession.ownerPlayerId !== ownerPlayerId) {
clearSecurePossession();
}
}
function getSecurePossessionContext(owner, challenger) {
const secure = state.ball.securePossession;
if (!secure || !owner || !challenger || owner.id !== secure.ownerPlayerId) {
return null;
}
const explicitOpponentMatch =
challenger.id === secure.opponentPlayerId ||
(Array.isArray(secure.opponentPlayerIds) && secure.opponentPlayerIds.includes(challenger.id));
const controlledTouchShield =
(secure.reason === "controlled-reception" ||
secure.reason === "loose-ball-collect" ||
secure.reason === "rebound-control") &&
distance(challenger.position, owner.position) <= (secure.shieldRadius ?? 3.4);
if (!explicitOpponentMatch && !controlledTouchShield) {
return null;
}
const origin = secure.point ?? owner.position;
const movedFromDuel = distance(owner.position, origin);
const actionElapsed = state.ball.inTransit ? state.ball.elapsedTravelTime : 0;
const distanceProgress = movedFromDuel / Math.max(secure.minDistanceToExpire ?? 5, 0.01);
const timeProgress = actionElapsed / Math.max(secure.minTimeToExpire ?? 1, 0.01);
const protectionRatio = clamp(
(1 - Math.max(distanceProgress, timeProgress)) * (secure.shieldStrength ?? 1),
0,
1
);
if (protectionRatio <= 0.01) {
clearSecurePossession();
return null;
}
return {
movedFromDuel,
actionElapsed,
protectionRatio,
};
}
function getDribbleTackleCandidate(carrier) {
if (!carrier || state.ball.actionType !== "dribble" || state.ball.elapsedTravelTime < 0.28) {
return null;
}
const startPoint = state.ball.startPosition;
const targetPoint = state.ball.target;
const totalLaneDistance = distance(startPoint, targetPoint);
if (totalLaneDistance <= 0.25) {
return null;
}
const ballProgress = getBallTravelProgress();
const currentCarrySpeed = Math.max(state.ball.currentSpeed || getLiveDribbleSpeed(carrier, targetPoint), 0.1);
const carrierContext = getPlayerDecisionContext(carrier);
const aggression = getDefensiveAggressionPreset();
const baseCarrierControlScore =
getBallDuelScore(carrier, state.ball.position) +
carrierContext.profile.pressResistance * 0.2 +
carrierContext.profile.technicalSecurity * 0.15 +
carrierContext.profile.composure * 0.12 +
clamp(currentCarrySpeed / 8.5, 0, 1) * 0.07;
let bestCandidate = null;
state.players.forEach((player) => {
if (player.team === carrier.team || player.id === carrier.id || isGoalkeeper(player)) {
return;
}
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
const laneGap = distance(player.position, projection.point);
const bodyGap = distance(player.position, carrier.position);
const ballGap = distance(player.position, state.ball.position);
const defenderContext = getPlayerDecisionContext(player);
const tackleReach = clamp(
(1.12 +
defenderContext.profile.perception * 0.22 +
defenderContext.profile.decisionSpeed * 0.2 +
defenderContext.profile.tacticalDiscipline * 0.18) *
aggression.reachMultiplier,
1.12,
2.05
);
const bodyContactScore = clamp(1 - (bodyGap - 1.35) / (1.35 * aggression.contactWindow), 0, 1);
const ballContactScore = clamp(1 - (ballGap - 0.75) / (1.75 * aggression.contactWindow), 0, 1);
const laneProgressWindow =
projection.ratio >= ballProgress - aggression.laneBehindWindow &&
projection.ratio <= ballProgress + aggression.laneAheadWindow;
const carrierTimeToLane = distance(carrier.position, projection.point) / currentCarrySpeed;
const defenderTimeToLane = computeTimeToCoverDistance(
player,
distance(player.position, projection.point),
projection.point
);
const etaScore = laneProgressWindow
? clamp(1 - Math.abs(defenderTimeToLane - carrierTimeToLane) / aggression.etaTolerance, 0, 1)
: 0;
const laneScore = laneProgressWindow
? clamp(1 - laneGap / tackleReach, 0, 1) * etaScore
: 0;
const closeEnoughForTackle =
(bodyGap <= playerRadiusMeters * 1.95 * aggression.contactWindow &&
ballGap <= state.ball.controlRadius + 1.35 * aggression.contactWindow) ||
laneScore >= aggression.laneScoreThreshold;
if (!closeEnoughForTackle) {
return;
}
const approachAngle = angleBetween(player.position, state.ball.position);
const carrierCarryAngle = angleBetween(carrier.position, targetPoint);
const frontOrSidePressure = clamp(
1 - Math.max(0, Math.cos(normalizeAngle(approachAngle - carrierCarryAngle))) * 0.55,
0.35,
1
);
const defenderScore =
getBallDuelScore(player, state.ball.position) +
defenderContext.profile.tacticalDiscipline * 0.13 +
defenderContext.profile.decisionSpeed * 0.1 +
bodyContactScore * 0.28 +
ballContactScore * 0.2 +
laneScore * 0.34 +
etaScore * 0.1 +
frontOrSidePressure * 0.08 +
aggression.scoreBonus;
const secureContext = getSecurePossessionContext(carrier, player);
const secureProtection = secureContext?.protectionRatio ?? 0;
const adjustedCarrierControlScore =
baseCarrierControlScore +
secureProtection * 0.36 +
clamp(currentCarrySpeed / 5.5, 0, 1) * secureProtection * 0.06;
const adjustedDefenderScore = defenderScore - secureProtection * 0.2;
const margin = adjustedDefenderScore - adjustedCarrierControlScore;
const requiredMargin = aggression.marginThreshold + secureProtection * 0.22;
const requiredContestedMargin = aggression.contestedMargin + secureProtection * 0.14;
const decisiveContact =
bodyContactScore >= 0.58 + secureProtection * 0.18 &&
ballContactScore >= 0.42 + secureProtection * 0.18;
const decisiveLaneTiming = laneScore >= 0.62 + secureProtection * 0.18;
if (
margin < requiredMargin &&
!(margin >= requiredContestedMargin && (decisiveContact || decisiveLaneTiming))
) {
return;
}
const candidate = {
player,
point: cloneVector(state.ball.position),
bodyGap,
ballGap,
laneGap,
laneScore,
etaScore,
score: adjustedDefenderScore + Math.max(bodyContactScore, laneScore) * 0.16 - secureProtection * 0.18,
};
if (!bestCandidate || candidate.score > bestCandidate.score) {
bestCandidate = candidate;
}
});
return bestCandidate;
}
function getDribbleFoulCandidate(carrier) {
if (!carrier || state.ball.actionType !== "dribble" || state.ball.elapsedTravelTime < 0.34) {
return null;
}
const startPoint = state.ball.startPosition;
const targetPoint = state.ball.target;
const totalLaneDistance = distance(startPoint, targetPoint);
if (totalLaneDistance <= 0.25) {
return null;
}
const ballProgress = getBallTravelProgress();
const currentCarrySpeed = Math.max(state.ball.currentSpeed || getLiveDribbleSpeed(carrier, targetPoint), 0.1);
const aggression = getDefensiveAggressionPreset();
const aggressionFoulRisk =
state.defensiveAggressionPreset === "aggressive"
? 0.13
: state.defensiveAggressionPreset === "conservative"
? -0.08
: 0.02;
let bestCandidate = null;
state.players.forEach((player) => {
if (player.team === carrier.team || player.id === carrier.id || isGoalkeeper(player)) {
return;
}
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
const bodyGap = distance(player.position, carrier.position);
const ballGap = distance(player.position, state.ball.position);
const laneGap = distance(player.position, projection.point);
const defenderContext = getPlayerDecisionContext(player);
const bodyContactScore = clamp(1 - (bodyGap - 1.25) / (1.4 * aggression.contactWindow), 0, 1);
const ballContactScore = clamp(1 - (ballGap - 0.65) / (1.7 * aggression.contactWindow), 0, 1);
const laneProgressWindow =
projection.ratio >= ballProgress - aggression.laneBehindWindow * 1.25 &&
projection.ratio <= ballProgress + aggression.laneAheadWindow * 0.75;
const carrierTimeToLane = distance(carrier.position, projection.point) / currentCarrySpeed;
const defenderTimeToLane = computeTimeToCoverDistance(
player,
distance(player.position, projection.point),
projection.point
);
const lateScore = laneProgressWindow
? clamp((defenderTimeToLane - carrierTimeToLane + 0.18) / 0.62, 0, 1)
: 0;
const approachAngle = angleBetween(player.position, state.ball.position);
const carrierCarryAngle = angleBetween(carrier.position, targetPoint);
const behindScore = clamp(Math.cos(normalizeAngle(approachAngle - carrierCarryAngle)), 0, 1);
const carelessContact =
bodyContactScore >= 0.58 &&
ballContactScore <= 0.42 &&
(behindScore >= 0.38 || lateScore >= 0.28 || laneGap <= playerRadiusMeters * 1.55);
if (!carelessContact) {
return;
}
const foulScore =
bodyContactScore * 0.4 +
(1 - ballContactScore) * 0.24 +
lateScore * 0.22 +
behindScore * 0.18 +
aggressionFoulRisk -
defenderContext.profile.tacticalDiscipline * 0.13 -
defenderContext.profile.decisionQuality * 0.07;
const isPenalty = isInsideOpponentBox(state.ball.position, carrier.team);
const threshold = isPenalty ? 0.74 : 0.66;
if (foulScore < threshold) {
return;
}
const candidate = {
player,
fouledPlayer: carrier,
point: cloneVector(state.ball.position),
restartType: isPenalty ? "penalty" : "freeKick",
score: foulScore,
bodyGap,
ballGap,
lateScore,
behindScore,
};
if (!bestCandidate || candidate.score > bestCandidate.score) {
bestCandidate = candidate;
}
});
return bestCandidate;
}
function completeDribbleFoulRestart(foul, completedTravelTime) {
const restartTeamName = teams[foul.fouledPlayer.team]?.name ?? "Attacking team";
const foulTypeLabel = foul.restartType === "penalty" ? "penalty" : "free-kick";
state.ball.inTransit = false;
state.ball.height = 0;
state.ball.position = cloneVector(foul.point);
state.ball.target = cloneVector(foul.point);
state.ball.ownerPlayerId = null;
clearSecurePossession();
if (state.sequence.isPlaying) {
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = null;
state.sequence.phase = null;
state.sequence.actionTargets = null;
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.afterSnapshot) {
applyCommittedSnapshot(step.afterSnapshot);
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
logEvent(
`${foul.player.shortLabel} ${foul.player.role} fouls ${foul.fouledPlayer.shortLabel} ${foul.fouledPlayer.role}. ${restartTeamName} restart with a ${foulTypeLabel}.`
);
queueNextSequenceStep();
return;
}
completeLiveActionPlayersBeforeCommit(foul.point);
if (state.draftStep) {
state.draftStep.nextRestartPhase = {
type: foul.restartType,
teamId: foul.fouledPlayer.team,
label: setPiecePhaseProfiles[foul.restartType].label,
point: foul.restartType === "freeKick" ? cloneVector(foul.point) : null,
};
state.draftStep.target = cloneVector(foul.point);
}
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = null;
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(
`${foul.player.shortLabel} ${foul.player.role} fouls ${foul.fouledPlayer.shortLabel} ${foul.fouledPlayer.role} after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a ${foulTypeLabel}.`
);
scheduleAutoPilotContinuation(null, "dribble");
}
function resolveDribbleDefensiveChallenge() {
const carrier = getPlayerById(state.ball.carrierPlayerId);
const candidate = getDribbleTackleCandidate(carrier);
if (!candidate) {
const foul = getDribbleFoulCandidate(carrier);
if (foul) {
completeDribbleFoulRestart(foul, state.ball.elapsedTravelTime);
return true;
}
return false;
}
state.ball.inTransit = false;
connectBallToPlayerForNextAction(candidate.player, candidate.point, 0.7);
setSecurePossessionAfterBallWin(candidate.player, carrier, candidate.point, "tackle");
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = null;
if (state.sequence.isPlaying) {
state.sequence.phase = null;
state.sequence.actionTargets = null;
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step) {
step.afterSnapshot = cloneSnapshot(captureSnapshot());
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
logEvent(
`${candidate.player.shortLabel} ${candidate.player.role} wins the ball with a tackle on ${carrier.shortLabel} ${carrier.role}.`
);
queueNextSequenceStep();
return true;
}
completeLiveActionPlayersBeforeCommit(state.ball.position);
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(
`${candidate.player.shortLabel} ${candidate.player.role} wins the ball with a tackle on ${carrier.shortLabel} ${carrier.role}.`
);
scheduleAutoPilotContinuation();
return true;
}
function resolveLooseBallClaim(point, claimRadius, preferredPlayerId = null, preferredBoost = 0, options = {}) {
let bestImmediate = null;
let bestSecondBall = null;
const reboundContext = getShotReboundClaimContext(point, options);
state.players.forEach((player) => {
if (options.canClaimPlayer && !options.canClaimPlayer(player)) {
return;
}
const gap = distance(player.position, point);
const timeToBall = computeTimeToCoverDistance(player, gap, point);
const reboundTimeWindow = reboundContext.active
? lerp(
reboundContext.insideAttackingBox || reboundContext.insideDefendingBox ? 1.72 : 1.46,
reboundContext.insideAttackingBox || reboundContext.insideDefendingBox ? 2.24 : 1.82,
reboundContext.urgency
)
: 1.45;
const baseScore =
getLooseBallClaimScore(player, point) +
getShotReboundClaimAdjustment(player, point, reboundContext) +
(player.id === preferredPlayerId ? preferredBoost : 0);
if (gap <= claimRadius) {
const candidate = {
player,
gap,
timeToBall,
score: baseScore + clamp(1 - gap / Math.max(claimRadius, 0.01), 0, 1) * 0.22,
claimType: "immediate",
};
if (!bestImmediate || candidate.score > bestImmediate.score) {
bestImmediate = candidate;
}
return;
}
const secondBallRadius = claimRadius + (
reboundContext.active
? lerp(
reboundContext.insideAttackingBox || reboundContext.insideDefendingBox ? 4.4 : 3.6,
reboundContext.insideAttackingBox || reboundContext.insideDefendingBox ? 6.9 : 5.2,
reboundContext.urgency
)
: 3.6
);
if (gap > secondBallRadius || timeToBall > reboundTimeWindow) {
return;
}
const candidate = {
player,
gap,
timeToBall,
score:
baseScore +
clamp(1 - (gap - claimRadius) / Math.max(secondBallRadius - claimRadius, 0.01), 0, 1) * 0.18 -
timeToBall * 0.05,
claimType: "second-ball",
};
if (!bestSecondBall || candidate.score > bestSecondBall.score) {
bestSecondBall = candidate;
}
});
if (bestImmediate) {
return bestImmediate;
}
const secondBallThreshold = reboundContext.active
? clamp(0.34 - reboundContext.urgency * 0.08, 0.24, 0.34)
: 0.36;
const secondBallGapBonus = reboundContext.active
? lerp(1.6, 2.55, reboundContext.urgency)
: 1.4;
if (bestSecondBall && (bestSecondBall.score >= secondBallThreshold || bestSecondBall.gap <= claimRadius + secondBallGapBonus)) {
return bestSecondBall;
}
return {
player: null,
gap: null,
timeToBall: null,
score: null,
claimType: "unclaimed",
};
}
function connectBallToPlayerForNextAction(player, focusPoint = state.ball.position, blend = 0.4) {
if (!player) {
return false;
}
clearAutoPilotReceiveMomentum(player.id);
rotatePlayerBodyToward(player, focusPoint, blend);
state.ball.ownerPlayerId = player.id;
keepSecurePossessionOnlyForOwner(player.id);
state.ball.position = cloneVector(getPlayerBallControlPoint(player));
state.ball.target = cloneVector(state.ball.position);
return true;
}
function applyShotReboundControlTouch(player, point, context) {
if (!player || !point || !context?.active) {
return false;
}
const isAttacking = player.team === context.attackingTeamId;
const isDefending = player.team === context.defendingTeamId;
if (!isAttacking && !isDefending) {
return false;
}
const pressure = getPlayerPressureLoad(player, point);
const label = getPlayerMagnetLabel(player);
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const contextProfile = getPlayerDecisionContext(player).profile;
let facingAngle = getTeamAttackAngle(player.team);
let touchDistance = 0.75;
if (isAttacking) {
const goal = getOpponentGoalCenter(player.team);
const penaltySpot = getOpponentPenaltySpot(player.team);
const directGoalAngle = angleBetween(point, goal);
const centralFinishAngle = angleBetween(point, {
x: lerp(point.x, penaltySpot.x, context.insideAttackingBox ? 0.42 : 0.68),
y: lerp(point.y, pitch.width / 2, 0.62),
});
const poacherBoost = label === "9" || roleKey === "striker" || roleKey === "secondStriker" ? 0.22 : 0;
facingAngle = blendAngles(directGoalAngle, centralFinishAngle, 0.58, 0.42);
touchDistance = clamp(
0.46 +
contextProfile.technicalSecurity * 0.34 +
contextProfile.composure * 0.22 +
getAutoPilotRoleStrength(player, "finisher") * 0.28 +
poacherBoost -
pressure * 0.22,
0.42,
context.insideAttackingBox ? 1.28 : 1.62
);
} else {
const sideSign = Math.sign(point.y - pitch.width / 2) || (player.position.y >= pitch.width / 2 ? 1 : -1);
const teamExitAngle = getTeamAttackAngle(player.team);
const wideExitAngle = normalizeAngle(teamExitAngle + sideSign * 0.32);
const safetyAngle = angleBetween(point, {
x: point.x + Math.cos(teamExitAngle) * 10,
y: clamp(point.y + sideSign * 8, 4, pitch.width - 4),
});
const clearanceBias = label === "CB" || label === "GK" || label === "6" ? 0.7 : 0.54;
facingAngle = blendAngles(wideExitAngle, safetyAngle, clearanceBias, 1 - clearanceBias);
touchDistance = clamp(
0.74 +
contextProfile.tacticalDiscipline * 0.28 +
contextProfile.composure * 0.22 +
context.urgency * 0.32 -
pressure * 0.1,
isGoalkeeper(player) ? 0.42 : 0.72,
isGoalkeeper(player) ? 1.05 : 1.95
);
}
const controlPoint = clampToPitch({
x: point.x + Math.cos(facingAngle) * touchDistance,
y: point.y + Math.sin(facingAngle) * touchDistance,
}, 1.4);
clearAutoPilotReceiveMomentum(player.id);
placePlayerWithControlPoint(player, controlPoint, facingAngle);
state.ball.ownerPlayerId = player.id;
keepSecurePossessionOnlyForOwner(player.id);
state.ball.position = cloneVector(getPlayerBallControlPoint(player));
state.ball.target = cloneVector(state.ball.position);
setSecurePossessionAfterControlledTouch(player, state.ball.position, {
quality: clamp(0.62 + contextProfile.technicalSecurity * 0.18 + contextProfile.composure * 0.12 - pressure * 0.16, 0.38, 0.92),
reason: "rebound-control",
minDistanceToExpire: isAttacking ? 3.2 : 4.2,
minTimeToExpire: isAttacking ? 0.62 : 0.9,
});
state.ball.secondBallContext = null;
return true;
}
function keepBallPlayableForNextAction(point, preferredPlayer = null, options = {}) {
const safePoint = clampToPitch(point ?? state.ball.position);
const preferredRadius = options.preferredRadius ?? state.ball.controlRadius + 0.75;
const claimRadius = options.claimRadius ?? state.ball.claimRadius + 0.85;
if (preferredPlayer) {
const preferredControlPoint = getPlayerBallControlPoint(preferredPlayer);
if (distance(preferredControlPoint, safePoint) <= preferredRadius) {
return connectBallToPlayerForNextAction(preferredPlayer, safePoint, 0.52);
}
}
const claim = resolveLooseBallClaim(
safePoint,
claimRadius,
preferredPlayer?.id ?? null,
preferredPlayer ? 0.08 : 0,
{
canClaimPlayer: options.canClaimPlayer,
}
);
if (claim.player) {
return connectBallToPlayerForNextAction(claim.player, safePoint, 0.42);
}
state.ball.ownerPlayerId = null;
clearAutoPilotReceiveMomentum();
clearSecurePossession();
state.ball.position = safePoint;
state.ball.target = cloneVector(safePoint);
return false;
}
function createLooseBallSpill(point, angle, distanceMeters, preferredPlayerId = null, preferredBoost = 0, options = {}) {
const spillPoint = clampToPitch({
x: point.x + Math.cos(angle) * distanceMeters,
y: point.y + Math.sin(angle) * distanceMeters,
});
const claim = resolveLooseBallClaim(
spillPoint,
state.ball.claimRadius + distanceMeters * 0.3,
preferredPlayerId,
preferredBoost,
{
canClaimPlayer: options.canClaimPlayer,
source: options.source,
reboundType: options.reboundType,
attackingTeamId: options.attackingTeamId,
defendingTeamId: options.defendingTeamId,
urgency: options.urgency,
}
);
const winner = claim.player;
const initiator = getActionInitiator();
const preferredPlayer = preferredPlayerId ? getPlayerById(preferredPlayerId) : null;
const attackingTeamId =
options.attackingTeamId ??
initiator?.team ??
preferredPlayer?.team ??
null;
const defendingTeamId =
options.defendingTeamId ??
(attackingTeamId ? getOtherTeamId(attackingTeamId) : null);
state.ball.position = spillPoint;
state.ball.target = cloneVector(spillPoint);
state.ball.height = 0;
state.ball.ownerPlayerId = winner?.id ?? null;
if (winner) {
keepSecurePossessionOnlyForOwner(winner.id);
const reboundContext = getShotReboundClaimContext(spillPoint, options);
const controlledRebound = applyShotReboundControlTouch(winner, spillPoint, reboundContext);
if (!controlledRebound) {
rotatePlayerBodyToward(winner, spillPoint, 0.45);
state.ball.position = cloneVector(getPlayerBallControlPoint(winner));
state.ball.target = cloneVector(state.ball.position);
state.ball.secondBallContext = null;
}
} else {
clearSecurePossession();
state.ball.secondBallContext = {
source: options.source ?? state.ball.profileKey ?? state.ball.actionType ?? "loose-ball",
originPoint: cloneVector(point),
spillPoint: cloneVector(spillPoint),
incomingAngle: angle,
distanceMeters,
preferredPlayerId: preferredPlayerId ?? null,
preferredTeamId: options.preferredTeamId ?? preferredPlayer?.team ?? attackingTeamId,
attackingTeamId,
defendingTeamId,
createdAtActionType: state.ball.actionType,
urgency: clamp(
(options.urgency ?? 0.48) +
(attackingTeamId && isInsideOpponentBox(spillPoint, attackingTeamId) ? 0.18 : 0) +
(distanceMeters >= 4 ? 0.08 : 0),
0.2,
0.92
),
};
}
return {
spillPoint,
winner,
claimType: claim.claimType,
claimGap: claim.gap,
claimTime: claim.timeToBall,
};
}
function resolveShotBlockCommitment(previousPosition) {
if (state.ball.actionType !== "shot") {
return null;
}
const shooter =
getActionInitiator() ??
getPlayerById(state.ball.initiatorPlayerId) ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId);
const shotStart = state.ball.startPosition ?? previousPosition;
const shotTarget = state.ball.target;
if (!shooter || !shotStart || !shotTarget) {
return null;
}
const trackTotal = Math.max(state.ball.trackDistanceTotal || distance(shotStart, shotTarget), 0.01);
const currentProgress = getBallTravelProgress();
const previousProgress = clamp(
projectPointOnSegmentWithRatio(previousPosition, shotStart, shotTarget).ratio,
0,
1
);
const ballSpeed = Math.max(state.ball.currentSpeed || state.ball.launchSpeed || state.ball.speed || 14, 0.1);
const lowShotFactor = clamp(1 - (state.ball.height ?? 0) / 1.45, 0.18, 1);
const shotAngle = angleBetween(shotStart, shotTarget);
const attackingTeamId = shooter.team;
let bestBlock = null;
state.players.forEach((player) => {
if (player.team === attackingTeamId || player.id === shooter.id || isGoalkeeper(player)) {
return;
}
const projection = projectPointOnSegmentWithRatio(player.position, shotStart, shotTarget);
if (projection.ratio <= 0.07 || projection.ratio >= 0.92) {
return;
}
const ownGoalDistance = getDistanceFromOwnGoal(player.team, projection.point);
const boxUrgency =
ownGoalDistance <= 24 || isInsideOwnBox(projection.point, player.team) ? 0.2 : ownGoalDistance <= 34 ? 0.1 : 0;
const readAheadWindow = 0.035 + player.intelligenceProfile.perception * 0.035 + boxUrgency * 0.08;
if (projection.ratio < previousProgress - 0.055 || projection.ratio > currentProgress + readAheadWindow) {
return;
}
const laneGap = distance(player.position, projection.point);
const coverInfluence = getCoverShadowInfluence(player, projection.point, shotStart);
const bodyAlignment = clamp(1 - Math.abs(angleDifference(getPlayerFacingAngle(player), shotAngle + Math.PI)) / Math.PI, 0, 1);
const blockReach = clamp(
(0.72 +
player.intelligenceProfile.perception * 0.34 +
player.intelligenceProfile.decisionSpeed * 0.22 +
player.intelligenceProfile.tacticalDiscipline * 0.2 +
coverInfluence * 0.28 +
bodyAlignment * 0.18) *
lowShotFactor,
0.72,
2.35
);
const remainingDistanceToLane = Math.max((projection.ratio - currentProgress) * trackTotal, 0);
const ballTimeToLane = remainingDistanceToLane / ballSpeed;
const reactionDelay = Math.max(
player.reactionTime *
(0.5 - player.intelligenceProfile.perception * 0.14 - player.intelligenceProfile.decisionSpeed * 0.1),
0.04
);
const moveNeed = Math.max(laneGap - blockReach * 0.72, 0);
const defenderTimeToLane = computeTimeToCoverDistance(player, moveNeed, projection.point) + reactionDelay;
const canReachLane = laneGap <= blockReach || defenderTimeToLane <= ballTimeToLane + 0.16 + boxUrgency * 0.12;
if (!canReachLane) {
return;
}
const proximity = clamp(1 - laneGap / Math.max(blockReach + 0.9, 0.01), 0, 1);
const timing = clamp((ballTimeToLane - defenderTimeToLane + 0.28) / 0.72, 0, 1);
const shotPressure = clamp((ballSpeed - 11) / 15, 0, 1);
const score =
proximity * 0.34 +
timing * 0.2 +
coverInfluence * 0.16 +
bodyAlignment * 0.12 +
player.intelligenceProfile.tacticalDiscipline * 0.12 +
player.intelligenceProfile.composure * 0.08 +
boxUrgency -
shotPressure * 0.06;
const threshold = clamp(0.58 - boxUrgency * 0.32 + (1 - lowShotFactor) * 0.14, 0.42, 0.68);
if (score < threshold) {
return;
}
const candidate = {
player,
point: projection.point,
score,
proximity,
timing,
controlScore: clamp(
proximity * 0.42 +
timing * 0.2 +
player.intelligenceProfile.technicalSecurity * 0.14 +
player.intelligenceProfile.composure * 0.12 +
coverInfluence * 0.12,
0,
1
),
};
if (!bestBlock || candidate.score > bestBlock.score) {
bestBlock = candidate;
}
});
if (!bestBlock) {
return null;
}
rotatePlayerBodyToward(bestBlock.player, bestBlock.point, 0.72);
const ownGoal = getOwnGoalCenter(bestBlock.player.team);
const awayFromGoalAngle = angleBetween(ownGoal, bestBlock.point);
const sideSign = Math.sign(bestBlock.player.position.y - pitch.width / 2) || 1;
const ricochetAngle = normalizeAngle(
awayFromGoalAngle * 0.55 +
(shotAngle + sideSign * lerp(0.42, 1.12, 1 - bestBlock.controlScore)) * 0.45
);
const spillDistance = clamp(
1.2 + clamp((ballSpeed - 10) / 16, 0, 1) * 4.2 + (1 - bestBlock.controlScore) * 1.2,
1.1,
6.9
);
const spill = createLooseBallSpill(
bestBlock.point,
ricochetAngle,
spillDistance,
bestBlock.player.id,
0.08 + bestBlock.controlScore * 0.06,
{
source: "shot-body-block",
reboundType: "shot-block",
attackingTeamId,
defendingTeamId: bestBlock.player.team,
urgency: clamp(0.58 + bestBlock.score * 0.28, 0.58, 0.9),
}
);
if (spill.winner && spill.winner.team !== attackingTeamId) {
setSecurePossessionAfterBallWin(spill.winner, shooter, spill.spillPoint, "interception");
}
return {
kind: "block",
player: bestBlock.player,
point: spill.spillPoint,
winner: spill.winner,
};
}
function resolvePassTransitInterception(previousPosition, actionType) {
if (actionType !== "pass" && actionType !== "shot") {
return null;
}
const initiator = getActionInitiator();
const passTeamId =
actionType === "pass"
? initiator?.team ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId)?.team ??
getPlayerById(state.ball.initiatorPlayerId)?.team ??
null
: null;
const flightControlFactor = getBallFlightControlFactor(actionType);
if (actionType === "pass" && flightControlFactor <= 0.06) {
return null;
}
const receiver = actionType === "pass" && state.ball.receiverPlayerId
? getPlayerById(state.ball.receiverPlayerId)
: null;
const receiverControlPoint = receiver ? getPlayerBallControlPoint(receiver) : null;
const passProgress = getBallTravelProgress();
const candidates = [];
state.players.forEach((player) => {
if (player.id === initiator?.id) {
return;
}
if (actionType === "pass" && passTeamId && player.team === passTeamId) {
return;
}
const lanePoint = projectPointOnSegment(player.position, previousPosition, state.ball.position);
const isPassToFeet = actionType === "pass" && state.ball.targetKind === "to-feet";
if (
isPassToFeet &&
receiverControlPoint &&
passProgress >= 0.7 &&
distance(lanePoint, receiverControlPoint) <= state.ball.controlRadius + 0.95
) {
return;
}
const gap = distance(player.position, lanePoint);
const interceptRadius = clamp(
(0.55 +
player.intelligenceProfile.perception * 0.55 +
player.intelligenceProfile.technicalSecurity * 0.35 +
getCoverShadowInfluence(player, lanePoint, previousPosition) * 0.24) *
(actionType === "shot"
? lerp(0.74, 1, flightControlFactor)
: isPassToFeet
? lerp(0.16, 0.86, flightControlFactor)
: lerp(0.22, 1, flightControlFactor)),
0.75,
isPassToFeet ? 1.38 : 1.65
);
const secureContext = getSecurePossessionContext(initiator, player);
const secureProtection = secureContext?.protectionRatio ?? 0;
const adjustedInterceptRadius = interceptRadius * (1 - secureProtection * 0.32);
if (gap > adjustedInterceptRadius) {
return;
}
const controlScore = clamp(
getBallContestControlScore(player, lanePoint, actionType) - secureProtection * 0.2,
0,
1
);
const proximity = clamp(1 - gap / adjustedInterceptRadius, 0, 1);
const coverInfluence = getCoverShadowInfluence(player, lanePoint, previousPosition);
const score =
controlScore * 0.58 +
player.intelligenceProfile.decisionSpeed * 0.18 +
player.intelligenceProfile.perception * 0.12 +
proximity * 0.24 +
coverInfluence * 0.14 +
flightControlFactor * 0.1 -
secureProtection * 0.28;
candidates.push({
player,
lanePoint,
gap,
interceptRadius: adjustedInterceptRadius,
controlScore,
score,
secureProtection,
});
});
if (!candidates.length) {
return null;
}
candidates.sort((a, b) => b.score - a.score);
const best = candidates[0];
const isOpponent = best.player.team !== initiator?.team;
const isPassToFeet = actionType === "pass" && state.ball.targetKind === "to-feet";
if (actionType === "pass") {
const canAffectPass =
best.gap <= (isPassToFeet ? 0.52 : 0.95) ||
(best.score >= (isPassToFeet ? 0.9 : 0.78) && best.controlScore >= (isPassToFeet ? 0.68 : 0.62));
if (!canAffectPass) {
return null;
}
}
if (best.controlScore >= (actionType === "pass" ? (isPassToFeet ? 0.72 : 0.65) : 0.57)) {
rotatePlayerBodyToward(best.player, best.lanePoint, 0.45);
state.ball.ownerPlayerId = best.player.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(best.player));
state.ball.target = cloneVector(state.ball.position);
if (isOpponent) {
setSecurePossessionAfterBallWin(best.player, initiator, best.lanePoint, "interception");
} else {
keepSecurePossessionOnlyForOwner(best.player.id);
}
return {
kind: isOpponent ? "interception" : "early-claim",
player: best.player,
point: best.lanePoint,
};
}
if (actionType === "pass" && (best.score < (isPassToFeet ? 0.84 : 0.76) || best.gap > (isPassToFeet ? 0.48 : 0.82))) {
return null;
}
const deflectAngle =
normalizeAngle(
angleBetween(previousPosition, state.ball.position) * 0.55 +
getPlayerFacingAngle(best.player) * 0.45
) + (isOpponent ? 0.18 : -0.12);
const shotAttackingTeamId =
actionType === "shot"
? initiator?.team ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId)?.team ??
getPlayerById(state.ball.initiatorPlayerId)?.team ??
getPlannedPossessionTeamId() ??
null
: null;
const deflection = createLooseBallSpill(
best.lanePoint,
deflectAngle,
clamp((1 - best.controlScore) * 3.4, 0.9, 3.8),
best.player.id,
0.04,
actionType === "shot"
? {
source: "shot-block-deflection",
reboundType: "shot-block",
attackingTeamId: shotAttackingTeamId,
defendingTeamId: shotAttackingTeamId ? getOtherTeamId(shotAttackingTeamId) : null,
urgency: clamp(best.score + (1 - best.controlScore) * 0.2, 0.48, 0.88),
}
: {}
);
if (isOpponent && deflection.winner?.id === best.player.id) {
setSecurePossessionAfterBallWin(best.player, initiator, deflection.spillPoint, "interception");
}
return {
kind: "deflection",
player: best.player,
point: deflection.spillPoint,
winner: deflection.winner,
};
}
function resolveAerialArrivalContest(actionType, receiver = null) {
if (actionType !== "pass" && actionType !== "shot") {
return false;
}
if (!isAerialFlightStyle(state.ball.flightStyle) && state.ball.height <= state.ball.controlHeightThreshold * 0.65) {
return false;
}
const contestPoint = cloneVector(state.ball.position);
const incomingPoint = cloneVector(state.ball.startPosition);
const incomingAngle = angleBetween(incomingPoint, contestPoint);
const firstContactContext = getAerialFirstContactContext(actionType, contestPoint, incomingPoint, receiver);
const contestRadius = clamp(
state.ball.controlRadius + 1.05 + state.ball.height * 0.28,
1.9,
firstContactContext.crossLike || firstContactContext.secondBallZone ? 4.35 : 3.7
);
const candidates = state.players
.map((player) => ({
player,
gap: distance(player.position, contestPoint),
}))
.filter((entry) => entry.gap <= contestRadius)
.map((entry) => ({
...entry,
aerialScore: getAerialFirstContactScore(
entry.player,
contestPoint,
incomingPoint,
firstContactContext,
receiver?.id ?? null,
receiver ? 0.05 : 0
),
}))
.sort((a, b) => b.aerialScore - a.aerialScore);
if (!candidates.length) {
return false;
}
const winner = candidates[0];
const challenger = candidates[1] ?? null;
const winnerControlScore = getAerialControlScore(winner.player, incomingPoint);
const margin = winner.aerialScore - (challenger?.aerialScore ?? 0);
const winnerIsDefending = winner.player.team === firstContactContext.defendingTeamId;
const winnerIsAttacking = winner.player.team === firstContactContext.attackingTeamId;
const winnerInOwnBox = isInsideOwnBox(contestPoint, winner.player.team);
if (
isGoalkeeper(winner.player) &&
winnerInOwnBox &&
winnerControlScore >= 0.5 &&
margin >= -0.03
) {
connectBallToPlayerForNextAction(winner.player, contestPoint, 0.82);
keepSecurePossessionOnlyForOwner(winner.player.id);
return true;
}
if (challenger && margin <= (firstContactContext.crossLike ? 0.1 : 0.07)) {
const looseAngle = blendAngles(
getPlayerFacingAngle(winner.player),
incomingAngle,
0.58,
0.42
);
createLooseBallSpill(
contestPoint,
looseAngle,
clamp(1.45 + state.ball.height * 0.48 + (firstContactContext.secondBallZone ? 0.55 : 0), 1.1, 4.4),
winner.player.id,
0.02
);
return true;
}
if (
winnerIsDefending &&
(firstContactContext.crossLike || firstContactContext.secondBallZone || firstContactContext.inDefendingBox) &&
(state.ball.height >= state.ball.controlHeightThreshold * 0.9 || margin >= 0.04)
) {
const clearanceAngle = getAerialDefensiveClearanceAngle(winner.player, contestPoint, incomingAngle);
createLooseBallSpill(
contestPoint,
clearanceAngle,
clamp(4.8 + getAerialPresence(winner.player) * 4.4 + winnerControlScore * 2.2, 4.2, 11.5),
winner.player.id,
0.03
);
return true;
}
if (
winnerIsAttacking &&
firstContactContext.crossLike &&
firstContactContext.inAttackingBox &&
state.ball.height >= state.ball.controlHeightThreshold * 0.8
) {
const knockdownAngle = getAerialAttackingKnockdownAngle(winner.player, contestPoint, firstContactContext);
createLooseBallSpill(
contestPoint,
knockdownAngle,
clamp(1.8 + winnerControlScore * 3.4 + Math.max(margin, 0) * 5.2, 1.5, 6.4),
winner.player.id,
0.08
);
return true;
}
const isReceiverTeamWinner = receiver ? winner.player.team === receiver.team : true;
if (winnerControlScore >= 0.7 && margin >= 0.04 && state.ball.height <= state.ball.controlHeightThreshold * 1.6) {
if (receiver && winner.player.id === receiver.id) {
applyControlledFirstTouch(
winner.player,
incomingPoint,
winnerControlScore,
state.ball.firstTouchMode
);
} else {
rotatePlayerBodyToward(winner.player, receiver ? state.ball.target : contestPoint, 0.42);
state.ball.ownerPlayerId = winner.player.id;
keepSecurePossessionOnlyForOwner(winner.player.id);
state.ball.position = cloneVector(getPlayerBallControlPoint(winner.player));
state.ball.target = cloneVector(state.ball.position);
}
return true;
}
const directionalAngle = isReceiverTeamWinner
? blendAngles(getTeamAttackAngle(winner.player.team), incomingAngle, 0.72, 0.28)
: normalizeAngle(
getTeamAttackAngle(winner.player.team) +
(contestPoint.y <= pitch.width / 2 ? 0.26 : -0.26)
);
const spillDistance = clamp(
2.2 + (winnerControlScore - 0.4) * 2.4 + state.ball.height * 0.28,
1.8,
isReceiverTeamWinner ? 5.4 : 7.2
);
createLooseBallSpill(
contestPoint,
directionalAngle,
spillDistance,
winner.player.id,
0.05
);
return true;
}
function shouldTriggerLandingBounce(actionType, reachedReceiverControlZone) {
if (actionType !== "pass" && actionType !== "shot") {
return false;
}
if (state.ball.bounceCount > 0) {
return false;
}
if (reachedReceiverControlZone && state.ball.targetKind === "to-feet") {
return false;
}
if (state.ball.trackDistanceTotal < 14) {
return false;
}
if (isAerialFlightStyle(state.ball.flightStyle)) {
return true;
}
return actionType === "shot" || state.ball.targetKind === "into-space";
}
function startLandingBounceSkid(previousPosition) {
const landingPoint = cloneVector(state.ball.position);
const incomingAngle =
distance(previousPosition, landingPoint) > 0.01
? angleBetween(previousPosition, landingPoint)
: angleBetween(state.ball.startPosition, state.ball.target);
const surfacePreset = getPitchSurfacePreset();
const weatherPreset = getWeatherPreset();
const skidFactor = surfacePreset.groundRollFactor * weatherPreset.ballSkidFactor;
const baseCarry =
Math.max(state.ball.currentSpeed, state.ball.finalSpeed, 5.2) *
(0.24 + skidFactor * 0.11);
const bounceDistance = clamp(
baseCarry + (isAerialFlightStyle(state.ball.flightStyle) ? 0.85 : 0.35),
1.3,
isAerialFlightStyle(state.ball.flightStyle) ? 7.4 : 4.9
);
const bounceTarget = clampToPitch({
x: landingPoint.x + Math.cos(incomingAngle) * bounceDistance,
y: landingPoint.y + Math.sin(incomingAngle) * bounceDistance,
});
const bounceTravelDistance = distance(landingPoint, bounceTarget);
if (bounceTravelDistance <= 0.25) {
return false;
}
const bounceProfile = {
key: `${state.ball.profileKey ?? "ball"}-bounce`,
label: `${state.ball.profileLabel ?? "Ball"} Bounce`,
source: state.ball.profileMode,
targetKind: "into-space",
averageSpeed: clamp(
Math.max(state.ball.finalSpeed, state.ball.currentSpeed * 0.72) * weatherPreset.ballRollFactor,
4.8,
11.5
),
launchMultiplier: isAerialFlightStyle(state.ball.flightStyle) ? 1.14 : 1.08,
rollFloor: clamp(0.9 * skidFactor, 0.8, 2.2),
flightStyle: "driven",
peakHeight: clamp(
state.ball.height * 0.3 + (isAerialFlightStyle(state.ball.flightStyle) ? 0.34 : 0.16),
0.12,
0.52
),
controlHeightThreshold: 0.18,
landingPhaseStart: 0.4,
curveAmount: (state.ball.curveAmount ?? 0) * 0.18,
spinRate: (state.ball.spinRate ?? 0) * 0.66,
};
state.ball.position = landingPoint;
state.ball.startPosition = cloneVector(landingPoint);
state.ball.target = bounceTarget;
state.ball.ownerPlayerId = null;
clearSecurePossession();
state.ball.bounceCount += 1;
configureBallTravelProfile(
state.ball.actionType,
bounceTravelDistance,
bounceProfile.averageSpeed,
bounceProfile
);
state.ball.inTransit = true;
return true;
}
function settleBallForNextAction(actionType) {
const receiver = state.ball.receiverPlayerId ? getPlayerById(state.ball.receiverPlayerId) : null;
const passReceiverClaimFilter =
actionType === "pass" && receiver
? (player) => player.id === receiver.id || player.team !== receiver.team
: null;
if (resolveAerialArrivalContest(actionType, receiver)) {
if (!state.ball.ownerPlayerId) {
keepBallPlayableForNextAction(state.ball.position, receiver, {
preferredRadius: state.ball.controlRadius + 1,
claimRadius: state.ball.claimRadius + 1.1,
canClaimPlayer: passReceiverClaimFilter,
});
}
return;
}
if (actionType === "pass" && receiver && state.restartPhase?.type !== "throwIn") {
const receiverControlPoint = getPlayerBallControlPoint(receiver);
const receiverContext = getPlayerDecisionContext(receiver);
const receiverGap = distance(receiverControlPoint, state.ball.position);
const cleanControlScore =
state.ball.executionQuality * 0.46 +
state.ball.laneClarity * 0.24 +
receiverContext.profile.technicalSecurity * 0.16 +
receiverContext.profile.pressResistance * 0.14;
const receiveOrientationScore = getReceiveOrientationScore(receiver, state.ball.startPosition);
const receiveFootScore = getReceiveFootUsageScore(receiver, state.ball.startPosition);
const firstTouchQuality = clamp(
receiverContext.profile.technicalSecurity * 0.34 +
receiverContext.profile.pressResistance * 0.22 +
receiverContext.profile.composure * 0.16 +
receiverContext.profile.decisionQuality * 0.14 +
receiveOrientationScore * 0.1 +
receiveFootScore * 0.08 -
receiverContext.pressure * 0.07,
state.ball.targetKind === "to-feet" ? 0.52 : 0.42,
0.98
);
const isPassToFeet = state.ball.targetKind === "to-feet";
const controlThreshold = isPassToFeet ? 0.4 : 0.58;
const nearestOpponentGap = getNearestOpponentGap(receiver, receiverControlPoint);
const isReceiverPressed =
Number.isFinite(nearestOpponentGap) &&
(nearestOpponentGap <= 2.75 || receiverContext.pressure >= 0.52);
const isReceiverUnderDuelPressure =
Number.isFinite(nearestOpponentGap) &&
(nearestOpponentGap <= 1.65 || receiverContext.pressure >= 0.68);
if (
isPassToFeet &&
!isReceiverPressed &&
receiverGap <= state.ball.controlRadius + 2.2 &&
state.ball.executionQuality >= 0.44
) {
const activeFirstTouchMode = shouldUseAutoPilotActiveFirstTouch(receiver, firstTouchQuality)
? state.draftStep?.firstTouchMode ?? state.ball.firstTouchMode
: "kill";
applyControlledFirstTouch(
receiver,
state.ball.startPosition,
Math.max(firstTouchQuality, 0.74),
activeFirstTouchMode
);
return;
}
const duelRadius = isPassToFeet
? clamp(state.ball.controlRadius - 0.05, 1.1, 1.62)
: state.ball.controlRadius + 1.05;
const duelOpponents = state.players
.filter((player) => player.team !== receiver.team)
.map((player) => ({ player, gap: distance(player.position, receiverControlPoint) }))
.filter((entry) => entry.gap <= duelRadius && (!isPassToFeet || isReceiverUnderDuelPressure))
.sort((a, b) => a.gap - b.gap);
const primaryDuel = duelOpponents[0] ?? null;
const receiverDuelScore =
getBallDuelScore(receiver, receiverControlPoint) +
firstTouchQuality * 0.18 +
state.ball.executionQuality * 0.08;
if (receiverGap <= state.ball.controlRadius && cleanControlScore * lerp(0.94, 1.06, receiveFootScore) >= controlThreshold) {
if (primaryDuel) {
const defenderDuelScore =
getBallDuelScore(primaryDuel.player, receiverControlPoint) +
(primaryDuel.player.intelligenceProfile.decisionSpeed * 0.08);
const decisiveReceiverPressure = primaryDuel.gap <= (isPassToFeet ? 1.18 : 1.55);
if (
decisiveReceiverPressure &&
defenderDuelScore > receiverDuelScore + (isPassToFeet ? 0.3 : 0.12)
) {
connectBallToPlayerForNextAction(primaryDuel.player, receiverControlPoint, 0.45);
setSecurePossessionAfterBallWin(primaryDuel.player, receiver, receiverControlPoint, "tackle");
return;
}
if (isPassToFeet && receiverDuelScore >= defenderDuelScore - 0.12) {
applyControlledFirstTouch(receiver, state.ball.startPosition, firstTouchQuality, "kill");
return;
}
if (Math.abs(defenderDuelScore - receiverDuelScore) <= (isPassToFeet ? 0.02 : 0.07)) {
const duelAngle = normalizeAngle(
angleBetween(receiver.position, receiverControlPoint) * 0.5 +
angleBetween(primaryDuel.player.position, receiverControlPoint) * 0.5
);
const spill = createLooseBallSpill(
receiverControlPoint,
duelAngle,
clamp(1.1 + primaryDuel.gap * 0.45, 1, 3.2),
receiver.id,
0.03,
{
canClaimPlayer: passReceiverClaimFilter,
}
);
if (!spill.winner) {
keepBallPlayableForNextAction(spill.spillPoint, receiver, {
preferredRadius: isPassToFeet ? state.ball.controlRadius + 1.15 : state.ball.controlRadius + 0.55,
claimRadius: state.ball.claimRadius + 0.75,
canClaimPlayer: passReceiverClaimFilter,
});
}
return;
}
}
const shouldSecureToFeetPass = isPassToFeet && firstTouchQuality >= 0.3;
if (firstTouchQuality >= 0.45 || shouldSecureToFeetPass) {
const appliedFirstTouch = applyControlledFirstTouch(
receiver,
state.ball.startPosition,
firstTouchQuality,
firstTouchQuality < 0.56 && state.ball.firstTouchMode === "auto"
? "kill"
: state.ball.firstTouchMode
);
if (appliedFirstTouch && appliedFirstTouch !== "kill") {
logEvent(
`${receiver.shortLabel} ${receiver.role} takes the first touch ${getFirstTouchModeLabel(appliedFirstTouch).toLowerCase()}.`
);
}
return;
}
const incomingAngle = angleBetween(state.ball.startPosition, receiverControlPoint);
const spillAngle = normalizeAngle(
incomingAngle * 0.45 + getPlayerFacingAngle(receiver) * 0.55
);
const spillDistance = clamp(
(1 - firstTouchQuality) * 4.2 + receiverContext.pressure * 1.25,
0.9,
4.8
);
const spillPoint = clampToPitch({
x: receiverControlPoint.x + Math.cos(spillAngle) * spillDistance,
y: receiverControlPoint.y + Math.sin(spillAngle) * spillDistance,
});
const spill = createLooseBallSpill(
spillPoint,
spillAngle,
0,
receiver.id,
0.02,
{
canClaimPlayer: passReceiverClaimFilter,
}
);
if (!spill.winner) {
keepBallPlayableForNextAction(spillPoint, receiver, {
preferredRadius: state.ball.controlRadius + 0.65,
claimRadius: state.ball.claimRadius + 0.75,
canClaimPlayer: passReceiverClaimFilter,
});
}
return;
}
if (isPassToFeet) {
if (!isReceiverPressed) {
const activeFirstTouchMode = shouldUseAutoPilotActiveFirstTouch(receiver, firstTouchQuality)
? state.draftStep?.firstTouchMode ?? state.ball.firstTouchMode
: "kill";
applyControlledFirstTouch(
receiver,
state.ball.startPosition,
Math.max(firstTouchQuality, 0.68),
activeFirstTouchMode
);
return;
}
keepBallPlayableForNextAction(state.ball.position, receiver, {
preferredRadius: state.ball.controlRadius + 1.45,
claimRadius: state.ball.claimRadius + 0.8,
canClaimPlayer: passReceiverClaimFilter,
});
return;
}
}
const spaceRunner =
actionType === "pass" && !receiver
? getPlayerById(state.draftStep?.principleRunnerPlayerId)
: null;
const spaceClaimFilter = spaceRunner
? (player) => player.id === spaceRunner.id || player.team !== spaceRunner.team
: passReceiverClaimFilter;
const winner = resolveLooseBallClaim(
state.ball.target,
state.ball.claimRadius,
receiver?.id ?? spaceRunner?.id ?? null,
receiver ? 0.05 : spaceRunner ? 0.14 : 0,
{
canClaimPlayer: spaceClaimFilter,
}
).player;
if (winner) {
connectBallToPlayerForNextAction(winner, state.ball.target, 0.4);
return;
}
keepBallPlayableForNextAction(state.ball.target, receiver ?? spaceRunner, {
preferredRadius: receiver || spaceRunner ? state.ball.controlRadius + 0.9 : state.ball.controlRadius + 0.3,
claimRadius: state.ball.claimRadius + 0.65,
canClaimPlayer: spaceClaimFilter,
});
}

  return {
    applyBallExecutionProfile,
    getLooseBallClaimScore,
    getShotReboundClaimContext,
    getShotReboundClaimAdjustment,
    getBallContestControlScore,
    getAerialPresence,
    getAerialContestScore,
    getAerialFirstContactContext,
    getAerialFirstContactScore,
    getAerialDefensiveClearanceAngle,
    getAerialAttackingKnockdownAngle,
    getAerialControlScore,
    getBallDuelScore,
    clearSecurePossession,
    getBallWinEscapeTouch,
    applyBallWinEscapeTouch,
    setSecurePossessionAfterBallWin,
    getPossessionShieldOpponents,
    setSecurePossessionAfterControlledTouch,
    keepSecurePossessionOnlyForOwner,
    getSecurePossessionContext,
    getDribbleTackleCandidate,
    getDribbleFoulCandidate,
    completeDribbleFoulRestart,
    resolveDribbleDefensiveChallenge,
    resolveLooseBallClaim,
    connectBallToPlayerForNextAction,
    applyShotReboundControlTouch,
    keepBallPlayableForNextAction,
    createLooseBallSpill,
    resolveShotBlockCommitment,
    resolvePassTransitInterception,
    resolveAerialArrivalContest,
    shouldTriggerLandingBounce,
    startLandingBounceSkid,
    settleBallForNextAction,
  };
}
