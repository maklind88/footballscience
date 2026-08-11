function normalizeName(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function getSetPiecePlayerName(player = {}) {
  const directName = normalizeName(player.name || player.displayName || player.display_name);
  if (directName) return directName;
  return normalizeName([player.firstName || player.first_name, player.lastName || player.last_name].filter(Boolean).join(" "));
}

export function getSetPiecePlayerInitials(player = {}) {
  const words = getSetPiecePlayerName(player).split(/\s+/).filter(Boolean);
  if (!words.length) return "P";
  return `${words[0][0] || ""}${words.length > 1 ? words.at(-1)?.[0] || "" : ""}`.toUpperCase();
}

function getLabelCandidates(player = {}) {
  const words = getSetPiecePlayerName(player).split(/\s+/).filter(Boolean);
  const first = words[0] || "Player";
  const last = words.length > 1 ? words.at(-1) : "";
  const base = getSetPiecePlayerInitials(player);
  return [...new Set([
    base,
    `${first.slice(0, 1)}${last.slice(0, 2)}`,
    `${first.slice(0, 2)}${last.slice(0, 1)}`,
    `${first.slice(0, 1)}${last.slice(0, 3)}`,
    `${first.slice(0, 3)}${last.slice(0, 1)}`,
    first.slice(0, 3),
  ].map((candidate) => candidate.replace(/[^a-z0-9]/gi, "").toUpperCase()).filter(Boolean))];
}

export function createSetPiecePlayerLabelMap(players = []) {
  const normalizedPlayers = Array.isArray(players) ? players.filter((player) => player?.id) : [];
  const baseCounts = normalizedPlayers.reduce((counts, player) => {
    const base = getSetPiecePlayerInitials(player);
    counts.set(base, (counts.get(base) || 0) + 1);
    return counts;
  }, new Map());
  const used = new Set();
  return normalizedPlayers.reduce((labels, player, index) => {
    const base = getSetPiecePlayerInitials(player);
    const label = getLabelCandidates(player).find((candidate) => {
      if (candidate === base && (baseCounts.get(base) || 0) > 1) return false;
      return !used.has(candidate);
    }) || `${base}${index + 1}`;
    used.add(label);
    labels.set(String(player.id), label);
    return labels;
  }, new Map());
}

export function getSetPieceRosterPlayers(playerProfilesState = {}) {
  const players = Array.isArray(playerProfilesState?.players) ? playerProfilesState.players : [];
  return players
    .filter((player) => player?.id && !player.archivedAt && !player.removedAt)
    .map((player) => ({
      id: String(player.id),
      name: getSetPiecePlayerName(player) || "Player",
      position: String(player.position || player.primaryPosition || player.role || "").trim(),
      player,
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
}
