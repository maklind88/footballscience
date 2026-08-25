import { normalizeLeaderboardText } from "./leaderboard-helpers.mjs";

function firstValue(source = {}, keys = [], fallback = "") {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return fallback;
}

function isArchivedPlayer(player = {}) {
  const status = normalizeLeaderboardText(firstValue(player, ["rosterStatus", "roster_status"], ""), 40).toLowerCase();
  return Boolean(player.archived || player.isArchived || player.archivedAt || player.archived_at || status === "archived");
}

export function readLeaderboardSquadPlayers(data = {}, options = {}) {
  const players = Array.isArray(data?.roster) ? data.roster : [];
  return players
    .map((player) => ({
      id: normalizeLeaderboardText(firstValue(player, ["playerId", "player_id", "id"]), 180),
      name: normalizeLeaderboardText(firstValue(player, ["name", "displayName", "display_name"], "Player"), 120),
      number: normalizeLeaderboardText(firstValue(player, ["number", "shirtNumber", "shirt_number"]), 16),
      position: normalizeLeaderboardText(firstValue(player, ["position", "primaryRole", "primary_role"]), 80),
      photoUrl: normalizeLeaderboardText(firstValue(player, ["photoUrl", "photo_url", "imageUrl", "avatarUrl"]), 1800),
      archived: isArchivedPlayer(player),
      countsInSquad: player.countsInSquad !== false && player.counts_in_squad !== false,
    }))
    .filter((player) => player.id && player.countsInSquad && (options.includeArchived || !player.archived))
    .sort((first, second) => first.name.localeCompare(second.name, "en", { sensitivity: "base" }));
}

export function createLeaderboardSquadAdapter(data = {}) {
  return Object.freeze({
    listPlayers(options = {}) {
      return readLeaderboardSquadPlayers(data, options);
    },
  });
}
