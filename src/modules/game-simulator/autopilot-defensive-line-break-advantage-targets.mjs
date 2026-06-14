export function createGameSimulatorAutopilotDefensiveLineBreakAdvantageTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDepthX,
    getDistanceFromOwnGoal,
    getDribblePressureReference,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getRecentPossessionSteps,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveLineBreakAdvantageContext(
defensiveTeamId,
ballPoint,
profile,
reference = getDribblePressureReference()
) {
if (state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
targetKind: state.ball.targetKind,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
profileKey: state.ball.profileKey,
profileLabel: state.ball.profileLabel,
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
offensiveAutopilot: null,
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (!["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
reference?.startPoint ??
state.ball.position ??
ballPoint;
const targetPoint =
actionMeta.target ??
reference?.targetPoint ??
state.ball.target ??
ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const carrier = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const threatPoint = actionType === "shot" ? startPoint : targetPoint;
const targetThreat = getPitchThreatProfile(threatPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, threatPoint, attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, threatPoint);
const goalDistance = distance(threatPoint, getOpponentGoalCenter(attackingTeamId));
const pressure = carrier
? getPlayerPressureLoad(carrier, startPoint)
: getOpponentPressureAtPoint(defensiveTeamId, threatPoint, 9);
const recent = getRecentPossessionSteps(attackingTeamId, 2);
const previous = recent[0] ?? null;
const previousText = [
previous?.profileLabel,
previous?.offensiveAutopilot?.principleKey,
previous?.offensiveAutopilot?.principleLabel,
...(previous?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const advantageCue =
principleText.includes("line-break advantage") ||
principleText.includes("do not reset line-break") ||
previousText.includes("line-break advantage") ||
previousText.includes("line-breaking") ||
previousText.includes("space 2") ||
previousText.includes("spelyta");
const lineBreakCue =
advantageCue ||
actionSpace.lineBreakCount >= 1 ||
targetThreat.behindLine >= 0.2 ||
targetThreat.betweenLines >= 0.32 ||
targetThreat.centralPocket >= 0.28 ||
(forwardGain >= 8 && targetThreat.value >= 0.32);
const isShotCue =
actionType === "shot" ||
principleText.includes("shoot") ||
principleText.includes("finish") ||
targetThreat.box >= 0.22;
const isCutbackCue =
principleText.includes("cutback") ||
targetThreat.cutbackZone >= 0.24 ||
(targetThreat.assistZone >= 0.34 && ballFromOwnGoal <= 37);
const isWideCue =
isWidePrincipleZone(threatPoint) ||
isWidePrincipleZone(startPoint) ||
targetThreat.assistZone >= 0.32 ||
isCutbackCue;
const dangerScore = clamp(
targetThreat.box * 0.42 +
targetThreat.centralPocket * 0.34 +
targetThreat.behindLine * 0.3 +
targetThreat.cutbackZone * 0.3 +
targetThreat.betweenLines * 0.22 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.28 +
clamp((42 - goalDistance) / 25, 0, 1) * 0.22 +
clamp((48 - ballFromOwnGoal) / 26, 0, 1) * 0.24 +
(advantageCue ? 0.3 : 0) +
(isShotCue ? 0.18 : 0) +
(isCutbackCue ? 0.16 : 0) -
pressure * 0.12,
0,
1.45
);
if (!lineBreakCue || dangerScore < 0.48 || ballFromOwnGoal > 55) {
return null;
}
return {
actionMeta,
actionType,
attackingTeamId,
carrier,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
threatPoint: cloneVector(threatPoint),
targetThreat,
actionSpace,
forwardGain,
ballFromOwnGoal,
goalDistance,
pressure,
advantageCue,
isShotCue,
isCutbackCue,
isWideCue,
dangerScore,
sideSign:
getWideSideSign(threatPoint) ||
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1,
mode: isShotCue
? "shotCollapse"
: isCutbackCue
? "cutbackCollapse"
: isWideCue
? "wideCollapse"
: "centralCollapse",
};
}
function getDefensiveLineBreakAdvantageTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.threatPoint;
const sideSign = context.sideSign || 1;
const lanePoint = (ratio) => ({
x: lerp(context.startPoint.x, target.x, ratio),
y: lerp(context.startPoint.y, target.y, ratio),
});
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const penaltySpot = getOpponentPenaltySpot(context.attackingTeamId);
const lastLineDepth = clamp(
context.ballFromOwnGoal - (context.dangerScore >= 0.8 ? 5.4 : 4.2),
7.5,
context.ballFromOwnGoal <= 28 ? 24 : 35
);
const screenDepth = clamp(context.ballFromOwnGoal + 3.8, 16, 42);
const points = {
delayBall: {
...goalSideOf(lanePoint(context.actionType === "dribble" ? 0.52 : 0.74), context.isShotCue ? 0.85 : 1.25),
y: lerp(target.y, pitch.width / 2, context.isWideCue ? 0.18 : 0.3),
},
lastLineSeal: {
x: getDepthX(teamId, lastLineDepth),
y: lerp(target.y, pitch.width / 2, context.isWideCue ? 0.46 : 0.28),
},
centralGate: {
x: getDepthX(teamId, screenDepth),
y: lerp(target.y, pitch.width / 2, context.isWideCue ? 0.74 : 0.86),
},
cutbackGate: {
x: penaltySpot.x - getAttackDirectionSign(context.attackingTeamId) * 7.2,
y: clamp(pitch.width / 2 + sideSign * 5.8, 10, pitch.width - 10),
},
farPost: {
x: getDepthX(teamId, clamp(lastLineDepth + 1.6, 7.5, 24)),
y: clamp(pitch.width / 2 - sideSign * 9.2, 7, pitch.width - 7),
},
edgeCover: {
x: getDepthX(teamId, clamp(context.ballFromOwnGoal + 8.5, 20, 48)),
y: clamp(lerp(target.y, pitch.width / 2 - sideSign * 3.5, 0.62), 12, pitch.width - 12),
},
weakSideCollapse: {
x: lerp(target.x, ownGoal.x, context.ballFromOwnGoal <= 32 ? 0.46 : 0.36),
y: clamp(pitch.width / 2 - sideSign * (context.ballFromOwnGoal <= 32 ? 7.2 : 10.4), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.centralGate, 2.1);
}
function applyDefensiveLineBreakAdvantageCollapseTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveLineBreakAdvantageContext(teamId, ballPoint, profile, reference);
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
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
let presser = basePresser;
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveLineBreakAdvantageTarget(teamId, context, slot);
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
const delayTarget = getDefensiveLineBreakAdvantageTarget(teamId, context, "delayBall");
const presserCanDelay =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, delayTarget) <= (context.advantageCue ? 24 : 19);
if (presserCanDelay) {
targets.set(presser.id, delayTarget);
assignedIds.add(presser.id);
labels.push("Line-break collapse: delay first finish");
} else {
const delayPlayer = assign(
"delayBall",
context.ballFromOwnGoal <= 30 ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.isWideCue ? ["WB", "LB", "RB", "W", "6", "8"] : ["6", "8", "CB", "10", "9"],
"Line-break collapse: delay first finish"
);
presser = delayPlayer ?? presser;
}
assign("lastLineSeal", ["back"], ["CB", "LB", "RB", "WB"], "Line-break collapse: seal last line");
assign("centralGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Line-break collapse: close central gate");
if (context.isCutbackCue || context.isWideCue || context.targetThreat.cutbackZone >= 0.18) {
assign("cutbackGate", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Line-break collapse: lock cutback");
}
if (context.ballFromOwnGoal <= 32 || context.isShotCue || context.targetThreat.box >= 0.16) {
assign("farPost", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Line-break collapse: cover far post");
}
assign("edgeCover", ["midfield", "back"], ["6", "8", "10", "CB"], "Line-break collapse: secure edge");
assign("weakSideCollapse", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Line-break collapse: weak side narrows");
if (labels.length) {
labels.unshift(
context.mode === "shotCollapse"
? "Collapse after line break: protect shot"
: context.mode === "cutbackCollapse"
? "Collapse after line break: protect cutback"
: "Collapse after line break"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.threatPoint,
protectedIds: assignedIds,
};
}
  return {
    getDefensiveLineBreakAdvantageContext,
    getDefensiveLineBreakAdvantageTarget,
    applyDefensiveLineBreakAdvantageCollapseTargets,
  };
}
