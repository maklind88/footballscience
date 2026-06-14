export function createGameSimulatorAutopilotOffballPassingGeometryTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getWideSideSign,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getOffensivePassingGeometryContext(teamId, ballPoint, actionMeta, profile = {}) {
    if (!teamId || !ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
      return null;
    }
    const actionType = actionMeta?.actionType ?? state.ball.actionType;
    if (!["pass", "dribble", "recovery"].includes(actionType)) {
      return null;
    }
    const startPoint =
      actionMeta?.beforeSnapshot?.ball?.position ??
      state.ball.startPosition ??
      state.ball.position ??
      ballPoint;
    const targetPoint = clampToPitch(ballPoint, 2.5);
    const targetDepth = getAttackingDepth(targetPoint, teamId);
    if (targetDepth < 24 && actionType !== "recovery") {
      return null;
    }
    const sideSign =
      getWideSideSign(targetPoint) ||
      getWideSideSign(startPoint) ||
      1;
    const targetThreat = getPitchThreatProfile(targetPoint, teamId);
    const gameSpace = getAttackingGameSpaceProfile(targetPoint, teamId);
    const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
    const pressure = getOpponentPressureAtPoint(teamId, targetPoint, 12);
    const isWide = isWidePrincipleZone(targetPoint);
    const isFinalThird =
      targetDepth >= 66 ||
      targetThreat.box >= 0.16 ||
      targetThreat.cutbackZone >= 0.22 ||
      targetThreat.assistZone >= 0.32;
    const needsGeometry =
      pressure >= 0.28 ||
      targetDepth >= 34 ||
      gameSpace.key === "space1" ||
      gameSpace.key === "space2" ||
      actionSpace.lineBreakCount >= 1 ||
      actionType === "recovery";
    if (!needsGeometry) {
      return null;
    }
    return {
      actionSpace,
      actionType,
      gameSpace,
      isFinalThird,
      isWide,
      pressure,
      sideSign,
      startPoint: cloneVector(startPoint),
      targetDepth,
      targetPoint,
      targetThreat,
    };
  }

  function getOffensivePassingGeometryTarget(teamId, context, slot, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const ball = context.targetPoint;
    const sideSign = context.sideSign || 1;
    const depth = context.targetDepth;
    const width = clamp(profile.width ?? 58, 44, 68);
    const pressure = context.pressure;
    const underDrop = lerp(7.2, 14.2, clamp(pressure, 0, 1));
    const strongHalfY = clamp(pitch.width / 2 + sideSign * 12.2, 8, pitch.width - 8);
    const weakHalfY = clamp(pitch.width / 2 - sideSign * 11.2, 8, pitch.width - 8);
    const strongWideY = clamp(pitch.width / 2 + sideSign * width * 0.49, 3.5, pitch.width - 3.5);
    const weakWideY = clamp(pitch.width / 2 - sideSign * width * 0.48, 3.5, pitch.width - 3.5);
    const points = {
      underAngle: getDepthPoint(teamId, clamp(depth - underDrop - (profile.shortSupport ?? 0.55) * 2.5, 16, 76), {
        y: clamp(lerp(ball.y, pitch.width / 2 - sideSign * 4.2, 0.58), 8, pitch.width - 8),
      }),
      insideAngle: getDepthPoint(teamId, clamp(depth + lerp(-2.2, 3.6, profile.tempo ?? 0.5), 28, 84), {
        y: clamp(lerp(ball.y, strongHalfY, context.isWide ? 0.72 : 0.48), 8, pitch.width - 8),
      }),
      outsideExit: getDepthPoint(teamId, clamp(depth + lerp(0.5, 5.8, profile.widthDiscipline ?? 0.62), 30, 90), {
        y: strongWideY,
      }),
      thirdManAngle: getDepthPoint(teamId, clamp(depth + 5.8 + (profile.lineBreakBias ?? 0.5) * 5.4, 40, 92), {
        y: clamp(lerp(ball.y, context.isWide ? weakHalfY : strongHalfY, 0.54), 8, pitch.width - 8),
      }),
      weakSideRelease: getDepthPoint(teamId, clamp(depth + 4.5 + (profile.switchBias ?? 0.5) * 6.5, 36, 92), {
        y: weakWideY,
      }),
      restBalance: clampToPitch({
        x: ball.x - sign * (20 + (profile.restBehind ?? 22) * 0.16),
        y: clamp(lerp(ball.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
      }, 3),
    };
    return points[slot] ?? points.underAngle;
  }

  function applyOffensivePassingGeometryTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
    const context = getOffensivePassingGeometryContext(teamId, ballPoint, actionMeta, profile);
    if (!context) {
      return {
        labels: [],
        protectedIds: new Set(),
      };
    }
    const labels = [];
    const assignedIds = new Set([
      ...protectedIds,
      actionMeta?.carrierPlayerId,
      actionMeta?.receiverPlayerId,
      actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
      state.ball.ownerPlayerId,
      state.ball.carrierPlayerId,
      state.ball.receiverPlayerId,
      state.ball.initiatorPlayerId,
    ].filter(Boolean));
    const protectedGeometryIds = new Set();
    const assign = (slot, roleKeys, label, preferredSide = 0) => {
      const target = getOffensivePassingGeometryTarget(teamId, context, slot, profile);
      const player = preferredSide
        ? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
        : getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
      if (!setAutopilotPrincipleTarget(targets, player, target)) {
        return null;
      }
      assignedIds.add(player.id);
      protectedGeometryIds.add(player.id);
      labels.push(label);
      return player;
    };
    assign("underAngle", ["pivot", "connector", "wideBack", "rest"], "Passing geometry: under angle");
    assign("insideAngle", ["connector", "pivot", "wideForward", "secondStriker"], "Passing geometry: inside angle", context.isWide ? context.sideSign : 0);
    if (context.isWide || profile.widthDiscipline >= 0.62 || profile.overlapBias >= 0.54) {
      assign("outsideExit", ["wideBack", "wideForward"], "Passing geometry: outside exit", context.sideSign);
    }
    if (!context.isFinalThird || context.gameSpace.key === "space2" || context.pressure >= 0.42) {
      assign("thirdManAngle", ["connector", "wideForward", "secondStriker", "pivot"], "Passing geometry: third-man angle", context.isWide ? -context.sideSign : context.sideSign);
    }
    if (profile.switchBias >= 0.5 || context.pressure >= 0.46 || context.targetThreat.centralPocket >= 0.24) {
      assign("weakSideRelease", ["wideForward", "wideBack"], "Passing geometry: weak-side release", -context.sideSign);
    }
    if (context.targetDepth >= 38 || context.pressure >= 0.44) {
      assign("restBalance", ["pivot", "rest", "wideBack"], "Passing geometry: rest balance");
    }
    return {
      labels: uniquePrincipleLabels(labels),
      protectedIds: protectedGeometryIds,
    };
  }

  return {
    getOffensivePassingGeometryContext,
    getOffensivePassingGeometryTarget,
    applyOffensivePassingGeometryTargets,
  };
}
