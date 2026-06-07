import { createSessionPlannerPlayerBoardFormationLayoutHelpers } from "./session-planner-player-board-formation-layout-helpers.mjs";

function defaultClamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function defaultGetPlayerInitials(player = {}) {
  const words = String(player?.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "P";
  }
  return `${words[0][0] ?? ""}${words.length > 1 ? words[words.length - 1][0] ?? "" : ""}`.toUpperCase();
}

function defaultGetNumericPriorityValue(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function defaultGetPlayerRoleProfile() {
  return { roleKey: "midfielder", roleOrder: 2, side: "center" };
}

export function createSessionPlannerPlayerBoardFormationHelpers(options = {}) {
  const autoModeOptions = Array.isArray(options.autoModeOptions) ? options.autoModeOptions : [{ key: "balanced" }];
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const getCareerScore = typeof options.getCareerScore === "function" ? options.getCareerScore : () => 60;
  const getDirectRoleFitScore =
    typeof options.getDirectRoleFitScore === "function" ? options.getDirectRoleFitScore : () => 0;
  const getImportanceScore = typeof options.getImportanceScore === "function" ? options.getImportanceScore : () => 0;
  const getItemPriorityScore = typeof options.getItemPriorityScore === "function" ? options.getItemPriorityScore : () => 0;
  const getMinutesScore = typeof options.getMinutesScore === "function" ? options.getMinutesScore : () => 0;
  const getNumericPriorityValue =
    typeof options.getNumericPriorityValue === "function" ? options.getNumericPriorityValue : defaultGetNumericPriorityValue;
  const getPlayerInitials =
    typeof options.getPlayerInitials === "function" ? options.getPlayerInitials : defaultGetPlayerInitials;
  const getPlayerRoleProfile =
    typeof options.getPlayerRoleProfile === "function" ? options.getPlayerRoleProfile : defaultGetPlayerRoleProfile;
  const getPlayerBoardPositionById =
    typeof options.getPlayerBoardPositionById === "function"
      ? options.getPlayerBoardPositionById
      : () => ({ x: 50, y: 50 });
  const getPriorityScore = typeof options.getPriorityScore === "function" ? options.getPriorityScore : () => 0;
  const getRoleOrder = typeof options.getRoleOrder === "function" ? options.getRoleOrder : (roleKey) => {
    const orderByRole = { goalkeeper: 0, defender: 1, midfielder: 2, forward: 3 };
    return orderByRole[roleKey] ?? 2;
  };
  const getRolePriorityValue =
    typeof options.getRolePriorityValue === "function" ? options.getRolePriorityValue : () => null;
  const layoutHelpers = createSessionPlannerPlayerBoardFormationLayoutHelpers({
    clamp,
    getPlayerRoleProfile,
    getPositionGroup: options.getPositionGroup,
    getRoleOrder,
    maxTeamCount: options.maxTeamCount,
  });
  const {
    cleanFormationInput,
    createAutoTeamFormationSlots,
    createExtraTeamSlots,
    createFormationSlots,
    getAutoTeamCell,
    getAutoTeamGrid,
    getDefaultGridPosition,
    getDefaultPosition,
    getFormationLineRole,
    getFormationLineY,
    getFormationSide,
    getFormationSideOrder,
    getFormationSlotX,
    mapSlotToAutoTeamCell,
    normalizeFormationValue,
    normalizeTeamCount,
    parseFormation,
  } = layoutHelpers;







  function normalizeAutoMode(value) {
    const mode = String(value ?? "").trim();
    return autoModeOptions.some((option) => option.key === mode) ? mode : "balanced";
  }







  function getRelationLookupValue(source, otherPlayer = {}) {
    if (!source) {
      return null;
    }
    const playerKeys = [
      otherPlayer.id,
      otherPlayer.playerId,
      otherPlayer.profileId,
      otherPlayer.slug,
      otherPlayer.name,
      getPlayerInitials(otherPlayer),
    ]
      .map((key) => String(key ?? "").trim())
      .filter(Boolean);
    if (typeof source === "object" && !Array.isArray(source)) {
      for (const key of playerKeys) {
        const directValue = getNumericPriorityValue(source[key]);
        if (directValue !== null) {
          return directValue;
        }
      }
    }
    if (Array.isArray(source)) {
      for (const item of source) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const relationKeys = [item.playerId, item.id, item.profileId, item.name]
          .map((key) => String(key ?? "").trim())
          .filter(Boolean);
        if (!relationKeys.some((key) => playerKeys.includes(key))) {
          continue;
        }
        const value =
          getNumericPriorityValue(item.score) ??
          getNumericPriorityValue(item.minutes) ??
          getNumericPriorityValue(item.sharedMinutes) ??
          getNumericPriorityValue(item.count) ??
          getNumericPriorityValue(item.value);
        if (value !== null) {
          return value;
        }
      }
    }
    return null;
  }

  function getStoredRelationScore(firstPlayer = {}, secondPlayer = {}) {
    const sources = [
      firstPlayer.relationships,
      firstPlayer.relations,
      firstPlayer.partnerships,
      firstPlayer.chemistry,
      firstPlayer.sharedMinutes,
      firstPlayer.minutesWith,
      firstPlayer.playingTimeWith,
      firstPlayer.lineupMinutesWith,
      firstPlayer.nwslMinutesWith,
    ];
    for (const source of sources) {
      const value = getRelationLookupValue(source, secondPlayer);
      if (value !== null) {
        return value;
      }
    }
    return null;
  }

  function getRelationScore(firstItem, secondItem, block) {
    const firstPlayer = firstItem?.player ?? {};
    const secondPlayer = secondItem?.player ?? {};
    const storedScore = getStoredRelationScore(firstPlayer, secondPlayer) ?? getStoredRelationScore(secondPlayer, firstPlayer);
    if (storedScore !== null) {
      return storedScore;
    }
    const firstProfile = getPlayerRoleProfile(firstPlayer);
    const secondProfile = getPlayerRoleProfile(secondPlayer);
    const firstPosition = getPlayerBoardPositionById(block, firstPlayer.id);
    const secondPosition = getPlayerBoardPositionById(block, secondPlayer.id);
    const distance = Math.hypot(firstPosition.x - secondPosition.x, firstPosition.y - secondPosition.y);
    const roleGap = Math.abs(firstProfile.roleOrder - secondProfile.roleOrder);
    let score = Math.max(0, 28 - distance * 0.55);
    if (firstProfile.side === secondProfile.side) {
      score += 7;
    }
    if (roleGap === 1) {
      score += 8;
    } else if (roleGap === 0) {
      score += 4;
    }
    return score;
  }

  function createAutoTeams(teamCount) {
    return Array.from({ length: normalizeTeamCount(teamCount) }, () => ({
      items: [],
      priorityTotal: 0,
      roleCounts: {},
    }));
  }

  function addItemToAutoTeam(team, item) {
    const profile = getPlayerRoleProfile(item?.player);
    const priorityScore = getItemPriorityScore(item);
    team.items.push(item);
    team.priorityTotal += priorityScore;
    team.roleCounts[profile.roleKey] = (team.roleCounts[profile.roleKey] ?? 0) + 1;
  }

  function pickBalancedTeamIndex(teams, item, allowedTeamIndexes = null) {
    const profile = getPlayerRoleProfile(item?.player);
    const indexes = allowedTeamIndexes?.length ? allowedTeamIndexes : teams.map((team, index) => index);
    let bestIndex = indexes[0] ?? 0;
    let bestScore = Number.POSITIVE_INFINITY;
    indexes.forEach((teamIndex) => {
      const team = teams[teamIndex];
      const score = team.items.length * 100 + (team.roleCounts[profile.roleKey] ?? 0) * 18 + team.priorityTotal * 0.002 + teamIndex * 0.01;
      if (score < bestScore) {
        bestIndex = teamIndex;
        bestScore = score;
      }
    });
    return bestIndex;
  }

  function createAutoAssignmentsFromTeams(teams) {
    return teams.flatMap((team, teamIndex) => team.items.map((item) => ({ playerId: item.player.id, teamIndex })));
  }

  function getRelationPairs(items, block) {
    const remainingItems = [...items].sort((first, second) => getItemPriorityScore(second) - getItemPriorityScore(first));
    const pairs = [];
    while (remainingItems.length) {
      const firstItem = remainingItems.shift();
      if (!remainingItems.length) {
        pairs.push([firstItem]);
        break;
      }
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      remainingItems.forEach((candidate, index) => {
        const score = getRelationScore(firstItem, candidate, block);
        if (score > bestScore) {
          bestIndex = index;
          bestScore = score;
        }
      });
      const [secondItem] = remainingItems.splice(bestIndex, 1);
      pairs.push([firstItem, secondItem].filter(Boolean));
    }
    return pairs;
  }

  function assignAutoTeams(items, teamCount, mode, block) {
    const teams = createAutoTeams(teamCount);
    const normalizedMode = normalizeAutoMode(mode);
    const sortedItems = [...items].sort((first, second) => {
      const firstPriority = getItemPriorityScore(first);
      const secondPriority = getItemPriorityScore(second);
      return normalizedMode === "rotation" ? firstPriority - secondPriority : secondPriority - firstPriority;
    });
    if (normalizedMode === "relations") {
      getRelationPairs(sortedItems, block).forEach((pair) => {
        const teamIndex = pickBalancedTeamIndex(teams, pair[0]);
        pair.forEach((item) => addItemToAutoTeam(teams[teamIndex], item));
      });
      return createAutoAssignmentsFromTeams(teams);
    }
    if (normalizedMode === "best-xi") {
      const topTeamCount = Math.min(sortedItems.length, 11);
      sortedItems.slice(0, topTeamCount).forEach((item) => addItemToAutoTeam(teams[0], item));
      const remainingTeamIndexes = teams.length > 1 ? teams.slice(1).map((team, index) => index + 1) : [];
      sortedItems.slice(topTeamCount).forEach((item) => {
        if (!remainingTeamIndexes.length) {
          return;
        }
        const teamIndex = pickBalancedTeamIndex(teams, item, remainingTeamIndexes);
        addItemToAutoTeam(teams[teamIndex], item);
      });
      return createAutoAssignmentsFromTeams(teams);
    }
    sortedItems.forEach((item) => {
      const teamIndex = pickBalancedTeamIndex(teams, item);
      addItemToAutoTeam(teams[teamIndex], item);
    });
    return createAutoAssignmentsFromTeams(teams);
  }






  function shouldAutoUseGoalkeeperSlots(items, formation, teamCount) {
    const normalizedTeamCount = normalizeTeamCount(teamCount);
    const outfieldSlotCount = formation.reduce((total, count) => total + count, 0);
    if (!outfieldSlotCount) {
      return false;
    }
    const goalkeeperCount = items.filter((item) => getPlayerRoleProfile(item.player).roleKey === "goalkeeper").length;
    return goalkeeperCount >= normalizedTeamCount && items.length >= normalizedTeamCount * (outfieldSlotCount + 1);
  }

  function scoreFormationFit(item, slot, fitOptions = {}) {
    const profile = getPlayerRoleProfile(item?.player);
    const roleDistance = Math.abs(profile.roleOrder - slot.roleOrder);
    const sideDistance = Math.abs(getFormationSideOrder(profile.side) - getFormationSideOrder(slot.side));
    const rosterOrder = Number(item?.player?.rosterOrder) || 999;
    const rolePriority = getRolePriorityValue(item?.player, slot) ?? 0;
    const directRoleFit = getDirectRoleFitScore(item?.player, slot);
    const importanceScore = getImportanceScore(item?.player) ?? 0;
    const careerScore = getCareerScore(item?.player);
    const minutesScore = getMinutesScore(item?.player);
    const priorityScore = fitOptions.prioritize ? getPriorityScore(item, slot) : 0;
    const priorityAdjustment = priorityScore * 0.003;
    const rotationAdjustment = fitOptions.rotation ? priorityAdjustment : -priorityAdjustment;
    const roleMismatchPenalty = profile.roleKey === slot.roleKey ? 0 : 280;
    const sideMismatchPenalty =
      profile.roleKey === slot.roleKey && profile.side !== "center" && slot.side !== "center" && profile.side !== slot.side
        ? 36
        : 0;
    return (
      roleDistance * 220 +
      roleMismatchPenalty +
      sideDistance * 28 -
      sideMismatchPenalty -
      Math.max(rolePriority, directRoleFit) * 0.42 -
      importanceScore * 0.18 -
      careerScore * 0.06 -
      minutesScore * 0.01 +
      rosterOrder * 0.01 +
      rotationAdjustment
    );
  }

  function scoreAutoTeamSlotCandidate(item, slot, teamItems, mode, block) {
    const normalizedMode = normalizeAutoMode(mode);
    let score = scoreFormationFit(item, slot, { prioritize: true, rotation: normalizedMode === "rotation" });
    if (normalizedMode === "relations" && teamItems.length) {
      const relationAverage =
        teamItems.reduce((total, teamItem) => total + getRelationScore(item, teamItem, block), 0) / teamItems.length;
      score -= relationAverage * 0.1;
    }
    return score;
  }

  function pickAutoTeamSlotItem(remainingItems, slot, teamItems, mode, block) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    remainingItems.forEach((item, index) => {
      const score = scoreAutoTeamSlotCandidate(item, slot, teamItems, mode, block);
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    return bestIndex;
  }

  function createAutoTeamSlotPlan(formation, teamIndex, teamCount, includeGoalkeeperSlot) {
    const cell = getAutoTeamCell(teamIndex, teamCount);
    return createFormationSlots(formation, includeGoalkeeperSlot).map((slot) => mapSlotToAutoTeamCell(slot, cell));
  }

  function assignAutoFormationTeams(items, teamCount, mode, block, formation) {
    const normalizedTeamCount = normalizeTeamCount(teamCount);
    const normalizedMode = normalizeAutoMode(mode);
    const includeGoalkeeperSlot = shouldAutoUseGoalkeeperSlots(items, formation, normalizedTeamCount);
    const teams = Array.from({ length: normalizedTeamCount }, () => []);
    const assignments = [];
    const remainingItems = [...items];
    for (let teamIndex = 0; teamIndex < normalizedTeamCount; teamIndex += 1) {
      const slots = createAutoTeamSlotPlan(formation, teamIndex, normalizedTeamCount, includeGoalkeeperSlot);
      for (const slot of slots) {
        if (!remainingItems.length) {
          break;
        }
        const bestIndex = pickAutoTeamSlotItem(remainingItems, slot, teams[teamIndex], normalizedMode, block);
        const [item] = remainingItems.splice(bestIndex, 1);
        if (!item?.player?.id) {
          continue;
        }
        teams[teamIndex].push(item);
        assignments.push({ playerId: item.player.id, teamIndex, position: { x: slot.x, y: slot.y } });
      }
    }
    if (remainingItems.length) {
      const sortedRemainingItems = remainingItems.sort((first, second) => {
        const firstPriority = getItemPriorityScore(first);
        const secondPriority = getItemPriorityScore(second);
        return normalizedMode === "rotation" ? firstPriority - secondPriority : secondPriority - firstPriority;
      });
      sortedRemainingItems.forEach((item, index) => {
        const teamIndex = index % normalizedTeamCount;
        const cell = getAutoTeamCell(teamIndex, normalizedTeamCount);
        const slot = createExtraTeamSlots(1, cell)[0];
        if (!slot || !item?.player?.id) {
          return;
        }
        assignments.push({
          playerId: item.player.id,
          teamIndex,
          position: {
            x: clamp(slot.x + (Math.floor(index / normalizedTeamCount) % 4) * 4, cell.left + 4, cell.left + cell.width - 4),
            y: clamp(slot.y, cell.top + 8, cell.top + cell.height - 6),
          },
        });
      });
    }
    return assignments;
  }

  function assignFormationSlots(selectedItems, slots, fitOptions = {}) {
    const remainingItems = [...selectedItems];
    const assignments = [];
    slots.forEach((slot) => {
      if (!remainingItems.length) {
        return;
      }
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      remainingItems.forEach((item, index) => {
        const score = scoreFormationFit(item, slot, fitOptions);
        if (score < bestScore) {
          bestIndex = index;
          bestScore = score;
        }
      });
      const [item] = remainingItems.splice(bestIndex, 1);
      if (item?.player?.id) {
        assignments.push({ playerId: item.player.id, position: { x: slot.x, y: slot.y } });
      }
    });
    return assignments;
  }

  return {
    addItemToAutoTeam,
    assignAutoFormationTeams,
    assignAutoTeams,
    assignFormationSlots,
    cleanFormationInput,
    createAutoAssignmentsFromTeams,
    createAutoTeamFormationSlots,
    createAutoTeamSlotPlan,
    createAutoTeams,
    createExtraTeamSlots,
    createFormationSlots,
    getAutoTeamCell,
    getAutoTeamGrid,
    getDefaultGridPosition,
    getDefaultPosition,
    getFormationLineRole,
    getFormationLineY,
    getFormationSide,
    getFormationSideOrder,
    getFormationSlotX,
    getRelationLookupValue,
    getRelationPairs,
    getRelationScore,
    getStoredRelationScore,
    mapSlotToAutoTeamCell,
    normalizeAutoMode,
    normalizeFormationValue,
    normalizeTeamCount,
    parseFormation,
    pickAutoTeamSlotItem,
    pickBalancedTeamIndex,
    scoreAutoTeamSlotCandidate,
    scoreFormationFit,
    shouldAutoUseGoalkeeperSlots,
  };
}
