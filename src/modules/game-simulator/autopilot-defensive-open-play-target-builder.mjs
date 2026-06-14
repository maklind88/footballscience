export function createGameSimulatorDefensiveOpenPlayTargetBuilder(deps = {}) {
  const {
    applyAutopilotTargetVariation,
    applyDefensiveBackLineHandoverTargets,
    applyDefensiveBoxDeliveryChainTargets,
    applyDefensiveCarryContainmentTargets,
    applyDefensiveCentralAccessGateTargets,
    applyDefensiveChanceDenialTargets,
    applyDefensiveEmergencyCoverTargets,
    applyDefensiveGameSpaceResponseTargets,
    applyDefensiveGoalkeeperShotSetTarget,
    applyDefensiveGoalkeeperSweeperTarget,
    applyDefensiveLineBreakAdvantageCollapseTargets,
    applyDefensiveLocalOverloadResponseTargets,
    applyDefensiveLooseBallRecoveryTrapTargets,
    applyDefensiveOpenPlayTriggerTargets,
    applyDefensivePassLaneDenialTargets,
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
    applyGoalkeeperBuildOutPressTargets,
    chooseDefensiveAutopilotPresser,
    chooseDefensiveDribblePresser,
    enforceDefensiveBlockGeometryLock,
    enforceDefensiveCollectiveShiftCohesion,
    enforceDefensiveCompactLineIntegrity,
    enforceDefensiveLineChainSpacing,
    enforceDefensiveLineStaggering,
    enforceDefensiveMeasuredBlockEnvelope,
    enforceDefensiveOffsideLineControl,
    enforceDefensiveUnitCompactness,
    enforceDefensiveVerticalBlockConnections,
    getDefensiveDribblePressTarget,
    getDefensiveLineActionLabels,
    getDefensivePressTarget,
    getDribblePressureReference,
    uniquePrincipleLabels,
  } = deps;

function buildDefensiveOpenPlayTargets({ teamId, targets, groups, ballPoint, profile }) {
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

  return {
    buildDefensiveOpenPlayTargets,
  };
}
