export function createGameSimulatorAutopilotChanceDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAutoPilotFlowContext,
    getAutoPilotShotTarget,
    getNearestOpponentGap,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getRecentPossessionSteps,
    getShotWindowProfile,
    isPlayerFacingForward,
    isSupportRole,
    isWideChannel,
    pitch,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotEndProductUrgencyContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const threat = getPitchThreatProfile(startPoint, teamId);
const gameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const pressureType =
pressure >= 0.68 || nearestGap <= 2.25
? "direct"
: pressure >= 0.42 || nearestGap <= 4.7
? "indirect"
: "free";
const depth = getAttackingDepth(startPoint, teamId);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.25);
const recent = getRecentPossessionSteps(teamId, 5);
const recentFinalThirdActions = recent.filter((step) => {
const target = step.target ?? step.afterSnapshot?.ball?.position ?? null;
return target && getAttackingDepth(target, teamId) >= 66;
}).length;
const recentShots = recent.filter((step) => step.actionType === "shot").length;
const chanceState =
threat.box >= 0.14 ||
threat.cutbackZone >= 0.22 ||
threat.centralPocket >= 0.24 ||
threat.betweenLines >= 0.42 ||
gameSpace.key === "space3" ||
depth >= 66;
const active =
chanceState &&
depth >= 54 &&
pressureType !== "direct" &&
goalDistance <= 44;
const urgency = clamp(
threat.box * 0.42 +
threat.cutbackZone * 0.3 +
threat.centralPocket * 0.28 +
threat.betweenLines * 0.18 +
threat.halfSpace * 0.14 +
clamp((depth - 58) / 30, 0, 1) * 0.24 +
clamp((44 - goalDistance) / 24, 0, 1) * 0.22 +
(facingForward ? 0.16 : 0) +
(pressureType === "free" ? 0.12 : 0) +
Math.min(recentFinalThirdActions, 3) * 0.06 +
(recentShots === 0 && recentFinalThirdActions >= 2 ? 0.18 : 0) +
(profile.shootBias ?? 0.48) * 0.12 -
pressure * 0.18,
0,
1.35
);
return {
active,
teamId,
threat,
gameSpace,
pressure,
nearestGap,
pressureType,
depth,
goalDistance,
centrality,
facingForward,
recentFinalThirdActions,
recentShots,
urgency,
};
}
function getAutoPilotEndProductUrgencyAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotEndProductUrgencyContext(carrier, startPoint, profile);
if (!context.active || context.urgency <= 0.2) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const targetGoalDistance = distance(target, getOpponentGoalCenter(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: candidate.laneClarity ?? 0.62;
const highValueTarget =
targetThreat.box >= 0.24 ||
targetThreat.cutbackZone >= 0.28 ||
targetThreat.centralPocket >= 0.34 ||
candidate.isBoxPass ||
candidate.mustShoot;
const routeToGoal =
targetGoalDistance <= context.goalDistance - 3.2 ||
forwardGain >= 4 ||
highValueTarget;
const lowValueReset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
forwardGain < 1.8 &&
targetThreat.value <= context.threat.value + 0.035 &&
targetThreat.depth < 75 &&
actionSpace.lineBreakCount === 0;
const needlessBackwards =
lowValueReset &&
forwardGain < -2.5 &&
context.pressureType !== "direct";
const labels = [];
let score = 0;
if (candidate.actionType === "shot") {
const shotQuality =
candidate.shotQuality ??
clamp(
(candidate.laneClarity ?? laneClarity) * 0.32 +
(candidate.angleQuality ?? 0.34) * 0.24 +
(candidate.goalkeeperOpenness ?? 0.45) * 0.22 +
(1 - (candidate.blockRisk ?? 0.52)) * 0.22,
0,
1
);
score +=
0.34 +
context.urgency * 0.54 +
shotQuality * 0.42 +
(candidate.insideBox ? 0.38 : 0) +
(candidate.mustShoot ? 0.52 : 0);
labels.push("End product: shoot");
} else if (candidate.actionType === "pass" && highValueTarget) {
const cutbackBonus = targetThreat.cutbackZone >= 0.28 || candidate.label === "cutback" ? 0.2 : 0;
const boxSupportBonus = clamp(candidate.supportNearTarget ?? 0, 0, 4) * 0.055;
score +=
0.24 +
context.urgency * 0.38 +
targetThreat.box * 0.28 +
targetThreat.cutbackZone * 0.24 +
boxSupportBonus +
cutbackBonus -
(laneClarity < 0.36 && passDistance >= 14 ? 0.18 : 0);
labels.push(targetThreat.cutbackZone >= 0.28 || candidate.label === "cutback" ? "End product: cutback" : "End product: final pass");
} else if (
candidate.actionType === "dribble" &&
routeToGoal &&
actionSpace.openTarget >= 0.42
) {
score +=
0.18 +
context.urgency * 0.28 +
actionSpace.openTarget * 0.18 +
(targetGoalDistance <= 28 ? 0.14 : 0);
labels.push("End product: commit defender");
} else if (
candidate.actionType === "pass" &&
routeToGoal &&
targetThreat.value >= context.threat.value + 0.05
) {
score += 0.08 + context.urgency * 0.12;
}
if (lowValueReset) {
score -= 0.42 + context.urgency * 0.42 + (context.facingForward ? 0.16 : 0);
labels.push("Avoid resetting a chance");
}
if (needlessBackwards) {
score -= 0.22 + context.urgency * 0.16;
}
if (
context.recentFinalThirdActions >= 3 &&
context.recentShots === 0 &&
candidate.actionType !== "shot" &&
!candidate.isBoxPass &&
!highValueTarget
) {
score -= 0.18 + context.urgency * 0.16;
}
return {
score: clamp(score, -1.2, 1.45),
labels: uniquePrincipleLabels(labels),
context: {
pressureType: context.pressureType,
urgency: context.urgency,
goalDistance: context.goalDistance,
highValueTarget,
lowValueReset,
recentFinalThirdActions: context.recentFinalThirdActions,
recentShots: context.recentShots,
},
};
}
function getAutoPilotChanceHierarchyContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const threat = getPitchThreatProfile(startPoint, teamId);
const goal = getOpponentGoalCenter(teamId);
const goalDistance = distance(startPoint, goal);
const depth = getAttackingDepth(startPoint, teamId);
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.35);
const shotTarget = getAutoPilotShotTarget(teamId, carrier);
const shotWindow = getShotWindowProfile(carrier, startPoint, shotTarget);
const flow = getAutoPilotFlowContext(carrier, startPoint);
const recentFinalThirdActions = flow.recent.filter((step) => {
const target = step.target ?? step.afterSnapshot?.ball?.position ?? null;
return target && getAttackingDepth(target, teamId) >= 66;
}).length;
const recentShots = flow.recent.filter((step) => step.actionType === "shot").length;
const freeToAct = pressure <= 0.52 && nearestGap >= 3.2;
const centralFinishState =
depth >= 67 &&
centrality >= 0.28 &&
goalDistance <= 37 &&
shotWindow.angleQuality >= 0.14 &&
shotWindow.blockRisk <= 0.84;
const boxFinishState =
threat.box >= 0.16 ||
threat.centralPocket >= 0.32 ||
(depth >= 76 && goalDistance <= 31);
const cutbackState =
threat.cutbackZone >= 0.2 ||
(depth >= 72 && isWideChannel(startPoint) && goalDistance <= 39);
const chanceValue = clamp(
threat.box * 0.34 +
threat.centralPocket * 0.28 +
threat.cutbackZone * 0.2 +
shotWindow.quality * 0.34 +
shotWindow.laneClarity * 0.2 +
shotWindow.angleQuality * 0.16 +
centrality * 0.12 +
clamp((38 - goalDistance) / 24, 0, 1) * 0.22 +
(facingForward ? 0.14 : 0) +
(freeToAct ? 0.12 : 0) +
(recentFinalThirdActions >= 2 && recentShots === 0 ? 0.16 : 0) -
pressure * 0.22,
0,
1.35
);
const active =
depth >= 62 &&
goalDistance <= 42 &&
pressure <= 0.78 &&
(centralFinishState || boxFinishState || cutbackState || chanceValue >= 0.44);
return {
active,
teamId,
threat,
goalDistance,
depth,
centrality,
pressure,
nearestGap,
facingForward,
shotWindow,
flow,
recentFinalThirdActions,
recentShots,
freeToAct,
centralFinishState,
boxFinishState,
cutbackState,
chanceValue,
};
}
function getAutoPilotChanceHierarchyAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotChanceHierarchyContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = candidate.actionType === "shot"
? context.threat
: getPitchThreatProfile(target, teamId);
const actionSpace = candidate.actionType === "shot"
? null
: getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: context.shotWindow.laneClarity;
const isFinalPass =
candidate.actionType === "pass" &&
(
candidate.isBoxPass ||
candidate.label === "cutback" ||
targetThreat.box >= 0.22 ||
targetThreat.cutbackZone >= 0.26 ||
(targetThreat.centralPocket >= 0.34 && forwardGain >= -1)
);
const canShootNow =
candidate.actionType === "shot" &&
(
context.boxFinishState ||
context.centralFinishState ||
context.shotWindow.quality >= 0.24 ||
context.goalDistance <= 29 ||
candidate.mustShoot
);
const canCarryToFinish =
candidate.actionType === "dribble" &&
forwardGain >= 4 &&
(actionSpace?.openTarget ?? 0) >= 0.42 &&
distance(target, getOpponentGoalCenter(teamId)) <= context.goalDistance - 3;
const supportReset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!isFinalPass &&
forwardGain < 2.5 &&
passDistance <= 24 &&
(
isSupportRole(receiverRoleKey) ||
receiverRoleKey === "rest" ||
targetThreat.value <= context.threat.value + 0.04
);
const backwardsReset = supportReset && forwardGain < -2.5;
const lowAngleWideShot =
candidate.actionType === "shot" &&
!context.boxFinishState &&
context.shotWindow.angleQuality < 0.16 &&
context.cutbackState;
const labels = [];
let score = 0;
if (canShootNow && !lowAngleWideShot) {
score +=
0.34 +
context.chanceValue * 0.5 +
context.shotWindow.quality * 0.34 +
(context.freeToAct ? 0.14 : 0) +
(context.recentFinalThirdActions >= 2 && context.recentShots === 0 ? 0.18 : 0) +
(candidate.mustShoot ? 0.28 : 0);
labels.push("Chance hierarchy: shoot");
}
if (isFinalPass) {
const cutbackBonus = candidate.label === "cutback" || targetThreat.cutbackZone >= 0.26 ? 0.2 : 0;
const boxBonus = targetThreat.box * 0.24 + targetThreat.centralPocket * 0.18;
score +=
0.24 +
context.chanceValue * 0.34 +
cutbackBonus +
boxBonus -
(laneClarity < 0.34 && passDistance >= 12 ? 0.18 : 0);
labels.push(candidate.label === "cutback" || targetThreat.cutbackZone >= 0.26
? "Chance hierarchy: cutback"
: "Chance hierarchy: final pass");
}
if (canCarryToFinish && !context.centralFinishState) {
score += 0.14 + context.chanceValue * 0.2 + (actionSpace?.openTarget ?? 0) * 0.16;
labels.push("Chance hierarchy: carry to finish");
}
if (supportReset && context.pressure <= 0.6) {
score -=
0.38 +
context.chanceValue * 0.42 +
(context.facingForward ? 0.18 : 0) +
(context.freeToAct ? 0.12 : 0);
labels.push("Avoid resetting a chance");
}
if (backwardsReset) {
score -= 0.18 + context.chanceValue * 0.18;
}
if (lowAngleWideShot) {
score -= 0.22;
}
return {
score: clamp(score, -1.15, 1.4),
labels: uniquePrincipleLabels(labels),
context: {
chanceValue: context.chanceValue,
goalDistance: context.goalDistance,
pressure: context.pressure,
centralFinishState: context.centralFinishState,
boxFinishState: context.boxFinishState,
cutbackState: context.cutbackState,
supportReset,
isFinalPass,
},
};
}

  return {
    getAutoPilotEndProductUrgencyContext,
    getAutoPilotEndProductUrgencyAdjustment,
    getAutoPilotChanceHierarchyContext,
    getAutoPilotChanceHierarchyAdjustment,
  };
}
