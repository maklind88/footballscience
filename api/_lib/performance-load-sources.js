const { readBackupStateEntry } = require("./app-state-backup-source.js");
const { buildSupabaseKeyHeaders, readConfig } = require("./supabase-admin.js");
const { fetchRows } = require("./leaderboard-database.js");
const { isUuid } = require("./leaderboard-contract.js");
const { membershipCoversTeam } = require("./leaderboard-scope.js");
const { hasModulePermission, normalizeRole } = require("../../src/core/permission-matrix.cjs");

const moduleId = "performance-room";
const squadKey = "football-player-profiles-v1";
const scheduleKey = "football-schedule-v1";
const activityTypes = new Set(["training", "recovery", "match"]);

async function resolvePerformanceTeam(platform, action, readRows = fetchRows) {
  const { actor, scope } = platform;
  if (!isUuid(actor?.id) || actor.status !== "active") return null;
  const memberships = scope?.memberships ?? [];
  const teams = (scope?.teams ?? []).filter((team) =>
    team.status === "active" && isUuid(team.id) && isUuid(team.organizationId) &&
    memberships.some((member) => membershipCoversTeam(member, team))
  );
  if (!teams.length) return null;

  // Only this verified tenant may read the legacy global owner snapshots.
  const result = await readRows("platform_teams", {
    select: "id,organization_id,platform_organizations!inner(id)",
    id: `in.(${teams.map(({ id }) => id).join(",")})`,
    status: "eq.active",
    deleted_at: "is.null",
    "metadata->>legacyTeamId": "eq.team-north-carolina-courage",
    "platform_organizations.status": "eq.active",
    "platform_organizations.deleted_at": "is.null",
    "platform_organizations.metadata->>legacyOrganization": "eq.football-science-live",
    limit: "2",
  });
  if (!result.ok) throw new Error("Platform team lookup unavailable.");
  if (result.rows.length !== 1) return null;
  const team = teams.find(({ id, organizationId }) =>
    id === result.rows[0].id && organizationId === result.rows[0].organization_id
  );
  if (!team) return null;

  const roles = memberships.filter((member) => membershipCoversTeam(member, team)).map((member) => normalizeRole(member.role));
  return {
    actor: { id: actor.id, role: roles.find((role) => hasModulePermission({ role }, moduleId, action)) || roles[0] },
    organizationId: team.organizationId,
    teamId: team.id,
    canEdit: roles.some((role) => hasModulePermission({ role }, moduleId, "write")),
  };
}

async function readStorageSnapshot(key) {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) throw new Error("Central Performance sources unavailable.");
  const response = await fetch(`${url}/storage/v1/object/footballscience-app-state/global/${encodeURIComponent(key)}.json`, {
    headers: { ...buildSupabaseKeyHeaders(serviceRoleKey), "Cache-Control": "no-cache, no-store" },
    signal: AbortSignal.timeout(8000),
  });
  return { ok: response.ok, status: response.status, payload: await response.text() };
}

async function readSnapshot(key) {
  // Use the shared fail-closed reader so database tombstones never resurrect Storage data.
  return readBackupStateEntry(key, readStorageSnapshot);
}

function uniqueById(items) {
  const counts = new Map();
  for (const item of items) counts.set(item?.id, (counts.get(item?.id) ?? 0) + 1);
  return items.filter((item) => typeof item?.id === "string" && item.id.trim() && counts.get(item.id) === 1);
}

async function readPerformanceSources(week, end, readState = readSnapshot) {
  const [squadEntry, scheduleEntry] = await Promise.all([readState(squadKey), readState(scheduleKey)]);
  const squad = squadEntry && !squadEntry.removed ? JSON.parse(squadEntry.value) : null;
  const schedule = scheduleEntry && !scheduleEntry.removed ? JSON.parse(scheduleEntry.value) : null;
  if (!Array.isArray(squad?.players) || !Array.isArray(schedule?.events)) {
    throw new Error("Central Performance sources are incomplete.");
  }

  const removed = new Set(squad.removedPlayerIds || squad.deletedPlayerIds || squad.removedIds || []);
  const players = uniqueById(squad.players).filter(({ id, archivedAt, deletedAt }) =>
    id.length <= 193 && !removed.has(id) && !archivedAt && !deletedAt
  );
  const playerKeys = players.map(({ id }) => `player:${id}`);
  const roleKeys = players.map(({ position, roleGroup }) => position || roleGroup)
    .filter((role) => typeof role === "string" && role.trim() && role.length <= 195)
    .map((role) => `role:${role}`);
  const activityIds = uniqueById(schedule.events)
    .filter(({ id, date, type, archivedAt, deletedAt }) =>
      id.length <= 180 && activityTypes.has(type) && typeof date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= week && date < end && !archivedAt && !deletedAt
    ).map(({ id }) => id);

  return { subjectKeys: new Set(["team", ...playerKeys, ...roleKeys]), activityIds: new Set(activityIds) };
}

module.exports = { resolvePerformanceTeam, readPerformanceSources };
