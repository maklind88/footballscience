export function createGameSimulatorAutopilotOffballGenerativePrincipleSupportTargets(deps = {}) {
  const {
    applyBetweenLinesPrincipleTargets,
    applyBoxOccupationPrincipleTargets,
    applyCornerDeliveryPrincipleTargets,
    applyFormationIdentityPrincipleTargets,
    applyGameSpaceOffBallPrincipleTargets,
    applyGoalkeeperBuildOutPrincipleTargets,
    applyHighValueSpacePrincipleTargets,
    applyOpenGrassCarrySupportTargets,
    applyOpponentBlockResponsiveTargets,
    applyPositionalPlayOccupationTargets,
    applyPossessionRoutePrincipleTargets,
    applyReceptionSupportPrincipleTargets,
    applyShotReboundPrincipleTargets,
    applyTransitionAttackPrincipleTargets,
    distance,
    getAttackingDepth,
    getMovableAutopilotPlayerByRoles,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPlayerById,
    getSupportUnderBallTarget,
    getThirdManRunnerTarget,
    getWideSideSign,
    isWidePrincipleZone,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

  function applyGenerativePrincipleSupportTargets(teamId, targets, ballPoint, actionMeta, profile) {
    const labels = [];
    const excludedIds = new Set([
      actionMeta?.carrierPlayerId,
      actionMeta?.receiverPlayerId,
      actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
      state.ball.carrierPlayerId,
      state.ball.receiverPlayerId,
      state.ball.initiatorPlayerId,
    ].filter(Boolean));
    const receiver = getPlayerById(actionMeta?.receiverPlayerId);
    const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null;
    const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
    const laneShift = Math.abs(getPitchLaneIndex(ballPoint) - getPitchLaneIndex(startPoint));
    const targetDepth = getAttackingDepth(ballPoint, teamId);
    const sideSign = getWideSideSign(ballPoint) || getWideSideSign(receiver) || 1;

    if (
      actionMeta?.actionType === "pass" &&
      (receiverRoleKey === "wideForward" || receiverRoleKey === "wideBack") &&
      isWidePrincipleZone(ballPoint)
    ) {
      const support = getMovableAutopilotPlayerByRoles(
        teamId,
        ["connector", "pivot"],
        targets,
        excludedIds,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, support, getSupportUnderBallTarget(teamId, ballPoint, sideSign, profile))) {
        excludedIds.add(support.id);
        labels.push("Underneath support");
      }
      labels.push("Ask question wide");
    }

    labels.push(...applyGoalkeeperBuildOutPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyShotReboundPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyCornerDeliveryPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyReceptionSupportPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyOpenGrassCarrySupportTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyGameSpaceOffBallPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyHighValueSpacePrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyTransitionAttackPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyBetweenLinesPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyFormationIdentityPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyPossessionRoutePrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));
    labels.push(...applyOpponentBlockResponsiveTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));

    if (
      actionMeta?.actionType === "pass" &&
      (receiverRoleKey === "pivot" || receiverRoleKey === "connector" || receiverRoleKey === "secondStriker")
    ) {
      const runner = getMovableAutopilotPlayerByRoles(
        teamId,
        ["wideForward", "striker", "secondStriker"],
        targets,
        excludedIds,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, runner, getThirdManRunnerTarget(teamId, ballPoint, sideSign, profile))) {
        excludedIds.add(runner.id);
        labels.push("Third-player runner");
      }
      labels.push("Find the Third");
    }

    if (actionMeta?.actionType === "pass" && laneShift >= 2 && distance(startPoint, ballPoint) >= 16) {
      const weakSideRunner = getMovableAutopilotPlayerByRoles(
        teamId,
        ["wideForward", "wideBack"],
        targets,
        excludedIds,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, weakSideRunner, getThirdManRunnerTarget(teamId, ballPoint, sideSign, profile))) {
        excludedIds.add(weakSideRunner.id);
      }
      labels.push("Change corridor");
    }

    if (
      targetDepth >= 70 ||
      actionMeta?.actionType === "shot" ||
      (actionMeta?.actionType === "pass" && Math.abs(ballPoint.y - pitch.width / 2) <= 18 && targetDepth >= 64)
    ) {
      labels.push(...applyBoxOccupationPrincipleTargets(teamId, targets, ballPoint, excludedIds));
      labels.push("Attack box");
    }

    labels.push(...applyPositionalPlayOccupationTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds));

    return {
      labels: uniquePrincipleLabels(labels),
      protectedIds: new Set(excludedIds),
    };
  }

  return {
    applyGenerativePrincipleSupportTargets,
  };
}
