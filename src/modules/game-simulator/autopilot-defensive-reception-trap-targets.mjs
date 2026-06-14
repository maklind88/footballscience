export function createGameSimulatorAutopilotDefensiveReceptionTrapTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefendingDirectionSign,
    getOffensiveRoleKey,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerById,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveReceptionTrapContext(defensiveTeamId, ballPoint, profile) {
if (state.restartPhase?.type) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
principleRunnerPlayerId: null,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
if (actionMeta.actionType !== "pass") {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiverCandidate = getPlayerById(
actionMeta.receiverPlayerId ??
actionMeta.principleRunnerPlayerId ??
state.ball.receiverPlayerId
);
const receiver = receiverCandidate?.team === attackingTeamId ? receiverCandidate : null;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
carrier?.position ??
state.ball.position;
const target = actionMeta.target ?? state.ball.target ?? ballPoint;
if (!attackingTeamId || !startPoint || !target || carrier?.team === defensiveTeamId) {
return null;
}
const passDistance = distance(startPoint, target);
if (passDistance <= 4.5) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (target.x - startPoint.x) * attackSign;
const lateralShift = Math.abs(target.y - startPoint.y);
const targetThreat = getPitchThreatProfile(target, attackingTeamId);
const targetDepth = getAttackingDepth(target, attackingTeamId);
const startDepth = getAttackingDepth(startPoint, attackingTeamId);
const targetLaneKey = getPitchLaneKey(target);
const targetIsWide = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
const targetIsCentral =
targetLaneKey === "central" ||
targetLaneKey === "leftHalf" ||
targetLaneKey === "rightHalf";
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[attackingTeamId]?.formation) : null;
const sideSign =
getWideSideSign(target) ||
getWideSideSign(receiver) ||
getWideSideSign(startPoint) ||
1;
const highValueReception =
targetThreat.value >= 0.34 ||
targetThreat.betweenLines >= 0.38 ||
targetThreat.centralPocket >= 0.32 ||
targetThreat.halfSpace >= 0.42 ||
targetThreat.assistZone >= 0.36 ||
targetThreat.box >= 0.24 ||
forwardGain >= 7.5 ||
targetDepth >= 54;
const receiverCanTurn =
receiverRoleKey === "connector" ||
receiverRoleKey === "wideForward" ||
receiverRoleKey === "striker" ||
receiverRoleKey === "secondStriker";
const wideTrap =
targetIsWide &&
targetDepth >= 34 &&
(profile.styleKey === "press-trap-wide" ||
profile.pressingIntensity >= 0.5 ||
forwardGain >= -2);
const centralTrap =
targetIsCentral &&
(highValueReception ||
receiverCanTurn ||
(targetDepth >= 42 && passDistance >= 10));
const lineBreakTrap =
forwardGain >= 11 ||
targetThreat.behindLine >= 0.34 ||
(targetDepth >= 70 && passDistance >= 15);
if (!wideTrap && !centralTrap && !lineBreakTrap && passDistance < 18) {
return null;
}
return {
actionMeta,
attackingTeamId,
carrier,
receiver,
receiverRoleKey,
startPoint: cloneVector(startPoint),
target: cloneVector(target),
passDistance,
forwardGain,
lateralShift,
targetThreat,
targetDepth,
startDepth,
targetLaneKey,
targetIsWide,
targetIsCentral,
sideSign,
mode: lineBreakTrap
? "lineBreak"
: wideTrap
? "wideTrap"
: centralTrap
? "centralTrap"
: "screenReception",
};
}
function getDefensiveReceptionTrapTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.target;
const sideSign = context.sideSign || 1;
const isWide = context.targetIsWide;
const insideBias = isWide ? 0.34 : 0.58;
const goalSideX = (meters) => target.x - sign * meters;
const passLaneMidpoint = {
x: lerp(context.startPoint.x, target.x, 0.58),
y: lerp(context.startPoint.y, target.y, 0.58),
};
const points = {
firstTouchPress: {
x: goalSideX(context.mode === "lineBreak" ? 0.85 : 1.25),
y: lerp(target.y, pitch.width / 2, isWide ? 0.08 : 0.16),
},
insideLock: {
x: goalSideX(isWide ? 4.6 : 5.4),
y: lerp(target.y, pitch.width / 2, insideBias),
},
bounceLock: {
x: passLaneMidpoint.x - sign * 1.7,
y: lerp(passLaneMidpoint.y, pitch.width / 2, 0.28),
},
outsideTrap: {
x: goalSideX(3.2),
y: clamp(target.y + sideSign * (isWide ? 3.8 : 7.2), 3.5, pitch.width - 3.5),
},
depthCover: {
x: lerp(target.x, ownGoal.x, context.mode === "lineBreak" ? 0.42 : 0.3),
y: lerp(target.y, pitch.width / 2, isWide ? 0.42 : 0.34),
},
weakSideTuck: {
x: lerp(target.x, ownGoal.x, 0.34),
y: clamp(pitch.width / 2 - sideSign * (isWide ? 8.8 : 11.2), 7.5, pitch.width - 7.5),
},
};
return clampToPitch(points[slot] ?? points.insideLock, 2.2);
}
function applyDefensiveReceptionTrapTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveReceptionTrapContext(teamId, ballPoint, profile);
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
const firstTouchPoint = getDefensiveReceptionTrapTarget(teamId, context, "firstTouchPress");
if (presser && !isGoalkeeper(presser)) {
targets.set(presser.id, firstTouchPoint);
assignedIds.add(presser.id);
labels.push("Press first touch");
} else {
const firstPress = pickDefensiveAutopilotPlayer(
groups,
context.targetIsWide ? ["midfield", "back", "forward"] : ["midfield", "forward", "back"],
assignedIds,
firstTouchPoint,
context.targetIsWide ? ["WB", "LB", "RB", "W", "8"] : ["6", "8", "10", "9"]
);
if (firstPress) {
targets.set(firstPress.id, firstTouchPoint);
assignedIds.add(firstPress.id);
presser = firstPress;
labels.push("Press first touch");
}
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveReceptionTrapTarget(teamId, context, slot);
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
assign("insideLock", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Lock inside shoulder");
assign("bounceLock", ["forward", "midfield"], ["9", "10", "8", "W", "6"], "Block bounce pass");
if (context.mode === "wideTrap") {
assign("outsideTrap", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Trap touchline side");
assign("weakSideTuck", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Far side tucks in");
} else {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover turn and run");
if (context.mode === "lineBreak" || context.targetThreat.box >= 0.24) {
assign("weakSideTuck", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Far side tucks in");
}
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.target,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveReceptionTrapContext,
    getDefensiveReceptionTrapTarget,
    applyDefensiveReceptionTrapTargets,
  };
}
