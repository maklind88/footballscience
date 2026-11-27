const { getModulePermissionContract, hasModulePermission } = require("../../src/core/permission-matrix.cjs");
const { resolvePlatformActorScope } = require("./platform-identity.js");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeGameModelUuid(value) {
  return typeof value === "string" && uuidPattern.test(value.trim()) ? value.trim().toLowerCase() : "";
}

function failure(status, reason) {
  return { ok: false, status, reason };
}

function coversTeam(membership, team) {
  if (membership.status !== "active" || membership.organizationId !== team.organizationId) return false;
  if (membership.scope === "team") return membership.teamId === team.id;
  if (membership.scope === "club") return Boolean(team.clubId && membership.clubId === team.clubId);
  return membership.scope === "organization";
}

function selectTeam(teams, memberships, explicitTeamId, primaryTeamId) {
  const eligibleTeams = teams.filter((team) => team.status === "active" && normalizeGameModelUuid(team.id)
    && memberships.some((membership) => coversTeam(membership, team)));
  if (explicitTeamId) return eligibleTeams.find((team) => team.id === explicitTeamId);
  const primaryTeam = eligibleTeams.find((team) => team.id === primaryTeamId);
  if (primaryTeam) return primaryTeam;
  const directTeams = eligibleTeams.filter((team) => memberships.some((membership) => membership.scope === "team"
    && coversTeam(membership, team)));
  return directTeams.length === 1 ? directTeams[0] : undefined;
}

// Resolve a fresh canonical scope for an already authenticated actor. Catalog
// access helpers accept this successful result, never a raw request team ID.
async function resolveGameModelScope(actor, requestedTeamId, options = {}) {
  const actorId = normalizeGameModelUuid(actor?.id);
  if (!actorId) return failure(401, "You must be signed in.");
  const teamId = normalizeGameModelUuid(requestedTeamId);
  if (requestedTeamId !== undefined && requestedTeamId !== null && requestedTeamId !== "" && !teamId) {
    return failure(400, "Choose a valid team.");
  }
  const resolve = options.resolvePlatformActorScope || resolvePlatformActorScope;
  const result = await resolve(actor, { ...options, requestedTeamId: teamId });
  if (!result.ok) return failure(result.status >= 500 ? 503 : 403, "Team access could not be verified.");
  if (normalizeGameModelUuid(result.actor?.id) !== actorId || result.actor.status !== "active"
    || (result.actor.profile?.status && result.actor.profile.status !== "active")) {
    return failure(403, "An active staff account is required.");
  }

  const staffRoles = getModulePermissionContract("game-model")?.permissions.read || [];
  const memberships = (result.scope?.memberships || []).filter((entry) => staffRoles.includes(entry.role));
  const team = selectTeam(result.scope?.teams || [], memberships, teamId, result.actor.profile?.primaryTeamId);
  if (!team || !normalizeGameModelUuid(team.organizationId)) {
    return teamId || !memberships.length
      ? failure(403, "Active staff membership for this team is required.")
      : failure(409, "Select an active team to open Game Model.");
  }
  const role = staffRoles.find((candidate) => memberships.some((entry) => candidate === entry.role && coversTeam(entry, team)));
  const scopedActor = { id: actorId, role };
  return {
    ok: true,
    teamId: team.id,
    organizationId: team.organizationId,
    actor: scopedActor,
    canEdit: hasModulePermission(scopedActor, "game-model", "write"),
  };
}

module.exports = { normalizeGameModelUuid, resolveGameModelScope };
