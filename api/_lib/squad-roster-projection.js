const { readAppStateRecord } = require("./app-state-records-database.js");

const PLAYER_PROFILES_KEY = "football-player-profiles-v1";
const LEGACY_APP_STATE_ORGANIZATION_ID = "global";
const SQUAD_ROSTER_TYPES = new Set(["squad"]);
const AVAILABILITY_STATUSES = new Set([
  "available",
  "injured",
  "managed",
  "rehab",
  "unavailable",
  "national-team",
  "vacation",
  "personal",
  "suspended",
  "loan",
  "unknown",
]);
const ROLE_GROUPS = new Set(["goalkeeper", "defender", "midfielder", "forward"]);
const SQUAD_STATUSES = new Set(["key", "important", "rotation", "squad", "depth", "development", "academy", "trial", "loan"]);

function failure(reason, status = 500) {
  return { ok: false, status, reason };
}

function normalizeText(value, maxLength = 180) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseState(value = "") {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRosterType(value = "") {
  const key = normalizeText(value, 40).toLowerCase().replace(/[_\s]+/g, "-");
  if (["trialist", "trial-player"].includes(key)) return "trial";
  if (["training-guest", "guest-player"].includes(key)) return "guest";
  return key || "squad";
}

function inferRoleGroup(primaryRole = "", position = "") {
  const role = normalizeText(primaryRole, 24).toUpperCase();
  const label = normalizeText(position, 80).toLowerCase();
  if (role === "GK" || label.includes("goal")) return "goalkeeper";
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(role) || label.includes("def")) return "defender";
  if (["6", "8", "10"].includes(role) || label.includes("mid")) return "midfielder";
  return "forward";
}

function normalizeProjectionPlayer(player = {}) {
  const playerId = normalizeText(player.id, 180);
  const displayName = normalizeText(player.name || player.displayName, 180);
  const rosterType = normalizeRosterType(player.rosterType || player.playerType);
  if (!playerId || !displayName || !SQUAD_ROSTER_TYPES.has(rosterType) || player.countsInSquad === false) return null;
  const primaryRole = normalizeText(player.primaryRole, 24).toUpperCase();
  const position = normalizeText(player.position, 80);
  const requestedRoleGroup = normalizeText(player.roleGroup, 40).toLowerCase();
  const roleGroup = ROLE_GROUPS.has(requestedRoleGroup) ? requestedRoleGroup : inferRoleGroup(primaryRole, position);
  const availabilityStatus = normalizeText(player.status || player.availabilityStatus, 40).toLowerCase();
  const squadStatus = normalizeText(player.squadStatus, 40).toLowerCase();
  return {
    playerId,
    displayName,
    sortName: normalizeText(player.sortName, 180).toLowerCase() || displayName.toLowerCase(),
    shirtNumber: normalizeText(player.number || player.shirtNumber, 12),
    position,
    primaryRole,
    secondaryRoles: Array.from(new Set((Array.isArray(player.secondaryRoles) ? player.secondaryRoles : [])
      .map((role) => normalizeText(role, 24).toUpperCase())
      .filter(Boolean))).slice(0, 12),
    roleGroup,
    preferredSide: ["left", "center", "right", "both"].includes(normalizeText(player.preferredSide, 20).toLowerCase())
      ? normalizeText(player.preferredSide, 20).toLowerCase()
      : "center",
    squadStatus: SQUAD_STATUSES.has(squadStatus) ? squadStatus : "squad",
    availabilityStatus: AVAILABILITY_STATUSES.has(availabilityStatus) ? availabilityStatus : "available",
    rosterType,
    photoUrl: normalizeText(player.photoUrl, 1800),
    updatedAt: normalizeText(player.updatedAt, 48),
  };
}

function normalizeSquadRosterProjection(rawValue = "") {
  const state = parseState(rawValue);
  if (!state || !Array.isArray(state.players)) return failure("Squad projection source is invalid.", 409);
  const players = state.players.map(normalizeProjectionPlayer).filter(Boolean);
  const ids = new Set();
  for (const player of players) {
    if (ids.has(player.playerId)) return failure("Squad projection contains duplicate player identity.", 409);
    ids.add(player.playerId);
  }
  if (!players.length || players.length > 500) return failure("Squad projection player count is outside the supported range.", 409);
  return { ok: true, players, state };
}

async function ensureSquadRosterProjection(context = {}, options = {}) {
  const reader = options.readAppStateRecord || readAppStateRecord;
  const rpc = options.callRpc;
  if (typeof rpc !== "function") return failure("Squad projection database command is unavailable.");
  const source = await reader(PLAYER_PROFILES_KEY, LEGACY_APP_STATE_ORGANIZATION_ID);
  if (!source?.ok || !source.entry || source.entry.removed) {
    return { ok: true, projected: false, targetMatched: false, sourceState: null };
  }
  const projection = normalizeSquadRosterProjection(source.entry.value);
  if (!projection.ok) return projection;
  const result = await rpc("sync_squad_roster_projection", {
    p_actor_id: context.actor?.id,
    p_platform_organization_id: context.tenant?.organizationId,
    p_platform_team_id: context.tenant?.teamId,
    p_source_key: PLAYER_PROFILES_KEY,
    p_source_revision: Number(source.entry.revision) || 0,
    p_source_hash: normalizeText(source.entry.hash, 64).toLowerCase(),
    p_source_updated_at: source.entry.updatedAt || new Date().toISOString(),
    p_players: projection.players,
  }, options);
  if (!result.ok) return result;
  const receipt = result.data && typeof result.data === "object" ? result.data : {};
  return {
    ok: true,
    projected: Boolean(receipt.applied),
    targetMatched: receipt.targetMatched === true,
    sourceState: projection.state,
    receipt,
  };
}

module.exports = {
  ensureSquadRosterProjection,
  normalizeSquadRosterProjection,
};
