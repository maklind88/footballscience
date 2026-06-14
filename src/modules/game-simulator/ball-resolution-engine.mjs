import { createGameSimulatorBallResolutionAerialContest } from "./ball-resolution-aerial-contest.mjs";
import { createGameSimulatorBallResolutionDribbleChallenges } from "./ball-resolution-dribble-challenges.mjs";
import { createGameSimulatorBallResolutionLandingBounce } from "./ball-resolution-landing-bounce.mjs";
import { createGameSimulatorBallResolutionLooseBall } from "./ball-resolution-loose-ball.mjs";
import { createGameSimulatorBallResolutionSecurePossession } from "./ball-resolution-secure-possession.mjs";
import { createGameSimulatorBallResolutionShotRebounds } from "./ball-resolution-shot-rebounds.mjs";
export function createGameSimulatorBallResolutionEngine(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    applyCommittedSnapshot,
    applyControlledFirstTouch,
    blendAngles,
    captureSnapshot,
    clamp,
    clampToPitch,
    clearAutoPilotReceiveMomentum,
    cloneSnapshot,
    cloneVector,
    completeLiveActionPlayersBeforeCommit,
    computePassLaneClarity,
    computeShotLaneClarity,
    computeTimeToCoverDistance,
    configureBallTravelProfile,
    distance,
    finalizeCurrentActionStep,
    formatTime,
    getActionInitiator,
    getAttackDirectionSign,
    getAutoPilotRoleStrength,
    getBallFlightControlFactor,
    getBallTravelProgress,
    getCoverShadowInfluence,
    getDefensiveAggressionPreset,
    getDistanceFromOwnGoal,
    getFirstTouchModeLabel,
    getFootUsageScore,
    getLiveDribbleSpeed,
    getNearestOpponentGap,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOrientationMovementProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchSurfacePreset,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPositionForControlPoint,
    getPlayerPressureLoad,
    getReceiveFootUsageScore,
    getReceiveOrientationScore,
    getShotWindowProfile,
    getTeamAttackAngle,
    getTeamAttackStyleKey,
    getWeatherPreset,
    isAerialFlightStyle,
    isGoalkeeper,
    isInsideOpponentBox,
    isInsideOwnBox,
    isTransitionAttackStyle,
    lerp,
    logEvent,
    normalize,
    normalizeAngle,
    pitch,
    placePlayerWithControlPoint,
    playerRadiusMeters,
    projectPointOnSegment,
    projectPointOnSegmentWithRatio,
    queueNextSequenceStep,
    rotatePlayerBodyToward,
    scheduleAutoPilotContinuation,
    setPiecePhaseProfiles,
    shouldUseAutoPilotActiveFirstTouch,
    teams,
    ui,
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

function applyBallExecutionProfile(actionType, initiator, target, ballProfile = null) {
const laneClarity =
actionType === "pass"
? computePassLaneClarity(initiator, target)
: actionType === "shot"
? computeShotLaneClarity(initiator, target)
: 0.84;
const context = initiator ? getPlayerDecisionContext(initiator) : null;
const footExecutionScore =
initiator && target
? getFootUsageScore(initiator, angleBetween(initiator.position, target))
: 0.84;
const shotWindow =
actionType === "shot" && initiator
? getShotWindowProfile(initiator, getPlayerBallControlPoint(initiator), target)
: null;
const executionQuality = clamp(
initiator && context
? (actionType === "shot"
? 0.22 * context.profile.decisionQuality +
0.28 * context.profile.technicalSecurity +
0.2 * context.profile.executionUnderPressure +
0.12 * context.profile.composure +
0.08 * footExecutionScore +
0.12 * laneClarity +
0.12 * (shotWindow?.angleQuality ?? 0.42) +
0.08 * (shotWindow?.goalkeeperOpenness ?? 0.5) -
context.pressure * 0.12 -
(shotWindow?.blockRisk ?? 0) * 0.08
: 0.26 * context.profile.decisionQuality +
0.32 * context.profile.technicalSecurity +
0.24 * context.profile.executionUnderPressure +
0.1 * context.profile.composure +
0.06 * footExecutionScore +
0.08 * laneClarity -
context.pressure * 0.08)
: 0.76,
0.42,
0.98
);
const targetKind = ballProfile?.targetKind ?? null;
const claimBase = targetKind === "into-space" ? 2.15 : 1.8;
const claimCeiling = targetKind === "into-space"
? actionType === "shot" ? 6 : 5.2
: actionType === "shot" ? 5.8 : 4.8;
const claimRadius = clamp(
claimBase + (1 - executionQuality) * (actionType === "shot" ? 4.2 : 3.2),
1.6,
claimCeiling
);
const controlBase = targetKind === "to-feet" ? 0.82 : 0.68;
const controlRadius = clamp(
controlBase + executionQuality * 1.4 + laneClarity * 0.55,
0.8,
targetKind === "to-feet" ? 2.3 : 2.55
);
state.ball.laneClarity = laneClarity;
state.ball.executionQuality = executionQuality;
state.ball.claimRadius = claimRadius;
state.ball.controlRadius = controlRadius;
}
const {
  getShotReboundClaimContext,
  getShotReboundClaimAdjustment,
} = createGameSimulatorBallResolutionShotRebounds({
  clamp,
  distance,
  getActionInitiator,
  getOrientationMovementProfile,
  getOtherTeamId,
  getPitchThreatProfile,
  getPlannedPossessionTeamId,
  getPlayerById,
  getPlayerDecisionContext,
  getPlayerMagnetLabel,
  getTeamAttackAngle,
  isGoalkeeper,
  isInsideOpponentBox,
  isInsideOwnBox,
  pitch,
  state,
});
const {
  getAerialPresence,
  getAerialContestScore,
  getAerialFirstContactContext,
  getAerialFirstContactScore,
  getAerialDefensiveClearanceAngle,
  getAerialAttackingKnockdownAngle,
  getAerialControlScore,
} = createGameSimulatorBallResolutionAerialContest({
  angleBetween,
  angleDifference,
  blendAngles,
  clamp,
  computeTimeToCoverDistance,
  distance,
  getActionInitiator,
  getOffensiveRoleKey,
  getOpponentGoalCenter,
  getOpponentPenaltySpot,
  getOrientationMovementProfile,
  getOtherTeamId,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerDecisionContext,
  getPlayerFacingAngle,
  getPlayerMagnetLabel,
  getReceiveFootUsageScore,
  getReceiveOrientationScore,
  getTeamAttackAngle,
  isGoalkeeper,
  isInsideOpponentBox,
  isInsideOwnBox,
  lerp,
  normalizeAngle,
  pitch,
  state,
  teams,
});
const {
  clearSecurePossession,
  getBallWinEscapeTouch,
  applyBallWinEscapeTouch,
  setSecurePossessionAfterBallWin,
  getPossessionShieldOpponents,
  setSecurePossessionAfterControlledTouch,
  keepSecurePossessionOnlyForOwner,
  getSecurePossessionContext,
} = createGameSimulatorBallResolutionSecurePossession({
  angleBetween,
  clamp,
  clampToPitch,
  cloneVector,
  distance,
  getAttackDirectionSign,
  getOffensiveRoleKey,
  getPlayerBallControlPoint,
  getPlayerDecisionContext,
  getPlayerPositionForControlPoint,
  getPlayerPressureLoad,
  getTeamAttackStyleKey,
  isGoalkeeper,
  isTransitionAttackStyle,
  lerp,
  normalize,
  pitch,
  state,
  teams,
});
const {
  getLooseBallClaimScore,
  getBallContestControlScore,
  getBallDuelScore,
  resolveLooseBallClaim,
  connectBallToPlayerForNextAction,
  applyShotReboundControlTouch,
  keepBallPlayableForNextAction,
  createLooseBallSpill,
} = createGameSimulatorBallResolutionLooseBall({
  angleBetween,
  blendAngles,
  clamp,
  clampToPitch,
  clearAutoPilotReceiveMomentum,
  clearSecurePossession,
  cloneVector,
  computeTimeToCoverDistance,
  distance,
  getActionInitiator,
  getAutoPilotRoleStrength,
  getOpponentGoalCenter,
  getOpponentPenaltySpot,
  getOffensiveRoleKey,
  getOrientationMovementProfile,
  getOtherTeamId,
  getPlayerBallControlPoint,
  getPlayerById,
  getPlayerDecisionContext,
  getPlayerMagnetLabel,
  getPlayerPressureLoad,
  getShotReboundClaimAdjustment,
  getShotReboundClaimContext,
  getTeamAttackAngle,
  isGoalkeeper,
  isInsideOpponentBox,
  keepSecurePossessionOnlyForOwner,
  lerp,
  normalizeAngle,
  pitch,
  placePlayerWithControlPoint,
  rotatePlayerBodyToward,
  setSecurePossessionAfterControlledTouch,
  state,
  teams,
});
const {
  getDribbleTackleCandidate,
  getDribbleFoulCandidate,
  completeDribbleFoulRestart,
  resolveDribbleDefensiveChallenge,
} = createGameSimulatorBallResolutionDribbleChallenges({
  angleBetween,
  applyCommittedSnapshot,
  captureSnapshot,
  clamp,
  cloneSnapshot,
  cloneVector,
  completeLiveActionPlayersBeforeCommit,
  computeTimeToCoverDistance,
  connectBallToPlayerForNextAction,
  distance,
  finalizeCurrentActionStep,
  formatTime,
  getBallDuelScore,
  getBallTravelProgress,
  getDefensiveAggressionPreset,
  getLiveDribbleSpeed,
  getPlayerById,
  getPlayerDecisionContext,
  getSecurePossessionContext,
  isGoalkeeper,
  isInsideOpponentBox,
  logEvent,
  normalizeAngle,
  playerRadiusMeters,
  projectPointOnSegmentWithRatio,
  queueNextSequenceStep,
  scheduleAutoPilotContinuation,
  setPiecePhaseProfiles,
  clearSecurePossession,
  setSecurePossessionAfterBallWin,
  state,
  teams,
  ui,
});
function resolveShotBlockCommitment(previousPosition) {
if (state.ball.actionType !== "shot") {
return null;
}
const shooter =
getActionInitiator() ??
getPlayerById(state.ball.initiatorPlayerId) ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId);
const shotStart = state.ball.startPosition ?? previousPosition;
const shotTarget = state.ball.target;
if (!shooter || !shotStart || !shotTarget) {
return null;
}
const trackTotal = Math.max(state.ball.trackDistanceTotal || distance(shotStart, shotTarget), 0.01);
const currentProgress = getBallTravelProgress();
const previousProgress = clamp(
projectPointOnSegmentWithRatio(previousPosition, shotStart, shotTarget).ratio,
0,
1
);
const ballSpeed = Math.max(state.ball.currentSpeed || state.ball.launchSpeed || state.ball.speed || 14, 0.1);
const lowShotFactor = clamp(1 - (state.ball.height ?? 0) / 1.45, 0.18, 1);
const shotAngle = angleBetween(shotStart, shotTarget);
const attackingTeamId = shooter.team;
let bestBlock = null;
state.players.forEach((player) => {
if (player.team === attackingTeamId || player.id === shooter.id || isGoalkeeper(player)) {
return;
}
const projection = projectPointOnSegmentWithRatio(player.position, shotStart, shotTarget);
if (projection.ratio <= 0.07 || projection.ratio >= 0.92) {
return;
}
const ownGoalDistance = getDistanceFromOwnGoal(player.team, projection.point);
const boxUrgency =
ownGoalDistance <= 24 || isInsideOwnBox(projection.point, player.team) ? 0.2 : ownGoalDistance <= 34 ? 0.1 : 0;
const readAheadWindow = 0.035 + player.intelligenceProfile.perception * 0.035 + boxUrgency * 0.08;
if (projection.ratio < previousProgress - 0.055 || projection.ratio > currentProgress + readAheadWindow) {
return;
}
const laneGap = distance(player.position, projection.point);
const coverInfluence = getCoverShadowInfluence(player, projection.point, shotStart);
const bodyAlignment = clamp(1 - Math.abs(angleDifference(getPlayerFacingAngle(player), shotAngle + Math.PI)) / Math.PI, 0, 1);
const blockReach = clamp(
(0.72 +
player.intelligenceProfile.perception * 0.34 +
player.intelligenceProfile.decisionSpeed * 0.22 +
player.intelligenceProfile.tacticalDiscipline * 0.2 +
coverInfluence * 0.28 +
bodyAlignment * 0.18) *
lowShotFactor,
0.72,
2.35
);
const remainingDistanceToLane = Math.max((projection.ratio - currentProgress) * trackTotal, 0);
const ballTimeToLane = remainingDistanceToLane / ballSpeed;
const reactionDelay = Math.max(
player.reactionTime *
(0.5 - player.intelligenceProfile.perception * 0.14 - player.intelligenceProfile.decisionSpeed * 0.1),
0.04
);
const moveNeed = Math.max(laneGap - blockReach * 0.72, 0);
const defenderTimeToLane = computeTimeToCoverDistance(player, moveNeed, projection.point) + reactionDelay;
const canReachLane = laneGap <= blockReach || defenderTimeToLane <= ballTimeToLane + 0.16 + boxUrgency * 0.12;
if (!canReachLane) {
return;
}
const proximity = clamp(1 - laneGap / Math.max(blockReach + 0.9, 0.01), 0, 1);
const timing = clamp((ballTimeToLane - defenderTimeToLane + 0.28) / 0.72, 0, 1);
const shotPressure = clamp((ballSpeed - 11) / 15, 0, 1);
const score =
proximity * 0.34 +
timing * 0.2 +
coverInfluence * 0.16 +
bodyAlignment * 0.12 +
player.intelligenceProfile.tacticalDiscipline * 0.12 +
player.intelligenceProfile.composure * 0.08 +
boxUrgency -
shotPressure * 0.06;
const threshold = clamp(0.58 - boxUrgency * 0.32 + (1 - lowShotFactor) * 0.14, 0.42, 0.68);
if (score < threshold) {
return;
}
const candidate = {
player,
point: projection.point,
score,
proximity,
timing,
controlScore: clamp(
proximity * 0.42 +
timing * 0.2 +
player.intelligenceProfile.technicalSecurity * 0.14 +
player.intelligenceProfile.composure * 0.12 +
coverInfluence * 0.12,
0,
1
),
};
if (!bestBlock || candidate.score > bestBlock.score) {
bestBlock = candidate;
}
});
if (!bestBlock) {
return null;
}
rotatePlayerBodyToward(bestBlock.player, bestBlock.point, 0.72);
const ownGoal = getOwnGoalCenter(bestBlock.player.team);
const awayFromGoalAngle = angleBetween(ownGoal, bestBlock.point);
const sideSign = Math.sign(bestBlock.player.position.y - pitch.width / 2) || 1;
const ricochetAngle = normalizeAngle(
awayFromGoalAngle * 0.55 +
(shotAngle + sideSign * lerp(0.42, 1.12, 1 - bestBlock.controlScore)) * 0.45
);
const spillDistance = clamp(
1.2 + clamp((ballSpeed - 10) / 16, 0, 1) * 4.2 + (1 - bestBlock.controlScore) * 1.2,
1.1,
6.9
);
const spill = createLooseBallSpill(
bestBlock.point,
ricochetAngle,
spillDistance,
bestBlock.player.id,
0.08 + bestBlock.controlScore * 0.06,
{
source: "shot-body-block",
reboundType: "shot-block",
attackingTeamId,
defendingTeamId: bestBlock.player.team,
urgency: clamp(0.58 + bestBlock.score * 0.28, 0.58, 0.9),
}
);
if (spill.winner && spill.winner.team !== attackingTeamId) {
setSecurePossessionAfterBallWin(spill.winner, shooter, spill.spillPoint, "interception");
}
return {
kind: "block",
player: bestBlock.player,
point: spill.spillPoint,
winner: spill.winner,
};
}
function resolvePassTransitInterception(previousPosition, actionType) {
if (actionType !== "pass" && actionType !== "shot") {
return null;
}
const initiator = getActionInitiator();
const passTeamId =
actionType === "pass"
? initiator?.team ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId)?.team ??
getPlayerById(state.ball.initiatorPlayerId)?.team ??
null
: null;
const flightControlFactor = getBallFlightControlFactor(actionType);
if (actionType === "pass" && flightControlFactor <= 0.06) {
return null;
}
const receiver = actionType === "pass" && state.ball.receiverPlayerId
? getPlayerById(state.ball.receiverPlayerId)
: null;
const receiverControlPoint = receiver ? getPlayerBallControlPoint(receiver) : null;
const passProgress = getBallTravelProgress();
const candidates = [];
state.players.forEach((player) => {
if (player.id === initiator?.id) {
return;
}
if (actionType === "pass" && passTeamId && player.team === passTeamId) {
return;
}
const lanePoint = projectPointOnSegment(player.position, previousPosition, state.ball.position);
const isPassToFeet = actionType === "pass" && state.ball.targetKind === "to-feet";
if (
isPassToFeet &&
receiverControlPoint &&
passProgress >= 0.7 &&
distance(lanePoint, receiverControlPoint) <= state.ball.controlRadius + 0.95
) {
return;
}
const gap = distance(player.position, lanePoint);
const interceptRadius = clamp(
(0.55 +
player.intelligenceProfile.perception * 0.55 +
player.intelligenceProfile.technicalSecurity * 0.35 +
getCoverShadowInfluence(player, lanePoint, previousPosition) * 0.24) *
(actionType === "shot"
? lerp(0.74, 1, flightControlFactor)
: isPassToFeet
? lerp(0.16, 0.86, flightControlFactor)
: lerp(0.22, 1, flightControlFactor)),
0.75,
isPassToFeet ? 1.38 : 1.65
);
const secureContext = getSecurePossessionContext(initiator, player);
const secureProtection = secureContext?.protectionRatio ?? 0;
const adjustedInterceptRadius = interceptRadius * (1 - secureProtection * 0.32);
if (gap > adjustedInterceptRadius) {
return;
}
const controlScore = clamp(
getBallContestControlScore(player, lanePoint, actionType) - secureProtection * 0.2,
0,
1
);
const proximity = clamp(1 - gap / adjustedInterceptRadius, 0, 1);
const coverInfluence = getCoverShadowInfluence(player, lanePoint, previousPosition);
const score =
controlScore * 0.58 +
player.intelligenceProfile.decisionSpeed * 0.18 +
player.intelligenceProfile.perception * 0.12 +
proximity * 0.24 +
coverInfluence * 0.14 +
flightControlFactor * 0.1 -
secureProtection * 0.28;
candidates.push({
player,
lanePoint,
gap,
interceptRadius: adjustedInterceptRadius,
controlScore,
score,
secureProtection,
});
});
if (!candidates.length) {
return null;
}
candidates.sort((a, b) => b.score - a.score);
const best = candidates[0];
const isOpponent = best.player.team !== initiator?.team;
const isPassToFeet = actionType === "pass" && state.ball.targetKind === "to-feet";
if (actionType === "pass") {
const canAffectPass =
best.gap <= (isPassToFeet ? 0.52 : 0.95) ||
(best.score >= (isPassToFeet ? 0.9 : 0.78) && best.controlScore >= (isPassToFeet ? 0.68 : 0.62));
if (!canAffectPass) {
return null;
}
}
if (best.controlScore >= (actionType === "pass" ? (isPassToFeet ? 0.72 : 0.65) : 0.57)) {
rotatePlayerBodyToward(best.player, best.lanePoint, 0.45);
state.ball.ownerPlayerId = best.player.id;
state.ball.position = cloneVector(getPlayerBallControlPoint(best.player));
state.ball.target = cloneVector(state.ball.position);
if (isOpponent) {
setSecurePossessionAfterBallWin(best.player, initiator, best.lanePoint, "interception");
} else {
keepSecurePossessionOnlyForOwner(best.player.id);
}
return {
kind: isOpponent ? "interception" : "early-claim",
player: best.player,
point: best.lanePoint,
};
}
if (actionType === "pass" && (best.score < (isPassToFeet ? 0.84 : 0.76) || best.gap > (isPassToFeet ? 0.48 : 0.82))) {
return null;
}
const deflectAngle =
normalizeAngle(
angleBetween(previousPosition, state.ball.position) * 0.55 +
getPlayerFacingAngle(best.player) * 0.45
) + (isOpponent ? 0.18 : -0.12);
const shotAttackingTeamId =
actionType === "shot"
? initiator?.team ??
getPlayerById(state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId)?.team ??
getPlayerById(state.ball.initiatorPlayerId)?.team ??
getPlannedPossessionTeamId() ??
null
: null;
const deflection = createLooseBallSpill(
best.lanePoint,
deflectAngle,
clamp((1 - best.controlScore) * 3.4, 0.9, 3.8),
best.player.id,
0.04,
actionType === "shot"
? {
source: "shot-block-deflection",
reboundType: "shot-block",
attackingTeamId: shotAttackingTeamId,
defendingTeamId: shotAttackingTeamId ? getOtherTeamId(shotAttackingTeamId) : null,
urgency: clamp(best.score + (1 - best.controlScore) * 0.2, 0.48, 0.88),
}
: {}
);
if (isOpponent && deflection.winner?.id === best.player.id) {
setSecurePossessionAfterBallWin(best.player, initiator, deflection.spillPoint, "interception");
}
return {
kind: "deflection",
player: best.player,
point: deflection.spillPoint,
winner: deflection.winner,
};
}
function resolveAerialArrivalContest(actionType, receiver = null) {
if (actionType !== "pass" && actionType !== "shot") {
return false;
}
if (!isAerialFlightStyle(state.ball.flightStyle) && state.ball.height <= state.ball.controlHeightThreshold * 0.65) {
return false;
}
const contestPoint = cloneVector(state.ball.position);
const incomingPoint = cloneVector(state.ball.startPosition);
const incomingAngle = angleBetween(incomingPoint, contestPoint);
const firstContactContext = getAerialFirstContactContext(actionType, contestPoint, incomingPoint, receiver);
const contestRadius = clamp(
state.ball.controlRadius + 1.05 + state.ball.height * 0.28,
1.9,
firstContactContext.crossLike || firstContactContext.secondBallZone ? 4.35 : 3.7
);
const candidates = state.players
.map((player) => ({
player,
gap: distance(player.position, contestPoint),
}))
.filter((entry) => entry.gap <= contestRadius)
.map((entry) => ({
...entry,
aerialScore: getAerialFirstContactScore(
entry.player,
contestPoint,
incomingPoint,
firstContactContext,
receiver?.id ?? null,
receiver ? 0.05 : 0
),
}))
.sort((a, b) => b.aerialScore - a.aerialScore);
if (!candidates.length) {
return false;
}
const winner = candidates[0];
const challenger = candidates[1] ?? null;
const winnerControlScore = getAerialControlScore(winner.player, incomingPoint);
const margin = winner.aerialScore - (challenger?.aerialScore ?? 0);
const winnerIsDefending = winner.player.team === firstContactContext.defendingTeamId;
const winnerIsAttacking = winner.player.team === firstContactContext.attackingTeamId;
const winnerInOwnBox = isInsideOwnBox(contestPoint, winner.player.team);
if (
isGoalkeeper(winner.player) &&
winnerInOwnBox &&
winnerControlScore >= 0.5 &&
margin >= -0.03
) {
connectBallToPlayerForNextAction(winner.player, contestPoint, 0.82);
keepSecurePossessionOnlyForOwner(winner.player.id);
return true;
}
if (challenger && margin <= (firstContactContext.crossLike ? 0.1 : 0.07)) {
const looseAngle = blendAngles(
getPlayerFacingAngle(winner.player),
incomingAngle,
0.58,
0.42
);
createLooseBallSpill(
contestPoint,
looseAngle,
clamp(1.45 + state.ball.height * 0.48 + (firstContactContext.secondBallZone ? 0.55 : 0), 1.1, 4.4),
winner.player.id,
0.02
);
return true;
}
if (
winnerIsDefending &&
(firstContactContext.crossLike || firstContactContext.secondBallZone || firstContactContext.inDefendingBox) &&
(state.ball.height >= state.ball.controlHeightThreshold * 0.9 || margin >= 0.04)
) {
const clearanceAngle = getAerialDefensiveClearanceAngle(winner.player, contestPoint, incomingAngle);
createLooseBallSpill(
contestPoint,
clearanceAngle,
clamp(4.8 + getAerialPresence(winner.player) * 4.4 + winnerControlScore * 2.2, 4.2, 11.5),
winner.player.id,
0.03
);
return true;
}
if (
winnerIsAttacking &&
firstContactContext.crossLike &&
firstContactContext.inAttackingBox &&
state.ball.height >= state.ball.controlHeightThreshold * 0.8
) {
const knockdownAngle = getAerialAttackingKnockdownAngle(winner.player, contestPoint, firstContactContext);
createLooseBallSpill(
contestPoint,
knockdownAngle,
clamp(1.8 + winnerControlScore * 3.4 + Math.max(margin, 0) * 5.2, 1.5, 6.4),
winner.player.id,
0.08
);
return true;
}
const isReceiverTeamWinner = receiver ? winner.player.team === receiver.team : true;
if (winnerControlScore >= 0.7 && margin >= 0.04 && state.ball.height <= state.ball.controlHeightThreshold * 1.6) {
if (receiver && winner.player.id === receiver.id) {
applyControlledFirstTouch(
winner.player,
incomingPoint,
winnerControlScore,
state.ball.firstTouchMode
);
} else {
rotatePlayerBodyToward(winner.player, receiver ? state.ball.target : contestPoint, 0.42);
state.ball.ownerPlayerId = winner.player.id;
keepSecurePossessionOnlyForOwner(winner.player.id);
state.ball.position = cloneVector(getPlayerBallControlPoint(winner.player));
state.ball.target = cloneVector(state.ball.position);
}
return true;
}
const directionalAngle = isReceiverTeamWinner
? blendAngles(getTeamAttackAngle(winner.player.team), incomingAngle, 0.72, 0.28)
: normalizeAngle(
getTeamAttackAngle(winner.player.team) +
(contestPoint.y <= pitch.width / 2 ? 0.26 : -0.26)
);
const spillDistance = clamp(
2.2 + (winnerControlScore - 0.4) * 2.4 + state.ball.height * 0.28,
1.8,
isReceiverTeamWinner ? 5.4 : 7.2
);
createLooseBallSpill(
contestPoint,
directionalAngle,
spillDistance,
winner.player.id,
0.05
);
return true;
}
const {
  shouldTriggerLandingBounce,
  startLandingBounceSkid,
} = createGameSimulatorBallResolutionLandingBounce({
  angleBetween,
  clamp,
  clampToPitch,
  clearSecurePossession,
  cloneVector,
  configureBallTravelProfile,
  distance,
  getPitchSurfacePreset,
  getWeatherPreset,
  isAerialFlightStyle,
  state,
});
function settleBallForNextAction(actionType) {
const receiver = state.ball.receiverPlayerId ? getPlayerById(state.ball.receiverPlayerId) : null;
const passReceiverClaimFilter =
actionType === "pass" && receiver
? (player) => player.id === receiver.id || player.team !== receiver.team
: null;
if (resolveAerialArrivalContest(actionType, receiver)) {
if (!state.ball.ownerPlayerId) {
keepBallPlayableForNextAction(state.ball.position, receiver, {
preferredRadius: state.ball.controlRadius + 1,
claimRadius: state.ball.claimRadius + 1.1,
canClaimPlayer: passReceiverClaimFilter,
});
}
return;
}
if (actionType === "pass" && receiver && state.restartPhase?.type !== "throwIn") {
const receiverControlPoint = getPlayerBallControlPoint(receiver);
const receiverContext = getPlayerDecisionContext(receiver);
const receiverGap = distance(receiverControlPoint, state.ball.position);
const cleanControlScore =
state.ball.executionQuality * 0.46 +
state.ball.laneClarity * 0.24 +
receiverContext.profile.technicalSecurity * 0.16 +
receiverContext.profile.pressResistance * 0.14;
const receiveOrientationScore = getReceiveOrientationScore(receiver, state.ball.startPosition);
const receiveFootScore = getReceiveFootUsageScore(receiver, state.ball.startPosition);
const firstTouchQuality = clamp(
receiverContext.profile.technicalSecurity * 0.34 +
receiverContext.profile.pressResistance * 0.22 +
receiverContext.profile.composure * 0.16 +
receiverContext.profile.decisionQuality * 0.14 +
receiveOrientationScore * 0.1 +
receiveFootScore * 0.08 -
receiverContext.pressure * 0.07,
state.ball.targetKind === "to-feet" ? 0.52 : 0.42,
0.98
);
const isPassToFeet = state.ball.targetKind === "to-feet";
const controlThreshold = isPassToFeet ? 0.4 : 0.58;
const nearestOpponentGap = getNearestOpponentGap(receiver, receiverControlPoint);
const isReceiverPressed =
Number.isFinite(nearestOpponentGap) &&
(nearestOpponentGap <= 2.75 || receiverContext.pressure >= 0.52);
const isReceiverUnderDuelPressure =
Number.isFinite(nearestOpponentGap) &&
(nearestOpponentGap <= 1.65 || receiverContext.pressure >= 0.68);
if (
isPassToFeet &&
!isReceiverPressed &&
receiverGap <= state.ball.controlRadius + 2.2 &&
state.ball.executionQuality >= 0.44
) {
const activeFirstTouchMode = shouldUseAutoPilotActiveFirstTouch(receiver, firstTouchQuality)
? state.draftStep?.firstTouchMode ?? state.ball.firstTouchMode
: "kill";
applyControlledFirstTouch(
receiver,
state.ball.startPosition,
Math.max(firstTouchQuality, 0.74),
activeFirstTouchMode
);
return;
}
const duelRadius = isPassToFeet
? clamp(state.ball.controlRadius - 0.05, 1.1, 1.62)
: state.ball.controlRadius + 1.05;
const duelOpponents = state.players
.filter((player) => player.team !== receiver.team)
.map((player) => ({ player, gap: distance(player.position, receiverControlPoint) }))
.filter((entry) => entry.gap <= duelRadius && (!isPassToFeet || isReceiverUnderDuelPressure))
.sort((a, b) => a.gap - b.gap);
const primaryDuel = duelOpponents[0] ?? null;
const receiverDuelScore =
getBallDuelScore(receiver, receiverControlPoint) +
firstTouchQuality * 0.18 +
state.ball.executionQuality * 0.08;
if (receiverGap <= state.ball.controlRadius && cleanControlScore * lerp(0.94, 1.06, receiveFootScore) >= controlThreshold) {
if (primaryDuel) {
const defenderDuelScore =
getBallDuelScore(primaryDuel.player, receiverControlPoint) +
(primaryDuel.player.intelligenceProfile.decisionSpeed * 0.08);
const decisiveReceiverPressure = primaryDuel.gap <= (isPassToFeet ? 1.18 : 1.55);
if (
decisiveReceiverPressure &&
defenderDuelScore > receiverDuelScore + (isPassToFeet ? 0.3 : 0.12)
) {
connectBallToPlayerForNextAction(primaryDuel.player, receiverControlPoint, 0.45);
setSecurePossessionAfterBallWin(primaryDuel.player, receiver, receiverControlPoint, "tackle");
return;
}
if (isPassToFeet && receiverDuelScore >= defenderDuelScore - 0.12) {
applyControlledFirstTouch(receiver, state.ball.startPosition, firstTouchQuality, "kill");
return;
}
if (Math.abs(defenderDuelScore - receiverDuelScore) <= (isPassToFeet ? 0.02 : 0.07)) {
const duelAngle = normalizeAngle(
angleBetween(receiver.position, receiverControlPoint) * 0.5 +
angleBetween(primaryDuel.player.position, receiverControlPoint) * 0.5
);
const spill = createLooseBallSpill(
receiverControlPoint,
duelAngle,
clamp(1.1 + primaryDuel.gap * 0.45, 1, 3.2),
receiver.id,
0.03,
{
canClaimPlayer: passReceiverClaimFilter,
}
);
if (!spill.winner) {
keepBallPlayableForNextAction(spill.spillPoint, receiver, {
preferredRadius: isPassToFeet ? state.ball.controlRadius + 1.15 : state.ball.controlRadius + 0.55,
claimRadius: state.ball.claimRadius + 0.75,
canClaimPlayer: passReceiverClaimFilter,
});
}
return;
}
}
const shouldSecureToFeetPass = isPassToFeet && firstTouchQuality >= 0.3;
if (firstTouchQuality >= 0.45 || shouldSecureToFeetPass) {
const appliedFirstTouch = applyControlledFirstTouch(
receiver,
state.ball.startPosition,
firstTouchQuality,
firstTouchQuality < 0.56 && state.ball.firstTouchMode === "auto"
? "kill"
: state.ball.firstTouchMode
);
if (appliedFirstTouch && appliedFirstTouch !== "kill") {
logEvent(
`${receiver.shortLabel} ${receiver.role} takes the first touch ${getFirstTouchModeLabel(appliedFirstTouch).toLowerCase()}.`
);
}
return;
}
const incomingAngle = angleBetween(state.ball.startPosition, receiverControlPoint);
const spillAngle = normalizeAngle(
incomingAngle * 0.45 + getPlayerFacingAngle(receiver) * 0.55
);
const spillDistance = clamp(
(1 - firstTouchQuality) * 4.2 + receiverContext.pressure * 1.25,
0.9,
4.8
);
const spillPoint = clampToPitch({
x: receiverControlPoint.x + Math.cos(spillAngle) * spillDistance,
y: receiverControlPoint.y + Math.sin(spillAngle) * spillDistance,
});
const spill = createLooseBallSpill(
spillPoint,
spillAngle,
0,
receiver.id,
0.02,
{
canClaimPlayer: passReceiverClaimFilter,
}
);
if (!spill.winner) {
keepBallPlayableForNextAction(spillPoint, receiver, {
preferredRadius: state.ball.controlRadius + 0.65,
claimRadius: state.ball.claimRadius + 0.75,
canClaimPlayer: passReceiverClaimFilter,
});
}
return;
}
if (isPassToFeet) {
if (!isReceiverPressed) {
const activeFirstTouchMode = shouldUseAutoPilotActiveFirstTouch(receiver, firstTouchQuality)
? state.draftStep?.firstTouchMode ?? state.ball.firstTouchMode
: "kill";
applyControlledFirstTouch(
receiver,
state.ball.startPosition,
Math.max(firstTouchQuality, 0.68),
activeFirstTouchMode
);
return;
}
keepBallPlayableForNextAction(state.ball.position, receiver, {
preferredRadius: state.ball.controlRadius + 1.45,
claimRadius: state.ball.claimRadius + 0.8,
canClaimPlayer: passReceiverClaimFilter,
});
return;
}
}
const spaceRunner =
actionType === "pass" && !receiver
? getPlayerById(state.draftStep?.principleRunnerPlayerId)
: null;
const spaceClaimFilter = spaceRunner
? (player) => player.id === spaceRunner.id || player.team !== spaceRunner.team
: passReceiverClaimFilter;
const winner = resolveLooseBallClaim(
state.ball.target,
state.ball.claimRadius,
receiver?.id ?? spaceRunner?.id ?? null,
receiver ? 0.05 : spaceRunner ? 0.14 : 0,
{
canClaimPlayer: spaceClaimFilter,
}
).player;
if (winner) {
connectBallToPlayerForNextAction(winner, state.ball.target, 0.4);
return;
}
keepBallPlayableForNextAction(state.ball.target, receiver ?? spaceRunner, {
preferredRadius: receiver || spaceRunner ? state.ball.controlRadius + 0.9 : state.ball.controlRadius + 0.3,
claimRadius: state.ball.claimRadius + 0.65,
canClaimPlayer: spaceClaimFilter,
});
}

  return {
    applyBallExecutionProfile,
    getLooseBallClaimScore,
    getShotReboundClaimContext,
    getShotReboundClaimAdjustment,
    getBallContestControlScore,
    getAerialPresence,
    getAerialContestScore,
    getAerialFirstContactContext,
    getAerialFirstContactScore,
    getAerialDefensiveClearanceAngle,
    getAerialAttackingKnockdownAngle,
    getAerialControlScore,
    getBallDuelScore,
    clearSecurePossession,
    getBallWinEscapeTouch,
    applyBallWinEscapeTouch,
    setSecurePossessionAfterBallWin,
    getPossessionShieldOpponents,
    setSecurePossessionAfterControlledTouch,
    keepSecurePossessionOnlyForOwner,
    getSecurePossessionContext,
    getDribbleTackleCandidate,
    getDribbleFoulCandidate,
    completeDribbleFoulRestart,
    resolveDribbleDefensiveChallenge,
    resolveLooseBallClaim,
    connectBallToPlayerForNextAction,
    applyShotReboundControlTouch,
    keepBallPlayableForNextAction,
    createLooseBallSpill,
    resolveShotBlockCommitment,
    resolvePassTransitInterception,
    resolveAerialArrivalContest,
    shouldTriggerLandingBounce,
    startLandingBounceSkid,
    settleBallForNextAction,
  };
}
