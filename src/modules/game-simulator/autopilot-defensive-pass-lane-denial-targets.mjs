export function createGameSimulatorAutopilotDefensivePassLaneDenialTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getOtherTeamId,
    getOwnGoalCenter,
    getPlayerById,
    getWideSideSign,
    isWidePrincipleZone,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getDefensivePassLaneDenialContext(defensiveTeamId, ballPoint, profile) {
    if (state.restartPhase?.type) {
      return null;
    }
    const attackingTeamId = getOtherTeamId(defensiveTeamId);
    const actionMeta = state.draftStep ?? {
      actionType: state.ball.actionType,
      target: state.ball.target,
      receiverPlayerId: state.ball.receiverPlayerId,
      carrierPlayerId: state.ball.carrierPlayerId,
      beforeSnapshot: {
        ball: {
          position: state.ball.startPosition,
          ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
        },
      },
    };
    if (!attackingTeamId || actionMeta.actionType !== "pass") {
      return null;
    }
    const startPoint =
      actionMeta.beforeSnapshot?.ball?.position ??
      state.ball.startPosition ??
      state.ball.position;
    const targetPoint = actionMeta.target ?? ballPoint;
    if (!startPoint || !targetPoint) {
      return null;
    }
    const passDistance = distance(startPoint, targetPoint);
    if (passDistance < 6) {
      return null;
    }
    const receiver = getPlayerById(actionMeta.receiverPlayerId);
    const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
    const targetThreat = actionSpace.targetThreat;
    const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
    const sideSign =
      getWideSideSign(targetPoint) ||
      getWideSideSign(receiver) ||
      getWideSideSign(startPoint) ||
      1;
    const laneDanger =
      actionSpace.lineBreakCount >= 1 ||
      forwardGain >= 7 ||
      targetThreat.betweenLines >= 0.28 ||
      targetThreat.centralPocket >= 0.22 ||
      targetThreat.box >= 0.16 ||
      targetThreat.assistZone >= 0.32;
    const isWidePass = isWidePrincipleZone(targetPoint) || isWidePrincipleZone(startPoint);
    if (!laneDanger && passDistance < 13) {
      return null;
    }
    return {
      actionMeta,
      attackingTeamId,
      startPoint: cloneVector(startPoint),
      targetPoint: cloneVector(targetPoint),
      receiver,
      passDistance,
      forwardGain,
      actionSpace,
      targetThreat,
      sideSign,
      laneDanger,
      isWidePass,
      phaseKey: profile.phaseKey,
    };
  }

  function getDefensivePassLaneDenialTarget(teamId, context, slot) {
    const sign = getDefendingDirectionSign(teamId);
    const ownGoal = getOwnGoalCenter(teamId);
    const lanePoint = (ratio) => ({
      x: lerp(context.startPoint.x, context.targetPoint.x, ratio),
      y: lerp(context.startPoint.y, context.targetPoint.y, ratio),
    });
    const goalSideOf = (point, meters) => ({
      x: point.x - sign * meters,
      y: point.y,
    });
    const sideSign = context.sideSign || 1;
    const nearLane = lanePoint(context.passDistance >= 22 ? 0.34 : 0.42);
    const midLane = lanePoint(0.58);
    const lateLane = lanePoint(context.passDistance >= 22 ? 0.72 : 0.68);
    const points = {
      carrierShadow: {
        ...goalSideOf(nearLane, context.phaseKey === "highPress" ? 1.15 : 1.8),
        y: lerp(nearLane.y, pitch.width / 2, context.isWidePass ? 0.22 : 0.36),
      },
      centralLaneScreen: {
        ...goalSideOf(midLane, context.laneDanger ? 3.4 : 2.4),
        y: lerp(midLane.y, pitch.width / 2, context.isWidePass ? 0.42 : 0.68),
      },
      receiverShadow: {
        ...goalSideOf(lateLane, context.targetThreat.box >= 0.16 ? 2.2 : 1.7),
        y: lerp(lateLane.y, pitch.width / 2, context.isWidePass ? 0.18 : 0.32),
      },
      outsideTrap: {
        x: lateLane.x - sign * 1.8,
        y: clamp(lateLane.y + sideSign * 4.6, 3.5, pitch.width - 3.5),
      },
      depthCover: {
        x: lerp(context.targetPoint.x, ownGoal.x, context.targetThreat.box >= 0.2 ? 0.42 : 0.32),
        y: lerp(context.targetPoint.y, pitch.width / 2, context.isWidePass ? 0.44 : 0.28),
      },
      weakSideTuck: {
        x: lerp(context.targetPoint.x, ownGoal.x, 0.34),
        y: clamp(pitch.width / 2 - sideSign * (context.phaseKey === "boxDefending" ? 7.2 : 10.5), 7, pitch.width - 7),
      },
    };
    return clampToPitch(points[slot] ?? points.centralLaneScreen, 2.2);
  }

  function applyDefensivePassLaneDenialTargets(
    teamId,
    targets,
    groups,
    basePresser,
    ballPoint,
    profile,
    protectedIds = new Set()
  ) {
    const context = getDefensivePassLaneDenialContext(teamId, ballPoint, profile);
    if (!context) {
      return {
        labels: [],
        focusPoint: null,
        protectedIds: new Set(protectedIds),
      };
    }
    const labels = [];
    const assignedIds = new Set([
      ...protectedIds,
      basePresser?.id,
      ...groups.gk.map((goalkeeper) => goalkeeper.id),
    ].filter(Boolean));
    const assign = (slot, lineKeys, preferLabels, label) => {
      const target = getDefensivePassLaneDenialTarget(teamId, context, slot);
      const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
      if (!player) {
        return null;
      }
      targets.set(player.id, target);
      assignedIds.add(player.id);
      if (label) {
        labels.push(label);
      }
      return player;
    };
    assign("carrierShadow", ["forward", "midfield"], ["9", "10", "W", "8", "6"], "Cover shadow from ball");
    assign("centralLaneScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Deny central pass lane");
    assign("receiverShadow", ["midfield", "back"], ["6", "8", "CB", "LB", "RB", "WB"], "Arrive goal-side of receiver");
    if (context.isWidePass) {
      assign("outsideTrap", ["back", "midfield"], ["WB", "LB", "RB", "W"], "Trap outside receiving lane");
    }
    if (
      context.actionSpace.lineBreakCount >= 1 ||
      context.targetThreat.behindLine >= 0.22 ||
      context.targetThreat.box >= 0.16 ||
      context.forwardGain >= 10
    ) {
      assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Cover behind pass lane");
    }
    if (
      context.passDistance >= 20 ||
      context.targetThreat.assistZone >= 0.32 ||
      context.targetThreat.box >= 0.18
    ) {
      assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Weak side narrows behind lane");
    }
    if (labels.length) {
      labels.unshift("Deny pass lane");
    }
    return {
      labels: uniquePrincipleLabels(labels),
      focusPoint: context.targetPoint,
      protectedIds: assignedIds,
    };
  }

  return {
    getDefensivePassLaneDenialContext,
    getDefensivePassLaneDenialTarget,
    applyDefensivePassLaneDenialTargets,
  };
}
