export function createGameSimulatorAutopilotDefensiveTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneRestartPhase,
    cloneVector,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAutoPilotPossessionRouteStage,
    getAutoPilotShotTarget,
    getBallTravelProgress,
    getCornerKickSpot,
    getDefendingDirectionSign,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveUnitGap,
    getDepthX,
    getDistanceFromOwnGoal,
    getLaneCenterY,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPossessionRhythmContext,
    getRecentPossessionSteps,
    getRecordedStepDuration,
    getRecordedStepPattern,
    getRecordedStepPossessionTeamId,
    getSecondBallAnticipationContext,
    getShotAngleQuality,
    getShotWindowProfile,
    getSnapshotPlayerMap,
    getTeamDefenseStyleKey,
    getTeamDefenseStyleProfile,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isAerialFlightStyle,
    isGoalkeeper,
    isTransitionAttackStyle,
    isWideChannel,
    isWidePrincipleZone,
    lerp,
    moveTowards,
    normalize,
    pitch,
    playerRadiusMeters,
    projectPointOnSegmentWithRatio,
    teams,
    uniquePrincipleLabels,
    vec,
    getState,
  } = deps;
  const state = new Proxy({}, {
    get(_target, property) {
      return getState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const currentState = getState?.() ?? {};
      if (!Object.prototype.hasOwnProperty.call(currentState, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentState[property],
      };
    },
  });

function getDefensiveBackLineHandoverContext(teamId, ballPoint, profile) {
if (!ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
const actionType = actionMeta.actionType ?? state.ball.actionType;
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const threats = getDefensiveRunnerThreats(teamId, ballPoint, profile);
const primaryThreat =
threats.find((threat) => threat.isBlindsideRun || threat.isChannelRun) ??
threats.find((threat) => threat.isDepthThreat || threat.isBoxThreat) ??
threats[0] ??
null;
const hasDepthCue =
principleText.includes("blindside") ||
principleText.includes("channel") ||
principleText.includes("run behind") ||
principleText.includes("line break") ||
principleText.includes("depth");
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const shouldCoordinate =
primaryThreat?.isBlindsideRun ||
primaryThreat?.isChannelRun ||
primaryThreat?.isDepthThreat ||
primaryThreat?.isBoxThreat ||
targetThreat.behindLine >= 0.22 ||
forwardGain >= 6.5 ||
(hasDepthCue && forwardGain >= 2.5);
if (!shouldCoordinate || actionType === "shot") {
return null;
}
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const phaseDrop =
profile.phaseKey === "boxDefending"
? 1.1
: profile.phaseKey === "lowBlock"
? 1.6
: profile.phaseKey === "highPress"
? 2.8
: 2.2;
const lineBreakDrop =
primaryThreat?.isBlindsideRun || targetThreat.behindLine >= 0.32
? 2.8
: primaryThreat?.isChannelRun || forwardGain >= 8
? 2.2
: 1.35;
const dropDepth = clamp(phaseDrop + lineBreakDrop + Math.max(0, forwardGain - 6) * 0.08, 1.4, 6.8);
const sideSign =
getWideSideSign(primaryThreat?.player) ||
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
return {
targetPoint,
primaryThreat,
sideSign,
dropDepth,
ballFromOwnGoal,
isChannelThreat: !!(primaryThreat?.isBlindsideRun || primaryThreat?.isChannelRun),
isDeepThreat: !!(primaryThreat?.isDepthThreat || targetThreat.behindLine >= 0.22 || forwardGain >= 6.5),
};
}
function applyDefensiveBackLineHandoverTargets(
teamId,
targets,
groups,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveBackLineHandoverContext(teamId, ballPoint, profile);
if (!context) {
return [];
}
const labels = [];
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const backPlayers = (groups.back ?? []).filter((player) => !isGoalkeeper(player));
const midfieldPlayers = (groups.midfield ?? []).filter((player) => !isGoalkeeper(player));
if (!backPlayers.length) {
return [];
}
const baseBackDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const backDepth = clamp(
baseBackDepth - context.dropDepth,
profile.minBackLineFromOwnGoal ?? 6,
profile.maxBackLineFromOwnGoal ?? 64
);
const gap = clamp(getDefensiveUnitGap(profile, "back"), 7.2, 9);
const lineWidth = gap * Math.max(0, backPlayers.length - 1);
const runnerY = context.primaryThreat?.player?.position?.y ?? context.targetPoint.y;
const centerY = clamp(
lerp(pitch.width / 2, lerp(context.targetPoint.y, runnerY, 0.62), context.isChannelThreat ? 0.38 : 0.24),
Math.max(4, lineWidth / 2 + 3),
pitch.width - Math.max(4, lineWidth / 2 + 3)
);
const orderedBacks = [...backPlayers].sort((a, b) => (targets.get(a.id)?.y ?? a.position.y) - (targets.get(b.id)?.y ?? b.position.y));
orderedBacks.forEach((player, index) => {
if (protectedIds.has(player.id) || !targets.has(player.id)) {
return;
}
const spreadRatio = orderedBacks.length === 1 ? 0.5 : index / (orderedBacks.length - 1);
const slotY = clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.5, pitch.width - 3.5);
const isBallSide = Math.sign(slotY - pitch.width / 2) === context.sideSign;
const channelNudge = context.isChannelThreat && isBallSide
? (runnerY - slotY) * 0.24
: (pitch.width / 2 - slotY) * 0.08;
const currentTarget = targets.get(player.id) ?? player.position;
const slot = clampToPitch({
x: ownGoal.x + sign * (backDepth + (isBallSide ? 0.35 : -0.45)),
y: clamp(slotY + channelNudge, 3.5, pitch.width - 3.5),
}, 2.2);
targets.set(player.id, clampToPitch({
x: lerp(currentTarget.x, slot.x, 0.78),
y: lerp(currentTarget.y, slot.y, 0.74),
}, 2.2));
});
if (midfieldPlayers.length && context.isDeepThreat) {
const screenDepth = clamp(backDepth + (profile.backToMidfield ?? 10) * 0.72, backDepth + 5.5, backDepth + 12);
const midfieldGap = clamp(getDefensiveUnitGap(profile, "midfield"), 7.2, 9.5);
const screenWidth = midfieldGap * Math.max(0, midfieldPlayers.length - 1);
const screenCenterY = clamp(
lerp(pitch.width / 2, context.targetPoint.y, 0.26),
Math.max(5, screenWidth / 2 + 3),
pitch.width - Math.max(5, screenWidth / 2 + 3)
);
const orderedMidfield = [...midfieldPlayers].sort((a, b) => (targets.get(a.id)?.y ?? a.position.y) - (targets.get(b.id)?.y ?? b.position.y));
orderedMidfield.forEach((player, index) => {
if (protectedIds.has(player.id) || !targets.has(player.id)) {
return;
}
const spreadRatio = orderedMidfield.length === 1 ? 0.5 : index / (orderedMidfield.length - 1);
const currentTarget = targets.get(player.id) ?? player.position;
const slot = clampToPitch({
x: ownGoal.x + sign * screenDepth,
y: clamp(screenCenterY - screenWidth / 2 + screenWidth * spreadRatio, 4, pitch.width - 4),
}, 2.2);
targets.set(player.id, clampToPitch({
x: lerp(currentTarget.x, slot.x, 0.42),
y: lerp(currentTarget.y, slot.y, 0.38),
}, 2.2));
});
}
labels.push(context.isChannelThreat ? "Back line handover against channel run" : "Back line drops against depth threat");
if (context.isDeepThreat) {
labels.push("Midfield screens second ball behind line");
}
return uniquePrincipleLabels(labels);
}
function getDefensiveLineActionLabels(profile) {
const label = profile.lineActionAdjustment?.label;
return label ? [label] : [];
}
function getDefensiveGoalkeeperTarget(teamId, ballPoint, profile = getDefensiveAutopilotProfile(teamId, ballPoint)) {
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const sweepDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "gk", ballPoint, profile);
const yClamp = profile.phaseKey === "boxDefending" ? [22.5, 45.5] : [28.5, 39.5];
const yInfluence = profile.phaseKey === "boxDefending" ? 0.28 : 0.12;
const y = clamp(lerp(pitch.width / 2, ballPoint.y, yInfluence), yClamp[0], yClamp[1]);
return clampToPitch({
x: ownGoalX + sign * sweepDepth,
y,
}, 3);
}
function getDefensiveGoalkeeperSweeperContext(teamId, goalkeeper, ballPoint, profile) {
if (!goalkeeper || !ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
targetKind: state.ball.targetKind,
profileKey: state.ball.profileKey,
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
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!targetPoint || !startPoint || !["pass", "dribble"].includes(actionType)) {
return null;
}
const targetFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const startFromOwnGoal = getDistanceFromOwnGoal(teamId, startPoint);
const actionDistance = distance(startPoint, targetPoint);
const actionSpeed = Math.max(actionMeta.speed ?? state.ball.speed ?? state.ball.currentSpeed ?? 10, 0.1);
const eta = actionDistance / actionSpeed;
const profileText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const centrality = 1 - Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const ballMovingTowardGoal = targetFromOwnGoal <= startFromOwnGoal - 3 || forwardGain >= 5;
const isAerialDelivery =
isAerialFlightStyle(state.ball.flightStyle) ||
profileText.includes("cross") ||
profileText.includes("delivery") ||
profileText.includes("lofted") ||
profileText.includes("clipped");
const isThroughThreat =
ballMovingTowardGoal &&
(
targetThreat.behindLine >= 0.2 ||
targetThreat.box >= 0.18 ||
profileText.includes("through") ||
profileText.includes("line-break") ||
profileText.includes("into-space") ||
profileText.includes("run behind") ||
profileText.includes("channel")
);
const isCrossClaim =
actionType === "pass" &&
targetFromOwnGoal <= 18.5 &&
isAerialDelivery &&
(centrality >= 0.24 || targetThreat.box >= 0.16);
const isBreakawayDribble =
actionType === "dribble" &&
targetFromOwnGoal <= 24 &&
ballMovingTowardGoal &&
centrality >= 0.18;
if (!isThroughThreat && !isCrossClaim && !isBreakawayDribble) {
return null;
}
const baseTarget = getDefensiveGoalkeeperTarget(teamId, ballPoint, profile);
const maxSweepDepth =
profile.phaseKey === "highPress"
? 24
: profile.phaseKey === "midBlock"
? 19
: profile.phaseKey === "lowBlock"
? 15
: 11.5;
const desiredDepth = isCrossClaim
? clamp(targetFromOwnGoal * 0.46 + 3.4, 5.4, 11.8)
: isBreakawayDribble
? clamp(targetFromOwnGoal * 0.52 + 2.2, 6.2, 13.4)
: clamp(targetFromOwnGoal - 2.6, 8.2, maxSweepDepth);
const yInfluence = isCrossClaim ? 0.48 : isBreakawayDribble ? 0.62 : 0.72;
const yClamp = isCrossClaim
? [19.5, 48.5]
: isBreakawayDribble
? [20.5, 47.5]
: [13.5, 54.5];
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const desiredTarget = clampToPitch({
x: ownGoal.x + sign * desiredDepth,
y: clamp(lerp(pitch.width / 2, targetPoint.y, yInfluence), yClamp[0], yClamp[1]),
}, 2.5);
const timeToTarget = computeTimeToCoverDistance(
goalkeeper,
distance(goalkeeper.position, desiredTarget),
desiredTarget
);
const access = clamp((eta + 0.45) / Math.max(timeToTarget, 0.01), 0.22, 1);
const target = clampToPitch({
x: lerp(baseTarget.x, desiredTarget.x, access),
y: lerp(baseTarget.y, desiredTarget.y, access),
}, 2.5);
const label = isCrossClaim
? "GK claims box delivery"
: isBreakawayDribble
? "GK narrows breakaway angle"
: "GK sweeps behind back line";
return {
target,
label,
focusPoint: targetPoint,
};
}
function applyDefensiveGoalkeeperSweeperTarget(teamId, targets, groups, ballPoint, profile) {
const labels = [];
groups.gk.forEach((goalkeeper) => {
const context = getDefensiveGoalkeeperSweeperContext(teamId, goalkeeper, ballPoint, profile);
if (!context) {
return;
}
targets.set(goalkeeper.id, context.target);
labels.push(context.label);
});
return uniquePrincipleLabels(labels);
}
function getDefensiveGoalkeeperShotSetContext(teamId, goalkeeper, ballPoint, profile) {
if (!goalkeeper || !ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
targetKind: state.ball.targetKind,
profileKey: state.ball.profileKey,
profileLabel: state.ball.profileLabel,
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (!["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const threatPoint = actionType === "shot" ? startPoint : targetPoint;
const threat = getPitchThreatProfile(threatPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, threatPoint);
const goalDistance = distance(threatPoint, getOwnGoalCenter(teamId));
const profileText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isCutback =
profileText.includes("cutback") ||
threat.cutbackZone >= 0.24;
const isBoxDelivery =
profileText.includes("cross") ||
profileText.includes("delivery") ||
threat.assistZone >= 0.36 ||
(actionType === "pass" && threat.box >= 0.18);
const isShotThreat =
actionType === "shot" ||
profileText.includes("shoot") ||
profileText.includes("finish") ||
threat.box >= 0.2 ||
(ballFromOwnGoal <= 31 && threat.centralPocket >= 0.24);
const isBreakaway =
actionType === "dribble" &&
ballFromOwnGoal <= 25 &&
(threat.box >= 0.12 || threat.centralPocket >= 0.22);
const shouldSet =
isShotThreat ||
isCutback ||
isBoxDelivery ||
isBreakaway ||
(ballFromOwnGoal <= 28 && threat.value >= 0.42);
if (!shouldSet) {
return null;
}
const actionDistance = distance(startPoint, targetPoint);
const actionSpeed = Math.max(actionMeta.speed ?? state.ball.speed ?? state.ball.currentSpeed ?? 10, 0.1);
const eta = actionDistance / actionSpeed;
const sideSign =
getWideSideSign(threatPoint) ||
getWideSideSign(targetPoint) ||
1;
return {
actionType,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
threatPoint: cloneVector(threatPoint),
threat,
ballFromOwnGoal,
goalDistance,
eta,
sideSign,
isShotThreat,
isCutback,
isBoxDelivery,
isBreakaway,
phaseKey: profile.phaseKey,
};
}
function getDefensiveGoalkeeperShotSetTarget(teamId, goalkeeper, context, baseTarget) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const centerY = pitch.width / 2;
const sideDistance = Math.abs(context.threatPoint.y - centerY);
const wideRatio = clamp(sideDistance / (pitch.width / 2), 0, 1);
const nearPostLock = context.isShotThreat && wideRatio >= 0.52;
const depth =
context.isBoxDelivery && !context.isShotThreat
? clamp(context.ballFromOwnGoal * 0.24 + 2.4, 3.2, 8.8)
: context.isBreakaway
? clamp(context.ballFromOwnGoal * 0.32 + 1.7, 3.4, 9.2)
: context.isCutback
? clamp(context.ballFromOwnGoal * 0.18 + 2.1, 2.4, 6.8)
: clamp(context.ballFromOwnGoal * 0.16 + 1.45, 1.8, 7.4);
const yPull =
context.isBoxDelivery && !context.isShotThreat
? 0.3
: context.isCutback
? 0.24
: nearPostLock
? 0.42
: 0.32;
const nearPostBias = nearPostLock
? context.sideSign * clamp(0.75 + wideRatio * 1.65, 0.75, 2.25)
: 0;
const yLimit =
context.isBoxDelivery && !context.isShotThreat
? 7.2
: context.isBreakaway
? 6.2
: nearPostLock
? 4.7
: 4.15;
const desiredTarget = clampToPitch({
x: ownGoal.x + sign * depth,
y: clamp(
lerp(centerY, context.threatPoint.y, yPull) + nearPostBias,
centerY - yLimit,
centerY + yLimit
),
}, 1.6);
const timeToTarget = computeTimeToCoverDistance(
goalkeeper,
distance(goalkeeper.position, desiredTarget),
desiredTarget
);
const access = clamp((context.eta + 0.42) / Math.max(timeToTarget, 0.01), 0.3, 1);
return clampToPitch({
x: lerp(baseTarget.x, desiredTarget.x, access),
y: lerp(baseTarget.y, desiredTarget.y, access),
}, 1.6);
}
function applyDefensiveGoalkeeperShotSetTarget(teamId, targets, groups, ballPoint, profile) {
const labels = [];
groups.gk.forEach((goalkeeper) => {
const context = getDefensiveGoalkeeperShotSetContext(teamId, goalkeeper, ballPoint, profile);
if (!context) {
return;
}
const baseTarget = targets.get(goalkeeper.id) ?? getDefensiveGoalkeeperTarget(teamId, ballPoint, profile);
targets.set(goalkeeper.id, getDefensiveGoalkeeperShotSetTarget(teamId, goalkeeper, context, baseTarget));
labels.push(
context.isShotThreat
? "GK sets for shot"
: context.isCutback
? "GK protects cutback angle"
: context.isBreakaway
? "GK narrows breakaway"
: "GK adjusts to box delivery"
);
});
return uniquePrincipleLabels(labels);
}
function chooseDefensiveAutopilotPresser(teamId, ballPoint, targets, profile) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const candidates = state.players.filter(
(player) =>
player.team === teamId &&
getDefensiveAutopilotLineKey(player, formation, profile.phaseKey) !== "gk"
);
let bestCandidate = null;
let bestScore = Infinity;
candidates.forEach((player) => {
const lineKey = getDefensiveAutopilotLineKey(player, formation, profile.phaseKey);
const target = targets.get(player.id) ?? player.position;
let score =
distance(player.position, ballPoint) * 0.58 +
distance(target, ballPoint) * 0.42;
const isBallSide =
Math.sign(ballPoint.y - pitch.width / 2) === Math.sign(target.y - pitch.width / 2) ||
Math.abs(ballPoint.y - pitch.width / 2) < 6;
if (profile.phaseKey === "highPress" && lineKey !== "forward") {
score += 8;
}
if (profile.phaseKey === "midBlock" && lineKey === "back" && ballFromOwnGoal > 34) {
score += 4;
}
if (profile.phaseKey === "lowBlock" && lineKey === "forward") {
score += 5.5;
}
if (profile.phaseKey === "boxDefending" && lineKey === "forward") {
score += 7;
}
if (profile.phaseKey === "boxDefending" && lineKey === "back" && ballFromOwnGoal > 15) {
score += 2;
}
if ((profile.threatResponse?.protectCenter ?? 0) >= 0.42) {
const centralFit = 1 - Math.abs(target.y - pitch.width / 2) / (pitch.width / 2);
if (lineKey === "midfield") {
score -= centralFit * (1.7 + profile.threatResponse.protectCenter * 1.8);
} else if (lineKey === "back" && ballFromOwnGoal <= 38) {
score -= centralFit * (0.8 + profile.threatResponse.protectCenter * 1.1);
} else if (lineKey === "forward" && ballFromOwnGoal <= 44) {
score += 2.2 * profile.threatResponse.protectCenter;
}
}
if (isBallSide) {
score -= (profile.phaseKey === "highPress" ? 2.5 : 1.4) * (0.8 + profile.pressingIntensity * 0.5);
}
score -= profile.pressingIntensity * (lineKey === "forward" ? 1.2 : lineKey === "midfield" ? 0.7 : 0.35);
if (score < bestScore) {
bestScore = score;
bestCandidate = player;
}
});
return bestCandidate;
}
function getDefensivePressTarget(teamId, ballPoint, profile, presser = null) {
const sign = getDefendingDirectionSign(teamId);
const protectCenter = profile.threatResponse?.protectCenter ?? 0;
const ballSide = getWideSideSign(ballPoint);
const presserSide =
presser && Number.isFinite(presser.position?.y)
? Math.sign(presser.position.y - ballPoint.y)
: 0;
const centralApproachSide = presserSide || getWideSideSign(presser) || (ballPoint.y >= pitch.width / 2 ? 1 : -1);
const widePress = ballSide !== 0;
const side = widePress ? ballSide : centralApproachSide;
const insideShield = clamp(
widePress
? 2.1 + Math.abs(ballPoint.y - pitch.width / 2) * 0.055 + protectCenter * 2.4
: 0.9 + protectCenter * 1.35,
widePress ? 1.8 : 0.65,
widePress ? 5.4 : 2.8
);
const lineCushion =
profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending"
? 0.55
: profile.phaseKey === "highPress"
? -0.25
: 0;
return clampToPitch({
x: ballPoint.x - sign * clamp(profile.pressOffset + protectCenter * 0.75 + lineCushion, 0.7, 4.2),
y: widePress
? clamp(ballPoint.y - side * insideShield, 3, pitch.width - 3)
: clamp(ballPoint.y + side * insideShield, 3, pitch.width - 3),
}, 3);
}
function getDefensiveAngledPressTarget(teamId, ballPoint, profile, presser, baseTarget = null, reference = null) {
const sign = getDefendingDirectionSign(teamId);
const attackingTeamId = getOtherTeamId(teamId);
const threat = attackingTeamId ? getPitchThreatProfile(ballPoint, attackingTeamId) : null;
const basePressTarget = getDefensivePressTarget(teamId, ballPoint, profile, presser);
const ballSide = getWideSideSign(ballPoint);
const widePress = ballSide !== 0;
const protectCenter = profile.threatResponse?.protectCenter ?? 0;
const targetThreat = threat?.value ?? 0;
const dribbleContainment = !!reference;
const goalSideCushion = clamp(
(dribbleContainment ? 1.15 : 0.55) +
protectCenter * 0.65 +
targetThreat * 0.45 +
(profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending" ? 0.4 : 0),
0.45,
2.4
);
const currentTarget = baseTarget ?? basePressTarget;
const centralLaneWeight = widePress
? clamp(0.14 + protectCenter * 0.2 + targetThreat * 0.1, 0.12, 0.42)
: clamp(0.05 + protectCenter * 0.12, 0.04, 0.2);
const sideLockY = widePress
? lerp(basePressTarget.y, pitch.width / 2, centralLaneWeight)
: basePressTarget.y;
const target = clampToPitch({
x: lerp(currentTarget.x, basePressTarget.x - sign * goalSideCushion, 0.82),
y: lerp(currentTarget.y, sideLockY, widePress ? 0.82 : 0.68),
}, 2.4);
return {
target,
label: widePress
? "Curve press to lock inside"
: dribbleContainment
? "Angle contain pressure"
: "Angled press cover shadow",
};
}
function applyDefensivePresserAngleTarget(
teamId,
targets,
presser,
ballPoint,
profile,
reference = null
) {
if (!presser || isGoalkeeper(presser) || !ballPoint || state.restartPhase?.type) {
return {
labels: [],
protectedIds: new Set([presser?.id].filter(Boolean)),
};
}
const currentTarget = targets.get(presser.id) ?? getDefensivePressTarget(teamId, ballPoint, profile, presser);
const angleProfile = getDefensiveAngledPressTarget(
teamId,
ballPoint,
profile,
presser,
currentTarget,
reference
);
const angleWeight = reference
? 0.34
: profile.phaseKey === "highPress"
? 0.56
: profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending"
? 0.42
: 0.5;
targets.set(presser.id, clampToPitch({
x: lerp(currentTarget.x, angleProfile.target.x, angleWeight),
y: lerp(currentTarget.y, angleProfile.target.y, angleWeight),
}, 2.2));
return {
labels: [angleProfile.label],
protectedIds: new Set([presser.id]),
};
}
function getGoalkeeperBuildOutPressContext(defensiveTeamId, ballPoint) {
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
receiverPlayerId: state.ball.receiverPlayerId,
beforeSnapshot: {
ball: {
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const attackingTeamId = getOtherTeamId(defensiveTeamId);
const goalkeeper = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
if (
actionMeta.actionType !== "pass" ||
!goalkeeper ||
!isGoalkeeper(goalkeeper) ||
goalkeeper.team !== attackingTeamId
) {
return null;
}
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const startPoint = actionMeta.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? goalkeeper.position;
const target = actionMeta.target ?? ballPoint;
const passDistance = distance(startPoint, target);
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
]
.filter(Boolean)
.join(" ")
.toLowerCase();
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[attackingTeamId]?.formation) : null;
const directRelease =
principleText.includes("gk release") ||
(!receiver && passDistance >= 24) ||
(receiverRoleKey && ["striker", "wideForward", "secondStriker"].includes(receiverRoleKey) && passDistance >= 24);
const shortBuild =
!directRelease &&
(principleText.includes("gk build") ||
!!receiver ||
passDistance <= 30);
if (!shortBuild && !directRelease) {
return null;
}
return {
actionMeta,
attackingTeamId,
goalkeeper,
receiver,
receiverRoleKey,
startPoint: cloneVector(startPoint),
target: cloneVector(target),
passDistance,
directRelease,
shortBuild,
sideSign: getWideSideSign(target) || getWideSideSign(receiver) || getWideSideSign(startPoint) || 1,
};
}
function pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, referencePoint, preferLabels = []) {
const labelPreference = new Set(preferLabels);
const candidates = lineKeys
.flatMap((lineKey) => groups[lineKey] ?? [])
.filter((player) => !excludedIds.has(player.id) && !isGoalkeeper(player));
if (!candidates.length) {
return null;
}
return candidates
.map((player) => {
const label = getPlayerMagnetLabel(player);
return {
player,
score:
distance(player.position, referencePoint) +
(labelPreference.has(label) ? -4.5 : 0) -
getPlayerDecisionContext(player).profile.tacticalDiscipline * 1.4 -
getPlayerDecisionContext(player).profile.decisionSpeed * 1.1,
};
})
.sort((a, b) => a.score - b.score)[0]?.player ?? null;
}
function getGoalkeeperBuildOutPressTarget(defensiveTeamId, context, slot) {
const sign = getDefendingDirectionSign(defensiveTeamId);
const target = context.target;
const sideSign = context.sideSign || 1;
const points = {
receiverPress: {
x: target.x - sign * 1.8,
y: lerp(target.y, pitch.width / 2, 0.16),
},
goalkeeperScreen: {
x: lerp(context.startPoint.x, target.x, 0.42) - sign * 1.4,
y: lerp(context.startPoint.y, target.y, 0.52),
},
pivotLock: {
x: lerp(context.startPoint.x, target.x, 0.72),
y: clamp(pitch.width / 2 - sideSign * 5.8, 17, pitch.width - 17),
},
farCenterBackLock: {
x: lerp(context.startPoint.x, target.x, 0.34),
y: clamp(pitch.width / 2 - sideSign * 15.5, 7, pitch.width - 7),
},
secondBallScreen: {
x: target.x - sign * 4.5,
y: clamp(lerp(target.y, pitch.width / 2, 0.42), 12, pitch.width - 12),
},
restCover: {
x: target.x - sign * 14,
y: clamp(pitch.width / 2, 15, pitch.width - 15),
},
};
return clampToPitch(points[slot] ?? points.receiverPress, 2.5);
}
function applyGoalkeeperBuildOutPressTargets(teamId, targets, groups, basePresser, ballPoint, profile) {
const context = getGoalkeeperBuildOutPressContext(teamId, ballPoint);
if (!context) {
return {
presser: basePresser,
labels: [],
};
}
const labels = [];
const excludedIds = new Set();
let presser = basePresser;
const firstPressPoint = getGoalkeeperBuildOutPressTarget(teamId, context, "receiverPress");
const firstPresser = pickDefensiveAutopilotPlayer(
groups,
profile.phaseKey === "highPress" ? ["forward", "midfield"] : ["forward"],
excludedIds,
firstPressPoint,
context.receiverRoleKey === "wideBack" || context.receiverRoleKey === "wideForward" ? ["W", "10"] : ["9", "10", "W"]
);
if (firstPresser) {
targets.set(firstPresser.id, firstPressPoint);
excludedIds.add(firstPresser.id);
presser = firstPresser;
labels.push(context.directRelease ? "Press second-ball release" : "Press GK first pass");
}
if (context.shortBuild) {
const screenForward = pickDefensiveAutopilotPlayer(
groups,
["forward"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "goalkeeperScreen"),
["9", "10"]
);
if (screenForward) {
targets.set(screenForward.id, getGoalkeeperBuildOutPressTarget(teamId, context, "goalkeeperScreen"));
excludedIds.add(screenForward.id);
labels.push("Screen pass back to GK");
}
const pivotLock = pickDefensiveAutopilotPlayer(
groups,
["midfield", "forward"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "pivotLock"),
["6", "8", "10"]
);
if (pivotLock) {
targets.set(pivotLock.id, getGoalkeeperBuildOutPressTarget(teamId, context, "pivotLock"));
excludedIds.add(pivotLock.id);
labels.push("Lock the 6");
}
const farLock = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "farCenterBackLock"),
["W", "8"]
);
if (farLock) {
targets.set(farLock.id, getGoalkeeperBuildOutPressTarget(teamId, context, "farCenterBackLock"));
excludedIds.add(farLock.id);
labels.push("Curve to far CB");
}
}
if (context.directRelease) {
const secondBall = pickDefensiveAutopilotPlayer(
groups,
["midfield"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "secondBallScreen"),
["6", "8"]
);
if (secondBall) {
targets.set(secondBall.id, getGoalkeeperBuildOutPressTarget(teamId, context, "secondBallScreen"));
excludedIds.add(secondBall.id);
labels.push("Win second ball");
}
const restCover = pickDefensiveAutopilotPlayer(
groups,
["back"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "restCover"),
["CB"]
);
if (restCover) {
targets.set(restCover.id, getGoalkeeperBuildOutPressTarget(teamId, context, "restCover"));
labels.push("Rest cover behind release");
}
}
return {
presser,
labels,
};
}
function getDefensiveThreatResponse(teamId, ballPoint = state.ball.target ?? state.ball.position) {
const attackingTeamId = getOtherTeamId(teamId);
const threat = attackingTeamId
? getPitchThreatProfile(ballPoint, attackingTeamId)
: {
value: 0,
goldenZone: 0,
centralPocket: 0,
betweenLines: 0,
box: 0,
assistZone: 0,
cutbackZone: 0,
halfSpace: 0,
centrality: 0,
depth: 0,
primaryLabel: "open space",
};
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const centrality = 1 - Math.abs(ballPoint.y - pitch.width / 2) / (pitch.width / 2);
const protectCenter = clamp(
threat.value * 0.52 +
threat.centralPocket * 0.3 +
threat.betweenLines * 0.2 +
threat.box * 0.42 +
threat.cutbackZone * 0.28 +
threat.halfSpace * 0.16 +
centrality * 0.12 -
(ballFromOwnGoal > 64 ? 0.16 : 0),
0,
1
);
const immediatePressure = clamp(
protectCenter * 0.72 +
threat.box * 0.26 +
(ballFromOwnGoal <= 35 ? 0.16 : 0) +
(threat.assistZone >= 0.45 ? 0.08 : 0),
0,
1
);
return {
threat,
protectCenter,
immediatePressure,
isGoldenZoneThreat: threat.centralPocket >= 0.42 || threat.betweenLines >= 0.54,
isBoxThreat: threat.box >= 0.34,
isWideAssistThreat: threat.assistZone >= 0.48,
ballFromOwnGoal,
};
}
function getDefensivePrioritySpacePoint(teamId, ballPoint, profile, slot = "screen") {
const attackingTeamId = getOtherTeamId(teamId);
const ownPenaltySpot = attackingTeamId
? getOpponentPenaltySpot(attackingTeamId)
: vec(teamId === "home" ? 11 : pitch.length - 11, pitch.width / 2);
const sign = getDefendingDirectionSign(teamId);
const protectCenter = profile.threatResponse?.protectCenter ?? 0;
const ballSide = getWideSideSign(ballPoint) || 1;
const points = {
screen: {
x: lerp(ballPoint.x, ownPenaltySpot.x, 0.28 + protectCenter * 0.18),
y: lerp(ballPoint.y, pitch.width / 2, 0.58 + protectCenter * 0.18),
},
cover: {
x: ownPenaltySpot.x + sign * 3.4,
y: pitch.width / 2,
},
farPost: {
x: ownPenaltySpot.x + sign * 1.2,
y: pitch.width / 2 - ballSide * 9.8,
},
cutback: {
x: ownPenaltySpot.x + sign * 8.8,
y: pitch.width / 2 + ballSide * 2.4,
},
};
return clampToPitch(points[slot] ?? points.screen, 3);
}
function pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, lineKeys, referencePoint) {
const candidates = lineKeys
.flatMap((lineKey) => groups[lineKey] ?? [])
.filter((player) => player.team === teamId && !excludedIds.has(player.id) && !isGoalkeeper(player));
if (!candidates.length) {
return null;
}
return candidates
.map((player) => {
const target = targets.get(player.id) ?? player.position;
const label = getPlayerMagnetLabel(player);
const centralRoleBonus = label === "6" || label === "8" || label === "CB" ? 0.42 : label === "10" ? 0.18 : 0;
const centrality = 1 - Math.abs(target.y - pitch.width / 2) / (pitch.width / 2);
return {
player,
score:
distance(player.position, referencePoint) * 0.42 +
distance(target, referencePoint) * 0.34 -
centrality * 2.2 -
centralRoleBonus,
};
})
.sort((a, b) => a.score - b.score)[0]?.player ?? null;
}
function applyDefensivePrioritySpaceProtectionTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
protectedIds = new Set()
) {
const response = profile.threatResponse;
if (!response || response.protectCenter < 0.34) {
return [];
}
const labels = [];
const excludedIds = new Set([
...protectedIds,
presser?.id,
].filter(Boolean));
const screenPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "screen");
const screen = pickDefensiveProtectionPlayer(
teamId,
groups,
targets,
excludedIds,
["midfield", "back"],
screenPoint
);
if (screen) {
targets.set(screen.id, screenPoint);
excludedIds.add(screen.id);
labels.push(`Protect ${response.threat.primaryLabel}`);
}
if (response.protectCenter >= 0.56 || response.isBoxThreat) {
const coverPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "cover");
const cover = pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, ["back"], coverPoint);
if (cover) {
targets.set(cover.id, coverPoint);
excludedIds.add(cover.id);
labels.push("Goal-side cover");
}
}
if (response.isWideAssistThreat || response.isBoxThreat) {
const farPostPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "farPost");
const farPostDefender = pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, ["back", "midfield"], farPostPoint);
if (farPostDefender) {
targets.set(farPostDefender.id, farPostPoint);
excludedIds.add(farPostDefender.id);
labels.push("Far-post cover");
}
const cutbackPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "cutback");
const cutbackScreen = pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, ["midfield"], cutbackPoint);
if (cutbackScreen) {
targets.set(cutbackScreen.id, cutbackPoint);
labels.push("Cutback screen");
}
}
return labels;
}
function getDefensiveCornerContext(teamId, ballPoint) {
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
beforeSnapshot: {
restartPhase: cloneRestartPhase(state.restartPhase),
ball: {
position: cloneVector(state.ball.position),
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "corner" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const sideY = Number.isFinite(restart.sideY)
? restart.sideY
: actionMeta.beforeSnapshot?.ball?.position?.y ?? ballPoint.y;
const attackingTeamId = restart.teamId;
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const sideSign = sideY <= pitch.width / 2 ? -1 : 1;
const cornerSpot = actionMeta.beforeSnapshot?.ball?.position ?? getCornerKickSpot(attackingTeamId, sideY);
const deliveryTarget = actionMeta.target ?? ballPoint;
return {
actionMeta,
attackingTeamId,
sideY,
sideSign,
ownGoalX,
sign,
cornerSpot: cloneVector(cornerSpot),
deliveryTarget: cloneVector(deliveryTarget),
isShortCorner: distance(cornerSpot, deliveryTarget) <= 13,
};
}
function getDefensiveCornerTarget(teamId, context, slot) {
const { ownGoalX, sign, sideSign, cornerSpot, deliveryTarget } = context;
const points = {
goalkeeper: {
x: ownGoalX + sign * 2.4,
y: clamp(lerp(pitch.width / 2, deliveryTarget.y, 0.1), pitch.width / 2 - 2.2, pitch.width / 2 + 2.2),
},
nearPost: {
x: ownGoalX + sign * 2.7,
y: pitch.width / 2 + sideSign * 3.05,
},
farPost: {
x: ownGoalX + sign * 2.9,
y: pitch.width / 2 - sideSign * 3.15,
},
sixYardCentral: {
x: ownGoalX + sign * 5.7,
y: pitch.width / 2 + sideSign * 0.9,
},
penaltySpot: {
x: ownGoalX + sign * 10.8,
y: pitch.width / 2 - sideSign * 0.6,
},
nearZone: {
x: ownGoalX + sign * 7.6,
y: pitch.width / 2 + sideSign * 6.6,
},
farZone: {
x: ownGoalX + sign * 8.9,
y: pitch.width / 2 - sideSign * 8.4,
},
edgeSecondBall: {
x: ownGoalX + sign * 18.2,
y: pitch.width / 2 - sideSign * 4.6,
},
shortCornerPress: {
x: lerp(cornerSpot.x, ownGoalX + sign * 12.5, 0.55),
y: lerp(cornerSpot.y, pitch.width / 2 + sideSign * 15, 0.44),
},
clearanceOutlet: {
x: ownGoalX + sign * 25,
y: pitch.width / 2 - sideSign * 18,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 1.8);
}
function applyDefensiveCornerSetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensiveCornerContext(teamId, ballPoint);
if (!context) {
return {
active: false,
presser: null,
labels: [],
focusPoint: null,
};
}
const labels = [];
const excludedIds = new Set();
let presser = null;
groups.gk.forEach((goalkeeper) => {
targets.set(goalkeeper.id, getDefensiveCornerTarget(teamId, context, "goalkeeper"));
excludedIds.add(goalkeeper.id);
labels.push("GK controls six-yard line");
});
const nearPost = pickDefensiveAutopilotPlayer(
groups,
["back", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "nearPost"),
["CB", "LB", "RB", "WB"]
);
if (nearPost) {
targets.set(nearPost.id, getDefensiveCornerTarget(teamId, context, "nearPost"));
excludedIds.add(nearPost.id);
labels.push("Near-post protection");
}
const farPost = pickDefensiveAutopilotPlayer(
groups,
["back", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "farPost"),
["CB", "LB", "RB", "WB"]
);
if (farPost) {
targets.set(farPost.id, getDefensiveCornerTarget(teamId, context, "farPost"));
excludedIds.add(farPost.id);
labels.push("Far-post protection");
}
const sixYard = pickDefensiveAutopilotPlayer(
groups,
["back"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "sixYardCentral"),
["CB"]
);
if (sixYard) {
targets.set(sixYard.id, getDefensiveCornerTarget(teamId, context, "sixYardCentral"));
excludedIds.add(sixYard.id);
labels.push("Six-yard zone");
}
const penaltySpot = pickDefensiveAutopilotPlayer(
groups,
["back", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "penaltySpot"),
["CB", "6", "8"]
);
if (penaltySpot) {
targets.set(penaltySpot.id, getDefensiveCornerTarget(teamId, context, "penaltySpot"));
excludedIds.add(penaltySpot.id);
labels.push("Penalty-spot duel");
}
const nearZone = pickDefensiveAutopilotPlayer(
groups,
["midfield", "back"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "nearZone"),
["6", "8", "WB", "LB", "RB"]
);
if (nearZone) {
targets.set(nearZone.id, getDefensiveCornerTarget(teamId, context, "nearZone"));
excludedIds.add(nearZone.id);
labels.push("Near-zone screen");
}
const farZone = pickDefensiveAutopilotPlayer(
groups,
["midfield", "back"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "farZone"),
["8", "10", "WB", "LB", "RB"]
);
if (farZone) {
targets.set(farZone.id, getDefensiveCornerTarget(teamId, context, "farZone"));
excludedIds.add(farZone.id);
labels.push("Far-zone screen");
}
const edge = pickDefensiveAutopilotPlayer(
groups,
["midfield", "forward"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "edgeSecondBall"),
["6", "8", "10"]
);
if (edge) {
targets.set(edge.id, getDefensiveCornerTarget(teamId, context, "edgeSecondBall"));
excludedIds.add(edge.id);
labels.push("Edge second ball");
}
if (context.isShortCorner) {
const shortPress = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "shortCornerPress"),
["W", "9", "10", "8"]
);
if (shortPress) {
targets.set(shortPress.id, getDefensiveCornerTarget(teamId, context, "shortCornerPress"));
excludedIds.add(shortPress.id);
presser = shortPress;
labels.push("Short-corner pressure");
}
}
const outlet = pickDefensiveAutopilotPlayer(
groups,
["forward"],
excludedIds,
getDefensiveCornerTarget(teamId, context, "clearanceOutlet"),
["9", "W", "10"]
);
if (outlet) {
targets.set(outlet.id, getDefensiveCornerTarget(teamId, context, "clearanceOutlet"));
labels.push("Clearance outlet");
}
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.cornerSpot,
};
}
function getRestartActionMeta() {
return state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
beforeSnapshot: {
restartPhase: cloneRestartPhase(state.restartPhase),
ball: {
position: cloneVector(state.ball.position),
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
}
function getDefensiveFreeKickContext(teamId, ballPoint) {
const actionMeta = getRestartActionMeta();
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "freeKick" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const attackingTeamId = restart.teamId;
const freeKickPoint =
restart.point ??
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.position ??
ballPoint;
const opponentGoal = getOpponentGoalCenter(attackingTeamId);
const goalDistance = distance(freeKickPoint, opponentGoal);
const centrality = 1 - Math.abs(freeKickPoint.y - pitch.width / 2) / (pitch.width / 2);
const shotAngle = getShotAngleQuality(freeKickPoint, attackingTeamId);
const deliveryTarget = actionMeta.target ?? ballPoint;
const deliveryDistance = distance(freeKickPoint, deliveryTarget);
const attackingDepth = getAttackingDepth(freeKickPoint, attackingTeamId);
const directShotThreat =
goalDistance <= 31.5 &&
centrality >= 0.14 &&
shotAngle >= 0.11 &&
(actionMeta.actionType === "shot" || deliveryDistance <= 18 || getAttackingDepth(deliveryTarget, attackingTeamId) >= 82);
const wideDeliveryThreat =
Math.abs(freeKickPoint.y - pitch.width / 2) >= 13 &&
attackingDepth >= 58;
return {
actionMeta,
attackingTeamId,
freeKickPoint: cloneVector(freeKickPoint),
deliveryTarget: cloneVector(deliveryTarget),
ownGoalX: teamId === "home" ? 0 : pitch.length,
sign: getDefendingDirectionSign(teamId),
sideSign: getWideSideSign(freeKickPoint) || getWideSideSign(deliveryTarget) || 1,
goalDistance,
centrality,
shotAngle,
directShotThreat,
wideDeliveryThreat,
isShortFreeKick: deliveryDistance <= 13.5,
};
}
function getFreeKickWallTarget(teamId, context, slotIndex = 0, wallCount = 3) {
const ownGoal = getOwnGoalCenter(teamId);
const wallBaseDistance = clamp(context.goalDistance > 25 ? 9.15 : 8.35, 7.8, 9.15);
const base = moveTowards(context.freeKickPoint, ownGoal, wallBaseDistance);
const lane = normalize(context.freeKickPoint, ownGoal);
const perpendicular = { x: -lane.y, y: lane.x };
const spread = clamp((wallCount - 1) * 0.68, 0.72, 2.4);
const offset = wallCount <= 1 ? 0 : -spread / 2 + (spread * slotIndex) / (wallCount - 1);
return clampToPitch({
x: base.x + perpendicular.x * offset,
y: base.y + perpendicular.y * offset,
}, 1.6);
}
function getDefensiveFreeKickTarget(teamId, context, slot) {
const { ownGoalX, sign, sideSign, freeKickPoint, deliveryTarget } = context;
const wallLeanY = lerp(pitch.width / 2, freeKickPoint.y, 0.12);
const points = {
goalkeeper: {
x: ownGoalX + sign * 1.2,
y: clamp(lerp(pitch.width / 2, deliveryTarget.y, context.directShotThreat ? 0.1 : 0.18), pitch.width / 2 - 3.05, pitch.width / 2 + 3.05),
},
blockerEdge: {
x: ownGoalX + sign * 19.2,
y: clamp(wallLeanY - sideSign * 5.2, 7, pitch.width - 7),
},
nearZone: {
x: ownGoalX + sign * 8.7,
y: pitch.width / 2 + sideSign * 7.8,
},
farZone: {
x: ownGoalX + sign * 9.4,
y: pitch.width / 2 - sideSign * 8.8,
},
penaltySpot: {
x: ownGoalX + sign * 11.4,
y: pitch.width / 2 - sideSign * 0.8,
},
sixYardCentral: {
x: ownGoalX + sign * 5.7,
y: pitch.width / 2 + sideSign * 0.7,
},
edgeSecondBall: {
x: ownGoalX + sign * 18.5,
y: clamp(pitch.width / 2 - sideSign * 4.8, 7, pitch.width - 7),
},
shortFreeKickPress: {
x: lerp(freeKickPoint.x, deliveryTarget.x, 0.42),
y: lerp(freeKickPoint.y, deliveryTarget.y, 0.42),
},
clearanceOutlet: {
x: ownGoalX + sign * 26,
y: pitch.width / 2 - sideSign * 18,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 1.8);
}
function applyDefensiveFreeKickSetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensiveFreeKickContext(teamId, ballPoint);
if (!context) {
return {
active: false,
presser: null,
labels: [],
focusPoint: null,
};
}
const labels = [];
const excludedIds = new Set();
let presser = null;
groups.gk.forEach((goalkeeper) => {
targets.set(goalkeeper.id, getDefensiveFreeKickTarget(teamId, context, "goalkeeper"));
excludedIds.add(goalkeeper.id);
labels.push(context.directShotThreat ? "GK sets the wall" : "GK commands delivery line");
});
const wallCount = context.directShotThreat
? clamp(Math.round(2 + (31.5 - context.goalDistance) / 6 + context.centrality * 1.2), 2, 4)
: context.wideDeliveryThreat
? 1
: 2;
for (let index = 0; index < wallCount; index += 1) {
const wallTarget = getFreeKickWallTarget(teamId, context, index, wallCount);
const wallPlayer = pickDefensiveAutopilotPlayer(
groups,
["midfield", "forward", "back"],
excludedIds,
wallTarget,
["6", "8", "10", "W", "9", "CB"]
);
if (wallPlayer) {
targets.set(wallPlayer.id, wallTarget);
excludedIds.add(wallPlayer.id);
}
}
if (wallCount > 0) {
labels.push(context.directShotThreat ? "Free-kick wall" : "Short wall");
}
if (context.isShortFreeKick) {
const shortPress = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getDefensiveFreeKickTarget(teamId, context, "shortFreeKickPress"),
["9", "W", "10", "8"]
);
if (shortPress) {
targets.set(shortPress.id, getDefensiveFreeKickTarget(teamId, context, "shortFreeKickPress"));
excludedIds.add(shortPress.id);
presser = shortPress;
labels.push("Short free-kick pressure");
}
}
const deliverySlots = context.directShotThreat
? [
["blockerEdge", ["midfield"], ["6", "8", "10"]],
["penaltySpot", ["back", "midfield"], ["CB", "6", "8"]],
["edgeSecondBall", ["midfield", "forward"], ["6", "8", "10"]],
]
: [
["sixYardCentral", ["back"], ["CB"]],
["nearZone", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"]],
["farZone", ["back", "midfield"], ["CB", "LB", "RB", "WB"]],
["penaltySpot", ["back", "midfield"], ["CB", "6", "8"]],
["edgeSecondBall", ["midfield", "forward"], ["6", "8", "10"]],
];
deliverySlots.forEach(([slot, lineKeys, preferLabels]) => {
const target = getDefensiveFreeKickTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, target, preferLabels);
if (player) {
targets.set(player.id, target);
excludedIds.add(player.id);
}
});
labels.push(context.directShotThreat ? "Rebound and block line" : "Box delivery protection");
const outlet = pickDefensiveAutopilotPlayer(
groups,
["forward"],
excludedIds,
getDefensiveFreeKickTarget(teamId, context, "clearanceOutlet"),
["9", "W", "10"]
);
if (outlet) {
targets.set(outlet.id, getDefensiveFreeKickTarget(teamId, context, "clearanceOutlet"));
labels.push("Clearance outlet");
}
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.freeKickPoint,
};
}
function getDefensivePenaltyContext(teamId, ballPoint) {
const actionMeta = getRestartActionMeta();
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "penalty" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const attackingTeamId = restart.teamId;
const penaltyPoint =
actionMeta.beforeSnapshot?.ball?.position ??
getOpponentPenaltySpot(attackingTeamId);
return {
actionMeta,
attackingTeamId,
penaltyPoint: cloneVector(penaltyPoint),
ownGoalX: teamId === "home" ? 0 : pitch.length,
sign: getDefendingDirectionSign(teamId),
sideSign: getWideSideSign(ballPoint) || 1,
};
}
function getDefensivePenaltyTarget(teamId, context, slot) {
const { ownGoalX, sign, sideSign } = context;
const points = {
goalkeeper: {
x: ownGoalX + sign * 0.55,
y: pitch.width / 2,
},
reboundLeft: {
x: ownGoalX + sign * 18.1,
y: pitch.width / 2 - 8.3,
},
reboundRight: {
x: ownGoalX + sign * 18.1,
y: pitch.width / 2 + 8.3,
},
arcScreen: {
x: ownGoalX + sign * 20.4,
y: pitch.width / 2,
},
farClearance: {
x: ownGoalX + sign * 24.6,
y: pitch.width / 2 - sideSign * 15.2,
},
wideClearance: {
x: ownGoalX + sign * 26.5,
y: pitch.width / 2 + sideSign * 19,
},
};
return clampToPitch(points[slot] ?? points.arcScreen, 1.5);
}
function applyDefensivePenaltySetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensivePenaltyContext(teamId, ballPoint);
if (!context) {
return {
active: false,
presser: null,
labels: [],
focusPoint: null,
};
}
const labels = [];
const excludedIds = new Set();
groups.gk.forEach((goalkeeper) => {
targets.set(goalkeeper.id, getDefensivePenaltyTarget(teamId, context, "goalkeeper"));
excludedIds.add(goalkeeper.id);
labels.push("GK on penalty line");
});
[
["reboundLeft", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"]],
["reboundRight", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"]],
["arcScreen", ["midfield", "forward"], ["6", "8", "10"]],
["farClearance", ["forward", "midfield"], ["9", "W", "10"]],
["wideClearance", ["forward", "midfield"], ["W", "9", "10"]],
].forEach(([slot, lineKeys, preferLabels]) => {
const target = getDefensivePenaltyTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, target, preferLabels);
if (player) {
targets.set(player.id, target);
excludedIds.add(player.id);
}
});
labels.push("Penalty rebound line", "Clearance outlets");
return {
active: true,
presser: null,
labels: uniquePrincipleLabels(labels),
focusPoint: context.penaltyPoint,
};
}
function getDefensiveThrowInContext(teamId, ballPoint) {
const actionMeta = getRestartActionMeta();
const restart = actionMeta.beforeSnapshot?.restartPhase ?? state.restartPhase;
if (restart?.type !== "throwIn" || restart.teamId === teamId || getOtherTeamId(restart.teamId) !== teamId) {
return null;
}
const throwPoint =
restart.point ??
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.position ??
ballPoint;
const sideSign = getWideSideSign(throwPoint) || (throwPoint.y <= pitch.width / 2 ? -1 : 1);
return {
actionMeta,
attackingTeamId: restart.teamId,
throwPoint: cloneVector(throwPoint),
deliveryTarget: cloneVector(actionMeta.target ?? ballPoint),
sign: getDefendingDirectionSign(teamId),
sideSign,
ownGoalX: teamId === "home" ? 0 : pitch.length,
isShortThrow: distance(throwPoint, actionMeta.target ?? ballPoint) <= 12.5,
};
}
function getDefensiveThrowInTarget(teamId, context, slot) {
const { throwPoint, deliveryTarget, sign, sideSign, ownGoalX } = context;
const insideY = clamp(throwPoint.y - sideSign * 7.5, 4, pitch.width - 4);
const points = {
twoMeterPress: moveTowards(
{
x: throwPoint.x,
y: insideY,
},
throwPoint,
Math.max(distance({ x: throwPoint.x, y: insideY }, throwPoint) - 2.15, 0)
),
receiverPress: {
x: lerp(throwPoint.x, deliveryTarget.x, 0.58),
y: lerp(insideY, deliveryTarget.y, 0.44),
},
insideScreen: {
x: clamp(throwPoint.x - sign * 3.8, 4, pitch.length - 4),
y: clamp(insideY - sideSign * 5.4, 7, pitch.width - 7),
},
downLineCover: {
x: clamp(throwPoint.x - sign * 9.4, 4, pitch.length - 4),
y: clamp(throwPoint.y - sideSign * 2.4, 3.2, pitch.width - 3.2),
},
backLineCover: {
x: ownGoalX + sign * 24,
y: clamp(insideY - sideSign * 9.5, 8, pitch.width - 8),
},
centralScreen: {
x: ownGoalX + sign * 34,
y: lerp(pitch.width / 2, insideY, 0.35),
},
};
return clampToPitch(points[slot] ?? points.insideScreen, 1.8);
}
function applyDefensiveThrowInSetPieceTargets(teamId, targets, groups, ballPoint, profile) {
const context = getDefensiveThrowInContext(teamId, ballPoint);
if (!context) {
return {
active: false,
presser: null,
labels: [],
focusPoint: null,
};
}
const labels = [];
const excludedIds = new Set(groups.gk.map((goalkeeper) => goalkeeper.id));
let presser = null;
const firstPress = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getDefensiveThrowInTarget(teamId, context, "twoMeterPress"),
["W", "9", "10", "8", "WB"]
);
if (firstPress) {
targets.set(firstPress.id, getDefensiveThrowInTarget(teamId, context, "twoMeterPress"));
excludedIds.add(firstPress.id);
presser = firstPress;
labels.push("Two-metre throw-in pressure");
}
const receiverPress = pickDefensiveAutopilotPlayer(
groups,
["midfield", "back"],
excludedIds,
getDefensiveThrowInTarget(teamId, context, "receiverPress"),
["WB", "LB", "RB", "6", "8"]
);
if (receiverPress) {
targets.set(receiverPress.id, getDefensiveThrowInTarget(teamId, context, "receiverPress"));
excludedIds.add(receiverPress.id);
labels.push("Receiver touch pressure");
}
[
["insideScreen", ["midfield"], ["6", "8", "10"]],
["downLineCover", ["back", "midfield"], ["LB", "RB", "WB", "CB"]],
["backLineCover", ["back"], ["CB", "LB", "RB", "WB"]],
["centralScreen", ["midfield", "forward"], ["6", "8", "10", "9"]],
].forEach(([slot, lineKeys, preferLabels]) => {
const target = getDefensiveThrowInTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, target, preferLabels);
if (player) {
targets.set(player.id, target);
excludedIds.add(player.id);
}
});
labels.push("Touchline trap", "Inside lane cover");
return {
active: true,
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.throwPoint,
};
}
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
function getDefensiveLooseBallRecoveryTrapContext(teamId, ballPoint, profile) {
if (!ballPoint || state.restartPhase?.type) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
profileKey: state.ball.profileKey,
targetKind: state.ball.targetKind,
};
const isRecoveryAction =
actionMeta.actionType === "recovery" ||
actionMeta.profileKey === "loose-ball-recovery" ||
state.ball.actionType === "recovery" ||
state.ball.profileKey === "loose-ball-recovery";
if (!isRecoveryAction) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
const collector = getPlayerById(actionMeta.carrierPlayerId ?? state.ball.carrierPlayerId);
if (!attackingTeamId || !collector || collector.team !== attackingTeamId) {
return null;
}
const targetPoint = cloneVector(actionMeta.target ?? ballPoint);
const attackingProfile = getOffensiveAutopilotProfile(attackingTeamId, targetPoint);
const threat = getPitchThreatProfile(targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(collector) ||
1;
const closeAccess = state.players.reduce((count, player) => {
if (player.team !== teamId || isGoalkeeper(player)) {
return count;
}
return count + (distance(player.position, targetPoint) <= 15.5 ? 1 : 0);
}, 0);
const pressStyle = ["counter-press", "gegenpress", "high-press", "press-trap-wide"].includes(profile.styleKey);
const protectStyle = ["low-block", "protect-box", "park-the-bus", "catenaccio"].includes(profile.styleKey);
const recoveryDuration = state.ball.recoveryDuration ?? actionMeta.recoveryDuration ?? 1.2;
const counterPressIntent = clamp(
profile.pressingIntensity * 0.44 +
profile.tackleIntent * 0.22 +
clamp(closeAccess / 3, 0, 1) * 0.2 +
(pressStyle ? 0.18 : 0) -
(protectStyle && ballFromOwnGoal <= 32 ? 0.12 : 0),
0,
1
);
const protectIntent = clamp(
(1 - profile.pressingIntensity) * 0.26 +
clamp((38 - ballFromOwnGoal) / 26, 0, 1) * 0.34 +
(protectStyle ? 0.18 : 0) +
threat.value * 0.12,
0,
1
);
const mode =
counterPressIntent >= Math.max(0.52, protectIntent * 0.9) && closeAccess >= 1
? "counterPressRecovery"
: "delayRecovery";
return {
actionMeta,
attackingTeamId,
collector,
targetPoint,
threat,
ballFromOwnGoal,
sideSign,
closeAccess,
counterPressIntent,
protectIntent,
mode,
recoveryDuration,
attackingDirectness: attackingProfile.directness ?? 0.52,
attackingWidth: attackingProfile.widthDiscipline ?? 0.62,
};
}
function getDefensiveLooseBallRecoveryTrapTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const attackSign = getAttackDirectionSign(context.attackingTeamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const underPassPoint = {
x: ball.x - attackSign * (8.5 + context.counterPressIntent * 2.2),
y: lerp(ball.y, pitch.width / 2, 0.36),
};
const forwardOutletPoint = {
x: ball.x + attackSign * lerp(10, 17, context.attackingDirectness),
y: clamp(lerp(ball.y, pitch.width / 2 - sideSign * 8, 0.34), 7, pitch.width - 7),
};
const widthExitPoint = {
x: ball.x + attackSign * 4.8,
y: clamp(pitch.width / 2 + sideSign * lerp(22, 30, context.attackingWidth), 4, pitch.width - 4),
};
const pressDistance = context.mode === "counterPressRecovery" ? 0.75 : 1.75;
const points = {
pressCollector: {
...goalSideOf(ball, pressDistance),
y: lerp(ball.y, pitch.width / 2, context.mode === "counterPressRecovery" ? 0.1 : 0.22),
},
insideCover: {
...goalSideOf(ball, context.mode === "counterPressRecovery" ? 4.2 : 6.2),
y: lerp(ball.y, pitch.width / 2, 0.72),
},
underPassLock: {
...goalSideOf(underPassPoint, 1.15),
y: lerp(underPassPoint.y, pitch.width / 2, 0.32),
},
forwardOutletLock: {
...goalSideOf(forwardOutletPoint, context.threat.behindLine >= 0.18 ? 2.1 : 1.3),
y: lerp(forwardOutletPoint.y, pitch.width / 2, 0.18),
},
widthExitLock: {
...goalSideOf(widthExitPoint, 1.2),
y: clamp(widthExitPoint.y - sideSign * 2.4, 3.5, pitch.width - 3.5),
},
restCover: {
x: lerp(ball.x, ownGoal.x, context.ballFromOwnGoal <= 34 ? 0.5 : 0.36),
y: clamp(lerp(ball.y, pitch.width / 2, 0.72), 11, pitch.width - 11),
},
weakSideTuck: {
x: lerp(ball.x, ownGoal.x, context.ballFromOwnGoal <= 42 ? 0.44 : 0.32),
y: clamp(pitch.width / 2 - sideSign * 9.6, 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.pressCollector, 2.1);
}
function applyDefensiveLooseBallRecoveryTrapTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveLooseBallRecoveryTrapContext(teamId, ballPoint, profile);
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
const pressTarget = getDefensiveLooseBallRecoveryTrapTarget(teamId, context, "pressCollector");
const basePresserFits =
presser &&
!isGoalkeeper(presser) &&
distance(presser.position, pressTarget) <= (context.mode === "counterPressRecovery" ? 19 : 15);
if (!basePresserFits) {
presser = pickDefensiveAutopilotPlayer(
groups,
context.mode === "counterPressRecovery"
? ["forward", "midfield", "back"]
: ["midfield", "forward", "back"],
assignedIds,
pressTarget,
context.mode === "counterPressRecovery"
? ["9", "10", "W", "8", "6"]
: ["6", "8", "10", "W", "CB"]
);
}
if (presser) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push(
context.mode === "counterPressRecovery"
? "Recovery trap: press collector"
: "Recovery trap: delay collector"
);
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveLooseBallRecoveryTrapTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
if (!player) {
return null;
}
targets.set(player.id, target);
assignedIds.add(player.id);
labels.push(label);
return player;
};
assign("insideCover", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Recovery trap: close inside");
assign("underPassLock", ["midfield", "forward"], ["8", "10", "6", "9", "W"], "Recovery trap: lock safe pass");
if (context.mode === "counterPressRecovery" || context.ballFromOwnGoal <= 52) {
assign("forwardOutletLock", ["back", "midfield", "forward"], ["CB", "6", "8", "LB", "RB", "WB"], "Recovery trap: block forward outlet");
}
if (isWidePrincipleZone(context.targetPoint) || context.counterPressIntent >= 0.58) {
assign("widthExitLock", ["back", "midfield", "forward"], ["WB", "LB", "RB", "W", "8"], "Recovery trap: lock width release");
}
assign("restCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Recovery trap: rest cover");
if (context.threat.centralPocket >= 0.22 || context.ballFromOwnGoal <= 42) {
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Recovery trap: weak-side tuck");
}
if (labels.length) {
labels.unshift("Defensive loose-ball recovery trap");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
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
function getDefensiveReceiveContinuationNextPoint(attackingTeamId, target, startPoint, firstTouchMode, intent, sideSign = 1) {
const sign = getAttackDirectionSign(attackingTeamId);
const targetIsWide = isWideChannel(target);
if (intent === "bounce") {
return clampToPitch({
x: lerp(target.x, startPoint.x, 0.48),
y: lerp(target.y, pitch.width / 2, 0.28),
}, 2.4);
}
const forwardMeters =
intent === "finish"
? 12.5
: intent === "carry"
? 9.8
: intent === "turn"
? 8.2
: 6.8;
const centerPull =
firstTouchMode === "inside"
? 0.5
: targetIsWide
? 0.42
: 0.22;
const yRelease =
targetIsWide
? lerp(target.y, pitch.width / 2, centerPull)
: clamp(target.y - sideSign * (intent === "finish" ? 2.8 : 1.4), 4, pitch.width - 4);
return clampToPitch({
x: target.x + sign * forwardMeters,
y: yRelease,
}, 2.4);
}
function getDefensiveReceiveContinuationContext(defensiveTeamId, ballPoint, profile) {
if (state.restartPhase?.type) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
principleRunnerPlayerId: null,
autoPrinciples: [],
firstTouchMode: state.ball.firstTouchMode,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
offensiveAutopilot: null,
};
if ((actionMeta.actionType ?? state.ball.actionType) !== "pass") {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
const target = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
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
if (!attackingTeamId || !startPoint || !target || carrier?.team === defensiveTeamId) {
return null;
}
const passDistance = distance(startPoint, target);
if (passDistance < 5.2) {
return null;
}
const attackProfile = getOffensiveAutopilotProfile(attackingTeamId, target);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (target.x - startPoint.x) * attackSign;
const targetThreat = getPitchThreatProfile(target, attackingTeamId);
const targetSpace = getAttackingGameSpaceProfile(target, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, target, attackingTeamId, attackProfile);
const targetDepth = getAttackingDepth(target, attackingTeamId);
const firstTouchMode = actionMeta.firstTouchMode ?? state.ball.firstTouchMode ?? "auto";
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[attackingTeamId]?.formation) : null;
const sideSign =
getWideSideSign(target) ||
getWideSideSign(receiver) ||
getWideSideSign(startPoint) ||
1;
const spaceTwoCue =
principleText.includes("space 2") ||
principleText.includes("space-two") ||
principleText.includes("spelyta") ||
principleText.includes("between-line") ||
principleText.includes("between lines") ||
principleText.includes("open-body");
const spaceTwoReceive =
spaceTwoCue ||
targetSpace.key === "space2" ||
(targetSpace.index === 2 && targetThreat.centrality >= 0.38) ||
targetThreat.betweenLines >= 0.32 ||
targetThreat.centralPocket >= 0.27 ||
(targetThreat.halfSpace >= 0.44 && targetDepth >= 42 && targetDepth <= 78);
const receiveFlow =
principleText.includes("receive") ||
principleText.includes("third-player") ||
principleText.includes("first touch") ||
principleText.includes("next player") ||
spaceTwoCue;
const openBodyReceive =
firstTouchMode === "forward" ||
firstTouchMode === "inside" ||
spaceTwoReceive ||
(firstTouchMode === "auto" && targetSpace.index >= 2 && targetThreat.centrality >= 0.42);
const bounceReceive =
firstTouchMode === "back" ||
principleText.includes("escape") ||
principleText.includes("bounce");
const highThreatReceive =
targetThreat.box >= 0.18 ||
targetThreat.behindLine >= 0.26 ||
targetThreat.betweenLines >= 0.34 ||
targetThreat.centralPocket >= 0.28 ||
targetThreat.halfSpace >= 0.42 ||
spaceTwoReceive ||
actionSpace.lineBreakCount >= 1 ||
targetSpace.index >= 2 ||
forwardGain >= 7;
const receiverCanHurt =
["connector", "wideForward", "striker", "secondStriker"].includes(receiverRoleKey) ||
!receiver;
if (!receiveFlow && !(openBodyReceive && highThreatReceive && receiverCanHurt)) {
return null;
}
const intent =
bounceReceive
? "bounce"
: principleText.includes("carry")
? "carry"
: targetThreat.behindLine >= 0.28 || targetThreat.box >= 0.2 || targetDepth >= 72
? "finish"
: spaceTwoReceive || targetSpace.key === "space2" || targetThreat.betweenLines >= 0.34
? "turn"
: "connect";
const nextPoint = getDefensiveReceiveContinuationNextPoint(
attackingTeamId,
target,
startPoint,
firstTouchMode,
intent,
sideSign
);
return {
actionMeta,
attackingTeamId,
attackProfile,
carrier,
receiver,
receiverRoleKey,
startPoint: cloneVector(startPoint),
target: cloneVector(target),
nextPoint,
ballPoint: cloneVector(ballPoint ?? target),
passDistance,
forwardGain,
targetThreat,
targetSpace,
actionSpace,
targetDepth,
firstTouchMode,
principleText,
receiveFlow,
openBodyReceive,
spaceTwoReceive,
bounceReceive,
highThreatReceive,
sideSign,
targetIsWide: isWideChannel(target),
intent,
};
}
function getDefensiveReceiveContinuationTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.target;
const nextPoint = context.nextPoint;
const sideSign = context.sideSign || 1;
const passLaneMidpoint = {
x: lerp(context.startPoint.x, target.x, 0.58),
y: lerp(context.startPoint.y, target.y, 0.58),
};
const nextLaneMidpoint = {
x: lerp(target.x, nextPoint.x, 0.6),
y: lerp(target.y, nextPoint.y, 0.6),
};
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const points = {
receiverPress: {
...goalSideOf(target, context.intent === "finish" ? 0.65 : 1.05),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.1 : 0.17),
},
turnLock: {
...goalSideOf(nextLaneMidpoint, context.intent === "turn" ? 2.1 : 2.8),
y: lerp(nextLaneMidpoint.y, pitch.width / 2, context.targetIsWide ? 0.48 : 0.66),
},
thirdManScreen: {
x: nextLaneMidpoint.x - sign * 1.6,
y: lerp(nextLaneMidpoint.y, pitch.width / 2, context.intent === "finish" ? 0.38 : 0.26),
},
bounceBlock: {
x: passLaneMidpoint.x - sign * 1.7,
y: lerp(passLaneMidpoint.y, pitch.width / 2, 0.4),
},
outsideLock: {
x: target.x - sign * 2.2,
y: clamp(target.y + sideSign * (context.targetIsWide ? 3.6 : 6.2), 3.5, pitch.width - 3.5),
},
depthCover: {
x: lerp(nextPoint.x, ownGoal.x, context.intent === "finish" ? 0.5 : 0.36),
y: lerp(nextPoint.y, pitch.width / 2, context.targetIsWide ? 0.38 : 0.28),
},
farSideTuck: {
x: lerp(target.x, ownGoal.x, context.intent === "finish" ? 0.42 : 0.32),
y: clamp(pitch.width / 2 - sideSign * (context.intent === "finish" ? 8.6 : 10.8), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.turnLock, 2.2);
}
function applyDefensiveReceiveContinuationTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveReceiveContinuationContext(teamId, ballPoint, profile);
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
const pressTarget = getDefensiveReceiveContinuationTarget(teamId, context, "receiverPress");
const receiverPressLabel = context.spaceTwoReceive
? "Press space-2 receiver"
: "Press receiver's next touch";
const canReusePresser =
presser &&
!isGoalkeeper(presser) &&
distance(presser.position, pressTarget) <= (context.spaceTwoReceive ? 25 : context.highThreatReceive ? 23 : 18.5);
if (canReusePresser) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push(receiverPressLabel);
} else {
const pressPlayer = pickDefensiveAutopilotPlayer(
groups,
context.targetIsWide ? ["midfield", "back", "forward"] : ["midfield", "forward", "back"],
assignedIds,
pressTarget,
context.targetIsWide ? ["WB", "LB", "RB", "W", "8"] : ["6", "8", "10", "9", "CB"]
);
if (pressPlayer) {
targets.set(pressPlayer.id, pressTarget);
assignedIds.add(pressPlayer.id);
presser = pressPlayer;
labels.push(receiverPressLabel);
}
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveReceiveContinuationTarget(teamId, context, slot);
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
if (context.bounceReceive || context.intent === "bounce") {
assign("bounceBlock", ["forward", "midfield"], ["9", "10", "8", "6", "W"], "Block bounce after receive");
assign("turnLock", ["midfield"], ["6", "8", "10"], "Lock second touch inside");
} else if (context.spaceTwoReceive) {
assign("turnLock", ["midfield", "back"], ["6", "8", "CB", "10"], "Space 2: lock the turn");
assign("thirdManScreen", ["midfield", "back"], ["6", "8", "10", "CB"], "Space 2: screen third-player lane");
} else {
assign("turnLock", ["midfield", "back"], ["6", "8", "CB", "10"], "Deny open-body turn");
assign("thirdManScreen", ["midfield", "back"], ["6", "8", "10", "CB"], "Screen third-player lane");
}
if (context.targetIsWide) {
assign("outsideLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Lock outside escape");
}
if (context.spaceTwoReceive || context.highThreatReceive || context.intent === "finish") {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover receive-and-run depth");
}
if (
context.spaceTwoReceive ||
context.actionSpace.lineBreakCount >= 1 ||
context.intent === "finish" ||
Math.abs(context.target.y - context.startPoint.y) >= 16
) {
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side protects next action");
}
if (labels.length) {
labels.unshift(context.spaceTwoReceive ? "Defend space 2 receive" : "Read receive continuation");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.nextPoint,
protectedIds: assignedIds,
};
}
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
function getDefensiveSwitchRecoveryContext(defensiveTeamId, ballPoint, profile) {
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
if ((actionMeta.actionType ?? state.ball.actionType) !== "pass") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position;
const targetPoint = actionMeta.target ?? ballPoint ?? state.ball.target;
if (!startPoint || !targetPoint) {
return null;
}
const startLane = getPitchLaneKey(startPoint);
const targetLane = getPitchLaneKey(targetPoint);
const laneShift =
startLane && targetLane
? Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(startLane))
: 0;
const passDistance = distance(startPoint, targetPoint);
const lateralMeters = Math.abs(targetPoint.y - startPoint.y);
const startSide = getWideSideSign(startPoint);
const targetSide =
getWideSideSign(targetPoint) ||
Math.sign(targetPoint.y - pitch.width / 2) ||
1;
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.label,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const oppositeSideSwitch = startSide && targetSide && startSide !== targetSide;
const switchCue =
principleText.includes("switch") ||
principleText.includes("change corridor") ||
principleText.includes("weak-side") ||
principleText.includes("spelvänd") ||
(
passDistance >= 20 &&
lateralMeters >= 17 &&
(laneShift >= 2 || oppositeSideSwitch)
);
if (!switchCue) {
return null;
}
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const actionSpeed = Math.max(actionMeta.speed ?? state.ball.speed ?? state.ball.currentSpeed ?? 13, 0.1);
const eta = passDistance / actionSpeed;
const finalThirdSwitch =
ballFromOwnGoal <= 42 ||
targetThreat.assistZone >= 0.32 ||
targetThreat.box >= 0.12 ||
targetThreat.cutbackZone >= 0.18;
const centralDanger =
targetThreat.centralPocket >= 0.22 ||
targetThreat.betweenLines >= 0.28 ||
actionSpace.lineBreakCount >= 1 ||
forwardGain >= 7;
return {
actionMeta,
attackingTeamId,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
startLane,
targetLane,
laneShift,
passDistance,
lateralMeters,
startSide: startSide || -targetSide,
targetSide,
targetThreat,
actionSpace,
ballFromOwnGoal,
forwardGain,
eta,
finalThirdSwitch,
centralDanger,
targetIsWide: isWidePrincipleZone(targetPoint),
phaseKey: profile.phaseKey,
};
}
function getDefensiveSwitchRecoveryTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const targetSide = context.targetSide || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const pressureDistance =
context.phaseKey === "highPress"
? 1.2
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 2.3
: 1.8;
const lineCoverRatio =
context.finalThirdSwitch
? 0.42
: context.centralDanger
? 0.34
: 0.28;
const points = {
firstPressure: {
...goalSideOf(target, pressureDistance),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.08 : 0.18),
},
wideLock: {
x: target.x - sign * 3.1,
y: clamp(target.y + targetSide * 4.8, 3.4, pitch.width - 3.4),
},
centralGate: {
x: target.x - sign * (context.centralDanger ? 7.8 : 6.2),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.72 : 0.84),
},
midfieldSlide: {
x: target.x - sign * (context.finalThirdSwitch ? 8.4 : 10.2),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.48 : 0.62),
},
backLineShift: {
x: lerp(target.x, ownGoal.x, lineCoverRatio),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.34 : 0.24),
},
depthCover: {
x: lerp(target.x, ownGoal.x, context.finalThirdSwitch ? 0.5 : 0.4),
y: lerp(target.y, pitch.width / 2, context.targetIsWide ? 0.46 : 0.32),
},
oldSideRecover: {
x: lerp(target.x, ownGoal.x, context.finalThirdSwitch ? 0.38 : 0.3),
y: clamp(pitch.width / 2 - targetSide * (context.finalThirdSwitch ? 8.2 : 11.5), 7, pitch.width - 7),
},
boxBalance: {
x: lerp(target.x, ownGoal.x, 0.46),
y: clamp(pitch.width / 2 - targetSide * 4.8, 10, pitch.width - 10),
},
};
return clampToPitch(points[slot] ?? points.centralGate, 2.2);
}
function applyDefensiveSwitchRecoveryTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveSwitchRecoveryContext(teamId, ballPoint, profile);
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
const target = getDefensiveSwitchRecoveryTarget(teamId, context, slot);
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
const pressTarget = getDefensiveSwitchRecoveryTarget(teamId, context, "firstPressure");
const presserCanRecover =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, pressTarget) <= (context.eta <= 1.6 ? 18 : 23);
if (presserCanRecover) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push("Switch recovery: arrive to new ball side");
} else {
const newPresser = assign(
"firstPressure",
context.targetIsWide ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.targetIsWide ? ["WB", "LB", "RB", "W", "8"] : ["6", "8", "10", "CB"],
"Switch recovery: arrive to new ball side"
);
presser = newPresser ?? presser;
}
if (context.targetIsWide) {
assign("wideLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Switch recovery: lock outside");
}
assign("centralGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Switch recovery: close central gate");
assign("midfieldSlide", ["midfield", "forward"], ["6", "8", "10", "W"], "Switch recovery: midfield slides across");
assign("backLineShift", ["back"], ["CB", "LB", "RB", "WB"], "Switch recovery: back line shifts");
if (context.centralDanger || context.forwardGain >= 6 || context.actionSpace.lineBreakCount >= 1) {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Switch recovery: protect depth");
}
assign("oldSideRecover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Switch recovery: old ball side narrows");
if (context.finalThirdSwitch) {
assign("boxBalance", ["back", "midfield"], ["CB", "6", "8", "LB", "RB", "WB"], "Switch recovery: box balance");
}
if (labels.length) {
labels.unshift("Recover after switch");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
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
function getDefensiveGameSpaceResponseContext(defensiveTeamId, ballPoint, profile) {
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
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const startSpace = getAttackingGameSpaceProfile(startPoint, attackingTeamId);
const targetSpace = getAttackingGameSpaceProfile(targetPoint, attackingTeamId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const gameSpaceGain = targetSpace.index - startSpace.index;
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const centrality = 1 - Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const actionType = actionMeta.actionType ?? state.ball.actionType;
const lineEntry =
targetSpace.key === "space2" ||
targetThreat.betweenLines >= 0.34 ||
(targetSpace.index >= 2 && gameSpaceGain >= 1 && forwardGain >= 4.5);
const depthEntry =
targetSpace.key === "space3" ||
targetThreat.behindLine >= 0.3 ||
(targetSpace.index >= 3 && forwardGain >= 6) ||
(ballFromOwnGoal <= 28 && forwardGain >= 3.5);
const centralDanger =
centrality >= 0.48 &&
(targetThreat.centralPocket >= 0.26 || targetThreat.box >= 0.18 || ballFromOwnGoal <= 36);
if (!lineEntry && !depthEntry && !centralDanger) {
return null;
}
const mode = depthEntry
? "spaceThreeRecovery"
: lineEntry
? "spaceTwoJump"
: "centralProtection";
return {
actionMeta,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
startSpace,
targetSpace,
targetThreat,
forwardGain,
gameSpaceGain,
ballFromOwnGoal,
centrality,
sideSign,
actionType,
mode,
lineEntry,
depthEntry,
};
}
function getDefensiveGameSpaceResponseTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideX = (meters) => target.x - sign * meters;
const passLaneMidpoint = {
x: lerp(context.startPoint.x, target.x, 0.58),
y: lerp(context.startPoint.y, target.y, 0.58),
};
const isDepthEntry = context.mode === "spaceThreeRecovery";
const points = {
firstPressure: {
x: goalSideX(isDepthEntry ? 0.75 : 1.15),
y: lerp(target.y, pitch.width / 2, isDepthEntry ? 0.1 : 0.16),
},
bounceScreen: {
x: passLaneMidpoint.x - sign * 2.2,
y: lerp(passLaneMidpoint.y, pitch.width / 2, 0.34),
},
insideScreen: {
x: goalSideX(isDepthEntry ? 6.2 : 5.6),
y: lerp(target.y, pitch.width / 2, isDepthEntry ? 0.58 : 0.68),
},
depthCover: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.5 : 0.34),
y: lerp(target.y, pitch.width / 2, isDepthEntry ? 0.3 : 0.24),
},
runnerTrack: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.32 : 0.2),
y: clamp(target.y + sideSign * (isDepthEntry ? 3.4 : 4.8), 4.5, pitch.width - 4.5),
},
cutbackLock: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.42 : 0.36),
y: pitch.width / 2 + sideSign * (isDepthEntry ? 4.8 : 5.8),
},
farSideTuck: {
x: lerp(target.x, ownGoal.x, isDepthEntry ? 0.38 : 0.32),
y: clamp(pitch.width / 2 - sideSign * (isDepthEntry ? 9.2 : 10.6), 6.5, pitch.width - 6.5),
},
};
return clampToPitch(points[slot] ?? points.insideScreen, 2.2);
}
function applyDefensiveGameSpaceResponseTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveGameSpaceResponseContext(teamId, ballPoint, profile);
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
const firstPressurePoint = getDefensiveGameSpaceResponseTarget(teamId, context, "firstPressure");
const basePresserLabel = basePresser ? getPlayerMagnetLabel(basePresser) : null;
const canReuseBasePresser =
basePresser &&
!isGoalkeeper(basePresser) &&
(
context.mode !== "spaceThreeRecovery" ||
["CB", "LB", "RB", "WB", "6", "8"].includes(basePresserLabel) ||
distance(basePresser.position, firstPressurePoint) <= 15
);
if (canReuseBasePresser) {
targets.set(basePresser.id, firstPressurePoint);
assignedIds.add(basePresser.id);
labels.push(context.mode === "spaceThreeRecovery" ? "Recover first touch behind line" : "Press first touch in space 2");
} else {
const firstPress = pickDefensiveAutopilotPlayer(
groups,
context.mode === "spaceThreeRecovery" ? ["back", "midfield"] : ["midfield", "forward", "back"],
assignedIds,
firstPressurePoint,
context.mode === "spaceThreeRecovery" ? ["CB", "LB", "RB", "WB", "6"] : ["6", "8", "10", "9", "W"]
);
if (firstPress) {
targets.set(firstPress.id, firstPressurePoint);
assignedIds.add(firstPress.id);
presser = firstPress;
labels.push(context.mode === "spaceThreeRecovery" ? "Recover first touch behind line" : "Press first touch in space 2");
}
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveGameSpaceResponseTarget(teamId, context, slot);
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
if (context.mode === "spaceThreeRecovery") {
assign("runnerTrack", ["back"], ["CB", "LB", "RB", "WB"], "Track run behind");
assign("depthCover", ["back"], ["CB"], "Cover goal-side depth");
assign("cutbackLock", ["midfield", "back"], ["6", "8", "CB"], "Protect cutback lane");
assign("bounceScreen", ["midfield"], ["6", "8", "10"], "Prepare second ball");
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side tucks in");
} else {
assign("bounceScreen", ["forward", "midfield"], ["9", "10", "8", "W", "6"], "Block bounce pass");
assign("insideScreen", ["midfield", "back"], ["6", "8", "CB"], "Deny turn inside");
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover line behind");
if (context.targetThreat.cutbackZone >= 0.24 || context.ballFromOwnGoal <= 42) {
assign("cutbackLock", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Protect cutback lane");
}
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side tucks in");
}
if (labels.length) {
labels.unshift(`Respond to ${context.targetSpace.label}`);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
function getDefensiveRunnerThreats(defensiveTeamId, ballPoint, profile) {
const attackingTeamId = getOtherTeamId(defensiveTeamId);
if (!attackingTeamId || state.restartPhase?.type) {
return [];
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
principleRunnerPlayerId: null,
beforeSnapshot: {
ball: {
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const carrierId =
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId;
const actionTarget = actionMeta.target ?? ballPoint;
const actionThreat = getPitchThreatProfile(actionTarget, attackingTeamId);
const ballSide = getWideSideSign(actionTarget) || 1;
const actionType = actionMeta.actionType ?? state.ball.actionType;
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const snapshotPositions = getSnapshotPlayerMap(actionMeta.beforeSnapshot);
const attackSign = getAttackDirectionSign(attackingTeamId);
const hasChannelCue =
principleText.includes("channel") ||
principleText.includes("blindside") ||
principleText.includes("run behind") ||
principleText.includes("run beyond") ||
principleText.includes("depth");
return state.players
.filter((player) => player.team === attackingTeamId && !isGoalkeeper(player) && player.id !== carrierId)
.map((player) => {
const startPosition = snapshotPositions.get(player.id) ?? player.actionOrigin ?? player.position;
const roleKey = getOffensiveRoleKey(player, teams[attackingTeamId]?.formation);
const threat = getPitchThreatProfile(player.position, attackingTeamId);
const depth = getAttackingDepth(player.position, attackingTeamId);
const startDepth = getAttackingDepth(startPosition, attackingTeamId);
const runDistance = distance(startPosition, player.position);
const runForwardGain = (player.position.x - startPosition.x) * attackSign;
const distanceToAction = distance(player.position, actionTarget);
const isPrincipleRunner = player.id === actionMeta.principleRunnerPlayerId;
const isReceiver = player.id === actionMeta.receiverPlayerId;
const isFrontLine = roleKey === "striker" || roleKey === "wideForward" || roleKey === "secondStriker";
const isBoxThreat = threat.box >= 0.22 || threat.cutbackZone >= 0.32 || depth >= 72;
const isDepthThreat = threat.behindLine >= 0.26 || depth >= 66 || (isFrontLine && depth >= 58);
const movedIntoChannel =
Math.abs(player.position.y - pitch.width / 2) >= 8.5 ||
Math.abs(player.position.y - startPosition.y) >= 5.2;
const isChannelRun =
runDistance >= 3.2 &&
runForwardGain >= 1.8 &&
movedIntoChannel &&
(
hasChannelCue ||
isPrincipleRunner ||
threat.assistZone >= 0.24 ||
threat.behindLine >= 0.18 ||
(isFrontLine && depth >= Math.max(startDepth + 4, 54))
);
const isBlindsideRun =
isChannelRun &&
(
principleText.includes("blindside") ||
isPrincipleRunner ||
getWideSideSign(startPosition) !== getWideSideSign(player.position) ||
runForwardGain >= 6
);
const isBetweenLinesThreat =
threat.betweenLines >= 0.34 ||
threat.centralPocket >= 0.26 ||
(roleKey === "connector" && depth >= 44);
const farSideThreat =
getWideSideSign(player) === -ballSide &&
(actionThreat.assistZone >= 0.34 || principleText.includes("switch") || principleText.includes("far"));
const score =
threat.value * 0.78 +
threat.box * 0.78 +
threat.behindLine * 0.62 +
threat.cutbackZone * 0.42 +
threat.betweenLines * 0.36 +
(isPrincipleRunner ? 0.82 : 0) +
(isReceiver && actionType === "pass" ? 0.22 : 0) +
(isFrontLine ? 0.28 : 0) +
(isBoxThreat ? 0.38 : 0) +
(isDepthThreat ? 0.28 : 0) +
(isChannelRun ? 0.42 : 0) +
(isBlindsideRun ? 0.34 : 0) +
Math.max(0, runForwardGain - 2) * 0.025 +
(isBetweenLinesThreat ? 0.22 : 0) +
(farSideThreat ? 0.34 : 0) -
(distanceToAction > 34 && !isPrincipleRunner ? 0.26 : 0);
return {
player,
roleKey,
threat,
depth,
startPosition,
startDepth,
runDistance,
runForwardGain,
distanceToAction,
isPrincipleRunner,
isReceiver,
isFrontLine,
isBoxThreat,
isDepthThreat,
isChannelRun,
isBlindsideRun,
isBetweenLinesThreat,
farSideThreat,
score,
};
})
.filter((entry) =>
entry.score >= 0.74 ||
entry.isPrincipleRunner ||
entry.isBoxThreat ||
entry.isDepthThreat ||
entry.isChannelRun ||
entry.isBlindsideRun ||
entry.isBetweenLinesThreat
)
.sort((a, b) => b.score - a.score)
.slice(0, 4);
}
function getDefensiveRunnerTrackingTarget(teamId, runnerThreat, slot = "goalSideMark") {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const runner = runnerThreat.player;
const sideSign = getWideSideSign(runner) || 1;
const points = {
goalSideMark: {
x: runner.position.x - sign * (runnerThreat.isDepthThreat ? 1.8 : 1.25),
y: lerp(runner.position.y, pitch.width / 2, runnerThreat.isBoxThreat ? 0.18 : 0.1),
},
depthCover: {
x: lerp(runner.position.x, ownGoal.x, 0.34),
y: lerp(runner.position.y, pitch.width / 2, 0.28),
},
blindsideTrack: {
x: runner.position.x - sign * 2.15,
y: lerp(runner.position.y, pitch.width / 2, 0.22),
},
channelHandover: {
x: runner.position.x - sign * 1.55,
y: lerp(runner.position.y, pitch.width / 2, runnerThreat.isBlindsideRun ? 0.28 : 0.18),
},
channelCover: {
x: lerp(runner.position.x, ownGoal.x, 0.3),
y: lerp(runner.position.y, pitch.width / 2, 0.38),
},
weakSideTuck: {
x: lerp(runner.position.x, ownGoal.x, 0.4),
y: clamp(pitch.width / 2 - sideSign * 7.8, 10, pitch.width - 10),
},
pocketScreen: {
x: runner.position.x - sign * 2.7,
y: lerp(runner.position.y, pitch.width / 2, 0.54),
},
farPostCover: {
x: lerp(runner.position.x, ownGoal.x, 0.28),
y: clamp(pitch.width / 2 + sideSign * 9.4, 8, pitch.width - 8),
},
cutbackCover: {
x: lerp(runner.position.x, ownGoal.x, 0.42),
y: clamp(pitch.width / 2 - sideSign * 4.8, 12, pitch.width - 12),
},
};
return clampToPitch(points[slot] ?? points.goalSideMark, 2.2);
}
function applyDefensiveRunnerTrackingTargets(
teamId,
targets,
groups,
ballPoint,
profile,
protectedIds = new Set()
) {
const threats = getDefensiveRunnerThreats(teamId, ballPoint, profile);
if (!threats.length) {
return {
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
const maxAssignments =
profile.phaseKey === "boxDefending"
? 4
: profile.phaseKey === "lowBlock"
? 3
: 2;
const assignTrackingTarget = (threat, slot, lineKeys, preferLabels, label) => {
const target = getDefensiveRunnerTrackingTarget(teamId, threat, slot);
const marker = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
if (!marker) {
return null;
}
targets.set(marker.id, target);
assignedIds.add(marker.id);
if (label) {
labels.push(label);
}
return marker;
};
threats.slice(0, maxAssignments).forEach((threat, index) => {
const slot =
threat.isBlindsideRun
? "blindsideTrack"
: threat.isChannelRun
? "channelHandover"
: threat.farSideThreat
? "farPostCover"
: threat.isBoxThreat
? index % 2 === 0 ? "goalSideMark" : "cutbackCover"
: threat.isDepthThreat
? "depthCover"
: threat.isBetweenLinesThreat
? "pocketScreen"
: "goalSideMark";
const lineKeys =
threat.isDepthThreat || threat.isBoxThreat || threat.farSideThreat || threat.isChannelRun
? ["back", "midfield"]
: ["midfield", "back"];
const preferLabels =
threat.isDepthThreat || threat.isBoxThreat || threat.isChannelRun
? ["CB", "LB", "RB", "WB", "6"]
: ["6", "8", "10", "CB"];
const marker = assignTrackingTarget(threat, slot, lineKeys, preferLabels, null);
if (!marker) return;
if (threat.isBlindsideRun) {
labels.push("Track blindside channel run");
} else if (threat.isChannelRun) {
labels.push("Handover channel runner");
} else if (threat.isPrincipleRunner) {
labels.push("Track designed runner");
} else if (threat.farSideThreat) {
labels.push("Track far-side runner");
} else if (threat.isBoxThreat) {
labels.push("Mark box runner");
} else if (threat.isDepthThreat) {
labels.push("Cover depth runner");
} else if (threat.isBetweenLinesThreat) {
labels.push("Screen pocket runner");
}
if ((threat.isBlindsideRun || threat.isChannelRun) && index === 0) {
assignTrackingTarget(
threat,
"channelCover",
["back"],
["CB", "LB", "RB", "WB"],
"Cover depth behind channel run"
);
if (profile.phaseKey !== "highPress") {
assignTrackingTarget(
threat,
"weakSideTuck",
["back", "midfield"],
["CB", "LB", "RB", "WB", "6"],
"Weak side tucks against runner"
);
}
}
});
return {
labels: uniquePrincipleLabels(labels),
focusPoint: threats[0]?.player?.position ? cloneVector(threats[0].player.position) : null,
protectedIds: assignedIds,
};
}
function getDribblePressureReference(actionMeta = state.draftStep) {
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType !== "dribble") {
return null;
}
const carrier = getPlayerById(actionMeta?.carrierPlayerId ?? state.ball.carrierPlayerId);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
carrier?.position ??
state.ball.position;
const targetPoint = actionMeta?.target ?? state.ball.target;
if (!startPoint || !targetPoint || distance(startPoint, targetPoint) <= 0.25) {
return null;
}
return {
carrier,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
};
}
function chooseDefensiveDribblePresser(teamId, targets, profile, reference) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const { carrier, startPoint, targetPoint } = reference;
const laneDistance = Math.max(distance(startPoint, targetPoint), 0.01);
const candidates = state.players.filter(
(player) =>
player.team === teamId &&
!isGoalkeeper(player) &&
player.id !== carrier?.id
);
let bestCandidate = null;
let bestScore = Infinity;
candidates.forEach((player) => {
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
const laneGap = distance(player.position, projection.point);
const carrierGap = distance(player.position, carrier?.position ?? startPoint);
const baseTarget = targets.get(player.id) ?? player.position;
const baseTargetGap = distance(baseTarget, startPoint);
const lineKey = getDefensiveAutopilotLineKey(player, formation, profile.phaseKey);
const canPressCarrier = carrierGap <= 18.5;
const canCutLane =
projection.ratio >= 0.02 &&
projection.ratio <= 0.72 &&
laneGap <= Math.max(7.2, laneDistance * 0.34);
if (!canPressCarrier && !canCutLane) {
return;
}
const lanePointDistance = distance(player.position, projection.point);
const timeToCarrier = computeTimeToCoverDistance(
player,
Math.max(carrierGap - playerRadiusMeters * 1.35, 0),
carrier?.position ?? startPoint
);
const timeToLane = computeTimeToCoverDistance(player, lanePointDistance, projection.point);
const nearCarrierBonus = canPressCarrier ? 4.2 : 0;
const laneCutBonus = canCutLane ? 3.2 : 0;
const linePenalty =
lineKey === "forward"
? profile.phaseKey === "highPress" ? -1.2 : 1.4
: lineKey === "back" && profile.phaseKey === "highPress"
? 1.8
: 0;
const score =
carrierGap * 0.46 +
laneGap * 0.4 +
baseTargetGap * 0.12 +
timeToCarrier * 0.95 +
timeToLane * 0.55 +
Math.abs(projection.ratio - 0.22) * 4.2 +
linePenalty -
nearCarrierBonus -
laneCutBonus;
if (score < bestScore) {
bestScore = score;
bestCandidate = player;
}
});
return bestCandidate;
}
function getDefensiveDribblePressTarget(player, reference, profile, liveBallPoint = null) {
const { startPoint, targetPoint } = reference;
const laneDistance = Math.max(distance(startPoint, targetPoint), 0.01);
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
const liveProgress =
state.ball.actionType === "dribble" && state.ball.inTransit
? getBallTravelProgress()
: 0;
const ballPoint = liveBallPoint ?? (
state.ball.actionType === "dribble" && state.ball.inTransit
? state.ball.position
: startPoint
);
const closeToCarrier = distance(player.position, ballPoint) <= 8.5;
const laneRatio = closeToCarrier
? clamp(liveProgress + 0.045, 0.04, 0.62)
: clamp(
Math.max(projection.ratio, liveProgress + 0.08, laneDistance > 14 ? 0.18 : 0.12),
0.06,
laneDistance > 18 ? 0.58 : 0.68
);
const lanePoint = {
x: lerp(startPoint.x, targetPoint.x, laneRatio),
y: lerp(startPoint.y, targetPoint.y, laneRatio),
};
const pressureDistance = closeToCarrier ? 0.55 : 0.15;
const pressurePoint = moveTowards(ballPoint, lanePoint, pressureDistance);
const insideBias =
(profile.phaseKey === "highPress" ? 0.08 : 0.14) +
(profile.threatResponse?.protectCenter ?? 0) * 0.16;
return clampToPitch({
x: pressurePoint.x,
y: lerp(pressurePoint.y, pitch.width / 2, insideBias),
}, 2);
}
function getDefensiveCarryContainmentContext(defensiveTeamId, ballPoint, profile, reference = getDribblePressureReference()) {
if (!reference || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const { carrier, startPoint, targetPoint } = reference;
const carryDistance = distance(startPoint, targetPoint);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId, getOffensiveAutopilotProfile(attackingTeamId, targetPoint));
const targetThreat = actionSpace.targetThreat;
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const openGrassCarry =
principleText.includes("open-grass") ||
(
carryDistance >= 9 &&
forwardGain >= 5 &&
actionSpace.openTarget >= 0.48 &&
actionSpace.targetPressure <= 0.72
);
const dangerousCarry =
openGrassCarry ||
targetThreat.behindLine >= 0.24 ||
targetThreat.centralPocket >= 0.28 ||
targetThreat.box >= 0.18 ||
getAttackingDepth(targetPoint, attackingTeamId) >= 54;
if (!dangerousCarry) {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const isWideCarry = isWidePrincipleZone(targetPoint) || isWidePrincipleZone(startPoint);
const finalThirdCarry =
targetDepth >= 64 ||
targetThreat.box >= 0.18 ||
targetThreat.cutbackZone >= 0.24 ||
targetThreat.behindLine >= 0.3;
const laneMid = {
x: lerp(startPoint.x, targetPoint.x, 0.52),
y: lerp(startPoint.y, targetPoint.y, 0.52),
};
return {
actionMeta,
attackingTeamId,
carrier,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
ballPoint: cloneVector(ballPoint ?? targetPoint),
carryDistance,
forwardGain,
actionSpace,
targetThreat,
openGrassCarry,
targetDepth,
sideSign,
laneMid,
isWideCarry,
finalThirdCarry,
mode: finalThirdCarry
? "emergencyDelay"
: openGrassCarry
? "openGrassDelay"
: "normalDelay",
};
}
function getDefensiveCarryContainmentTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const { startPoint, targetPoint, laneMid, sideSign } = context;
const lanePoint = (ratio) => ({
x: lerp(startPoint.x, targetPoint.x, ratio),
y: lerp(startPoint.y, targetPoint.y, ratio),
});
const delayPoint = lanePoint(context.finalThirdCarry ? 0.42 : 0.36);
const secondPressurePoint = lanePoint(context.finalThirdCarry ? 0.64 : 0.58);
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const points = {
delayCarrier: {
...goalSideOf(delayPoint, context.openGrassCarry ? 1.45 : 1.1),
y: lerp(delayPoint.y, pitch.width / 2, context.isWideCarry ? 0.12 : 0.24),
},
insideContain: {
x: secondPressurePoint.x - sign * 2.8,
y: lerp(secondPressurePoint.y, pitch.width / 2, context.isWideCarry ? 0.58 : 0.72),
},
channelLock: {
x: secondPressurePoint.x - sign * 1.9,
y: clamp(secondPressurePoint.y + sideSign * (context.isWideCarry ? 3.8 : 6.2), 3.5, pitch.width - 3.5),
},
depthDrop: {
x: lerp(targetPoint.x, ownGoal.x, context.finalThirdCarry ? 0.48 : 0.36),
y: lerp(targetPoint.y, pitch.width / 2, context.isWideCarry ? 0.4 : 0.28),
},
secondBallScreen: {
x: laneMid.x - sign * 7.2,
y: lerp(laneMid.y, pitch.width / 2, 0.62),
},
cutbackScreen: {
x: lerp(targetPoint.x, ownGoal.x, context.finalThirdCarry ? 0.42 : 0.34),
y: clamp(pitch.width / 2 + sideSign * 5.6, 12, pitch.width - 12),
},
farSideTuck: {
x: lerp(targetPoint.x, ownGoal.x, context.finalThirdCarry ? 0.42 : 0.34),
y: clamp(pitch.width / 2 - sideSign * 10.2, 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.delayCarrier, 2.2);
}
function applyDefensiveCarryContainmentTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveCarryContainmentContext(teamId, ballPoint, profile, reference);
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
const delayTarget = getDefensiveCarryContainmentTarget(teamId, context, "delayCarrier");
const presserCanContain =
presser &&
!isGoalkeeper(presser) &&
distance(presser.position, delayTarget) <= (context.openGrassCarry ? 22 : 17);
if (presserCanContain) {
targets.set(presser.id, delayTarget);
assignedIds.add(presser.id);
labels.push(context.openGrassCarry ? "Delay open-grass carry" : "Delay ball carrier");
} else {
const containPlayer = pickDefensiveAutopilotPlayer(
groups,
context.finalThirdCarry ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
assignedIds,
delayTarget,
context.isWideCarry ? ["WB", "LB", "RB", "W", "8", "6"] : ["6", "8", "10", "CB", "9"]
);
if (containPlayer) {
targets.set(containPlayer.id, delayTarget);
assignedIds.add(containPlayer.id);
presser = containPlayer;
labels.push(context.openGrassCarry ? "Delay open-grass carry" : "Delay ball carrier");
}
}
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveCarryContainmentTarget(teamId, context, slot);
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
assign("insideContain", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Block inside carry lane");
if (context.isWideCarry) {
assign("channelLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Lock outside channel");
} else {
assign("secondBallScreen", ["midfield", "forward"], ["6", "8", "10", "9"], "Screen next touch");
}
assign("depthDrop", ["back"], ["CB", "LB", "RB", "WB"], "Drop to protect depth");
if (context.finalThirdCarry) {
assign("cutbackScreen", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Protect cutback on carry");
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side protects box");
} else if (context.openGrassCarry) {
assign("farSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Far side narrows behind carry");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
function getDefensivePressureCoverContext(teamId, ballPoint, presser, profile) {
if (!presser || isGoalkeeper(presser) || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
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
};
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!attackingTeamId || !targetPoint || !startPoint) {
return null;
}
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(presser) ||
getWideSideSign(startPoint) ||
1;
const isWidePressure = Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2) >= 0.54;
const centralDanger =
targetThreat.centralPocket >= 0.24 ||
targetThreat.betweenLines >= 0.32 ||
targetThreat.box >= 0.16 ||
ballFromOwnGoal <= 45;
const depthDanger =
targetThreat.behindLine >= 0.24 ||
actionSpace.lineBreakCount >= 1 ||
forwardGain >= 8;
return {
actionMeta,
attackingTeamId,
presser,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
targetThreat,
actionSpace,
ballFromOwnGoal,
sideSign,
isWidePressure,
centralDanger,
depthDanger,
forwardGain,
phaseKey: profile.phaseKey,
};
}
function getDefensivePressureCoverTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const presserTarget = context.presserTarget ?? goalSideOf(ball, 1.8);
const coverDistance =
context.phaseKey === "highPress"
? 4.8
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 6.8
: 5.8;
const supportDepth =
context.phaseKey === "highPress"
? 4.6
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 6.4
: 5.4;
const triangleWidth =
context.isWidePressure
? 4.8
: context.centralDanger
? 3.6
: 4.2;
const points = {
insideCover: {
...goalSideOf(presserTarget, supportDepth),
y: lerp(
presserTarget.y,
pitch.width / 2,
context.isWidePressure ? 0.72 : 0.82
),
},
pressCover: {
x: lerp(ball.x, ownGoal.x, context.depthDanger ? 0.38 : 0.28),
y: lerp(ball.y, pitch.width / 2, context.centralDanger ? 0.74 : 0.58),
},
laneScreen: {
x: lerp(context.startPoint.x, ball.x, 0.6) - sign * (2.4 + context.targetThreat.value * 1.1),
y: lerp(lerp(context.startPoint.y, ball.y, 0.6), pitch.width / 2, 0.18),
},
outsideLock: {
x: presserTarget.x - sign * 2.2,
y: clamp(ball.y + sideSign * triangleWidth, 3.5, pitch.width - 3.5),
},
weakSideBalance: {
x: lerp(ball.x, ownGoal.x, context.depthDanger ? 0.42 : 0.34),
y: clamp(pitch.width / 2 - sideSign * (context.phaseKey === "boxDefending" ? 7.8 : 10.8), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.insideCover, 2.2);
}
function applyDefensivePressureCoverBalanceTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile
) {
const context = getDefensivePressureCoverContext(teamId, ballPoint, presser, profile);
if (!context) {
return {
labels: [],
focusPoint: null,
protectedIds: new Set([presser?.id].filter(Boolean)),
};
}
context.presserTarget = cloneVector(
targets.get(presser.id) ?? getDefensivePressTarget(teamId, ballPoint, profile, presser)
);
const labels = [];
const assignedIds = new Set([
presser?.id,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensivePressureCoverTarget(teamId, context, slot);
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
assign("insideCover", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Second defender covers inside");
assign("pressCover", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Third defender covers behind press");
if (context.isWidePressure) {
assign("outsideLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Lock outside of press");
} else {
assign("laneScreen", ["midfield", "forward"], ["6", "8", "10", "9"], "Screen pass behind press");
}
if (context.depthDanger || context.centralDanger || context.isWidePressure) {
assign("weakSideBalance", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Balance far side");
}
return {
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
function getDefensivePressChainSupportContext(teamId, ballPoint, presser, profile) {
if (!presser || isGoalkeeper(presser) || !ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
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
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!targetPoint || !startPoint || !["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const carrier = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(receiver) ||
getWideSideSign(carrier) ||
getWideSideSign(startPoint) ||
1;
const isWidePress = isWidePrincipleZone(targetPoint) || Math.abs(targetPoint.y - pitch.width / 2) >= 17;
const centralRisk =
targetThreat.centralPocket >= 0.22 ||
targetThreat.betweenLines >= 0.28 ||
targetThreat.box >= 0.14 ||
actionSpace.lineBreakCount >= 1;
const shouldChain =
profile.pressingIntensity >= 0.48 ||
ballFromOwnGoal <= 46 ||
centralRisk ||
actionType === "dribble" ||
forwardGain >= 6;
if (!shouldChain) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const carrierId = carrier?.id ?? null;
const receiverId = receiver?.id ?? null;
const outlets = state.players
.filter((player) => player.team === attackingTeamId && player.id !== carrierId && !isGoalkeeper(player))
.map((player) => {
const point = player.position;
const gap = distance(targetPoint, point);
if (gap < 4.5 || gap > 30) {
return null;
}
const threat = getPitchThreatProfile(point, attackingTeamId);
const forwardFromBall = (point.x - targetPoint.x) * attackSign;
const centrality = 1 - Math.abs(point.y - pitch.width / 2) / (pitch.width / 2);
const receiverBoost = player.id === receiverId ? 0.18 : 0;
const score =
threat.value * 0.52 +
threat.centralPocket * 0.28 +
threat.betweenLines * 0.24 +
threat.box * 0.24 +
clamp(forwardFromBall / 18, -0.12, 0.28) +
centrality * 0.14 +
receiverBoost +
clamp((22 - gap) / 22, 0, 0.22);
return {
player,
point: cloneVector(point),
threat,
gap,
forwardFromBall,
score,
};
})
.filter(Boolean)
.sort((a, b) => b.score - a.score)
.slice(0, 3);
return {
actionMeta,
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
targetThreat,
actionSpace,
ballFromOwnGoal,
forwardGain,
sideSign,
isWidePress,
centralRisk,
outlets,
phaseKey: profile.phaseKey,
};
}
function getDefensivePressChainSupportTarget(teamId, context, slot, outlet = null) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const outletPoint = outlet?.point ?? ball;
const supportDepth =
context.phaseKey === "highPress"
? 4.6
: context.phaseKey === "lowBlock" || context.phaseKey === "boxDefending"
? 7.2
: 5.8;
const points = {
secondWave: {
...goalSideOf(ball, supportDepth),
y: lerp(ball.y, pitch.width / 2, context.isWidePress ? 0.72 : 0.82),
},
insideGate: {
x: lerp(ball.x, ownGoal.x, context.centralRisk ? 0.22 : 0.16),
y: lerp(ball.y, pitch.width / 2, context.isWidePress ? 0.86 : 0.72),
},
touchlineLock: {
x: ball.x - sign * (context.phaseKey === "highPress" ? 2.8 : 3.8),
y: clamp(ball.y + sideSign * 5.2, 3.5, pitch.width - 3.5),
},
outletLock: {
...goalSideOf({
x: lerp(outletPoint.x, ball.x, 0.24),
y: lerp(outletPoint.y, pitch.width / 2, outlet?.threat?.centralPocket >= 0.22 ? 0.24 : 0.1),
}, outlet?.threat?.value >= 0.34 ? 1.65 : 1.1),
},
weakSideBalance: {
x: lerp(ball.x, ownGoal.x, context.centralRisk ? 0.38 : 0.3),
y: clamp(pitch.width / 2 - sideSign * (context.phaseKey === "boxDefending" ? 7.2 : 10.6), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.secondWave, 2.2);
}
function applyDefensivePressChainSupportTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensivePressChainSupportContext(teamId, ballPoint, presser, profile);
if (!context) {
return {
labels: [],
focusPoint: null,
protectedIds: new Set(protectedIds),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
presser?.id,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
const assign = (slot, lineKeys, preferLabels, label, outlet = null) => {
const target = getDefensivePressChainSupportTarget(teamId, context, slot, outlet);
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
assign("secondWave", ["midfield", "back"], ["6", "8", "CB", "10"], "Press chain: second wave covers");
assign("insideGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Press chain: close inside gate");
context.outlets.slice(0, context.centralRisk ? 2 : 1).forEach((outlet, index) => {
assign(
"outletLock",
index === 0 ? ["midfield", "forward", "back"] : ["midfield", "back", "forward"],
outlet.threat.box >= 0.12 || outlet.threat.centralPocket >= 0.22
? ["6", "8", "CB", "10"]
: ["W", "8", "LB", "RB", "WB", "10"],
index === 0 ? "Press chain: lock first outlet" : "Press chain: lock next outlet",
outlet
);
});
if (context.isWidePress) {
assign("touchlineLock", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Press chain: lock touchline");
}
if (context.centralRisk || context.ballFromOwnGoal <= 42 || context.isWidePress) {
assign("weakSideBalance", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Press chain: far side balances");
}
if (labels.length) {
labels.unshift("Defensive press chain support");
}
return {
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
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
function getDefensivePostRecoveryResponseContext(defensiveTeamId, ballPoint, profile = {}) {
if (state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
const plannedPossessionTeamId = getPlannedPossessionTeamId();
if (!attackingTeamId || (plannedPossessionTeamId && plannedPossessionTeamId !== attackingTeamId)) {
return null;
}
const steps = state.sequence?.steps ?? [];
let recoveryIndex = -1;
for (let index = steps.length - 1; index >= 0; index -= 1) {
const step = steps[index];
const possessionTeamId = getRecordedStepPossessionTeamId(step);
const isRecovery =
step?.actionType === "recovery" ||
step?.profileKey === "loose-ball-recovery" ||
`${step?.profileLabel ?? ""}`.toLowerCase().includes("loose ball");
if (isRecovery && possessionTeamId === attackingTeamId) {
recoveryIndex = index;
break;
}
if (possessionTeamId && possessionTeamId !== attackingTeamId) {
break;
}
}
if (recoveryIndex < 0) {
return null;
}
const actionsAfterRecovery = steps.slice(recoveryIndex + 1);
if (actionsAfterRecovery.length > 4) {
return null;
}
if (actionsAfterRecovery.some((step) => getRecordedStepPossessionTeamId(step) !== attackingTeamId)) {
return null;
}
const elapsed = actionsAfterRecovery.reduce(
(total, step) => total + getRecordedStepDuration(step),
0
);
if (elapsed > 10.5) {
return null;
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
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (!["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position;
const targetPoint =
actionMeta.target ??
ballPoint ??
state.ball.target ??
state.ball.position;
if (!startPoint || !targetPoint) {
return null;
}
const recoveryStep = steps[recoveryIndex];
const recoveryPoint =
recoveryStep?.target ??
recoveryStep?.afterSnapshot?.ball?.position ??
startPoint;
const originDepth = getAttackingDepth(recoveryPoint, attackingTeamId);
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const currentDepth = getAttackingDepth(startPoint, attackingTeamId);
const depthGainSinceRecovery = currentDepth - originDepth;
const actionForwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const actionDistance = distance(startPoint, targetPoint);
const attackingProfile = getOffensiveAutopilotProfile(attackingTeamId, targetPoint);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId, attackingProfile);
const targetThreat = actionSpace.targetThreat;
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetPoint) - getPitchLaneIndex(startPoint));
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const patterns = actionsAfterRecovery
.map((step) => getRecordedStepPattern(step, attackingTeamId))
.filter(Boolean);
const sidewaysOrBackCount = patterns.filter((pattern) => pattern.forwardGain <= 2.5).length;
const lineBreakCount = patterns.filter((pattern) => pattern.family === "line-break" || pattern.forwardGain >= 9).length;
const laneVariety = new Set(patterns.map((pattern) => pattern.laneKey).filter(Boolean)).size;
const sameLaneStall = actionsAfterRecovery.length >= 2 && laneVariety <= 1 && depthGainSinceRecovery < 8;
const localDefensiveAccess = getTeamSupportCountAroundPoint(
defensiveTeamId,
targetPoint,
new Set(),
10.5
);
const localAttackingSupport = getTeamSupportCountAroundPoint(
attackingTeamId,
targetPoint,
new Set([actionMeta.receiverPlayerId, actionMeta.carrierPlayerId].filter(Boolean)),
13
);
const transitionThreat =
actionForwardGain >= 6 &&
(
actionSpace.lineBreakCount >= 1 ||
targetThreat.behindLine >= 0.2 ||
targetThreat.centralPocket >= 0.24 ||
targetThreat.box >= 0.14 ||
targetDepth >= 58
);
const secureExit =
actionType === "pass" &&
actionDistance <= 22 &&
actionForwardGain >= -8 &&
actionSpace.targetPressure <= 0.72;
const switchExit =
actionType === "pass" &&
laneShift >= 2 &&
actionDistance >= 16;
const finalThirdThreat =
ballFromOwnGoal <= 42 ||
targetThreat.box >= 0.14 ||
targetThreat.cutbackZone >= 0.2 ||
targetThreat.assistZone >= 0.32;
const directAttackStyle = isTransitionAttackStyle(attackingProfile.styleKey);
const pressStyle = ["counter-press", "gegenpress", "high-press", "press-trap-wide"].includes(profile.styleKey);
const delayNeed = clamp(
(transitionThreat ? 0.34 : 0) +
actionSpace.value * 0.22 +
clamp((52 - ballFromOwnGoal) / 34, 0, 1) * 0.24 +
(directAttackStyle ? 0.14 : 0) +
(localDefensiveAccess <= 1 ? 0.08 : 0),
0,
1.1
);
const jumpNeed = clamp(
(secureExit ? 0.24 : 0) +
(switchExit ? 0.18 : 0) +
(pressStyle ? 0.22 : 0) +
(profile.pressingIntensity ?? 0.5) * 0.24 +
(sameLaneStall ? 0.12 : 0),
0,
1.1
);
const recoverNeed = clamp(
clamp((44 - ballFromOwnGoal) / 28, 0, 1) * 0.32 +
(finalThirdThreat ? 0.2 : 0) +
(transitionThreat && localDefensiveAccess <= 1 ? 0.16 : 0) +
(profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending" ? 0.14 : 0),
0,
1.1
);
const mode =
delayNeed >= Math.max(0.52, jumpNeed * 0.92) || transitionThreat
? "delayCounter"
: jumpNeed >= Math.max(0.5, recoverNeed * 0.9)
? "jumpFirstPass"
: "recoverShape";
return {
active: true,
defensiveTeamId,
attackingTeamId,
actionMeta,
actionType,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
recoveryPoint: cloneVector(recoveryPoint),
actionsAfterRecovery: actionsAfterRecovery.length,
elapsed,
originDepth,
currentDepth,
targetDepth,
depthGainSinceRecovery,
actionForwardGain,
actionDistance,
actionSpace,
targetThreat,
ballFromOwnGoal,
laneShift,
sideSign,
sidewaysOrBackCount,
lineBreakCount,
laneVariety,
sameLaneStall,
localDefensiveAccess,
localAttackingSupport,
transitionThreat,
secureExit,
switchExit,
finalThirdThreat,
directAttackStyle,
pressStyle,
delayNeed,
jumpNeed,
recoverNeed,
mode,
};
}
function getDefensivePostRecoveryResponseTarget(teamId, context, slot, outlet = null) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const ball = context.targetPoint;
const start = context.startPoint;
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const routePoint = (ratio) => ({
x: lerp(start.x, ball.x, ratio),
y: lerp(start.y, ball.y, ratio),
});
const gateDepth = clamp(context.ballFromOwnGoal + (context.finalThirdThreat ? 4.5 : 7.5), 16, 52);
const coverDepth = clamp(context.ballFromOwnGoal - (context.finalThirdThreat ? 3.8 : 7.2), 7.5, 38);
const outletPoint = outlet?.position ?? outlet?.point ?? ball;
const points = {
delayCarrier: {
...goalSideOf(context.actionType === "dribble" ? routePoint(0.74) : ball, context.transitionThreat ? 1.35 : 1.85),
y: lerp(ball.y, pitch.width / 2, context.targetThreat.centralPocket >= 0.24 ? 0.28 : 0.16),
},
jumpFirstPass: {
x: lerp(start.x, ball.x, context.secureExit ? 0.7 : 0.54) - sign * 1.25,
y: lerp(start.y, ball.y, 0.68),
},
centralGate: {
x: getDepthX(teamId, gateDepth),
y: lerp(ball.y, pitch.width / 2, context.finalThirdThreat ? 0.88 : 0.74),
},
counterLaneGate: {
x: lerp(ball.x, ownGoal.x, context.finalThirdThreat ? 0.22 : 0.16),
y: lerp(ball.y, pitch.width / 2, context.targetThreat.centralPocket >= 0.24 ? 0.82 : 0.62),
},
firstOutletLock: {
...goalSideOf({
x: lerp(outletPoint.x, ball.x, 0.22),
y: lerp(outletPoint.y, pitch.width / 2, 0.14),
}, context.transitionThreat ? 1.55 : 1.1),
},
switchLock: {
x: lerp(ball.x, ownGoal.x, 0.24),
y: clamp(pitch.width / 2 - sideSign * 16.5, 4.5, pitch.width - 4.5),
},
restLineCover: {
x: getDepthX(teamId, coverDepth),
y: lerp(ball.y, pitch.width / 2, context.finalThirdThreat ? 0.46 : 0.36),
},
weakSideRecover: {
x: lerp(ball.x, ownGoal.x, context.finalThirdThreat ? 0.4 : 0.32),
y: clamp(pitch.width / 2 - sideSign * (context.finalThirdThreat ? 8.4 : 12.4), 7, pitch.width - 7),
},
boxCover: {
x: getDepthX(teamId, clamp(context.ballFromOwnGoal - 1.8, 7.5, 23)),
y: clamp(pitch.width / 2 + sideSign * 4.6, 10, pitch.width - 10),
},
farPostCover: {
x: getDepthX(teamId, clamp(context.ballFromOwnGoal - 3.8, 6.5, 20)),
y: clamp(pitch.width / 2 - sideSign * 9.4, 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.centralGate, 2.1);
}
function getDefensivePostRecoveryOutletOptions(context) {
const attackSign = getAttackDirectionSign(context.attackingTeamId);
return state.players
.filter((player) => player.team === context.attackingTeamId && !isGoalkeeper(player))
.map((player) => {
const forwardGap = (player.position.x - context.targetPoint.x) * attackSign;
const gap = distance(player.position, context.targetPoint);
const threat = getPitchThreatProfile(player.position, context.attackingTeamId);
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const outletScore =
threat.value * 0.44 +
clamp(forwardGap / 18, -0.08, 0.34) +
(["striker", "wideForward", "secondStriker", "connector"].includes(roleKey) ? 0.18 : 0) -
gap * 0.014;
return {
player,
position: cloneVector(player.position),
roleKey,
threat,
gap,
outletScore,
};
})
.filter((option) => option.gap <= 30 && option.outletScore >= 0.08)
.sort((a, b) => b.outletScore - a.outletScore);
}
function applyDefensivePostRecoveryResponseTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensivePostRecoveryResponseContext(teamId, ballPoint, profile);
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
const assign = (slot, lineKeys, preferLabels, label, outlet = null) => {
const target = getDefensivePostRecoveryResponseTarget(teamId, context, slot, outlet);
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
const delayTarget = getDefensivePostRecoveryResponseTarget(
teamId,
context,
context.mode === "jumpFirstPass" ? "jumpFirstPass" : "delayCarrier"
);
const presserCanRespond =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, delayTarget) <= (context.transitionThreat ? 24 : 19);
if (presserCanRespond) {
targets.set(presser.id, delayTarget);
assignedIds.add(presser.id);
labels.push(context.mode === "jumpFirstPass" ? "Post-recovery defence: jump first pass" : "Post-recovery defence: delay counter");
} else {
const delayPlayer = assign(
context.mode === "jumpFirstPass" ? "jumpFirstPass" : "delayCarrier",
context.finalThirdThreat ? ["back", "midfield", "forward"] : ["midfield", "forward", "back"],
context.mode === "jumpFirstPass" ? ["9", "10", "W", "8", "6"] : ["6", "8", "CB", "10", "WB", "LB", "RB"],
context.mode === "jumpFirstPass" ? "Post-recovery defence: jump first pass" : "Post-recovery defence: delay counter"
);
presser = delayPlayer ?? presser;
}
const outlets = getDefensivePostRecoveryOutletOptions(context);
assign("centralGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Post-recovery defence: close central gate");
if (context.transitionThreat || context.mode === "delayCounter") {
assign("counterLaneGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Post-recovery defence: block counter lane");
}
outlets.slice(0, context.transitionThreat ? 2 : 1).forEach((outlet, index) => {
assign(
"firstOutletLock",
index === 0 ? ["midfield", "forward", "back"] : ["midfield", "back", "forward"],
outlet.threat.box >= 0.12 || outlet.threat.centralPocket >= 0.2
? ["6", "8", "CB", "10"]
: ["W", "8", "LB", "RB", "WB", "10"],
index === 0 ? "Post-recovery defence: lock first outlet" : "Post-recovery defence: lock next outlet",
outlet
);
});
if (context.switchExit || context.sameLaneStall) {
assign("switchLock", ["back", "midfield"], ["WB", "LB", "RB", "W", "8"], "Post-recovery defence: protect switch");
}
assign("restLineCover", ["back"], ["CB", "LB", "RB", "WB"], "Post-recovery defence: protect depth");
assign("weakSideRecover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Post-recovery defence: weak side recovers");
if (context.finalThirdThreat) {
assign("boxCover", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Post-recovery defence: protect box");
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Post-recovery defence: cover far post");
}
if (labels.length) {
labels.unshift(
context.mode === "delayCounter"
? "Defend post-recovery counter"
: context.mode === "jumpFirstPass"
? "Defend post-recovery first pass"
: "Defend post-recovery shape"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
function getDefensivePassLaneDenialContext(defensiveTeamId, ballPoint, profile) {
if (state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(defensiveTeamId);
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
if (!attackingTeamId || actionMeta.actionType !== "pass") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position;
const targetPoint = actionMeta.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const passDistance = distance(startPoint, targetPoint);
if (passDistance < 6) {
return null;
}
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const targetThreat = actionSpace.targetThreat;
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(receiver) ||
getWideSideSign(startPoint) ||
1;
const laneDanger =
actionSpace.lineBreakCount >= 1 ||
forwardGain >= 7 ||
targetThreat.betweenLines >= 0.28 ||
targetThreat.centralPocket >= 0.22 ||
targetThreat.box >= 0.16 ||
targetThreat.assistZone >= 0.32;
const isWidePass = isWidePrincipleZone(targetPoint) || isWidePrincipleZone(startPoint);
if (!laneDanger && passDistance < 13) {
return null;
}
return {
actionMeta,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
receiver,
passDistance,
forwardGain,
actionSpace,
targetThreat,
sideSign,
laneDanger,
isWidePass,
phaseKey: profile.phaseKey,
};
}
function getDefensivePassLaneDenialTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const lanePoint = (ratio) => ({
x: lerp(context.startPoint.x, context.targetPoint.x, ratio),
y: lerp(context.startPoint.y, context.targetPoint.y, ratio),
});
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const sideSign = context.sideSign || 1;
const nearLane = lanePoint(context.passDistance >= 22 ? 0.34 : 0.42);
const midLane = lanePoint(0.58);
const lateLane = lanePoint(context.passDistance >= 22 ? 0.72 : 0.68);
const points = {
carrierShadow: {
...goalSideOf(nearLane, context.phaseKey === "highPress" ? 1.15 : 1.8),
y: lerp(nearLane.y, pitch.width / 2, context.isWidePass ? 0.22 : 0.36),
},
centralLaneScreen: {
...goalSideOf(midLane, context.laneDanger ? 3.4 : 2.4),
y: lerp(midLane.y, pitch.width / 2, context.isWidePass ? 0.42 : 0.68),
},
receiverShadow: {
...goalSideOf(lateLane, context.targetThreat.box >= 0.16 ? 2.2 : 1.7),
y: lerp(lateLane.y, pitch.width / 2, context.isWidePass ? 0.18 : 0.32),
},
outsideTrap: {
x: lateLane.x - sign * 1.8,
y: clamp(lateLane.y + sideSign * 4.6, 3.5, pitch.width - 3.5),
},
depthCover: {
x: lerp(context.targetPoint.x, ownGoal.x, context.targetThreat.box >= 0.2 ? 0.42 : 0.32),
y: lerp(context.targetPoint.y, pitch.width / 2, context.isWidePass ? 0.44 : 0.28),
},
weakSideTuck: {
x: lerp(context.targetPoint.x, ownGoal.x, 0.34),
y: clamp(pitch.width / 2 - sideSign * (context.phaseKey === "boxDefending" ? 7.2 : 10.5), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.centralLaneScreen, 2.2);
}
function applyDefensivePassLaneDenialTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensivePassLaneDenialContext(teamId, ballPoint, profile);
if (!context) {
return {
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
const target = getDefensivePassLaneDenialTarget(teamId, context, slot);
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
assign("carrierShadow", ["forward", "midfield"], ["9", "10", "W", "8", "6"], "Cover shadow from ball");
assign("centralLaneScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Deny central pass lane");
assign("receiverShadow", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Arrive goal-side of receiver");
if (context.isWidePass) {
assign("outsideTrap", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Trap outside receiving lane");
}
if (
context.actionSpace.lineBreakCount >= 1 ||
context.targetThreat.behindLine >= 0.22 ||
context.targetThreat.box >= 0.16 ||
context.forwardGain >= 10
) {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover behind pass lane");
}
if (
context.passDistance >= 20 ||
context.targetThreat.assistZone >= 0.32 ||
context.targetThreat.box >= 0.18
) {
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Weak side narrows behind lane");
}
if (labels.length) {
labels.unshift("Deny pass lane");
}
return {
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
function getDefensiveCentralAccessGateContext(defensiveTeamId, ballPoint, profile) {
if (state.restartPhase?.type || !ballPoint) {
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
profileKey: state.ball.profileKey,
profileLabel: state.ball.profileLabel,
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (actionType !== "pass" && actionType !== "dribble") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const startThreat = getPitchThreatProfile(startPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(
startPoint,
targetPoint,
attackingTeamId,
getOffensiveAutopilotProfile(attackingTeamId, targetPoint)
);
const targetGameSpace = getAttackingGameSpaceProfile(targetPoint, attackingTeamId);
const startGameSpace = getAttackingGameSpaceProfile(startPoint, attackingTeamId);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const actionDistance = distance(startPoint, targetPoint);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const centrality = 1 - Math.abs(targetPoint.y - pitch.width / 2) / (pitch.width / 2);
const carrierPressure = carrier ? getPlayerPressureLoad(carrier, startPoint) : 0.48;
const laneClarity =
carrier && actionType === "pass"
? computePassLaneClarity(carrier, targetPoint, { receiverPlayerId: receiver?.id })
: clamp(0.54 + actionSpace.openTarget * 0.18 - carrierPressure * 0.1, 0.22, 0.9);
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isSpaceTwoEntry =
targetGameSpace.key === "space2" ||
targetThreat.betweenLines >= 0.3 ||
(
targetGameSpace.index > startGameSpace.index &&
targetGameSpace.index >= 2 &&
forwardGain >= 3.5
);
const isCentralOrHalfSpace =
targetThreat.centralPocket >= 0.2 ||
targetThreat.halfSpace >= 0.32 ||
centrality >= 0.46 ||
Math.abs(targetPoint.y - pitch.width / 2) <= 18;
const canFaceForward =
carrierPressure <= 0.5 &&
laneClarity >= 0.42 &&
(
targetThreat.centralPocket >= 0.2 ||
targetThreat.betweenLines >= 0.28 ||
targetThreat.halfSpace >= 0.34 ||
actionSpace.value >= 0.32
);
const receiveToTurnCue =
receiver &&
actionType === "pass" &&
actionDistance >= 6 &&
(
isSpaceTwoEntry ||
principleText.includes("space 2") ||
principleText.includes("between") ||
principleText.includes("line-break")
);
const carryIntoGateCue =
actionType === "dribble" &&
forwardGain >= 4 &&
isCentralOrHalfSpace &&
(
targetThreat.betweenLines >= 0.24 ||
targetThreat.centralPocket >= 0.18 ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.28
);
const active =
ballFromOwnGoal <= 68 &&
isCentralOrHalfSpace &&
(
receiveToTurnCue ||
carryIntoGateCue ||
canFaceForward ||
(isSpaceTwoEntry && forwardGain >= 2.5)
);
if (!active) {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(receiver) ||
getWideSideSign(startPoint) ||
Math.sign(targetPoint.y - pitch.width / 2) ||
1;
const dangerScore = clamp(
targetThreat.centralPocket * 0.44 +
targetThreat.betweenLines * 0.42 +
targetThreat.halfSpace * 0.28 +
targetThreat.box * 0.22 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.26 +
clamp(forwardGain / 16, 0, 1) * 0.18 +
(canFaceForward ? 0.18 : 0) +
(receiveToTurnCue ? 0.12 : 0) -
carrierPressure * 0.08,
0,
1.35
);
return {
actionMeta,
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
targetThreat,
startThreat,
actionSpace,
targetGameSpace,
startGameSpace,
forwardGain,
actionDistance,
ballFromOwnGoal,
centrality,
carrierPressure,
laneClarity,
isSpaceTwoEntry,
isCentralOrHalfSpace,
canFaceForward,
receiveToTurnCue,
carryIntoGateCue,
sideSign,
dangerScore,
mode: carryIntoGateCue
? "carryGate"
: receiveToTurnCue
? "receiveGate"
: "centralScreen",
};
}
function getDefensiveCentralAccessGateTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const lanePoint = (ratio) => ({
x: lerp(context.startPoint.x, target.x, ratio),
y: lerp(context.startPoint.y, target.y, ratio),
});
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const gateDepth = clamp(
context.ballFromOwnGoal + (context.targetThreat.box >= 0.14 ? 2.6 : 5.4),
context.ballFromOwnGoal <= 34 ? 13 : 20,
context.ballFromOwnGoal <= 44 ? 45 : 58
);
const coverDepth = clamp(
context.ballFromOwnGoal - (context.targetThreat.behindLine >= 0.18 ? 4.6 : 2.4),
7.5,
context.ballFromOwnGoal <= 38 ? 32 : 48
);
const centralPull =
context.mode === "carryGate"
? 0.72
: context.targetThreat.centralPocket >= 0.24
? 0.86
: 0.66;
const points = {
frontGate: {
...goalSideOf(context.mode === "carryGate" ? lanePoint(0.66) : target, context.mode === "carryGate" ? 1.6 : 1.25),
y: lerp(target.y, pitch.width / 2, context.targetThreat.centralPocket >= 0.24 ? 0.16 : 0.08),
},
centralScreen: {
x: getDepthX(teamId, gateDepth),
y: lerp(target.y, pitch.width / 2, centralPull),
},
halfSpaceLock: {
x: getDepthX(teamId, clamp(gateDepth - 1.4, 14, 56)),
y: clamp(
lerp(target.y, pitch.width / 2 + sideSign * 8.2, context.targetThreat.halfSpace >= 0.34 ? 0.42 : 0.22),
6,
pitch.width - 6
),
},
bounceLock: {
...goalSideOf(lanePoint(context.actionType === "pass" ? 0.36 : 0.48), 2.6),
y: lerp(lanePoint(0.42).y, pitch.width / 2, 0.64),
},
backScreen: {
x: getDepthX(teamId, coverDepth),
y: lerp(target.y, pitch.width / 2, context.targetThreat.behindLine >= 0.18 ? 0.42 : 0.54),
},
weakSideTuck: {
x: lerp(target.x, ownGoal.x, context.ballFromOwnGoal <= 38 ? 0.4 : 0.3),
y: clamp(pitch.width / 2 - sideSign * (context.ballFromOwnGoal <= 38 ? 7.8 : 11.2), 7, pitch.width - 7),
},
};
return clampToPitch(points[slot] ?? points.centralScreen, 2.1);
}
function applyDefensiveCentralAccessGateTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveCentralAccessGateContext(teamId, ballPoint, profile);
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
let presser = basePresser;
const assign = (slot, lineKeys, preferLabels, label) => {
const target = getDefensiveCentralAccessGateTarget(teamId, context, slot);
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
const frontGateTarget = getDefensiveCentralAccessGateTarget(teamId, context, "frontGate");
const canReusePresser =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, frontGateTarget) <= (context.mode === "carryGate" ? 19 : 15.5);
if (canReusePresser) {
targets.set(presser.id, frontGateTarget);
assignedIds.add(presser.id);
labels.push(context.mode === "carryGate" ? "Central gate: delay carry" : "Central gate: deny turn");
} else {
const gatePlayer = assign(
"frontGate",
context.ballFromOwnGoal <= 38 ? ["midfield", "back", "forward"] : ["midfield", "forward", "back"],
context.mode === "carryGate" ? ["6", "8", "10", "CB"] : ["6", "8", "10", "9"],
context.mode === "carryGate" ? "Central gate: delay carry" : "Central gate: deny turn"
);
presser = gatePlayer ?? presser;
}
assign("centralScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Central gate: screen space 2");
if (context.targetThreat.halfSpace >= 0.26 || Math.abs(context.targetPoint.y - pitch.width / 2) >= 8) {
assign("halfSpaceLock", ["midfield", "back"], ["8", "6", "WB", "LB", "RB", "CB"], "Central gate: lock half-space");
}
if (context.actionType === "pass" || context.laneClarity >= 0.46) {
assign("bounceLock", ["forward", "midfield"], ["10", "9", "8", "W", "6"], "Central gate: block bounce pass");
}
if (
context.actionSpace.lineBreakCount >= 1 ||
context.targetThreat.behindLine >= 0.18 ||
context.dangerScore >= 0.72
) {
assign("backScreen", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Central gate: protect depth behind");
}
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Central gate: weak side narrows");
if (labels.length) {
labels.unshift(
context.mode === "carryGate"
? "Protect central carry gate"
: context.mode === "receiveGate"
? "Protect space 2 receiving gate"
: "Protect central access"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
function getDefensiveChanceDenialContext(defensiveTeamId, ballPoint, profile, reference = getDribblePressureReference()) {
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
const threatPoint = actionType === "shot" ? startPoint : targetPoint;
const carrier = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const targetThreat = getPitchThreatProfile(threatPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, threatPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, threatPoint);
const goalDistance = distance(threatPoint, getOpponentGoalCenter(attackingTeamId));
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const shotTarget = actionType === "shot"
? targetPoint
: getAutoPilotShotTarget(attackingTeamId, carrier ?? receiver);
const shotWindow = carrier
? getShotWindowProfile(carrier, startPoint, shotTarget)
: null;
const pressure = carrier
? getPlayerPressureLoad(carrier, startPoint)
: getOpponentPressureAtPoint(defensiveTeamId, threatPoint, 8);
const sideSign =
getWideSideSign(threatPoint) ||
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const isShotCue =
actionType === "shot" ||
principleText.includes("shoot") ||
principleText.includes("finish") ||
principleText.includes("sweet spot") ||
(targetThreat.box >= 0.2 && goalDistance <= 31);
const isCutbackCue =
principleText.includes("cutback") ||
targetThreat.cutbackZone >= 0.24 ||
(actionType === "pass" && targetThreat.assistZone >= 0.34);
const isFinalPassCue =
actionType === "pass" &&
(
isCutbackCue ||
targetThreat.box >= 0.18 ||
targetThreat.centralPocket >= 0.32 ||
actionSpace.lineBreakCount >= 1
);
const isCarryChance =
actionType === "dribble" &&
(
targetThreat.box >= 0.14 ||
targetThreat.centralPocket >= 0.28 ||
principleText.includes("runway") ||
principleText.includes("open-grass")
);
const dangerScore = clamp(
targetThreat.box * 0.46 +
targetThreat.centralPocket * 0.34 +
targetThreat.cutbackZone * 0.32 +
targetThreat.assistZone * 0.2 +
targetThreat.behindLine * 0.18 +
clamp((36 - goalDistance) / 24, 0, 1) * 0.28 +
clamp((35 - ballFromOwnGoal) / 22, 0, 1) * 0.24 +
(isShotCue ? 0.28 : 0) +
(isFinalPassCue ? 0.18 : 0) +
(isCarryChance ? 0.16 : 0) +
(shotWindow?.quality ?? 0) * 0.22 -
pressure * 0.12,
0,
1.45
);
const active =
dangerScore >= 0.62 ||
isShotCue ||
isCutbackCue ||
(isFinalPassCue && ballFromOwnGoal <= 39);
if (!active) {
return null;
}
return {
actionMeta,
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
threatPoint: cloneVector(threatPoint),
shotTarget: cloneVector(shotTarget),
targetThreat,
actionSpace,
ballFromOwnGoal,
goalDistance,
forwardGain,
pressure,
shotWindow,
sideSign,
isShotCue,
isCutbackCue,
isFinalPassCue,
isCarryChance,
dangerScore,
phaseKey: profile.phaseKey,
};
}
function getDefensiveChanceDenialTarget(teamId, context, slot) {
const defendingSign = getDefendingDirectionSign(teamId);
const attackSign = getAttackDirectionSign(context.attackingTeamId);
const penaltySpot = getOpponentPenaltySpot(context.attackingTeamId);
const sideSign = context.sideSign || 1;
const goalSideOf = (point, meters) => ({
x: point.x - defendingSign * meters,
y: point.y,
});
const shotLinePoint = (ratio) => ({
x: lerp(context.threatPoint.x, context.shotTarget.x, ratio),
y: lerp(context.threatPoint.y, context.shotTarget.y, ratio),
});
const points = {
closeShot: {
...goalSideOf(context.threatPoint, context.isShotCue ? 1.25 : 1.75),
y: lerp(context.threatPoint.y, pitch.width / 2, context.isCutbackCue ? 0.22 : 0.1),
},
shotBlock: {
...goalSideOf(shotLinePoint(context.goalDistance <= 23 ? 0.34 : 0.26), 0.85),
y: lerp(shotLinePoint(0.32).y, pitch.width / 2, 0.08),
},
penaltySpotGuard: {
x: penaltySpot.x - attackSign * 0.7,
y: pitch.width / 2,
},
cutbackScreen: {
x: penaltySpot.x - attackSign * 7.4,
y: clamp(pitch.width / 2 + sideSign * 5.7, 10, pitch.width - 10),
},
farPostCover: {
x: penaltySpot.x + attackSign * 3.5,
y: clamp(pitch.width / 2 - sideSign * 9.6, 7, pitch.width - 7),
},
reboundEdge: {
x: penaltySpot.x - attackSign * 10.4,
y: clamp(pitch.width / 2 - sideSign * 3.8, 12, pitch.width - 12),
},
};
return clampToPitch(points[slot] ?? points.shotBlock, 2.1);
}
function applyDefensiveChanceDenialTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveChanceDenialContext(teamId, ballPoint, profile, reference);
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
const target = getDefensiveChanceDenialTarget(teamId, context, slot);
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
const closeTarget = getDefensiveChanceDenialTarget(teamId, context, "closeShot");
const presserCanClose =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, closeTarget) <= (context.isShotCue ? 18 : 16);
if (presserCanClose) {
targets.set(presser.id, closeTarget);
assignedIds.add(presser.id);
labels.push(context.isShotCue ? "Chance denial: close shooter" : "Chance denial: close carrier");
} else {
const closePlayer = assign(
"closeShot",
context.ballFromOwnGoal <= 24 ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.isCutbackCue ? ["6", "8", "LB", "RB", "WB", "CB"] : ["CB", "6", "8", "LB", "RB", "WB"],
context.isShotCue ? "Chance denial: close shooter" : "Chance denial: close carrier"
);
presser = closePlayer ?? presser;
}
if (context.isShotCue || context.isCarryChance) {
assign("shotBlock", ["back", "midfield"], ["CB", "6", "8", "LB", "RB", "WB"], "Chance denial: block shot lane");
}
assign("penaltySpotGuard", ["back", "midfield"], ["CB", "6", "8", "LB", "RB", "WB"], "Chance denial: protect penalty spot");
if (context.isCutbackCue || context.isFinalPassCue || context.targetThreat.cutbackZone >= 0.18) {
assign("cutbackScreen", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Chance denial: lock cutback");
}
if (context.ballFromOwnGoal <= 27 || context.targetThreat.box >= 0.16) {
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Chance denial: cover far post");
}
if (context.isShotCue || context.dangerScore >= 0.78) {
assign("reboundEdge", ["midfield", "forward"], ["6", "8", "10", "W"], "Chance denial: secure rebound edge");
}
if (labels.length) {
labels.unshift("Defend the chance first");
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.threatPoint,
protectedIds: assignedIds,
};
}
function getDefensiveBoxDeliveryChainContext(defensiveTeamId, ballPoint, profile, reference = getDribblePressureReference()) {
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
if (actionType !== "pass" && actionType !== "dribble") {
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
const deliveryPoint = actionType === "pass" ? startPoint : targetPoint;
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const deliveryThreat = getPitchThreatProfile(deliveryPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const deliveryDepth = getAttackingDepth(deliveryPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const deliveryFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, deliveryPoint);
const actionDistance = distance(startPoint, targetPoint);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const lateralMeters = Math.abs(targetPoint.y - startPoint.y);
const sideSign =
getWideSideSign(deliveryPoint) ||
getWideSideSign(targetPoint) ||
1;
const principleText = [
actionMeta.profileKey,
actionMeta.profileLabel,
actionMeta.targetKind,
actionMeta.label,
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const deliveryIsWide =
isWidePrincipleZone(deliveryPoint) ||
deliveryThreat.assistZone >= 0.24 ||
Math.abs(deliveryPoint.y - pitch.width / 2) >= 17;
const targetIsBox =
targetThreat.box >= 0.12 ||
targetThreat.cutbackZone >= 0.14 ||
targetThreat.centralPocket >= 0.3 ||
(targetDepth >= 78 && Math.abs(targetPoint.y - pitch.width / 2) <= 24);
const cutbackCue =
principleText.includes("cutback") ||
targetThreat.cutbackZone >= 0.18 ||
(
actionType === "pass" &&
deliveryIsWide &&
forwardGain <= 1.5 &&
targetDepth >= 72 &&
Math.abs(targetPoint.y - pitch.width / 2) <= 24
);
const crossCue =
principleText.includes("cross") ||
principleText.includes("delivery") ||
principleText.includes("box") ||
(
actionType === "pass" &&
deliveryIsWide &&
targetIsBox &&
lateralMeters >= 8
);
const wideCarryCue =
actionType === "dribble" &&
deliveryIsWide &&
deliveryFromOwnGoal <= 36 &&
(deliveryThreat.assistZone >= 0.24 || deliveryDepth >= 72);
const active =
(actionType === "pass" && deliveryIsWide && targetIsBox && deliveryFromOwnGoal <= 48) ||
cutbackCue ||
crossCue ||
wideCarryCue;
if (!active) {
return null;
}
const deliveryKind = cutbackCue
? "cutback"
: crossCue
? "cross"
: "wideThreat";
const dangerScore = clamp(
targetThreat.box * 0.38 +
targetThreat.cutbackZone * 0.34 +
targetThreat.centralPocket * 0.24 +
targetThreat.assistZone * 0.18 +
deliveryThreat.assistZone * 0.18 +
clamp((42 - ballFromOwnGoal) / 25, 0, 1) * 0.22 +
clamp(actionDistance / 24, 0, 1) * 0.1 +
(cutbackCue ? 0.22 : 0) +
(crossCue ? 0.16 : 0) +
(wideCarryCue ? 0.18 : 0),
0,
1.35
);
return {
actionMeta,
actionType,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
deliveryPoint: cloneVector(deliveryPoint),
targetThreat,
deliveryThreat,
actionSpace,
targetDepth,
deliveryDepth,
ballFromOwnGoal,
deliveryFromOwnGoal,
actionDistance,
forwardGain,
sideSign,
deliveryKind,
dangerScore,
wideCarryCue,
phaseKey: profile.phaseKey,
};
}
function getDefensiveBoxDeliveryChainTarget(teamId, context, slot) {
const defendingSign = getDefendingDirectionSign(teamId);
const attackSign = getAttackDirectionSign(context.attackingTeamId);
const penaltySpot = getOpponentPenaltySpot(context.attackingTeamId);
const delivery = context.deliveryPoint;
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const lanePoint = (ratio) => ({
x: lerp(delivery.x, target.x, ratio),
y: lerp(delivery.y, target.y, ratio),
});
const goalSideOf = (point, meters) => ({
x: point.x - defendingSign * meters,
y: point.y,
});
const cutbackPull = context.deliveryKind === "cutback" ? 1.4 : 0;
const points = {
deliveryPressure: {
x: delivery.x - defendingSign * 1.4,
y: clamp(delivery.y - sideSign * 1.7, 3.2, pitch.width - 3.2),
},
lowLaneBlock: {
...goalSideOf(lanePoint(context.deliveryKind === "cutback" ? 0.52 : 0.42), 0.9),
y: lerp(lanePoint(0.5).y, pitch.width / 2, context.deliveryKind === "cross" ? 0.22 : 0.1),
},
nearPostCover: {
x: penaltySpot.x + attackSign * 3.9,
y: clamp(pitch.width / 2 + sideSign * 4.4, 6.5, pitch.width - 6.5),
},
sixYardCover: {
x: penaltySpot.x + attackSign * 5.2,
y: clamp(pitch.width / 2 + sideSign * 1.6, 9, pitch.width - 9),
},
penaltySpotGuard: {
x: penaltySpot.x - attackSign * 0.7,
y: pitch.width / 2,
},
cutbackGate: {
x: penaltySpot.x - attackSign * (7.4 + cutbackPull),
y: clamp(pitch.width / 2 + sideSign * 5.4, 9.5, pitch.width - 9.5),
},
farPostCover: {
x: penaltySpot.x + attackSign * 2.9,
y: clamp(pitch.width / 2 - sideSign * 9.4, 6.5, pitch.width - 6.5),
},
edgeLock: {
x: penaltySpot.x - attackSign * 11.2,
y: clamp(pitch.width / 2 - sideSign * 3.8, 11, pitch.width - 11),
},
weakSideTuck: {
x: penaltySpot.x - attackSign * 2.8,
y: clamp(pitch.width / 2 - sideSign * 13.2, 6.5, pitch.width - 6.5),
},
};
return clampToPitch(points[slot] ?? points.penaltySpotGuard, 1.8);
}
function applyDefensiveBoxDeliveryChainTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveBoxDeliveryChainContext(teamId, ballPoint, profile, reference);
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
const target = getDefensiveBoxDeliveryChainTarget(teamId, context, slot);
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
if (context.wideCarryCue) {
const pressTarget = getDefensiveBoxDeliveryChainTarget(teamId, context, "deliveryPressure");
if (presser && !assignedIds.has(presser.id) && !isGoalkeeper(presser)) {
targets.set(presser.id, pressTarget);
assignedIds.add(presser.id);
labels.push("Box delivery chain: press wide carrier");
} else {
const widePresser = assign(
"deliveryPressure",
["back", "midfield", "forward"],
["WB", "LB", "RB", "W", "8"],
"Box delivery chain: press wide carrier"
);
presser = widePresser ?? presser;
}
} else {
assign("lowLaneBlock", ["back", "midfield"], ["LB", "RB", "WB", "CB", "6"], "Box delivery chain: block delivery lane");
}
if (context.deliveryKind === "cross") {
assign("nearPostCover", ["back"], ["CB", "LB", "RB", "WB"], "Box delivery chain: near-post cover");
assign("sixYardCover", ["back"], ["CB"], "Box delivery chain: six-yard protection");
assign("penaltySpotGuard", ["back", "midfield"], ["CB", "6", "8"], "Box delivery chain: penalty-spot guard");
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Box delivery chain: far-post cover");
} else {
assign("cutbackGate", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Box delivery chain: lock cutback gate");
assign("penaltySpotGuard", ["back", "midfield"], ["CB", "6", "8"], "Box delivery chain: penalty-spot guard");
assign("nearPostCover", ["back"], ["CB", "LB", "RB", "WB"], "Box delivery chain: near-post cover");
if (context.ballFromOwnGoal <= 28 || context.targetThreat.box >= 0.18) {
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Box delivery chain: far-post cover");
}
}
if (context.dangerScore >= 0.72 || context.deliveryKind === "cutback") {
assign("edgeLock", ["midfield", "forward"], ["6", "8", "10", "W"], "Box delivery chain: second-wave edge");
}
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Box delivery chain: weak side tucks in");
if (labels.length) {
labels.unshift(
context.deliveryKind === "cutback"
? "Defend cutback chain"
: context.deliveryKind === "cross"
? "Defend box delivery chain"
: "Prepare box delivery chain"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
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
function getDefensiveEmergencyCoverContext(
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
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
autoPrinciples: [],
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (actionType !== "dribble" && actionType !== "pass") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
reference?.startPoint ??
state.ball.position;
const targetPoint =
actionMeta.target ??
reference?.targetPoint ??
ballPoint ??
state.ball.target;
if (!startPoint || !targetPoint) {
return null;
}
const actionDistance = distance(startPoint, targetPoint);
if (actionDistance < 5.5) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
const actionSpace = getActionSpaceValue(
startPoint,
targetPoint,
attackingTeamId,
getOffensiveAutopilotProfile(attackingTeamId, targetPoint)
);
const targetThreat = actionSpace.targetThreat;
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isRunway =
principleText.includes("runway") ||
principleText.includes("open-grass") ||
(
actionType === "dribble" &&
actionDistance >= 12 &&
forwardGain >= 6 &&
actionSpace.openTarget >= 0.52
);
const isLineBreak =
actionSpace.lineBreakCount >= 1 ||
targetThreat.behindLine >= 0.22 ||
(actionType === "pass" && forwardGain >= 10);
const isFinalThirdThreat =
ballFromOwnGoal <= 42 ||
targetDepth >= 63 ||
targetThreat.box >= 0.16 ||
targetThreat.cutbackZone >= 0.22;
const isCentralThreat =
targetThreat.centralPocket >= 0.24 ||
targetThreat.betweenLines >= 0.32 ||
Math.abs(targetPoint.y - pitch.width / 2) <= 13.5;
const isWideThreat =
isWidePrincipleZone(targetPoint) ||
isWidePrincipleZone(startPoint) ||
targetThreat.assistZone >= 0.3 ||
targetThreat.cutbackZone >= 0.2;
const runnerThreat = getDefensiveRunnerThreats(defensiveTeamId, targetPoint, profile)[0] ?? null;
const dangerScore = clamp(
targetThreat.box * 0.54 +
targetThreat.behindLine * 0.46 +
targetThreat.centralPocket * 0.36 +
targetThreat.cutbackZone * 0.34 +
targetThreat.betweenLines * 0.24 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.32 +
clamp(forwardGain / 24, 0, 1) * 0.24 +
clamp((48 - ballFromOwnGoal) / 26, 0, 1) * 0.26 +
(isRunway ? 0.28 : 0) +
(runnerThreat ? 0.12 : 0) -
actionSpace.targetPressure * 0.12,
0,
1.45
);
const active =
dangerScore >= 0.64 ||
(isRunway && isFinalThirdThreat) ||
(isLineBreak && ballFromOwnGoal <= 50) ||
(runnerThreat?.isDepthThreat && ballFromOwnGoal <= 52);
if (!active) {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
return {
actionMeta,
actionType,
attackingTeamId,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
ballPoint: cloneVector(ballPoint ?? targetPoint),
actionDistance,
forwardGain,
targetDepth,
ballFromOwnGoal,
actionSpace,
targetThreat,
isRunway,
isLineBreak,
isFinalThirdThreat,
isCentralThreat,
isWideThreat,
runnerThreat,
dangerScore,
sideSign,
mode: isRunway
? "runwayEmergency"
: isLineBreak
? "lineBreakEmergency"
: "boxProtection",
};
}
function getDefensiveEmergencyCoverTarget(teamId, context, slot) {
if (slot === "runnerGoalSide" && context.runnerThreat) {
return getDefensiveRunnerTrackingTarget(teamId, context.runnerThreat, "goalSideMark");
}
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const lanePoint = (ratio) => ({
x: lerp(context.startPoint.x, target.x, ratio),
y: lerp(context.startPoint.y, target.y, ratio),
});
const goalSideOf = (point, meters) => ({
x: point.x - sign * meters,
y: point.y,
});
const pressurePoint = lanePoint(context.actionType === "dribble" ? 0.6 : 0.72);
const lastLineDepth = clamp(
context.ballFromOwnGoal - (context.isFinalThirdThreat ? 4.8 : 7.2),
7.5,
context.isFinalThirdThreat ? 27 : 36
);
const screenDepth = clamp(
context.ballFromOwnGoal + (context.isFinalThirdThreat ? 5.6 : 3.2),
15,
44
);
const cutbackDepth = clamp(
context.ballFromOwnGoal + 2.5,
12,
32
);
const points = {
firstDelay: {
...goalSideOf(pressurePoint, context.isRunway ? 1.65 : 1.3),
y: lerp(pressurePoint.y, pitch.width / 2, context.isWideThreat ? 0.22 : 0.36),
},
lastLineCover: {
x: getDepthX(teamId, lastLineDepth),
y: lerp(target.y, pitch.width / 2, context.isWideThreat ? 0.44 : 0.3),
},
centralScreen: {
x: getDepthX(teamId, screenDepth),
y: lerp(target.y, pitch.width / 2, context.isWideThreat ? 0.76 : 0.86),
},
cutbackCover: {
x: getDepthX(teamId, cutbackDepth),
y: clamp(pitch.width / 2 + sideSign * 5.4, 11, pitch.width - 11),
},
farPostCover: {
x: getDepthX(teamId, clamp(lastLineDepth + 1.6, 7.5, 24)),
y: clamp(pitch.width / 2 - sideSign * 9.4, 7.5, pitch.width - 7.5),
},
weakSideCollapse: {
x: lerp(target.x, ownGoal.x, context.isFinalThirdThreat ? 0.44 : 0.34),
y: clamp(pitch.width / 2 - sideSign * (context.isFinalThirdThreat ? 7.4 : 10.6), 7, pitch.width - 7),
},
recoveryArc: {
x: getDepthX(teamId, clamp(context.ballFromOwnGoal + 9, 20, 48)),
y: lerp(target.y, pitch.width / 2, 0.58),
},
};
return clampToPitch(points[slot] ?? points.lastLineCover, 2.2);
}
function applyDefensiveEmergencyCoverTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set(),
reference = getDribblePressureReference()
) {
const context = getDefensiveEmergencyCoverContext(teamId, ballPoint, profile, reference);
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
const target = getDefensiveEmergencyCoverTarget(teamId, context, slot);
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
const firstDelayTarget = getDefensiveEmergencyCoverTarget(teamId, context, "firstDelay");
const presserCanDelay =
presser &&
!assignedIds.has(presser.id) &&
!isGoalkeeper(presser) &&
distance(presser.position, firstDelayTarget) <= (context.isRunway ? 23 : 18);
if (presserCanDelay) {
targets.set(presser.id, firstDelayTarget);
assignedIds.add(presser.id);
labels.push(context.isRunway ? "Emergency: slow the runway" : "Emergency: delay the line break");
} else if (!presser || !assignedIds.has(presser.id)) {
const delayPlayer = assign(
"firstDelay",
context.isFinalThirdThreat ? ["back", "midfield", "forward"] : ["midfield", "back", "forward"],
context.isWideThreat ? ["WB", "LB", "RB", "W", "8", "6"] : ["6", "8", "CB", "10", "9"],
context.isRunway ? "Emergency: slow the runway" : "Emergency: delay the line break"
);
presser = delayPlayer ?? presser;
}
assign("lastLineCover", ["back"], ["CB", "LB", "RB", "WB"], "Emergency: protect last line");
if (context.isCentralThreat || context.isLineBreak || context.isRunway) {
assign("centralScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Emergency: screen central finish");
}
if (context.runnerThreat) {
assign(
"runnerGoalSide",
context.runnerThreat.isDepthThreat || context.runnerThreat.isBoxThreat ? ["back", "midfield"] : ["midfield", "back"],
context.runnerThreat.isDepthThreat ? ["CB", "LB", "RB", "WB", "6"] : ["6", "8", "CB", "10"],
"Emergency: stay goal-side of runner"
);
}
if (context.isWideThreat || context.targetThreat.cutbackZone >= 0.2) {
assign("cutbackCover", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Emergency: lock cutback");
}
if (context.isFinalThirdThreat) {
assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Emergency: cover far post");
} else {
assign("recoveryArc", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Emergency: recover behind ball");
}
assign("weakSideCollapse", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Emergency: weak side collapses");
if (labels.length) {
labels.unshift(
context.mode === "runwayEmergency"
? "Emergency cover against runway"
: context.mode === "lineBreakEmergency"
? "Emergency cover against line break"
: "Emergency box cover"
);
}
return {
presser,
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}
function getDefensiveSecondBallAnticipationTarget(teamId, context, slot) {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const points = {
firstContact: {
x: target.x - sign * (context.finalThirdLanding ? 1.2 : 1.8),
y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.18 : 0.26),
},
dropZoneScreen: {
x: target.x - sign * (context.aerial ? 6.6 : 4.8),
y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.58 : 0.64),
},
clearanceLane: {
x: lerp(target.x, ownGoal.x, context.finalThirdLanding ? 0.38 : 0.26),
y: clamp(pitch.width / 2 + sideSign * (context.finalThirdLanding ? 7.6 : 10.2), 8, pitch.width - 8),
},
depthCover: {
x: lerp(target.x, ownGoal.x, context.lineBreakLanding ? 0.46 : 0.34),
y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.32 : 0.22),
},
weakSideTuck: {
x: lerp(target.x, ownGoal.x, 0.34),
y: clamp(pitch.width / 2 - sideSign * (context.finalThirdLanding ? 8.4 : 11.6), 7, pitch.width - 7),
},
counterPressOutletBlock: {
x: target.x + sign * 5.6,
y: lerp(target.y, pitch.width / 2, 0.42),
},
};
return clampToPitch(points[slot] ?? points.dropZoneScreen, 2.2);
}
function applyDefensiveSecondBallAnticipationTargets(
teamId,
targets,
groups,
basePresser,
ballPoint,
profile,
protectedIds = new Set()
) {
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return {
labels: [],
focusPoint: null,
protectedIds: new Set(protectedIds),
};
}
const attackProfile = getOffensiveAutopilotProfile(attackingTeamId, ballPoint);
const context = getSecondBallAnticipationContext(
attackingTeamId,
ballPoint,
state.draftStep ?? {
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
},
attackProfile
);
if (!context) {
return {
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
const target = getDefensiveSecondBallAnticipationTarget(teamId, context, slot);
const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
if (!player) {
return null;
}
targets.set(player.id, target);
assignedIds.add(player.id);
labels.push(label);
return player;
};
assign("firstContact", ["back", "midfield", "forward"], ["CB", "6", "8", "WB", "LB", "RB", "9"], "Second ball: contest first contact");
assign("dropZoneScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Second ball: screen drop zone");
if (context.lineBreakLanding || context.finalThirdLanding) {
assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Second ball: cover depth behind");
}
assign("clearanceLane", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Second ball: clearance lane");
assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Second ball: weak-side protection");
if (profile.pressingIntensity >= 0.54 || profile.styleKey === "counter-press" || profile.styleKey === "gegenpress") {
assign("counterPressOutletBlock", ["forward", "midfield"], ["9", "10", "W", "8"], "Second ball: block outlet");
}
if (labels.length) {
labels.unshift("Anticipate second ball");
}
return {
labels: uniquePrincipleLabels(labels),
focusPoint: context.targetPoint,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveBackLineHandoverContext,
    applyDefensiveBackLineHandoverTargets,
    getDefensiveLineActionLabels,
    getDefensiveGoalkeeperTarget,
    getDefensiveGoalkeeperSweeperContext,
    applyDefensiveGoalkeeperSweeperTarget,
    getDefensiveGoalkeeperShotSetContext,
    getDefensiveGoalkeeperShotSetTarget,
    applyDefensiveGoalkeeperShotSetTarget,
    chooseDefensiveAutopilotPresser,
    getDefensivePressTarget,
    getDefensiveAngledPressTarget,
    applyDefensivePresserAngleTarget,
    getGoalkeeperBuildOutPressContext,
    pickDefensiveAutopilotPlayer,
    getGoalkeeperBuildOutPressTarget,
    applyGoalkeeperBuildOutPressTargets,
    getDefensiveThreatResponse,
    getDefensivePrioritySpacePoint,
    pickDefensiveProtectionPlayer,
    applyDefensivePrioritySpaceProtectionTargets,
    getDefensiveCornerContext,
    getDefensiveCornerTarget,
    applyDefensiveCornerSetPieceTargets,
    getRestartActionMeta,
    getDefensiveFreeKickContext,
    getFreeKickWallTarget,
    getDefensiveFreeKickTarget,
    applyDefensiveFreeKickSetPieceTargets,
    getDefensivePenaltyContext,
    getDefensivePenaltyTarget,
    applyDefensivePenaltySetPieceTargets,
    getDefensiveThrowInContext,
    getDefensiveThrowInTarget,
    applyDefensiveThrowInSetPieceTargets,
    getNegativeTransitionContext,
    getNegativeTransitionTarget,
    getNegativeTransitionOutletOptions,
    applyNegativeTransitionDefensiveTargets,
    getDefensiveLooseBallRecoveryTrapContext,
    getDefensiveLooseBallRecoveryTrapTarget,
    applyDefensiveLooseBallRecoveryTrapTargets,
    getDefensiveOpenPlayTriggerContext,
    getDefensiveOpenPlayTriggerTarget,
    applyDefensiveOpenPlayTriggerTargets,
    getDefensiveReceptionTrapContext,
    getDefensiveReceptionTrapTarget,
    applyDefensiveReceptionTrapTargets,
    getDefensiveReceiveContinuationNextPoint,
    getDefensiveReceiveContinuationContext,
    getDefensiveReceiveContinuationTarget,
    applyDefensiveReceiveContinuationTargets,
    getDefensiveRouteAnticipationContext,
    getDefensiveRouteAnticipationTarget,
    applyDefensiveRouteAnticipationTargets,
    getDefensiveSwitchRecoveryContext,
    getDefensiveSwitchRecoveryTarget,
    applyDefensiveSwitchRecoveryTargets,
    getDefensiveSwitchLandingLockContext,
    getDefensiveSwitchLandingLockTarget,
    applyDefensiveSwitchLandingLockTargets,
    getDefensiveGameSpaceResponseContext,
    getDefensiveGameSpaceResponseTarget,
    applyDefensiveGameSpaceResponseTargets,
    getDefensiveRunnerThreats,
    getDefensiveRunnerTrackingTarget,
    applyDefensiveRunnerTrackingTargets,
    getDribblePressureReference,
    chooseDefensiveDribblePresser,
    getDefensiveDribblePressTarget,
    getDefensiveCarryContainmentContext,
    getDefensiveCarryContainmentTarget,
    applyDefensiveCarryContainmentTargets,
    getDefensivePressureCoverContext,
    getDefensivePressureCoverTarget,
    applyDefensivePressureCoverBalanceTargets,
    getDefensivePressChainSupportContext,
    getDefensivePressChainSupportTarget,
    applyDefensivePressChainSupportTargets,
    getActualLocalSuperiorityProfile,
    getDefensiveLocalOverloadContext,
    getDefensiveLocalOverloadTarget,
    applyDefensiveLocalOverloadResponseTargets,
    getDefensivePostRecoveryResponseContext,
    getDefensivePostRecoveryResponseTarget,
    getDefensivePostRecoveryOutletOptions,
    applyDefensivePostRecoveryResponseTargets,
    getDefensivePassLaneDenialContext,
    getDefensivePassLaneDenialTarget,
    applyDefensivePassLaneDenialTargets,
    getDefensiveCentralAccessGateContext,
    getDefensiveCentralAccessGateTarget,
    applyDefensiveCentralAccessGateTargets,
    getDefensiveChanceDenialContext,
    getDefensiveChanceDenialTarget,
    applyDefensiveChanceDenialTargets,
    getDefensiveBoxDeliveryChainContext,
    getDefensiveBoxDeliveryChainTarget,
    applyDefensiveBoxDeliveryChainTargets,
    getDefensiveLineBreakAdvantageContext,
    getDefensiveLineBreakAdvantageTarget,
    applyDefensiveLineBreakAdvantageCollapseTargets,
    getDefensiveEmergencyCoverContext,
    getDefensiveEmergencyCoverTarget,
    applyDefensiveEmergencyCoverTargets,
    getDefensiveSecondBallAnticipationTarget,
    applyDefensiveSecondBallAnticipationTargets,
  };
}
