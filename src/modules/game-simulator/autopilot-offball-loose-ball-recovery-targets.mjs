export function createGameSimulatorAutopilotOffballLooseBallRecoveryTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getWideSideSign,
    isTransitionAttackStyle,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getLooseBallRecoverySupportTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const depth = getAttackingDepth(ballPoint, teamId);
    const width = profile.widthDiscipline ?? 0.62;
    const directness = profile.directness ?? 0.52;
    const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11);
    const halfSpaceY = pitch.width / 2 + sideSign * 11.5;
    const oppositeHalfSpaceY = pitch.width / 2 - sideSign * 10.5;
    const wideY = clamp(pitch.width / 2 + sideSign * lerp(22, 30, width), 4.5, pitch.width - 4.5);
    const points = {
      secureUnder: getDepthPoint(teamId, clamp(depth - lerp(7.5, 13, pressure), 16, 76), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4, 0.54), 8, pitch.width - 8),
      }),
      insideBounce: getDepthPoint(teamId, clamp(depth + lerp(-1.5, 3.5, directness), 28, 84), {
        y: clamp(lerp(ballPoint.y, halfSpaceY, isWidePrincipleZone(ballPoint) ? 0.62 : 0.42), 8, pitch.width - 8),
      }),
      forwardOutlet: getDepthPoint(teamId, clamp(depth + lerp(8, 18, directness), 42, 94), {
        y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.32), 9, pitch.width - 9),
      }),
      widthRelease: getDepthPoint(teamId, clamp(depth + lerp(1, 7, width), 32, 90), {
        y: wideY,
      }),
      restLock: clampToPitch({
        x: ballPoint.x - sign * lerp(17, 25, profile.restDefence ?? 0.62),
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 12, pitch.width - 12),
      }, 3),
    };
    return points[slot] ?? points.secureUnder;
  }

  function applyLooseBallRecoverySupportTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
    const isRecoveryAction =
      actionMeta?.actionType === "recovery" ||
      actionMeta?.profileKey === "loose-ball-recovery" ||
      state.ball.actionType === "recovery" ||
      state.ball.profileKey === "loose-ball-recovery";
    if (!isRecoveryAction || !ballPoint || profile?.phaseKey === "setPiece") {
      return {
        labels: [],
        protectedIds: new Set(),
      };
    }
    const labels = [];
    const assignedIds = new Set([
      ...protectedIds,
      actionMeta?.carrierPlayerId,
      actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
      state.ball.carrierPlayerId,
      state.ball.initiatorPlayerId,
    ].filter(Boolean));
    const protectedRecoveryIds = new Set();
    const sideSign = getWideSideSign(ballPoint) || 1;
    const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11);
    const threat = getPitchThreatProfile(ballPoint, teamId);
    const directTransition = isTransitionAttackStyle(profile.styleKey) || profile.directness >= 0.62;
    const assign = (slot, roleKeys, label, preferredSide = 0) => {
      const player = preferredSide
        ? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
        : getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
      const target = getLooseBallRecoverySupportTarget(teamId, ballPoint, slot, sideSign, profile);
      if (!setAutopilotPrincipleTarget(targets, player, target)) {
        return null;
      }
      assignedIds.add(player.id);
      protectedRecoveryIds.add(player.id);
      labels.push(label);
      return player;
    };
    assign("secureUnder", ["pivot", "connector", "wideBack", "rest"], "Recovery: secure first pass");
    assign("insideBounce", ["connector", "pivot", "wideForward", "secondStriker"], "Recovery: inside bounce angle");
    if (directTransition || pressure <= 0.5 || threat.depth >= 48) {
      assign("forwardOutlet", ["striker", "wideForward", "secondStriker"], "Recovery: forward outlet");
    }
    if (isWidePrincipleZone(ballPoint) || profile.widthDiscipline >= 0.6 || pressure >= 0.48) {
      assign("widthRelease", ["wideBack", "wideForward"], "Recovery: width release", sideSign);
    }
    assign("restLock", ["pivot", "rest", "wideBack"], "Recovery: rest-defence lock");
    if (labels.length) {
      labels.unshift("Loose-ball recovery support");
    }
    return {
      labels: uniquePrincipleLabels(labels),
      protectedIds: protectedRecoveryIds,
    };
  }

  return {
    getLooseBallRecoverySupportTarget,
    applyLooseBallRecoverySupportTargets,
  };
}
