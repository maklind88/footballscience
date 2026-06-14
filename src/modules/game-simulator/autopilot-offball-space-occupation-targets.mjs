export function createGameSimulatorAutopilotOffballSpaceOccupationTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOpponentBlockReadProfile,
    getOpponentLineDepthsForAttackingTeam,
    getPitchThreatProfile,
    getWideSideSign,
    isTransitionAttackStyle,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    uniquePrincipleLabels,
  } = deps;

  function getOpponentBlockOccupationTarget(teamId, ballPoint, slot, block, sideSign = 1, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const ballDepth = getAttackingDepth(ballPoint, teamId);
    const lineDepths = block?.lineDepths ?? getOpponentLineDepthsForAttackingTeam(teamId, ballPoint);
    const width = clamp(profile.width ?? 58, 42, 66);
    const wideOffset = clamp(width * 0.49, 25.5, 31.5);
    const halfOffset = clamp(width * 0.24, 12, 17);
    const strongWideY = clamp(pitch.width / 2 + sideSign * wideOffset, 3.4, pitch.width - 3.4);
    const weakWideY = clamp(pitch.width / 2 - sideSign * wideOffset, 3.4, pitch.width - 3.4);
    const strongHalfY = clamp(pitch.width / 2 + sideSign * halfOffset, 8, pitch.width - 8);
    const weakHalfY = clamp(pitch.width / 2 - sideSign * halfOffset, 8, pitch.width - 8);
    const betweenLinesDepth = clamp(
      (lineDepths.midfield + lineDepths.back) / 2,
      Math.max(38, ballDepth + 2),
      84
    );
    const highLineRunDepth = clamp((lineDepths.back ?? ballDepth + 18) + 8 + (profile.runnerBoost ?? 7) * 0.25, 56, 98);
    const points = {
      strongWidth: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.widthDiscipline * 5, 34, 90), {
        y: strongWideY,
      }),
      weakWidth: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 7, 36, 88), {
        y: weakWideY,
      }),
      switchRelease: getDepthPoint(teamId, clamp(ballDepth + 7 + profile.switchBias * 8, 42, 92), {
        y: weakWideY,
      }),
      betweenLinesPocket: getDepthPoint(teamId, betweenLinesDepth, {
        y: strongHalfY,
      }),
      farBetweenLinesPocket: getDepthPoint(teamId, clamp(betweenLinesDepth + 1.6, 42, 84), {
        y: weakHalfY,
      }),
      bounceUnder: getDepthPoint(teamId, clamp(ballDepth - 9 - profile.shortSupport * 4, 18, 74), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.5, 0.45), 10, pitch.width - 10),
      }),
      highLineRun: getDepthPoint(teamId, highLineRunDepth, {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 7, 0.46), 10, pitch.width - 10),
      }),
      boxPin: getDepthPoint(teamId, clamp(85 + profile.directness * 7, 82, 98), {
        y: clamp(pitch.width / 2 + sideSign * 5.2, 13, pitch.width - 13),
      }),
      cutbackEdge: getDepthPoint(teamId, clamp(72 + profile.shortSupport * 6, 70, 82), {
        y: clamp(pitch.width / 2 - sideSign * 6.4, 15, pitch.width - 15),
      }),
      farPost: getDepthPoint(teamId, clamp(87, 84, 96), {
        y: clamp(pitch.width / 2 - sideSign * 11.8, 12, pitch.width - 12),
      }),
      restLock: clampToPitch({
        x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
      }, 3),
    };
    return points[slot] ?? points.bounceUnder;
  }

  function applyOpponentBlockResponsiveTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    if (profile.phaseKey === "setPiece" || !ballPoint) {
      return [];
    }
    const block = getOpponentBlockReadProfile(teamId, ballPoint);
    const labels = [];
    const localExcluded = new Set(excludedIds);
    const sideSign = getWideSideSign(ballPoint) || block.ballSide || 1;
    const assign = (slot, roleKeys, label, preferredSide = 0) => {
      const player = preferredSide
        ? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
        : getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
      if (!setAutopilotPrincipleTarget(
        targets,
        player,
        getOpponentBlockOccupationTarget(teamId, ballPoint, slot, block, sideSign, profile)
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
    if (block.compactCenter >= 0.52) {
      assign("strongWidth", ["wideBack", "wideForward"], "Block read: stretch compact centre", sideSign);
      assign("weakWidth", ["wideForward", "wideBack"], "Block read: hold far width", -sideSign);
      if (block.lineGap >= 0.3 || profile.shortSupport >= 0.6) {
        assign("betweenLinesPocket", ["connector", "wideForward", "secondStriker"], "Block read: pocket outside compact block", sideSign);
      }
    }
    if (block.ballSideCompression >= 0.46) {
      assign("switchRelease", ["wideForward", "wideBack"], "Block read: weak-side release", -sideSign);
      assign("bounceUnder", ["pivot", "connector", "wideBack"], "Block read: bounce to switch");
    }
    if (block.lineGap >= 0.42) {
      assign("betweenLinesPocket", ["connector", "secondStriker", "wideForward"], "Block read: occupy line gap", sideSign);
      assign("farBetweenLinesPocket", ["connector", "wideForward"], "Block read: far pocket", -sideSign);
    }
    if (block.highLine >= 0.38) {
      assign("highLineRun", ["striker", "wideForward", "secondStriker"], "Block read: threaten high line");
      assign("bounceUnder", ["pivot", "connector"], "Block read: set the through ball");
    }
    if (block.deepBlock >= 0.38) {
      assign("strongWidth", ["wideBack", "wideForward"], "Block read: stretch low block", sideSign);
      assign("boxPin", ["striker", "secondStriker", "wideForward"], "Block read: pin box line");
      assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Block read: cutback edge");
      assign("farPost", ["wideForward", "striker", "secondStriker"], "Block read: far-post occupation", -sideSign);
    }
    if (block.nearBallPressure >= 0.5 && block.ballSideCompression < 0.46) {
      assign("bounceUnder", ["pivot", "connector", "wideBack"], "Block read: secure pressure escape");
    }
    assign("restLock", ["pivot", "rest"], "Block read: rest-defence balance");
    return uniquePrincipleLabels(labels);
  }

  function getGameSpaceOffBallTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}, gameSpace = null) {
    const sign = getAttackDirectionSign(teamId);
    const depth = getAttackingDepth(ballPoint, teamId);
    const lineDepths = gameSpace?.lineDepths ?? getAttackingGameSpaceProfile(ballPoint, teamId).lineDepths;
    const nextLine = gameSpace?.nextLineDepth ?? lineDepths.midfield;
    const backLine = lineDepths.back ?? clamp(depth + 20, 52, 84);
    const spaceTwoDepth = clamp((lineDepths.midfield + lineDepths.back) / 2, 42, 82);
    const runnerBoost = profile.runnerBoost ?? 6;
    const width = profile.width ?? 58;
    const spaceThreeDepth = clamp(backLine + 7.5 + runnerBoost * 0.35, 56, 98);
    const nearHalfY = clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 12.5, 0.5), 8, pitch.width - 8);
    const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
    const farWideY = clamp(pitch.width / 2 - sideSign * clamp(width * 0.48, 24, 31), 3.5, pitch.width - 3.5);
    const points = {
      outletUnder: getDepthPoint(teamId, clamp(depth - 9 - profile.shortSupport * 5, 16, 68), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.8, 0.42), 10, pitch.width - 10),
      }),
      spaceOneLink: getDepthPoint(teamId, clamp(Math.max(depth + 4, lineDepths.forward + 3), 24, 58), {
        y: clamp(lerp(ballPoint.y, nearHalfY, 0.5), 8, pitch.width - 8),
      }),
      spaceTwoPocket: getDepthPoint(teamId, clamp(spaceTwoDepth, Math.max(38, depth + 2), 84), {
        y: nearHalfY,
      }),
      farSpaceTwoPocket: getDepthPoint(teamId, clamp(spaceTwoDepth + profile.switchBias * 2.2, 42, 84), {
        y: farHalfY,
      }),
      spaceThreeRun: getDepthPoint(teamId, spaceThreeDepth, {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 7.5, 0.45), 10, pitch.width - 10),
      }),
      wideStretch: getDepthPoint(teamId, clamp(Math.max(depth + 2, nextLine - 2), 34, 90), {
        y: clamp(pitch.width / 2 + sideSign * clamp(width * 0.48, 24, 31), 3.5, pitch.width - 3.5),
      }),
      weakSideHold: getDepthPoint(teamId, clamp(depth + 3 + profile.switchBias * 5, 34, 88), {
        y: farWideY,
      }),
      boxArrive: getDepthPoint(teamId, clamp(87 + profile.directness * 6, 84, 98), {
        y: clamp(pitch.width / 2 + sideSign * 7.5, 13, pitch.width - 13),
      }),
      cutbackEdge: getDepthPoint(teamId, clamp(73 + profile.shortSupport * 5, 70, 82), {
        y: clamp(pitch.width / 2 - sideSign * 6.2, 15, pitch.width - 15),
      }),
      restLock: clampToPitch({
        x: ballPoint.x - sign * (19 + (profile.restBehind ?? 22) * 0.18),
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
      }, 3),
      farRestCover: clampToPitch({
        x: ballPoint.x - sign * (24 + (profile.restBehind ?? 22) * 0.16),
        y: clamp(pitch.width / 2 - sideSign * 10.5, 12, pitch.width - 12),
      }, 3),
    };
    return points[slot] ?? points.outletUnder;
  }

  function applyGameSpaceOffBallPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    if (profile.phaseKey === "setPiece" || !ballPoint) {
      return [];
    }
    const labels = [];
    const localExcluded = new Set(excludedIds);
    const gameSpace = getAttackingGameSpaceProfile(ballPoint, teamId);
    const targetThreat = getPitchThreatProfile(ballPoint, teamId);
    const sideSign = getWideSideSign(ballPoint) || 1;
    const directStyle = profile.directness >= 0.62 || isTransitionAttackStyle(profile.styleKey);
    const combinationStyle = profile.shortSupport >= 0.62 || profile.tempo >= 0.62;
    const wideStyle = profile.crossBias >= 0.58 || profile.overlapBias >= 0.58 || profile.widthDiscipline >= 0.66;
    const assign = (slot, roleKeys, label, preferredSide = 0) => {
      const player = preferredSide
        ? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
        : getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
      if (!setAutopilotPrincipleTarget(
        targets,
        player,
        getGameSpaceOffBallTarget(teamId, ballPoint, slot, sideSign, profile, gameSpace)
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
    if (gameSpace.key === "outlet" || gameSpace.key === "space1") {
      assign("outletUnder", ["pivot", "connector", "wideBack"], "Spelyta: secure support");
      assign("spaceOneLink", ["connector", "pivot"], "Spelyta: link behind first line");
      if (combinationStyle) {
        assign("spaceTwoPocket", ["connector", "wideForward", "secondStriker"], "Spelyta: prepare space 2");
      }
      if (wideStyle) {
        assign("wideStretch", ["wideForward", "wideBack"], "Spelyta: hold width", sideSign);
        assign("weakSideHold", ["wideForward", "wideBack"], "Spelyta: weak-side width", -sideSign);
      }
      if (directStyle || profile.lineBreakBias >= 0.58) {
        assign("spaceThreeRun", ["striker", "wideForward", "secondStriker"], "Spelyta: threaten space 3");
      }
    }
    if (gameSpace.key === "space2") {
      assign("outletUnder", ["pivot", "connector", "wideBack"], "Spelyta: bounce support");
      assign("farSpaceTwoPocket", ["connector", "wideForward", "secondStriker"], "Spelyta: far pocket");
      assign("spaceThreeRun", ["striker", "wideForward", "secondStriker"], "Spelyta: run beyond");
      if (wideStyle || isWidePrincipleZone(ballPoint)) {
        assign("wideStretch", ["wideForward", "wideBack"], "Spelyta: outside option", sideSign);
        assign("weakSideHold", ["wideForward", "wideBack"], "Spelyta: switch outlet", -sideSign);
      }
    }
    if (gameSpace.key === "space3" || targetThreat.box >= 0.28 || targetThreat.cutbackZone >= 0.28) {
      assign("boxArrive", ["striker", "secondStriker", "wideForward"], "Spelyta: attack box");
      assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Spelyta: cutback edge");
      assign("weakSideHold", ["wideForward", "wideBack"], "Spelyta: far-post width", -sideSign);
    }
    assign("restLock", ["pivot", "rest"], "Spelyta: rest-defence lock");
    if (getAttackingDepth(ballPoint, teamId) >= 46 || actionMeta?.actionType === "dribble") {
      assign("farRestCover", ["rest", "pivot", "wideBack"], "Spelyta: far rest cover", -sideSign);
    }
    return uniquePrincipleLabels(labels);
  }

  return {
    getOpponentBlockOccupationTarget,
    applyOpponentBlockResponsiveTargets,
    getGameSpaceOffBallTarget,
    applyGameSpaceOffBallPrincipleTargets,
  };
}
