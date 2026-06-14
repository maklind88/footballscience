export function createGameSimulatorAutopilotOffballPossessionRouteTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotPossessionPlan,
    getAutoPilotPossessionRouteStage,
    getDepthPoint,
    getLaneCenterY,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPossessionRhythmContext,
    getWideSideSign,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getPossessionRouteOccupationTarget(teamId, ballPoint, slot, context, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const ballDepth = getAttackingDepth(ballPoint, teamId);
    const routeY = getLaneCenterY(context.routeTargetLane ?? getPitchLaneKey(ballPoint), profile);
    const nextY = getLaneCenterY(context.nextRouteLane ?? context.routeTargetLane ?? getPitchLaneKey(ballPoint), profile);
    const routeSide =
      Math.sign(routeY - pitch.width / 2) ||
      getWideSideSign(ballPoint) ||
      1;
    const nextSide =
      Math.sign(nextY - pitch.width / 2) ||
      -routeSide;
    const points = {
      routeLaneWidth: getDepthPoint(teamId, clamp(ballDepth + 2.5 + profile.widthDiscipline * 5, 34, 90), {
        y: clamp(routeY, 3.4, pitch.width - 3.4),
      }),
      routeHalfConnection: getDepthPoint(teamId, clamp(ballDepth + 1 + profile.shortSupport * 5, 34, 82), {
        y: clamp(lerp(routeY, pitch.width / 2 + routeSide * 12.5, 0.48), 7, pitch.width - 7),
      }),
      centralLink: getDepthPoint(teamId, clamp(ballDepth - 3 + profile.shortSupport * 4, 28, 76), {
        y: clamp(lerp(routeY, pitch.width / 2, 0.72), 10, pitch.width - 10),
      }),
      underLink: getDepthPoint(teamId, clamp(ballDepth - 10 - profile.supportCompactness * 5, 18, 72), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - routeSide * 5.2, 0.42), 10, pitch.width - 10),
      }),
      nextLaneRun: getDepthPoint(teamId, clamp(ballDepth + 10 + profile.progressionUrgency * 6, 46, 96), {
        y: clamp(nextY, 5.5, pitch.width - 5.5),
      }),
      switchRelease: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 8, 38, 88), {
        y: clamp(nextY || pitch.width / 2 - routeSide * 25, 3.5, pitch.width - 3.5),
      }),
      depthPin: getDepthPoint(teamId, clamp(ballDepth + 13 + profile.directness * 5, 54, 98), {
        y: clamp(lerp(routeY, pitch.width / 2, 0.58), 12, pitch.width - 12),
      }),
      farSideHold: getDepthPoint(teamId, clamp(ballDepth + 1.5 + profile.switchBias * 5, 34, 86), {
        y: clamp(pitch.width / 2 - nextSide * 27, 3.5, pitch.width - 3.5),
      }),
      restBalance: clampToPitch({
        x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
      }, 3),
    };
    return points[slot] ?? points.centralLink;
  }

  function applyPossessionRoutePrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
    if (!startPoint || !ballPoint || profile.phaseKey === "setPiece") {
      return [];
    }
    const plan = getAutoPilotPossessionPlan(teamId, startPoint, profile);
    const rhythm = getPossessionRhythmContext(teamId);
    const depth = getAttackingDepth(ballPoint, teamId);
    const routeStage = getAutoPilotPossessionRouteStage(plan, rhythm, depth);
    const routeTargetLane =
      plan.routeLanes?.[routeStage] ??
      plan.routeLanes?.[0] ??
      getPitchLaneKey(ballPoint);
    const nextRouteLane =
      plan.routeLanes?.[Math.min(routeStage + 1, (plan.routeLanes?.length ?? 1) - 1)] ??
      routeTargetLane;
    const routeIntent =
      plan.routeIntents?.[Math.min(routeStage, (plan.routeIntents?.length ?? 1) - 1)] ??
      "progress";
    const laneDistance = Math.abs(getPitchLaneIndex(routeTargetLane) - getPitchLaneIndex(nextRouteLane));
    const routeSide =
      Math.sign(getLaneCenterY(routeTargetLane, profile) - pitch.width / 2) ||
      getWideSideSign(ballPoint) ||
      1;
    const targetIsWide = routeTargetLane === "leftWide" || routeTargetLane === "rightWide";
    const targetIsHalf = routeTargetLane === "leftHalf" || routeTargetLane === "rightHalf";
    const targetIsCentral = routeTargetLane === "central";
    const context = {
      plan,
      routeStage,
      routeTargetLane,
      nextRouteLane,
      routeIntent,
    };
    const labels = [];
    const localExcluded = new Set(excludedIds);
    const assign = (slot, roleKeys, label, sideSign = 0) => {
      const player = sideSign
        ? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, sideSign, ballPoint)
        : getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
      if (!setAutopilotPrincipleTarget(targets, player, getPossessionRouteOccupationTarget(teamId, ballPoint, slot, context, profile))) {
        return null;
      }
      localExcluded.add(player.id);
      excludedIds.add(player.id);
      if (label) {
        labels.push(label);
      }
      return player;
    };
    if (targetIsWide) {
      assign("routeLaneWidth", ["wideBack", "wideForward"], "Route width", routeSide);
      assign("routeHalfConnection", ["connector", "wideForward"], "Half-space link", routeSide);
      if (profile.overlapBias >= 0.52 || plan.routeKey === "overlap-cutback") {
        assign("nextLaneRun", ["wideBack", "wideForward"], "Route overlap", routeSide);
      }
    } else if (targetIsHalf) {
      assign("routeHalfConnection", ["connector", "wideForward", "secondStriker"], "Route half-space", routeSide);
      assign("routeLaneWidth", ["wideBack", "wideForward"], "Hold route width", routeSide);
      assign("depthPin", ["striker", "wideForward", "secondStriker"], "Pin for route");
    } else if (targetIsCentral) {
      assign("centralLink", ["pivot", "connector", "secondStriker"], "Central route link");
      assign("depthPin", ["striker", "wideForward", "secondStriker"], "Central depth threat");
      assign("farSideHold", ["wideForward", "wideBack"], "Far-side route outlet", -routeSide);
    }
    if (routeIntent === "switch" || laneDistance >= 2 || plan.routeKey === "wide-overload-switch" || plan.routeKey === "patient-switch") {
      const nextSide = Math.sign(getLaneCenterY(nextRouteLane, profile) - pitch.width / 2) || -routeSide;
      assign("switchRelease", ["wideForward", "wideBack"], "Route switch release", nextSide);
    }
    if (routeIntent === "accelerate" || routeIntent === "finish") {
      assign("nextLaneRun", ["striker", "wideForward", "secondStriker"], "Route acceleration");
    }
    assign("underLink", ["pivot", "connector", "wideBack"], "Route support under");
    assign("restBalance", ["pivot", "rest"], "Route rest-defence");
    if (labels.length) {
      labels.unshift(plan.routeLabel ?? "Possession route");
    }
    return uniquePrincipleLabels(labels);
  }

  return {
    getPossessionRouteOccupationTarget,
    applyPossessionRoutePrincipleTargets,
  };
}
