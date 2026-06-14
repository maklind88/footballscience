export function createGameSimulatorAutopilotOffballHighValueSpaceTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getPitchThreatProfile,
    getPlayerById,
    getWideSideSign,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
  } = deps;

  function getHighValueAttackTarget(teamId, ballPoint, slot, sideSign = 1) {
    const sign = getAttackDirectionSign(teamId);
    const ballDepth = getAttackingDepth(ballPoint, teamId);
    const baseDepth = clamp(ballDepth + 8, 52, 86);
    const halfSpaceY = pitch.width / 2 + sideSign * 13.5;
    const oppositeHalfSpaceY = pitch.width / 2 - sideSign * 12.5;
    const points = {
      goldenRun: getDepthPoint(teamId, clamp(baseDepth + 8, 62, 91), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.68), 14, pitch.width - 14),
      }),
      halfSpaceRun: getDepthPoint(teamId, clamp(baseDepth + 6, 60, 88), {
        y: clamp(lerp(ballPoint.y, halfSpaceY, 0.5), 8, pitch.width - 8),
      }),
      supportPocket: getDepthPoint(teamId, clamp(ballDepth + 1.5, 42, 72), {
        y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.34), 9, pitch.width - 9),
      }),
      reboundEdge: getDepthPoint(teamId, 74, {
        y: clamp(pitch.width / 2 - sideSign * 5.5, 17, pitch.width - 17),
      }),
      pinLine: clampToPitch({
        x: ballPoint.x + sign * 12,
        y: clamp(pitch.width / 2 + sideSign * 5.5, 14, pitch.width - 14),
      }, 2),
    };
    return points[slot] ?? points.goldenRun;
  }

  function applyHighValueSpacePrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    const labels = [];
    const targetThreat = getPitchThreatProfile(ballPoint, teamId);
    const targetDepth = getAttackingDepth(ballPoint, teamId);
    const ballSide = getWideSideSign(ballPoint) || 1;
    const shouldAttackHighValueSpace =
      targetDepth >= 46 &&
      (targetThreat.value >= 0.44 ||
        targetThreat.centralPocket >= 0.32 ||
        targetThreat.betweenLines >= 0.42 ||
        targetThreat.assistZone >= 0.42 ||
        actionMeta?.actionType === "dribble");
    if (!shouldAttackHighValueSpace) {
      return labels;
    }
    const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
    if (
      plannedRunner?.team === teamId &&
      targets.has(plannedRunner.id) &&
      !excludedIds.has(plannedRunner.id) &&
      setAutopilotPrincipleTarget(targets, plannedRunner, clampToPitch(ballPoint, 2.5))
    ) {
      excludedIds.add(plannedRunner.id);
      labels.push("Runner attacks space");
    }
    const runner = getMovableAutopilotPlayerByRoles(
      teamId,
      ["striker", "wideForward", "secondStriker"],
      targets,
      excludedIds,
      ballPoint
    );
    if (setAutopilotPrincipleTarget(
      targets,
      runner,
      getHighValueAttackTarget(
        teamId,
        ballPoint,
        targetThreat.assistZone >= 0.5 ? "halfSpaceRun" : "goldenRun",
        ballSide
      )
    )) {
      excludedIds.add(runner.id);
      labels.push(`Attack ${targetThreat.primaryLabel}`);
    }
    const connector = getMovableAutopilotPlayerByRoles(
      teamId,
      ["connector", "pivot"],
      targets,
      excludedIds,
      ballPoint
    );
    if (setAutopilotPrincipleTarget(
      targets,
      connector,
      getHighValueAttackTarget(teamId, ballPoint, "supportPocket", -ballSide)
    )) {
      excludedIds.add(connector.id);
      labels.push("Support the next action");
    }
    if (targetThreat.box >= 0.34 || targetDepth >= 70) {
      const edge = getMovableAutopilotPlayerByRoles(
        teamId,
        ["connector", "pivot", "wideForward"],
        targets,
        excludedIds,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, edge, getHighValueAttackTarget(teamId, ballPoint, "reboundEdge", ballSide))) {
        excludedIds.add(edge.id);
        labels.push("Edge-of-box security");
      }
    }
    return labels;
  }

  return {
    getHighValueAttackTarget,
    applyHighValueSpacePrincipleTargets,
  };
}
