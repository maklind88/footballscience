const { buildSupabaseKeyHeaders, readConfig } = require("./supabase-admin.js");
const { LEADERBOARD_TIMEZONE, canonicalAwardHash, canonicalReverseHash, isUuid, monthStart, normalizeText } = require("./leaderboard-contract.js");
const {
  buildAvailabilityByPlayer,
  findUnavailableAwardPlayerIds,
  readLeaderboardAvailabilitySources,
} = require("./leaderboard-availability.js");
const { ensureSquadRosterProjection } = require("./squad-roster-projection.js");

const ALLOWED_SQUAD_LINK_MODULES = new Set(["squad", "player-profiles"]);

function failure(reason, status = 500, details = null) {
  return { ok: false, status, reason, ...(details ? { details } : {}) };
}

function databaseConfig(options = {}) {
  const config = options.config || readConfig();
  if (!config?.url || !config?.serviceRoleKey) {
    return failure("Leaderboard database is not configured.");
  }
  return { ok: true, url: config.url, serviceRoleKey: config.serviceRoleKey };
}

function databaseHeaders(serviceRoleKey, options = {}) {
  return {
    ...buildSupabaseKeyHeaders(serviceRoleKey),
    Accept: "application/json",
    ...(options.json ? { "Content-Type": "application/json" } : {}),
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function responseStatus(response, payload) {
  const code = normalizeText(payload?.code, 20);
  if (code === "P0002") return 404;
  if (code === "42501") return 403;
  if (["23505", "55000"].includes(code)) return 409;
  return response.status || 500;
}

function responseReason(payload) {
  const code = normalizeText(payload?.code, 20);
  if (code === "P0002") return "Leaderboard event was not found in this team.";
  if (code === "42501") return "Leaderboard access was denied.";
  if (["23505", "55000"].includes(code)) return "Leaderboard request conflicts with the current competition state.";
  if (code === "22023") return "Leaderboard request data is invalid.";
  return "Leaderboard database request failed.";
}

async function databaseRequest(path, options = {}) {
  const config = databaseConfig(options);
  if (!config.ok) return config;
  let response;
  try {
    response = await (options.fetchImpl || fetch)(`${config.url}/rest/v1/${path}`, {
      method: options.method || "GET",
      headers: databaseHeaders(config.serviceRoleKey, { json: Boolean(options.body) }),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    return failure("Leaderboard database request failed.", 503);
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    return failure(responseReason(payload), responseStatus(response, payload), payload);
  }
  return { ok: true, status: response.status, data: payload };
}

async function fetchRows(table, params = {}, options = {}) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const result = await databaseRequest(`${table}?${query.toString()}`, options);
  if (!result.ok) return result;
  return { ...result, rows: Array.isArray(result.data) ? result.data : [] };
}

async function callRpc(functionName, body, options = {}) {
  return databaseRequest(`rpc/${functionName}`, { ...options, method: "POST", body });
}

function postgrestInList(values = []) {
  return `(${Array.from(new Set(values.filter(isUuid))).join(",")})`;
}

async function resolveSquadTeam(tenant, options = {}) {
  const links = await fetchRows("platform_tenant_links", {
    select: "module_id,module_table,module_record_id,organization_id,team_id,status",
    organization_id: `eq.${tenant.organizationId}`,
    team_id: `eq.${tenant.teamId}`,
    module_table: "eq.squad_teams",
    status: "eq.active",
    limit: "20",
  }, options);
  if (!links.ok) return links;

  if (links.rows.some((link) => !ALLOWED_SQUAD_LINK_MODULES.has(link.module_id) || !isUuid(link.module_record_id))) {
    return failure("Platform team has an invalid Squad tenant link.", 409);
  }

  const linkedIds = Array.from(new Set(links.rows
    .filter((link) => ALLOWED_SQUAD_LINK_MODULES.has(link.module_id) && isUuid(link.module_record_id))
    .map((link) => link.module_record_id)));
  if (linkedIds.length > 1) return failure("Platform team has ambiguous Squad tenant links.", 409);

  const candidateIds = linkedIds.length ? linkedIds : [tenant.teamId];
  const teams = await fetchRows("squad_teams", {
    select: "id,organization_id,club_id,name,status",
    id: `in.${postgrestInList(candidateIds)}`,
    status: "eq.active",
    limit: "2",
  }, options);
  if (!teams.ok) return teams;
  if (teams.rows.length !== 1) {
    return failure("Active Platform-to-Squad team mapping is required for Leaderboard.", 409);
  }
  return {
    ok: true,
    squadTeam: {
      id: teams.rows[0].id,
      organizationId: teams.rows[0].organization_id,
      clubId: teams.rows[0].club_id || null,
      name: teams.rows[0].name || "",
    },
  };
}

async function fetchActiveRoster(squadTeam, options = {}) {
  const roster = await fetchRows("squad_roster_memberships", {
    select: "id,organization_id,team_id,season_id,player_id,shirt_number,position_label,primary_role,availability_status,status,updated_at,deleted_at",
    organization_id: `eq.${squadTeam.organizationId}`,
    team_id: `eq.${squadTeam.id}`,
    status: "eq.active",
    deleted_at: "is.null",
    order: "updated_at.desc",
    limit: "500",
  }, options);
  if (!roster.ok) return roster;
  if (!roster.rows.length) return options.allowEmpty ? { ok: true, roster: [], players: [] } : failure("No active Squad roster is mapped to this team.", 409);
  const playerIds = Array.from(new Set(roster.rows.map((row) => row.player_id).filter(isUuid)));
  const players = await fetchRows("squad_players", {
    select: "id,organization_id,display_name,status,metadata,updated_at,deleted_at",
    organization_id: `eq.${squadTeam.organizationId}`,
    id: `in.${postgrestInList(playerIds)}`,
    status: "eq.active",
    deleted_at: "is.null",
    limit: "500",
  }, options);
  if (!players.ok) return players;
  return { ok: true, roster: roster.rows, players: players.rows };
}

function createActiveRosterSnapshot(roster = [], players = []) {
  const membershipByPlayer = new Map();
  roster.forEach((membership) => {
    if (!membershipByPlayer.has(membership.player_id)) membershipByPlayer.set(membership.player_id, membership);
  });
  const sourceKeys = new Set();
  const snapshot = [];
  for (const player of players) {
    const membership = membershipByPlayer.get(player.id);
    if (!membership) continue;
    const playerId = normalizeText(player.metadata?.legacyId, 180) || player.id;
    const displayName = normalizeText(player.display_name, 180);
    if (!playerId || !displayName || sourceKeys.has(playerId)) {
      return failure("Active Squad roster contains ambiguous player identity.", 409);
    }
    sourceKeys.add(playerId);
    snapshot.push({
      playerId,
      displayName,
      number: normalizeText(membership.shirt_number, 16),
      position: normalizeText(membership.position_label || membership.primary_role, 80),
      photoUrl: normalizeText(player.metadata?.photoUrl, 1800),
      availabilityStatus: normalizeText(membership.availability_status, 40) || "unknown",
      updatedAt: normalizeText(membership.updated_at || player.updated_at, 48),
    });
  }
  if (snapshot.length !== membershipByPlayer.size) {
    return failure("Active Squad roster contains missing player identity.", 409);
  }
  return { ok: true, roster: snapshot.sort((left, right) => left.displayName.localeCompare(right.displayName)) };
}

function indexMappedPlayers(roster = [], players = []) {
  const membershipByPlayer = new Map();
  roster.forEach((membership) => {
    if (!membershipByPlayer.has(membership.player_id)) membershipByPlayer.set(membership.player_id, membership);
  });
  const bySourceKey = new Map();
  players.forEach((player) => {
    const membership = membershipByPlayer.get(player.id);
    if (!membership) return;
    const legacyId = normalizeText(player.metadata?.legacyId, 180);
    const sourceKey = legacyId || player.id;
    const mapped = {
      squad_player_id: player.id,
      squad_roster_membership_id: membership.id,
      player_source_key: sourceKey,
      display_name_snapshot: normalizeText(player.display_name, 180),
    };
    for (const key of new Set([player.id, legacyId].filter(Boolean))) {
      const matches = bySourceKey.get(key) || [];
      matches.push(mapped);
      bySourceKey.set(key, matches);
    }
  });
  return bySourceKey;
}

async function resolveAwardPlayers(squadTeam, awards, options = {}) {
  const activeRoster = await fetchActiveRoster(squadTeam, options);
  if (!activeRoster.ok) return activeRoster;
  const playerIndex = indexMappedPlayers(activeRoster.roster, activeRoster.players);
  const mappedAwards = [];
  const mappedPlayerIds = new Set();
  for (const award of awards) {
    const matches = playerIndex.get(award.playerId) || [];
    if (matches.length !== 1) {
      return failure(`Player ${award.playerId} is not uniquely mapped to the active Squad roster.`, 409);
    }
    if (mappedPlayerIds.has(matches[0].squad_player_id)) {
      return failure("An active Squad player was mapped more than once in the award batch.", 409);
    }
    mappedPlayerIds.add(matches[0].squad_player_id);
    mappedAwards.push({ ...matches[0], points: award.points, placement: award.placement });
  }
  return { ok: true, awards: mappedAwards, roster: activeRoster.roster, players: activeRoster.players };
}

async function refreshSquadRosterProjection(context, options = {}) {
  return ensureSquadRosterProjection(context, { ...options, callRpc });
}

async function buildRosterAvailability(month, roster, projection, options = {}) {
  if (!projection?.targetMatched || !roster.length) return { ok: true, availability: {} };
  const sources = await readLeaderboardAvailabilitySources({
    ...options,
    playerProfilesState: projection.sourceState,
  });
  if (!sources.ok) return sources;
  return {
    ok: true,
    availability: buildAvailabilityByPlayer({
      month,
      roster,
      playerProfilesState: projection.sourceState || sources.playerProfilesState,
      medicalState: sources.medicalState,
    }),
  };
}

function attachRosterAvailability(roster = [], availabilityByPlayer = {}) {
  return roster.map((player) => ({
    ...player,
    availabilityByDate: availabilityByPlayer[player.playerId] || {},
  }));
}

async function awardPoints(context, command, options = {}) {
  const projection = await refreshSquadRosterProjection(context, options);
  const team = await resolveSquadTeam(context.tenant, options);
  if (!team.ok) return team;
  const mapped = await resolveAwardPlayers(team.squadTeam, command.awards, options);
  if (!mapped.ok) return !projection.ok ? projection : mapped;
  if (projection.ok && projection.targetMatched) {
    const rosterSnapshot = createActiveRosterSnapshot(mapped.roster, mapped.players);
    if (!rosterSnapshot.ok) return rosterSnapshot;
    const availabilityResult = await buildRosterAvailability(command.month, rosterSnapshot.roster, projection, options);
    if (!availabilityResult.ok) return availabilityResult;
    const unavailable = findUnavailableAwardPlayerIds(command.awards, command.occurredOn, availabilityResult.availability);
    if (unavailable.length) {
      return failure("One or more selected players were unavailable for team activity on the award date.", 409);
    }
  }
  const requestHash = canonicalAwardHash(command, mapped.awards);
  const result = await callRpc("leaderboard_award_batch", {
    p_organization_id: context.tenant.organizationId,
    p_club_id: context.tenant.clubId,
    p_team_id: context.tenant.teamId,
    p_squad_organization_id: team.squadTeam.organizationId,
    p_squad_team_id: team.squadTeam.id,
    p_month_start: monthStart(command.month),
    p_timezone: LEADERBOARD_TIMEZONE,
    p_occurred_on: command.occurredOn,
    p_title: command.title,
    p_note: command.note,
    p_idempotency_key: command.idempotencyKey,
    p_request_hash: requestHash,
    p_actor_id: context.actor.id,
    p_awards: mapped.awards,
  }, options);
  return result.ok ? { ok: true, receipt: result.data } : result;
}

async function reverseEvent(context, command, options = {}) {
  const result = await callRpc("leaderboard_reverse_event", {
    p_organization_id: context.tenant.organizationId,
    p_team_id: context.tenant.teamId,
    p_event_id: command.eventId,
    p_reason: command.reason,
    p_idempotency_key: command.idempotencyKey,
    p_request_hash: canonicalReverseHash(command),
    p_actor_id: context.actor.id,
  }, options);
  return result.ok ? { ok: true, receipt: result.data } : result;
}

async function readMonthSnapshot(context, month, options = {}) {
  const projection = await refreshSquadRosterProjection(context, options);
  const team = await resolveSquadTeam(context.tenant, options);
  if (!team.ok) return team;
  const activeRoster = await fetchActiveRoster(team.squadTeam, { ...options, allowEmpty: true });
  if (!activeRoster.ok) return activeRoster;
  if (!activeRoster.roster.length && !projection.ok) return projection;
  const rosterSnapshot = createActiveRosterSnapshot(activeRoster.roster, activeRoster.players);
  if (!rosterSnapshot.ok) return rosterSnapshot;
  const availabilityResult = projection.ok
    ? await buildRosterAvailability(month, rosterSnapshot.roster, projection, options)
    : { ok: false, availability: {} };
  const availability = availabilityResult.ok ? availabilityResult.availability : {};
  const result = await callRpc("leaderboard_month_snapshot", {
    p_actor_id: context.actor.id,
    p_organization_id: context.tenant.organizationId,
    p_team_id: context.tenant.teamId,
    p_month_start: monthStart(month),
  }, options);
  if (!result.ok) return result;
  const snapshot = result.data && typeof result.data === "object" ? result.data : {};
  return {
    ok: true,
    snapshot: {
      competition: snapshot.competition || null,
      summary: snapshot.summary || { participantCount: 0, totalPoints: 0, eventCount: 0 },
      roster: attachRosterAvailability(rosterSnapshot.roster, availability),
      standings: Array.isArray(snapshot.standings) ? snapshot.standings : [],
      events: Array.isArray(snapshot.events) ? snapshot.events : [],
    },
  };
}

module.exports = {
  awardPoints,
  createActiveRosterSnapshot,
  fetchRows,
  indexMappedPlayers,
  readMonthSnapshot,
  resolveAwardPlayers,
  resolveSquadTeam,
  reverseEvent,
};
