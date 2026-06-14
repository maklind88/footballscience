export function createGameSimulatorOffensiveAutopilotTargetBuilder(deps = {}) {
  const {
    applyAttackingBoxOccupationChainTargets,
    applyAutopilotTargetVariation,
    applyBallNearSupportTriangleTargets,
    applyBlindsideChannelRunTargets,
    applyGenerativePrincipleSupportTargets,
    applyLocalSuperioritySupportTargets,
    applyLooseBallRecoverySupportTargets,
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
    chooseOffensiveAutopilotRunner,
    enforceOffensiveFiveLaneOccupation,
    enforceOffensiveOccupationZones,
    enforceOffensiveOnsideLineAwareness,
    enforceOffensiveStructureBalance,
    enforceOffensiveTargetSpacing,
    getFormationPositions,
    getOffensiveActionPrinciple,
    getOffensiveAutopilotProfile,
    getOffensiveAutopilotTarget,
    getOffensivePhaseKey,
    getState,
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


  return {
    buildOffensiveAutopilotTargets,
  };
}
