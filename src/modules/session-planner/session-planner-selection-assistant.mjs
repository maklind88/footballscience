function defaultClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultComparePlayers(first = {}, second = {}) {
  return String(first?.name || "").localeCompare(String(second?.name || ""));
}

function normalizeRoleFitMap(player = {}) {
  return player.roleFit && typeof player.roleFit === "object" && !Array.isArray(player.roleFit)
    ? player.roleFit
    : {};
}

export function createSessionPlannerSelectionAssistant(options = {}) {
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const comparePlayers = typeof options.comparePlayers === "function" ? options.comparePlayers : defaultComparePlayers;
  const getBridgeBestMatches =
    typeof options.getBridgeBestMatches === "function" ? options.getBridgeBestMatches : () => [];
  const getCareerScore = typeof options.getCareerScore === "function" ? options.getCareerScore : () => 0;
  const getFormationInput = typeof options.getFormationInput === "function" ? options.getFormationInput : () => "";
  const getImportanceScore = typeof options.getImportanceScore === "function" ? options.getImportanceScore : () => null;
  const getMinutesScore = typeof options.getMinutesScore === "function" ? options.getMinutesScore : () => 0;
  const getPlayerBoardPlayers =
    typeof options.getPlayerBoardPlayers === "function" ? options.getPlayerBoardPlayers : () => [];
  const getRoleGroupForRole = typeof options.getRoleGroupForRole === "function" ? options.getRoleGroupForRole : () => "";
  const getSelectedBlock = typeof options.getSelectedBlock === "function" ? options.getSelectedBlock : () => null;
  const normalizePlayerProfileRole =
    typeof options.normalizePlayerProfileRole === "function" ? options.normalizePlayerProfileRole : (value = "") => String(value || "");
  const normalizeProfileKey =
    typeof options.normalizeProfileKey === "function" ? options.normalizeProfileKey : (value = "") => String(value || "");
  const normalizeRoleGroupKey =
    typeof options.normalizeRoleGroupKey === "function" ? options.normalizeRoleGroupKey : (value = "") => String(value || "");
  const normalizeSquadStatusKey =
    typeof options.normalizeSquadStatusKey === "function" ? options.normalizeSquadStatusKey : normalizeProfileKey;
  const parseFormation =
    typeof options.parseFormation === "function"
      ? options.parseFormation
      : () => [];

  function getBlockText(block = getSelectedBlock()) {
    return [
      block?.label,
      block?.title,
      block?.focus,
      block?.phase,
      block?.subPhase,
      block?.objective,
      block?.why,
      block?.organization,
      block?.principles,
      block?.intensity,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function getProfile(block = getSelectedBlock()) {
    const text = getBlockText(block);
    const includesAny = (...patterns) => patterns.some((pattern) => pattern.test(text));
    if (includesAny(/final|finish|shoot|shot|score|chance|box|cross|cutback|attack|attacking|avslut|anfall|mål|mal/)) {
      return {
        key: "final-third",
        label: "Final third",
        detail: "Prioritises creators, wide attackers and finishers.",
        roles: ["LW", "RW", "ST", "10", "8"],
      };
    }
    if (includesAny(/defen|press|block|out of possession|compact|mark|duel|protect|försvar|forsvar|pressing/)) {
      return {
        key: "defensive",
        label: "Defensive block",
        detail: "Prioritises back line, screening and availability security.",
        roles: ["GK", "CB", "LB", "RB", "6", "8"],
      };
    }
    if (includesAny(/transition|counter|recover|regain|omställ|omstall|counterpress/)) {
      return {
        key: "transition",
        label: "Transition",
        detail: "Prioritises runners, central connectors and front-line threat.",
        roles: ["6", "8", "10", "LW", "RW", "ST"],
      };
    }
    if (includesAny(/possession|build|rondo|passing|pass|circulation|switch|tempo|retain|uppspel|bollinnehav|speluppbygg/)) {
      return {
        key: "possession",
        label: "Possession",
        detail: "Prioritises centre-backs, pivots, connectors and creators.",
        roles: ["CB", "6", "8", "10", "LB", "RB"],
      };
    }
    if (includesAny(/speed|sprint|physical|conditioning|load|running|fitness|fys|löp|lop/)) {
      return {
        key: "physical",
        label: "Physical / load",
        detail: "Prioritises wide runners, box-to-box profiles and robust availability.",
        roles: ["LWB", "RWB", "LB", "RB", "8", "LW", "RW", "ST"],
      };
    }
    return {
      key: "balanced",
      label: "Balanced exercise",
      detail: "Builds a balanced group across lines with Squad role context.",
      roles: ["GK", "CB", "LB", "RB", "6", "8", "10", "LW", "RW", "ST"],
    };
  }

  function getTargetCount(boardPlayers = []) {
    const formationCount = parseFormation(getFormationInput()).reduce((total, lineCount) => total + lineCount, 0);
    if (formationCount > 0) {
      return Math.min(formationCount, boardPlayers.length);
    }
    return Math.min(boardPlayers.length, boardPlayers.length >= 12 ? 10 : boardPlayers.length);
  }

  function getRoleScore(player = {}, targetRoles = []) {
    const roleFit = normalizeRoleFitMap(player);
    const directScore = targetRoles.reduce((best, role) => {
      const value = Number(roleFit[role]);
      return Number.isFinite(value) ? Math.max(best, value) : best;
    }, 0);
    if (directScore > 0) {
      return directScore;
    }
    const primaryRole = normalizePlayerProfileRole(player.primaryRole, "");
    if (targetRoles.includes(primaryRole)) {
      return 78;
    }
    const secondaryRoles = Array.isArray(player.secondaryRoles)
      ? player.secondaryRoles.map((role) => normalizePlayerProfileRole(role, "")).filter(Boolean)
      : [];
    if (secondaryRoles.some((role) => targetRoles.includes(role))) {
      return 68;
    }
    const targetGroups = new Set(targetRoles.map((role) => getRoleGroupForRole(role)).filter(Boolean));
    if (targetGroups.has(normalizeRoleGroupKey(player.roleGroup))) {
      return 58;
    }
    return 48;
  }

  function getReason(item, profile, roleScore) {
    const player = item?.player ?? {};
    const bestMatches = getBridgeBestMatches(player, 2);
    const primaryRole = normalizePlayerProfileRole(player.primaryRole, "");
    const secondaryRoles = Array.isArray(player.secondaryRoles) ? player.secondaryRoles : [];
    const reasons = [];
    if (bestMatches.length) {
      reasons.push(`Role DNA ${bestMatches[0].role} ${bestMatches[0].score}%`);
    } else if (primaryRole) {
      reasons.push(`Primary ${primaryRole}`);
    } else {
      reasons.push("Medical fallback profile");
    }
    if (profile.roles.includes(primaryRole)) {
      reasons.push(`Natural ${primaryRole}`);
    } else if (secondaryRoles.some((role) => profile.roles.includes(role))) {
      reasons.push("Secondary role fit");
    }
    if (item?.participation !== null && item?.participation !== undefined) {
      reasons.push(`${item.participation}% available`);
    }
    const squadStatus = normalizeSquadStatusKey(player.squadStatus);
    if (squadStatus) {
      reasons.push(`Squad ${squadStatus}`);
    }
    const careerPhase = normalizeProfileKey(player.careerPhase);
    if (careerPhase) {
      reasons.push(`Career ${careerPhase}`);
    }
    if (player.idp?.primaryFocus) {
      reasons.push(`IDP: ${player.idp.primaryFocus}`);
    }
    if (roleScore < 60) {
      reasons.push("Fallback selection");
    }
    return reasons.slice(0, 3).join(" / ");
  }

  function scoreItem(item, profile) {
    const player = item?.player ?? {};
    const roleScore = getRoleScore(player, profile.roles);
    const availabilityScore = Number.isFinite(Number(item?.participation)) ? Number(item.participation) : 0;
    const squadImportance = getImportanceScore(player) ?? 45;
    const careerScore = getCareerScore(player);
    const minutesScore = getMinutesScore(player);
    const primaryRole = normalizePlayerProfileRole(player.primaryRole, "");
    const secondaryRoles = Array.isArray(player.secondaryRoles) ? player.secondaryRoles : [];
    const roleBonus = profile.roles.includes(primaryRole)
      ? 8
      : secondaryRoles.some((role) => profile.roles.includes(role))
        ? 5
        : 0;
    const linkedBonus = player.profileId ? 4 : 0;
    const score = Math.round(
      roleScore * 0.5 +
        availabilityScore * 0.26 +
        squadImportance * 0.1 +
        careerScore * 0.05 +
        minutesScore * 0.006 +
        roleBonus +
        linkedBonus
    );
    return {
      item,
      score: clamp(score, 0, 100),
      roleScore: Math.round(roleScore),
      availabilityScore,
      reason: getReason(item, profile, roleScore),
    };
  }

  function buildSelectionAssistant(block, boardPlayers = getPlayerBoardPlayers(block)) {
    const profile = getProfile(block);
    const targetCount = getTargetCount(boardPlayers);
    const ranked = boardPlayers
      .map((item) => scoreItem(item, profile))
      .sort((first, second) =>
        second.score - first.score ||
        second.roleScore - first.roleScore ||
        comparePlayers(first.item.player, second.item.player)
      );
    const suggestions = ranked.slice(0, targetCount);
    const selectedRoleCoverage = profile.roles.map((role) => {
      const best = suggestions.reduce((bestScore, suggestion) => {
        const value = Number(suggestion.item.player?.roleFit?.[role]);
        return Number.isFinite(value) ? Math.max(bestScore, value) : bestScore;
      }, 0);
      return { role, covered: best >= 66, score: Math.round(best) };
    });
    return {
      profile,
      targetCount,
      ranked,
      suggestions,
      selectedRoleCoverage,
      missingRoles: selectedRoleCoverage.filter((entry) => !entry.covered),
    };
  }

  return {
    buildSelectionAssistant,
    getBlockText,
    getProfile,
    getReason,
    getRoleScore,
    getTargetCount,
    scoreItem,
  };
}
