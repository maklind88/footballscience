export function createGameSimulatorAutopilotOffballReceptionCarrySupportTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getPlayerById,
    getWideSideSign,
    isWideChannel,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getReceptionSupportTarget(teamId, hubPoint, slot, sideSign = 1, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const depth = getAttackingDepth(hubPoint, teamId);
    const compactness = profile.supportCompactness ?? 0.58;
    const width = profile.widthDiscipline ?? 0.64;
    const directness = profile.directness ?? 0.52;
    const wideY = pitch.width / 2 + sideSign * lerp(22, 29, width);
    const halfSpaceY = pitch.width / 2 + sideSign * 12.5;
    const insideY = lerp(hubPoint.y, halfSpaceY, isWideChannel(hubPoint) ? 0.72 : 0.38);
    const outsideY = clamp(hubPoint.y + sideSign * lerp(5.5, 8.5, width), 3.5, pitch.width - 3.5);
    const points = {
      under: getDepthPoint(teamId, clamp(depth - lerp(8, 13.5, compactness), 18, 78), {
        y: clamp(lerp(hubPoint.y, pitch.width / 2 + sideSign * 5.5, 0.5), 8, pitch.width - 8),
      }),
      inside: getDepthPoint(teamId, clamp(depth - 1.5 + directness * 2.5, 32, 86), {
        y: clamp(insideY, 8, pitch.width - 8),
      }),
      outside: getDepthPoint(teamId, clamp(depth + lerp(1.5, 6.5, width), 34, 93), {
        y: outsideY,
      }),
      beyond: getDepthPoint(teamId, clamp(depth + lerp(7.5, 15, directness), 48, 97), {
        y: clamp(lerp(hubPoint.y, pitch.width / 2 - sideSign * 5.5, 0.42), 11, pitch.width - 11),
      }),
      weakSide: getDepthPoint(teamId, clamp(depth + 3.5, 36, 88), {
        y: clamp(wideY * -1 + pitch.width, 3.5, pitch.width - 3.5),
      }),
      restLink: clampToPitch({
        x: hubPoint.x - sign * (18 + (profile.restBehind ?? 22) * 0.14),
        y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.72), 14, pitch.width - 14),
      }, 3),
    };
    return points[slot] ?? points.under;
  }

  function applyReceptionSupportPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    if (actionMeta?.actionType !== "pass") {
      return [];
    }
    const labels = [];
    const localExcluded = new Set(excludedIds);
    const receiver = getPlayerById(actionMeta?.receiverPlayerId);
    const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
    const hubPlayer = receiver ?? plannedRunner ?? null;
    const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
    const hubPoint = clampToPitch(ballPoint ?? actionMeta?.target ?? state.ball.target, 2.5);
    const sideSign =
      getWideSideSign(hubPoint) ||
      getWideSideSign(hubPlayer) ||
      getWideSideSign(startPoint) ||
      1;
    const targetDepth = getAttackingDepth(hubPoint, teamId);
    const targetIsWide = isWidePrincipleZone(hubPoint);
    const targetIsCentral = Math.abs(hubPoint.y - pitch.width / 2) <= 15;
    if (hubPlayer) {
      localExcluded.add(hubPlayer.id);
    }
    const underSupport = getMovableAutopilotPlayerByRoles(
      teamId,
      ["pivot", "connector", "wideBack"],
      targets,
      localExcluded,
      hubPoint
    );
    if (setAutopilotPrincipleTarget(targets, underSupport, getReceptionSupportTarget(teamId, hubPoint, "under", sideSign, profile))) {
      localExcluded.add(underSupport.id);
      excludedIds.add(underSupport.id);
      labels.push("Reception triangle");
    }
    const insideSupport = getMovableAutopilotPlayerByRolesOnSide(
      teamId,
      ["connector", "pivot", "wideForward"],
      targets,
      localExcluded,
      targetIsWide ? sideSign : 0,
      hubPoint
    );
    if (setAutopilotPrincipleTarget(targets, insideSupport, getReceptionSupportTarget(teamId, hubPoint, "inside", sideSign, profile))) {
      localExcluded.add(insideSupport.id);
      excludedIds.add(insideSupport.id);
      labels.push("Inside support angle");
    }
    if (targetIsWide && (profile.overlapBias >= 0.52 || profile.widthDiscipline >= 0.62)) {
      const outsideSupport = getMovableAutopilotPlayerByRolesOnSide(
        teamId,
        ["wideBack", "wideForward"],
        targets,
        localExcluded,
        sideSign,
        hubPoint
      );
      if (setAutopilotPrincipleTarget(targets, outsideSupport, getReceptionSupportTarget(teamId, hubPoint, "outside", sideSign, profile))) {
        localExcluded.add(outsideSupport.id);
        excludedIds.add(outsideSupport.id);
        labels.push("Outside option");
      }
    }
    if (targetDepth >= 38 && (targetIsCentral || profile.directness >= 0.56 || plannedRunner)) {
      const depthOption = getMovableAutopilotPlayerByRoles(
        teamId,
        ["striker", "wideForward", "secondStriker"],
        targets,
        localExcluded,
        hubPoint
      );
      if (setAutopilotPrincipleTarget(targets, depthOption, getReceptionSupportTarget(teamId, hubPoint, "beyond", sideSign, profile))) {
        localExcluded.add(depthOption.id);
        excludedIds.add(depthOption.id);
        labels.push("Next depth option");
      }
    }
    if (!targetIsWide && profile.switchBias >= 0.56) {
      const weakSide = getMovableAutopilotPlayerByRolesOnSide(
        teamId,
        ["wideForward", "wideBack"],
        targets,
        localExcluded,
        -sideSign,
        hubPoint
      );
      if (setAutopilotPrincipleTarget(targets, weakSide, getReceptionSupportTarget(teamId, hubPoint, "weakSide", sideSign, profile))) {
        localExcluded.add(weakSide.id);
        excludedIds.add(weakSide.id);
        labels.push("Weak-side release");
      }
    }
    const restLink = getMovableAutopilotPlayerByRoles(
      teamId,
      ["pivot", "rest"],
      targets,
      localExcluded,
      hubPoint
    );
    if (setAutopilotPrincipleTarget(targets, restLink, getReceptionSupportTarget(teamId, hubPoint, "restLink", sideSign, profile))) {
      excludedIds.add(restLink.id);
    }
    return labels;
  }

  function getOpenGrassCarrySupportTarget(teamId, startPoint, ballPoint, slot, sideSign = 1, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const targetDepth = getAttackingDepth(ballPoint, teamId);
    const startDepth = getAttackingDepth(startPoint, teamId);
    const halfY = pitch.width / 2 + sideSign * 12.5;
    const wideY = clamp(pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.48, 24, 31), 3.4, pitch.width - 3.4);
    const farWideY = clamp(pitch.width / 2 - sideSign * clamp((profile.width ?? 58) * 0.48, 24, 31), 3.4, pitch.width - 3.4);
    const carryDistance = distance(startPoint, ballPoint);
    const points = {
      stretchAhead: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.directness * 6, Math.max(48, targetDepth + 4), 97), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 5.5, 0.45), 9, pitch.width - 9),
      }),
      insideLane: getDepthPoint(teamId, clamp(targetDepth + 1.5 + profile.shortSupport * 5, Math.max(38, startDepth + 5), 86), {
        y: clamp(lerp(ballPoint.y, halfY, 0.58), 8, pitch.width - 8),
      }),
      outsideLane: getDepthPoint(teamId, clamp(targetDepth + 1 + profile.widthDiscipline * 4, Math.max(36, startDepth + 3), 92), {
        y: clamp(lerp(ballPoint.y, wideY, 0.74), 3.4, pitch.width - 3.4),
      }),
      trailingSupport: getDepthPoint(teamId, clamp(targetDepth - 10 - profile.supportCompactness * 6, 20, 76), {
        y: clamp(lerp(startPoint.y, pitch.width / 2 + sideSign * 5.5, 0.48), 10, pitch.width - 10),
      }),
      farRelease: getDepthPoint(teamId, clamp(targetDepth + 4 + profile.switchBias * 8, 38, 90), {
        y: farWideY,
      }),
      cutbackEdge: getDepthPoint(teamId, clamp(72 + profile.shortSupport * 6 + Math.min(carryDistance, 18) * 0.08, 70, 83), {
        y: clamp(pitch.width / 2 - sideSign * 6.2, 14, pitch.width - 14),
      }),
      boxArrive: getDepthPoint(teamId, clamp(86 + profile.directness * 7, 82, 98), {
        y: clamp(pitch.width / 2 + sideSign * 6.8, 12, pitch.width - 12),
      }),
      farPost: getDepthPoint(teamId, clamp(87, 84, 97), {
        y: clamp(pitch.width / 2 - sideSign * 11.5, 11, pitch.width - 11),
      }),
      restLock: clampToPitch({
        x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
      }, 3),
    };
    return points[slot] ?? points.insideLane;
  }

  function applyOpenGrassCarrySupportTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    if (actionMeta?.actionType !== "dribble" || !ballPoint) {
      return [];
    }
    const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
    const carryDistance = distance(startPoint, ballPoint);
    const forwardGain = (ballPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
    const actionSpace = getActionSpaceValue(startPoint, ballPoint, teamId, profile);
    const targetThreat = actionSpace.targetThreat;
    const principleText = [
      actionMeta?.offensiveAutopilot?.principleKey,
      actionMeta?.offensiveAutopilot?.principleLabel,
      ...(actionMeta?.autoPrinciples ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    const isOpenGrassCarry =
      principleText.includes("open-grass") ||
      (
        carryDistance >= 9 &&
        forwardGain >= 5 &&
        actionSpace.openTarget >= 0.5 &&
        actionSpace.targetPressure <= 0.66
      );
    if (!isOpenGrassCarry) {
      return [];
    }
    const labels = [];
    const localExcluded = new Set(excludedIds);
    const sideSign = getWideSideSign(ballPoint) || getWideSideSign(startPoint) || 1;
    const targetDepth = getAttackingDepth(ballPoint, teamId);
    const targetIsWide = isWidePrincipleZone(ballPoint);
    const finalThirdCarry = targetDepth >= 64 || targetThreat.box >= 0.18 || targetThreat.behindLine >= 0.3;
    const assign = (slot, roleKeys, label, preferredSide = 0) => {
      const player = preferredSide
        ? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
        : getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
      if (!setAutopilotPrincipleTarget(
        targets,
        player,
        getOpenGrassCarrySupportTarget(teamId, startPoint, ballPoint, slot, sideSign, profile)
      )) {
        return null;
      }
      localExcluded.add(player.id);
      excludedIds.add(player.id);
      if (label) {
        labels.push(label);
      }
      return player;
    };
    assign("stretchAhead", ["striker", "wideForward", "secondStriker"], "Carry support: stretch last line");
    assign("insideLane", ["connector", "wideForward", "secondStriker"], "Carry support: inside lane", targetIsWide ? sideSign : 0);
    if (targetIsWide || profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.66) {
      assign("outsideLane", ["wideBack", "wideForward"], "Carry support: outside option", sideSign);
    }
    assign("trailingSupport", ["pivot", "connector", "wideBack"], "Carry support: trailing option");
    if (finalThirdCarry) {
      assign("boxArrive", ["striker", "wideForward", "secondStriker"], "Carry support: box arrival");
      assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Carry support: cutback edge");
      assign("farPost", ["wideForward", "striker", "secondStriker"], "Carry support: far-post threat", -sideSign);
    } else if (profile.switchBias >= 0.56 || actionSpace.targetPressure >= 0.46) {
      assign("farRelease", ["wideForward", "wideBack"], "Carry support: far release", -sideSign);
    }
    assign("restLock", ["pivot", "rest"], "Carry support: rest-defence lock");
    return uniquePrincipleLabels(labels);
  }

  return {
    getReceptionSupportTarget,
    applyReceptionSupportPrincipleTargets,
    getOpenGrassCarrySupportTarget,
    applyOpenGrassCarrySupportTargets,
  };
}
