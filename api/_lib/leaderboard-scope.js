const { LEADERBOARD_TIMEZONE, isUuid, normalizeText } = require("./leaderboard-contract.js");

const ROLE_ORDER = Object.freeze({
  admin: 1,
  "club-admin": 2,
  "team-admin": 3,
  coach: 4,
  scout: 5,
  analyst: 6,
  performance: 7,
  medical: 8,
  guest: 9,
});

function failure(reason, status = 403) {
  return { ok: false, status, reason };
}

function teamById(scope = {}, teamId = "") {
  return (scope.scope?.teams || []).find((team) => team.id === teamId) || null;
}

function membershipCoversTeam(membership = {}, team = {}) {
  if (membership.status !== "active" || !team?.id) return false;
  if (membership.scope === "team") return membership.teamId === team.id;
  if (membership.scope === "club") return Boolean(team.clubId && membership.clubId === team.clubId);
  if (membership.scope === "organization") return membership.organizationId === team.organizationId;
  return false;
}

function selectTargetTeam(scope = {}, requestedTeamId = "") {
  const memberships = scope.scope?.memberships || [];
  if (requestedTeamId) {
    if (!isUuid(requestedTeamId)) return null;
    const requestedTeam = teamById(scope, requestedTeamId);
    return requestedTeam?.status === "active" && memberships.some((row) => membershipCoversTeam(row, requestedTeam))
      ? requestedTeam
      : null;
  }
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  if (!activeMemberships.length || activeMemberships.some((membership) => membership.scope !== "team")) return null;
  const directTeamIds = Array.from(new Set(memberships
    .filter((membership) => membership.scope === "team" && membership.status === "active")
    .map((membership) => membership.teamId)
    .filter(isUuid)));
  if (directTeamIds.length !== 1) return null;
  const directTeam = teamById(scope, directTeamIds[0]);
  return directTeam?.status === "active" ? directTeam : null;
}

function selectEffectiveRole(memberships = []) {
  const membershipRoles = memberships
    .map((membership) => normalizeText(membership.role, 40).toLowerCase())
    .filter((role) => ROLE_ORDER[role]);
  return membershipRoles.sort((left, right) => ROLE_ORDER[left] - ROLE_ORDER[right])[0] || "";
}

function resolveLeaderboardActorContext(platformScope = {}, requestedTeamId = "") {
  if (!platformScope.ok || !isUuid(platformScope.actor?.id)) {
    return failure(platformScope.reason || "Authenticated platform scope is required.", platformScope.status || 401);
  }
  if (platformScope.actor.status !== "active") {
    return failure("Your platform account is not active.");
  }
  const explicitTeamId = normalizeText(requestedTeamId, 80).toLowerCase();
  const team = selectTargetTeam(platformScope, explicitTeamId);
  if (!team) {
    return explicitTeamId
      ? failure("Active membership for the requested Leaderboard team is required.", 403)
      : failure("No unambiguous active team membership is available for Leaderboard.", 409);
  }
  const memberships = (platformScope.scope?.memberships || []).filter((membership) => membershipCoversTeam(membership, team));
  const role = selectEffectiveRole(memberships);
  if (!role) return failure("Active team membership is required for Leaderboard.");
  if (!isUuid(team.organizationId) || !isUuid(team.id)) {
    return failure("Platform team scope is incomplete.", 409);
  }
  return {
    ok: true,
    actor: { id: platformScope.actor.id, role },
    tenant: {
      organizationId: team.organizationId,
      clubId: isUuid(team.clubId) ? team.clubId : null,
      teamId: team.id,
      timezone: LEADERBOARD_TIMEZONE,
    },
  };
}

module.exports = {
  membershipCoversTeam,
  resolveLeaderboardActorContext,
  selectTargetTeam,
};
