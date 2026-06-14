export function createGameSimulatorAutopilotOffballPositionalPlayTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getPitchSpaceProfile,
    getWideSideSign,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
  } = deps;

  function getPositionalPlayOccupationTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const ballDepth = getAttackingDepth(ballPoint, teamId);
    const width = clamp(profile.width ?? 58, 42, 66);
    const farWideY = clamp(pitch.width / 2 - sideSign * width * 0.48, 3.8, pitch.width - 3.8);
    const nearHalfY = clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 13.5, 0.46), 8, pitch.width - 8);
    const farHalfY = clamp(lerp(pitch.width / 2 - sideSign * 13.5, ballPoint.y, 0.16), 8, pitch.width - 8);
    const points = {
      underSupport: getDepthPoint(teamId, clamp(ballDepth - 8.5 - profile.shortSupport * 4, 20, 74), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.5, 0.34), 11, pitch.width - 11),
      }),
      nearHalfSupport: getDepthPoint(teamId, clamp(ballDepth + 2.5 + profile.shortSupport * 4, 38, 82), {
        y: nearHalfY,
      }),
      farHalfConnection: getDepthPoint(teamId, clamp(ballDepth + 3.5, 38, 84), {
        y: farHalfY,
      }),
      weakSideWidth: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.switchBias * 5, 36, 86), {
        y: farWideY,
      }),
      depthPin: getDepthPoint(teamId, clamp(ballDepth + 12 + profile.directness * 4, 52, 98), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.58), 14, pitch.width - 14),
      }),
      diagonalRunner: getDepthPoint(teamId, clamp(ballDepth + 11 + profile.runnerBoost * 0.6, 48, 96), {
        y: clamp(pitch.width / 2 - sideSign * 10.5, 9, pitch.width - 9),
      }),
      restLock: clampToPitch({
        x: ballPoint.x - sign * (18 + profile.restBehind * 0.22),
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 15, pitch.width - 15),
      }, 3),
      farRestCover: clampToPitch({
        x: ballPoint.x - sign * (22 + profile.restBehind * 0.18),
        y: clamp(pitch.width / 2 - sideSign * 10.5, 12, pitch.width - 12),
      }, 3),
    };
    return points[slot] ?? points.underSupport;
  }

  function applyPositionalPlayOccupationTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    if (profile.phaseKey === "setPiece") {
      return [];
    }
    const labels = [];
    const ballDepth = getAttackingDepth(ballPoint, teamId);
    const sideSign = getWideSideSign(ballPoint) || 1;
    const targetSpace = getPitchSpaceProfile(ballPoint, teamId);
    const actionType = actionMeta?.actionType ?? state.ball.actionType;
    const isWideAction = targetSpace.wideCorridor >= 0.34 || targetSpace.assistZone >= 0.34 || isWidePrincipleZone(ballPoint);
    const isProgression = ballDepth >= 36;
    const isFinalThird = ballDepth >= 66 || targetSpace.box >= 0.24 || targetSpace.cutbackZone >= 0.28;
    const underSupport = getMovableAutopilotPlayerByRoles(
      teamId,
      ["pivot", "connector"],
      targets,
      excludedIds,
      ballPoint
    );
    if (setAutopilotPrincipleTarget(targets, underSupport, getPositionalPlayOccupationTarget(teamId, ballPoint, "underSupport", sideSign, profile))) {
      excludedIds.add(underSupport.id);
      labels.push("Under-ball support");
    }
    if (isWideAction || isProgression) {
      const weakSideWidth = getMovableAutopilotPlayerByRolesOnSide(
        teamId,
        ["wideForward", "wideBack"],
        targets,
        excludedIds,
        -sideSign,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, weakSideWidth, getPositionalPlayOccupationTarget(teamId, ballPoint, "weakSideWidth", sideSign, profile))) {
        excludedIds.add(weakSideWidth.id);
        labels.push("Weak-side width");
      }
    }
    if (isProgression) {
      const halfSpaceSupport = getMovableAutopilotPlayerByRolesOnSide(
        teamId,
        ["connector", "wideForward", "secondStriker"],
        targets,
        excludedIds,
        sideSign,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, halfSpaceSupport, getPositionalPlayOccupationTarget(teamId, ballPoint, "nearHalfSupport", sideSign, profile))) {
        excludedIds.add(halfSpaceSupport.id);
        labels.push("Half-space support");
      }
    }
    if (isProgression && !isFinalThird) {
      const depthPin = getMovableAutopilotPlayerByRoles(
        teamId,
        ["striker", "secondStriker", "wideForward"],
        targets,
        excludedIds,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, depthPin, getPositionalPlayOccupationTarget(teamId, ballPoint, "depthPin", sideSign, profile))) {
        excludedIds.add(depthPin.id);
        labels.push("Pin last line");
      }
    }
    if (isFinalThird) {
      const diagonalRunner = getMovableAutopilotPlayerByRoles(
        teamId,
        ["wideForward", "secondStriker", "striker"],
        targets,
        excludedIds,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, diagonalRunner, getPositionalPlayOccupationTarget(teamId, ballPoint, "diagonalRunner", sideSign, profile))) {
        excludedIds.add(diagonalRunner.id);
        labels.push("Diagonal box threat");
      }
      const farHalfConnection = getMovableAutopilotPlayerByRolesOnSide(
        teamId,
        ["connector", "wideForward"],
        targets,
        excludedIds,
        -sideSign,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, farHalfConnection, getPositionalPlayOccupationTarget(teamId, ballPoint, "farHalfConnection", sideSign, profile))) {
        excludedIds.add(farHalfConnection.id);
        labels.push("Far-half connection");
      }
    }
    const restLock = getMovableAutopilotPlayerByRoles(
      teamId,
      ["rest", "pivot"],
      targets,
      excludedIds,
      ballPoint
    );
    if (setAutopilotPrincipleTarget(targets, restLock, getPositionalPlayOccupationTarget(teamId, ballPoint, "restLock", sideSign, profile))) {
      excludedIds.add(restLock.id);
      labels.push("Rest-defence lock");
    }
    if ((actionType === "pass" || actionType === "dribble") && ballDepth >= 48) {
      const farRestCover = getMovableAutopilotPlayerByRolesOnSide(
        teamId,
        ["rest", "pivot", "wideBack"],
        targets,
        excludedIds,
        -sideSign,
        ballPoint
      );
      if (setAutopilotPrincipleTarget(targets, farRestCover, getPositionalPlayOccupationTarget(teamId, ballPoint, "farRestCover", sideSign, profile))) {
        excludedIds.add(farRestCover.id);
        labels.push("Far rest cover");
      }
    }
    return labels;
  }

  return {
    getPositionalPlayOccupationTarget,
    applyPositionalPlayOccupationTargets,
  };
}
