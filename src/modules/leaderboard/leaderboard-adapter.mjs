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

function normalizeAvailabilityByDate(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([date, availability]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !availability || typeof availability !== "object") return [];
    const participation = Math.max(0, Math.min(100, Number(availability.participation) || 0));
    const eligibility = ["available", "limited", "unavailable", "unknown"].includes(availability.eligibility)
      ? availability.eligibility
      : "unknown";
    return [[date, {
      status: normalizeLeaderboardText(availability.status, 40).toLowerCase() || "unknown",
      participation,
      eligibility,
      source: normalizeLeaderboardText(availability.source, 60),
    }]];
  }));
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
      availabilityStatus: normalizeLeaderboardText(firstValue(player, ["availabilityStatus", "availability_status"], "unknown"), 40).toLowerCase(),
      availabilityByDate: normalizeAvailabilityByDate(firstValue(player, ["availabilityByDate", "availability_by_date"], {})),
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
