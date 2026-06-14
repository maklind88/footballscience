export function createGameSimulatorAutopilotShotCandidates(deps = {}) {
  const {
    clamp,
    distance,
    getAttackingDepth,
    getAutoPilotCarryEndProductContext,
    getAutoPilotRoleStrength,
    getAutoPilotShotTarget,
    getOpponentGoalCenter,
    getPlayerBallControlPoint,
    getPlayerPressureLoad,
    getRecentPossessionSteps,
    getShotWindowProfile,
    getState,
    isInsideOpponentBox,
    pitch,
  } = deps;

function buildAutoPilotShotCandidate(carrier, startPoint, profile) {
const state = getState();
const teamId = carrier.team;
const goalTarget = getAutoPilotShotTarget(teamId, carrier);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const attackingDepth = getAttackingDepth(startPoint, teamId);
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const pressure = getPlayerPressureLoad(carrier, getPlayerBallControlPoint(carrier));
const finisherStrength = getAutoPilotRoleStrength(carrier, "finisher");
const shotWindow = getShotWindowProfile(carrier, startPoint, goalTarget);
const carryEndProduct = getAutoPilotCarryEndProductContext(carrier, startPoint, profile);
const laneClarity = shotWindow.laneClarity;
const angleQuality = shotWindow.angleQuality;
const blockRisk = shotWindow.blockRisk;
const insideBox = isInsideOpponentBox(startPoint, teamId);
const centralEdgeShot =
goalDistance <= 30.5 &&
centrality >= 0.42 &&
laneClarity >= 0.38 &&
angleQuality >= 0.22 &&
blockRisk <= 0.74 &&
pressure <= 0.78;
const finalThirdShot =
goalDistance <= 34.5 &&
attackingDepth >= 67 &&
centrality >= 0.18 &&
angleQuality >= 0.18 &&
blockRisk <= 0.78 &&
pressure <= 0.82;
const finisherRangeShot =
goalDistance <= 37 &&
attackingDepth >= 69 &&
centrality >= 0.22 &&
laneClarity >= 0.42 &&
angleQuality >= 0.2 &&
blockRisk <= 0.66 &&
pressure <= 0.72 &&
finisherStrength >= 0.76;
const nearGoalThreat =
goalDistance <= 30 &&
centrality >= 0.16 &&
angleQuality >= 0.16 &&
blockRisk <= 0.82 &&
pressure <= 0.84;
const clearBreakawayShot =
goalDistance <= 35 &&
attackingDepth >= 66 &&
laneClarity >= 0.34 &&
angleQuality >= 0.2 &&
blockRisk <= 0.74 &&
pressure <= 0.62 &&
(centrality >= 0.28 || finisherStrength >= 0.78);
const wideBoxAngle =
attackingDepth >= 78 &&
goalDistance <= 29 &&
centrality >= 0.1 &&
angleQuality >= 0.14 &&
pressure <= 0.82;
const finalThirdCarryShot =
attackingDepth >= 74 &&
goalDistance <= 36 &&
centrality >= 0.1 &&
angleQuality >= 0.15 &&
blockRisk <= 0.82 &&
pressure <= 0.86;
const carryEndProductShot =
carryEndProduct.active &&
carryEndProduct.finishWindow &&
goalDistance <= 36 &&
attackingDepth >= 66 &&
laneClarity >= 0.32 &&
angleQuality >= 0.14 &&
blockRisk <= 0.84 &&
pressure <= 0.84;
const runwayExitShot =
carryEndProduct.active &&
carryEndProduct.wasRunwayCarry &&
goalDistance <= 39 &&
attackingDepth >= 63 &&
laneClarity >= 0.3 &&
angleQuality >= 0.12 &&
blockRisk <= 0.88 &&
pressure <= 0.86;
const openShotWindow =
(insideBox && shotWindow.quality >= 0.22) ||
centralEdgeShot ||
finalThirdShot ||
finisherRangeShot ||
nearGoalThreat ||
clearBreakawayShot ||
wideBoxAngle ||
finalThirdCarryShot ||
carryEndProductShot ||
runwayExitShot ||
goalDistance <= 25.5 ||
(goalDistance <= 31 &&
attackingDepth >= 72 &&
laneClarity >= 0.58 &&
angleQuality >= 0.2 &&
blockRisk <= 0.68 &&
pressure <= 0.55 &&
finisherStrength >= 0.64);
if (!openShotWindow && goalDistance > 38 && !(finisherStrength >= 0.9 && attackingDepth >= 72)) {
return null;
}
const recentTeamSteps = getRecentPossessionSteps(teamId, 4);
const recentTeamShots = recentTeamSteps.filter((step) => step.actionType === "shot").length;
const lastTeamStep = recentTeamSteps[0] ?? null;
if (
!insideBox &&
goalDistance > 24 &&
(lastTeamStep?.actionType === "shot" || recentTeamShots >= 2)
) {
return null;
}
const distanceScore = clamp(1 - (goalDistance - 10) / 28, 0, 1);
const score =
1.18 +
distanceScore * 1.78 +
centrality * 0.82 +
finisherStrength * 1.34 +
(profile?.shootBias ?? 0.48) * 1.1 +
laneClarity * 0.85 -
blockRisk * 0.78 +
angleQuality * 0.62 +
shotWindow.goalkeeperOpenness * 0.48 +
shotWindow.quality * 0.66 -
pressure * 0.65 -
(attackingDepth < 62 ? 0.92 : attackingDepth < 68 ? 0.36 : 0) +
(insideBox ? 1.05 : 0) +
(centralEdgeShot ? 0.62 : 0) +
(finalThirdShot ? 0.42 : 0) +
(finisherRangeShot ? 0.36 : 0) +
(nearGoalThreat ? 0.7 : 0) +
(clearBreakawayShot ? 0.85 : 0) +
(wideBoxAngle ? 0.55 : 0) +
(finalThirdCarryShot ? 0.45 : 0) +
(carryEndProductShot ? 0.6 + carryEndProduct.endProductUrgency * 0.28 : 0) +
(runwayExitShot ? 0.62 + carryEndProduct.endProductUrgency * 0.32 : 0) +
(openShotWindow ? 0.42 : 0);
if (score < (openShotWindow ? 1.45 : 2.0)) {
return null;
}
return {
actionType: "shot",
target: goalTarget,
receiverPlayerId: null,
score,
goalDistance,
laneClarity,
blockRisk,
angleQuality,
goalkeeperOpenness: shotWindow.goalkeeperOpenness,
shotQuality: shotWindow.quality,
insideBox,
mustShoot:
(insideBox && shotWindow.quality >= 0.28) ||
nearGoalThreat ||
clearBreakawayShot ||
wideBoxAngle ||
(finalThirdCarryShot && (finisherStrength >= 0.62 || laneClarity >= 0.35)) ||
(carryEndProductShot && (shotWindow.quality >= 0.22 || finisherStrength >= 0.64 || goalDistance <= 29)) ||
(runwayExitShot && (shotWindow.quality >= 0.18 || finisherStrength >= 0.62 || goalDistance <= 31)) ||
(centralEdgeShot && goalDistance <= 31) ||
(finisherRangeShot && finisherStrength >= 0.84),
label: "shot",
reason: insideBox
? "box chance"
: runwayExitShot
? "runway carry has created a shooting window"
: carryEndProductShot
? "end product after carrying the ball"
: clearBreakawayShot
? "clear route to goal"
: centralEdgeShot || nearGoalThreat || finalThirdCarryShot
? "central shooting lane"
: wideBoxAngle
? "shooting angle in the box"
: "goal threat",
};
}

  return {
    buildAutoPilotShotCandidate,
  };
}
