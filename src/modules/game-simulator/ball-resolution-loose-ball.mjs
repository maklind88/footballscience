export function createGameSimulatorBallResolutionLooseBall(deps = {}) {
  const {
    angleBetween,
    blendAngles,
    clamp,
    clampToPitch,
    clearAutoPilotReceiveMomentum,
    clearSecurePossession,
    cloneVector,
    computeTimeToCoverDistance,
    distance,
    getActionInitiator,
    getAutoPilotRoleStrength,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOffensiveRoleKey,
    getOrientationMovementProfile,
    getOtherTeamId,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getShotReboundClaimAdjustment,
    getShotReboundClaimContext,
    getTeamAttackAngle,
    isGoalkeeper,
    isInsideOpponentBox,
    keepSecurePossessionOnlyForOwner,
    lerp,
    normalizeAngle,
    pitch,
    placePlayerWithControlPoint,
    rotatePlayerBodyToward,
    setSecurePossessionAfterControlledTouch,
    state,
    teams,
  } = deps;

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

  return {
    getLooseBallClaimScore,
    getBallContestControlScore,
    getBallDuelScore,
    resolveLooseBallClaim,
    connectBallToPlayerForNextAction,
    applyShotReboundControlTouch,
    keepBallPlayableForNextAction,
    createLooseBallSpill,
  };
}
