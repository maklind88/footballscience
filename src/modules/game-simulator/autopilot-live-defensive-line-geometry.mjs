export function createGameSimulatorAutopilotLiveDefensiveLineGeometry(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    getDefendingDirectionSign,
    getDefensiveLineCenterY,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineWidth,
    getDefensiveLineX,
    getDistanceFromOwnGoal,
    getOwnGoalCenter,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pitch,
    state,
  } = deps;

  function enforceDefensiveUnitCompactness(
    teamId,
    targets,
    groups,
    ballPoint,
    profile,
    protectedIds = new Set()
  ) {
    const compactnessWeight =
      profile.unitCompactnessWeight ??
      (profile.phaseKey === "lowBlock" ? 0.7 : profile.phaseKey === "boxDefending" ? 0.76 : 0.42);
    if (compactnessWeight <= 0) {
      return [];
    }

    const labels = [];
    ["back", "midfield", "forward"].forEach((lineKey) => {
      const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player));
      if (!players.length) {
        return;
      }

      const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
      const lineWidth = getDefensiveLineWidth(lineKey, profile, ballPoint, players.length);
      const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
      players.forEach((player, index) => {
        if (protectedIds.has(player.id)) {
          return;
        }
        const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
        const unitSlot = clampToPitch({
          x: lineX,
          y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3, pitch.width - 3),
        }, 2.2);
        const currentTarget = targets.get(player.id) ?? player.position;
        const target = clampToPitch({
          x: lerp(currentTarget.x, unitSlot.x, compactnessWeight),
          y: lerp(currentTarget.y, unitSlot.y, compactnessWeight),
        }, 2.2);
        targets.set(player.id, target);
      });
    });

    if (profile.phaseKey === "lowBlock") {
      labels.push("Low-block unit spacing");
    } else if (profile.phaseKey === "boxDefending") {
      labels.push("Box unit spacing");
    }
    return labels;
  }

  function getDefensiveUnitGap(profile, lineKey) {
    if (typeof profile.unitPlayerGap === "number") {
      return profile.unitPlayerGap;
    }
    if (profile.unitPlayerGap?.[lineKey]) {
      return profile.unitPlayerGap[lineKey];
    }

    const phaseDefault =
      profile.phaseKey === "boxDefending"
        ? 7.5
        : profile.phaseKey === "lowBlock"
          ? 8
          : 9;
    const gapRange = profile.playerGap?.[lineKey];
    if (!gapRange) {
      return phaseDefault;
    }
    return clamp((gapRange.min + gapRange.max) / 2, gapRange.min, gapRange.max);
  }

  function enforceDefensiveBlockGeometryLock(
    teamId,
    targets,
    groups,
    ballPoint,
    profile,
    protectedIds = new Set()
  ) {
    if (profile.phaseKey !== "lowBlock" && profile.phaseKey !== "boxDefending") {
      return [];
    }

    const labels = [];
    const lockWeight = profile.phaseKey === "boxDefending" ? 0.96 : 0.92;
    ["back", "midfield", "forward"].forEach((lineKey) => {
      const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player));
      if (!players.length) {
        return;
      }

      const gap = getDefensiveUnitGap(profile, lineKey);
      const lineWidth = gap * Math.max(0, players.length - 1);
      const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
      const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
      const lineWeight = lineKey === "forward" ? lockWeight * 0.84 : lockWeight;
      players.forEach((player, index) => {
        if (protectedIds.has(player.id)) {
          return;
        }
        const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
        const slot = clampToPitch({
          x: lineX,
          y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3, pitch.width - 3),
        }, 2.2);
        const currentTarget = targets.get(player.id) ?? player.position;
        targets.set(player.id, clampToPitch({
          x: lerp(currentTarget.x, slot.x, lineWeight),
          y: lerp(currentTarget.y, slot.y, lineWeight),
        }, 2.2));
      });
    });

    labels.push(profile.phaseKey === "boxDefending" ? "Box geometry lock" : "Low-block geometry lock");
    return labels;
  }

  function enforceDefensiveLineStaggering(
    teamId,
    targets,
    groups,
    ballPoint,
    profile,
    protectedIds = new Set()
  ) {
    if (!ballPoint || state.restartPhase?.type) {
      return [];
    }

    const labels = [];
    const sign = getDefendingDirectionSign(teamId);
    const ownGoal = getOwnGoalCenter(teamId);
    const ballSide = getWideSideSign(ballPoint) || 1;
    const phaseDepthScale =
      profile.phaseKey === "boxDefending"
        ? 0.68
        : profile.phaseKey === "lowBlock"
          ? 0.86
          : profile.phaseKey === "highPress"
            ? 1.16
            : 1;
    const actionMode = profile.lineActionAdjustment?.mode ?? "hold";
    const actionDropBoost = actionMode === "drop" || actionMode === "delayDrop" ? 0.8 : 0;
    const actionStepBoost = actionMode === "step" ? 0.7 : 0;
    ["back", "midfield", "forward"].forEach((lineKey) => {
      const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player));
      const available = players
        .filter((player) => targets.has(player.id) && !protectedIds.has(player.id))
        .map((player) => ({
          player,
          target: cloneVector(targets.get(player.id)),
        }))
        .sort((a, b) => Math.abs(a.target.y - ballPoint.y) - Math.abs(b.target.y - ballPoint.y));
      if (!available.length) {
        return;
      }

      const ballNearId = available[0].player.id;
      const lineDepth = getDefensiveLineDistanceFromOwnGoal(teamId, lineKey, ballPoint, profile);
      const maxCoverDrop =
        lineKey === "back"
          ? (2.6 + actionDropBoost) * phaseDepthScale
          : lineKey === "midfield"
            ? (1.8 + actionDropBoost * 0.5) * phaseDepthScale
            : 1.1 * phaseDepthScale;
      const maxStepOut =
        lineKey === "back"
          ? (1.05 + actionStepBoost) * phaseDepthScale
          : lineKey === "midfield"
            ? (1.55 + actionStepBoost) * phaseDepthScale
            : (1.85 + actionStepBoost) * phaseDepthScale;
      players.forEach((player) => {
        if (protectedIds.has(player.id) || !targets.has(player.id) || isGoalkeeper(player)) {
          return;
        }

        const currentTarget = cloneVector(targets.get(player.id));
        const playerSide = Math.sign(currentTarget.y - pitch.width / 2) || ballSide;
        const lateralGap = Math.abs(currentTarget.y - ballPoint.y);
        const ballNear = player.id === ballNearId;
        const sameSide = playerSide === ballSide;
        const farSide = playerSide === -ballSide;
        const centrality = 1 - Math.abs(currentTarget.y - pitch.width / 2) / (pitch.width / 2);
        let depthAdjustment = 0;
        let yAdjustment = 0;
        if (ballNear) {
          depthAdjustment += maxStepOut;
          yAdjustment += (ballPoint.y - currentTarget.y) * (lineKey === "forward" ? 0.18 : 0.1);
        } else if (sameSide && lateralGap <= 14) {
          depthAdjustment -= maxCoverDrop * 0.5;
          yAdjustment += (ballPoint.y - currentTarget.y) * 0.04;
        } else if (farSide) {
          depthAdjustment -= maxCoverDrop * 0.58;
          yAdjustment += (pitch.width / 2 - currentTarget.y) * (lineKey === "back" ? 0.12 : 0.08);
        } else if (centrality >= 0.62) {
          depthAdjustment -= maxCoverDrop * 0.34;
        }
        if (
          lineKey === "back" &&
          (profile.threatResponse?.isBoxThreat || profile.threatResponse?.isGoldenZoneThreat)
        ) {
          depthAdjustment -= maxCoverDrop * (ballNear ? 0.16 : 0.28);
        }

        const targetDepth = clamp(
          lineDepth + depthAdjustment,
          profile.minBackLineFromOwnGoal ?? 5,
          profile.maxBackLineFromOwnGoal + (lineKey === "forward" ? 22 : lineKey === "midfield" ? 12 : 2)
        );
        const staggeredTarget = clampToPitch({
          x: ownGoal.x + sign * targetDepth,
          y: clamp(currentTarget.y + yAdjustment, 3.2, pitch.width - 3.2),
        }, 2.2);
        targets.set(player.id, staggeredTarget);
      });
    });

    labels.push("Line staggering and cover depth");
    return labels;
  }

  function enforceDefensiveLineChainSpacing(
    teamId,
    targets,
    groups,
    ballPoint,
    profile,
    fixedIds = new Set()
  ) {
    const restartType = state.restartPhase?.type;
    if (!ballPoint || (restartType && restartType !== "kickoff")) {
      return [];
    }

    const labels = [];
    let adjusted = false;
    const phaseWeight =
      profile.phaseKey === "boxDefending"
        ? 0.86
        : profile.phaseKey === "lowBlock"
          ? 0.78
          : profile.phaseKey === "highPress"
            ? 0.46
            : 0.62;
    ["back", "midfield", "forward"].forEach((lineKey) => {
      const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player) && targets.has(player.id));
      if (players.length < 2) {
        return;
      }

      const baseGap = getDefensiveUnitGap(profile, lineKey);
      const minGap = clamp(
        baseGap - (profile.phaseKey === "boxDefending" ? 1.05 : profile.phaseKey === "highPress" ? 1.55 : 1.25),
        lineKey === "forward" ? 5.8 : 6.2,
        9.4
      );
      const maxGap = clamp(
        baseGap + (profile.phaseKey === "highPress" ? 3.1 : profile.phaseKey === "midBlock" ? 2.5 : 1.8),
        minGap + 1.4,
        lineKey === "forward" ? 14.2 : 12.4
      );
      const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
      const maxLineDrift =
        lineKey === "forward"
          ? (profile.phaseKey === "highPress" ? 11.5 : 8.4)
          : lineKey === "midfield"
            ? (profile.phaseKey === "highPress" ? 8.6 : profile.phaseKey === "midBlock" ? 6.8 : 5.8)
            : (profile.phaseKey === "highPress" ? 7.4 : profile.phaseKey === "midBlock" ? 5.8 : 4.8);
      const entries = players
        .map((player) => ({
          player,
          target: cloneVector(targets.get(player.id)),
        }))
        .sort((a, b) => a.target.y - b.target.y);

      for (let pass = 0; pass < 3; pass += 1) {
        entries.sort((a, b) => a.target.y - b.target.y);
        for (let index = 0; index < entries.length - 1; index += 1) {
          const upper = entries[index];
          const lower = entries[index + 1];
          if (fixedIds.has(upper.player.id) && fixedIds.has(lower.player.id)) {
            continue;
          }
          const gap = lower.target.y - upper.target.y;
          let correction = 0;
          if (gap < minGap) {
            correction = (minGap - gap) / 2;
          } else if (gap > maxGap) {
            correction = -(gap - maxGap) / 2;
          }
          if (Math.abs(correction) < 0.02) {
            continue;
          }
          const upperWeight = fixedIds.has(upper.player.id) ? 0 : phaseWeight;
          const lowerWeight = fixedIds.has(lower.player.id) ? 0 : phaseWeight;
          upper.target.y = clamp(upper.target.y - correction * upperWeight, 3.2, pitch.width - 3.2);
          lower.target.y = clamp(lower.target.y + correction * lowerWeight, 3.2, pitch.width - 3.2);
          adjusted = adjusted || upperWeight > 0 || lowerWeight > 0;
        }
      }

      entries.forEach(({ player, target }) => {
        if (fixedIds.has(player.id)) {
          return;
        }
        const currentTarget = targets.get(player.id) ?? target;
        const xDrift = currentTarget.x - lineX;
        const chainX =
          Math.abs(xDrift) > maxLineDrift
            ? lineX + Math.sign(xDrift) * maxLineDrift
            : currentTarget.x;
        adjusted = adjusted || Math.abs(chainX - currentTarget.x) > 0.04;
        targets.set(player.id, clampToPitch({
          x: lerp(currentTarget.x, chainX, phaseWeight * 0.72),
          y: target.y,
        }, 2.2));
      });
    });

    if (adjusted) {
      labels.push("Defensive chain spacing");
    }
    return labels;
  }

  function enforceDefensiveVerticalBlockConnections(
    teamId,
    targets,
    groups,
    ballPoint,
    profile,
    fixedIds = new Set()
  ) {
    if (!ballPoint || state.restartPhase?.type) {
      return [];
    }

    const ownGoalX = teamId === "home" ? 0 : pitch.length;
    const sign = getDefendingDirectionSign(teamId);
    const labels = [];
    let adjusted = false;
    const phaseWeight =
      profile.phaseKey === "boxDefending"
        ? 0.82
        : profile.phaseKey === "lowBlock"
          ? 0.74
          : profile.phaseKey === "highPress"
            ? 0.42
            : 0.56;
    const phaseTolerance = {
      back: profile.phaseKey === "boxDefending" ? 2.2 : profile.phaseKey === "lowBlock" ? 2.8 : profile.phaseKey === "highPress" ? 5.4 : 4.2,
      midfield: profile.phaseKey === "boxDefending" ? 2.8 : profile.phaseKey === "lowBlock" ? 3.5 : profile.phaseKey === "highPress" ? 6.6 : 5.1,
      forward: profile.phaseKey === "boxDefending" ? 4.2 : profile.phaseKey === "lowBlock" ? 5.2 : profile.phaseKey === "highPress" ? 9.2 : 7.4,
    };
    ["back", "midfield", "forward"].forEach((lineKey) => {
      const players = (groups[lineKey] ?? []).filter((player) => !isGoalkeeper(player) && targets.has(player.id));
      if (!players.length) {
        return;
      }
      const lineDepth = getDefensiveLineDistanceFromOwnGoal(teamId, lineKey, ballPoint, profile);
      const tolerance = phaseTolerance[lineKey] ?? 5;
      players.forEach((player) => {
        if (fixedIds.has(player.id)) {
          return;
        }
        const currentTarget = targets.get(player.id);
        const currentDepth = getDistanceFromOwnGoal(teamId, currentTarget);
        const boundedDepth = lineDepth + clamp(currentDepth - lineDepth, -tolerance, tolerance);
        const nextDepth = lerp(currentDepth, boundedDepth, phaseWeight);
        if (Math.abs(nextDepth - currentDepth) > 0.05) {
          adjusted = true;
        }
        targets.set(player.id, clampToPitch({
          x: ownGoalX + sign * nextDepth,
          y: currentTarget.y,
        }, 2.2));
      });
    });

    if (adjusted) {
      labels.push("Vertical block connection");
    }
    return labels;
  }

  return {
    enforceDefensiveUnitCompactness,
    getDefensiveUnitGap,
    enforceDefensiveBlockGeometryLock,
    enforceDefensiveLineStaggering,
    enforceDefensiveLineChainSpacing,
    enforceDefensiveVerticalBlockConnections,
  };
}
