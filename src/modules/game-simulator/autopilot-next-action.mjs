export function createGameSimulatorAutopilotNextAction(deps = {}) {
  const {
    buildAutoPilotBetweenLinesCandidate,
    buildAutoPilotBoxDeliveryCandidate,
    buildAutoPilotCornerCandidate,
    buildAutoPilotDangerZoneEscapeCandidate,
    buildAutoPilotDribbleCandidate,
    buildAutoPilotFinalThirdCombinationCandidate,
    buildAutoPilotFreeKickCandidate,
    buildAutoPilotGoalkeeperDistributionCandidate,
    buildAutoPilotKickoffCandidate,
    buildAutoPilotPassCandidates,
    buildAutoPilotPenaltyCandidate,
    buildAutoPilotPostKickoffResetCandidate,
    buildAutoPilotPressedRegainExitCandidate,
    buildAutoPilotPressureTrapEscapeCandidate,
    buildAutoPilotReceiveContinuationCandidate,
    buildAutoPilotRegainReleaseCandidate,
    buildAutoPilotShotCandidate,
    buildAutoPilotSwitchLandingContinuationCandidate,
    buildAutoPilotThroughBallCandidate,
    buildAutoPilotThrowInCandidate,
    buildAutoPilotWideOverlapCandidate,
    chooseScoredCandidateWithVariation,
    clamp,
    cloneVector,
    getAutoPilotAdvantageLifecycleAdjustment,
    getAutoPilotAdvantageRetentionAdjustment,
    getAutoPilotCarryEndProductAdjustment,
    getAutoPilotChanceHierarchyAdjustment,
    getAutoPilotCombinationChainAdjustment,
    getAutoPilotCorridorTempoReleaseAdjustment,
    getAutoPilotCounterPressEscapeAdjustment,
    getAutoPilotEndProductUrgencyAdjustment,
    getAutoPilotFirstActionAfterReceiveAdjustment,
    getAutoPilotFlowAdjustment,
    getAutoPilotGameSpaceAdjustment,
    getAutoPilotLaneRealityAdjustment,
    getAutoPilotLineBreakAdvantageAdjustment,
    getAutoPilotLocalSuperiorityAdjustment,
    getAutoPilotNextSupportNetworkAdjustment,
    getAutoPilotOpeningVariationAdjustment,
    getAutoPilotOpponentBlockReadAdjustment,
    getAutoPilotPassLaneDenialAdjustment,
    getAutoPilotPatternDiversityAdjustment,
    getAutoPilotPossessionIntentAdjustment,
    getAutoPilotPossessionLoopAdjustment,
    getAutoPilotPossessionPlayer,
    getAutoPilotPostRecoveryPhaseAdjustment,
    getAutoPilotPressureEscapeAdjustment,
    getAutoPilotPrincipleAdjustment,
    getAutoPilotReceiveFlowAdjustment,
    getAutoPilotReceiveMomentumAdjustment,
    getAutoPilotReceivePressureTrapAdjustment,
    getAutoPilotReceiverAvailabilityAdjustment,
    getAutoPilotRecoveryFirstActionAdjustment,
    getAutoPilotRepetitionPenalty,
    getAutoPilotRhythmGovernorAdjustment,
    getAutoPilotRoleResponsibilityAdjustment,
    getAutoPilotSpaceDominanceAdjustment,
    getAutoPilotSpaceLadderAdjustment,
    getAutoPilotSpaceTwoAdvantageAdjustment,
    getAutoPilotSpacingBonus,
    getAutoPilotSpatialDecisionAdjustment,
    getAutoPilotTempoPhaseAdjustment,
    getAutoPilotTransitionNumbersAdjustment,
    getAutoPilotVisionScanAdjustment,
    getOffensiveAutopilotProfile,
    getPlayerBallControlPoint,
    getState,
    teams,
    uniquePrincipleLabels,
  } = deps;

  function chooseAutoPilotNextAction() {
  const state = getState();
  const carrier = getAutoPilotPossessionPlayer();
  if (!carrier) {
  return null;
  }
  const startPoint = cloneVector(getPlayerBallControlPoint(carrier));
  state.ball.ownerPlayerId = carrier.id;
  state.ball.position = cloneVector(startPoint);
  state.ball.startPosition = cloneVector(startPoint);
  state.ball.target = cloneVector(startPoint);
  const teamId = carrier.team;
  const profile = getOffensiveAutopilotProfile(teamId, startPoint);
  const kickoffChoice = buildAutoPilotKickoffCandidate(carrier, startPoint, profile);
  if (kickoffChoice) {
  return {
  ...kickoffChoice,
  carrier,
  teamId,
  phaseLabel: profile.phaseLabel,
  styleLabel: profile.styleLabel,
  formation: teams[teamId]?.formation,
  };
  }
  const postKickoffResetChoice = buildAutoPilotPostKickoffResetCandidate(carrier, startPoint, profile);
  if (postKickoffResetChoice) {
  return {
  ...postKickoffResetChoice,
  carrier,
  teamId,
  phaseLabel: profile.phaseLabel,
  styleLabel: profile.styleLabel,
  formation: teams[teamId]?.formation,
  };
  }
  const cornerChoice = buildAutoPilotCornerCandidate(carrier, startPoint, profile);
  if (cornerChoice) {
  return {
  ...cornerChoice,
  carrier,
  teamId,
  phaseLabel: profile.phaseLabel,
  styleLabel: profile.styleLabel,
  formation: teams[teamId]?.formation,
  };
  }
  const penaltyChoice = buildAutoPilotPenaltyCandidate(carrier, startPoint, profile);
  if (penaltyChoice) {
  return {
  ...penaltyChoice,
  carrier,
  teamId,
  phaseLabel: profile.phaseLabel,
  styleLabel: profile.styleLabel,
  formation: teams[teamId]?.formation,
  };
  }
  const freeKickChoice = buildAutoPilotFreeKickCandidate(carrier, startPoint, profile);
  if (freeKickChoice) {
  return {
  ...freeKickChoice,
  carrier,
  teamId,
  phaseLabel: profile.phaseLabel,
  styleLabel: profile.styleLabel,
  formation: teams[teamId]?.formation,
  };
  }
  const throwInChoice = buildAutoPilotThrowInCandidate(carrier, startPoint, profile);
  if (throwInChoice) {
  return {
  ...throwInChoice,
  carrier,
  teamId,
  phaseLabel: profile.phaseLabel,
  styleLabel: profile.styleLabel,
  formation: teams[teamId]?.formation,
  };
  }
  const candidates = [
  buildAutoPilotGoalkeeperDistributionCandidate(carrier, startPoint, profile),
  buildAutoPilotDangerZoneEscapeCandidate(carrier, startPoint, profile),
  buildAutoPilotPressedRegainExitCandidate(carrier, startPoint, profile),
  buildAutoPilotRegainReleaseCandidate(carrier, startPoint, profile),
  buildAutoPilotPressureTrapEscapeCandidate(carrier, startPoint, profile),
  buildAutoPilotReceiveContinuationCandidate(carrier, startPoint, profile),
  buildAutoPilotSwitchLandingContinuationCandidate(carrier, startPoint, profile),
  buildAutoPilotShotCandidate(carrier, startPoint, profile),
  buildAutoPilotFinalThirdCombinationCandidate(carrier, startPoint, profile),
  buildAutoPilotBoxDeliveryCandidate(carrier, startPoint, profile),
  buildAutoPilotWideOverlapCandidate(carrier, startPoint, profile),
  buildAutoPilotBetweenLinesCandidate(carrier, startPoint, profile),
  buildAutoPilotThroughBallCandidate(carrier, startPoint, profile),
  buildAutoPilotDribbleCandidate(carrier, startPoint, profile),
  ...buildAutoPilotPassCandidates(carrier, startPoint, profile),
  ]
  .filter(Boolean)
  .map((candidate) => {
  const spacingBonus = getAutoPilotSpacingBonus(candidate, carrier, startPoint, profile);
  const repetitionPenalty = getAutoPilotRepetitionPenalty(candidate, carrier, startPoint, profile);
  const flowAdjustment = getAutoPilotFlowAdjustment(candidate, carrier, startPoint, profile);
  const principleAdjustment = getAutoPilotPrincipleAdjustment(candidate, carrier, startPoint, profile);
  const possessionIntentAdjustment = getAutoPilotPossessionIntentAdjustment(candidate, carrier, startPoint, profile);
  const tempoPhaseAdjustment = getAutoPilotTempoPhaseAdjustment(candidate, carrier, startPoint, profile);
  const rhythmGovernorAdjustment = getAutoPilotRhythmGovernorAdjustment(candidate, carrier, startPoint, profile);
  const openingVariationAdjustment = getAutoPilotOpeningVariationAdjustment(candidate, carrier, startPoint, profile);
  const opponentBlockReadAdjustment = getAutoPilotOpponentBlockReadAdjustment(candidate, carrier, startPoint, profile);
  const patternDiversityAdjustment = getAutoPilotPatternDiversityAdjustment(candidate, carrier, startPoint, profile);
  const receiveMomentumAdjustment = getAutoPilotReceiveMomentumAdjustment(candidate, carrier, startPoint, profile);
  const firstActionAfterReceiveAdjustment = getAutoPilotFirstActionAfterReceiveAdjustment(candidate, carrier, startPoint, profile);
  const receiveFlowAdjustment = getAutoPilotReceiveFlowAdjustment(candidate, carrier, startPoint, profile);
  const gameSpaceAdjustment = getAutoPilotGameSpaceAdjustment(candidate, carrier, startPoint, profile);
  const spatialDecisionAdjustment = getAutoPilotSpatialDecisionAdjustment(candidate, carrier, startPoint, profile);
  const laneRealityAdjustment = getAutoPilotLaneRealityAdjustment(candidate, carrier, startPoint, profile);
  const receiverAvailabilityAdjustment = getAutoPilotReceiverAvailabilityAdjustment(candidate, carrier, startPoint, profile);
  const receivePressureTrapAdjustment = getAutoPilotReceivePressureTrapAdjustment(candidate, carrier, startPoint, profile);
  const spaceDominanceAdjustment = getAutoPilotSpaceDominanceAdjustment(candidate, carrier, startPoint, profile);
  const carryEndProductAdjustment = getAutoPilotCarryEndProductAdjustment(candidate, carrier, startPoint, profile);
  const spaceTwoAdvantageAdjustment = getAutoPilotSpaceTwoAdvantageAdjustment(candidate, carrier, startPoint, profile);
  const possessionLoopAdjustment = getAutoPilotPossessionLoopAdjustment(candidate, carrier, startPoint, profile);
  const corridorTempoReleaseAdjustment = getAutoPilotCorridorTempoReleaseAdjustment(candidate, carrier, startPoint, profile);
  const nextSupportNetworkAdjustment = getAutoPilotNextSupportNetworkAdjustment(candidate, carrier, startPoint, profile);
  const spaceLadderAdjustment = getAutoPilotSpaceLadderAdjustment(candidate, carrier, startPoint, profile);
  const advantageRetentionAdjustment = getAutoPilotAdvantageRetentionAdjustment(candidate, carrier, startPoint, profile);
  const endProductUrgencyAdjustment = getAutoPilotEndProductUrgencyAdjustment(candidate, carrier, startPoint, profile);
  const chanceHierarchyAdjustment = getAutoPilotChanceHierarchyAdjustment(candidate, carrier, startPoint, profile);
  const lineBreakAdvantageAdjustment = getAutoPilotLineBreakAdvantageAdjustment(candidate, carrier, startPoint, profile);
  const advantageLifecycleAdjustment = getAutoPilotAdvantageLifecycleAdjustment(candidate, carrier, startPoint, profile);
  const combinationChainAdjustment = getAutoPilotCombinationChainAdjustment(candidate, carrier, startPoint, profile);
  const passLaneDenialAdjustment = getAutoPilotPassLaneDenialAdjustment(candidate, carrier, startPoint, profile);
  const counterPressEscapeAdjustment = getAutoPilotCounterPressEscapeAdjustment(candidate, carrier, startPoint, profile);
  const recoveryFirstActionAdjustment = getAutoPilotRecoveryFirstActionAdjustment(candidate, carrier, startPoint, profile);
  const postRecoveryPhaseAdjustment = getAutoPilotPostRecoveryPhaseAdjustment(candidate, carrier, startPoint, profile);
  const transitionNumbersAdjustment = getAutoPilotTransitionNumbersAdjustment(candidate, carrier, startPoint, profile);
  const pressureEscapeAdjustment = getAutoPilotPressureEscapeAdjustment(candidate, carrier, startPoint, profile);
  const visionScanAdjustment = getAutoPilotVisionScanAdjustment(candidate, carrier, startPoint, profile);
  const roleResponsibilityAdjustment = getAutoPilotRoleResponsibilityAdjustment(candidate, carrier, startPoint, profile);
  const localSuperiorityAdjustment = getAutoPilotLocalSuperiorityAdjustment(candidate, carrier, startPoint, profile);
  return {
  ...candidate,
  rawScore: candidate.score,
  spacingBonus,
  repetitionPenalty,
  flowAdjustment,
  principleAdjustment: principleAdjustment.score,
  possessionIntentAdjustment: possessionIntentAdjustment.score,
  tempoPhaseAdjustment: tempoPhaseAdjustment.score,
  rhythmGovernorAdjustment: rhythmGovernorAdjustment.score,
  openingVariationAdjustment: openingVariationAdjustment.score,
  opponentBlockReadAdjustment: opponentBlockReadAdjustment.score,
  patternDiversityAdjustment: patternDiversityAdjustment.score,
  receiveMomentumAdjustment: receiveMomentumAdjustment.score,
  firstActionAfterReceiveAdjustment: firstActionAfterReceiveAdjustment.score,
  receiveFlowAdjustment: receiveFlowAdjustment.score,
  gameSpaceAdjustment: gameSpaceAdjustment.score,
  spatialDecisionAdjustment: spatialDecisionAdjustment.score,
  laneRealityAdjustment: laneRealityAdjustment.score,
  receiverAvailabilityAdjustment: receiverAvailabilityAdjustment.score,
  receivePressureTrapAdjustment: receivePressureTrapAdjustment.score,
  spaceDominanceAdjustment: spaceDominanceAdjustment.score,
  carryEndProductAdjustment: carryEndProductAdjustment.score,
  spaceTwoAdvantageAdjustment: spaceTwoAdvantageAdjustment.score,
  possessionLoopAdjustment: possessionLoopAdjustment.score,
  corridorTempoReleaseAdjustment: corridorTempoReleaseAdjustment.score,
  nextSupportNetworkAdjustment: nextSupportNetworkAdjustment.score,
  spaceLadderAdjustment: spaceLadderAdjustment.score,
  advantageRetentionAdjustment: advantageRetentionAdjustment.score,
  endProductUrgencyAdjustment: endProductUrgencyAdjustment.score,
  chanceHierarchyAdjustment: chanceHierarchyAdjustment.score,
  lineBreakAdvantageAdjustment: lineBreakAdvantageAdjustment.score,
  advantageLifecycleAdjustment: advantageLifecycleAdjustment.score,
  combinationChainAdjustment: combinationChainAdjustment.score,
  passLaneDenialAdjustment: passLaneDenialAdjustment.score,
  counterPressEscapeAdjustment: counterPressEscapeAdjustment.score,
  recoveryFirstActionAdjustment: recoveryFirstActionAdjustment.score,
  postRecoveryPhaseAdjustment: postRecoveryPhaseAdjustment.score,
  transitionNumbersAdjustment: transitionNumbersAdjustment.score,
  pressureEscapeAdjustment: pressureEscapeAdjustment.score,
  visionScanAdjustment: visionScanAdjustment.score,
  roleResponsibilityAdjustment: roleResponsibilityAdjustment.score,
  localSuperiorityAdjustment: localSuperiorityAdjustment.score,
  receiveFlowContext: receiveFlowAdjustment.context ?? null,
  tempoPhaseContext: tempoPhaseAdjustment.context ?? null,
  rhythmGovernorContext: rhythmGovernorAdjustment.context ?? null,
  gameSpaceContext: gameSpaceAdjustment.context ?? null,
  spatialDecisionContext: spatialDecisionAdjustment.context ?? null,
  carryEndProductContext: carryEndProductAdjustment.context ?? null,
  spaceTwoAdvantageContext: spaceTwoAdvantageAdjustment.context ?? null,
  possessionLoopContext: possessionLoopAdjustment.context ?? null,
  corridorTempoReleaseContext: corridorTempoReleaseAdjustment.context ?? null,
  nextSupportNetwork: nextSupportNetworkAdjustment.network ?? null,
  spaceLadderContext: spaceLadderAdjustment.context ?? null,
  advantageRetentionContext: advantageRetentionAdjustment.context ?? null,
  endProductUrgencyContext: endProductUrgencyAdjustment.context ?? null,
  chanceHierarchyContext: chanceHierarchyAdjustment.context ?? null,
  lineBreakAdvantageContext: lineBreakAdvantageAdjustment.context ?? null,
  advantageLifecycleContext: advantageLifecycleAdjustment.context ?? null,
  combinationChainContext: combinationChainAdjustment.context ?? null,
  passLaneDenialContext: passLaneDenialAdjustment.context ?? null,
  counterPressEscapeContext: counterPressEscapeAdjustment.context ?? null,
  recoveryFirstActionContext: recoveryFirstActionAdjustment.context ?? null,
  postRecoveryPhaseContext: postRecoveryPhaseAdjustment.context ?? null,
  transitionNumbersContext: transitionNumbersAdjustment.context ?? null,
  pressureEscapeContext: pressureEscapeAdjustment.context ?? null,
  visionScanContext: visionScanAdjustment.context ?? null,
  roleResponsibilityContext: roleResponsibilityAdjustment.context ?? null,
  localSuperiorityContext: localSuperiorityAdjustment.context ?? null,
  receivePressureTrapContext: receivePressureTrapAdjustment.context ?? null,
  opponentBlockRead: opponentBlockReadAdjustment.block ?? null,
  spaceDominance: spaceDominanceAdjustment.dominance ?? null,
  receiverAvailability: receiverAvailabilityAdjustment.availability ?? null,
  patternFamily: patternDiversityAdjustment.pattern?.family ?? null,
  possessionIntent: possessionIntentAdjustment.intentKey,
  principleLabels: uniquePrincipleLabels([
  candidate.principleLabel,
  ...(candidate.principleLabels ?? []),
  ...principleAdjustment.labels,
  ...possessionIntentAdjustment.labels,
  ...tempoPhaseAdjustment.labels,
  ...rhythmGovernorAdjustment.labels,
  ...openingVariationAdjustment.labels,
  ...opponentBlockReadAdjustment.labels,
  ...patternDiversityAdjustment.labels,
  ...receiveMomentumAdjustment.labels,
  ...firstActionAfterReceiveAdjustment.labels,
  ...receiveFlowAdjustment.labels,
  ...gameSpaceAdjustment.labels,
  ...spatialDecisionAdjustment.labels,
  ...laneRealityAdjustment.labels,
  ...receiverAvailabilityAdjustment.labels,
  ...receivePressureTrapAdjustment.labels,
  ...spaceDominanceAdjustment.labels,
  ...carryEndProductAdjustment.labels,
  ...spaceTwoAdvantageAdjustment.labels,
  ...possessionLoopAdjustment.labels,
  ...corridorTempoReleaseAdjustment.labels,
  ...nextSupportNetworkAdjustment.labels,
  ...spaceLadderAdjustment.labels,
  ...advantageRetentionAdjustment.labels,
  ...endProductUrgencyAdjustment.labels,
  ...chanceHierarchyAdjustment.labels,
  ...lineBreakAdvantageAdjustment.labels,
  ...advantageLifecycleAdjustment.labels,
  ...combinationChainAdjustment.labels,
  ...passLaneDenialAdjustment.labels,
  ...counterPressEscapeAdjustment.labels,
  ...recoveryFirstActionAdjustment.labels,
  ...postRecoveryPhaseAdjustment.labels,
  ...transitionNumbersAdjustment.labels,
  ...pressureEscapeAdjustment.labels,
  ...visionScanAdjustment.labels,
  ...roleResponsibilityAdjustment.labels,
  ...localSuperiorityAdjustment.labels,
  ]),
  score:
  candidate.score +
  spacingBonus +
  flowAdjustment +
  principleAdjustment.score +
  possessionIntentAdjustment.score +
  tempoPhaseAdjustment.score +
  rhythmGovernorAdjustment.score +
  openingVariationAdjustment.score -
  repetitionPenalty +
  opponentBlockReadAdjustment.score +
  patternDiversityAdjustment.score +
  receiveMomentumAdjustment.score +
  firstActionAfterReceiveAdjustment.score +
  receiveFlowAdjustment.score +
  gameSpaceAdjustment.score +
  spatialDecisionAdjustment.score +
  laneRealityAdjustment.score +
  receiverAvailabilityAdjustment.score +
  receivePressureTrapAdjustment.score +
  spaceDominanceAdjustment.score +
  carryEndProductAdjustment.score +
  spaceTwoAdvantageAdjustment.score +
  possessionLoopAdjustment.score +
  corridorTempoReleaseAdjustment.score +
  nextSupportNetworkAdjustment.score +
  spaceLadderAdjustment.score +
  advantageRetentionAdjustment.score +
  endProductUrgencyAdjustment.score +
  chanceHierarchyAdjustment.score +
  lineBreakAdvantageAdjustment.score +
  advantageLifecycleAdjustment.score +
  combinationChainAdjustment.score +
  passLaneDenialAdjustment.score +
  counterPressEscapeAdjustment.score +
  recoveryFirstActionAdjustment.score +
  postRecoveryPhaseAdjustment.score +
  transitionNumbersAdjustment.score +
  pressureEscapeAdjustment.score +
  visionScanAdjustment.score +
  roleResponsibilityAdjustment.score +
  localSuperiorityAdjustment.score,
  };
  })
  .filter((candidate) => candidate.score >= 1.25 || candidate.actionType === "shot");
  if (!candidates.length) {
  return null;
  }
  candidates.sort((a, b) => b.score - a.score);
  const bestCandidate = candidates[0];
  const shotTolerance = profile.phaseKey === "finalThird" ? 1.8 : 0.85;
  const shotCandidate = candidates.find(
  (candidate) =>
  candidate.actionType === "shot" &&
  (candidate.mustShoot || candidate.score >= bestCandidate.score - shotTolerance)
  );
  const selectedCandidate = shotCandidate?.mustShoot
  ? shotCandidate
  : chooseScoredCandidateWithVariation(candidates, profile, {
  preferredCandidate: shotCandidate ?? null,
  tolerance: clamp(
  0.72 + profile.risk * 0.52 + profile.tempo * 0.26 + (profile.phaseKey === "finalThird" ? 0.34 : 0),
  0.72,
  1.65
  ),
  temperature: clamp(0.24 + profile.risk * 0.18 + profile.tempo * 0.12, 0.22, 0.62),
  carrier,
  startPoint,
  }) ?? bestCandidate;
  return {
  ...selectedCandidate,
  carrier,
  teamId,
  phaseLabel: profile.phaseLabel,
  styleLabel: profile.styleLabel,
  formation: teams[teamId]?.formation,
  };
  }

  return {
    chooseAutoPilotNextAction,
  };
}
