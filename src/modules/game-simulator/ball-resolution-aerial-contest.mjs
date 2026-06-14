export function createGameSimulatorBallResolutionAerialContest(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    blendAngles,
    clamp,
    computeTimeToCoverDistance,
    distance,
    getActionInitiator,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOrientationMovementProfile,
    getOtherTeamId,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getReceiveFootUsageScore,
    getReceiveOrientationScore,
    getTeamAttackAngle,
    isGoalkeeper,
    isInsideOpponentBox,
    isInsideOwnBox,
    lerp,
    normalizeAngle,
    pitch,
    state,
    teams,
  } = deps;

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

  return {
    getAerialPresence,
    getAerialContestScore,
    getAerialFirstContactContext,
    getAerialFirstContactScore,
    getAerialDefensiveClearanceAngle,
    getAerialAttackingKnockdownAngle,
    getAerialControlScore,
  };
}
