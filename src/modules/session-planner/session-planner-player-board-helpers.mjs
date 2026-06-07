import { createSessionPlannerPlayerBoardDisplayHelpers } from "./session-planner-player-board-display-helpers.mjs";
import {
  createSessionPlannerPlayerBoardProfileHelpers,
  normalizeSessionPlannerPlayerBoardProfileKey,
  sessionPlannerPlayerBoardPositionGroups,
} from "./session-planner-player-board-profile-helpers.mjs";

export {
  normalizeSessionPlannerPlayerBoardProfileKey,
  sessionPlannerPlayerBoardPositionGroups,
} from "./session-planner-player-board-profile-helpers.mjs";

function defaultClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultGetPlayerInitials(player = {}) {
  const words = String(player?.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "P";
  }
  return `${words[0][0] ?? ""}${words.length > 1 ? words[words.length - 1][0] ?? "" : ""}`.toUpperCase();
}

export function createSessionPlannerPlayerBoardHelpers(options = {}) {
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const getPlayerInitials =
    typeof options.getPlayerInitials === "function" ? options.getPlayerInitials : defaultGetPlayerInitials;
  const profileHelpers = createSessionPlannerPlayerBoardProfileHelpers({
    normalizePlayerProfileRole: options.normalizePlayerProfileRole,
  });
  const {
    getExplicitRoles,
    getPlayerRoleProfile,
    getPositionGroup,
    getRoleGroupForRole,
    getRoleOrder,
    getSideForRole,
    normalizePlayerProfileRole,
    normalizeRoleGroupKey,
  } = profileHelpers;
  const displayHelpers = createSessionPlannerPlayerBoardDisplayHelpers({
    getSelectedSession: options.getSelectedSession,
    normalizeColor: options.normalizeColor,
  });
  function normalizeSquadStatusKey(value) {
    const key = normalizeSessionPlannerPlayerBoardProfileKey(value);
    if (key === "squaddepth") return "depth";
    if (key === "loanwatch") return "loan";
    return key;
  }

  function getSquadStatusPriority(statusKey) {
    const priorityByStatus = {
      important: 100,
      rotation: 74,
      depth: 48,
      development: 32,
      loan: 12,
    };
    return priorityByStatus[normalizeSquadStatusKey(statusKey)] ?? null;
  }

  function getCareerPhasePriority(phaseKey) {
    const priorityByPhase = {
      peak: 100,
      experienced: 86,
      emerging: 70,
      developing: 54,
    };
    return priorityByPhase[normalizeSessionPlannerPlayerBoardProfileKey(phaseKey)] ?? null;
  }

  function getNumericPriorityValue(value) {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function getRolePriorityKeys(slot = {}) {
    const roleKey = String(slot.roleKey ?? "").trim().toLowerCase();
    const side = String(slot.side ?? "center").trim().toLowerCase();
    const keys = [roleKey, side && side !== "center" ? `${side}-${roleKey}` : "", side && side !== "center" ? `${roleKey}-${side}` : ""];
    if (roleKey === "goalkeeper") {
      keys.push("GK", "gk", "keeper", "goalkeeper");
    } else if (roleKey === "defender") {
      if (side === "left") {
        keys.push("LB", "LWB", "leftBack", "leftWingBack", "left-defender");
      } else if (side === "right") {
        keys.push("RB", "RWB", "rightBack", "rightWingBack", "right-defender");
      } else {
        keys.push("CB", "LCB", "RCB", "centerBack", "centreBack", "central-defender");
      }
      keys.push("DEF", "defender", "back");
    } else if (roleKey === "midfielder") {
      keys.push("6", "8", "10", "CM", "DM", "AM", "MID", "midfielder");
      if (side === "left") {
        keys.push("LM", "leftMidfielder");
      } else if (side === "right") {
        keys.push("RM", "rightMidfielder");
      }
    } else if (roleKey === "forward") {
      if (side === "left") {
        keys.push("LW", "leftWing", "leftForward");
      } else if (side === "right") {
        keys.push("RW", "rightWing", "rightForward");
      } else {
        keys.push("ST", "CF", "9", "striker", "centerForward", "centreForward");
      }
      keys.push("FWD", "forward", "attacker");
    }
    return Array.from(new Set(keys.filter(Boolean)));
  }

  function getRolePriorityValue(player = {}, slot = {}) {
    const roleKeys = getRolePriorityKeys(slot);
    const profileSources = [
      player.roleFit,
      player.positionPriority,
      player.rolePriority,
      player.roleRatings,
      player.positionRatings,
      player.positionMinutes,
      player.minutesByPosition,
      player.nwslMinutesByPosition,
      player.nwslMinutes,
    ].filter((source) => source && typeof source === "object" && !Array.isArray(source));
    for (const source of profileSources) {
      for (const key of roleKeys) {
        const keyVariants = [
          key,
          String(key).toUpperCase(),
          String(key).toLowerCase(),
          String(key).replace(/(^|-)([a-z])/g, (match) => match.toUpperCase()).replace(/-/g, ""),
          String(key).replace(/[^a-z0-9]/gi, "").toLowerCase(),
        ];
        const directValue = keyVariants.reduce((value, variant) => {
          if (value !== null) {
            return value;
          }
          return getNumericPriorityValue(source[variant]);
        }, null);
        if (directValue !== null) {
          return directValue;
        }
      }
    }
    return null;
  }

  function getDirectRoleFitScore(player = {}, slot = {}) {
    const profile = getPlayerRoleProfile(player);
    const slotRole = String(slot.roleKey ?? "").trim().toLowerCase();
    const slotSide = String(slot.side ?? "center").trim().toLowerCase();
    let score = profile.roleKey === slotRole ? 74 : 38;
    if (profile.roleKey === slotRole) {
      if (profile.side === slotSide) {
        score += 14;
      } else if (slotSide === "center" || profile.side === "center") {
        score += 6;
      } else {
        score -= 10;
      }
    }
    const primaryRole = normalizePlayerProfileRole(player.primaryRole, "");
    const secondaryRoles = Array.isArray(player.secondaryRoles)
      ? player.secondaryRoles.map((role) => normalizePlayerProfileRole(role, "")).filter(Boolean)
      : [];
    const slotKeys = getRolePriorityKeys(slot).map((key) => normalizeSessionPlannerPlayerBoardProfileKey(key));
    if (slotKeys.includes(normalizeSessionPlannerPlayerBoardProfileKey(primaryRole))) {
      score += 20;
    } else if (secondaryRoles.some((role) => slotKeys.includes(normalizeSessionPlannerPlayerBoardProfileKey(role)))) {
      score += 10;
    }
    return clamp(score, 0, 100);
  }

  function getImportanceScore(player = {}) {
    const statusPriority = getNumericPriorityValue(player.squadImportance) ?? getSquadStatusPriority(player.squadStatus);
    if (statusPriority !== null) {
      return statusPriority;
    }
    const rawImportance =
      getNumericPriorityValue(player.importance) ??
      getNumericPriorityValue(player.teamImportance) ??
      getNumericPriorityValue(player.roleImportance) ??
      getNumericPriorityValue(player.priority) ??
      getNumericPriorityValue(player.priorityScore);
    if (rawImportance === null) {
      return null;
    }
    if (rawImportance <= 1) {
      return rawImportance * 100;
    }
    if (rawImportance <= 5) {
      return rawImportance * 20;
    }
    if (rawImportance <= 10) {
      return rawImportance * 10;
    }
    return clamp(rawImportance, 0, 100);
  }

  function getCareerScore(player = {}) {
    const rawCareer = getNumericPriorityValue(player.careerPhasePriority) ?? getCareerPhasePriority(player.careerPhase);
    return rawCareer !== null ? clamp(rawCareer, 0, 100) : 60;
  }

  function getMinutesScore(player = {}) {
    return (
      getNumericPriorityValue(player.nwslMinutes) ??
      getNumericPriorityValue(player.seasonMinutes) ??
      getNumericPriorityValue(player.minutesPlayed) ??
      getNumericPriorityValue(player.minutes) ??
      0
    );
  }

  function getPriorityScore(item, slot) {
    const player = item?.player ?? {};
    const rolePriority = getRolePriorityValue(player, slot);
    const directRoleFit = getDirectRoleFitScore(player, slot);
    const rolePriorityScore = rolePriority !== null && rolePriority > 0 ? rolePriority : directRoleFit;
    const importanceScore = getImportanceScore(player) ?? 0;
    const careerScore = getCareerScore(player);
    const minutesScore = getMinutesScore(player);
    const rosterOrder = Number(player.rosterOrder);
    const rosterScore = Number.isFinite(rosterOrder) ? Math.max(0, 1000 - rosterOrder) / 10 : 0;
    return rolePriorityScore * 95 + directRoleFit * 24 + importanceScore * 12 + careerScore * 4 + minutesScore * 0.04 + rosterScore;
  }

  function getItemPriorityScore(item) {
    return getPriorityScore(item, getPlayerRoleProfile(item?.player));
  }

  function formatWarningNames(items = [], limit = 3) {
    const names = items.slice(0, limit).map((item) => item.player?.name).filter(Boolean);
    const extraCount = Math.max(0, items.length - names.length);
    if (!names.length) {
      return "No players";
    }
    return `${names.join(", ")}${extraCount ? ` +${extraCount}` : ""}`;
  }

  function getLabelCandidates(player) {
    const words = String(player?.name ?? "").trim().split(/\s+/).filter(Boolean);
    const first = words[0] ?? "Player";
    const last = words.length > 1 ? words[words.length - 1] : "";
    const base = getPlayerInitials(player);
    const candidates = [
      base,
      `${first.slice(0, 1)}${last.slice(0, 2)}`,
      `${first.slice(0, 2)}${last.slice(0, 1)}`,
      `${first.slice(0, 1)}${last.slice(0, 3)}`,
      `${first.slice(0, 3)}${last.slice(0, 1)}`,
      first.slice(0, 3),
      String(player?.number ?? "").trim() ? `${base}${String(player.number).trim().slice(0, 1)}` : "",
    ];
    return [...new Set(candidates.map((candidate) => candidate.replace(/[^a-z0-9]/gi, "").toUpperCase()).filter(Boolean))];
  }

  function getInitialLabelMap(boardPlayers = []) {
    const baseCounts = boardPlayers.reduce((counts, item) => {
      const base = getPlayerInitials(item.player);
      counts.set(base, (counts.get(base) ?? 0) + 1);
      return counts;
    }, new Map());
    const usedLabels = new Set();
    return boardPlayers.reduce((labels, item, index) => {
      const base = getPlayerInitials(item.player);
      const candidates = getLabelCandidates(item.player);
      const label =
        candidates.find((candidate) => {
          if (candidate === base && (baseCounts.get(base) ?? 0) > 1) {
            return false;
          }
          return !usedLabels.has(candidate);
        }) ?? `${base}${index + 1}`;
      usedLabels.add(label);
      labels.set(item.player.id, label);
      return labels;
    }, new Map());
  }

  return {
    formatWarningNames,
    getCareerPhasePriority,
    getCareerScore,
    getColorStyle: displayHelpers.getColorStyle,
    getCustomColor: displayHelpers.getCustomColor,
    getDataObject: displayHelpers.getDataObject,
    getDirectRoleFitScore,
    getExplicitRoles,
    getImportanceScore,
    getInitialLabelMap,
    getItemPriorityScore,
    getLabelCandidates,
    getMinutesScore,
    getNumericPriorityValue,
    getPlayerRoleProfile,
    getPositionGroup,
    getPriorityScore,
    getRoleGroupForRole,
    getRoleOrder,
    getRolePriorityKeys,
    getRolePriorityValue,
    getSideForRole,
    getSourceBlocks: displayHelpers.getSourceBlocks,
    getSourceLabel: displayHelpers.getSourceLabel,
    getSquadStatusPriority,
    getTextColor: displayHelpers.getTextColor,
    getTone: displayHelpers.getTone,
    hasTeamData: displayHelpers.hasTeamData,
    normalizeProfileKey: normalizeSessionPlannerPlayerBoardProfileKey,
    normalizeRoleGroupKey,
    normalizeSquadStatusKey,
    positionGroups: sessionPlannerPlayerBoardPositionGroups,
  };
}
