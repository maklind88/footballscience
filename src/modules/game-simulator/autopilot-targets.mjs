export function createGameSimulatorAutopilotTargets(deps = {}) {
  const {
    applyAttackingBoxOccupationChainTargets,
    applyAutopilotTargetVariation,
    applyBallNearSupportTriangleTargets,
    applyBlindsideChannelRunTargets,
    applyDefensiveBackLineHandoverTargets,
    applyDefensiveBoxDeliveryChainTargets,
    applyDefensiveCarryContainmentTargets,
    applyDefensiveCentralAccessGateTargets,
    applyDefensiveChanceDenialTargets,
    applyDefensiveCornerSetPieceTargets,
    applyDefensiveEmergencyCoverTargets,
    applyDefensiveFreeKickSetPieceTargets,
    applyDefensiveGameSpaceResponseTargets,
    applyDefensiveGoalkeeperShotSetTarget,
    applyDefensiveGoalkeeperSweeperTarget,
    applyDefensiveLineBreakAdvantageCollapseTargets,
    applyDefensiveLocalOverloadResponseTargets,
    applyDefensiveLooseBallRecoveryTrapTargets,
    applyDefensiveOpenPlayTriggerTargets,
    applyDefensivePassLaneDenialTargets,
    applyDefensivePenaltySetPieceTargets,
    applyDefensivePostRecoveryResponseTargets,
    applyDefensivePressChainSupportTargets,
    applyDefensivePresserAngleTarget,
    applyDefensivePressureCoverBalanceTargets,
    applyDefensivePrioritySpaceProtectionTargets,
    applyDefensiveReceiveContinuationTargets,
    applyDefensiveReceptionTrapTargets,
    applyDefensiveRouteAnticipationTargets,
    applyDefensiveRunnerTrackingTargets,
    applyDefensiveSecondBallAnticipationTargets,
    applyDefensiveSwitchLandingLockTargets,
    applyDefensiveSwitchRecoveryTargets,
    applyDefensiveThrowInSetPieceTargets,
    applyGenerativePrincipleSupportTargets,
    applyGoalkeeperBuildOutPressTargets,
    applyLocalSuperioritySupportTargets,
    applyLooseBallRecoverySupportTargets,
    applyNegativeTransitionDefensiveTargets,
    applyOffensivePassingGeometryTargets,
    applyOffensiveRestDefenceNetTargets,
    applyOffensiveSecondBallAnticipationTargets,
    applyPasserContinuationTargets,
    applyPostRecoveryAttackSupportTargets,
    applyPressEscapeContinuationTargets,
    applyPressResistanceEscapeSupportTargets,
    applySpaceTwoContinuationTargets,
    applySpaceTwoForwardFacingTargets,
    applySwitchLandingAttackTargets,
    applyThirdManChainSupportTargets,
    applyTimedFinalThirdBoxArrivals,
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
    chooseDefensiveAutopilotPresser,
    chooseDefensiveDribblePresser,
    chooseOffensiveAutopilotRunner,
    chooseScoredCandidateWithVariation,
    clamp,
    clampToPitch,
    cloneVector,
    enforceDefensiveBlockGeometryLock,
    enforceDefensiveCollectiveShiftCohesion,
    enforceDefensiveCompactLineIntegrity,
    enforceDefensiveLineChainSpacing,
    enforceDefensiveLineStaggering,
    enforceDefensiveMeasuredBlockEnvelope,
    enforceDefensiveOffsideLineControl,
    enforceDefensiveUnitCompactness,
    enforceDefensiveVerticalBlockConnections,
    enforceOffensiveFiveLaneOccupation,
    enforceOffensiveOccupationZones,
    enforceOffensiveOnsideLineAwareness,
    enforceOffensiveStructureBalance,
    enforceOffensiveTargetSpacing,
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
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveDribblePressTarget,
    getDefensiveGoalkeeperTarget,
    getDefensiveLineActionLabels,
    getDefensiveLineCenterY,
    getDefensiveLineWidth,
    getDefensiveLineX,
    getDefensivePhaseKey,
    getDefensivePressTarget,
    getDribblePressureReference,
    getFormationPositions,
    getOffensiveActionPrinciple,
    getOffensiveAutopilotProfile,
    getOffensiveAutopilotTarget,
    getOffensivePhaseKey,
    getPlayerBallControlPoint,
    getState,
    lerp,
    pitch,
    shouldSkipOffensiveAutopilotPlayer,
    teamRosterOrder,
    teams,
    uniquePrincipleLabels,
  } = deps;

function buildOffensiveAutopilotTargets(teamId, ballPoint) {
const state = getState();
const formation = teams[teamId]?.formation ?? "4-3-3";
const phaseKey = getOffensivePhaseKey(teamId, ballPoint);
const profile = getOffensiveAutopilotProfile(teamId, ballPoint, phaseKey);
const roster = teamRosterOrder[teamId] ?? [];
const basePositions = getFormationPositions(formation, teamId);
const baseYById = new Map(
roster.map((playerId, index) => [playerId, basePositions[index]?.y ?? pitch.width / 2])
);
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
carrierPlayerId: state.ball.carrierPlayerId,
receiverPlayerId: state.ball.receiverPlayerId,
beforeSnapshot: {
ball: {
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const targets = new Map();
state.players
.filter((player) => player.team === teamId && !shouldSkipOffensiveAutopilotPlayer(player, actionMeta))
.forEach((player) => {
targets.set(
player.id,
getOffensiveAutopilotTarget(
player,
ballPoint,
actionMeta,
profile,
baseYById.get(player.id) ?? player.position.y
)
);
});
let runner = chooseOffensiveAutopilotRunner(teamId, targets, actionMeta, ballPoint, profile);
if (runner) {
targets.set(
runner.id,
getOffensiveAutopilotTarget(
runner,
ballPoint,
actionMeta,
profile,
baseYById.get(runner.id) ?? runner.position.y,
true
)
);
}
enforceOffensiveOccupationZones(teamId, targets, ballPoint, profile);
enforceOffensiveTargetSpacing(teamId, targets, ballPoint, profile);
const principle = getOffensiveActionPrinciple(teamId, ballPoint, actionMeta, profile);
if (principle?.runner) {
runner = principle.runner;
targets.set(principle.runner.id, principle.runnerTarget);
}
const supportPrinciple = applyGenerativePrincipleSupportTargets(teamId, targets, ballPoint, actionMeta, profile);
const coreProtectedIds = new Set([
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
principle?.runner?.id,
...(supportPrinciple.protectedIds ?? []),
].filter(Boolean));
const structureBalanceLabels = enforceOffensiveStructureBalance(
teamId,
targets,
ballPoint,
actionMeta,
profile,
coreProtectedIds
);
const fiveLaneLabels = enforceOffensiveFiveLaneOccupation(
teamId,
targets,
ballPoint,
actionMeta,
profile,
coreProtectedIds
);
const ballNearTriangleLabels = applyBallNearSupportTriangleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
coreProtectedIds
);
const looseBallRecoverySupport = applyLooseBallRecoverySupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
])
);
const postRecoveryAttackSupport = applyPostRecoveryAttackSupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
])
);
const restDefenceNet = applyOffensiveRestDefenceNetTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
])
);
const escapeSupport = applyPressResistanceEscapeSupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
])
);
const escapeContinuation = applyPressEscapeContinuationTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
])
);
const switchLandingAttack = applySwitchLandingAttackTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
])
);
enforceOffensiveOccupationZones(teamId, targets, ballPoint, profile);
enforceOffensiveTargetSpacing(teamId, targets, ballPoint, profile);
const blindsideChannelRuns = applyBlindsideChannelRunTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
])
);
const passerContinuation = applyPasserContinuationTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile
);
const thirdManChainSupport = applyThirdManChainSupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
])
);
const spaceTwoForwardFacing = applySpaceTwoForwardFacingTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
])
);
const spaceTwoContinuation = applySpaceTwoContinuationTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
...(spaceTwoForwardFacing.protectedIds ?? []),
])
);
const passingGeometry = applyOffensivePassingGeometryTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
...(spaceTwoForwardFacing.protectedIds ?? []),
...(spaceTwoContinuation.protectedIds ?? []),
])
);
const boxOccupationChain = applyAttackingBoxOccupationChainTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
...(spaceTwoForwardFacing.protectedIds ?? []),
...(spaceTwoContinuation.protectedIds ?? []),
...(passingGeometry.protectedIds ?? []),
])
);
const timedBoxArrivals = applyTimedFinalThirdBoxArrivals(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
...(spaceTwoForwardFacing.protectedIds ?? []),
...(spaceTwoContinuation.protectedIds ?? []),
...(passingGeometry.protectedIds ?? []),
])
);
const localSuperioritySupport = applyLocalSuperioritySupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
...(spaceTwoForwardFacing.protectedIds ?? []),
...(spaceTwoContinuation.protectedIds ?? []),
...(passingGeometry.protectedIds ?? []),
...(boxOccupationChain.protectedIds ?? []),
...(timedBoxArrivals.protectedIds ?? []),
])
);
const secondBallAnticipation = applyOffensiveSecondBallAnticipationTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
new Set([
...coreProtectedIds,
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeSupport.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
...(spaceTwoForwardFacing.protectedIds ?? []),
...(spaceTwoContinuation.protectedIds ?? []),
...(passingGeometry.protectedIds ?? []),
...(boxOccupationChain.protectedIds ?? []),
...(timedBoxArrivals.protectedIds ?? []),
...(localSuperioritySupport.protectedIds ?? []),
])
);
const finalProtectedIds = new Set([
...coreProtectedIds,
...(escapeSupport.protectedIds ?? []),
...(looseBallRecoverySupport.protectedIds ?? []),
...(postRecoveryAttackSupport.protectedIds ?? []),
...(restDefenceNet.protectedIds ?? []),
...(escapeContinuation.protectedIds ?? []),
...(switchLandingAttack.protectedIds ?? []),
...(blindsideChannelRuns.protectedIds ?? []),
...(passerContinuation.protectedIds ?? []),
...(thirdManChainSupport.protectedIds ?? []),
...(spaceTwoForwardFacing.protectedIds ?? []),
...(spaceTwoContinuation.protectedIds ?? []),
...(passingGeometry.protectedIds ?? []),
...(boxOccupationChain.protectedIds ?? []),
...(timedBoxArrivals.protectedIds ?? []),
...(localSuperioritySupport.protectedIds ?? []),
...(secondBallAnticipation.protectedIds ?? []),
]);
const onsideLineLabels = enforceOffensiveOnsideLineAwareness(
teamId,
targets,
ballPoint,
profile,
new Set([
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean))
);
enforceOffensiveTargetSpacing(teamId, targets, ballPoint, profile, finalProtectedIds);
const principleLabels = uniquePrincipleLabels([
principle?.label,
...(supportPrinciple.labels ?? []),
...(structureBalanceLabels ?? []),
...(fiveLaneLabels ?? []),
...(ballNearTriangleLabels ?? []),
...(looseBallRecoverySupport.labels ?? []),
...(postRecoveryAttackSupport.labels ?? []),
...(restDefenceNet.labels ?? []),
...(escapeSupport.labels ?? []),
...(escapeContinuation.labels ?? []),
...(switchLandingAttack.labels ?? []),
...(blindsideChannelRuns.labels ?? []),
...(passerContinuation.labels ?? []),
...(thirdManChainSupport.labels ?? []),
...(spaceTwoForwardFacing.labels ?? []),
...(spaceTwoContinuation.labels ?? []),
...(passingGeometry.labels ?? []),
...(boxOccupationChain.labels ?? []),
...(timedBoxArrivals.labels ?? []),
...(localSuperioritySupport.labels ?? []),
...(secondBallAnticipation.labels ?? []),
...(onsideLineLabels ?? []),
]);
const resolvedPrinciple = principleLabels.length
? {
...(principle ?? {}),
key: principle?.key ?? "generative-principle-chain",
label: principleLabels.join("; "),
}
: principle;
applyAutopilotTargetVariation(
teamId,
targets,
profile,
"attack",
new Set([
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
...finalProtectedIds,
].filter(Boolean))
);
enforceOffensiveOnsideLineAwareness(
teamId,
targets,
ballPoint,
profile,
new Set([
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean))
);
enforceOffensiveTargetSpacing(teamId, targets, ballPoint, profile, finalProtectedIds);
return {
targets,
runner,
profile,
principle: resolvedPrinciple,
};
}

function buildDefensiveAutopilotTargets(teamId, ballPoint) {
const state = getState();
const formation = teams[teamId]?.formation ?? "4-3-3";
const phaseKey = getDefensivePhaseKey(teamId, ballPoint);
const profile = getDefensiveAutopilotProfile(teamId, ballPoint, phaseKey);
const roster = teamRosterOrder[teamId] ?? [];
const basePositions = getFormationPositions(formation, teamId);
const baseYById = new Map(
roster.map((playerId, index) => [playerId, basePositions[index]?.y ?? pitch.width / 2])
);
const groups = {
gk: [],
back: [],
midfield: [],
forward: [],
};
state.players
.filter((player) => player.team === teamId)
.forEach((player) => {
groups[getDefensiveAutopilotLineKey(player, formation, profile.phaseKey)].push(player);
});
Object.values(groups).forEach((group) => {
group.sort((a, b) => (baseYById.get(a.id) ?? a.position.y) - (baseYById.get(b.id) ?? b.position.y));
});
const targets = new Map();
groups.gk.forEach((player) => {
targets.set(player.id, getDefensiveGoalkeeperTarget(teamId, ballPoint, profile));
});
["back", "midfield", "forward"].forEach((lineKey) => {
const players = groups[lineKey];
if (!players.length) {
return;
}
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const lineWidth = getDefensiveLineWidth(lineKey, profile, ballPoint, players.length);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const phaseInsideBoost = profile.phaseKey === "boxDefending" ? 0.08 : profile.phaseKey === "lowBlock" ? 0.04 : 0;
const insidePull =
(lineKey === "forward" ? 0.18 : lineKey === "midfield" ? 0.13 : 0.08) +
phaseInsideBoost;
players.forEach((player, index) => {
const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
const spreadY = centerY - lineWidth / 2 + lineWidth * spreadRatio;
const targetY = lerp(spreadY, ballPoint.y, insidePull);
targets.set(player.id, clampToPitch({
x: lineX,
y: clamp(targetY, 3, pitch.width - 3),
}, 3));
});
});
const cornerSetPiece = applyDefensiveCornerSetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (cornerSetPiece.active) {
return {
targets,
presser: cornerSetPiece.presser,
profile,
protectionLabels: cornerSetPiece.labels,
focusPoint: cornerSetPiece.focusPoint,
};
}
const freeKickSetPiece = applyDefensiveFreeKickSetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (freeKickSetPiece.active) {
return {
targets,
presser: freeKickSetPiece.presser,
profile,
protectionLabels: freeKickSetPiece.labels,
focusPoint: freeKickSetPiece.focusPoint,
};
}
const penaltySetPiece = applyDefensivePenaltySetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (penaltySetPiece.active) {
return {
targets,
presser: penaltySetPiece.presser,
profile,
protectionLabels: penaltySetPiece.labels,
focusPoint: penaltySetPiece.focusPoint,
};
}
const throwInSetPiece = applyDefensiveThrowInSetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (throwInSetPiece.active) {
return {
targets,
presser: throwInSetPiece.presser,
profile,
protectionLabels: throwInSetPiece.labels,
focusPoint: throwInSetPiece.focusPoint,
};
}
const negativeTransition = applyNegativeTransitionDefensiveTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (negativeTransition.active) {
const transitionProfile = {
...profile,
phaseKey: "transitionToDefend",
phaseLabel: negativeTransition.mode === "counterPress"
? "Negative Transition"
: "Recovery Transition",
};
applyAutopilotTargetVariation(
teamId,
targets,
transitionProfile,
"defence",
new Set([
negativeTransition.presser?.id,
...(negativeTransition.protectedIds ?? []),
].filter(Boolean))
);
return {
targets,
presser: negativeTransition.presser,
profile: transitionProfile,
protectionLabels: negativeTransition.labels,
focusPoint: negativeTransition.focusPoint,
};
}
const dribbleReference = getDribblePressureReference();
let presser = dribbleReference
? chooseDefensiveDribblePresser(teamId, targets, profile, dribbleReference) ??
chooseDefensiveAutopilotPresser(teamId, ballPoint, targets, profile)
: chooseDefensiveAutopilotPresser(teamId, ballPoint, targets, profile);
if (presser) {
targets.set(
presser.id,
dribbleReference
? getDefensiveDribblePressTarget(presser, dribbleReference, profile)
: getDefensivePressTarget(teamId, ballPoint, profile, presser)
);
}
const buildOutPress = applyGoalkeeperBuildOutPressTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile
);
presser = buildOutPress.presser ?? presser;
const openPlayTrigger = applyDefensiveOpenPlayTriggerTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile
);
presser = openPlayTrigger.presser ?? presser;
const receptionTrap = applyDefensiveReceptionTrapTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
openPlayTrigger.protectedIds
);
presser = receptionTrap.presser ?? presser;
const receiveContinuation = applyDefensiveReceiveContinuationTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
receptionTrap.protectedIds
);
presser = receiveContinuation.presser ?? presser;
const routeAnticipation = applyDefensiveRouteAnticipationTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
receiveContinuation.protectedIds
);
presser = routeAnticipation.presser ?? presser;
const switchRecovery = applyDefensiveSwitchRecoveryTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
routeAnticipation.protectedIds
);
presser = switchRecovery.presser ?? presser;
const switchLandingLock = applyDefensiveSwitchLandingLockTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
switchRecovery.protectedIds
);
presser = switchLandingLock.presser ?? presser;
const gameSpaceResponse = applyDefensiveGameSpaceResponseTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
switchLandingLock.protectedIds
);
presser = gameSpaceResponse.presser ?? presser;
const carryContainment = applyDefensiveCarryContainmentTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
gameSpaceResponse.protectedIds,
dribbleReference
);
presser = carryContainment.presser ?? presser;
const runnerTracking = applyDefensiveRunnerTrackingTargets(
teamId,
targets,
groups,
ballPoint,
profile,
carryContainment.protectedIds
);
const protectionLabels = applyDefensivePrioritySpaceProtectionTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
runnerTracking.protectedIds
);
const pressureAngle = applyDefensivePresserAngleTarget(
teamId,
targets,
presser,
ballPoint,
profile,
dribbleReference
);
const pressureCover = applyDefensivePressureCoverBalanceTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile
);
const looseBallRecoveryTrap = applyDefensiveLooseBallRecoveryTrapTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
pressureCover.protectedIds
);
presser = looseBallRecoveryTrap.presser ?? presser;
const pressChainSupport = applyDefensivePressChainSupportTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
looseBallRecoveryTrap.protectedIds
);
presser = pressChainSupport.presser ?? presser;
const localOverloadResponse = applyDefensiveLocalOverloadResponseTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
pressChainSupport.protectedIds
);
presser = localOverloadResponse.presser ?? presser;
const postRecoveryResponse = applyDefensivePostRecoveryResponseTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
localOverloadResponse.protectedIds
);
presser = postRecoveryResponse.presser ?? presser;
const passLaneDenial = applyDefensivePassLaneDenialTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
postRecoveryResponse.protectedIds
);
const centralAccessGate = applyDefensiveCentralAccessGateTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
passLaneDenial.protectedIds
);
presser = centralAccessGate.presser ?? presser;
const chanceDenialProtectedIds = new Set([
...[...(carryContainment.protectedIds ?? [])],
...[...(runnerTracking.protectedIds ?? [])],
...[...(looseBallRecoveryTrap.protectedIds ?? [])],
...[...(postRecoveryResponse.protectedIds ?? [])],
...[...(centralAccessGate.protectedIds ?? [])],
].filter(Boolean));
const chanceDenial = applyDefensiveChanceDenialTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
chanceDenialProtectedIds,
dribbleReference
);
presser = chanceDenial.presser ?? presser;
const boxDeliveryChain = applyDefensiveBoxDeliveryChainTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
chanceDenial.protectedIds,
dribbleReference
);
presser = boxDeliveryChain.presser ?? presser;
const lineBreakAdvantageCollapse = applyDefensiveLineBreakAdvantageCollapseTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
boxDeliveryChain.protectedIds,
dribbleReference
);
presser = lineBreakAdvantageCollapse.presser ?? presser;
const emergencyCoverProtectedIds = new Set([
presser?.id,
...[...(pressureAngle.protectedIds ?? [])],
...[...(pressureCover.protectedIds ?? [])],
...[...(looseBallRecoveryTrap.protectedIds ?? [])],
...[...(pressChainSupport.protectedIds ?? [])],
...[...(localOverloadResponse.protectedIds ?? [])],
...[...(postRecoveryResponse.protectedIds ?? [])],
...[...(passLaneDenial.protectedIds ?? [])],
...[...(centralAccessGate.protectedIds ?? [])],
...[...(chanceDenial.protectedIds ?? [])],
...[...(boxDeliveryChain.protectedIds ?? [])],
...[...(lineBreakAdvantageCollapse.protectedIds ?? [])],
...[...(carryContainment.protectedIds ?? [])],
...[...(runnerTracking.protectedIds ?? [])],
].filter(Boolean));
const emergencyCover = applyDefensiveEmergencyCoverTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
emergencyCoverProtectedIds,
dribbleReference
);
presser = emergencyCover.presser ?? presser;
const secondBallAnticipation = applyDefensiveSecondBallAnticipationTargets(
teamId,
targets,
groups,
presser,
ballPoint,
profile,
emergencyCover.protectedIds
);
const variationProtectedIds = new Set([
presser?.id,
...[...(pressureAngle.protectedIds ?? [])],
...[...(pressureCover.protectedIds ?? [])],
...[...(looseBallRecoveryTrap.protectedIds ?? [])],
...[...(pressChainSupport.protectedIds ?? [])],
...[...(localOverloadResponse.protectedIds ?? [])],
...[...(postRecoveryResponse.protectedIds ?? [])],
...[...(passLaneDenial.protectedIds ?? [])],
...[...(chanceDenial.protectedIds ?? [])],
...[...(boxDeliveryChain.protectedIds ?? [])],
...[...(lineBreakAdvantageCollapse.protectedIds ?? [])],
...[...(emergencyCover.protectedIds ?? [])],
...[...(secondBallAnticipation.protectedIds ?? [])],
...[...(openPlayTrigger.protectedIds ?? [])],
...[...(receptionTrap.protectedIds ?? [])],
...[...(receiveContinuation.protectedIds ?? [])],
...[...(routeAnticipation.protectedIds ?? [])],
...[...(switchRecovery.protectedIds ?? [])],
...[...(switchLandingLock.protectedIds ?? [])],
...[...(gameSpaceResponse.protectedIds ?? [])],
...[...(carryContainment.protectedIds ?? [])],
...[...(runnerTracking.protectedIds ?? [])],
].filter(Boolean));
applyAutopilotTargetVariation(
teamId,
targets,
profile,
"defence",
variationProtectedIds
);
const unitCompactnessLabels = enforceDefensiveUnitCompactness(
teamId,
targets,
groups,
ballPoint,
profile,
variationProtectedIds
);
const blockGeometryLabels = enforceDefensiveBlockGeometryLock(
teamId,
targets,
groups,
ballPoint,
profile,
variationProtectedIds
);
const lineStaggeringLabels = enforceDefensiveLineStaggering(
teamId,
targets,
groups,
ballPoint,
profile,
variationProtectedIds
);
const backLineHandoverLabels = applyDefensiveBackLineHandoverTargets(
teamId,
targets,
groups,
ballPoint,
profile,
variationProtectedIds
);
const offsideLineControlLabels = enforceDefensiveOffsideLineControl(
teamId,
targets,
groups,
ballPoint,
profile,
new Set([presser?.id].filter(Boolean)),
variationProtectedIds
);
const chainSpacingLabels = enforceDefensiveLineChainSpacing(
teamId,
targets,
groups,
ballPoint,
profile,
new Set([presser?.id].filter(Boolean))
);
const verticalBlockConnectionLabels = enforceDefensiveVerticalBlockConnections(
teamId,
targets,
groups,
ballPoint,
profile,
new Set([presser?.id].filter(Boolean))
);
const measuredBlockEnvelopeLabels = enforceDefensiveMeasuredBlockEnvelope(
teamId,
targets,
groups,
ballPoint,
profile,
new Set([presser?.id].filter(Boolean)),
variationProtectedIds
);
const collectiveShiftLabels = enforceDefensiveCollectiveShiftCohesion(
teamId,
targets,
groups,
ballPoint,
profile,
new Set([presser?.id].filter(Boolean)),
variationProtectedIds
);
const compactLineIntegrityLabels = enforceDefensiveCompactLineIntegrity(
teamId,
targets,
groups,
ballPoint,
profile,
presser?.id ?? null,
new Set([presser?.id].filter(Boolean)),
variationProtectedIds
);
const goalkeeperSweeperLabels = applyDefensiveGoalkeeperSweeperTarget(
teamId,
targets,
groups,
ballPoint,
profile
);
const goalkeeperShotSetLabels = applyDefensiveGoalkeeperShotSetTarget(
teamId,
targets,
groups,
ballPoint,
profile
);
return {
targets,
presser,
profile,
protectionLabels: uniquePrincipleLabels([
...getDefensiveLineActionLabels(profile),
...(buildOutPress.labels ?? []),
...(openPlayTrigger.labels ?? []),
...(receptionTrap.labels ?? []),
...(receiveContinuation.labels ?? []),
...(routeAnticipation.labels ?? []),
...(switchRecovery.labels ?? []),
...(switchLandingLock.labels ?? []),
...(gameSpaceResponse.labels ?? []),
...(carryContainment.labels ?? []),
...(runnerTracking.labels ?? []),
...(protectionLabels ?? []),
...(pressureCover.labels ?? []),
...(looseBallRecoveryTrap.labels ?? []),
...(pressChainSupport.labels ?? []),
...(localOverloadResponse.labels ?? []),
...(postRecoveryResponse.labels ?? []),
...(passLaneDenial.labels ?? []),
...(centralAccessGate.labels ?? []),
...(chanceDenial.labels ?? []),
...(boxDeliveryChain.labels ?? []),
...(lineBreakAdvantageCollapse.labels ?? []),
...(emergencyCover.labels ?? []),
...(secondBallAnticipation.labels ?? []),
...(pressureAngle.labels ?? []),
...(unitCompactnessLabels ?? []),
...(blockGeometryLabels ?? []),
...(lineStaggeringLabels ?? []),
...(backLineHandoverLabels ?? []),
...(offsideLineControlLabels ?? []),
...(chainSpacingLabels ?? []),
...(verticalBlockConnectionLabels ?? []),
...(measuredBlockEnvelopeLabels ?? []),
...(collectiveShiftLabels ?? []),
...(compactLineIntegrityLabels ?? []),
...(goalkeeperSweeperLabels ?? []),
...(goalkeeperShotSetLabels ?? []),
]),
focusPoint: lineBreakAdvantageCollapse.focusPoint ?? boxDeliveryChain.focusPoint ?? chanceDenial.focusPoint ?? emergencyCover.focusPoint ?? centralAccessGate.focusPoint ?? localOverloadResponse.focusPoint ?? postRecoveryResponse.focusPoint ?? looseBallRecoveryTrap.focusPoint ?? carryContainment.focusPoint ?? runnerTracking.focusPoint ?? gameSpaceResponse.focusPoint ?? switchLandingLock.focusPoint ?? switchRecovery.focusPoint ?? routeAnticipation.focusPoint ?? receiveContinuation.focusPoint ?? receptionTrap.focusPoint ?? secondBallAnticipation.focusPoint ?? passLaneDenial.focusPoint ?? pressChainSupport.focusPoint ?? pressureCover.focusPoint ?? openPlayTrigger.focusPoint ?? null,
};
}

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
    buildOffensiveAutopilotTargets,
    buildDefensiveAutopilotTargets,
    chooseAutoPilotNextAction,
  };
}
