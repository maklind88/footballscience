export function createGameSimulatorBallResolutionShotRebounds(deps = {}) {
  const {
    clamp,
    distance,
    getActionInitiator,
    getOrientationMovementProfile,
    getOtherTeamId,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getTeamAttackAngle,
    isGoalkeeper,
    isInsideOpponentBox,
    isInsideOwnBox,
    pitch,
    state,
  } = deps;

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

  return {
    getShotReboundClaimContext,
    getShotReboundClaimAdjustment,
  };
}
