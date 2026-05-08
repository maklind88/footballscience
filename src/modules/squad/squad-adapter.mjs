import { createReadOnlyStorageAdapter, storageAdapterKinds } from "../../core/storage-adapters.mjs";
import {
  createSquadCounts,
  findSquadPlayerById,
  normalizeSquadState,
  selectRecentlyUpdatedSquadPlayers,
  selectSquadPlayerPage,
  squadStorageKey,
} from "./players.mjs";

function assertReadableAdapter(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.read !== "function") {
    throw new TypeError("Squad adapter requires a readable storage adapter.");
  }
}

export function createSquadReadAdapter(storageAdapter, defaultOptions = {}) {
  assertReadableAdapter(storageAdapter);

  return Object.freeze({
    storageKey: squadStorageKey,
    kind: storageAdapter.kind || storageAdapterKinds.legacyAppState,
    async readState(options = {}) {
      const rawValue = await storageAdapter.read(squadStorageKey);
      return normalizeSquadState(rawValue, { ...defaultOptions, ...options });
    },
    async readPlayers(options = {}) {
      const state = await this.readState(options);
      return state.players;
    },
    async readPlayerPage(options = {}) {
      const players = await this.readPlayers(options);
      return selectSquadPlayerPage(players, options);
    },
    async readPlayerById(playerId, options = {}) {
      const players = await this.readPlayers(options);
      return findSquadPlayerById(players, playerId);
    },
    async readCounts(options = {}) {
      const players = await this.readPlayers(options);
      return createSquadCounts(players);
    },
    async readRecentlyUpdated(options = {}) {
      const players = await this.readPlayers(options);
      return selectRecentlyUpdatedSquadPlayers(players, options.limit);
    },
    async writePlayer() {
      throw new Error("Squad adapter is read-only until migration is explicitly enabled.");
    },
    async importPlayers() {
      throw new Error("Squad adapter is read-only until migration is explicitly enabled.");
    },
    async removePlayer() {
      throw new Error("Squad adapter is read-only until migration is explicitly enabled.");
    },
  });
}

export function createSquadLegacyReadAdapter({ read }, options = {}) {
  return createSquadReadAdapter(
    createReadOnlyStorageAdapter({
      kind: storageAdapterKinds.legacyAppState,
      read,
    }),
    options
  );
}
