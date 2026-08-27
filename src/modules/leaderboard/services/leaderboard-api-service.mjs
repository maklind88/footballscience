import { leaderboardApiPath } from "../leaderboard-constants.mjs";
import { normalizeLeaderboardMonth, normalizeLeaderboardTeamId } from "../leaderboard-helpers.mjs";

const platformIdentityApiPath = "/api/platform-identity";

async function parseLeaderboardResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { reason: text };
  }
}

function normalizeStatus(value = "active") {
  return String(value || "active").trim().toLowerCase();
}

function identityTeams(identity = {}) {
  return (Array.isArray(identity?.scope?.teams) ? identity.scope.teams : [])
    .map((team) => ({
      ...team,
      id: normalizeLeaderboardTeamId(team?.id),
      clubId: String(team?.clubId || "").trim(),
      organizationId: String(team?.organizationId || "").trim(),
      status: normalizeStatus(team?.status),
    }))
    .filter((team) => team.id && team.status === "active");
}

function identityMemberships(identity = {}) {
  return (Array.isArray(identity?.scope?.memberships) ? identity.scope.memberships : [])
    .filter((membership) => normalizeStatus(membership?.status) === "active");
}

function membershipCoversTeam(membership = {}, team = {}) {
  const scope = String(membership?.scope || "").trim().toLowerCase();
  if (scope === "team") return normalizeLeaderboardTeamId(membership?.teamId) === team.id;
  if (scope === "club") return Boolean(team.clubId && String(membership?.clubId || "").trim() === team.clubId);
  if (scope === "organization") {
    return Boolean(team.organizationId && String(membership?.organizationId || "").trim() === team.organizationId);
  }
  return false;
}

export function resolveLeaderboardTeamIdFromIdentity(identity = {}) {
  const teams = identityTeams(identity);
  const memberships = identityMemberships(identity);
  const coveredTeams = teams.filter((team) => memberships.some((membership) => membershipCoversTeam(membership, team)));
  const coveredIds = new Set(coveredTeams.map((team) => team.id));
  const preferredIds = [
    identity?.actor?.profile?.primaryTeamId,
    identity?.scope?.primary?.teamId,
    identity?.scope?.primary?.team?.id,
  ].map(normalizeLeaderboardTeamId).filter(Boolean);
  const preferred = preferredIds.find((teamId) => coveredIds.has(teamId));
  if (preferred) return preferred;
  return coveredTeams.map((team) => team.id).sort()[0] || "";
}

export function createLeaderboardApiService(context = {}) {
  const getAuthToken = typeof context.getAuthToken === "function" ? context.getAuthToken : () => "";
  const getAbortSignal = typeof context.getLeaderboardAbortSignal === "function" ? context.getLeaderboardAbortSignal : () => undefined;
  const fetchImpl = context.fetchImpl || globalThis.fetch;
  let resolvedTeamId = "";
  let teamScopePromise = null;

  function getConfiguredTeamId() {
    return normalizeLeaderboardTeamId(context.teamId)
      || normalizeLeaderboardTeamId(context.team?.id)
      || normalizeLeaderboardTeamId(context.currentUser?.teamId)
      || normalizeLeaderboardTeamId(context.currentUser?.team_id);
  }

  async function resolveTeamId() {
    const configured = getConfiguredTeamId();
    if (configured) {
      resolvedTeamId = configured;
      return configured;
    }
    if (resolvedTeamId) return resolvedTeamId;
    if (!teamScopePromise) {
      teamScopePromise = (async () => {
        if (typeof fetchImpl !== "function") throw new Error("Leaderboard network service is unavailable.");
        const token = await getAuthToken();
        if (!token) throw new Error("Leaderboard team scope requires authentication.");
        const response = await fetchImpl(platformIdentityApiPath, {
          method: "GET",
          signal: getAbortSignal(),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const identity = await parseLeaderboardResponse(response);
        if (!response.ok || identity?.ok === false) {
          const error = new Error(identity?.reason || identity?.error || `Platform identity request failed (${response.status}).`);
          error.status = response.status;
          error.payload = identity;
          throw error;
        }
        const teamId = resolveLeaderboardTeamIdFromIdentity(identity);
        if (!teamId) throw new Error("No active Leaderboard team is available for this account.");
        resolvedTeamId = teamId;
        return teamId;
      })().catch((error) => {
        teamScopePromise = null;
        throw error;
      });
    }
    return teamScopePromise;
  }

  async function request(path, options = {}) {
    if (typeof fetchImpl !== "function") throw new Error("Leaderboard network service is unavailable.");
    const token = await getAuthToken();
    const response = await fetchImpl(path, {
      method: options.method || "GET",
      signal: options.signal || getAbortSignal(),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await parseLeaderboardResponse(response);
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.reason || payload?.error || `Leaderboard request failed (${response.status}).`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload || {};
  }

  return Object.freeze({
    async loadMonth(month, options = {}) {
      const safeMonth = normalizeLeaderboardMonth(month);
      if (!safeMonth) throw new Error("A valid leaderboard month is required.");
      const teamId = await resolveTeamId();
      const params = new URLSearchParams({ month: safeMonth, teamId });
      return request(`${leaderboardApiPath}?${params.toString()}`, { signal: options.signal });
    },
    async award(payload) {
      const teamId = await resolveTeamId();
      return request(leaderboardApiPath, { method: "POST", body: { ...payload, action: "award", teamId } });
    },
    async reverseEvent(payload) {
      const teamId = await resolveTeamId();
      return request(leaderboardApiPath, { method: "POST", body: { ...payload, action: "reverse-event", teamId } });
    },
  });
}
