export function createGameSimulatorAutopilotOffballBlindsideChannelTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAutoPilotRoleStrength,
    getDepthPoint,
    getOffensiveRoleKey,
    getOpponentLineDepthsForAttackingTeam,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerTendency,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pitch,
    resolveBallActionProfile,
    setAutopilotPrincipleTarget,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getBlindsideChannelRunContext(teamId, ballPoint, actionMeta, profile) {
if (!ballPoint || profile?.phaseKey === "setPiece") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const actionType = actionMeta?.actionType ?? state.ball.actionType;
const ballDepth = getAttackingDepth(ballPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const forwardGain = (ballPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const gameSpace = getAttackingGameSpaceProfile(ballPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, ballPoint, teamId, profile);
const lineDepths = targetThreat.opponentLineDepths ?? getOpponentLineDepthsForAttackingTeam(teamId, ballPoint);
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const canThreatenDepth =
ballDepth >= 36 &&
(
gameSpace.key === "space2" ||
gameSpace.key === "space3" ||
targetThreat.behindLine >= 0.16 ||
actionSpace.lineBreakCount >= 1 ||
forwardGain >= 5 ||
profile.lineBreakBias >= 0.58 ||
profile.directness >= 0.62 ||
principleText.includes("exit lane") ||
principleText.includes("line break") ||
principleText.includes("run beyond")
);
if (!canThreatenDepth) {
return null;
}
const initiator = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const actionDistance = distance(startPoint, ballPoint);
const ballProfile = resolveBallActionProfile(
actionType,
startPoint,
ballPoint,
initiator,
actionMeta?.receiverPlayerId ?? null
);
const actionSpeed = Math.max(
actionMeta?.speed ??
state.ball.speed ??
ballProfile.averageSpeed ??
(actionType === "dribble" ? 5.2 : 12),
0.1
);
const eta = actionDistance / actionSpeed;
const sideSign =
getWideSideSign(ballPoint) ||
getWideSideSign(startPoint) ||
1;
const breakLine =
actionSpace.lineBreakCount >= 1 ||
targetThreat.behindLine >= 0.24 ||
gameSpace.key === "space3" ||
(forwardGain >= 8 && profile.lineBreakBias >= 0.52);
return {
actionType,
startPoint,
targetPoint: ballPoint,
ballDepth,
startDepth,
forwardGain,
targetThreat,
gameSpace,
actionSpace,
lineDepths,
eta,
arrivalWindow: eta + 0.85 + (profile.tempo ?? 0.5) * 0.35,
sideSign,
breakLine,
};
}
function getBlindsideChannelRunTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const lineDepth = context.lineDepths.back ?? clamp(context.ballDepth + 18, 56, 88);
const depthLead = context.breakLine
? 3.8 + (context.profile?.lineBreakBias ?? 0.5) * 4.2
: -1.2;
const runDepth = clamp(
Math.max(context.ballDepth + 6, lineDepth + depthLead),
46,
97
);
const pinDepth = clamp(Math.max(context.ballDepth + 5, lineDepth - 1.4), 44, 93);
const sideSign = context.sideSign || 1;
const strongHalfY = clamp(pitch.width / 2 + sideSign * 11.5, 8, pitch.width - 8);
const weakHalfY = clamp(pitch.width / 2 - sideSign * 11.5, 8, pitch.width - 8);
const wideChannelY = clamp(pitch.width / 2 + sideSign * 23.5, 4, pitch.width - 4);
const farChannelY = clamp(pitch.width / 2 - sideSign * 20.5, 5, pitch.width - 5);
const points = {
blindsideRun: getDepthPoint(teamId, runDepth, {
y: clamp(lerp(context.targetPoint.y, weakHalfY, 0.56), 7, pitch.width - 7),
}),
nearChannel: getDepthPoint(teamId, clamp(runDepth - 1.2, 45, 96), {
y: clamp(lerp(context.targetPoint.y, strongHalfY, 0.68), 7, pitch.width - 7),
}),
wideChannel: getDepthPoint(teamId, clamp(runDepth - 2.4, 44, 95), {
y: wideChannelY,
}),
farChannel: getDepthPoint(teamId, clamp(runDepth - 1.8, 45, 96), {
y: farChannelY,
}),
pinLine: getDepthPoint(teamId, pinDepth, {
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.58), 12, pitch.width - 12),
}),
restScreen: clampToPitch({
x: context.targetPoint.x - sign * 22,
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.74), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.blindsideRun;
}
function chooseBlindsideChannelRunner(teamId, targets, excludedIds, roleKeys, target, context) {
const roleSet = new Set(roleKeys);
const arrivalWindow = Math.max(context.arrivalWindow, 0.85);
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id) || isGoalkeeper(player)) {
return false;
}
return roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation));
})
.map((player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const runDistance = distance(player.position, target);
const timeToTarget = computeTimeToCoverDistance(player, runDistance, target);
const timingFit = clamp(1 - Math.abs(timeToTarget - arrivalWindow) / 1.8, 0, 1);
const playerSide = getWideSideSign(player);
const targetSide = getWideSideSign(target);
const sideFit = !targetSide || !playerSide || playerSide === targetSide ? 0.12 : -0.08;
const roleFit = Math.max(0.4, 1 - roleKeys.indexOf(roleKey) * 0.08);
const score =
roleFit * 0.24 +
timingFit * 0.34 +
getAutoPilotRoleStrength(player, "runner") * 0.28 +
getPlayerTendency(player, "boxRun") * 0.16 +
getPlayerTendency(player, "passAndMove") * 0.1 +
sideFit -
Math.max(timeToTarget - arrivalWindow, 0) * 0.14 -
runDistance * 0.005;
return {
player,
score,
timeToTarget,
};
})
.filter((entry) => entry.score >= 0.34 || entry.timeToTarget <= arrivalWindow + 1.2)
.sort((a, b) => b.score - a.score)[0]?.player ?? null;
}
function applyBlindsideChannelRunTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
const context = getBlindsideChannelRunContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
context.profile = profile;
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const protectedRunIds = new Set();
const assign = (slot, roleKeys, label) => {
const target = getBlindsideChannelRunTarget(teamId, context, slot);
const player = chooseBlindsideChannelRunner(teamId, targets, assignedIds, roleKeys, target, context);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedRunIds.add(player.id);
labels.push(label);
return player;
};
if (context.breakLine) {
assign("blindsideRun", ["wideForward", "secondStriker", "striker"], "Blindside run behind line");
assign("nearChannel", ["striker", "secondStriker", "wideForward"], "Near-channel run");
} else {
assign("pinLine", ["striker", "secondStriker", "wideForward"], "Pin last line");
assign("nearChannel", ["wideForward", "secondStriker", "striker"], "Prepare channel run");
}
if (isWidePrincipleZone(context.targetPoint) || profile.overlapBias >= 0.56) {
assign("wideChannel", ["wideBack", "wideForward"], "Wide channel release");
}
if (profile.switchBias >= 0.58 || context.targetThreat.centralPocket >= 0.28 || context.actionSpace.value >= 0.42) {
assign("farChannel", ["wideForward", "secondStriker", "wideBack"], "Far-side blindside run");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedRunIds,
};
}

  return {
    getBlindsideChannelRunContext,
    getBlindsideChannelRunTarget,
    chooseBlindsideChannelRunner,
    applyBlindsideChannelRunTargets,
  };
}
