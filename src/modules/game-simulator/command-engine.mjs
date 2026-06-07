export function createGameSimulatorCommandEngine(deps = {}) {
  const {
    angleBetween,
    applyAutopilotsForCurrentAction,
    applyBallExecutionProfile,
    applyBestReceiveBodyAngle,
    applyCommittedSnapshot,
    applyCornerSetup,
    applyFreeKickSetup,
    applyGoalKickSetup,
    applyKickoffSetup,
    applyPenaltySetup,
    applyResolvedBallProfile,
    applySnapshot,
    applyThrowInSetup,
    ballRadiusMeters,
    buildMovementPath,
    canEditScenario,
    captureSnapshot,
    chooseAutoPilotNextAction,
    clamp,
    clampToPitch,
    clearAutoPilotReceiveMomentum,
    clearKeyboardActionGrace,
    clearSecurePossession,
    cloneAutoV2DecisionTriggers,
    cloneDefensiveAutopilotIntents,
    cloneGoalEvent,
    cloneOffensiveAutopilotIntents,
    cloneRestartPhase,
    cloneShotPlacement,
    cloneSnapshot,
    cloneVector,
    completeLiveActionPlayersBeforeCommit,
    computeTimeToCoverDistance,
    configureBallTravelProfile,
    connectBallToPlayerForNextAction,
    createCommittedSnapshotFromCurrentState,
    createLooseBallSpill,
    defaultKickoffTeamId,
    distance,
    executePlannedAction,
    finishSequencePlayback,
    formatSpeed,
    getActionInitiator,
    getActionOrigin,
    getActionSpeed,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotFlowContext,
    getAutoPilotReceiveMomentum,
    getBallOwner,
    getBallTravelPoint,
    getDefensiveAutoV2Intent,
    getDefensiveAutopilotFocusPoint,
    getDribbleCarryPathPoint,
    getGoalDirectionSign,
    getGoalLineX,
    getGoalNetDisplayPoint,
    getLiveDefensiveDribblePressTarget,
    getLiveDribbleSpeed,
    getMovementPathPoint,
    getOffensiveAutoV2Intent,
    getOffensiveAutopilotFocusPoint,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOffsideInfo,
    getOpponentGoalSide,
    getOpponentPenaltySpot,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getPlayerById,
    getPlayerBallControlPoint,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getPlayerPositionForControlPoint,
    getPlayerPressureLoad,
    getPlayerRoleModel,
    getRecordedStepEndSnapshot,
    getRequestedActionMode,
    getSelectedPlayer,
    getTeamAttackAngle,
    getTeamSupportCountAroundPoint,
    hasBallAction,
    isBetweenGoalPosts,
    isDefensiveAutopilotPlayer,
    isDefensiveDribblePresser,
    isGoalkeeper,
    isInsideOpponentBox,
    isInsideOwnBox,
    isOffensiveAutopilotPlayer,
    keepSecurePossessionOnlyForOwner,
    lerp,
    logEvent,
    markSequenceDirty,
    moveDefensiveAutoV2Player,
    moveOffensiveAutoV2Player,
    moveTowards,
    normalize,
    pauseLiveSimulation,
    pitch,
    queueNextSequenceStep,
    randomBetween,
    render,
    resetPlayerMovementProgress,
    resolveBallActionProfile,
    resolveDribbleDefensiveChallenge,
    resolveLooseBallClaim,
    resolvePassTransitInterception,
    resolveShotBlockCommitment,
    resolveShotTarget,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    rotatePlayerBodyTowardAngle,
    setDribbleCarryPathForBall,
    setPiecePhaseProfiles,
    setSecurePossessionAfterControlledTouch,
    setSelectedPlayers,
    settleBallForNextAction,
    shouldTriggerLandingBounce,
    startLandingBounceSkid,
    startRecordedAction,
    teams,
    ui,
    updateBallFlightHeight,
    updateSequenceButtons,
    win,
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

function getAutoPilotRoleStrength(player, strength) {
if (!player) {
return 0;
}
const context = getPlayerDecisionContext(player);
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const roleModel = getPlayerRoleModel(player, teams[player.team]?.formation);
const paceScore = clamp((context.maxSpeed - 6.5) / 2.8, 0, 1);
const roleBonuses = {
creator: {
gk: -0.08,
rest: 0.02,
wideBack: 0.08,
pivot: 0.14,
connector: 0.18,
wideForward: 0.1,
striker: 0.02,
secondStriker: 0.12,
},
receiver: {
gk: -0.18,
rest: -0.02,
wideBack: 0.06,
pivot: 0.08,
connector: 0.16,
wideForward: 0.14,
striker: 0.18,
secondStriker: 0.18,
},
runner: {
gk: -0.28,
rest: -0.12,
wideBack: 0.16,
pivot: -0.04,
connector: 0.08,
wideForward: 0.22,
striker: 0.2,
secondStriker: 0.14,
},
dribbler: {
gk: -0.24,
rest: -0.1,
wideBack: 0.1,
pivot: 0.02,
connector: 0.12,
wideForward: 0.24,
striker: 0.08,
secondStriker: 0.13,
},
finisher: {
gk: -0.42,
rest: -0.18,
wideBack: -0.08,
pivot: -0.06,
connector: 0.08,
wideForward: 0.16,
striker: 0.28,
secondStriker: 0.22,
},
crosser: {
gk: -0.3,
rest: -0.12,
wideBack: 0.24,
pivot: -0.02,
connector: 0.04,
wideForward: 0.18,
striker: -0.1,
secondStriker: -0.04,
},
switcher: {
gk: 0.02,
rest: 0.08,
wideBack: 0.1,
pivot: 0.2,
connector: 0.16,
wideForward: 0.02,
striker: -0.08,
secondStriker: 0.02,
},
};
const roleBonus = roleBonuses[strength]?.[roleKey] ?? 0;
const roleModelBoost = roleModel.strengths?.[strength] ?? 0;
const profile = context.profile;
const base =
strength === "runner"
? paceScore * 0.42 + profile.perception * 0.2 + profile.decisionSpeed * 0.18 + profile.tacticalDiscipline * 0.2
: strength === "dribbler"
? profile.technicalSecurity * 0.3 + profile.pressResistance * 0.26 + profile.composure * 0.18 + paceScore * 0.26
: strength === "finisher"
? profile.technicalSecurity * 0.28 + profile.composure * 0.22 + profile.decisionQuality * 0.26 + paceScore * 0.12 + profile.perception * 0.12
: strength === "crosser" || strength === "switcher"
? profile.technicalSecurity * 0.34 + profile.decisionQuality * 0.26 + profile.perception * 0.22 + profile.composure * 0.18
: strength === "receiver"
? profile.perception * 0.24 + profile.technicalSecurity * 0.26 + profile.decisionSpeed * 0.18 + profile.composure * 0.16 + paceScore * 0.16
: profile.perception * 0.28 + profile.decisionQuality * 0.3 + profile.technicalSecurity * 0.2 + profile.composure * 0.12 + profile.decisionSpeed * 0.1;
const tendencyBoost =
strength === "runner"
? Math.max(getPlayerTendency(player, "boxRun"), getPlayerTendency(player, "overlap")) - 0.5
: strength === "dribbler"
? getPlayerTendency(player, "dribble") - 0.5
: strength === "crosser"
? getPlayerTendency(player, "earlyCross") - 0.5
: strength === "switcher"
? getPlayerTendency(player, "switchPlay") - 0.5
: strength === "receiver"
? getPlayerTendency(player, "passAndMove") - 0.5
: strength === "creator"
? Math.max(getPlayerTendency(player, "lineBreakPass"), getPlayerTendency(player, "retain")) - 0.5
: 0;
return clamp(base + roleBonus + roleModelBoost + tendencyBoost * 0.18, 0, 1.18);
}
function getAutoPilotPossessionPlayer() {
const owner = getBallOwner();
if (owner) {
return owner;
}
const claim = resolveLooseBallClaim(
state.ball.position,
state.ball.claimRadius + 1.1,
null,
0,
{}
);
if (claim.player && claim.gap <= state.ball.claimRadius + 1.4) {
connectBallToPlayerForNextAction(claim.player, state.ball.position, 0.48);
return claim.player;
}
return null;
}
function getLooseBallRecoveryTarget(player, ballPoint = state.ball.position) {
const facingAngle = getTeamAttackAngle(player.team);
return {
facingAngle,
position: getPlayerPositionForControlPoint(player, ballPoint, facingAngle),
};
}
function getSecondBallReactionAdjustment(player, ballPoint, recovery, context = state.ball.secondBallContext) {
if (!context) {
return {
score: 0,
label: null,
};
}
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const label = getPlayerMagnetLabel(player);
const playerContext = getPlayerDecisionContext(player);
const isPreferredPlayer = player.id === context.preferredPlayerId;
const isPreferredTeam = player.team === context.preferredTeamId;
const isAttackingTeam = player.team === context.attackingTeamId;
const isDefendingTeam = player.team === context.defendingTeamId;
const attackingBox = context.attackingTeamId ? isInsideOpponentBox(ballPoint, context.attackingTeamId) : false;
const defensiveBox = context.defendingTeamId ? isInsideOwnBox(ballPoint, context.defendingTeamId) : false;
const proximityUrgency = clamp(1 - recovery.runDistance / 12, 0, 1);
const anticipation =
playerContext.profile.perception * 0.28 +
playerContext.profile.decisionSpeed * 0.22 +
playerContext.profile.tacticalDiscipline * 0.16 +
playerContext.profile.composure * 0.12;
let score = 0;
score -= anticipation * 0.2 * (context.urgency ?? 0.5);
score -= proximityUrgency * 0.1;
if (isPreferredPlayer) {
score -= 0.32;
} else if (isPreferredTeam) {
score -= 0.12;
}
if (isAttackingTeam && attackingBox) {
score -= ["striker", "secondStriker", "wideForward", "connector"].includes(roleKey) ? 0.24 : 0.08;
}
if (isDefendingTeam && (attackingBox || defensiveBox)) {
score -= label === "CB" || label === "6" || label === "GK" ? 0.26 : 0.1;
}
if (roleKey === "gk" && !defensiveBox) {
score += 0.42;
}
if (context.source?.includes?.("cross") || context.source?.includes?.("delivery")) {
score -= label === "CB" || label === "9" || label === "6" ? 0.08 : 0;
}
return {
score,
label: isPreferredTeam ? "second-ball team reaction" : "second-ball counter reaction",
};
}
function getLooseBallRecoveryStructureAdjustment(player, ballPoint, recovery, context = state.ball.secondBallContext) {
if (!player || !ballPoint) {
return {
score: 0,
label: null,
};
}
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const label = getPlayerMagnetLabel(player);
const profile = getOffensiveAutopilotProfile(player.team, ballPoint);
const threat = getPitchThreatProfile(ballPoint, player.team);
const opponentPressure = getOpponentPressureAtPoint(player.team, ballPoint, 10.5);
const supportCount = getTeamSupportCountAroundPoint(player.team, ballPoint, new Set([player.id]), 11.5);
const attackSign = getAttackDirectionSign(player.team);
const coverBehindCount = state.players.reduce((count, teammate) => {
if (teammate.team !== player.team || teammate.id === player.id || isGoalkeeper(teammate)) {
return count;
}
const behindBall = (ballPoint.x - teammate.position.x) * attackSign >= 1.4;
return count + (behindBall && distance(teammate.position, ballPoint) <= 17 ? 1 : 0);
}, 0);
const depth = getAttackingDepth(ballPoint, player.team);
const isPreferredTeam = context?.preferredTeamId && player.team === context.preferredTeamId;
const finalThirdLooseBall = depth >= 64 || threat.box >= 0.18 || threat.assistZone >= 0.22;
const roleFit =
roleKey === "pivot"
? 0.2
: roleKey === "connector"
? 0.18
: roleKey === "wideForward" || roleKey === "striker" || roleKey === "secondStriker"
? finalThirdLooseBall ? 0.18 : 0.08
: roleKey === "wideBack"
? 0.12
: roleKey === "rest"
? finalThirdLooseBall ? 0.03 : 0.12
: roleKey === "gk"
? -0.18
: 0.08;
let score = 0;
score -= roleFit;
score -= clamp(supportCount, 0, 3) * 0.045;
score -= clamp(coverBehindCount, 0, 3) * 0.035;
score -= profile.counterPress * 0.045;
if (isPreferredTeam) {
score -= 0.08;
}
if (opponentPressure >= 0.58 && supportCount === 0) {
score += 0.16 + opponentPressure * 0.08;
}
if (finalThirdLooseBall && (label === "9" || label === "W" || label === "10")) {
score -= 0.1 + threat.value * 0.04;
}
if (threat.depth <= 32 && (label === "CB" || label === "6" || label === "GK")) {
score -= 0.07;
}
if (recovery?.runDistance >= 14 && supportCount <= 1 && opponentPressure >= 0.46) {
score += 0.08;
}
return {
score: clamp(score, -0.36, 0.28),
label:
supportCount >= 1 || coverBehindCount >= 1
? "loose-ball support structure"
: null,
};
}
function getLooseBallNearestOpponent(player, point) {
if (!player || !point) {
return null;
}
return state.players.reduce((nearest, opponent) => {
if (opponent.team === player.team) {
return nearest;
}
const gap = distance(opponent.position, point);
if (!nearest || gap < nearest.gap) {
return { player: opponent, gap };
}
return nearest;
}, null);
}
function getLooseBallCollectControlTouch(player, ballPoint, context = state.ball.secondBallContext) {
if (!player || !ballPoint) {
return null;
}
const attackSign = getAttackDirectionSign(player.team);
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const playerContext = getPlayerDecisionContext(player);
const pressure = getOpponentPressureAtPoint(player.team, ballPoint, 10.5);
const nearestOpponent = getLooseBallNearestOpponent(player, ballPoint);
const threat = getPitchThreatProfile(ballPoint, player.team);
const isDefensiveRecovery = context?.defendingTeamId && player.team === context.defendingTeamId;
const isAttackingRecovery = context?.attackingTeamId && player.team === context.attackingTeamId;
const sideSign =
Math.sign(ballPoint.y - pitch.width / 2) ||
Math.sign(player.position.y - pitch.width / 2) ||
1;
const forwardVector = { x: attackSign, y: 0 };
const awayFromPressure = nearestOpponent
? normalize(nearestOpponent.player.position, ballPoint)
: forwardVector;
const insideExitVector = normalize(ballPoint, {
x: ballPoint.x + attackSign * 8,
y: lerp(ballPoint.y, pitch.width / 2, isWideChannel(ballPoint) ? 0.58 : 0.28),
});
const wideSafetyVector = normalize(ballPoint, {
x: ballPoint.x + attackSign * 5,
y: clamp(ballPoint.y + sideSign * 7.5, 4, pitch.width - 4),
});
const goalVector = normalize(ballPoint, getOpponentGoalCenter(player.team));
const security =
playerContext.profile.technicalSecurity * 0.32 +
playerContext.profile.pressResistance * 0.24 +
playerContext.profile.composure * 0.2 +
playerContext.profile.decisionQuality * 0.14;
const forwardIntent =
(isAttackingRecovery ? 0.16 : 0) +
(threat.depth >= 46 ? 0.12 : 0) +
(roleKey === "wideForward" || roleKey === "striker" || roleKey === "secondStriker" ? 0.14 : 0) -
pressure * 0.1;
const safetyIntent =
(isDefensiveRecovery ? 0.18 : 0) +
(threat.depth <= 38 ? 0.12 : 0) +
pressure * 0.14 +
(roleKey === "gk" || roleKey === "rest" ? 0.1 : 0);
const weights = {
away: clamp(0.48 + pressure * 0.24 + safetyIntent * 0.36, 0.42, 0.86),
inside: clamp(0.34 + security * 0.18 + pressure * 0.08, 0.26, 0.62),
forward: clamp(0.2 + forwardIntent + security * 0.1, 0.08, 0.56),
wide: clamp(safetyIntent * 0.28 + (isWideChannel(ballPoint) ? 0.12 : 0), 0, 0.36),
goal: clamp(threat.box * 0.18 + threat.goldenZone * 0.24 + (isAttackingRecovery ? 0.08 : 0), 0, 0.34),
};
const combined = {
x:
awayFromPressure.x * weights.away +
insideExitVector.x * weights.inside +
forwardVector.x * weights.forward +
wideSafetyVector.x * weights.wide +
goalVector.x * weights.goal,
y:
awayFromPressure.y * weights.away +
insideExitVector.y * weights.inside +
forwardVector.y * weights.forward +
wideSafetyVector.y * weights.wide +
goalVector.y * weights.goal,
};
const length = Math.hypot(combined.x, combined.y) || 1;
const direction = {
x: combined.x / length,
y: combined.y / length,
};
const touchDistance = clamp(
0.74 +
security * 0.76 +
(pressure <= 0.32 ? 0.42 : 0) +
(threat.depth >= 58 ? 0.22 : 0) -
pressure * 0.18,
0.68,
pressure <= 0.38 ? 2.55 : 1.85
);
const controlPoint = clampToPitch({
x: ballPoint.x + direction.x * touchDistance,
y: ballPoint.y + direction.y * touchDistance,
}, 1.5);
const facingAngle = angleBetween(ballPoint, controlPoint);
return {
controlPoint,
playerTarget: clampToPitch(
getPlayerPositionForControlPoint(player, controlPoint, facingAngle),
1.5
),
facingAngle,
pressure,
touchDistance,
};
}
function applyLooseBallCollectControlTouch(player, ballPoint = state.ball.position) {
const touch = getLooseBallCollectControlTouch(player, ballPoint);
if (!touch) {
return connectBallToPlayerForNextAction(player, ballPoint, 0.88);
}
clearAutoPilotReceiveMomentum(player.id);
player.position = cloneVector(touch.playerTarget);
player.bodyAngle = touch.facingAngle;
player.movementProgress = 0;
state.ball.ownerPlayerId = player.id;
keepSecurePossessionOnlyForOwner(player.id);
state.ball.position = cloneVector(getPlayerBallControlPoint(player));
state.ball.target = cloneVector(state.ball.position);
setSecurePossessionAfterControlledTouch(player, state.ball.position, {
quality: clamp(0.58 + (1 - touch.pressure) * 0.18, 0.42, 0.86),
reason: "loose-ball-collect",
minDistanceToExpire: 4.6,
minTimeToExpire: 1.02,
});
state.ball.secondBallContext = null;
return true;
}
function chooseAutoPilotLooseBallRecovery(ballPoint = state.ball.position) {
let bestRecovery = null;
const secondBallContext = state.ball.secondBallContext ?? null;
state.players.forEach((player) => {
const recoveryTarget = getLooseBallRecoveryTarget(player, ballPoint);
const runDistance = distance(player.position, recoveryTarget.position);
const timeToBall = computeTimeToCoverDistance(player, runDistance, recoveryTarget.position);
const context = getPlayerDecisionContext(player);
const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
const goalkeeperPenalty = roleKey === "gk" ? 0.85 : 0;
const ballWinnerBonus =
context.profile.perception * 0.18 +
context.profile.decisionSpeed * 0.14 +
context.profile.tacticalDiscipline * 0.08;
const secondBallAdjustment = getSecondBallReactionAdjustment(
player,
ballPoint,
{
runDistance,
timeToBall,
},
secondBallContext
);
const structureAdjustment = getLooseBallRecoveryStructureAdjustment(
player,
ballPoint,
{
runDistance,
timeToBall,
},
secondBallContext
);
const score =
timeToBall +
runDistance * 0.012 +
goalkeeperPenalty -
ballWinnerBonus +
secondBallAdjustment.score +
structureAdjustment.score;
const recovery = {
player,
ballPoint: cloneVector(ballPoint),
targetPosition: recoveryTarget.position,
facingAngle: recoveryTarget.facingAngle,
runDistance,
timeToBall,
duration: Math.max(timeToBall + 0.12, 0.35),
score,
secondBallLabel: secondBallAdjustment.label ?? structureAdjustment.label,
};
if (!bestRecovery || recovery.score < bestRecovery.score) {
bestRecovery = recovery;
}
});
return bestRecovery;
}
function issueLooseBallRecoveryCommand(recovery) {
if (!recovery?.player) {
return false;
}
const player = recovery.player;
const ballPoint = cloneVector(recovery.ballPoint ?? state.ball.position);
const targetPosition = clampToPitch(recovery.targetPosition ?? player.position, 2);
const facingAngle = Number.isFinite(recovery.facingAngle)
? recovery.facingAngle
: getTeamAttackAngle(player.team);
const recoverySpeed = recovery.runDistance / Math.max(recovery.duration, 0.01);
const startSnapshot = captureSnapshot();
startSnapshot.ball.position = cloneVector(ballPoint);
startSnapshot.ball.ownerPlayerId = null;
startSnapshot.ball.securePossession = null;
clearSecurePossession();
state.draftStep = {
actionType: "recovery",
target: cloneVector(ballPoint),
speed: recoverySpeed,
speedMode: "auto",
profileKey: "loose-ball-recovery",
profileLabel: "Loose Ball Recovery",
targetKind: "loose-ball",
recoveryDuration: recovery.duration,
carrierPlayerId: player.id,
receiverPlayerId: null,
beforeSnapshot: startSnapshot,
autoGenerated: true,
autoReason: recovery.secondBallLabel ?? "nearest player attacks the loose ball",
secondBallContext: state.ball.secondBallContext ? {
...state.ball.secondBallContext,
originPoint: cloneVector(state.ball.secondBallContext.originPoint),
spillPoint: cloneVector(state.ball.secondBallContext.spillPoint),
} : null,
};
state.players.forEach((entry) => {
entry.actionOrigin = cloneVector(entry.position);
});
player.position = cloneVector(targetPosition);
player.bodyAngle = facingAngle;
player.movementProgress = 0;
setSelectedPlayers([player.id], player.id);
state.ball.position = cloneVector(ballPoint);
state.ball.startPosition = cloneVector(ballPoint);
state.ball.target = cloneVector(ballPoint);
state.ball.speed = recoverySpeed;
state.ball.currentSpeed = 0;
state.ball.launchSpeed = 0;
state.ball.finalSpeed = 0;
state.ball.deceleration = 0;
state.ball.profileKey = "loose-ball-recovery";
state.ball.profileLabel = "Loose Ball Recovery";
state.ball.profileMode = "auto";
state.ball.targetKind = "loose-ball";
state.ball.firstTouchMode = null;
state.ball.flightStyle = "ground";
state.ball.peakHeight = 0;
state.ball.height = 0;
state.ball.trackDistanceTotal = 0;
state.ball.trackDistanceCovered = 0;
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = "recovery";
state.ball.ownerPlayerId = null;
state.ball.initiatorPlayerId = player.id;
state.ball.carrierPlayerId = player.id;
state.ball.receiverPlayerId = null;
state.ball.recoveryDuration = recovery.duration;
applyAutopilotsForCurrentAction();
player.position = cloneVector(targetPosition);
player.bodyAngle = facingAngle;
player.movementProgress = 0;
logEvent(
`${recovery.secondBallLabel ? "Second-ball recovery" : "Loose ball recovery"} planned: ${player.shortLabel} ${player.role} attacks the ball in ${formatTime(recovery.duration)}.`
);
return true;
}
function describeAutoPilotChoice(choice) {
if (!choice) {
return "no action";
}
const receiver = choice.receiverPlayerId ? getPlayerById(choice.receiverPlayerId) : null;
const receiverText = receiver ? ` to ${getPlayerMagnetLabel(receiver)}` : "";
const teamName = teams[choice.teamId]?.name ?? "Team";
const styleText = choice.styleLabel ? ` in ${choice.styleLabel}` : "";
const principleText = choice.principleLabels?.length
? ` Principle: ${choice.principleLabels.join(" + ")}.`
: "";
return `${teamName} auto play chooses ${choice.label}${receiverText} from ${choice.formation} ${choice.phaseLabel.toLowerCase()}${styleText} to ${choice.reason}.${principleText}`;
}
function planAutoPilotNextAction({ startImmediately = true } = {}) {
if (!state.offensiveAutopilot || state.isRunning || state.sequence.isPlaying) {
return false;
}
if (hasBallAction() || state.draftStep) {
if (startImmediately) {
executePlannedAction();
}
return true;
}
const possessionPlayer = getAutoPilotPossessionPlayer();
if (!possessionPlayer) {
const recovery = chooseAutoPilotLooseBallRecovery();
if (recovery && issueLooseBallRecoveryCommand(recovery)) {
if (startImmediately) {
executePlannedAction();
}
return true;
}
}
const choice = chooseAutoPilotNextAction();
if (!choice) {
state.autoPilotPlay.active = false;
logEvent("Auto play paused: no stable attacking action was available.");
updateSequenceButtons();
render();
return false;
}
clearKeyboardActionGrace();
state.actionMode = null;
if (choice.actionType === "shot") {
issueShotCommand(choice.target);
} else if (choice.actionType === "dribble") {
issueDribbleCommand(choice.target);
} else {
issuePassCommand(choice.target, choice.receiverPlayerId ?? null);
}
if (!state.draftStep) {
state.autoPilotPlay.active = false;
updateSequenceButtons();
render();
return false;
}
state.draftStep.autoGenerated = true;
state.draftStep.autoReason = choice.reason;
state.draftStep.autoPrinciples = [...(choice.principleLabels ?? [])];
state.draftStep.principleRunnerPlayerId = choice.principleRunnerPlayerId ?? null;
if (choice.firstTouchMode && choice.actionType === "pass") {
state.draftStep.firstTouchMode = choice.firstTouchMode;
state.ball.firstTouchMode = choice.firstTouchMode;
}
if (state.draftStep.principleRunnerPlayerId || state.draftStep.autoPrinciples.length) {
applyAutopilotsForCurrentAction({ silent: true });
}
logEvent(describeAutoPilotChoice(choice));
if (startImmediately) {
executePlannedAction();
}
return true;
}
function cancelAutoPilotContinuation() {
if (state.autoPilotPlay?.nextActionTimeoutId) {
win.clearTimeout(state.autoPilotPlay.nextActionTimeoutId);
state.autoPilotPlay.nextActionTimeoutId = null;
}
}
function pauseAutoPilotPlay(message = "Auto play paused.") {
cancelAutoPilotContinuation();
if (state.autoPilotPlay) {
state.autoPilotPlay.active = false;
}
if (state.isRunning) {
pauseLiveSimulation(message);
return;
}
logEvent(message);
updateSequenceButtons();
render();
}
function getAutoPilotContinuationContext(actionType = state.ball.actionType) {
const carrier = getAutoPilotPossessionPlayer();
if (!carrier) {
return {
carrier: null,
profile: null,
flow: null,
momentum: null,
pressure: 0,
firstTouchMode: null,
justReceived: false,
depth: 0,
threat: getPitchThreatProfile(state.ball.position, defaultKickoffTeamId),
};
}
const startPoint = cloneVector(getPlayerBallControlPoint(carrier));
const profile = getOffensiveAutopilotProfile(carrier.team, startPoint);
const flow = getAutoPilotFlowContext(carrier, startPoint);
const momentum = getAutoPilotReceiveMomentum(carrier, startPoint);
return {
carrier,
profile,
flow,
momentum,
pressure: getPlayerPressureLoad(carrier, startPoint),
firstTouchMode: momentum?.mode ?? (actionType === "pass" ? state.ball.firstTouchMode : null),
justReceived: !!flow.carrierJustReceived || !!momentum,
depth: getAttackingDepth(startPoint, carrier.team),
threat: getPitchThreatProfile(startPoint, carrier.team),
};
}
function getAutoPilotContinuationDelay(actionType = state.ball.actionType) {
const context = getAutoPilotContinuationContext(actionType);
const profile = context.profile;
const tempo = profile?.tempo ?? 0.55;
const pressure = context.pressure ?? 0;
const touchMode = context.firstTouchMode ?? "auto";
const highTempo = tempo >= 0.68 || profile?.styleKey === "gegenpress" || profile?.styleKey === "vertical-play";
const finalThirdUrgency = context.depth >= 70 || context.threat?.box >= 0.22 || context.threat?.centralPocket >= 0.42;
const base =
actionType === "dribble"
? 105
: actionType === "shot"
? 185
: actionType === "recovery"
? 170
: 145;
const touchDelay =
touchMode === "kill"
? 170
: touchMode === "back"
? 140
: touchMode === "inside" || touchMode === "across"
? 92
: touchMode === "forward"
? 58
: 88;
const pressureAdjustment =
pressure >= 0.68
? -58
: pressure >= 0.5
? -28
: pressure <= 0.24
? 84
: 22;
const styleAdjustment =
highTempo
? -48
: profile?.shortSupport >= 0.72
? 38
: profile?.directness <= 0.44
? 58
: 0;
const receiveAdjustment = context.justReceived ? touchDelay : 0;
const finalThirdAdjustment = finalThirdUrgency ? -34 : 0;
const variation = randomBetween(-26, 42);
return clamp(
Math.round(base + receiveAdjustment + pressureAdjustment + styleAdjustment + finalThirdAdjustment + variation),
highTempo ? 90 : 125,
profile?.styleKey === "control-possession" || profile?.styleKey === "tiki-taka" ? 560 : 430
);
}
function scheduleAutoPilotContinuation(delayMs = null, actionType = state.ball.actionType) {
if (!state.autoPilotPlay?.active || !state.offensiveAutopilot) {
return;
}
cancelAutoPilotContinuation();
const resolvedDelay = delayMs ?? getAutoPilotContinuationDelay(actionType);
state.autoPilotPlay.nextActionTimeoutId = win.setTimeout(() => {
state.autoPilotPlay.nextActionTimeoutId = null;
if (
!state.autoPilotPlay.active ||
!state.offensiveAutopilot ||
state.isRunning ||
state.sequence.isPlaying ||
hasBallAction() ||
state.draftStep
) {
return;
}
planAutoPilotNextAction({ startImmediately: true });
}, resolvedDelay);
}
function refreshPlannedBallActionProfile() {
if (!state.draftStep || !hasBallAction() || state.isRunning || state.sequence.isPlaying) {
return;
}
const actionType = state.draftStep.actionType;
const target = cloneVector(state.ball.target);
const startPoint = cloneVector(state.ball.startPosition);
const initiator = getPlayerById(state.draftStep.beforeSnapshot?.ball?.ownerPlayerId);
const resolvedProfile = resolveBallActionProfile(
actionType,
startPoint,
target,
initiator,
state.draftStep.receiverPlayerId ?? null
);
state.draftStep.speed = resolvedProfile.averageSpeed;
state.draftStep.speedMode = resolvedProfile.source;
state.draftStep.profileKey = resolvedProfile.key;
state.draftStep.profileLabel = resolvedProfile.label;
state.draftStep.targetKind = resolvedProfile.targetKind;
if (actionType === "pass") {
state.draftStep.firstTouchMode = state.firstTouchMode;
state.ball.firstTouchMode = state.firstTouchMode;
}
applyResolvedBallProfile(resolvedProfile);
applyBallExecutionProfile(actionType, initiator, target, resolvedProfile);
configureBallTravelProfile(
actionType,
distance(startPoint, target),
getActionSpeed(),
resolvedProfile
);
}
function clearBallAction() {
state.ball.startPosition = cloneVector(state.ball.position);
state.ball.target = cloneVector(state.ball.position);
state.ball.currentSpeed = 0;
state.ball.launchSpeed = 0;
state.ball.finalSpeed = 0;
state.ball.deceleration = 0;
state.ball.profileKey = null;
state.ball.profileLabel = null;
state.ball.profileMode = state.ballSpeedMode;
state.ball.targetKind = null;
state.ball.firstTouchMode = state.firstTouchMode;
state.ball.flightStyle = "ground";
state.ball.peakHeight = 0;
state.ball.height = 0;
state.ball.controlHeightThreshold = 0.12;
state.ball.landingPhaseStart = 0.58;
state.ball.curveAmount = 0;
state.ball.curveDirection = 1;
state.ball.spinRate = 0;
state.ball.spinAngle = 0;
state.ball.trackDistanceTotal = 0;
state.ball.trackDistanceCovered = 0;
state.ball.dribblePath = null;
state.ball.bounceCount = 0;
state.ball.inTransit = false;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.laneClarity = 0.84;
state.ball.executionQuality = 0.84;
state.ball.shotPlacement = null;
state.ball.claimRadius = 2.2;
state.ball.controlRadius = 1.4;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = null;
state.ball.recoveryDuration = 0;
state.ball.secondBallContext = null;
state.activeActionTargets = null;
state.sequence.actionTargets = null;
state.draftStep = null;
state.players.forEach((player) => {
player.actionOrigin = null;
});
resetPlayerMovementProgress();
}
function setBallOwner(playerId) {
if (!canEditScenario()) {
return;
}
const player = getPlayerById(playerId);
if (!player) {
return;
}
rotatePlayerBodyToward(player, {
x: player.position.x + Math.cos(getTeamAttackAngle(player.team)) * 4,
y: player.position.y,
});
clearBallAction();
clearAutoPilotReceiveMomentum();
clearSecurePossession();
state.ball.ownerPlayerId = player.id;
const controlPoint = getPlayerBallControlPoint(player);
state.ball.position = cloneVector(controlPoint);
state.ball.startPosition = cloneVector(controlPoint);
state.ball.target = cloneVector(controlPoint);
state.ball.receiverPlayerId = null;
logEvent(`${player.shortLabel} ${player.role} is now the ball carrier.`);
}
function issuePassLikeCommand(actionType, targetPoint, receiverPlayerId = null) {
const receiver = receiverPlayerId ? getPlayerById(receiverPlayerId) : null;
const initiator = getBallOwner() ?? getSelectedPlayer();
if (actionType === "pass" && receiver) {
const passStartPoint = initiator ? getPlayerBallControlPoint(initiator) : state.ball.position;
const offsideInfo = getOffsideInfo(receiver, passStartPoint);
if (offsideInfo.isOffside) {
clearBallAction();
logEvent(`Offside: ${offsideInfo.reason}`);
render();
return;
}
}
if (state.ball.securePossession && state.ball.securePossession.ownerPlayerId !== initiator?.id) {
clearSecurePossession();
}
if (actionType === "pass" && receiver) {
const incomingPoint = initiator ? getPlayerBallControlPoint(initiator) : state.ball.position;
applyBestReceiveBodyAngle(receiver, incomingPoint, 0.9);
}
const target = receiver
? getPlayerBallControlPoint(receiver)
: actionType === "shot"
? resolveShotTarget(targetPoint, initiator)
: clampToPitch(targetPoint);
const travelDistance = distance(state.ball.position, target);
const isShot = actionType === "shot";
const label = isShot ? "Shot target" : "Ball target";
if (travelDistance <= 0.05) {
clearBallAction();
logEvent(`${label} was cleared because the start point and target were the same.`);
return;
}
const resolvedProfile = resolveBallActionProfile(
actionType,
state.ball.position,
target,
initiator,
receiver?.id ?? null
);
const startSnapshot = captureSnapshot();
state.draftStep = {
actionType,
target: cloneVector(target),
speed: resolvedProfile.averageSpeed,
speedMode: resolvedProfile.source,
profileKey: resolvedProfile.key,
profileLabel: resolvedProfile.label,
targetKind: resolvedProfile.targetKind,
firstTouchMode: !isShot ? state.firstTouchMode : null,
receiverPlayerId: !isShot ? receiver?.id ?? null : null,
beforeSnapshot: startSnapshot,
};
state.ball.startPosition = cloneVector(state.ball.position);
state.ball.target = target;
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = actionType;
state.ball.initiatorPlayerId = initiator?.id ?? null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = !isShot ? receiver?.id ?? null : null;
state.ball.firstTouchMode = !isShot ? state.firstTouchMode : null;
state.ball.ownerPlayerId = null;
applyResolvedBallProfile(resolvedProfile);
applyBallExecutionProfile(actionType, initiator, target, resolvedProfile);
configureBallTravelProfile(actionType, travelDistance, getActionSpeed(), resolvedProfile);
state.players.forEach((player) => {
player.actionOrigin = cloneVector(player.position);
});
if (initiator) {
rotatePlayerBodyToward(initiator, target, 0.8);
const launchPoint = getPlayerBallControlPoint(initiator);
state.ball.position = cloneVector(launchPoint);
state.ball.startPosition = cloneVector(launchPoint);
}
applyAutopilotsForCurrentAction();
if (!isShot && receiver) {
logEvent(
`New pass planned: ${resolvedProfile.label} at ${formatSpeed(resolvedProfile.averageSpeed)} to ${receiver.shortLabel} ${receiver.role}.`
);
} else if (isShot) {
logEvent(
`New shot planned: ${resolvedProfile.label} at ${formatSpeed(resolvedProfile.averageSpeed)} to x ${target.x.toFixed(1)}, y ${target.y.toFixed(1)}.`
);
} else {
logEvent(
`New pass planned: ${resolvedProfile.label} at ${formatSpeed(resolvedProfile.averageSpeed)} to x ${target.x.toFixed(1)}, y ${target.y.toFixed(1)}.`
);
}
}
function issuePassCommand(targetPoint, receiverPlayerId = null) {
issuePassLikeCommand("pass", targetPoint, receiverPlayerId);
}
function issueShotCommand(targetPoint) {
issuePassLikeCommand("shot", targetPoint);
}
function issueDribbleCommand(targetPoint) {
const owner = getBallOwner();
const carrier = owner ?? getSelectedPlayer();
if (!carrier) {
logEvent("Select a player or set a ball carrier before planning a dribble.");
return;
}
if (!owner && distance(state.ball.position, carrier.position) > 2.5) {
logEvent("Set the selected player as ball carrier before planning a dribble.");
return;
}
if (state.ball.securePossession && state.ball.securePossession.ownerPlayerId !== carrier.id) {
clearSecurePossession();
}
const target = clampToPitch(targetPoint);
const resolvedProfile = resolveBallActionProfile(
"dribble",
getPlayerBallControlPoint(carrier),
target,
carrier
);
const startSnapshot = captureSnapshot();
startSnapshot.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
startSnapshot.ball.ownerPlayerId = carrier.id;
state.draftStep = {
actionType: "dribble",
target: cloneVector(target),
speed: resolvedProfile.averageSpeed,
speedMode: resolvedProfile.source,
profileKey: resolvedProfile.key,
profileLabel: resolvedProfile.label,
targetKind: resolvedProfile.targetKind,
carrierPlayerId: carrier.id,
beforeSnapshot: startSnapshot,
};
state.ball.ownerPlayerId = carrier.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
const travelDistance = distance(carrier.position, target);
if (travelDistance <= 0.05) {
clearBallAction();
state.ball.ownerPlayerId = carrier.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
logEvent("The dribble was cleared because the start point and target were the same.");
return;
}
state.ball.startPosition = cloneVector(getPlayerBallControlPoint(carrier));
state.ball.target = target;
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = "dribble";
state.ball.initiatorPlayerId = carrier.id;
state.ball.carrierPlayerId = carrier.id;
state.ball.receiverPlayerId = null;
applyResolvedBallProfile(resolvedProfile);
applyBallExecutionProfile("dribble", carrier, target, resolvedProfile);
configureBallTravelProfile("dribble", travelDistance, getActionSpeed(), resolvedProfile);
state.players.forEach((player) => {
player.actionOrigin = cloneVector(player.position);
});
setDribbleCarryPathForBall(carrier, carrier.position, target);
rotatePlayerBodyToward(carrier, target, 0.92);
const carrierControlPoint = getPlayerBallControlPoint(carrier);
state.ball.position = cloneVector(carrierControlPoint);
state.ball.startPosition = cloneVector(carrierControlPoint);
applyAutopilotsForCurrentAction();
logEvent(
`${carrier.shortLabel} ${carrier.role} dribbles toward x ${target.x.toFixed(1)}, y ${target.y.toFixed(1)} at ${formatSpeed(resolvedProfile.averageSpeed)}.`
);
}
function issueBallCommand(targetPoint, forcedMode = null) {
const actionMode = forcedMode ?? getRequestedActionMode();
if (actionMode === null) {
logEvent("Press P, D or S, or arm a mode button, before placing a ball action.");
return;
}
if (actionMode === "dribble") {
issueDribbleCommand(targetPoint);
return;
}
if (actionMode === "shot") {
issueShotCommand(targetPoint);
return;
}
issuePassCommand(targetPoint);
}
function detectShotGoal(previousPosition, currentPosition) {
if (state.ball.actionType !== "shot") {
return null;
}
const shooter =
getPlayerById(state.ball.initiatorPlayerId) ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId);
const scoringTeamId = shooter?.team ?? getPlannedPossessionTeamId();
if (!scoringTeamId) {
return null;
}
const side = getOpponentGoalSide(scoringTeamId);
const sign = getGoalDirectionSign(side);
const goalLineX = getGoalLineX(side);
const previousSideValue = (previousPosition.x - goalLineX) * sign;
const currentSideValue = (currentPosition.x - goalLineX) * sign;
const targetSideValue = (state.ball.target.x - goalLineX) * sign;
const crossedGoalLine =
previousSideValue < -0.01 &&
(currentSideValue >= -0.01 || targetSideValue > 0);
if (!crossedGoalLine) {
return null;
}
const segmentX = currentPosition.x - previousPosition.x;
const ratio = Math.abs(segmentX) <= 0.001
? 1
: clamp((goalLineX - previousPosition.x) / segmentX, 0, 1);
const goalY = lerp(previousPosition.y, currentPosition.y, ratio);
if (!isBetweenGoalPosts(goalY, ballRadiusMeters * 0.85)) {
return null;
}
return {
scoringTeamId,
concedingTeamId: getOtherTeamId(scoringTeamId),
side,
scoredAt: state.time,
point: { x: goalLineX, y: goalY },
displayPoint: getGoalNetDisplayPoint(side, goalY),
};
}
function detectShotOutOfPlay(previousPosition, currentPosition) {
if (state.ball.actionType !== "shot") {
return null;
}
const shooter =
getPlayerById(state.ball.initiatorPlayerId) ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId);
const shootingTeamId = shooter?.team ?? getPlannedPossessionTeamId();
if (!shootingTeamId) {
return null;
}
const side = getOpponentGoalSide(shootingTeamId);
const sign = getGoalDirectionSign(side);
const goalLineX = getGoalLineX(side);
const previousSideValue = (previousPosition.x - goalLineX) * sign;
const currentSideValue = (currentPosition.x - goalLineX) * sign;
const targetSideValue = (state.ball.target.x - goalLineX) * sign;
const crossedGoalLine =
previousSideValue < -0.01 &&
(currentSideValue >= -0.01 || targetSideValue > 0);
if (!crossedGoalLine) {
return null;
}
const segmentX = currentPosition.x - previousPosition.x;
const ratio = Math.abs(segmentX) <= 0.001
? 1
: clamp((goalLineX - previousPosition.x) / segmentX, 0, 1);
const outY = clamp(lerp(previousPosition.y, currentPosition.y, ratio), 0, pitch.width);
if (isBetweenGoalPosts(outY, ballRadiusMeters * 0.85)) {
return null;
}
return {
type: "goalKick",
shootingTeamId,
restartTeamId: getOtherTeamId(shootingTeamId),
side,
occurredAt: state.time,
point: { x: goalLineX, y: outY },
displayPoint: {
x: goalLineX - sign * 0.45,
y: outY,
},
};
}
function detectTouchlineOutOfPlay(previousPosition, currentPosition) {
const actionType = state.ball.actionType;
if (actionType !== "pass" && actionType !== "shot") {
return null;
}
const crossedTop =
previousPosition.y >= 0 &&
currentPosition.y < 0;
const crossedBottom =
previousPosition.y <= pitch.width &&
currentPosition.y > pitch.width;
if (!crossedTop && !crossedBottom) {
return null;
}
const touchlineY = crossedTop ? 0 : pitch.width;
const segmentY = currentPosition.y - previousPosition.y;
const ratio = Math.abs(segmentY) <= 0.001
? 1
: clamp((touchlineY - previousPosition.y) / segmentY, 0, 1);
const outX = clamp(lerp(previousPosition.x, currentPosition.x, ratio), 0, pitch.length);
const initiator =
getPlayerById(state.ball.initiatorPlayerId) ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId) ??
getActionInitiator();
const lastTouchTeamId = initiator?.team ?? getPlannedPossessionTeamId();
if (!lastTouchTeamId) {
return null;
}
return {
type: "throwIn",
lastTouchTeamId,
restartTeamId: getOtherTeamId(lastTouchTeamId),
sideY: touchlineY,
occurredAt: state.time,
point: { x: outX, y: touchlineY },
displayPoint: {
x: outX,
y: touchlineY === 0 ? -0.45 : pitch.width + 0.45,
},
};
}
function getGoalkeeperForTeam(teamId) {
return state.players.find((player) => player.team === teamId && isGoalkeeper(player)) ?? null;
}
function getPreferredParrySafetyPlayer(teamId, spillPoint, goalkeeperId) {
if (!teamId || !spillPoint) {
return null;
}
const safetyRoles = new Set(["CB", "LB", "RB", "WB", "6"]);
let bestCandidate = null;
state.players.forEach((player) => {
if (player.team !== teamId || player.id === goalkeeperId || isGoalkeeper(player)) {
return;
}
const label = getPlayerMagnetLabel(player);
const context = getPlayerDecisionContext(player);
const gap = distance(player.position, spillPoint);
const timeToBall = computeTimeToCoverDistance(player, gap, spillPoint);
const safetyRoleBonus = safetyRoles.has(label) ? 0.42 : label === "8" ? 0.16 : 0;
const boxProtectionBonus = isInsideOwnBox(spillPoint, teamId) && safetyRoles.has(label) ? 0.18 : 0;
const score =
safetyRoleBonus +
boxProtectionBonus +
context.profile.perception * 0.2 +
context.profile.tacticalDiscipline * 0.22 +
context.profile.composure * 0.16 -
timeToBall * 0.22 -
gap * 0.018;
if (!bestCandidate || score > bestCandidate.score) {
bestCandidate = { player, score };
}
});
return bestCandidate?.player ?? null;
}
function getGoalkeeperParryProfile(goalInfo, savePoint, goalkeeper, metrics) {
const goalSign = getGoalDirectionSign(goalInfo.side);
const parrySide =
Math.sign(goalInfo.point.y - pitch.width / 2) ||
(goalkeeper.position.y >= pitch.width / 2 ? 1 : -1);
const control = clamp(
metrics.saveScore * 0.46 +
metrics.catchScore * 0.24 +
metrics.access * 0.16 +
metrics.reading * 0.18 -
metrics.closeRange * 0.22 -
metrics.shotPower * 0.12,
0,
1
);
const lateralWeight = lerp(0.34, 1.22, control) + metrics.cornerReach * 0.2;
const awayWeight = clamp(
lerp(0.58, 1.46, control) - metrics.closeRange * 0.16,
0.42,
1.55
);
const angle = Math.atan2(parrySide * lateralWeight, -goalSign * awayWeight);
const distanceMeters = clamp(
2.1 +
metrics.shotPower * 3.8 +
metrics.cornerReach * 0.9 +
control * 2.4 -
metrics.closeRange * 1.15,
1.8,
9.4
);
const spillPoint = clampToPitch({
x: savePoint.x + Math.cos(angle) * distanceMeters,
y: savePoint.y + Math.sin(angle) * distanceMeters,
}, 0.75);
const penaltySpot = getOpponentPenaltySpot(goalInfo.scoringTeamId);
const centralDanger =
clamp(1 - Math.abs(spillPoint.y - pitch.width / 2) / 10, 0, 1) *
clamp(1 - distance(spillPoint, penaltySpot) / 15, 0, 1);
const safeParry = control >= 0.58 && centralDanger <= 0.45;
return {
angle,
distanceMeters,
spillPoint,
control,
centralDanger,
safeParry,
label: safeParry ? "safe parry" : centralDanger >= 0.55 ? "danger rebound" : "parry",
urgency: clamp(
0.72 +
metrics.shotPower * 0.14 +
metrics.closeRange * 0.14 +
centralDanger * 0.12 -
control * 0.26,
safeParry ? 0.42 : 0.58,
0.92
),
};
}
function resolveGoalkeeperSave(goalInfo, previousPosition) {
const goalkeeper = getGoalkeeperForTeam(goalInfo?.concedingTeamId);
if (!goalkeeper || !goalInfo?.point) {
return null;
}
const goalSign = getGoalDirectionSign(goalInfo.side);
const savePoint = clampToPitch({
x: goalInfo.point.x - goalSign * 0.9,
y: goalInfo.point.y,
}, 0.25);
const shotStart = state.ball.startPosition ?? previousPosition;
const shotDistance = distance(shotStart, goalInfo.point);
const shotSpeed = Math.max(state.ball.currentSpeed || state.ball.launchSpeed || state.ball.speed || 0, 0.1);
const shotPower = clamp((shotSpeed - 9.5) / 17, 0, 1);
const shotQuality = clamp(state.ball.executionQuality ?? 0.72, 0.35, 0.98);
const cornerReach = clamp(Math.abs(goalInfo.point.y - pitch.width / 2) / (7.32 / 2), 0, 1.15);
const closeRange = clamp((23 - shotDistance) / 18, 0, 1);
const context = getPlayerDecisionContext(goalkeeper);
const distanceToSave = distance(goalkeeper.position, savePoint);
const diveReach =
1.35 +
context.profile.perception * 0.45 +
context.profile.decisionSpeed * 0.34 +
context.profile.composure * 0.26 +
clamp(context.maxSpeed / 8, 0, 1) * 0.42;
const movementDistance = Math.max(distanceToSave - diveReach, 0);
const saveTime = computeTimeToCoverDistance(goalkeeper, movementDistance, savePoint);
const availableTime = Math.max(state.ball.elapsedTravelTime, 0.05);
const access = clamp((availableTime - saveTime + 0.18) / 0.82, 0, 1);
const positioning = clamp(1 - distanceToSave / 9.8, 0, 1);
const reading =
context.profile.perception * 0.24 +
context.profile.decisionSpeed * 0.2 +
context.profile.decisionQuality * 0.18 +
context.profile.composure * 0.18 +
context.profile.technicalSecurity * 0.12 +
clamp(context.maxSpeed / 8, 0, 1) * 0.08;
const difficulty =
shotPower * 0.28 +
shotQuality * 0.22 +
cornerReach * 0.36 +
closeRange * 0.26 +
(state.ball.flightStyle === "driven" ? 0.08 : 0);
const saveScore = access * 0.48 + reading * 0.36 + positioning * 0.24 - difficulty * 0.42;
const catchScore =
saveScore +
context.profile.technicalSecurity * 0.2 +
context.profile.composure * 0.16 -
shotPower * 0.32 -
cornerReach * 0.18 -
closeRange * 0.1;
const saveThreshold = closeRange > 0.68 ? 0.5 : cornerReach > 0.92 ? 0.48 : 0.38;
if (saveScore < saveThreshold) {
return null;
}
rotatePlayerBodyToward(goalkeeper, savePoint, 0.9);
goalkeeper.position = clampToPitch({
x: lerp(goalkeeper.position.x, savePoint.x, clamp(access * 0.72, 0.22, 0.88)),
y: lerp(goalkeeper.position.y, savePoint.y, clamp(access * 0.86, 0.3, 0.94)),
}, 0.8);
if (catchScore >= 0.52 && shotPower <= 0.72 && closeRange <= 0.74) {
connectBallToPlayerForNextAction(goalkeeper, savePoint, 0.92);
clearSecurePossession();
return {
kind: "catch",
goalkeeper,
point: cloneVector(savePoint),
saveScore,
};
}
const parrySide = Math.sign(goalInfo.point.y - pitch.width / 2) || (goalkeeper.position.y >= pitch.width / 2 ? 1 : -1);
const parryDistance = clamp(3.4 + shotPower * 4.2 + cornerReach * 1.2 - catchScore * 0.8, 2.4, 8.6);
const shouldParryBehindForCorner =
(cornerReach >= 0.78 && shotPower >= 0.42 && catchScore < 0.48) ||
(cornerReach >= 0.94 && catchScore < 0.58) ||
(closeRange >= 0.62 && cornerReach >= 0.72 && catchScore < 0.42);
if (shouldParryBehindForCorner) {
clearSecurePossession();
state.ball.ownerPlayerId = null;
const displayY = clamp(
goalInfo.point.y + parrySide * clamp(1.05 + parryDistance * 0.18, 1.05, 2.4),
0,
pitch.width
);
return {
kind: "corner",
goalkeeper,
point: {
x: goalInfo.point.x - goalSign * 0.35,
y: displayY,
},
displayPoint: {
x: goalInfo.point.x - goalSign * 0.35,
y: displayY,
},
restartTeamId: goalInfo.scoringTeamId,
sideY: displayY <= pitch.width / 2 ? 0 : pitch.width,
saveScore,
};
}
const parryProfile = getGoalkeeperParryProfile(goalInfo, savePoint, goalkeeper, {
saveScore,
catchScore,
access,
reading,
shotPower,
closeRange,
cornerReach,
});
const preferredSafetyPlayer = parryProfile.safeParry
? getPreferredParrySafetyPlayer(goalInfo.concedingTeamId, parryProfile.spillPoint, goalkeeper.id)
: null;
const spill = createLooseBallSpill(
savePoint,
parryProfile.angle,
parryProfile.distanceMeters,
preferredSafetyPlayer?.id ?? null,
preferredSafetyPlayer ? 0.08 + parryProfile.control * 0.08 : -0.02,
{
canClaimPlayer: (player) => player.id !== goalkeeper.id,
source: parryProfile.safeParry ? "goalkeeper-safe-parry" : "goalkeeper-danger-parry",
reboundType: parryProfile.label,
attackingTeamId: goalInfo.scoringTeamId,
defendingTeamId: goalInfo.concedingTeamId,
urgency: parryProfile.urgency,
preferredTeamId: parryProfile.safeParry ? goalInfo.concedingTeamId : goalInfo.scoringTeamId,
}
);
return {
kind: "parry",
goalkeeper,
point: spill.spillPoint,
winner: spill.winner,
saveScore,
saveControl: parryProfile.control,
label: parryProfile.label,
};
}
function registerGoalFlash(goalInfo) {
const scoringTeamName = teams[goalInfo.scoringTeamId]?.name ?? "Team";
state.goalFlash = {
...cloneGoalEvent(goalInfo),
scoringTeamName,
createdAtMs: Date.now(),
expiresAtMs: Date.now() + 2600,
};
}
function completeGoalkeeperSave(saveOutcome, completedTravelTime) {
const savedGoalkeeperPosition = cloneVector(saveOutcome.goalkeeper.position);
const isCornerRestart = saveOutcome.kind === "corner";
const savedBallPosition = isCornerRestart
? cloneVector(saveOutcome.displayPoint ?? saveOutcome.point)
: cloneVector(state.ball.position);
const savedBallTarget = cloneVector(savedBallPosition);
const savedBallOwnerId = isCornerRestart ? null : state.ball.ownerPlayerId ?? null;
state.ball.inTransit = false;
state.ball.height = 0;
if (state.sequence.isPlaying) {
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
state.sequence.phase = null;
state.sequence.actionTargets = null;
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step) {
const afterSnapshot = cloneSnapshot(captureSnapshot());
step.afterSnapshot = afterSnapshot;
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
if (isCornerRestart) {
logEvent(
`${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} saves and turns the shot behind for a corner after ${formatTime(completedTravelTime)}.`
);
} else {
const saveAction = saveOutcome.kind === "catch"
? "catches"
: saveOutcome.label === "safe parry"
? "saves and pushes away"
: "saves and parries";
logEvent(
`${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} ${saveAction} the shot after ${formatTime(completedTravelTime)}.`
);
}
queueNextSequenceStep();
return;
}
completeLiveActionPlayersBeforeCommit(saveOutcome.point);
saveOutcome.goalkeeper.position = savedGoalkeeperPosition;
state.ball.position = savedBallPosition;
state.ball.target = savedBallTarget;
state.ball.ownerPlayerId = savedBallOwnerId;
if (isCornerRestart && state.draftStep) {
state.draftStep.nextRestartPhase = {
type: "corner",
teamId: saveOutcome.restartTeamId,
label: setPiecePhaseProfiles.corner.label,
sideY: saveOutcome.sideY,
};
state.draftStep.target = cloneVector(saveOutcome.point);
}
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
if (isCornerRestart) {
logEvent(
`${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} saves and turns the shot behind for a corner after ${formatTime(completedTravelTime)}.`
);
} else {
const saveAction = saveOutcome.kind === "catch"
? "catches"
: saveOutcome.label === "safe parry"
? "saves and pushes away"
: "saves and parries";
logEvent(
`${saveOutcome.goalkeeper.shortLabel} ${saveOutcome.goalkeeper.role} ${saveAction} the shot after ${formatTime(completedTravelTime)}.`
);
}
scheduleAutoPilotContinuation(null, "shot");
}
function completeShotGoal(goalInfo, completedTravelTime) {
registerGoalFlash(goalInfo);
state.ball.position = cloneVector(goalInfo.displayPoint ?? goalInfo.point);
state.ball.target = cloneVector(state.ball.position);
state.ball.height = 0;
state.ball.inTransit = false;
if (state.sequence.isPlaying) {
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
state.sequence.phase = null;
state.sequence.actionTargets = null;
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.afterSnapshot) {
applyCommittedSnapshot(step.afterSnapshot);
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
logEvent(
`GOAL: ${teams[goalInfo.scoringTeamId]?.name ?? "Team"} scores. ${teams[goalInfo.concedingTeamId]?.name ?? "Opponent"} restart with kick-off.`
);
queueNextSequenceStep();
return;
}
completeLiveActionPlayersBeforeCommit(goalInfo.point);
if (state.draftStep) {
state.draftStep.goal = cloneGoalEvent(goalInfo);
state.draftStep.target = cloneVector(goalInfo.point);
}
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(
`GOAL: ${teams[goalInfo.scoringTeamId]?.name ?? "Team"} scores after ${formatTime(completedTravelTime)}. ${teams[goalInfo.concedingTeamId]?.name ?? "Opponent"} restart with kick-off.`
);
scheduleAutoPilotContinuation(null, "shot");
}
function completeShotOutOfPlay(outInfo, completedTravelTime) {
const displayPoint = outInfo.displayPoint ?? outInfo.point;
const restartTeamName = teams[outInfo.restartTeamId]?.name ?? "Defending team";
state.ball.position = cloneVector(displayPoint);
state.ball.target = cloneVector(displayPoint);
state.ball.height = 0;
state.ball.inTransit = false;
if (state.sequence.isPlaying) {
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
state.sequence.phase = null;
state.sequence.actionTargets = null;
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.afterSnapshot) {
applyCommittedSnapshot(step.afterSnapshot);
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
logEvent(`Shot misses after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a goal-kick.`);
queueNextSequenceStep();
return;
}
completeLiveActionPlayersBeforeCommit(outInfo.point);
if (state.draftStep) {
state.draftStep.nextRestartPhase = {
type: "goalKick",
teamId: outInfo.restartTeamId,
label: setPiecePhaseProfiles.goalKick.label,
};
state.draftStep.target = cloneVector(outInfo.point);
}
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(`Shot misses after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a goal-kick.`);
scheduleAutoPilotContinuation(null, "shot");
}
function completeTouchlineOutOfPlay(outInfo, completedTravelTime) {
const displayPoint = outInfo.displayPoint ?? outInfo.point;
const restartTeamName = teams[outInfo.restartTeamId]?.name ?? "Restart team";
const actionLabel = state.ball.actionType === "shot" ? "Shot" : "Pass";
state.ball.position = cloneVector(displayPoint);
state.ball.target = cloneVector(displayPoint);
state.ball.height = 0;
state.ball.inTransit = false;
if (state.sequence.isPlaying) {
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
state.sequence.phase = null;
state.sequence.actionTargets = null;
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.afterSnapshot) {
applyCommittedSnapshot(step.afterSnapshot);
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
logEvent(`${actionLabel} goes out after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a throw-in.`);
queueNextSequenceStep();
return;
}
completeLiveActionPlayersBeforeCommit(outInfo.point);
if (state.draftStep) {
state.draftStep.nextRestartPhase = {
type: "throwIn",
teamId: outInfo.restartTeamId,
label: setPiecePhaseProfiles.throwIn.label,
point: cloneVector(outInfo.point),
sideY: outInfo.sideY,
};
state.draftStep.target = cloneVector(outInfo.point);
}
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(`${actionLabel} goes out after ${formatTime(completedTravelTime)}. ${restartTeamName} restart with a throw-in.`);
scheduleAutoPilotContinuation(null, outInfo.type);
}
function updateBall(dt) {
if (!state.ball.inTransit) {
return;
}
if (state.ball.actionType === "dribble") {
updateDribble(dt);
return;
}
if (state.ball.actionType === "recovery") {
updateLooseBallRecovery(dt);
return;
}
const previousPosition = cloneVector(state.ball.position);
const speedBefore = Math.max(
state.ball.currentSpeed || state.ball.launchSpeed || getActionSpeed(),
0.01
);
const speedAfter = Math.max(
state.ball.finalSpeed,
speedBefore - state.ball.deceleration * dt
);
const moveDistance = Math.max(((speedBefore + speedAfter) * 0.5) * dt, 0);
state.ball.trackDistanceCovered = clamp(
state.ball.trackDistanceCovered + moveDistance,
0,
Math.max(state.ball.trackDistanceTotal, 0)
);
const progress = state.ball.trackDistanceTotal <= 0.01
? 1
: state.ball.trackDistanceCovered / state.ball.trackDistanceTotal;
state.ball.position = getBallTravelPoint(progress);
state.ball.currentSpeed = speedAfter;
state.ball.spinAngle += state.ball.spinRate * dt;
state.ball.elapsedTravelTime += dt;
updateBallFlightHeight();
const transitOutcome =
resolveShotBlockCommitment(previousPosition) ??
resolvePassTransitInterception(previousPosition, state.ball.actionType);
if (transitOutcome) {
const actionLabel = state.ball.actionType === "shot" ? "shot" : "pass";
state.ball.inTransit = false;
if (state.sequence.isPlaying) {
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
state.sequence.phase = null;
state.sequence.actionTargets = null;
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step) {
const afterSnapshot = cloneSnapshot(captureSnapshot());
step.afterSnapshot = afterSnapshot;
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
if (transitOutcome.kind === "block") {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} blocks the ${actionLabel}.`);
} else if (transitOutcome.kind === "interception") {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} intercepts the ${actionLabel}.`);
} else if (transitOutcome.kind === "deflection") {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} gets a touch on the ${actionLabel}.`);
} else {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} meets the ${actionLabel} early.`);
}
queueNextSequenceStep();
return;
}
completeLiveActionPlayersBeforeCommit(state.ball.position);
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
if (transitOutcome.kind === "block") {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} blocks the ${actionLabel}.`);
} else if (transitOutcome.kind === "interception") {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} intercepts the ${actionLabel}.`);
} else if (transitOutcome.kind === "deflection") {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} gets a touch on the ${actionLabel}.`);
} else {
logEvent(`${transitOutcome.player.shortLabel} ${transitOutcome.player.role} meets the ${actionLabel} early.`);
}
scheduleAutoPilotContinuation(null, actionLabel);
return;
}
const goalInfo = detectShotGoal(previousPosition, state.ball.position);
if (goalInfo) {
const saveOutcome = resolveGoalkeeperSave(goalInfo, previousPosition);
if (saveOutcome) {
completeGoalkeeperSave(saveOutcome, state.ball.elapsedTravelTime);
return;
}
completeShotGoal(goalInfo, state.ball.elapsedTravelTime);
return;
}
const shotOutInfo = detectShotOutOfPlay(previousPosition, state.ball.position);
if (shotOutInfo) {
completeShotOutOfPlay(shotOutInfo, state.ball.elapsedTravelTime);
return;
}
const touchlineOutInfo = detectTouchlineOutOfPlay(previousPosition, state.ball.position);
if (touchlineOutInfo) {
completeTouchlineOutOfPlay(touchlineOutInfo, state.ball.elapsedTravelTime);
return;
}
const receiver = state.ball.actionType === "pass" && state.ball.receiverPlayerId
? getPlayerById(state.ball.receiverPlayerId)
: null;
const receiverControlPoint = receiver ? getPlayerBallControlPoint(receiver) : null;
const reachedReceiverControlZone =
!!receiverControlPoint &&
distance(state.ball.position, receiverControlPoint) <= state.ball.controlRadius &&
getBallFlightControlFactor(state.ball.actionType) >= 0.6;
const reachedTravelEnd =
state.ball.trackDistanceTotal > 0 &&
state.ball.trackDistanceCovered >= Math.max(state.ball.trackDistanceTotal - 0.01, 0);
if (distance(state.ball.position, state.ball.target) <= 0.01 || reachedReceiverControlZone || reachedTravelEnd) {
const actionType = state.ball.actionType;
const actionLabel = actionType === "shot" ? "Shot" : actionType === "pass" ? "Pass" : "Ball";
const completedTravelTime = state.ball.elapsedTravelTime;
const completedBallPosition = cloneVector(state.ball.position);
state.ball.position = cloneVector(receiverControlPoint ?? state.ball.target);
if (reachedTravelEnd && actionType === "shot") {
state.ball.position = cloneVector(completedBallPosition);
state.ball.target = cloneVector(completedBallPosition);
}
state.ball.height = 0;
if (shouldTriggerLandingBounce(actionType, reachedReceiverControlZone) && startLandingBounceSkid(previousPosition)) {
return;
}
state.ball.inTransit = false;
if (state.sequence.isPlaying) {
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.sequence.phase = null;
state.sequence.actionTargets = null;
logEvent(`${actionLabel} connects into the next step after ${formatTime(state.ball.elapsedTravelTime)}.`);
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.afterSnapshot) {
applyCommittedSnapshot(step.afterSnapshot);
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
queueNextSequenceStep();
return;
}
completeLiveActionPlayersBeforeCommit(state.ball.position);
settleBallForNextAction(actionType);
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.receiverPlayerId = null;
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(`${actionLabel} connects into the next step after ${formatTime(completedTravelTime)}.`);
scheduleAutoPilotContinuation(null, actionType);
}
}
function updateDribble(dt) {
const carrier = getPlayerById(state.ball.carrierPlayerId);
if (!carrier) {
clearBallAction();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
return;
}
if (!state.ball.dribblePath) {
setDribbleCarryPathForBall(carrier, getActionOrigin(carrier), state.ball.target);
}
const currentCarrySpeed = getLiveDribbleSpeed(carrier, state.ball.target);
const previousPosition = cloneVector(carrier.position);
state.ball.trackDistanceCovered = clamp(
(state.ball.trackDistanceCovered ?? 0) + currentCarrySpeed * dt,
0,
Math.max(state.ball.trackDistanceTotal, 0)
);
carrier.position = getDribbleCarryPathPoint(
state.ball.dribblePath,
state.ball.trackDistanceCovered
);
if (distance(previousPosition, carrier.position) > 0.006) {
rotatePlayerBodyAlongMovement(carrier, previousPosition, carrier.position, 0.56);
} else {
rotatePlayerBodyToward(carrier, state.ball.target, 0.28);
}
state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
state.ball.currentSpeed = currentCarrySpeed;
state.ball.height = 0;
state.ball.elapsedTravelTime += dt;
state.ball.ownerPlayerId = carrier.id;
if (
state.ball.trackDistanceCovered >= Math.max(state.ball.trackDistanceTotal - 0.03, 0) ||
distance(carrier.position, state.ball.target) <= 0.08
) {
const completedTravelTime = state.ball.elapsedTravelTime;
carrier.position = cloneVector(state.ball.target);
state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
state.ball.height = 0;
state.ball.inTransit = false;
completeLiveActionPlayersBeforeCommit(state.ball.position);
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.carrierPlayerId = null;
if (state.sequence.isPlaying) {
state.sequence.phase = null;
state.sequence.actionTargets = null;
logEvent(
`${carrier.shortLabel} ${carrier.role} finishes the dribble after ${formatTime(state.ball.elapsedTravelTime)}.`
);
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.afterSnapshot) {
applyCommittedSnapshot(step.afterSnapshot);
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
queueNextSequenceStep();
return;
}
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(
`${carrier.shortLabel} ${carrier.role} finishes the dribble after ${formatTime(completedTravelTime)}.`
);
scheduleAutoPilotContinuation(null, "dribble");
}
}
function updateLooseBallRecovery(dt) {
const carrier = getPlayerById(state.ball.carrierPlayerId);
if (!carrier) {
clearBallAction();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
return;
}
state.ball.elapsedTravelTime += dt;
state.ball.currentSpeed = 0;
state.ball.height = 0;
state.ball.ownerPlayerId = null;
const recoveryDuration = Math.max(state.ball.recoveryDuration ?? 0, 0.05);
const controlGap = distance(getPlayerBallControlPoint(carrier), state.ball.position);
if (state.ball.elapsedTravelTime < recoveryDuration && controlGap > ballRadiusMeters * 1.1) {
return;
}
completeLiveActionPlayersBeforeCommit(state.ball.position);
applyLooseBallCollectControlTouch(carrier, state.ball.position);
state.ball.inTransit = false;
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = null;
if (state.sequence.isPlaying) {
state.sequence.phase = null;
state.sequence.actionTargets = null;
logEvent(`${carrier.shortLabel} ${carrier.role} collects the loose ball.`);
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.afterSnapshot) {
applyCommittedSnapshot(step.afterSnapshot);
state.sequence.currentFrameIndex = state.sequence.playbackIndex;
}
queueNextSequenceStep();
return;
}
finalizeCurrentActionStep();
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(`${carrier.shortLabel} ${carrier.role} collects the loose ball and can play forward.`);
scheduleAutoPilotContinuation(null, "recovery");
}
function updateActionPlayers(targetMap, actionMeta) {
if (!targetMap || !actionMeta) {
return;
}
const elapsed = state.ball.elapsedTravelTime;
const defensiveFocusPoint = getDefensiveAutopilotFocusPoint(actionMeta);
const offensiveFocusPoint = getOffensiveAutopilotFocusPoint(actionMeta);
const passIncomingPoint =
actionMeta.actionType === "pass"
? actionMeta.beforeSnapshot?.ball?.position ?? state.ball.startPosition
: null;
state.players.forEach((player) => {
if (actionMeta.actionType === "dribble" && player.id === actionMeta.carrierPlayerId) {
return;
}
let targetPosition = targetMap.get(player.id);
if (!targetPosition) {
return;
}
const isPassReceiver = actionMeta.actionType === "pass" && player.id === actionMeta.receiverPlayerId;
const isDefensiveAutopilotRunner = isDefensiveAutopilotPlayer(player, actionMeta);
const isOffensiveAutopilotRunner = isOffensiveAutopilotPlayer(player, actionMeta);
const isDribbleAutopilotPresser = isDefensiveDribblePresser(player, actionMeta);
if (isDribbleAutopilotPresser) {
targetPosition = getLiveDefensiveDribblePressTarget(player, actionMeta, targetPosition);
}
if (isDefensiveAutopilotRunner) {
const intent = getDefensiveAutoV2Intent(player, actionMeta, targetPosition);
moveDefensiveAutoV2Player(
player,
targetPosition,
actionMeta,
intent,
elapsed,
state.ball.inTransit ? state.ball.position : defensiveFocusPoint
);
return;
}
if (isOffensiveAutopilotRunner && !isPassReceiver) {
const intent = getOffensiveAutoV2Intent(player, actionMeta, targetPosition);
moveOffensiveAutoV2Player(
player,
targetPosition,
actionMeta,
intent,
elapsed,
state.ball.inTransit ? state.ball.position : offensiveFocusPoint
);
return;
}
const origin = getActionOrigin(player);
const movementPath = isPassReceiver
? { start: origin, end: targetPosition, waypoint: null, totalDistance: distance(origin, targetPosition) }
: buildMovementPath(player, origin, targetPosition, actionMeta);
const fullDistance = movementPath.totalDistance;
if (fullDistance <= 0.001) {
player.position = cloneVector(targetPosition);
if (isPassReceiver) {
applyBestReceiveBodyAngle(player, passIncomingPoint, 0.22);
} else if (isOffensiveAutopilotRunner && offensiveFocusPoint) {
rotatePlayerBodyToward(player, state.ball.inTransit ? state.ball.position : offensiveFocusPoint, 0.82);
} else if (isDefensiveAutopilotRunner && defensiveFocusPoint) {
rotatePlayerBodyToward(player, defensiveFocusPoint, 0.92);
}
return;
}
const previousPosition = cloneVector(player.position);
const reachableDistance = Math.min(
fullDistance,
computeReachDistance(player, elapsed, targetPosition)
);
const nextProgress = Math.max(player.movementProgress ?? 0, reachableDistance);
player.movementProgress = nextProgress;
player.position = getMovementPathPoint(movementPath, nextProgress);
const movementDistance = distance(previousPosition, player.position);
const hasArrived = nextProgress >= fullDistance - 0.02 || distance(player.position, targetPosition) <= 0.08;
if (isPassReceiver) {
applyBestReceiveBodyAngle(player, passIncomingPoint, 0.2);
} else if (isDribbleAutopilotPresser) {
rotatePlayerBodyToward(player, state.ball.position, 0.72);
} else if (isOffensiveAutopilotRunner && offensiveFocusPoint && hasArrived) {
rotatePlayerBodyToward(player, state.ball.inTransit ? state.ball.position : offensiveFocusPoint, 0.78);
} else if (isDefensiveAutopilotRunner && defensiveFocusPoint && hasArrived) {
rotatePlayerBodyToward(player, defensiveFocusPoint, 0.9);
} else if (movementDistance > 0.006) {
rotatePlayerBodyAlongMovement(player, previousPosition, player.position, 0.42);
} else if (distance(player.position, targetPosition) > 0.02) {
rotatePlayerBodyTowardAngle(
player,
angleBetween(player.position, targetPosition),
0.18,
0.08
);
}
});
}
function updateSequenceActionPlayers() {
if (!state.sequence.isPlaying || state.sequence.phase !== "action") {
return;
}
const step = state.sequence.steps[state.sequence.playbackIndex];
if (!step || !state.sequence.actionTargets) {
return;
}
updateActionPlayers(state.sequence.actionTargets, step);
}
function updateLiveActionPlayers() {
if (!state.isRunning || !state.activeActionTargets || !state.draftStep) {
return;
}
updateActionPlayers(state.activeActionTargets, state.draftStep);
}
function updateSequenceTransition(dt) {
const plan = state.sequence.transition;
if (!plan) {
return;
}
plan.elapsed = Math.min(plan.elapsed + dt, plan.duration);
state.players.forEach((player) => {
const target = plan.playerTargets.get(player.id);
if (!target) {
return;
}
const fullDistance = distance(target.start, target.end);
const movementPath = buildMovementPath(player, target.start, target.end);
if (movementPath.totalDistance <= 0.001) {
player.position = cloneVector(target.end);
player.movementProgress = 0;
return;
}
const reachableDistance = Math.min(
movementPath.totalDistance,
computeReachDistance(player, plan.elapsed, target.end)
);
const nextProgress = Math.max(player.movementProgress ?? 0, reachableDistance);
player.movementProgress = nextProgress;
player.position = getMovementPathPoint(movementPath, nextProgress);
if (distance(player.position, target.end) > 0.02) {
rotatePlayerBodyToward(player, target.end, 0.28);
}
});
if (plan.ballOwnerPlayerId) {
const owner = getPlayerById(plan.ballOwnerPlayerId);
if (owner) {
state.ball.ownerPlayerId = owner.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(owner));
}
} else {
const fullDistance = distance(plan.ballStart, plan.ballEnd);
const progress =
plan.duration <= 0.001 ? 1 : Math.min(1, plan.elapsed / plan.duration);
state.ball.ownerPlayerId = null;
state.ball.position = moveTowards(plan.ballStart, plan.ballEnd, fullDistance * progress);
}
state.ball.startPosition = cloneVector(state.ball.position);
state.ball.target = cloneVector(state.ball.position);
state.ball.inTransit = false;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = null;
state.ball.initiatorPlayerId = null;
state.ball.carrierPlayerId = null;
if (plan.elapsed >= plan.duration - 0.0001) {
applySnapshot(plan.targetSnapshot);
state.sequence.transition = null;
state.sequence.phase = null;
const nextStep = state.sequence.steps[state.sequence.playbackIndex];
if (nextStep) {
startRecordedAction(nextStep);
logEvent(`Playing ${describeStep(nextStep, state.sequence.playbackIndex).title.toLowerCase()}.`);
} else {
finishSequencePlayback();
}
}
}
function stepSimulation(realDt) {
const dt = realDt * state.playbackSpeed;
if (state.sequence.isPlaying && state.sequence.phase === "transition") {
state.time += dt;
updateSequenceTransition(dt);
return;
}
if (!state.ball.inTransit) {
return;
}
state.time += dt;
updateBall(dt);
if (state.sequence.isPlaying && state.sequence.phase === "action") {
updateSequenceActionPlayers();
resolveDribbleDefensiveChallenge();
return;
}
if (state.isRunning && state.activeActionTargets) {
updateLiveActionPlayers();
resolveDribbleDefensiveChallenge();
}
}
function getBallStatus() {
if (state.sequence.isPlaying && state.sequence.phase === "transition") {
return state.isRunning ? "Transition" : "Transition Paused";
}
if (state.isRunning && state.ball.inTransit) {
return "In Motion";
}
if (!state.isRunning && state.ball.inTransit && state.ball.elapsedTravelTime > 0) {
return "Paused";
}
if (hasBallAction()) {
return "Planned";
}
return "Still";
}
function getActionTypeLabel() {
if (state.sequence.isPlaying && state.sequence.phase === "transition") {
return "Transition";
}
if (state.ball.actionType === "pass") {
return "Pass";
}
if (state.ball.actionType === "dribble") {
return "Dribble";
}
if (state.ball.actionType === "shot") {
return "Shot";
}
if (state.ball.actionType === "recovery") {
return "Loose Ball";
}
const requestedMode = getRequestedActionMode();
if (requestedMode === "dribble") {
return "Dribble Selected";
}
if (requestedMode === "shot") {
return "Shot Selected";
}
if (requestedMode === "pass") {
return "Pass Selected";
}
return "Free Move";
}
function describeStep(step, index) {
const target = `x ${step.target.x.toFixed(1)}, y ${step.target.y.toFixed(1)}`;
const profileText = step.profileLabel ? `${step.profileLabel} • ` : "";
const restartPrefix = step.restartPhase?.type
? `${setPiecePhaseProfiles[step.restartPhase.type]?.label ?? "Restart"} `
: "";
if (step.nextRestartPhase?.type === "penalty") {
const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Attacking team";
return {
title: `Step ${index + 1}: Penalty Won`,
meta: `${profileText}Foul in the box. Next restart: ${restartTeam} penalty`,
};
}
if (step.nextRestartPhase?.type === "freeKick") {
const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Attacking team";
return {
title: `Step ${index + 1}: Foul`,
meta: `${profileText}Next restart: ${restartTeam} free-kick`,
};
}
if (step.nextRestartPhase?.type === "throwIn") {
const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Restart team";
return {
title: `Step ${index + 1}: Ball Out`,
meta: `${profileText}Next restart: ${restartTeam} throw-in`,
};
}
if (step.actionType === "recovery") {
const carrier = step.carrierPlayerId
? getPlayerById(step.carrierPlayerId)?.shortLabel ?? step.carrierPlayerId
: "player";
return {
title: `Step ${index + 1}: ${restartPrefix}Loose Ball Recovery`,
meta: `${profileText}${carrier} collects the loose ball`,
};
}
if (step.actionType === "dribble") {
const carrier = step.carrierPlayerId
? getPlayerById(step.carrierPlayerId)?.shortLabel ?? step.carrierPlayerId
: "player";
return {
title: `Step ${index + 1}: ${restartPrefix}Dribble`,
meta: `${profileText}${carrier} to ${target}`,
};
}
if (step.actionType === "shot") {
if (step.goal) {
const scoringTeam = teams[step.goal.scoringTeamId]?.name ?? "Team";
const concedingTeam = teams[step.goal.concedingTeamId]?.name ?? "Opponent";
return {
title: `Step ${index + 1}: Goal`,
meta: `${profileText}${scoringTeam} score. Next restart: ${concedingTeam} kick-off`,
};
}
if (step.nextRestartPhase?.type === "corner") {
const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Attacking team";
return {
title: `Step ${index + 1}: Shot Saved`,
meta: `${profileText}Turned behind. Next restart: ${restartTeam} corner`,
};
}
if (step.nextRestartPhase?.type === "goalKick") {
const restartTeam = teams[step.nextRestartPhase.teamId]?.name ?? "Defending team";
return {
title: `Step ${index + 1}: Shot Wide`,
meta: `${profileText}Missed target. Next restart: ${restartTeam} goal-kick`,
};
}
return {
title: `Step ${index + 1}: ${restartPrefix}Shot`,
meta: `${profileText}To ${target}`,
};
}
if (step.receiverPlayerId) {
const receiver = getPlayerById(step.receiverPlayerId)?.shortLabel ?? step.receiverPlayerId;
const firstTouchText = step.firstTouchMode
? ` • First Touch: ${getFirstTouchModeLabel(step.firstTouchMode)}`
: "";
return {
title: `Step ${index + 1}: ${restartPrefix}Pass`,
meta: `${profileText}To ${receiver}${firstTouchText}`,
};
}
return {
title: `Step ${index + 1}: ${restartPrefix}Pass`,
meta: `${profileText}To ${target}`,
};
}
function getSequenceStartSnapshot() {
if (state.sequence.initialSnapshot) {
return cloneSnapshot(state.sequence.initialSnapshot);
}
if (state.sequence.steps[0]?.beforeSnapshot) {
return cloneSnapshot(state.sequence.steps[0].beforeSnapshot);
}
return cloneSnapshot(captureSnapshot());
}
function getSequenceFrameSnapshot(frameIndex) {
if (frameIndex < 0) {
return getSequenceStartSnapshot();
}
const step = state.sequence.steps[frameIndex];
if (!step) {
return getSequenceStartSnapshot();
}
return cloneSnapshot(getRecordedStepEndSnapshot(step));
}
function persistCurrentFrameSnapshot(snapshot = captureSnapshot()) {
const normalizedSnapshot = cloneSnapshot(snapshot);
if (state.sequence.steps.length && !state.sequence.isPlaying) {
markSequenceDirty();
}
if (state.sequence.currentFrameIndex < 0) {
state.sequence.initialSnapshot = normalizedSnapshot;
if (state.sequence.steps[0]) {
state.sequence.steps[0].beforeSnapshot = cloneSnapshot(normalizedSnapshot);
}
return;
}
const currentStep = state.sequence.steps[state.sequence.currentFrameIndex];
if (currentStep) {
currentStep.afterSnapshot = cloneSnapshot(normalizedSnapshot);
}
const nextStep = state.sequence.steps[state.sequence.currentFrameIndex + 1];
if (nextStep) {
nextStep.beforeSnapshot = cloneSnapshot(normalizedSnapshot);
}
}
function finalizeCurrentActionStep() {
if (!state.draftStep) {
clearBallAction();
return;
}
const beforeSnapshot = cloneSnapshot(state.draftStep.beforeSnapshot);
persistCurrentFrameSnapshot(beforeSnapshot);
if (state.sequence.currentFrameIndex < state.sequence.steps.length - 1) {
state.sequence.steps = state.sequence.steps.slice(0, state.sequence.currentFrameIndex + 1);
}
if (!state.sequence.initialSnapshot) {
state.sequence.initialSnapshot = cloneSnapshot(beforeSnapshot);
}
const goalEvent = cloneGoalEvent(state.draftStep.goal);
const nextRestartPhase = cloneRestartPhase(state.draftStep.nextRestartPhase);
const afterSnapshot = createCommittedSnapshotFromCurrentState();
if (goalEvent?.concedingTeamId) {
applyKickoffSetup(afterSnapshot, {
teamId: goalEvent.concedingTeamId,
resetFormations: false,
});
} else if (nextRestartPhase?.type === "goalKick" && nextRestartPhase.teamId) {
applyGoalKickSetup(afterSnapshot, {
teamId: nextRestartPhase.teamId,
resetFormations: false,
});
} else if (nextRestartPhase?.type === "corner" && nextRestartPhase.teamId) {
applyCornerSetup(afterSnapshot, {
teamId: nextRestartPhase.teamId,
sideY: Number.isFinite(nextRestartPhase.sideY) ? nextRestartPhase.sideY : state.ball.position.y,
resetFormations: false,
});
} else if (nextRestartPhase?.type === "throwIn" && nextRestartPhase.teamId) {
applyThrowInSetup(afterSnapshot, {
teamId: nextRestartPhase.teamId,
point: nextRestartPhase.point ?? state.ball.position,
sideY: Number.isFinite(nextRestartPhase.sideY) ? nextRestartPhase.sideY : state.ball.position.y,
resetFormations: false,
});
} else if (nextRestartPhase?.type === "freeKick" && nextRestartPhase.teamId) {
applyFreeKickSetup(afterSnapshot, {
teamId: nextRestartPhase.teamId,
point: nextRestartPhase.point ?? state.ball.position,
resetFormations: false,
});
} else if (nextRestartPhase?.type === "penalty" && nextRestartPhase.teamId) {
applyPenaltySetup(afterSnapshot, {
teamId: nextRestartPhase.teamId,
resetFormations: false,
});
} else if (state.restartPhase) {
afterSnapshot.matchPhase = "inPossession";
afterSnapshot.restartPhase = null;
}
const completedStep = {
id: `step-${Date.now()}-${state.sequence.steps.length}`,
matchPhase: state.matchPhase ?? null,
restartPhase: cloneRestartPhase(state.restartPhase),
actionType: state.draftStep.actionType,
autoGenerated: !!state.draftStep.autoGenerated,
autoPrinciples: [...(state.draftStep.autoPrinciples ?? [])],
target: cloneVector(state.draftStep.target),
speed: state.draftStep.speed,
speedMode: state.draftStep.speedMode ?? state.ball.profileMode ?? state.ballSpeedMode,
profileKey: state.draftStep.profileKey ?? state.ball.profileKey ?? null,
profileLabel: state.draftStep.profileLabel ?? state.ball.profileLabel ?? null,
targetKind: state.draftStep.targetKind ?? state.ball.targetKind ?? null,
intendedTarget: state.draftStep.intendedTarget
? cloneVector(state.draftStep.intendedTarget)
: null,
shotPlacement: cloneShotPlacement(state.draftStep.shotPlacement),
nextRestartPhase,
goal: goalEvent,
recoveryDuration: state.draftStep.recoveryDuration ?? state.ball.recoveryDuration ?? 0,
firstTouchMode: state.draftStep.firstTouchMode ?? state.ball.firstTouchMode ?? "auto",
carrierPlayerId: state.draftStep.carrierPlayerId ?? null,
receiverPlayerId: state.draftStep.receiverPlayerId ?? null,
defensiveAutopilot: state.draftStep.defensiveAutopilot
? {
teamId: state.draftStep.defensiveAutopilot.teamId,
ballFocusPoint: cloneVector(state.draftStep.defensiveAutopilot.ballFocusPoint ?? state.draftStep.target),
presserPlayerId: state.draftStep.defensiveAutopilot.presserPlayerId ?? null,
phaseKey: state.draftStep.defensiveAutopilot.phaseKey ?? null,
phaseLabel: state.draftStep.defensiveAutopilot.phaseLabel ?? null,
behaviorVersion: state.draftStep.defensiveAutopilot.behaviorVersion ?? null,
intents: cloneDefensiveAutopilotIntents(state.draftStep.defensiveAutopilot.intents),
}
: null,
offensiveAutopilot: state.draftStep.offensiveAutopilot
? {
teamId: state.draftStep.offensiveAutopilot.teamId,
ballFocusPoint: cloneVector(state.draftStep.offensiveAutopilot.ballFocusPoint ?? state.draftStep.target),
runnerPlayerId: state.draftStep.offensiveAutopilot.runnerPlayerId ?? null,
phaseKey: state.draftStep.offensiveAutopilot.phaseKey ?? null,
phaseLabel: state.draftStep.offensiveAutopilot.phaseLabel ?? null,
principleKey: state.draftStep.offensiveAutopilot.principleKey ?? null,
principleLabel: state.draftStep.offensiveAutopilot.principleLabel ?? null,
behaviorVersion: state.draftStep.offensiveAutopilot.behaviorVersion ?? null,
intents: cloneOffensiveAutopilotIntents(state.draftStep.offensiveAutopilot.intents),
triggers: cloneAutoV2DecisionTriggers(state.draftStep.offensiveAutopilot.triggers),
}
: null,
beforeSnapshot,
afterSnapshot,
};
state.sequence.steps.push(completedStep);
state.sequence.currentFrameIndex = state.sequence.steps.length - 1;
markSequenceDirty();
clearBallAction();
applyCommittedSnapshot(afterSnapshot);
if (completedStep.restartPhase && !completedStep.goal && !completedStep.nextRestartPhase) {
state.matchPhase = "inPossession";
state.restartPhase = null;
}
const description = describeStep(completedStep, state.sequence.currentFrameIndex);
logEvent(`${description.title} was saved automatically.`);
}

  return {
    getAutoPilotRoleStrength,
    getAutoPilotPossessionPlayer,
    getLooseBallRecoveryTarget,
    getSecondBallReactionAdjustment,
    getLooseBallRecoveryStructureAdjustment,
    getLooseBallNearestOpponent,
    getLooseBallCollectControlTouch,
    applyLooseBallCollectControlTouch,
    chooseAutoPilotLooseBallRecovery,
    issueLooseBallRecoveryCommand,
    describeAutoPilotChoice,
    planAutoPilotNextAction,
    cancelAutoPilotContinuation,
    pauseAutoPilotPlay,
    getAutoPilotContinuationContext,
    getAutoPilotContinuationDelay,
    scheduleAutoPilotContinuation,
    refreshPlannedBallActionProfile,
    clearBallAction,
    setBallOwner,
    issuePassLikeCommand,
    issuePassCommand,
    issueShotCommand,
    issueDribbleCommand,
    issueBallCommand,
    detectShotGoal,
    detectShotOutOfPlay,
    detectTouchlineOutOfPlay,
    getGoalkeeperForTeam,
    getPreferredParrySafetyPlayer,
    getGoalkeeperParryProfile,
    resolveGoalkeeperSave,
    registerGoalFlash,
    completeGoalkeeperSave,
    completeShotGoal,
    completeShotOutOfPlay,
    completeTouchlineOutOfPlay,
    updateBall,
    updateDribble,
    updateLooseBallRecovery,
    updateActionPlayers,
    updateSequenceActionPlayers,
    updateLiveActionPlayers,
    updateSequenceTransition,
    stepSimulation,
    getBallStatus,
    getActionTypeLabel,
    describeStep,
    getSequenceStartSnapshot,
    getSequenceFrameSnapshot,
    persistCurrentFrameSnapshot,
    finalizeCurrentActionStep,
  };
}
