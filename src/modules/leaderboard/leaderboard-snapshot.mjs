import {
  formatLeaderboardMonth,
  getLeaderboardMonthValue,
  normalizeLeaderboardText,
} from "./leaderboard-helpers.mjs";
import { getLeaderboardRankedStandings } from "./leaderboard-selectors.mjs";
import { resolveLeaderboardProfilePhoto } from "./leaderboard-ui-helpers.mjs";

export function getLeaderboardCurrentMonthSnapshot(state = {}, context = {}) {
  const month = getLeaderboardMonthValue(context.getNow?.() || new Date());
  const cached = state.monthCache?.[month];
  if (cached) {
    return {
      month,
      status: cached.status || "idle",
      data: cached.data || null,
      error: cached.error || "",
    };
  }
  if (state.month === month) {
    return {
      month,
      status: state.status || "idle",
      data: state.data || null,
      error: state.requestError || "",
    };
  }
  return { month, status: "idle", data: null, error: "" };
}

export function createLeaderboardPresentationSnapshot(state = {}, context = {}) {
  const current = getLeaderboardCurrentMonthSnapshot(state, context);
  const standings = current.status === "ready"
    ? getLeaderboardRankedStandings(current.data || {}, context).map((row) => Object.freeze({
        playerId: normalizeLeaderboardText(row.playerId, 120),
        name: normalizeLeaderboardText(row.name, 120) || "Player",
        number: normalizeLeaderboardText(row.number, 16),
        position: normalizeLeaderboardText(row.position, 80),
        photoUrl: resolveLeaderboardProfilePhoto(row, context),
        points: Number(row.points) || 0,
        rank: Number(row.rank) || 0,
        awardCount: Number(row.awardCount) || 0,
      }))
    : [];

  return Object.freeze({
    status: current.status,
    month: current.month,
    monthLabel: formatLeaderboardMonth(current.month),
    teamName: normalizeLeaderboardText(context.teamName || context.team?.name, 120) || "Team",
    teamLogoUrl: normalizeLeaderboardText(context.teamLogoUrl || context.team?.logoUrl, 1800),
    requestError: normalizeLeaderboardText(current.error, 240),
    standings: Object.freeze(standings),
  });
}
