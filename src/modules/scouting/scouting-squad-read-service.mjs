import { normalizeSquadState, squadStorageKey } from "../squad/players.mjs";

export { squadStorageKey as scoutingSquadStorageKey };

export function readScoutingSquadPlayers(rawValue, options = {}) {
  const state = normalizeSquadState(rawValue, options);
  return state.players
    .filter((player) => player.countsInSquad !== false)
    .map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position || player.primaryRole,
      bestRole: player.primaryRole || player.position,
      secondaryRoles: player.secondaryRoles,
      roleGroup: player.roleGroup,
      team: "Current squad",
      age: player.age ? Number(player.age) : null,
      rating: null,
      status: player.status,
      squadStatus: player.squadStatus,
      rosterType: player.rosterType,
    }));
}
