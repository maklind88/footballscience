export function createGameSimulatorAutopilotOffballSwitchLandingAttackTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOpponentPressureAtPoint,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getWideSideSign,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getSwitchLandingAttackContext(teamId, ballPoint, actionMeta, profile = {}) {
    if (!teamId || !ballPoint || profile?.phaseKey === "setPiece") {
      return null;
    }
    const actionType = actionMeta?.actionType ?? state.ball.actionType;
    if (actionType !== "pass" && actionType !== "dribble") {
      return null;
    }
    const startPoint =
      actionMeta?.beforeSnapshot?.ball?.position ??
      state.ball.startPosition ??
      state.ball.position ??
      ballPoint;
    const targetPoint = clampToPitch(actionMeta?.target ?? ballPoint, 2.5);
    const actionDistance = distance(startPoint, targetPoint);
    const laneShift = Math.abs(getPitchLaneIndex(startPoint) - getPitchLaneIndex(targetPoint));
    const targetDepth = getAttackingDepth(targetPoint, teamId);
    const startDepth = getAttackingDepth(startPoint, teamId);
    const sideSign =
      getWideSideSign(targetPoint) ||
      getWideSideSign(ballPoint) ||
      getWideSideSign(startPoint) ||
      1;
    const targetThreat = getPitchThreatProfile(targetPoint, teamId);
    const pressure = getOpponentPressureAtPoint(teamId, targetPoint, 12);
    const principleText = [
      actionMeta?.offensiveAutopilot?.principleKey,
      actionMeta?.offensiveAutopilot?.principleLabel,
      actionMeta?.profileLabel,
      actionMeta?.label,
      ...(actionMeta?.autoPrinciples ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    const isSwitchAction =
      actionType === "pass" &&
      (
        (actionDistance >= 18 && laneShift >= 2) ||
        principleText.includes("switch") ||
        principleText.includes("weak-side")
      );
    const isPressureEscapeSwitch =
      isSwitchAction &&
      (
        principleText.includes("press escape") ||
        principleText.includes("pressure-trap") ||
        principleText.includes("switch away")
      );
    const isFarSideWideEntry =
      isSwitchAction &&
      isWidePrincipleZone(targetPoint) &&
      targetDepth >= 34;
    const active =
      isPressureEscapeSwitch ||
      isFarSideWideEntry ||
      (
        isSwitchAction &&
        targetDepth >= 42 &&
        ((profile.switchBias ?? 0.5) >= 0.56 || (profile.widthDiscipline ?? 0.62) >= 0.64)
      );
    if (!active) {
      return null;
    }
    const finalThirdCue =
      targetDepth >= 64 ||
      targetThreat.assistZone >= 0.22 ||
      targetThreat.cutbackZone >= 0.18 ||
      targetThreat.box >= 0.16;
    const wideIsolationCue =
      isWidePrincipleZone(targetPoint) &&
      pressure <= 0.5 &&
      ((profile.overlapBias ?? 0.5) >= 0.54 || (profile.dribbleBias ?? 0.5) >= 0.5);
    const settleCue =
      targetDepth < 52 ||
      pressure >= 0.6 ||
      startDepth > targetDepth + 4;
    return {
      actionDistance,
      actionType,
      finalThirdCue,
      isFarSideWideEntry,
      isPressureEscapeSwitch,
      laneShift,
      mode: finalThirdCue
        ? "finalThird"
        : wideIsolationCue
          ? "wideIsolation"
          : settleCue
            ? "settle"
            : "progress",
      pressure,
      sideSign,
      startDepth,
      startPoint: cloneVector(startPoint),
      targetDepth,
      targetPoint,
      targetThreat,
    };
  }

  function getSwitchLandingAttackTarget(teamId, context, slot, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const depth = context.targetDepth;
    const ball = context.targetPoint;
    const sideSign = context.sideSign || 1;
    const wideY = clamp(
      pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.49, 25.5, 31.5),
      3.4,
      pitch.width - 3.4
    );
    const outsideY = clamp(ball.y + sideSign * (5.2 + (profile.widthDiscipline ?? 0.62) * 2.2), 3.2, pitch.width - 3.2);
    const halfY = clamp(
      pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.24, 12, 17),
      7,
      pitch.width - 7
    );
    const weakHalfY = clamp(
      pitch.width / 2 - sideSign * clamp((profile.width ?? 58) * 0.23, 11, 16),
      8,
      pitch.width - 8
    );
    const nearBoxY = clamp(pitch.width / 2 + sideSign * 6.8, 9, pitch.width - 9);
    const farPostY = clamp(pitch.width / 2 - sideSign * 12.8, 7, pitch.width - 7);
    const points = {
      outsideOverlap: getDepthPoint(teamId, clamp(depth + 6.8 + (profile.overlapBias ?? 0.5) * 5.2, 42, 96), {
        y: outsideY,
      }),
      underlap: getDepthPoint(teamId, clamp(depth + 5.4 + (profile.shortSupport ?? 0.55) * 4.2, 42, 92), {
        y: clamp(lerp(ball.y, halfY, 0.72), 7, pitch.width - 7),
      }),
      insidePocket: getDepthPoint(teamId, clamp(depth + 2.5 + (profile.lineBreakBias ?? 0.5) * 5.2, 40, 88), {
        y: clamp(lerp(ball.y, halfY, 0.64), 7, pitch.width - 7),
      }),
      underSupport: getDepthPoint(teamId, clamp(depth - 8.5 - (profile.supportCompactness ?? 0.56) * 5.5, 18, 78), {
        y: clamp(lerp(ball.y, pitch.width / 2 - sideSign * 2.8, 0.52), 10, pitch.width - 10),
      }),
      oneVsOneClearout: getDepthPoint(teamId, clamp(depth + 9.5 + (profile.runnerBoost ?? 7) * 0.34, 48, 96), {
        y: clamp(lerp(pitch.width / 2 - sideSign * 6.5, weakHalfY, 0.22), 10, pitch.width - 10),
      }),
      boxRun: getDepthPoint(teamId, clamp(Math.max(depth + 9, 82), 76, 98), {
        y: nearBoxY,
      }),
      farPostRun: getDepthPoint(teamId, clamp(Math.max(depth + 10, 84), 78, 98), {
        y: farPostY,
      }),
      cutbackEdge: getDepthPoint(teamId, clamp(Math.max(depth + 3.5, 69), 62, 86), {
        y: clamp(lerp(pitch.width / 2 + sideSign * 8.5, halfY, 0.28), 10, pitch.width - 10),
      }),
      widthHold: getDepthPoint(teamId, clamp(depth + 2 + (profile.widthDiscipline ?? 0.62) * 4, 38, 88), {
        y: wideY,
      }),
      weakRestLock: clampToPitch({
        x: ball.x - sign * (17 + (profile.restBehind ?? 22) * 0.18),
        y: clamp(pitch.width / 2 - sideSign * 10.5, 11, pitch.width - 11),
      }, 3),
      restBalance: clampToPitch({
        x: ball.x - sign * (22 + (profile.restBehind ?? 22) * 0.2),
        y: clamp(lerp(ball.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
      }, 3),
    };
    return points[slot] ?? points.insidePocket;
  }

  function applySwitchLandingAttackTargets(
    teamId,
    targets,
    ballPoint,
    actionMeta,
    profile,
    protectedIds = new Set()
  ) {
    const context = getSwitchLandingAttackContext(teamId, ballPoint, actionMeta, profile);
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
      state.ball.initiatorPlayerId,
      state.ball.receiverPlayerId,
    ].filter(Boolean));
    const protectedSwitchIds = new Set();
    const assign = (slot, roleKeys, label, preferredSide = 0) => {
      const target = getSwitchLandingAttackTarget(teamId, context, slot, profile);
      const player = preferredSide
        ? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
        : getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
      if (!setAutopilotPrincipleTarget(targets, player, target)) {
        return null;
      }
      assignedIds.add(player.id);
      protectedSwitchIds.add(player.id);
      labels.push(label);
      return player;
    };
    assign("outsideOverlap", ["wideBack", "wideForward"], "Switch landing: outside overlap", context.sideSign);
    assign("insidePocket", ["connector", "secondStriker", "wideForward", "pivot"], "Switch landing: half-space link", context.sideSign);
    if (context.mode === "wideIsolation") {
      assign("underlap", ["connector", "wideBack", "wideForward"], "Switch landing: underlap option", context.sideSign);
      assign("oneVsOneClearout", ["striker", "secondStriker", "wideForward"], "Switch landing: clear the 1v1");
    } else {
      assign("underSupport", ["pivot", "connector", "rest", "wideBack"], "Switch landing: secure under-support");
    }
    if (context.mode === "finalThird") {
      assign("boxRun", ["striker", "secondStriker", "wideForward"], "Switch landing: near-box run");
      assign("farPostRun", ["wideForward", "striker", "secondStriker"], "Switch landing: far-post run", -context.sideSign);
      assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Switch landing: cutback edge", context.sideSign);
    } else if (context.mode === "progress") {
      assign("widthHold", ["wideForward", "wideBack"], "Switch landing: hold width to stretch", context.sideSign);
    }
    assign("restBalance", ["rest", "pivot", "wideBack"], "Switch landing: rest balance");
    if (context.targetDepth >= 48 || context.isPressureEscapeSwitch || context.mode === "finalThird") {
      assign("weakRestLock", ["rest", "wideBack", "pivot"], "Switch landing: far-side rest lock", -context.sideSign);
    }
    if (labels.length) {
      labels.unshift(
        context.mode === "finalThird"
          ? "Switch landing attack: attack the far side"
          : context.mode === "wideIsolation"
            ? "Switch landing attack: isolate and support"
            : context.mode === "settle"
              ? "Switch landing attack: secure the far side"
              : "Switch landing attack: progress after switch"
      );
    }
    return {
      labels: uniquePrincipleLabels(labels),
      protectedIds: protectedSwitchIds,
    };
  }

  return {
    getSwitchLandingAttackContext,
    getSwitchLandingAttackTarget,
    applySwitchLandingAttackTargets,
  };
}
