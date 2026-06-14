export function createGameSimulatorAutopilotDefensiveOpenPlayTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getTeamDefenseStyleKey,
    getWideSideSign,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveOpenPlayTriggerContext(teamId, ballPoint, profile) {
if (state.restartPhase?.type) {
return { active: false };
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const attackingTeamId = getOtherTeamId(teamId);
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position;
const targetPoint = actionMeta.target ?? ballPoint;
if (!attackingTeamId || !startPoint || !targetPoint) {
return { active: false };
}
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const lateralShift = Math.abs(targetPoint.y - startPoint.y);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const startThreat = getPitchThreatProfile(startPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const targetCentrality = 1 - Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const wideRatio = Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const actionType = actionMeta.actionType ?? state.ball.actionType;
const styleKey = profile.styleKey ?? getTeamDefenseStyleKey(teamId);
const highPressStyle = ["high-press", "gegenpress", "counter-press", "press-trap-wide"].includes(styleKey);
const deepProtectStyle = ["low-block", "protect-box", "park-the-bus", "catenaccio"].includes(styleKey);
const centralEntry =
targetCentrality >= 0.48 &&
forwardGain >= 5 &&
(targetThreat.centralPocket >= 0.3 || targetThreat.betweenLines >= 0.46 || ballFromOwnGoal <= 47);
const boxThreat =
targetThreat.box >= 0.28 ||
targetThreat.centralPocket >= 0.48 ||
targetThreat.cutbackZone >= 0.46 ||
(targetCentrality >= 0.62 && ballFromOwnGoal <= 32);
const wideEntry =
wideRatio >= 0.58 &&
ballFromOwnGoal <= 62 &&
(forwardGain >= 2 || actionType === "dribble" || targetThreat.assistZone >= 0.34);
const backwardsCue =
forwardGain <= -4.5 &&
lateralShift <= 18 &&
ballFromOwnGoal >= 42 &&
profile.pressingIntensity >= 0.52;
const lineBreakDanger =
forwardGain >= 10 &&
targetThreat.value >= 0.42 &&
ballFromOwnGoal <= 55;
let mode = null;
if (boxThreat || centralEntry) {
mode = deepProtectStyle && !highPressStyle ? "collapseGoldenZone" : "centralJump";
} else if (wideEntry) {
mode = styleKey === "press-trap-wide" || highPressStyle || profile.pressingIntensity >= 0.56
? "wideTrap"
: "wideDelay";
} else if (backwardsCue) {
mode = "stepOnBackwardPass";
} else if (lineBreakDanger) {
mode = "recoverLineBreak";
}
if (!mode) {
return { active: false };
}
return {
active: true,
mode,
actionMeta,
attackingTeamId,
startPoint: cloneVector(startPoint),
ballPoint: cloneVector(targetPoint),
forwardGain,
lateralShift,
targetThreat,
startThreat,
ballFromOwnGoal,
targetCentrality,
wideRatio,
sideSign: getWideSideSign(targetPoint) || getWideSideSign(startPoint) || 1,
highPressStyle,
deepProtectStyle,
};
}
function getDefensiveOpenPlayTriggerTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ballPoint = context.ballPoint;
const sideSign = context.sideSign || 1;
const points = {
centralPress: {
x: ballPoint.x - sign * 1.2,
y: lerp(ballPoint.y, pitch.width / 2, 0.18),
},
goldenScreen: {
x: lerp(ballPoint.x, ownGoal.x, 0.22),
y: lerp(ballPoint.y, pitch.width / 2, 0.74),
},
cutbackScreen: {
x: lerp(ballPoint.x, ownGoal.x, 0.34),
y: pitch.width / 2 + sideSign * 5.8,
},
centerBackCover: {
x: lerp(ballPoint.x, ownGoal.x, 0.46),
y: pitch.width / 2 - sideSign * 4.2,
},
widePress: {
x: ballPoint.x - sign * 1.1,
y: clamp(ballPoint.y - sideSign * 1.5, 3.2, pitch.width - 3.2),
},
touchlineLock: {
x: ballPoint.x - sign * 5.2,
y: clamp(ballPoint.y - sideSign * 7.2, 5, pitch.width - 5),
},
insideCover: {
x: ballPoint.x - sign * 8.2,
y: lerp(ballPoint.y, pitch.width / 2, 0.56),
},
farSideTuck: {
x: lerp(ballPoint.x, ownGoal.x, 0.36),
y: pitch.width / 2 - sideSign * 10.2,
},
stepPress: {
x: ballPoint.x - sign * 1.7,
y: lerp(ballPoint.y, pitch.width / 2, 0.12),
},
squeezeLine: {
x: ballPoint.x - sign * 9.5,
y: pitch.width / 2,
},
recoveryRun: {
x: lerp(ballPoint.x, ownGoal.x, 0.52),
y: lerp(ballPoint.y, pitch.width / 2, 0.46),
},
};
return clampToPitch(points[slot] ?? points.goldenScreen, 2.2);
}
function applyDefensiveOpenPlayTriggerTargets(teamId, targets, groups, basePresser, ballPoint, profile) {
const context = getDefensiveOpenPlayTriggerContext(teamId, ballPoint, profile);
if (!context.active) {
return {
active: false,
presser: basePresser,
labels: [],
focusPoint: null,
protectedIds: new Set([basePresser?.id].filter(Boolean)),
};
}
const labels = [];
const excludedIds = new Set(groups.gk.map((goalkeeper) => goalkeeper.id));
let presser = basePresser;
if (basePresser) {
excludedIds.add(basePresser.id);
}
const assign = (slot, lineKeys, preferLabels, label, replacePresser = false) => {
const target = getDefensiveOpenPlayTriggerTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, target, preferLabels);
if (!player) {
return null;
}
targets.set(player.id, target);
excludedIds.add(player.id);
if (label) {
labels.push(label);
}
if (replacePresser) {
presser = player;
}
return player;
};
if (context.mode === "centralJump") {
if (!presser) {
assign("centralPress", ["midfield", "forward"], ["6", "8", "10", "9"], "Jump on central entry", true);
} else {
targets.set(presser.id, getDefensiveOpenPlayTriggerTarget(teamId, context, "centralPress"));
labels.push("Jump on central entry");
}
assign("goldenScreen", ["midfield"], ["6", "8"], `Close ${context.targetThreat.primaryLabel}`);
assign("centerBackCover", ["back"], ["CB"], "Cover the line behind");
assign("cutbackScreen", ["midfield", "back"], ["6", "8", "LB", "RB", "WB"], "Cutback screen");
} else if (context.mode === "collapseGoldenZone") {
assign("goldenScreen", ["midfield"], ["6", "8"], `Collapse ${context.targetThreat.primaryLabel}`);
assign("centerBackCover", ["back"], ["CB"], "Protect penalty spot");
assign("cutbackScreen", ["midfield", "back"], ["6", "8", "CB"], "Cutback screen");
if (presser) {
targets.set(presser.id, getDefensiveOpenPlayTriggerTarget(teamId, context, "centralPress"));
}
} else if (context.mode === "wideTrap" || context.mode === "wideDelay") {
if (!presser || context.mode === "wideTrap") {
assign("widePress", ["midfield", "forward", "back"], ["W", "WB", "LB", "RB", "8"], context.mode === "wideTrap" ? "Wide trap press" : "Delay wide entry", true);
} else {
targets.set(presser.id, getDefensiveOpenPlayTriggerTarget(teamId, context, "widePress"));
labels.push("Delay wide entry");
}
assign("touchlineLock", ["midfield", "back"], ["WB", "LB", "RB", "W"], "Lock touchline");
assign("insideCover", ["midfield"], ["6", "8", "10"], "Protect inside lane");
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side tucks in");
} else if (context.mode === "stepOnBackwardPass") {
assign("stepPress", ["forward", "midfield"], ["9", "10", "W", "8"], "Step on backward pass", true);
assign("squeezeLine", ["midfield"], ["6", "8", "10"], "Squeeze midfield line");
assign("farSideTuck", ["back"], ["CB", "LB", "RB", "WB"], "Back line squeezes");
} else if (context.mode === "recoverLineBreak") {
if (presser) {
targets.set(presser.id, getDefensiveOpenPlayTriggerTarget(teamId, context, "centralPress"));
}
assign("recoveryRun", ["back"], ["CB", "LB", "RB", "WB"], "Recover behind line break");
assign("goldenScreen", ["midfield"], ["6", "8"], `Screen ${context.targetThreat.primaryLabel}`);
assign("cutbackScreen", ["midfield", "back"], ["6", "8", "CB"], "Protect cutback");
}
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.ballPoint,
protectedIds: excludedIds,
};
}

  return {
    getDefensiveOpenPlayTriggerContext,
    getDefensiveOpenPlayTriggerTarget,
    applyDefensiveOpenPlayTriggerTargets,
  };
}
