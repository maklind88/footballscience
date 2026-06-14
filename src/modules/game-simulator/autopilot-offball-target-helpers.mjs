export function createGameSimulatorAutopilotOffballTargetHelpers(deps = {}) {
  const {
    clampToPitch,
    distance,
    getAutoPilotRoleStrength,
    getDepthX,
    getOffensiveRoleKey,
    getWideSideSign,
    pitch,
    state,
    teams,
  } = deps;

  function getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, excludedIds = new Set(), referencePoint = null) {
    const roleSet = new Set(roleKeys);
    return state.players
      .filter((player) => {
        if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
          return false;
        }
        return roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation));
      })
      .sort((a, b) => {
        const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
        const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
        const aRoleFit = roleKeys.indexOf(aRole);
        const bRoleFit = roleKeys.indexOf(bRole);
        if (aRoleFit !== bRoleFit) {
          return aRoleFit - bRoleFit;
        }
        if (!referencePoint) {
          return getAutoPilotRoleStrength(b, "runner") - getAutoPilotRoleStrength(a, "runner");
        }
        return distance(a.position, referencePoint) - distance(b.position, referencePoint);
      })[0] ?? null;
  }

  function getMovableAutopilotPlayerByRolesOnSide(
    teamId,
    roleKeys,
    targets,
    excludedIds = new Set(),
    sideSign = 0,
    referencePoint = null
  ) {
    const roleSet = new Set(roleKeys);
    const desiredSide = sideSign === 0 ? 0 : Math.sign(sideSign);
    const candidates = state.players.filter((player) => {
      if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
        return false;
      }
      if (!roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation))) {
        return false;
      }
      if (!desiredSide) {
        return true;
      }
      const playerSide = getWideSideSign(player);
      return playerSide === 0 || playerSide === desiredSide;
    });
    if (!candidates.length) {
      return getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, excludedIds, referencePoint);
    }
    return candidates
      .sort((a, b) => {
        const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
        const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
        const aRoleFit = roleKeys.indexOf(aRole);
        const bRoleFit = roleKeys.indexOf(bRole);
        if (aRoleFit !== bRoleFit) {
          return aRoleFit - bRoleFit;
        }
        const aSideFit = getWideSideSign(a) === desiredSide ? 0 : 1;
        const bSideFit = getWideSideSign(b) === desiredSide ? 0 : 1;
        if (aSideFit !== bSideFit) {
          return aSideFit - bSideFit;
        }
        if (!referencePoint) {
          return getAutoPilotRoleStrength(b, "runner") - getAutoPilotRoleStrength(a, "runner");
        }
        return distance(a.position, referencePoint) - distance(b.position, referencePoint);
      })[0] ?? null;
  }

  function setAutopilotPrincipleTarget(targets, player, target) {
    if (!player || !targets.has(player.id)) {
      return false;
    }
    targets.set(player.id, clampToPitch(target, 3));
    return true;
  }

  function getDepthPoint(teamId, attackingDepth, overrides = {}) {
    return clampToPitch({
      x: getDepthX(teamId, attackingDepth),
      y: pitch.width / 2,
      ...overrides,
    }, 2);
  }

  return {
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    setAutopilotPrincipleTarget,
    getDepthPoint,
  };
}
