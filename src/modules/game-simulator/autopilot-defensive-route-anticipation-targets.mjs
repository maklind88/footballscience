export function createGameSimulatorAutopilotDefensiveRouteAnticipationTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    getAttackingDepth,
    getAutoPilotPossessionRouteStage,
    getDefendingDirectionSign,
    getLaneCenterY,
    getOffensiveAutopilotProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPossessionRhythmContext,
    getWideSideSign,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveRouteAnticipationContext(defensiveTeamId, ballPoint, profile) {
if (state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
const plan = state.autoPilotPlay?.possessionPlan;
if (!attackingTeamId || !plan || plan.teamId !== attackingTeamId || !(plan.routeLanes?.length)) {
return null;
}
const attackProfile = getOffensiveAutopilotProfile(attackingTeamId, ballPoint);
const rhythm = getPossessionRhythmContext(attackingTeamId);
const depth = getAttackingDepth(ballPoint, attackingTeamId);
const routeStage = getAutoPilotPossessionRouteStage(plan, rhythm, depth);
const routeTargetLane =
plan.routeLanes?.[routeStage] ??
plan.routeLanes?.[0] ??
getPitchLaneKey(ballPoint);
const nextRouteLane =
plan.routeLanes?.[Math.min(routeStage + 1, (plan.routeLanes?.length ?? 1) - 1)] ??
routeTargetLane;
const routeIntent =
plan.routeIntents?.[Math.min(routeStage, (plan.routeIntents?.length ?? 1) - 1)] ??
plan.intentSequence?.[Math.min(routeStage, (plan.intentSequence?.length ?? 1) - 1)] ??
"progress";
const currentLane = getPitchLaneKey(ballPoint);
const routeShiftFromBall = Math.abs(getPitchLaneIndex(routeTargetLane) - getPitchLaneIndex(currentLane));
const laneDistance = Math.abs(getPitchLaneIndex(routeTargetLane) - getPitchLaneIndex(nextRouteLane));
const routeY = getLaneCenterY(routeTargetLane, attackProfile);
const nextY = getLaneCenterY(nextRouteLane, attackProfile);
const sideSign =
Math.sign(routeY - pitch.width / 2) ||
getWideSideSign(ballPoint) ||
1;
const targetThreat = getPitchThreatProfile(
{
x: ballPoint.x,
y: routeY,
},
attackingTeamId
);
const active =
depth >= 30 ||
rhythm.steps >= 1 ||
routeShiftFromBall >= 1 ||
laneDistance >= 2 ||
routeIntent === "switch" ||
routeIntent === "finish";
if (!active) {
return null;
}
return {
attackingTeamId,
plan,
attackProfile,
rhythm,
depth,
ballPoint: cloneVector(ballPoint),
routeStage,
routeTargetLane,
nextRouteLane,
routeIntent,
currentLane,
routeShiftFromBall,
laneDistance,
routeY,
nextY,
sideSign,
targetThreat,
targetIsWide: routeTargetLane === "leftWide" || routeTargetLane === "rightWide",
targetIsHalf: routeTargetLane === "leftHalf" || routeTargetLane === "rightHalf",
targetIsCentral: routeTargetLane === "central",
};
}
function getDefensiveRouteAnticipationTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const { ballPoint, routeY, nextY, sideSign } = context;
const goalSideX = (meters) => ballPoint.x - sign * meters;
const depthCoverRatio =
context.routeIntent === "finish"
? 0.5
: context.routeIntent === "accelerate"
? 0.42
: 0.34;
const points = {
routeLaneScreen: {
x: goalSideX(context.targetIsWide ? 5.6 : 7.2),
y: lerp(routeY, pitch.width / 2, context.targetIsWide ? 0.2 : 0.12),
},
centralScreen: {
x: goalSideX(9.6),
y: lerp(routeY, pitch.width / 2, 0.72),
},
touchlineTrap: {
x: goalSideX(4.8),
y: clamp(routeY + sideSign * 4.6, 3.4, pitch.width - 3.4),
},
insideCover: {
x: goalSideX(6.8),
y: lerp(routeY, pitch.width / 2, 0.48),
},
weakSideSwitchCover: {
x: lerp(ballPoint.x, ownGoal.x, 0.3),
y: clamp(nextY, 5.5, pitch.width - 5.5),
},
depthCover: {
x: lerp(ballPoint.x, ownGoal.x, depthCoverRatio),
y: lerp(routeY, pitch.width / 2, context.targetIsWide ? 0.46 : 0.32),
},
secondBallCover: {
x: goalSideX(13.4),
y: lerp(routeY, pitch.width / 2, 0.54),
},
restLine: {
x: lerp(ballPoint.x, ownGoal.x, 0.46),
y: clamp(pitch.width / 2 - sideSign * 7.2, 8, pitch.width - 8),
},
};
return clampToPitch(points[slot] ?? points.routeLaneScreen, 2.2);
}
function applyDefensiveRouteAnticipationTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveRouteAnticipationContext(teamId, ballPoint, profile);
if (!context) {
return {
presser: basePresser,
labels: [],
focusPoint: null,
protectedIds: new Set(protectedIds),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
basePresser?.id,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveRouteAnticipationTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
if (!player) {
return null;
}
targets.set(player.id, target);
assignedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
if (context.targetIsWide) {
assign("routeLaneScreen", ["midfield", "back"], ["WB", "LB", "RB", "W", "6"], "Protect route lane");
assign("touchlineTrap", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Deny outside route");
assign("insideCover", ["midfield"], ["6", "8", "10"], "Block inside return");
} else if (context.targetIsHalf) {
assign("routeLaneScreen", ["midfield"], ["6", "8", "10"], "Screen half-space route");
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover route depth");
assign("centralScreen", ["midfield", "back"], ["6", "8", "CB"], "Protect central lane");
} else if (context.targetIsCentral) {
assign("centralScreen", ["midfield"], ["6", "8", "10"], "Protect central route");
assign("depthCover", ["back"], ["CB"], "Cover line behind");
if (context.targetThreat.betweenLines >= 0.4 || context.depth >= 50) {
assign("routeLaneScreen", ["midfield", "back"], ["6", "8", "CB"], "Deny turn inside");
}
}
if (
context.routeIntent === "switch" ||
context.laneDistance >= 2 ||
context.plan.routeKey === "wide-overload-switch" ||
context.plan.routeKey === "patient-switch"
) {
assign("weakSideSwitchCover", ["back", "midfield"], ["WB", "LB", "RB", "W", "6"], "Cover weak-side switch");
}
if (
context.routeIntent === "accelerate" ||
context.routeIntent === "finish" ||
context.plan.routeKey === "direct-second-ball"
) {
assign("secondBallCover", ["midfield", "back"], ["6", "8", "CB"], "Prepare second ball");
assign("restLine", ["back"], ["CB", "LB", "RB", "WB"], "Rest line protects depth");
}
if (labels.length) {
labels.unshift("Anticipate attacking route");
}
return {
presser: basePresser,
labels: uniquePrincipleLabels(labels),
focusPoint: {
x: ballPoint.x,
y: context.routeY,
},
protectedIds: assignedIds,
};
}

  return {
    getDefensiveRouteAnticipationContext,
    getDefensiveRouteAnticipationTarget,
    applyDefensiveRouteAnticipationTargets,
  };
}
