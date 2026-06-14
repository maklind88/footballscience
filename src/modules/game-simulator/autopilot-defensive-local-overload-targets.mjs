export function createGameSimulatorAutopilotDefensiveLocalOverloadTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getOffensiveAutopilotProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getActualLocalSuperiorityProfile(attackingTeamId, defendingTeamId, hubPoint, excludedIds = new Set(), radius = 15) {
if (!attackingTeamId || !defendingTeamId || !hubPoint) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const sideSign = getWideSideSign(hubPoint) || 1;
const sectors = {
under: 0,
forward: 0,
inside: 0,
outside: 0,
lateral: 0,
};
const supporters = state.players
.filter((player) => player.team === attackingTeamId && !isGoalkeeper(player) && !excludedIds.has(player.id))
.map((player) => {
const gap = distance(player.position, hubPoint);
if (gap > radius || gap < 2.2) {
return null;
}
const forwardGap = (player.position.x - hubPoint.x) * attackSign;
const lateralGap = Math.abs(player.position.y - hubPoint.y);
const isInside = Math.abs(player.position.y - pitch.width / 2) < Math.abs(hubPoint.y - pitch.width / 2) - 1.2;
const isOutside = (player.position.y - hubPoint.y) * sideSign > 1.6;
if (forwardGap <= -2.5) {
sectors.under += 1;
}
if (forwardGap >= 3) {
sectors.forward += 1;
}
if (lateralGap >= 4) {
sectors.lateral += 1;
}
if (isInside) {
sectors.inside += 1;
}
if (isOutside) {
sectors.outside += 1;
}
return {
player,
point: cloneVector(player.position),
gap,
forwardGap,
lateralGap,
isInside,
isOutside,
threat: getPitchThreatProfile(player.position, attackingTeamId),
};
})
.filter(Boolean)
.sort((a, b) => {
const aScore = a.threat.value * 0.5 + clamp((radius - a.gap) / radius, 0, 1) * 0.5;
const bScore = b.threat.value * 0.5 + clamp((radius - b.gap) / radius, 0, 1) * 0.5;
return bScore - aScore;
});
const defenders = state.players
.filter((player) => player.team === defendingTeamId && !isGoalkeeper(player))
.map((player) => {
const gap = distance(player.position, hubPoint);
if (gap > radius + 1.5) {
return null;
}
return {
player,
point: cloneVector(player.position),
gap,
};
})
.filter(Boolean)
.sort((a, b) => a.gap - b.gap);
const sectorVariety = Object.values(sectors).filter((count) => count > 0).length;
return {
attackingTeamId,
defendingTeamId,
hubPoint: cloneVector(hubPoint),
supporters,
defenders,
sectors,
sectorVariety,
supportCount: supporters.length,
defenderCount: defenders.length,
sideSign,
};
}
function getDefensiveLocalOverloadContext(teamId, ballPoint, presser, profile = {}) {
if (state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
const plannedPossessionTeamId = getPlannedPossessionTeamId();
if (!attackingTeamId || (plannedPossessionTeamId && plannedPossessionTeamId !== attackingTeamId)) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
receiverPlayerId: state.ball.receiverPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint ?? state.ball.position;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!targetPoint || !startPoint || !["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const carrierId =
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId ??
null;
const receiverId = actionMeta.receiverPlayerId ?? null;
const excludedIds = new Set([carrierId, receiverId].filter(Boolean));
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(
startPoint,
targetPoint,
attackingTeamId,
getOffensiveAutopilotProfile(attackingTeamId, targetPoint)
);
const actionDistance = distance(startPoint, targetPoint);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const radius =
profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending"
? 13.5
: actionType === "dribble"
? 12.5
: 15.5;
const local = getActualLocalSuperiorityProfile(attackingTeamId, teamId, targetPoint, excludedIds, radius);
if (!local) {
return null;
}
const centralRisk =
targetThreat.centralPocket >= 0.2 ||
targetThreat.betweenLines >= 0.28 ||
targetThreat.box >= 0.12 ||
actionSpace.lineBreakCount >= 1 ||
ballFromOwnGoal <= 45;
const wideRisk = isWidePrincipleZone(targetPoint) || Math.abs(targetPoint.y - pitch.width / 2) >= 17;
const supportTriangle = local.supportCount >= 2 && local.sectorVariety >= 2;
const bounceRisk = local.sectors.under >= 1 && (local.sectors.lateral >= 1 || local.sectors.inside >= 1);
const overloadScore =
(local.supportCount - local.defenderCount) * 0.52 +
local.sectorVariety * 0.16 +
(supportTriangle ? 0.2 : 0) +
(bounceRisk ? 0.18 : 0) +
(centralRisk ? 0.24 : 0) +
(wideRisk && local.supportCount >= 2 ? 0.12 : 0) +
clamp(forwardGain / 18, -0.08, 0.22) +
clamp((targetDepth - 48) / 36, 0, 0.2);
const shouldRespond =
overloadScore >= 0.62 ||
(supportTriangle && local.defenderCount <= local.supportCount) ||
(centralRisk && local.supportCount >= 1 && local.defenderCount <= 2) ||
(actionType === "dribble" && targetDepth >= 50 && local.defenderCount <= 2);
if (!shouldRespond) {
return null;
}
const mode = wideRisk
? "wideTrap"
: centralRisk
? "centralLock"
: "supportDeny";
return {
actionMeta,
actionType,
attackingTeamId,
presser,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
targetThreat,
actionSpace,
actionDistance,
forwardGain,
targetDepth,
ballFromOwnGoal,
local,
radius,
centralRisk,
wideRisk,
supportTriangle,
bounceRisk,
overloadScore,
mode,
phaseKey: profile.phaseKey,
sideSign: local.sideSign || getWideSideSign(targetPoint) || 1,
};
}
function getDefensiveLocalOverloadTarget(teamId, context, slot, support = null) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const supportPoint = support?.point ?? support?.player?.position ?? ball;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const points = {
pressHub: {
...goalSideOf(ball, context.phaseKey === "highPress" ? 1.2 : 1.8),
y: lerp(ball.y, pitch.width / 2, context.wideRisk ? 0.12 : 0.2),
},
underScreen: {
x: ball.x - sign * (context.centralRisk ? 5.6 : 4.8),
y: lerp(ball.y, supportPoint.y, 0.42),
},
insideGate: {
x: lerp(ball.x, ownGoal.x, context.centralRisk ? 0.24 : 0.18),
y: lerp(ball.y, pitch.width / 2, context.wideRisk ? 0.82 : 0.68),
},
outsideLock: {
x: ball.x - sign * (context.phaseKey === "highPress" ? 1.4 : 2.2),
y: clamp(ball.y + sideSign * 4.6, 3.5, pitch.width - 3.5),
},
outletDeny: {
...goalSideOf({
x: lerp(supportPoint.x, ball.x, 0.22),
y: lerp(supportPoint.y, pitch.width / 2, support?.threat?.centralPocket >= 0.2 ? 0.18 : 0.08),
}, support?.threat?.value >= 0.34 ? 1.4 : 1.0),
},
depthCover: {
x: lerp(ball.x, ownGoal.x, context.targetDepth >= 62 || context.actionSpace.lineBreakCount >= 1 ? 0.44 : 0.32),
y: lerp(ball.y, pitch.width / 2, context.wideRisk ? 0.4 : 0.26),
},
weakSideTuck: {
x: lerp(ball.x, ownGoal.x, context.centralRisk || context.targetDepth >= 58 ? 0.42 : 0.34),
y: clamp(pitch.width / 2 - sideSign * (context.phaseKey === "boxDefending" ? 7.6 : 10.4), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.insideGate, 2.2);
}
function applyDefensiveLocalOverloadResponseTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveLocalOverloadContext(teamId, ballPoint, basePresser, profile);
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
const pressTarget = getDefensiveLocalOverloadTarget(teamId, context, "pressHub");
const presserCanLock =
presser &&
!isGoalkeeper(presser) &&
!assignedIds.has(presser.id) &&
distance(presser.position, pressTarget) <= (context.phaseKey === "lowBlock" ? 16 : 20);
if (presserCanLock) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push("Local overload: pressure ball");
} else {
const pressurePlayer = pickDefensiveAutopilotPlayer(
groups,
context.wideRisk ? ["midfield", "back", "forward"] : ["midfield", "forward", "back"],
assignedIds,
pressTarget,
context.wideRisk ? ["W", "WB", "LB", "RB", "8", "10"] : ["6", "8", "10", "9", "CB"]
);
if (pressurePlayer) {
targets.set(pressurePlayer.id, pressTarget);
assignedIds.add(pressurePlayer.id);
presser = pressurePlayer;
labels.push("Local overload: pressure ball");
}
}
const assign = (slot, lineKeys, preferLabels, label, support = null) => {
const target = getDefensiveLocalOverloadTarget(teamId, context, slot, support);
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
const underSupport = context.local.supporters.find((support) => support.forwardGap <= -2.5) ?? context.local.supporters[0] ?? null;
const firstOutlet =
context.local.supporters.find((support) => support.threat.centralPocket >= 0.18 || support.threat.box >= 0.1) ??
context.local.supporters.find((support) => support.lateralGap >= 4) ??
context.local.supporters[0] ??
null;
if (underSupport || context.bounceRisk) {
assign("underScreen", ["midfield", "back"], ["6", "8", "10", "CB"], "Local overload: deny bounce pass", underSupport);
}
assign("insideGate", ["midfield", "back"], ["6", "8", "CB", "10", "LB", "RB", "WB"], "Local overload: close inside gate");
if (context.wideRisk) {
assign("outsideLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Local overload: lock outside lane");
}
if (firstOutlet) {
assign(
"outletDeny",
firstOutlet.threat.box >= 0.12 || firstOutlet.threat.centralPocket >= 0.2
? ["midfield", "back", "forward"]
: ["midfield", "forward", "back"],
firstOutlet.threat.box >= 0.12 || firstOutlet.threat.centralPocket >= 0.2
? ["6", "8", "CB", "10"]
: ["W", "8", "10", "LB", "RB", "WB"],
"Local overload: deny nearest outlet",
firstOutlet
);
}
if (context.centralRisk || context.targetDepth >= 58 || context.actionSpace.lineBreakCount >= 1) {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Local overload: protect depth behind");
}
if (context.local.supportCount >= 2 || context.wideRisk || context.centralRisk) {
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Local overload: weak side tucks in");
}
if (labels.length) {
labels.unshift(
context.mode === "wideTrap"
? "Defensive local overload response: wide trap"
: context.mode === "centralLock"
? "Defensive local overload response: central lock"
: "Defensive local overload response"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getActualLocalSuperiorityProfile,
    getDefensiveLocalOverloadContext,
    getDefensiveLocalOverloadTarget,
    applyDefensiveLocalOverloadResponseTargets,
  };
}
