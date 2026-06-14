import { createGameSimulatorAutopilotPossessionPlanner } from "./autopilot-possession-planner.mjs";
import { createGameSimulatorAutopilotPossessionIntentDecisions } from "./autopilot-possession-intent-decisions.mjs";
import { createGameSimulatorAutopilotPossessionLoopDecisions } from "./autopilot-possession-loop-decisions.mjs";
import { createGameSimulatorAutopilotOpponentBlockReadDecisions } from "./autopilot-opponent-block-read-decisions.mjs";
import { createGameSimulatorAutopilotPatternDiversityDecisions } from "./autopilot-pattern-diversity-decisions.mjs";
import { createGameSimulatorAutopilotRiskEscapeDecisions } from "./autopilot-risk-escape-decisions.mjs";
import { createGameSimulatorAutopilotFlowDecisions } from "./autopilot-flow-decisions.mjs";

import { createGameSimulatorAutopilotTempoRhythm } from "./autopilot-tempo-rhythm.mjs";
import { createGameSimulatorAutopilotChanceDecisions } from "./autopilot-chance-decisions.mjs";
import { createGameSimulatorAutopilotAdvantageDecisions } from "./autopilot-advantage-decisions.mjs";
import { createGameSimulatorAutopilotPressureDecisions } from "./autopilot-pressure-decisions.mjs";
import { createGameSimulatorAutopilotTransitionDecisions } from "./autopilot-transition-decisions.mjs";
import { createGameSimulatorAutopilotAdvantageRetentionDecisions } from "./autopilot-advantage-retention-decisions.mjs";
import { createGameSimulatorAutopilotCarryEndProductDecisions } from "./autopilot-carry-end-product-decisions.mjs";
import { createGameSimulatorAutopilotSpacingBonusDecisions } from "./autopilot-spacing-bonus-decisions.mjs";
import { createGameSimulatorAutopilotIntentionModelDecisions } from "./autopilot-intention-model-decisions.mjs";
import { createGameSimulatorAutopilotCandidatePrincipleMetricsDecisions } from "./autopilot-candidate-principle-metrics-decisions.mjs";
import { createGameSimulatorAutopilotLocalSuperiorityDecisions } from "./autopilot-local-superiority-decisions.mjs";
import { createGameSimulatorAutopilotReceiverAvailabilityDecisions } from "./autopilot-receiver-availability-decisions.mjs";
import { createGameSimulatorAutopilotCombinationChainDecisions } from "./autopilot-combination-chain-decisions.mjs";
import { createGameSimulatorAutopilotNextSupportNetworkDecisions } from "./autopilot-next-support-network-decisions.mjs";
import { createGameSimulatorAutopilotVisionScanDecisions } from "./autopilot-vision-scan-decisions.mjs";
import { createGameSimulatorAutopilotSpaceLadderDecisions } from "./autopilot-space-ladder-decisions.mjs";
import { createGameSimulatorAutopilotDecisionContextHelpers } from "./autopilot-decision-context-helpers.mjs";
import { createGameSimulatorAutopilotRoleResponsibilityDecisions } from "./autopilot-role-responsibility-decisions.mjs";
import { createGameSimulatorAutopilotPrincipleScoringDecisions } from "./autopilot-principle-scoring-decisions.mjs";
export function createGameSimulatorAutopilotDecisionEngine(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    ballRadiusMeters,
    buildPlayerIntelligenceProfile,
    chooseScoredCandidateWithVariation,
    chooseWeightedOption,
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getActionThreatGain,
    getAttackDirectionSign,
    getAttackStyleRhythmProfile,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAttackingThirdKey,
    getAutoPilotRoleStrength,
    getAutoPilotShotTarget,
    getCarryLaneOpenSpaceScore,
    getCoverShadowInfluence,
    getForwardFacingSpaceTwoContext,
    getForwardProgressionWindow,
    getLaneForSideSign,
    getNearestOpponentGap,
    getNearestOpponentGapInCarryLane,
    getNearestOpponentGapToPoint,
    getOffensiveRoleKey,
    getOpponentDensityAtPoint,
    getOpponentGoalCenter,
    getOpponentLineDepthsForAttackingTeam,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getPassLaneRiskProfile,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getPossessionRhythmContext,
    getPotentialPassReceiverAtTarget,
    getReceiveFootUsageScore,
    getReceiveOrientationScore,
    getRecentPossessionSteps,
    getReceptionSupportTarget,
    getRecordedStepDuration,
    getRecordedStepPossessionTeamId,
    getShotWindowProfile,
    getState,
    getTeamDensityAtPoint,
    getTeamSupportCountAroundPoint,
    isGoalkeeper,
    isPassReceiverOffside,
    isPlayerFacingForward,
    isWideChannel,
    lerp,
    pitch,
    playerRadiusMeters,
    possessionRhythmDefaults,
    projectPointOnSegmentWithRatio,
    randomBetween,
    randomSign,
    resolveBallActionProfile,
    teams,
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

const autoPilotDecisionContextHelpers = createGameSimulatorAutopilotDecisionContextHelpers({
  clamp,
  clampToPitch,
  cloneVector,
  distance,
  getAttackDirectionSign,
  getAttackingThirdKey,
  getCarryLaneOpenSpaceScore,
  getNearestOpponentGapInCarryLane,
  getOffensiveRoleKey,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getRecentPossessionSteps,
  getRecordedStepDuration,
  getRecordedStepPossessionTeamId,
  getTeamSupportCountAroundPoint,
  isWideChannel,
  lerp,
  pitch,
  state,
  teams,
});
const {
  isLastStepKickoffResetForTeam,
  getRecentLaneRepeatCount,
  isFrontLineRole,
  isSupportRole,
  getStepReceiverRoleKey,
  getAutoPilotFlowContext,
  getLastAutoPrincipleSet,
  principleSetIncludes,
  isTransitionAttackStyle,
  getSecurePossessionSnapshotForTeam,
  getAutoPilotRegainContext,
  getAutoPilotCandidatePattern,
  getRecordedStepPattern,
  getRecordedStepActorIds,
} = autoPilotDecisionContextHelpers;
const autoPilotRoleResponsibilityDecisions = createGameSimulatorAutopilotRoleResponsibilityDecisions({
  clamp,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackingDepth,
  getAutoPilotCandidatePattern,
  getOffensiveRoleKey,
  getOpponentPressureAtPoint,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getPotentialPassReceiverAtTarget,
  isFrontLineRole,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotCandidateReceiver,
  getAutoPilotRoleResponsibilityAdjustment,
} = autoPilotRoleResponsibilityDecisions;

const autoPilotPossessionPlanner = createGameSimulatorAutopilotPossessionPlanner({
  chooseWeightedOption,
  clamp,
  getAttackingDepth,
  getLaneForSideSign,
  getPitchLaneKey,
  getPossessionRhythmContext,
  getWideSideSign,
  isTransitionAttackStyle,
  randomBetween,
  randomSign,
  state,
});
const {
  getAutoPilotPossessionStartIndex,
  getAutoPilotStyleIntentSequence,
  resolvePossessionRouteLanes,
  resolveOpeningVariationLanes,
  getRecentAutoPilotPlanMemory,
  getAutoPilotPlanRepeatPenalty,
  rememberAutoPilotPossessionPlan,
  invalidateAutoPilotPossessionPlan,
  createAutoPilotPossessionRoute,
  createAutoPilotOpeningVariation,
  getAutoPilotPossessionRouteStage,
  createAutoPilotPossessionPlan,
  getAutoPilotPossessionPlan,
} = autoPilotPossessionPlanner;
const autoPilotPossessionIntentDecisions = createGameSimulatorAutopilotPossessionIntentDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAttackingThirdKey,
  getAutoPilotFlowContext,
  getAutoPilotPossessionPlan,
  getAutoPilotPossessionRouteStage,
  getForwardProgressionWindow,
  getOffensiveRoleKey,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getPossessionRhythmContext,
  getRecentLaneRepeatCount,
  isSupportRole,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotPossessionIntentContext,
  getAutoPilotPossessionIntentFit,
  getAutoPilotPossessionIntentAdjustment,
} = autoPilotPossessionIntentDecisions;
const autoPilotTempoRhythm = createGameSimulatorAutopilotTempoRhythm({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackStyleRhythmProfile,
  getAttackingDepth,
  getAttackingGameSpaceProfile,
  getAttackingThirdKey,
  getAutoPilotCandidatePattern,
  getAutoPilotFlowContext,
  getAutoPilotPossessionPlan,
  getOpponentGoalCenter,
  getOffensiveRoleKey,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getPossessionRhythmContext,
  getRecentLaneRepeatCount,
  getRecentPossessionSteps,
  getRecordedStepPattern,
  isSupportRole,
  isTransitionAttackStyle,
  possessionRhythmDefaults,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotTempoPhaseContext,
  getAutoPilotTempoPhaseAdjustment,
  getAutoPilotRhythmGovernorAdjustment,
  getAutoPilotOpeningVariationAdjustment,
} = autoPilotTempoRhythm;
const autoPilotOpponentBlockReadDecisions = createGameSimulatorAutopilotOpponentBlockReadDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAutoPilotCandidatePattern,
  getOpponentDensityAtPoint,
  getOpponentLineDepthsForAttackingTeam,
  getOtherTeamId,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getWideSideSign,
  isGoalkeeper,
  pitch,
  state,
  uniquePrincipleLabels,
});
const {
  getOpponentBlockReadProfile,
  getAutoPilotOpponentBlockReadAdjustment,
} = autoPilotOpponentBlockReadDecisions;
const autoPilotPossessionLoopDecisions = createGameSimulatorAutopilotPossessionLoopDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getActionThreatGain,
  getAttackingDepth,
  getAttackingGameSpaceProfile,
  getAttackingThirdKey,
  getAutoPilotCandidatePattern,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  getPossessionRhythmContext,
  getRecentPossessionSteps,
  getRecordedStepActorIds,
  getRecordedStepPattern,
  isWideChannel,
  uniquePrincipleLabels,
});
const {
  getAutoPilotPossessionLoopAdjustment,
  getAutoPilotCorridorTempoReleaseAdjustment,
} = autoPilotPossessionLoopDecisions;
const autoPilotCombinationChainDecisions = createGameSimulatorAutopilotCombinationChainDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingGameSpaceProfile,
  getAutoPilotCandidateReceiver,
  getNearestOpponentGap,
  getOffensiveRoleKey,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  getRecentPossessionSteps,
  getRecordedStepActorIds,
  getRecordedStepDuration,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotCombinationChainContext,
  getAutoPilotCombinationChainAdjustment,
} = autoPilotCombinationChainDecisions;
const autoPilotRiskEscapeDecisions = createGameSimulatorAutopilotRiskEscapeDecisions({
  clamp,
  computePassLaneClarity,
  distance,
  getAttackDirectionSign,
  getAutoPilotRegainContext,
  getCarryLaneOpenSpaceScore,
  getNearestOpponentGapInCarryLane,
  getOpponentDensityAtPoint,
  getOpponentPressureAtPoint,
  getPassLaneRiskProfile,
  getPitchThreatProfile,
  getTeamDensityAtPoint,
  uniquePrincipleLabels,
});
const {
  getAutoPilotPassLaneDenialAdjustment,
  getAutoPilotCounterPressEscapeAdjustment,
} = autoPilotRiskEscapeDecisions;
const autoPilotTransitionDecisions = createGameSimulatorAutopilotTransitionDecisions({
  clamp,
  clampToPitch,
  cloneVector,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotRegainContext,
  getAutoPilotRoleStrength,
  getCarryLaneOpenSpaceScore,
  getNearestOpponentGapInCarryLane,
  getOffensiveRoleKey,
  getOpponentDensityAtPoint,
  getOpponentPressureAtPoint,
  getPitchLaneIndex,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getRecentPossessionSteps,
  getRecordedStepActorIds,
  getRecordedStepDuration,
  getRecordedStepPattern,
  getRecordedStepPossessionTeamId,
  getTeamSupportCountAroundPoint,
  isFrontLineRole,
  isGoalkeeper,
  isSupportRole,
  isTransitionAttackStyle,
  lerp,
  pitch,
  state,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotRecoveryFirstActionContext,
  getAutoPilotRecoveryFirstActionAdjustment,
  getAutoPilotPostRecoveryPhaseContext,
  getAutoPilotPostRecoveryPhaseAdjustment,
  getAutoPilotTransitionNumbersContext,
  getAutoPilotTransitionNumbersAdjustment,
} = autoPilotTransitionDecisions;
const autoPilotPressureDecisions = createGameSimulatorAutopilotPressureDecisions({
  chooseScoredCandidateWithVariation,
  clamp,
  clampToPitch,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingGameSpaceProfile,
  getAutoPilotRoleStrength,
  getCarryLaneOpenSpaceScore,
  getNearestOpponentGapInCarryLane,
  getNearestOpponentGapToPoint,
  getOffensiveRoleKey,
  getOpponentBlockReadProfile,
  getOpponentDensityAtPoint,
  getOpponentPressureAtPoint,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerBallControlPoint,
  getPlayerMagnetLabel,
  getPlayerPressureLoad,
  getTeamDensityAtPoint,
  getWideSideSign,
  isFrontLineRole,
  isGoalkeeper,
  isPassReceiverOffside,
  isWidePrincipleZone,
  lerp,
  pitch,
  state,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotPressureEscapeContext,
  buildAutoPilotPressureTrapEscapeCandidate,
  getAutoPilotPressureEscapeAdjustment,
} = autoPilotPressureDecisions;
const autoPilotPatternDiversityDecisions = createGameSimulatorAutopilotPatternDiversityDecisions({
  clamp,
  distance,
  getAttackingThirdKey,
  getAutoPilotCandidatePattern,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  getPlayerTendency,
  getRecentLaneRepeatCount,
  getRecentPossessionSteps,
  getRecordedStepDuration,
  getRecordedStepPattern,
  isTransitionAttackStyle,
  uniquePrincipleLabels,
});
const {
  getAutoPilotPatternDiversityAdjustment,
  getAutoPilotRepetitionPenalty,
} = autoPilotPatternDiversityDecisions;
const autoPilotFlowDecisions = createGameSimulatorAutopilotFlowDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAutoPilotFlowContext,
  getAutoPilotRegainContext,
  getForwardProgressionWindow,
  getLastAutoPrincipleSet,
  getOffensiveRoleKey,
  getPitchLaneKey,
  getPlayerById,
  getPossessionRhythmContext,
  isFrontLineRole,
  isSupportRole,
  principleSetIncludes,
  teams,
});
const {
  getAutoPilotFlowAdjustment,
} = autoPilotFlowDecisions;
const autoPilotCarryEndProductDecisions = createGameSimulatorAutopilotCarryEndProductDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotFlowContext,
  getAutoPilotRoleStrength,
  getAutoPilotShotTarget,
  getLastAutoPrincipleSet,
  getOpponentGoalCenter,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  getShotWindowProfile,
  principleSetIncludes,
  state,
  uniquePrincipleLabels,
});
const {
  getAutoPilotCarryEndProductContext,
  getAutoPilotCarryEndProductAdjustment,
} = autoPilotCarryEndProductDecisions;
const autoPilotSpacingBonusDecisions = createGameSimulatorAutopilotSpacingBonusDecisions({
  clamp,
  distance,
  getAttackDirectionSign,
  getAttackingThirdKey,
  getPitchLaneIndex,
  getPitchLaneKey,
  getRecentLaneRepeatCount,
});
const {
  getAutoPilotSpacingBonus,
} = autoPilotSpacingBonusDecisions;
const autoPilotIntentionModelDecisions = createGameSimulatorAutopilotIntentionModelDecisions({
  clamp,
  getAttackingDepth,
  getAutoPilotFlowContext,
  getAutoPilotRegainContext,
  getForwardFacingSpaceTwoContext,
  getForwardProgressionWindow,
  getOffensiveRoleKey,
  getPlayerTendency,
  getPossessionRhythmContext,
  teams,
});
const {
  mergeIntentionWeights,
  getAutoPilotIntentionModel,
} = autoPilotIntentionModelDecisions;
const autoPilotCandidatePrincipleMetricsDecisions = createGameSimulatorAutopilotCandidatePrincipleMetricsDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getActionThreatGain,
  getAttackDirectionSign,
  getAttackingDepth,
  getOffensiveRoleKey,
  getOpponentGoalCenter,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getPlayerTendency,
  pitch,
  teams,
});
const {
  getAutoPilotCandidatePrincipleMetrics,
} = autoPilotCandidatePrincipleMetricsDecisions;
function uniquePrincipleLabels(labels) {
return [...new Set(labels.filter(Boolean))].slice(0, 3);
}
const autoPilotPrincipleScoringDecisions = createGameSimulatorAutopilotPrincipleScoringDecisions({
  clamp,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotCandidatePrincipleMetrics,
  getAutoPilotFlowContext,
  getAutoPilotIntentionModel,
  getOpponentGoalCenter,
  getOffensiveRoleKey,
  getPitchLaneIndex,
  getPitchLaneKey,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getPlayerTendency,
  getPossessionRhythmContext,
  getRecentLaneRepeatCount,
  teams,
  uniquePrincipleLabels,
});
const {
  getUniversalFootballDecisionAdjustment,
  scoreAutoPilotCandidateByIntentions,
  getAutoPilotStylePrincipleWeights,
  getAutoPilotPrincipleAdjustment,
  getAutoPilotLaneRealityAdjustment,
} = autoPilotPrincipleScoringDecisions;
const autoPilotLocalSuperiorityDecisions = createGameSimulatorAutopilotLocalSuperiorityDecisions({
  clamp,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotCandidateReceiver,
  getNearestOpponentGapToPoint,
  getOpponentPressureAtPoint,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  isGoalkeeper,
  state,
  uniquePrincipleLabels,
});
const {
  getAutoPilotLocalSuperiorityProfile,
  getAutoPilotLocalSuperiorityAdjustment,
} = autoPilotLocalSuperiorityDecisions;
const autoPilotReceiverAvailabilityDecisions = createGameSimulatorAutopilotReceiverAvailabilityDecisions({
  angleBetween,
  angleDifference,
  ballRadiusMeters,
  clamp,
  clampToPitch,
  computeTimeToCoverDistance,
  distance,
  getAttackDirectionSign,
  getAutoPilotCandidateReceiver,
  getCoverShadowInfluence,
  getNearestOpponentGap,
  getOffensiveRoleKey,
  getPassLaneRiskProfile,
  getPlayerDecisionContext,
  getPlayerFacingAngle,
  getPlayerPressureLoad,
  getReceiveFootUsageScore,
  getReceiveOrientationScore,
  isFrontLineRole,
  isSupportRole,
  isWideChannel,
  lerp,
  pitch,
  playerRadiusMeters,
  projectPointOnSegmentWithRatio,
  state,
  teams,
  uniquePrincipleLabels,
});
const {
  getReceiverAvailabilityProfile,
  getAutoPilotReceiverAvailabilityAdjustment,
  getAutoPilotReceivePressureTrapAdjustment,
} = autoPilotReceiverAvailabilityDecisions;
const autoPilotNextSupportNetworkDecisions = createGameSimulatorAutopilotNextSupportNetworkDecisions({
  clamp,
  computeTimeToCoverDistance,
  distance,
  getAttackDirectionSign,
  getAttackingDepth,
  getAutoPilotCandidateReceiver,
  getAutoPilotRoleStrength,
  getOffensiveRoleKey,
  getOpponentPressureAtPoint,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  getPlayerTendency,
  getReceptionSupportTarget,
  getWideSideSign,
  isGoalkeeper,
  isWidePrincipleZone,
  resolveBallActionProfile,
  state,
  teams,
  uniquePrincipleLabels,
});
const {
  estimateAutoPilotCandidateDuration,
  getNextSupportSlotRoleFit,
  getAutoPilotNextSupportNetworkProfile,
  getAutoPilotNextSupportNetworkAdjustment,
} = autoPilotNextSupportNetworkDecisions;
const autoPilotVisionScanDecisions = createGameSimulatorAutopilotVisionScanDecisions({
  angleBetween,
  angleDifference,
  buildPlayerIntelligenceProfile,
  clamp,
  distance,
  getAttackDirectionSign,
  getAutoPilotCandidatePattern,
  getOffensiveRoleKey,
  getOpponentGoalCenter,
  getPitchLaneIndex,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerDecisionContext,
  getPlayerFacingAngle,
  getPlayerPressureLoad,
  isSupportRole,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotVisionScanAdjustment,
} = autoPilotVisionScanDecisions;
const autoPilotSpaceLadderDecisions = createGameSimulatorAutopilotSpaceLadderDecisions({
  clamp,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAttackingGameSpaceProfile,
  getForwardProgressionWindow,
  getNearestOpponentGap,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  isPlayerFacingForward,
  isWidePrincipleZone,
  pitch,
  uniquePrincipleLabels,
});
const {
  getAutoPilotSpaceLadderContext,
  getAutoPilotSpaceLadderAdjustment,
} = autoPilotSpaceLadderDecisions;
const autoPilotAdvantageRetentionDecisions = createGameSimulatorAutopilotAdvantageRetentionDecisions({
  clamp,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAttackingGameSpaceProfile,
  getNearestOpponentGap,
  getOpponentGoalCenter,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  getPossessionRhythmContext,
  getShotWindowProfile,
  getTeamSupportCountAroundPoint,
  isPlayerFacingForward,
  uniquePrincipleLabels,
});
const {
  getAutoPilotAdvantageRetentionContext,
  getAutoPilotAdvantageRetentionAdjustment,
} = autoPilotAdvantageRetentionDecisions;
const autoPilotChanceDecisions = createGameSimulatorAutopilotChanceDecisions({
  clamp,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAttackingGameSpaceProfile,
  getAutoPilotFlowContext,
  getAutoPilotShotTarget,
  getNearestOpponentGap,
  getOffensiveRoleKey,
  getOpponentGoalCenter,
  getPitchThreatProfile,
  getPlayerById,
  getPlayerPressureLoad,
  getRecentPossessionSteps,
  getShotWindowProfile,
  isPlayerFacingForward,
  isSupportRole,
  isWideChannel,
  pitch,
  teams,
  uniquePrincipleLabels,
});
const {
  getAutoPilotEndProductUrgencyContext,
  getAutoPilotEndProductUrgencyAdjustment,
  getAutoPilotChanceHierarchyContext,
  getAutoPilotChanceHierarchyAdjustment,
} = autoPilotChanceDecisions;
const autoPilotAdvantageDecisions = createGameSimulatorAutopilotAdvantageDecisions({
  clamp,
  computePassLaneClarity,
  distance,
  getActionSpaceValue,
  getAttackDirectionSign,
  getAttackingDepth,
  getAttackingGameSpaceProfile,
  getAutoPilotFlowContext,
  getNearestOpponentGap,
  getOpponentGoalCenter,
  getPitchThreatProfile,
  getPlayerPressureLoad,
  getPossessionRhythmContext,
  getRecentPossessionSteps,
  getShotWindowProfile,
  isPlayerFacingForward,
  uniquePrincipleLabels,
});
const {
  getAutoPilotLineBreakAdvantageAdjustment,
  getAutoPilotAdvantageLifecycleContext,
  getAutoPilotAdvantageLifecycleAdjustment,
} = autoPilotAdvantageDecisions;
function getWideSideSign(pointOrPlayer) {
const y = Number.isFinite(pointOrPlayer?.y)
? pointOrPlayer.y
: Number.isFinite(pointOrPlayer?.position?.y)
? pointOrPlayer.position.y
: null;
if (!Number.isFinite(y)) {
return 0;
}
const offset = y - pitch.width / 2;
if (Math.abs(offset) < 4) {
return 0;
}
return offset < 0 ? -1 : 1;
}
function isWidePrincipleZone(point) {
if (!point) {
return false;
}
return Math.abs(point.y - pitch.width / 2) >= 12;
}

  return {
    getAutoPilotPossessionStartIndex,
    getAutoPilotStyleIntentSequence,
    resolvePossessionRouteLanes,
    resolveOpeningVariationLanes,
    getRecentAutoPilotPlanMemory,
    getAutoPilotPlanRepeatPenalty,
    rememberAutoPilotPossessionPlan,
    invalidateAutoPilotPossessionPlan,
    createAutoPilotPossessionRoute,
    createAutoPilotOpeningVariation,
    getAutoPilotPossessionRouteStage,
    createAutoPilotPossessionPlan,
    getAutoPilotPossessionPlan,
    getAutoPilotPossessionIntentContext,
    getAutoPilotPossessionIntentFit,
    getAutoPilotPossessionIntentAdjustment,
    getAutoPilotTempoPhaseContext,
    getAutoPilotTempoPhaseAdjustment,
    getAutoPilotRhythmGovernorAdjustment,
    getAutoPilotOpeningVariationAdjustment,
    getOpponentBlockReadProfile,
    getAutoPilotOpponentBlockReadAdjustment,
    isLastStepKickoffResetForTeam,
    getRecentLaneRepeatCount,
    isFrontLineRole,
    isSupportRole,
    getStepReceiverRoleKey,
    getAutoPilotFlowContext,
    getLastAutoPrincipleSet,
    principleSetIncludes,
    isTransitionAttackStyle,
    getSecurePossessionSnapshotForTeam,
    getAutoPilotRegainContext,
    getAutoPilotCandidatePattern,
    getRecordedStepPattern,
    getRecordedStepActorIds,
    getAutoPilotPossessionLoopAdjustment,
    getAutoPilotCorridorTempoReleaseAdjustment,
    getAutoPilotCombinationChainContext,
    getAutoPilotCombinationChainAdjustment,
    getAutoPilotPassLaneDenialAdjustment,
    getAutoPilotCounterPressEscapeAdjustment,
    getAutoPilotRecoveryFirstActionContext,
    getAutoPilotRecoveryFirstActionAdjustment,
    getAutoPilotPostRecoveryPhaseContext,
    getAutoPilotPostRecoveryPhaseAdjustment,
    getAutoPilotTransitionNumbersContext,
    getAutoPilotTransitionNumbersAdjustment,
    getAutoPilotPressureEscapeContext,
    buildAutoPilotPressureTrapEscapeCandidate,
    getAutoPilotPressureEscapeAdjustment,
    getAutoPilotPatternDiversityAdjustment,
    getAutoPilotRepetitionPenalty,
    getAutoPilotFlowAdjustment,
    getAutoPilotCarryEndProductContext,
    getAutoPilotCarryEndProductAdjustment,
    getAutoPilotSpacingBonus,
    mergeIntentionWeights,
    getAutoPilotIntentionModel,
    getAutoPilotCandidatePrincipleMetrics,
    getUniversalFootballDecisionAdjustment,
    getAutoPilotVisionScanAdjustment,
    scoreAutoPilotCandidateByIntentions,
    getAutoPilotStylePrincipleWeights,
    uniquePrincipleLabels,
    getAutoPilotPrincipleAdjustment,
    getAutoPilotLaneRealityAdjustment,
    getAutoPilotCandidateReceiver,
    getAutoPilotRoleResponsibilityAdjustment,
    getAutoPilotLocalSuperiorityProfile,
    getAutoPilotLocalSuperiorityAdjustment,
    getReceiverAvailabilityProfile,
    getAutoPilotReceiverAvailabilityAdjustment,
    getAutoPilotReceivePressureTrapAdjustment,
    estimateAutoPilotCandidateDuration,
    getNextSupportSlotRoleFit,
    getAutoPilotNextSupportNetworkProfile,
    getAutoPilotNextSupportNetworkAdjustment,
    getAutoPilotSpaceLadderContext,
    getAutoPilotSpaceLadderAdjustment,
    getAutoPilotAdvantageRetentionContext,
    getAutoPilotAdvantageRetentionAdjustment,
    getAutoPilotEndProductUrgencyContext,
    getAutoPilotEndProductUrgencyAdjustment,
    getAutoPilotChanceHierarchyContext,
    getAutoPilotChanceHierarchyAdjustment,
    getAutoPilotLineBreakAdvantageAdjustment,
    getAutoPilotAdvantageLifecycleContext,
    getAutoPilotAdvantageLifecycleAdjustment,
    getWideSideSign,
    isWidePrincipleZone,
  };
}
