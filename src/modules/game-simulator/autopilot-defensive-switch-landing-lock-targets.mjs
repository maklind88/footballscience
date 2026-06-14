export function createGameSimulatorAutopilotDefensiveSwitchLandingLockTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlayerById,
    getRecentPossessionSteps,
    getRecordedStepDuration,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveSwitchLandingLockContext(defensiveTeamId, ballPoint, profile) {
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
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
profileLabel: state.ball.profileLabel,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (!["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const lastStep = getRecentPossessionSteps(attackingTeamId, 4)[0] ?? null;
if (!lastStep || lastStep.actionType !== "pass") {
return null;
}
const lastStart = lastStep.beforeSnapshot?.ball?.position;
const lastTarget = lastStep.target;
if (!lastStart || !lastTarget) {
return null;
}
const lastDistance = distance(lastStart, lastTarget);
const laneShift = Math.abs(getPitchLaneIndex(lastStart) - getPitchLaneIndex(lastTarget));
const lastPrincipleText = [
lastStep.profileKey,
lastStep.profileLabel,
lastStep.offensiveAutopilot?.principleKey,
lastStep.offensiveAutopilot?.principleLabel,
...(lastStep.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const wasSwitch =
(lastDistance >= 18 && laneShift >= 2) ||
lastPrincipleText.includes("switch") ||
lastPrincipleText.includes("weak-side") ||
lastPrincipleText.includes("far side");
if (!wasSwitch || getRecordedStepDuration(lastStep) > 5.4) {
return null;
}
const actionStart =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
lastTarget;
const actionTarget = actionMeta.target ?? ballPoint ?? state.ball.target ?? actionStart;
const currentOwnerId =
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId;
const lastReceiverId =
lastStep.receiverPlayerId ??
lastStep.afterSnapshot?.ball?.ownerPlayerId ??
null;
const currentOwner = getPlayerById(currentOwnerId);
const ownerMatchesLanding =
!!lastReceiverId &&
(
currentOwnerId === lastReceiverId ||
actionMeta.carrierPlayerId === lastReceiverId ||
state.ball.carrierPlayerId === lastReceiverId ||
state.ball.ownerPlayerId === lastReceiverId
);
const nearLanding =
distance(actionStart, lastTarget) <= 10 ||
(currentOwner?.team === attackingTeamId && distance(currentOwner.position, lastTarget) <= 11);
if (!ownerMatchesLanding && !nearLanding) {
return null;
}
const threatPoint = actionType === "shot" ? actionStart : actionTarget;
const targetThreat = getPitchThreatProfile(threatPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(actionStart, threatPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, threatPoint);
const forwardGain = (threatPoint.x - actionStart.x) * getAttackDirectionSign(attackingTeamId);
const sideSign =
getWideSideSign(actionStart) ||
getWideSideSign(threatPoint) ||
getWideSideSign(lastTarget) ||
1;
const targetIsWide = isWidePrincipleZone(actionStart) || isWidePrincipleZone(threatPoint);
const finalThirdCue =
ballFromOwnGoal <= 42 ||
targetThreat.assistZone >= 0.28 ||
targetThreat.cutbackZone >= 0.18 ||
targetThreat.box >= 0.12;
const lockNeed = clamp(
targetThreat.value * 0.42 +
targetThreat.cutbackZone * 0.34 +
targetThreat.assistZone * 0.22 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.28 +
clamp(forwardGain / 18, 0, 1) * 0.18 +
(targetIsWide ? 0.14 : 0.04) +
(finalThirdCue ? 0.18 : 0),
0,
1.35
);
if (lockNeed < 0.34 && !targetIsWide) {
return null;
}
return {
actionMeta,
actionSpace,
actionStart: cloneVector(actionStart),
actionTarget: cloneVector(actionTarget),
actionType,
attackingTeamId,
ballFromOwnGoal,
finalThirdCue,
forwardGain,
laneShift,
lastDistance,
lastStart: cloneVector(lastStart),
lastTarget: cloneVector(lastTarget),
lockNeed,
sideSign,
targetIsWide,
targetThreat,
threatPoint: cloneVector(threatPoint),
};
}
function getDefensiveSwitchLandingLockTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.actionStart;
const threat = context.threatPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const ballToThreat = {
x: lerp(ball.x, threat.x, context.actionType === "dribble" ? 0.45 : 0.62),
y: lerp(ball.y, threat.y, context.actionType === "dribble" ? 0.45 : 0.62),
};
const lineCoverRatio = context.finalThirdCue ? 0.45 : 0.34;
const points = {
firstPressure: {
...goalSideOf(ball, context.targetIsWide ? 1.25 : 1.55),
y: lerp(ball.y, pitch.width / 2, context.targetIsWide ? 0.1 : 0.2),
},
outsideContain: {
x: ball.x - sign * 2.6,
y: clamp(ball.y + sideSign * 4.5, 3.5, pitch.width - 3.5),
},
insideGate: {
x: ballToThreat.x - sign * (context.finalThirdCue ? 4.6 : 5.8),
y: lerp(ballToThreat.y, pitch.width / 2, context.targetIsWide ? 0.72 : 0.86),
},
bounceScreen: {
x: ball.x - sign * (context.finalThirdCue ? 7.4 : 8.8),
y: lerp(ball.y, pitch.width / 2 - sideSign * 2.5, 0.58),
},
cutbackGate: {
x: lerp(threat.x, ownGoal.x, context.finalThirdCue ? 0.34 : 0.25),
y: clamp(pitch.width / 2 + sideSign * 5.8, 10, pitch.width - 10),
},
backLineSlide: {
x: lerp(threat.x, ownGoal.x, lineCoverRatio),
y: lerp(threat.y, pitch.width / 2, context.targetIsWide ? 0.42 : 0.3),
},
farPostTuck: {
x: lerp(threat.x, ownGoal.x, context.finalThirdCue ? 0.48 : 0.38),
y: clamp(pitch.width / 2 - sideSign * (context.finalThirdCue ? 8.4 : 10.8), 7, pitch.width - 7),
},
oldSideBalance: {
x: lerp(ball.x, ownGoal.x, context.finalThirdCue ? 0.38 : 0.28),
y: clamp(pitch.width / 2 - sideSign * (context.finalThirdCue ? 6.8 : 11.5), 8, pitch.width - 8),
},
};
return clampToPitch(points[slot] ?? points.insideGate, 2.2);
}
function applyDefensiveSwitchLandingLockTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveSwitchLandingLockContext(teamId, ballPoint, profile);
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
const target = getDefensiveSwitchLandingLockTarget(teamId, context, slot);
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
const pressureTarget = getDefensiveSwitchLandingLockTarget(teamId, context, "firstPressure");
const baseCanPress =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, pressureTarget) <= (context.finalThirdCue ? 20 : 24);
if (baseCanPress) {
targets.set(presser.id, pressureTarget);
assignedIds.add(presser.id);
labels.push("Switch landing lock: pressure first touch");
} else {
const firstPress = assign(
"firstPressure",
context.targetIsWide ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.targetIsWide ? ["WB", "LB", "RB", "W", "8"] : ["6", "8", "10", "CB"],
"Switch landing lock: pressure first touch"
);
presser = firstPress ?? presser;
}
if (context.targetIsWide) {
assign("outsideContain", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Switch landing lock: contain outside");
}
assign("insideGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Switch landing lock: close inside gate");
assign("bounceScreen", ["midfield", "forward"], ["6", "8", "10", "9", "W"], "Switch landing lock: block bounce pass");
assign("backLineSlide", ["back"], ["CB", "LB", "RB", "WB"], "Switch landing lock: back line slides");
if (context.finalThirdCue || context.targetThreat.cutbackZone >= 0.16 || context.targetThreat.assistZone >= 0.24) {
assign("cutbackGate", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Switch landing lock: protect cutback");
assign("farPostTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Switch landing lock: far post tuck");
}
assign("oldSideBalance", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Switch landing lock: old side balances");
if (labels.length) {
labels.unshift(
context.finalThirdCue
? "Lock far-side attack after switch"
: "Lock switch landing"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.actionStart,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveSwitchLandingLockContext,
    getDefensiveSwitchLandingLockTarget,
    applyDefensiveSwitchLandingLockTargets,
  };
}
