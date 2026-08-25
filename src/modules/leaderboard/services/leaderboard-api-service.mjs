import { leaderboardApiPath } from "../leaderboard-constants.mjs";
import { normalizeLeaderboardMonth, normalizeLeaderboardTeamId } from "../leaderboard-helpers.mjs";

async function parseLeaderboardResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { reason: text };
  }
}

export function createLeaderboardApiService(context = {}) {
  const getAuthToken = typeof context.getAuthToken === "function" ? context.getAuthToken : () => "";
  const getAbortSignal = typeof context.getLeaderboardAbortSignal === "function" ? context.getLeaderboardAbortSignal : () => undefined;
  const fetchImpl = context.fetchImpl || globalThis.fetch;

  function getTeamId() {
    return normalizeLeaderboardTeamId(context.teamId) || normalizeLeaderboardTeamId(context.team?.id);
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
    loadMonth(month, options = {}) {
      const safeMonth = normalizeLeaderboardMonth(month);
      if (!safeMonth) return Promise.reject(new Error("A valid leaderboard month is required."));
      const teamId = getTeamId();
      const params = new URLSearchParams({ month: safeMonth });
      if (teamId) params.set("teamId", teamId);
      return request(`${leaderboardApiPath}?${params.toString()}`, { signal: options.signal });
    },
    award(payload) {
      const teamId = getTeamId();
      return request(leaderboardApiPath, { method: "POST", body: { ...payload, action: "award", ...(teamId ? { teamId } : {}) } });
    },
    reverseEvent(payload) {
      const teamId = getTeamId();
      return request(leaderboardApiPath, { method: "POST", body: { ...payload, action: "reverse-event", ...(teamId ? { teamId } : {}) } });
    },
  });
}
