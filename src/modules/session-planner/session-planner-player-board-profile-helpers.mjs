export const sessionPlannerPlayerBoardPositionGroups = [
  { key: "goalkeeper", label: "Goalkeepers", shortLabel: "GK", order: 1, x: 12 },
  { key: "defender", label: "Defenders", shortLabel: "DEF", order: 2, x: 35 },
  { key: "midfielder", label: "Midfielders", shortLabel: "MID", order: 3, x: 58 },
  { key: "forward", label: "Forwards", shortLabel: "FWD", order: 4, x: 82 },
];

function defaultNormalizePlayerProfileRole(value = "") {
  return String(value || "").trim();
}

export function normalizeSessionPlannerPlayerBoardProfileKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9åäö]/g, "");
}

export function createSessionPlannerPlayerBoardProfileHelpers(options = {}) {
  const normalizePlayerProfileRole =
    typeof options.normalizePlayerProfileRole === "function"
      ? options.normalizePlayerProfileRole
      : defaultNormalizePlayerProfileRole;

  function normalizeRoleGroupKey(value) {
    const key = normalizeSessionPlannerPlayerBoardProfileKey(value);
    if (!key) return "";
    if (["gk", "goalkeeper", "keeper", "goalie", "malvakt", "målvakt"].includes(key)) return "goalkeeper";
    if (["def", "defender", "defenders", "back", "backs", "defence", "defense"].includes(key)) return "defender";
    if (["mid", "midfield", "midfielder", "midfielders", "mittfalt", "mittfält"].includes(key)) return "midfielder";
    if (["fwd", "fw", "forward", "forwards", "attacker", "attack", "striker", "anfall"].includes(key)) return "forward";
    return key;
  }

  function getRoleGroupForRole(roleKey) {
    const key = normalizeSessionPlannerPlayerBoardProfileKey(roleKey);
    if (!key) return "";
    if (["gk", "goalkeeper", "keeper", "goalie"].includes(key)) return "goalkeeper";
    if (
      [
        "cb",
        "lcb",
        "rcb",
        "lb",
        "rb",
        "lwb",
        "rwb",
        "centerback",
        "centreback",
        "centraldefender",
        "defender",
        "fullback",
        "wingback",
      ].includes(key)
    ) {
      return "defender";
    }
    if (
      [
        "cm",
        "dm",
        "am",
        "cdm",
        "cam",
        "lm",
        "rm",
        "midfielder",
        "centralmidfielder",
        "holdingmidfielder",
        "attackingmidfielder",
        "6",
        "8",
        "10",
      ].includes(key)
    ) {
      return "midfielder";
    }
    if (
      [
        "st",
        "cf",
        "fw",
        "fwd",
        "lw",
        "rw",
        "winger",
        "striker",
        "forward",
        "centerforward",
        "centreforward",
        "9",
        "11",
        "7",
      ].includes(key)
    ) {
      return "forward";
    }
    return "";
  }

  function getSideForRole(roleKey) {
    const key = normalizeSessionPlannerPlayerBoardProfileKey(roleKey);
    if (
      [
        "lb",
        "lcb",
        "lwb",
        "lm",
        "lw",
        "leftback",
        "leftcenterback",
        "leftcentreback",
        "leftwingback",
        "leftmidfielder",
        "leftwing",
        "leftforward",
      ].includes(key)
    ) {
      return "left";
    }
    if (
      [
        "rb",
        "rcb",
        "rwb",
        "rm",
        "rw",
        "rightback",
        "rightcenterback",
        "rightcentreback",
        "rightwingback",
        "rightmidfielder",
        "rightwing",
        "rightforward",
      ].includes(key)
    ) {
      return "right";
    }
    if (["cb", "cm", "dm", "am", "cdm", "cam", "cf", "st", "gk", "goalkeeper", "keeper", "6", "8", "9", "10"].includes(key)) {
      return "center";
    }
    return "";
  }

  function getExplicitRoles(player = {}) {
    return [
      player.primaryRole,
      ...(Array.isArray(player.secondaryRoles) ? player.secondaryRoles : []),
      player.position,
      player.role,
    ]
      .map((role) => normalizePlayerProfileRole(role, ""))
      .filter(Boolean);
  }

  function getPositionGroup(player = {}) {
    const explicitRoleGroup = normalizeRoleGroupKey(player?.roleGroup);
    const explicitGroup = sessionPlannerPlayerBoardPositionGroups.find((group) => group.key === explicitRoleGroup);
    if (explicitGroup) {
      return explicitGroup;
    }
    const explicitRoleGroupFromRole = getExplicitRoles(player).map((role) => getRoleGroupForRole(role)).find(Boolean);
    const explicitRoleGroupMatch = sessionPlannerPlayerBoardPositionGroups.find(
      (group) => group.key === explicitRoleGroupFromRole
    );
    if (explicitRoleGroupMatch) {
      return explicitRoleGroupMatch;
    }
    const roleText = [
      player?.position,
      player?.primaryRole,
      player?.role,
      ...(Array.isArray(player?.secondaryRoles) ? player.secondaryRoles : []),
    ].join(" ");
    const position = String(roleText).toLowerCase();
    const normalizedPosition = position.replace(/[^a-z0-9åäö]/gi, " ");
    const positionParts = normalizedPosition.split(/\s+/).filter(Boolean);
    const hasPositionPart = (...parts) => parts.some((part) => positionParts.includes(part));
    if (position.includes("goal") || position.includes("keeper") || hasPositionPart("gk", "målvakt", "malvakt")) {
      return sessionPlannerPlayerBoardPositionGroups[0];
    }
    if (position.includes("def") || position.includes("back") || hasPositionPart("lb", "cb", "rb", "lcb", "rcb", "wb", "lwb", "rwb")) {
      return sessionPlannerPlayerBoardPositionGroups[1];
    }
    if (
      position.includes("forward") ||
      position.includes("striker") ||
      position.includes("winger") ||
      position.includes("attack") ||
      position.includes("anfall") ||
      hasPositionPart("st", "cf", "fw", "w", "lw", "rw", "9")
    ) {
      return sessionPlannerPlayerBoardPositionGroups[3];
    }
    return sessionPlannerPlayerBoardPositionGroups[2];
  }

  function getRoleOrder(roleKey) {
    const orderByRole = {
      goalkeeper: 0,
      defender: 1,
      midfielder: 2,
      forward: 3,
    };
    return orderByRole[roleKey] ?? 2;
  }

  function getPlayerRoleProfile(player = {}) {
    const explicitRoles = getExplicitRoles(player);
    const position = [
      player.position,
      player.primaryRole,
      player.role,
      player.roleGroup,
      ...(Array.isArray(player.secondaryRoles) ? player.secondaryRoles : []),
    ]
      .join(" ")
      .toLowerCase();
    const normalizedPosition = position.replace(/[^a-z0-9åäö]/gi, " ");
    const parts = normalizedPosition.split(/\s+/).filter(Boolean);
    const hasPart = (...tokens) => tokens.some((token) => parts.includes(token));
    const group = getPositionGroup(player);
    const preferredSide = String(player.preferredSide ?? "").trim().toLowerCase();
    let side =
      explicitRoles.map((role) => getSideForRole(role)).find(Boolean) ||
      (["left", "center", "right"].includes(preferredSide) ? preferredSide : "center");
    if (
      side === "center" &&
      (position.includes("left") || position.includes("vänster") || position.includes("vanster") || hasPart("lb", "lcb", "lm", "lw", "lwb"))
    ) {
      side = "left";
    } else if (
      side === "center" &&
      (position.includes("right") || position.includes("höger") || position.includes("hoger") || hasPart("rb", "rcb", "rm", "rw", "rwb"))
    ) {
      side = "right";
    } else if (
      side === "center" &&
      (position.includes("center") ||
        position.includes("centre") ||
        position.includes("central") ||
        position.includes("mitt") ||
        hasPart("cb", "cm", "dm", "am", "cf", "st", "9", "6", "8", "10"))
    ) {
      side = "center";
    }
    return {
      roleKey: group.key,
      roleOrder: getRoleOrder(group.key),
      side,
    };
  }

  return {
    getExplicitRoles,
    getPlayerRoleProfile,
    getPositionGroup,
    getRoleGroupForRole,
    getRoleOrder,
    getSideForRole,
    normalizePlayerProfileRole,
    normalizeProfileKey: normalizeSessionPlannerPlayerBoardProfileKey,
    normalizeRoleGroupKey,
    positionGroups: sessionPlannerPlayerBoardPositionGroups,
  };
}
