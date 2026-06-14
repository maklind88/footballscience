export function createGameSimulatorAutopilotDefensivePrioritySpaceProtectionTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    distance,
    getDefendingDirectionSign,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOpponentPenaltySpot,
    getPitchThreatProfile,
    getPlayerMagnetLabel,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pitch,
    state,
    vec,
  } = deps;

  function getDefensiveThreatResponse(teamId, ballPoint = state.ball.target ?? state.ball.position) {
    const attackingTeamId = getOtherTeamId(teamId);
    const threat = attackingTeamId
      ? getPitchThreatProfile(ballPoint, attackingTeamId)
      : {
        value: 0,
        goldenZone: 0,
        centralPocket: 0,
        betweenLines: 0,
        box: 0,
        assistZone: 0,
        cutbackZone: 0,
        halfSpace: 0,
        centrality: 0,
        depth: 0,
        primaryLabel: "open space",
      };
    const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
    const centrality = 1 - Math.abs(ballPoint.y - pitch.width / 2) / (pitch.width / 2);
    const protectCenter = clamp(
      threat.value * 0.52 +
      threat.centralPocket * 0.3 +
      threat.betweenLines * 0.2 +
      threat.box * 0.42 +
      threat.cutbackZone * 0.28 +
      threat.halfSpace * 0.16 +
      centrality * 0.12 -
      (ballFromOwnGoal > 64 ? 0.16 : 0),
      0,
      1
    );
    const immediatePressure = clamp(
      protectCenter * 0.72 +
      threat.box * 0.26 +
      (ballFromOwnGoal <= 35 ? 0.16 : 0) +
      (threat.assistZone >= 0.45 ? 0.08 : 0),
      0,
      1
    );
    return {
      threat,
      protectCenter,
      immediatePressure,
      isGoldenZoneThreat: threat.centralPocket >= 0.42 || threat.betweenLines >= 0.54,
      isBoxThreat: threat.box >= 0.34,
      isWideAssistThreat: threat.assistZone >= 0.48,
      ballFromOwnGoal,
    };
  }

  function getDefensivePrioritySpacePoint(teamId, ballPoint, profile, slot = "screen") {
    const attackingTeamId = getOtherTeamId(teamId);
    const ownPenaltySpot = attackingTeamId
      ? getOpponentPenaltySpot(attackingTeamId)
      : vec(teamId === "home" ? 11 : pitch.length - 11, pitch.width / 2);
    const sign = getDefendingDirectionSign(teamId);
    const protectCenter = profile.threatResponse?.protectCenter ?? 0;
    const ballSide = getWideSideSign(ballPoint) || 1;
    const points = {
      screen: {
        x: lerp(ballPoint.x, ownPenaltySpot.x, 0.28 + protectCenter * 0.18),
        y: lerp(ballPoint.y, pitch.width / 2, 0.58 + protectCenter * 0.18),
      },
      cover: {
        x: ownPenaltySpot.x + sign * 3.4,
        y: pitch.width / 2,
      },
      farPost: {
        x: ownPenaltySpot.x + sign * 1.2,
        y: pitch.width / 2 - ballSide * 9.8,
      },
      cutback: {
        x: ownPenaltySpot.x + sign * 8.8,
        y: pitch.width / 2 + ballSide * 2.4,
      },
    };
    return clampToPitch(points[slot] ?? points.screen, 3);
  }

  function pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, lineKeys, referencePoint) {
    const candidates = lineKeys
      .flatMap((lineKey) => groups[lineKey] ?? [])
      .filter((player) => player.team === teamId && !excludedIds.has(player.id) && !isGoalkeeper(player));
    if (!candidates.length) {
      return null;
    }
    return candidates
      .map((player) => {
        const target = targets.get(player.id) ?? player.position;
        const label = getPlayerMagnetLabel(player);
        const centralRoleBonus = label === "6" || label === "8" || label === "CB" ? 0.42 : label === "10" ? 0.18 : 0;
        const centrality = 1 - Math.abs(target.y - pitch.width / 2) / (pitch.width / 2);
        return {
          player,
          score:
            distance(player.position, referencePoint) * 0.42 +
            distance(target, referencePoint) * 0.34 -
            centrality * 2.2 -
            centralRoleBonus,
        };
      })
      .sort((a, b) => a.score - b.score)[0]?.player ?? null;
  }

  function applyDefensivePrioritySpaceProtectionTargets(
    teamId,
    targets,
    groups,
    presser,
    ballPoint,
    profile,
    protectedIds = new Set()
  ) {
    const response = profile.threatResponse;
    if (!response || response.protectCenter < 0.34) {
      return [];
    }
    const labels = [];
    const excludedIds = new Set([
      ...protectedIds,
      presser?.id,
    ].filter(Boolean));
    const screenPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "screen");
    const screen = pickDefensiveProtectionPlayer(
      teamId,
      groups,
      targets,
      excludedIds,
      ["midfield", "back"],
      screenPoint
    );
    if (screen) {
      targets.set(screen.id, screenPoint);
      excludedIds.add(screen.id);
      labels.push(`Protect ${response.threat.primaryLabel}`);
    }
    if (response.protectCenter >= 0.56 || response.isBoxThreat) {
      const coverPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "cover");
      const cover = pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, ["back"], coverPoint);
      if (cover) {
        targets.set(cover.id, coverPoint);
        excludedIds.add(cover.id);
        labels.push("Goal-side cover");
      }
    }
    if (response.isWideAssistThreat || response.isBoxThreat) {
      const farPostPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "farPost");
      const farPostDefender = pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, ["back", "midfield"], farPostPoint);
      if (farPostDefender) {
        targets.set(farPostDefender.id, farPostPoint);
        excludedIds.add(farPostDefender.id);
        labels.push("Far-post cover");
      }
      const cutbackPoint = getDefensivePrioritySpacePoint(teamId, ballPoint, profile, "cutback");
      const cutbackScreen = pickDefensiveProtectionPlayer(teamId, groups, targets, excludedIds, ["midfield"], cutbackPoint);
      if (cutbackScreen) {
        targets.set(cutbackScreen.id, cutbackPoint);
        labels.push("Cutback screen");
      }
    }
    return labels;
  }

  return {
    getDefensiveThreatResponse,
    getDefensivePrioritySpacePoint,
    pickDefensiveProtectionPlayer,
    applyDefensivePrioritySpaceProtectionTargets,
  };
}
