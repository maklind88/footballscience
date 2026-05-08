export const squadStorageKey = "football-player-profiles-v1";

export const squadRoleOptions = Object.freeze(["GK", "LB", "CB", "RB", "LWB", "RWB", "6", "8", "10", "LW", "RW", "ST"]);
export const squadRoleGroups = Object.freeze(["goalkeeper", "defender", "midfielder", "forward"]);
export const squadStatusKeys = Object.freeze(["key", "important", "rotation", "squad", "depth", "development", "academy", "trial", "loan"]);
export const squadAvailabilityKeys = Object.freeze(["available", "managed", "rehab", "unavailable", "loan", "unknown"]);
export const squadIdpStatusKeys = Object.freeze(["active", "review", "monitor", "none"]);

const defaultPageLimit = 50;
const maxPageLimit = 200;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function defaultNow() {
  return new Date().toISOString();
}

function defaultIdFactory(_player, index = 0) {
  return `squad-player-${Date.now()}-${index + 1}`;
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function normalizeArray(value = []) {
  const source = Array.isArray(value)
    ? value
    : normalizeText(value)
        .split(",")
        .map((item) => item.trim());
  return Array.from(new Set(source.map(normalizeText).filter(Boolean)));
}

function normalizeStatus(value, allowedValues, fallback) {
  const status = normalizeKey(value || fallback);
  return allowedValues.includes(status) ? status : fallback;
}

export function parseSquadStatePayload(rawValue) {
  if (!rawValue) {
    return {};
  }

  if (typeof rawValue === "object") {
    return rawValue;
  }

  if (typeof rawValue !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeSquadRole(value, fallback = "CB") {
  const role = normalizeText(value).toUpperCase();
  return squadRoleOptions.includes(role) ? role : fallback;
}

export function inferSquadRoleFromPosition(position = "") {
  const normalizedPosition = normalizeKey(position);
  if (normalizedPosition.includes("goal")) {
    return "GK";
  }
  if (normalizedPosition.includes("def")) {
    return "CB";
  }
  if (normalizedPosition.includes("mid")) {
    return "8";
  }
  if (normalizedPosition.includes("for")) {
    return "ST";
  }
  return "CB";
}

export function inferSquadRoleGroup(role = "", position = "") {
  const roleKey = normalizeSquadRole(role, inferSquadRoleFromPosition(position));
  if (roleKey === "GK") {
    return "goalkeeper";
  }
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(roleKey)) {
    return "defender";
  }
  if (["6", "8", "10"].includes(roleKey)) {
    return "midfielder";
  }
  return "forward";
}

export function normalizeSquadRoleList(value = []) {
  return normalizeArray(value).map((role) => normalizeSquadRole(role, "")).filter(Boolean);
}

export function normalizeSquadPlayer(player = {}, options = {}) {
  const name = normalizeText(player.name || player.displayName || player.display_name);
  if (!name) {
    return null;
  }

  const index = Number.isFinite(Number(options.index)) ? Number(options.index) : 0;
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : defaultIdFactory;
  const primaryRole = normalizeSquadRole(player.primaryRole || player.primary_role, inferSquadRoleFromPosition(player.position));
  const roleGroup = squadRoleGroups.includes(normalizeKey(player.roleGroup || player.role_group))
    ? normalizeKey(player.roleGroup || player.role_group)
    : inferSquadRoleGroup(primaryRole, player.position);
  const rosterOrder = Number(player.rosterOrder ?? player.roster_order);
  const secondaryRoles = normalizeSquadRoleList(player.secondaryRoles || player.secondary_roles).filter((role) => role !== primaryRole);
  const createdAt = normalizeText(player.createdAt || player.created_at) || normalizeText(options.now) || defaultNow();
  const updatedAt = normalizeText(player.updatedAt || player.updated_at) || createdAt;

  return Object.freeze({
    id: normalizeText(player.id) || normalizeText(idFactory(player, index)),
    name,
    sortName: normalizeText(player.sortName || player.sort_name) || name.toLowerCase(),
    number: normalizeText(player.number || player.shirtNumber || player.shirt_number),
    position: normalizeText(player.position || player.positionLabel || player.position_label),
    photoUrl: normalizeText(player.photoUrl || player.photo_url),
    sourceUrl: normalizeText(player.sourceUrl || player.source_url),
    status: normalizeStatus(player.status || player.availabilityStatus || player.availability_status, squadAvailabilityKeys, "available"),
    squadStatus: normalizeStatus(player.squadStatus || player.squad_status, squadStatusKeys, "squad"),
    primaryRole,
    secondaryRoles: Object.freeze(secondaryRoles),
    roleGroup,
    preferredSide: normalizeStatus(player.preferredSide || player.preferred_side, ["left", "center", "right", "both"], "center"),
    idp: Object.freeze({
      status: normalizeStatus(player.idp?.status || player.idpStatus || player.idp_status, squadIdpStatusKeys, "none"),
      primaryFocus: normalizeText(player.idp?.primaryFocus || player.idp?.primary_focus || player.primaryFocus || player.primary_focus),
      nextAction: normalizeText(player.idp?.nextAction || player.idp?.next_action || player.nextAction || player.next_action),
      reviewDate: normalizeText(player.idp?.reviewDate || player.idp?.review_date || player.reviewDate || player.review_date),
    }),
    medicalSummary: Object.freeze({
      currentAvailability: normalizeText(player.medicalSummary?.currentAvailability || player.medical_summary?.current_availability),
      rtpStatus: normalizeText(player.medicalSummary?.rtpStatus || player.medical_summary?.rtp_status),
      coachNote: normalizeText(player.medicalSummary?.coachNote || player.medical_summary?.coach_note),
    }),
    coachNotes: normalizeText(player.coachNotes || player.coach_notes),
    rosterOrder: Number.isFinite(rosterOrder) ? rosterOrder : null,
    createdAt,
    updatedAt,
  });
}

export function compareSquadPlayers(first, second) {
  const firstOrder = Number.isFinite(first.rosterOrder) ? first.rosterOrder : Number.MAX_SAFE_INTEGER;
  const secondOrder = Number.isFinite(second.rosterOrder) ? second.rosterOrder : Number.MAX_SAFE_INTEGER;
  if (firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }

  return first.sortName.localeCompare(second.sortName) || first.id.localeCompare(second.id);
}

export function normalizeSquadState(rawValue, options = {}) {
  const source = parseSquadStatePayload(rawValue);
  const players = (Array.isArray(source.players) ? source.players : [])
    .map((player, index) => normalizeSquadPlayer(player, { ...options, index }))
    .filter(Boolean)
    .sort(compareSquadPlayers);
  const selectedPlayerId = players.some((player) => player.id === source.selectedPlayerId)
    ? source.selectedPlayerId
    : players[0]?.id || "";

  return Object.freeze({
    selectedPlayerId,
    players: Object.freeze(players),
    rosterVersion: normalizeText(source.rosterVersion || source.roster_version),
    schemaVersion: Number(source.schemaVersion || source.schema_version || 0) || 0,
    updatedAt: normalizeText(source.updatedAt || source.updated_at) || normalizeText(options.now) || defaultNow(),
  });
}

export function getSquadPlayerSearchText(player = {}) {
  return [
    player.name,
    player.sortName,
    player.number,
    player.position,
    player.primaryRole,
    ...(Array.isArray(player.secondaryRoles) ? player.secondaryRoles : []),
    player.roleGroup,
    player.status,
    player.squadStatus,
    player.idp?.status,
    player.idp?.primaryFocus,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterSquadPlayers(players = [], filters = {}) {
  const query = normalizeKey(filters.query);
  const roleGroup = normalizeKey(filters.roleGroup || "all");
  const status = normalizeKey(filters.status || "all");
  const squadStatus = normalizeKey(filters.squadStatus || "all");

  return Object.freeze(
    players.filter((player) => {
      if (roleGroup !== "all" && player.roleGroup !== roleGroup) {
        return false;
      }
      if (status !== "all" && player.status !== status) {
        return false;
      }
      if (squadStatus !== "all" && player.squadStatus !== squadStatus) {
        return false;
      }
      if (query && !getSquadPlayerSearchText(player).includes(query)) {
        return false;
      }
      return true;
    })
  );
}

export function selectSquadPlayerPage(players = [], options = {}) {
  const filteredPlayers = [...filterSquadPlayers(players, options)].sort(compareSquadPlayers);
  const requestedLimit = Number(options.limit);
  const limit = Math.max(1, Math.min(maxPageLimit, Number.isFinite(requestedLimit) ? requestedLimit : defaultPageLimit));
  const cursor = normalizeText(options.cursor || options.afterId);
  const cursorIndex = cursor ? filteredPlayers.findIndex((player) => player.id === cursor) : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const items = filteredPlayers.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < filteredPlayers.length ? items.at(-1)?.id || "" : "";

  return Object.freeze({
    items: Object.freeze(items),
    totalCount: filteredPlayers.length,
    nextCursor,
  });
}

export function findSquadPlayerById(players = [], playerId = "") {
  const id = normalizeText(playerId);
  return players.find((player) => player.id === id) || null;
}

export function getSquadPlayerCompleteness(player = {}) {
  const checks = [
    player.name,
    player.position,
    player.primaryRole,
    player.roleGroup,
    player.preferredSide,
    player.squadStatus,
    player.idp?.status !== "none" ? player.idp?.primaryFocus : "not-required",
    player.medicalSummary?.currentAvailability,
    player.coachNotes,
  ];
  const completeCount = checks.filter((value) => normalizeText(value)).length;
  return Math.round((completeCount / checks.length) * 100);
}

export function createSquadCounts(players = []) {
  const roleBalance = Object.fromEntries(squadRoleGroups.map((group) => [group, 0]));
  players.forEach((player) => {
    if (roleBalance[player.roleGroup] !== undefined) {
      roleBalance[player.roleGroup] += 1;
    }
  });

  return Object.freeze({
    players: players.length,
    available: players.filter((player) => player.status === "available").length,
    activeIdps: players.filter((player) => player.idp?.status && player.idp.status !== "none").length,
    completeProfiles: players.filter((player) => getSquadPlayerCompleteness(player) >= 70).length,
    roleBalance: Object.freeze(roleBalance),
  });
}

export function createSquadRosterDraft(player = {}, context = {}) {
  const normalizedPlayer = normalizeSquadPlayer(player);
  if (!normalizedPlayer) {
    return null;
  }

  const metadata = {
    legacyId: normalizedPlayer.id,
    photoUrl: normalizedPlayer.photoUrl,
    sourceUrl: normalizedPlayer.sourceUrl,
  };

  return Object.freeze({
    player: Object.freeze({
      organization_id: normalizeText(context.organizationId || context.organization_id),
      display_name: normalizedPlayer.name,
      sort_name: normalizedPlayer.sortName,
      status: normalizedPlayer.status === "loan" ? "inactive" : "active",
      metadata,
    }),
    roster_membership: Object.freeze({
      organization_id: normalizeText(context.organizationId || context.organization_id),
      club_id: normalizeText(context.clubId || context.club_id),
      team_id: normalizeText(context.teamId || context.team_id),
      season_id: normalizeText(context.seasonId || context.season_id),
      shirt_number: normalizedPlayer.number,
      position_label: normalizedPlayer.position,
      primary_role: normalizedPlayer.primaryRole,
      secondary_roles: normalizedPlayer.secondaryRoles,
      role_group: normalizedPlayer.roleGroup,
      preferred_side: normalizedPlayer.preferredSide,
      squad_status: normalizedPlayer.squadStatus,
      availability_status: normalizedPlayer.status,
      status: "active",
      metadata,
    }),
  });
}

export function selectRecentlyUpdatedSquadPlayers(players = [], limit = 10) {
  return Object.freeze(
    [...players]
      .sort((first, second) => parseTime(second.updatedAt) - parseTime(first.updatedAt) || compareSquadPlayers(first, second))
      .slice(0, Math.max(1, Math.min(maxPageLimit, Number(limit) || 10)))
  );
}
