export function createGameSimulatorAutopilotDefensiveNegativeTransitionTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDefensiveAutopilotProfile,
    getDistanceFromOwnGoal,
    getOffensiveRoleKey,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getPlayerById,
    getTeamDefenseStyleKey,
    getTeamDefenseStyleProfile,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getNegativeTransitionContext(teamId, ballPoint = state.ball.target ?? state.ball.position, profile = null) {
const secure =
state.ball.securePossession ??
state.draftStep?.beforeSnapshot?.ball?.securePossession ??
null;
if (!secure?.ownerPlayerId || !secure?.opponentPlayerId || state.restartPhase?.type) {
return { active: false };
}
const newOwner = getPlayerById(secure.ownerPlayerId);
const playerWhoLostIt = getPlayerById(secure.opponentPlayerId);
if (!newOwner || !playerWhoLostIt || playerWhoLostIt.team !== teamId || newOwner.team === teamId) {
return { active: false };
}
const plannedPossessionTeamId = getPlannedPossessionTeamId();
if (plannedPossessionTeamId && plannedPossessionTeamId !== newOwner.team) {
return { active: false };
}
const lossPoint = secure.point ?? playerWhoLostIt.position ?? ballPoint;
const elapsed = Math.max(0, state.time - (secure.createdAt ?? state.time));
const distanceFromLoss = distance(ballPoint, lossPoint);
const freshness = clamp(
1 - Math.max(distanceFromLoss / 19.5, elapsed / 4.4),
0,
1
);
if (freshness <= 0.08) {
return { active: false };
}
const styleKey = getTeamDefenseStyleKey(teamId);
const styleProfile = getTeamDefenseStyleProfile(teamId);
const resolvedProfile = profile ?? getDefensiveAutopilotProfile(teamId, ballPoint);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const dangerToOwnGoal = clamp((47 - ballFromOwnGoal) / 29, 0, 1);
const counterPressStyleBonus = ["counter-press", "gegenpress", "high-press", "press-trap-wide"].includes(styleKey)
? 0.18
: 0;
const recoveryStyleBonus = ["low-block", "protect-box", "park-the-bus", "catenaccio"].includes(styleKey)
? 0.2
: 0;
const counterPressIntent = clamp(
resolvedProfile.pressingIntensity * 0.36 +
resolvedProfile.tackleIntent * 0.22 +
freshness * 0.3 +
counterPressStyleBonus +
(secure.reason === "interception" ? 0.08 : 0),
0,
1
);
const recoveryIntent = clamp(
(1 - resolvedProfile.pressingIntensity) * 0.34 +
dangerToOwnGoal * 0.34 +
recoveryStyleBonus +
(freshness < 0.45 ? 0.1 : 0),
0,
1
);
return {
active: true,
mode: counterPressIntent >= Math.max(0.58, recoveryIntent * 0.86)
? "counterPress"
: "delayRecover",
teamId,
winningTeamId: newOwner.team,
newOwner,
playerWhoLostIt,
ballPoint: cloneVector(ballPoint),
lossPoint: cloneVector(lossPoint),
freshness,
counterPressIntent,
recoveryIntent,
styleKey,
styleLabel: styleProfile.label,
dangerToOwnGoal,
};
}
function getNegativeTransitionTarget(teamId, context, slot, outlet = null) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const { ballPoint, lossPoint, freshness } = context;
const sideSign = getWideSideSign(ballPoint) || getWideSideSign(lossPoint) || 1;
const counterRadius = lerp(5.6, 2.8, freshness);
const goalSideX = (meters) => ballPoint.x - sign * meters;
const outletPoint = outlet?.position ?? outlet?.point ?? ballPoint;
const outletCentrality = 1 - Math.abs(outletPoint.y - pitch.width / 2) / (pitch.width / 2);
const points = {
pressBall: {
x: goalSideX(lerp(1.8, 0.7, freshness)),
y: lerp(ballPoint.y, pitch.width / 2, 0.08),
},
lockInside: {
x: goalSideX(5.4),
y: lerp(ballPoint.y, pitch.width / 2, 0.58),
},
lockFirstPassNear: {
x: goalSideX(3.8),
y: ballPoint.y - sideSign * counterRadius,
},
lockFirstPassFar: {
x: goalSideX(6.4),
y: ballPoint.y + sideSign * (counterRadius + 1.8),
},
passBackTrap: {
x: lerp(lossPoint.x, ballPoint.x, 0.36) + sign * 1.6,
y: lerp(lossPoint.y, ballPoint.y, 0.52),
},
outletLock: {
x: lerp(outletPoint.x, ballPoint.x, 0.24) - sign * lerp(0.8, 1.55, outletCentrality),
y: lerp(outletPoint.y, pitch.width / 2, outletCentrality >= 0.55 ? 0.26 : 0.12),
},
touchlineCage: {
x: goalSideX(3.2),
y: clamp(ballPoint.y + sideSign * 4.4, 3.2, pitch.width - 3.2),
},
restDefence: {
x: lerp(ballPoint.x, ownGoal.x, 0.38),
y: pitch.width / 2,
},
delayPress: {
x: goalSideX(2.2),
y: lerp(ballPoint.y, pitch.width / 2, 0.18),
},
recoverScreen: {
x: lerp(ballPoint.x, ownGoal.x, 0.26),
y: lerp(ballPoint.y, pitch.width / 2, 0.62),
},
recoverBackLine: {
x: lerp(ballPoint.x, ownGoal.x, 0.48),
y: pitch.width / 2 - sideSign * 4.8,
},
};
return clampToPitch(points[slot] ?? points.lockInside, 2.2);
}
function getNegativeTransitionOutletOptions(context) {
const attackSign = getAttackDirectionSign(context.winningTeamId);
const ballSide = getWideSideSign(context.ballPoint) || 1;
return state.players
.filter((player) =>
player.team === context.winningTeamId &&
player.id !== context.newOwner?.id &&
!isGoalkeeper(player)
)
.map((player) => {
const position = cloneVector(player.position);
const gap = distance(position, context.ballPoint);
if (gap < 4.2 || gap > 32) {
return null;
}
const threat = getPitchThreatProfile(position, context.winningTeamId);
const forwardGap = (position.x - context.ballPoint.x) * attackSign;
const centrality = 1 - Math.abs(position.y - pitch.width / 2) / (pitch.width / 2);
const sameSide = getWideSideSign(position) === ballSide;
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const outletScore =
threat.value * 0.48 +
threat.centralPocket * 0.34 +
threat.betweenLines * 0.24 +
threat.behindLine * 0.2 +
centrality * 0.16 +
clamp(forwardGap / 18, -0.08, 0.3) +
clamp((24 - gap) / 24, 0, 0.24) +
(sameSide ? 0.08 : 0) +
(["connector", "wideForward", "secondStriker", "striker"].includes(roleKey) ? 0.12 : 0);
return {
player,
position,
threat,
gap,
forwardGap,
centrality,
sameSide,
roleKey,
outletScore,
};
})
.filter(Boolean)
.filter((option) => option.outletScore >= 0.06)
.sort((a, b) => b.outletScore - a.outletScore)
.slice(0, 4);
}
function applyNegativeTransitionDefensiveTargets(teamId, targets, groups, ballPoint, profile) {
const context = getNegativeTransitionContext(teamId, ballPoint, profile);
if (!context.active) {
return {
active: false,
presser: null,
labels: [],
focusPoint: null,
mode: null,
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set(groups.gk.map((goalkeeper) => goalkeeper.id));
let presser = null;
const outlets = getNegativeTransitionOutletOptions(context);
const assign = (slot, lineKeys, preferLabels, label, outlet = null) => {
const target = getNegativeTransitionTarget(teamId, context, slot, outlet);
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
if (context.mode === "counterPress") {
presser = assign(
"pressBall",
["forward", "midfield", "back"],
["9", "10", "W", "8", "6"],
"Counter-press first touch"
);
[
["lockInside", ["midfield", "back"], ["6", "8", "CB"], "Counter-press cage: close inside"],
["lockFirstPassNear", ["midfield", "forward"], ["8", "10", "W", "6"], "Counter-press cage: near outlet"],
["passBackTrap", ["forward", "midfield"], ["9", "10", "W", "8"], "Counter-press cage: trap backwards pass"],
].forEach(([slot, lineKeys, preferLabels, label]) => {
assign(slot, lineKeys, preferLabels, label);
});
outlets.slice(0, context.counterPressIntent >= 0.66 ? 2 : 1).forEach((outlet, index) => {
assign(
"outletLock",
index === 0 ? ["midfield", "forward", "back"] : ["midfield", "back", "forward"],
outlet.centrality >= 0.55
? ["6", "8", "10", "CB"]
: ["W", "8", "LB", "RB", "WB", "10"],
index === 0 ? "Counter-press cage: lock best outlet" : "Counter-press cage: lock second outlet",
outlet
);
});
if (isWidePrincipleZone(context.ballPoint)) {
assign(
"touchlineCage",
["back", "midfield", "forward"],
["WB", "LB", "RB", "W", "8"],
"Counter-press cage: use touchline"
);
}
assign("restDefence", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Rest-defence behind counter-press");
} else {
presser = assign(
"delayPress",
["forward", "midfield"],
["9", "10", "W", "8"],
"Delay the first action"
);
[
["recoverScreen", ["midfield"], ["6", "8", "10"], "Recovery transition: screen centre"],
["recoverBackLine", ["back"], ["CB", "LB", "RB", "WB"], "Recovery transition: rebuild back line"],
["lockInside", ["midfield", "back"], ["6", "8", "CB"], "Recovery transition: protect inside"],
["restDefence", ["back", "midfield"], ["CB", "6"], "Recovery transition: protect depth"],
].forEach(([slot, lineKeys, preferLabels, label]) => {
assign(slot, lineKeys, preferLabels, label);
});
outlets.slice(0, 1).forEach((outlet) => {
assign(
"outletLock",
["midfield", "back", "forward"],
["6", "8", "10", "CB", "W"],
"Recovery transition: delay forward outlet",
outlet
);
});
}
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.mode === "counterPress" ? context.ballPoint : context.lossPoint,
mode: context.mode,
protectedIds: assignedIds,
};
}

  return {
    getNegativeTransitionContext,
    getNegativeTransitionTarget,
    getNegativeTransitionOutletOptions,
    applyNegativeTransitionDefensiveTargets,
  };
}
