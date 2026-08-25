import { leaderboardPlacementPoints } from "./leaderboard-constants.mjs";
import { readLeaderboardSquadPlayers } from "./leaderboard-adapter.mjs";
import {
  getLeaderboardMonthValue,
  getLeaderboardTodayValue,
  normalizeLeaderboardMonth,
  normalizeLeaderboardPoints,
  normalizeLeaderboardText,
} from "./leaderboard-helpers.mjs";

function firstValue(source = {}, keys = [], fallback = "") {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return fallback;
}

export function getLeaderboardSquadPlayers(data = {}, options = {}) {
  return readLeaderboardSquadPlayers(data, options);
}

function normalizeStanding(row = {}, player = null) {
  return {
    playerId: normalizeLeaderboardText(firstValue(row, ["playerId", "player_id", "id"]), 120),
    name: player?.name || normalizeLeaderboardText(firstValue(row, ["playerName", "player_name", "displayName", "display_name", "name"], "Former squad player"), 120),
    number: player?.number || normalizeLeaderboardText(firstValue(row, ["number", "shirtNumber", "shirt_number"]), 16),
    position: player?.position || normalizeLeaderboardText(firstValue(row, ["position", "primaryRole", "primary_role"]), 80),
    photoUrl: player?.photoUrl || normalizeLeaderboardText(firstValue(row, ["photoUrl", "photo_url", "avatarUrl"]), 1800),
    points: normalizeLeaderboardPoints(firstValue(row, ["points", "totalPoints", "total_points"]), 0),
    rank: normalizeLeaderboardPoints(firstValue(row, ["rank", "place", "positionRank", "position_rank"]), 0),
    awardCount: normalizeLeaderboardPoints(firstValue(row, ["awardCount", "award_count", "eventCount", "event_count"]), 0),
    lastScoredOn: normalizeLeaderboardText(firstValue(row, ["lastScoredOn", "last_scored_on", "lastAwardOn", "last_award_on", "lastAwardedOn"]), 32),
    archived: !player || Boolean(player.archived),
  };
}

export function getLeaderboardStandings(data = {}, context = {}) {
  const currentPlayers = getLeaderboardSquadPlayers(data, { includeArchived: true });
  const currentById = new Map(currentPlayers.map((player) => [player.id, player]));
  const rawRows = Array.isArray(data?.standings) ? data.standings : [];
  const rows = rawRows
    .map((row) => normalizeStanding(row, currentById.get(String(firstValue(row, ["playerId", "player_id", "id"]))) || null))
    .filter((row) => row.playerId);
  let previousPoints = null;
  let calculatedRank = 0;
  return rows
    .sort((first, second) => second.points - first.points || first.name.localeCompare(second.name))
    .map((row, index) => {
      if (previousPoints !== row.points) calculatedRank = index + 1;
      previousPoints = row.points;
      return { ...row, rank: row.rank > 0 ? row.rank : calculatedRank };
    });
}

export function getLeaderboardRankedStandings(data = {}, context = {}, searchQuery = "") {
  const query = normalizeLeaderboardText(searchQuery, 120).toLowerCase();
  return getLeaderboardStandings(data, context).filter((row) => {
    if (row.points <= 0) return false;
    return !query || `${row.name} ${row.number} ${row.position}`.toLowerCase().includes(query);
  });
}

export function getLeaderboardZeroPointPlayers(data = {}, context = {}, searchQuery = "") {
  const query = normalizeLeaderboardText(searchQuery, 120).toLowerCase();
  const standingById = new Map(getLeaderboardStandings(data, context).map((row) => [row.playerId, row]));
  return getLeaderboardSquadPlayers(data)
    .map((player) => standingById.get(player.id) || { ...player, playerId: player.id, points: 0, rank: 0, awardCount: 0 })
    .filter((row) => row.points <= 0)
    .filter((row) => !query || `${row.name} ${row.number} ${row.position}`.toLowerCase().includes(query));
}

export function getLeaderboardPlayer(data = {}, context = {}, playerId = "") {
  return getLeaderboardStandings(data, context).find((row) => row.playerId === playerId)
    || getLeaderboardZeroPointPlayers(data, context).find((row) => row.playerId === playerId)
    || null;
}

export function normalizeLeaderboardEvent(event = {}) {
  const awards = Array.isArray(event.awards) ? event.awards : [];
  return {
    id: normalizeLeaderboardText(firstValue(event, ["id", "eventId", "event_id"]), 120),
    occurredOn: normalizeLeaderboardText(firstValue(event, ["occurredOn", "occurred_on", "date"]), 32),
    title: normalizeLeaderboardText(firstValue(event, ["title", "name"], "Points awarded"), 160),
    note: normalizeLeaderboardText(event.note, 600),
    createdByName: normalizeLeaderboardText(firstValue(event, ["createdByName", "created_by_name", "awardedByName"], "Team staff"), 120),
    createdAt: normalizeLeaderboardText(firstValue(event, ["createdAt", "created_at"]), 48),
    reversedAt: normalizeLeaderboardText(firstValue(event, ["reversedAt", "reversed_at"]), 48),
    reverseReason: normalizeLeaderboardText(firstValue(event, ["reverseReason", "reverse_reason", "reversalReason", "reversal_reason"]), 240),
    points: normalizeLeaderboardPoints(firstValue(event, ["points", "totalPoints", "total_points"]), 0),
    awards: awards.map((award) => ({
      playerId: normalizeLeaderboardText(firstValue(award, ["playerId", "player_id"]), 120),
      playerName: normalizeLeaderboardText(firstValue(award, ["playerName", "player_name", "displayName", "display_name", "name"], "Player"), 120),
      points: normalizeLeaderboardPoints(award.points, 0),
      placement: normalizeLeaderboardPoints(award.placement, 0),
    })).filter((award) => award.playerId || award.playerName),
  };
}

export function getLeaderboardEvents(data = {}) {
  return (Array.isArray(data?.events) ? data.events : [])
    .map(normalizeLeaderboardEvent)
    .filter((event) => event.id)
    .sort((first, second) => `${second.occurredOn} ${second.createdAt}`.localeCompare(`${first.occurredOn} ${first.createdAt}`));
}

export function getLeaderboardPlayerEvents(data = {}, playerId = "") {
  return getLeaderboardEvents(data).filter((event) => event.awards.some((award) => award.playerId === playerId));
}

export function getLeaderboardSummary(data = {}, context = {}) {
  const rows = getLeaderboardStandings(data, context).filter((row) => row.points > 0);
  const events = getLeaderboardEvents(data).filter((event) => !event.reversedAt);
  const supplied = data?.summary || {};
  const totalPoints = rows.reduce((total, row) => total + row.points, 0);
  const gap = rows.length > 1 ? Math.max(0, rows[0].points - rows[1].points) : null;
  return {
    eventCount: normalizeLeaderboardPoints(firstValue(supplied, ["eventCount", "event_count"], events.length), events.length),
    totalPoints: normalizeLeaderboardPoints(firstValue(supplied, ["totalPoints", "total_points"], totalPoints), totalPoints),
    scoredPlayerCount: normalizeLeaderboardPoints(firstValue(supplied, ["scoredPlayerCount", "scored_player_count"], rows.length), rows.length),
    leaderGap: firstValue(supplied, ["leaderGap", "leader_gap"], gap),
  };
}

export function getLeaderboardDraftAwards(draft = {}) {
  const assignments = draft.assignments && typeof draft.assignments === "object" ? draft.assignments : {};
  const samePoints = draft.customPoints !== ""
    ? normalizeLeaderboardPoints(draft.customPoints, 0)
    : normalizeLeaderboardPoints(draft.samePoints, 0);
  return Object.entries(assignments).flatMap(([playerId, assignment]) => {
    if (draft.mode === "same") {
      if (!assignment?.selected || samePoints <= 0) return [];
      return [{ playerId, points: samePoints, placement: null }];
    }
    const placement = normalizeLeaderboardPoints(assignment?.placement, 0);
    const points = leaderboardPlacementPoints[placement] || 0;
    return placement && points ? [{ playerId, points, placement }] : [];
  });
}

export function getLeaderboardDraftTotal(draft = {}) {
  return getLeaderboardDraftAwards(draft).reduce((total, award) => total + award.points, 0);
}

export function getLeaderboardMonthBounds(monthValue, now = new Date()) {
  const month = normalizeLeaderboardMonth(monthValue, getLeaderboardMonthValue(now));
  const [year, monthNumber] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const today = getLeaderboardTodayValue(now);
  return { min: first, max: month === today.slice(0, 7) ? today : monthEnd };
}

export function isLeaderboardCurrentMonth(monthValue, now = new Date()) {
  return normalizeLeaderboardMonth(monthValue) === getLeaderboardMonthValue(now);
}
