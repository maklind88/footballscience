import { createGameSimulatorActionSpaceActionValueMetrics } from "./action-space-action-value-metrics.mjs";
import { createGameSimulatorActionSpaceGameSpaceAdjustments } from "./action-space-game-space-adjustments.mjs";
import { createGameSimulatorActionSpaceForwardProgressionMetrics } from "./action-space-forward-progression-metrics.mjs";
import { createGameSimulatorActionSpaceBallProfiles } from "./action-space-ball-profiles.mjs";
import { createGameSimulatorActionSpaceOrientationMetrics } from "./action-space-orientation-metrics.mjs";
import { createGameSimulatorActionSpacePassLaneMetrics } from "./action-space-pass-lane-metrics.mjs";
import { createGameSimulatorActionSpacePitchSpaceProfiles } from "./action-space-pitch-space-profiles.mjs";
import { createGameSimulatorActionSpacePitchGeometry } from "./action-space-pitch-geometry.mjs";
import { createGameSimulatorActionSpaceReceiveFlow } from "./action-space-receive-flow.mjs";
import { createGameSimulatorActionSpaceSpatialDominanceMetrics } from "./action-space-spatial-dominance-metrics.mjs";
import { createGameSimulatorActionSpaceShotMetrics } from "./action-space-shot-metrics.mjs";

export function createGameSimulatorActionSpaceMetrics(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    autoBallProfiles,
    autoDribbleProfiles,
    ballRadiusMeters,
    blendAngles,
    buildPlayerIntelligenceProfile,
    clamp,
    clampToPitch,
    cloneVector,
    computeTimeToCoverDistance,
    defensiveAggressionPresets,
    distance,
    firstTouchModes,
    getActionSpeed,
    getAutoPilotFlowContext,
    getAutoPilotRoleStrength,
    getBallAwareBodyAngle,
    getBallControlOffsetMeters,
    getBallOwner,
    getCompetitionPhysicalProfile,
    getDefensiveAutopilotLineKey,
    getDefensivePhaseKey,
    getFootUsageScore,
    getGoalkeeperForTeam,
    getNearestOpponentGap,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOtherTeamId,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPlannedPossessionTeamId,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getTeamAttackAngle,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isFrontLineRole,
    isSupportRole,
    keepSecurePossessionOnlyForOwner,
    lerp,
    moveTowards,
    normalize,
    normalizeAngle,
    pitch,
    pitchSurfacePresets,
    playerRadiusMeters,
    projectPointOnSegmentWithRatio,
    rotatePlayerBodyTowardAngle,
    setSecurePossessionAfterControlledTouch,
    subtract,
    teams,
    uniquePrincipleLabels,
    vec,
    weatherPresets,
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

function getRemainingBallDistance() {
if (state.ball.trackDistanceTotal > 0 && (state.ball.actionType !== "dribble" || state.ball.dribblePath)) {
return Math.max(0, state.ball.trackDistanceTotal - state.ball.trackDistanceCovered);
}
return distance(state.ball.position, state.ball.target);
}
function hasBallAction() {
return state.ball.actionType !== null && (getRemainingBallDistance() > 0.05 || state.ball.inTransit);
}
function getActionOrigin(player) {
return player.actionOrigin ?? player.position;
}
function getProjectedActionDuration() {
if (state.sequence.phase === "transition" && state.sequence.transition) {
return state.sequence.transition.duration;
}
if (!hasBallAction()) {
return 0;
}
return state.ball.elapsedTravelTime + getRemainingBallTravelTime();
}
function getCurrentActionDuration() {
if (state.sequence.phase === "transition" && state.sequence.transition) {
return state.sequence.transition.elapsed;
}
return hasBallAction() ? state.ball.elapsedTravelTime : 0;
}
function getActionInitiator() {
if (state.ball.actionType === "dribble") {
return getPlayerById(state.ball.carrierPlayerId ?? state.ball.initiatorPlayerId);
}
return getPlayerById(state.ball.initiatorPlayerId);
}
const actionSpacePitchSpaceProfiles = createGameSimulatorActionSpacePitchSpaceProfiles({
  clamp,
  getDefensiveAutopilotLineKey,
  getDefensivePhaseKey,
  getOtherTeamId,
  getPitchLaneKey,
  pitch,
  state,
  teams,
  vec,
});
const {
  getAttackDirectionSign,
  getAttackingDepth,
  getOpponentGoalCenter,
  getDepthZoneKey,
  getDepthZoneLabel,
  getLaneLabel,
  getGoldenZoneScore,
  isGoldenZone,
  getMedianNumber,
  getDepthQuantile,
  getOpponentLineDepthsForAttackingTeam,
  getAttackingGameSpaceProfile,
  getPitchSpaceProfile,
  getPitchThreatProfile,
} = actionSpacePitchSpaceProfiles;
const actionSpaceActionValueMetrics = createGameSimulatorActionSpaceActionValueMetrics({
  clamp,
  distance,
  getAttackDirectionSign,
  getAttackingDepth,
  getPitchSpaceProfile,
  getPitchThreatProfile,
  lerp,
  pitch,
  projectPointOnSegmentWithRatio,
  state,
});
const {
  getOpponentPressureAtPoint,
  getNearestOpponentGapToPoint,
  getOpponentsBypassedByAction,
  getFootballSpacePriority,
  getActionSpaceValue,
} = actionSpaceActionValueMetrics;
const actionSpaceOrientationMetrics = createGameSimulatorActionSpaceOrientationMetrics({
  angleBetween,
  angleDifference,
  blendAngles,
  buildPlayerIntelligenceProfile,
  clamp,
  getFootUsageScore,
  getPlayerFacingAngle,
  getTeamAttackAngle,
  normalizeAngle,
  state,
});
const {
  getOrientationTurnDelay,
  getOrientationMovementProfile,
  getCoverShadowInfluence,
  getReceiveOrientationScore,
  getBestReceiveBodyAngle,
  getReceiveFootUsageScore,
  applyBestReceiveBodyAngle,
} = actionSpaceOrientationMetrics;
const actionSpacePitchGeometry = createGameSimulatorActionSpacePitchGeometry({
  clamp,
  clampToPitch,
  distance,
  getAttackDirectionSign,
  getAttackingDepth,
  getBallOwner,
  getPlannedPossessionTeamId,
  getPlayerBallControlPoint,
  pitch,
  state,
  vec,
});
const {
  getOpponentGoalSide,
  getGoalLineX,
  getGoalDirectionSign,
  isBetweenGoalPosts,
  getGoalNetDisplayPoint,
  resolveShotTarget,
  getOwnGoalCenter,
  getOpponentPenaltySpot,
  getSecondLastOpponentLineX,
  getOffsideInfo,
  isPassReceiverOffside,
  isWideChannel,
  isBylineZone,
  isInsideOpponentBox,
  isInsideOwnBox,
  isCutbackTarget,
  isGoalkeeper,
} = actionSpacePitchGeometry;
const actionSpaceSpatialDominanceMetrics = createGameSimulatorActionSpaceSpatialDominanceMetrics({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getNearestOpponentGapToPoint,
  isGoalkeeper,
  state,
  uniquePrincipleLabels,
});
const {
  getTeamDensityAtPoint,
  getOpponentDensityAtPoint,
  getSpaceDominanceProfile,
  getAutoPilotSpaceDominanceAdjustment,
} = actionSpaceSpatialDominanceMetrics;
const actionSpaceBallProfiles = createGameSimulatorActionSpaceBallProfiles({
  angleBetween,
  angleDifference,
  autoBallProfiles,
  autoDribbleProfiles,
  clamp,
  clampToPitch,
  cloneVector,
  defensiveAggressionPresets,
  distance,
  getActionSpeed,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotRoleStrength,
  getBallOwner,
  getCompetitionPhysicalProfile,
  getFootUsageScore,
  getOffensiveAutopilotProfile,
  getOffensiveRoleKey,
  getOpponentGoalCenter,
  getOpponentPressureAtPoint,
  getOrientationMovementProfile,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerDecisionContext,
  getPlayerFacingAngle,
  getPlayerMagnetLabel,
  getPlayerPressureLoad,
  getRemainingBallDistance,
  getTeamAttackAngle,
  getWideSideSign,
  hasBallAction,
  isBylineZone,
  isCutbackTarget,
  isGoalkeeper,
  isInsideOpponentBox,
  isWideChannel,
  lerp,
  moveTowards,
  normalize,
  normalizeAngle,
  pitch,
  pitchSurfacePresets,
  state,
  subtract,
  teams,
  weatherPresets,
});
const {
  getBallProfileDistanceRatio,
  getPitchSurfacePreset,
  getWeatherPreset,
  getDefensiveAggressionPreset,
  isAerialFlightStyle,
  getFlightStyleLabel,
  resolveBallCurveDirection,
  getBallTravelProgress,
  getBallTravelPoint,
  materializeBallProfile,
  getManualBallProfile,
  getDribbleRoleFamily,
  resolveAutoDribbleProfile,
  getNearestOpponentGapInCarryLane,
  getCarryLaneOpenSpaceScore,
  getCarryRunwayRoleCap,
  getCarryRunwayProfile,
  getRunwayCarryTarget,
  getBreakawayCarryTarget,
  getOpenGrassCarryContext,
  getQuadraticPoint,
  buildSampledCurvePath,
  getSampledPathPoint,
  buildDribbleCarryPath,
  getDribbleCarryPathPoint,
  setDribbleCarryPathForBall,
  getLiveDribbleSpeed,
  resolveAutoBallProfile,
  resolveBallActionProfile,
  resolveRecordedStepProfile,
  applyResolvedBallProfile,
  getBallProfileLabel,
  getDisplayedBallSpeed,
  getRemainingBallTravelTime,
  updateBallFlightHeight,
  getBallFlightControlFactor,
} = actionSpaceBallProfiles;
const actionSpaceForwardProgressionMetrics = createGameSimulatorActionSpaceForwardProgressionMetrics({
  angleDifference,
  clamp,
  clampToPitch,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAttackingGameSpaceProfile,
  getCarryLaneOpenSpaceScore,
  getGoldenZoneScore,
  getNearestOpponentGapInCarryLane,
  getOffensiveRoleKey,
  getOpponentGoalCenter,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerFacingAngle,
  getPlayerPressureLoad,
  getPlayerTendency,
  getTeamAttackAngle,
  isFrontLineRole,
  lerp,
  pitch,
  teams,
  uniquePrincipleLabels,
});
const {
  getActionThreatGain,
  isPlayerFacingForward,
  getForwardFacingSpaceTwoContext,
  getAutoPilotSpaceTwoAdvantageAdjustment,
  getForwardProgressionWindow,
} = actionSpaceForwardProgressionMetrics;
const actionSpacePassLaneMetrics = createGameSimulatorActionSpacePassLaneMetrics({
  ballRadiusMeters,
  clamp,
  computeTimeToCoverDistance,
  distance,
  getCoverShadowInfluence,
  getPlayerBallControlPoint,
  getPlayerById,
  getPlayerDecisionContext,
  isAerialFlightStyle,
  lerp,
  playerRadiusMeters,
  projectPointOnSegmentWithRatio,
  resolveAutoBallProfile,
  state,
});
const {
  getPotentialPassReceiverAtTarget,
  getPassLaneRiskProfile,
  computePassLaneClarity,
} = actionSpacePassLaneMetrics;
const actionSpaceGameSpaceAdjustments = createGameSimulatorActionSpaceGameSpaceAdjustments({
  clamp,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingGameSpaceProfile,
  getNearestOpponentGap,
  getOffensiveRoleKey,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchSpaceProfile,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getTeamDensityAtPoint,
  getTeamSupportCountAroundPoint,
  isPlayerFacingForward,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotGameSpaceAdjustment,
  getAutoPilotSpatialDecisionAdjustment,
} = actionSpaceGameSpaceAdjustments;
const actionSpaceShotMetrics = createGameSimulatorActionSpaceShotMetrics({
  angleBetween,
  angleDifference,
  clamp,
  clampToPitch,
  cloneVector,
  computeTimeToCoverDistance,
  distance,
  getAutoPilotRoleStrength,
  getCoverShadowInfluence,
  getFootUsageScore,
  getGoalDirectionSign,
  getGoalLineX,
  getGoalkeeperForTeam,
  getOpponentGoalCenter,
  getOpponentGoalSide,
  getOtherTeamId,
  getPlayerBallControlPoint,
  getPlayerDecisionContext,
  getPlayerPressureLoad,
  isGoalkeeper,
  lerp,
  pitch,
  projectPointOnSegmentWithRatio,
  resolveAutoBallProfile,
  state,
});
const {
  getGoalMouthTarget,
  getShotAngleQuality,
  getShotBlockRisk,
  getGoalkeeperTargetOpenness,
  computeShotLaneClarity,
  getShotWindowProfile,
  getDeterministicShotNoise,
  resolveExecutedShotTarget,
} = actionSpaceShotMetrics;
const actionSpaceReceiveFlow = createGameSimulatorActionSpaceReceiveFlow({
  angleBetween,
  angleDifference,
  blendAngles,
  clamp,
  clampToPitch,
  cloneVector,
  computePassLaneClarity,
  distance,
  firstTouchModes,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotFlowContext,
  getAutoPilotRoleStrength,
  getBallControlOffsetMeters,
  getBestReceiveBodyAngle,
  getCarryLaneOpenSpaceScore,
  getForwardProgressionWindow,
  getNearestOpponentGap,
  getNearestOpponentGapInCarryLane,
  getOffensiveRoleKey,
  getOpponentDensityAtPoint,
  getPitchLaneIndex,
  getPitchThreatProfile,
  getPlayerBallControlPoint,
  getPlayerById,
  getPlayerDecisionContext,
  getPlayerFacingAngle,
  getPlayerMagnetLabel,
  getPlayerPressureLoad,
  getPlayerTendency,
  getTeamAttackAngle,
  getTeamDensityAtPoint,
  getTeamSupportCountAroundPoint,
  isFrontLineRole,
  isPassReceiverOffside,
  isPlayerFacingForward,
  isSupportRole,
  isWideChannel,
  keepSecurePossessionOnlyForOwner,
  lerp,
  normalizeAngle,
  pitch,
  rotatePlayerBodyTowardAngle,
  setSecurePossessionAfterControlledTouch,
  state,
  teams,
  uniquePrincipleLabels,
});
const {
  getFirstTouchModeLabel,
  resolveFirstTouchMode,
  getFirstTouchDirectionAngle,
  getFirstTouchDistance,
  clearAutoPilotReceiveMomentum,
  setAutoPilotReceiveMomentum,
  getAutoPilotReceiveMomentum,
  getAutoPilotReceiveMomentumAdjustment,
  getAutoPilotFirstActionAfterReceiveAdjustment,
  getAutoPilotReceiveFlowContext,
  getAutoPilotReceiveFlowAdjustment,
  getReceiveContinuationCarryTarget,
  buildAutoPilotReceiveContinuationCandidate,
  applyControlledFirstTouch,
  shouldUseAutoPilotActiveFirstTouch,
} = actionSpaceReceiveFlow;
function getLiveBallFocusPoint() {
if (!state.ball.inTransit) {
const owner = getBallOwner();
if (owner) {
return getPlayerBallControlPoint(owner);
}
}
return state.ball.position;
}
function getSpacePassTargetPoint() {
if (state.ball.actionType === "pass" && !state.ball.receiverPlayerId && state.ball.target) {
return state.ball.target;
}
if (state.draftStep?.actionType === "pass" && !state.draftStep.receiverPlayerId && state.draftStep.target) {
return state.draftStep.target;
}
return null;
}
function getPlayerOrientationFocus(player) {
const liveBallPoint = getLiveBallFocusPoint();
const spacePassTarget = getSpacePassTargetPoint();
if (!player || !spacePassTarget) {
return {
point: liveBallPoint,
influenceRange: 11.5,
};
}
const distanceToTarget = distance(player.position, spacePassTarget);
const distanceToLiveBall = distance(player.position, liveBallPoint);
const shouldPrioritizeTargetSpace =
distanceToTarget <= 15.5 ||
distanceToTarget <= distanceToLiveBall + 2.4;
return {
point: shouldPrioritizeTargetSpace ? spacePassTarget : liveBallPoint,
influenceRange: shouldPrioritizeTargetSpace ? 14.5 : 11.5,
};
}
function getActiveMovementTarget(playerId) {
if (state.sequence.isPlaying && state.sequence.phase === "action" && state.sequence.actionTargets?.has(playerId)) {
return state.sequence.actionTargets.get(playerId);
}
if (state.sequence.isPlaying && state.sequence.phase === "transition" && state.sequence.transition?.playerTargets?.has(playerId)) {
return state.sequence.transition.playerTargets.get(playerId).end;
}
if (state.isRunning && state.activeActionTargets?.has(playerId)) {
return state.activeActionTargets.get(playerId);
}
return null;
}
function isPlayerReservedForReceiveShape(player) {
if (!player) {
return false;
}
if (state.ball.actionType === "pass" && state.ball.receiverPlayerId === player.id) {
return true;
}
if (state.draftStep?.actionType === "pass" && state.draftStep.receiverPlayerId === player.id) {
return true;
}
if (state.sequence.isPlaying && state.sequence.phase === "action") {
const step = state.sequence.steps[state.sequence.playbackIndex];
if (step?.actionType === "pass" && step.receiverPlayerId === player.id) {
return true;
}
}
return false;
}
function applyNearbyBallOrientation(dt) {
const isLivePhase = state.isRunning || state.sequence.isPlaying;
const draggedPlayerIds = new Set(
state.drag?.type === "player"
? state.drag.playerIds ?? [state.drag.playerId].filter(Boolean)
: []
);
state.players.forEach((player) => {
if (draggedPlayerIds.has(player.id)) {
return;
}
if (state.ball.ownerPlayerId === player.id || state.ball.carrierPlayerId === player.id) {
return;
}
if (isPlayerReservedForReceiveShape(player)) {
return;
}
const activeMovementTarget = getActiveMovementTarget(player.id);
if (activeMovementTarget && distance(player.position, activeMovementTarget) > 0.08) {
return;
}
const { point: focusPoint, influenceRange } = getPlayerOrientationFocus(player);
if (!focusPoint) {
return;
}
const distanceToBall = distance(player.position, focusPoint);
const proximity = clamp(1 - (distanceToBall - 2.2) / influenceRange, 0, 1);
if (proximity <= 0.001) {
return;
}
const blend = clamp(
dt * (isLivePhase ? 0.42 + proximity * 1.15 : 0.7 + proximity * 2.2),
0,
isLivePhase ? 0.07 : 0.12
);
const desiredAngle = getBallAwareBodyAngle(player, focusPoint);
const maxTurn = dt * (isLivePhase ? 0.58 + proximity * 1.05 : 0.95 + proximity * 1.8);
rotatePlayerBodyTowardAngle(player, desiredAngle, blend, maxTurn);
});
}


  return {
    getRemainingBallDistance,
    hasBallAction,
    getActionOrigin,
    getProjectedActionDuration,
    getCurrentActionDuration,
    getActionInitiator,
    getOrientationTurnDelay,
    getOrientationMovementProfile,
    getCoverShadowInfluence,
    getReceiveOrientationScore,
    getBestReceiveBodyAngle,
    getReceiveFootUsageScore,
    applyBestReceiveBodyAngle,
    getFirstTouchModeLabel,
    resolveFirstTouchMode,
    getFirstTouchDirectionAngle,
    getFirstTouchDistance,
    clearAutoPilotReceiveMomentum,
    setAutoPilotReceiveMomentum,
    getAutoPilotReceiveMomentum,
    getAutoPilotReceiveMomentumAdjustment,
    getAutoPilotFirstActionAfterReceiveAdjustment,
    getAutoPilotReceiveFlowContext,
    getAutoPilotReceiveFlowAdjustment,
    getReceiveContinuationCarryTarget,
    buildAutoPilotReceiveContinuationCandidate,
    applyControlledFirstTouch,
    shouldUseAutoPilotActiveFirstTouch,
    getLiveBallFocusPoint,
    getSpacePassTargetPoint,
    getPlayerOrientationFocus,
    getActiveMovementTarget,
    isPlayerReservedForReceiveShape,
    applyNearbyBallOrientation,
    getPotentialPassReceiverAtTarget,
    getPassLaneRiskProfile,
    computePassLaneClarity,
    getGoalMouthTarget,
    getShotAngleQuality,
    getShotBlockRisk,
    getGoalkeeperTargetOpenness,
    computeShotLaneClarity,
    getShotWindowProfile,
    getDeterministicShotNoise,
    resolveExecutedShotTarget,
    getAttackDirectionSign,
    getAttackingDepth,
    getOpponentGoalCenter,
    getDepthZoneKey,
    getDepthZoneLabel,
    getLaneLabel,
    getGoldenZoneScore,
    isGoldenZone,
    getMedianNumber,
    getDepthQuantile,
    getOpponentLineDepthsForAttackingTeam,
    getAttackingGameSpaceProfile,
    getPitchSpaceProfile,
    getPitchThreatProfile,
    getOpponentPressureAtPoint,
    getNearestOpponentGapToPoint,
    getOpponentsBypassedByAction,
    getFootballSpacePriority,
    getActionSpaceValue,
    getTeamDensityAtPoint,
    getOpponentDensityAtPoint,
    getSpaceDominanceProfile,
    getAutoPilotSpaceDominanceAdjustment,
    getAutoPilotGameSpaceAdjustment,
    getAutoPilotSpatialDecisionAdjustment,
    getActionThreatGain,
    isPlayerFacingForward,
    getForwardFacingSpaceTwoContext,
    getAutoPilotSpaceTwoAdvantageAdjustment,
    getForwardProgressionWindow,
    getOpponentGoalSide,
    getGoalLineX,
    getGoalDirectionSign,
    isBetweenGoalPosts,
    getGoalNetDisplayPoint,
    resolveShotTarget,
    getOwnGoalCenter,
    getOpponentPenaltySpot,
    getSecondLastOpponentLineX,
    getOffsideInfo,
    isPassReceiverOffside,
    isWideChannel,
    isBylineZone,
    isInsideOpponentBox,
    isInsideOwnBox,
    isCutbackTarget,
    isGoalkeeper,
    getBallProfileDistanceRatio,
    getPitchSurfacePreset,
    getWeatherPreset,
    getDefensiveAggressionPreset,
    isAerialFlightStyle,
    getFlightStyleLabel,
    resolveBallCurveDirection,
    getBallTravelProgress,
    getBallTravelPoint,
    materializeBallProfile,
    getManualBallProfile,
    getDribbleRoleFamily,
    resolveAutoDribbleProfile,
    getNearestOpponentGapInCarryLane,
    getCarryLaneOpenSpaceScore,
    getCarryRunwayRoleCap,
    getCarryRunwayProfile,
    getRunwayCarryTarget,
    getBreakawayCarryTarget,
    getOpenGrassCarryContext,
    getQuadraticPoint,
    buildSampledCurvePath,
    getSampledPathPoint,
    buildDribbleCarryPath,
    getDribbleCarryPathPoint,
    setDribbleCarryPathForBall,
    getLiveDribbleSpeed,
    resolveAutoBallProfile,
    resolveBallActionProfile,
    resolveRecordedStepProfile,
    applyResolvedBallProfile,
    getBallProfileLabel,
    getDisplayedBallSpeed,
    getRemainingBallTravelTime,
    updateBallFlightHeight,
    getBallFlightControlFactor,
  };
}
