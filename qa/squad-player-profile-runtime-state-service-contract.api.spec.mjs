import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlayerProfileRuntimeStateService } from "../src/modules/squad/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    value: (key) => map.get(key) ?? null,
  };
}

function normalizeProfile(player = {}) {
  const name = String(player.name || player.displayName || "").trim();
  const id = String(player.id || player.playerId || player.profileId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();
  if (!id || !name) return null;
  const rosterType = String(player.rosterType || "squad").trim();
  const countsInSquad = typeof player.countsInSquad === "boolean" ? player.countsInSquad : rosterType === "squad";
  return {
    ...player,
    id,
    name,
    primaryRole: player.primaryRole || "CB",
    roleGroup: player.roleGroup || "defender",
    rosterType,
    countsInSquad,
  };
}

function normalizeChangeLogEntry(entry = {}) {
  return {
    id: String(entry.id || "").trim(),
    type: String(entry.type || "").trim(),
    playerId: String(entry.playerId || "").trim(),
    playerName: String(entry.playerName || "").trim(),
    actor: String(entry.actor || "").trim(),
    summary: String(entry.summary || "").trim(),
    changes: Array.isArray(entry.changes) ? entry.changes : [],
    createdAt: String(entry.createdAt || "").trim(),
  };
}

function createHarness(options = {}) {
  const playerProfilesStorageKey = "football-player-profiles-v1";
  const playerProfileAgeCacheStorageKey = "football-player-profile-age-cache-v1";
  const storage = createStorage(options.storage || {});
  const rawWrites = [];
  const renders = [];
  const logs = [];
  let nextId = 0;
  let playerProfilesState = options.playerProfilesState ?? null;
  let playerProfileAgeCacheState = options.ageCacheState ?? null;
  let medicalState = options.medicalState || { players: [] };
  let modalOpen = false;
  let newModalOpen = false;
  let ageHydrationPending = false;
  let ageHydrationLastFingerprint = "";
  let ageHydrationTimer = 0;
  let autosaveSignature = "";
  let flushes = 0;
  const timers = [];
  const playerProfileCountsInSquad = (player = {}) =>
    typeof player.countsInSquad === "boolean" ? player.countsInSquad : String(player.rosterType || "squad") === "squad";
  const service = createPlayerProfileRuntimeStateService({
    canCurrentUserEditWorkspace: () => options.canEdit !== false,
    comparePlayerProfiles: (first = {}, second = {}) => String(first.name || "").localeCompare(String(second.name || "")),
    createDashboardId: (prefix) => `${prefix}-${++nextId}`,
    defaultMedicalPlayers: options.defaultMedicalPlayers || [{ id: "seed-1", name: "Seed Player", position: "Defender" }],
    ensureMedicalState: () => medicalState,
    fetchFn: async () => ({
      ok: true,
      text: async () => JSON.stringify({ ok: true, players: [{ profileId: "p1", birthDate: "2001-02-03", age: "25", playerId: "db-p1" }] }),
    }),
    flushPlayerProfileAutosave: () => {
      flushes += 1;
    },
    getCurrentPlatformUser: () => options.currentUser ?? { firstName: "Mak", lastName: "Lind", email: "mak@example.com" },
    getDefaultPlayerProfileRole: () => "CB",
    getHubState: () => options.hubState || { activeWorkspaceId: "player-profiles" },
    getMedicalState: () => medicalState,
    getNow: () => "2026-05-31T11:14:00.000Z",
    getPlatformApiAccessToken: async () => "token-1",
    getPlatformStructureState: () => ({}),
    getPlatformTeamDisplayName: () => "North Carolina Courage",
    getPlatformTeamDisplayTeam: () => ({ id: "team-1", name: "North Carolina Courage", clubId: "club-1" }),
    getPlayerProfileAgeCacheKey: (player = {}) => String(player.id || player.name || "").trim(),
    getPlayerProfileAgeCacheState: () => playerProfileAgeCacheState,
    getPlayerProfileAgeHydrationLastFingerprint: () => ageHydrationLastFingerprint,
    getPlayerProfileAgeHydrationPending: () => ageHydrationPending,
    getPlayerProfileAgeHydrationTimer: () => ageHydrationTimer,
    getPlayerProfileAgeLookupSignature: (player = {}) => [player.id, player.name, player.number, player.position].map((value) => String(value || "")).join("|"),
    getPlayerProfileBirthDateValue: (player = {}) => String(player.birthDate || "").trim(),
    getPlayerProfileFormSignature: () => "form-signature",
    getPlayerProfileModalOpen: () => modalOpen,
    getPlayerProfileNewPlayerModalOpen: () => newModalOpen,
    getPlayerProfileRoleGroupForRole: () => "defender",
    getPlayerProfileRosterTypeOption: (key) => ({ key, label: key, shortLabel: key || "Guest" }),
    getPlayerProfileSyncIdentityKeys: (player = {}) => {
      const keys = [];
      const id = String(player.id || "").trim();
      const name = String(player.name || "").trim().toLowerCase();
      const number = String(player.number || "").trim().toLowerCase();
      if (id) keys.push(`id:${id}`);
      if (name) keys.push(`name:${name}|${number}`);
      return keys;
    },
    getPlayerProfilesState: () => playerProfilesState,
    getPlayerProfilesWorkspace: () => ({ querySelector: () => ({ id: "playerProfileEditForm" }) }),
    getSquadChangeSummary: (type, player, changes) => `${type}:${player?.name || "squad"}:${changes.length}`,
    getTemporaryRosterTypeFromPlayerSource: (player = {}) => String(player.rosterType || "guest").trim(),
    isCurrentPlatformUserAdmin: () => Boolean(options.admin),
    isMedicalItemArchived: (item = {}) => Boolean(item.archivedAt),
    isTemporaryPlayerProfile: (player = {}) => !playerProfileCountsInSquad(player),
    logEvent: (message) => logs.push(message),
    normalizePlayerProfile: normalizeProfile,
    normalizePlayerProfileAgeCacheEntry: (entry = {}) => ({
      signature: String(entry.signature || "").trim(),
      birthDate: String(entry.birthDate || "").trim(),
      age: String(entry.age || "").trim(),
      databasePlayerId: String(entry.databasePlayerId || entry.playerId || "").trim(),
      source: String(entry.source || "squad_players").trim(),
      checkedAt: String(entry.checkedAt || "").trim(),
      birthDateCheckedAt: String(entry.birthDateCheckedAt || "").trim(),
    }),
    normalizePlayerProfileAgeValue: (value) => String(value || "").trim(),
    normalizePlayerProfileBirthDate: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : ""),
    normalizePlayerProfileChangeLog: (entries = []) => (Array.isArray(entries) ? entries : []).map(normalizeChangeLogEntry),
    normalizePlayerProfileChangeLogEntry: normalizeChangeLogEntry,
    normalizePlayerProfileRemovedIds: (value = []) => Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))),
    playerProfileAgeCacheStorageKey,
    playerProfileCountsInSquad,
    playerProfilesDefaultRosterVersion: "player-profiles-test-roster",
    playerProfilesSchemaVersion: 3,
    playerProfilesStorageKey,
    rawDataSafetySetItem: (key, value) => {
      rawWrites.push({ key, value });
      storage.setItem(key, value);
    },
    renderPlayerProfilesRosterListOnly: () => renders.push("roster-list"),
    renderPlayerProfilesWorkspace: () => renders.push("workspace"),
    setPlayerProfileAgeCacheState: (nextState) => {
      playerProfileAgeCacheState = nextState;
    },
    setPlayerProfileAgeHydrationLastFingerprint: (nextValue) => {
      ageHydrationLastFingerprint = nextValue;
    },
    setPlayerProfileAgeHydrationPending: (nextValue) => {
      ageHydrationPending = Boolean(nextValue);
    },
    setPlayerProfileAgeHydrationTimer: (nextValue) => {
      ageHydrationTimer = nextValue;
    },
    setPlayerProfileAutosaveLastSignature: (nextValue) => {
      autosaveSignature = nextValue;
    },
    setPlayerProfileModalOpen: (nextValue) => {
      modalOpen = Boolean(nextValue);
    },
    setPlayerProfileNewPlayerModalOpen: (nextValue) => {
      newModalOpen = Boolean(nextValue);
    },
    setPlayerProfilesState: (nextState) => {
      playerProfilesState = nextState;
    },
    win: {
      localStorage: storage,
      clearTimeout: () => {},
      setTimeout: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      },
    },
  });
  return {
    getAgeCacheState: () => playerProfileAgeCacheState,
    getAutosaveSignature: () => autosaveSignature,
    getFlags: () => ({ modalOpen, newModalOpen, ageHydrationPending, ageHydrationLastFingerprint, ageHydrationTimer }),
    getFlushes: () => flushes,
    getMedicalState: () => medicalState,
    getState: () => playerProfilesState,
    logs,
    playerProfileAgeCacheStorageKey,
    playerProfilesStorageKey,
    rawWrites,
    renders,
    service,
    setMedicalState: (nextState) => {
      medicalState = nextState;
    },
    storage,
    timers,
  };
}

test("Squad player profile runtime state service owns state/cache/modal bodies outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const workspaceComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const facade = readProjectFile("src/modules/squad/player-profile-runtime-facade.mjs");
  const service = readProjectFile("src/modules/squad/player-profile-runtime-state-service.mjs");
  const index = readProjectFile("src/modules/squad/index.mjs");

  expect(typeof createPlayerProfileRuntimeStateService).toBe("function");
  expect(app).toContain("createWorkspaceRuntimeComposition({");
  expect(app).not.toContain("createPlayerProfileRuntimeFacade({");
  expect(workspaceComposer).toContain("createPlayerProfileRuntimeFacade({");
  expect(app).toContain('import * as playerProfileRuntimeAccessors from "./src/modules/squad/player-profile-runtime-accessors.mjs";');
  expect(app).toContain("readPlayerProfilesState,");
  expect(workspaceComposer).toContain("deps.configurePlayerProfileRuntimeAccessors(() => playerProfileRuntimeFacade);");
  expect(facade).toContain("createPlayerProfileRuntimeStateService({");
  expect(app).not.toContain("function readPlayerProfilesState() {\ntry {");
  expect(app).not.toContain("function readPlayerProfilesState(...args)");
  expect(app).not.toContain("function hydratePlayerProfileAgesOnce() {\nif (playerProfileAgeHydrationPending");
  expect(service).toContain("function readPlayerProfilesState()");
  expect(service).toContain("function hydratePlayerProfileAgesOnce()");
  expect(service).toContain("rawDataSafetySetItem");
  expect(service).not.toContain("createDashboardChat");
  expect(index).toContain('export * from "./player-profile-runtime-state-service.mjs";');
  expect(index).toContain('export * from "./player-profile-runtime-facade.mjs";');
});

test("Squad player profile runtime state service preserves clone/read/write behavior", () => {
  const storedState = {
    schemaVersion: 2,
    selectedPlayerId: "missing",
    removedPlayerIds: ["removed-1", "removed-1"],
    players: [
      { id: "p2", name: "Zoe Player", rosterType: "squad" },
      { id: "removed-1", name: "Removed Player", rosterType: "squad" },
    ],
  };
  const harness = createHarness({
    storage: { "football-player-profiles-v1": JSON.stringify(storedState) },
  });

  const state = harness.service.readPlayerProfilesState();

  expect(state.players.map((player) => player.id)).toEqual(["seed-1", "p2"]);
  expect(state.selectedPlayerId).toBe("seed-1");
  expect(state.removedPlayerIds).toEqual(["removed-1"]);
  expect(harness.rawWrites).toHaveLength(1);

  harness.service.ensurePlayerProfilesState();
  harness.getState().players.push({ id: "removed-1", name: "Removed Player" });
  harness.getState().removedPlayerIds = ["removed-1", "removed-1"];
  harness.service.writePlayerProfilesState();
  const written = JSON.parse(harness.storage.value(harness.playerProfilesStorageKey));

  expect(written.players.map((player) => player.id)).toEqual(["seed-1", "p2"]);
  expect(written.removedPlayerIds).toEqual(["removed-1"]);
  expect(written.updatedAt).toBe("2026-05-31T11:14:00.000Z");
});

test("Squad player profile runtime state service preserves change-log and guest sync behavior", () => {
  const harness = createHarness({
    playerProfilesState: {
      selectedPlayerId: "seed-1",
      players: [{ id: "seed-1", name: "Seed Player", rosterType: "squad", countsInSquad: true }],
      removedPlayerIds: [],
      changeLog: [],
      rosterVersion: "player-profiles-test-roster",
      schemaVersion: 3,
    },
    medicalState: {
      players: [
        { id: "guest-1", name: "Trial Player", rosterType: "trialist", countsInSquad: false, trainingGroup: "Trial" },
        { id: "archived-1", name: "Archived Player", rosterType: "guest", archivedAt: "2026-05-01T09:00:00.000Z" },
      ],
    },
  });

  harness.service.recordPlayerProfileChange("profile-updated", { id: "seed-1", name: "Seed Player" }, [
    { field: "Role", from: "8", to: "10" },
  ]);

  expect(harness.service.getPlayerProfileChangeLog("seed-1")[0]).toMatchObject({
    actor: "Mak Lind",
    playerName: "Seed Player",
    summary: "profile-updated:Seed Player:1",
  });

  expect(harness.service.syncPlayerProfilesFromMedicalTrainingGuests({ persist: false })).toBe(true);
  expect(harness.getState().players.map((player) => player.id)).toEqual(["seed-1", "guest-1"]);
  expect(harness.service.syncPlayerProfilesFromMedicalTrainingGuests({ persist: false })).toBe(false);
});

test("Squad player profile runtime state service preserves modal and age hydration behavior", async () => {
  const harness = createHarness({
    playerProfilesState: {
      selectedPlayerId: "p1",
      players: [{ id: "p1", name: "Hydrate Player", number: "9", position: "Forward", rosterType: "squad" }],
      removedPlayerIds: [],
      changeLog: [],
      rosterVersion: "player-profiles-test-roster",
      schemaVersion: 3,
    },
  });

  harness.service.openPlayerProfileModal("p1");
  expect(harness.getFlags()).toMatchObject({ modalOpen: true, newModalOpen: false });
  expect(harness.getAutosaveSignature()).toBe("form-signature");
  expect(harness.renders).toContain("workspace");

  harness.service.closePlayerProfileModal();
  expect(harness.getFlags()).toMatchObject({ modalOpen: false });
  expect(harness.getFlushes()).toBe(1);

  const candidates = harness.service.getPlayerProfileAgeHydrationCandidates(harness.getState().players);
  expect(candidates).toEqual([
    { profileId: "p1", cacheKey: "p1", signature: "p1|Hydrate Player|9|Forward", name: "Hydrate Player", number: "9", position: "Forward" },
  ]);

  await harness.service.hydratePlayerProfileAgesOnce();
  const ageCache = harness.getAgeCacheState();
  expect(ageCache.players.p1).toMatchObject({
    signature: "p1|Hydrate Player|9|Forward",
    birthDate: "2001-02-03",
    age: "25",
    databasePlayerId: "db-p1",
  });
  expect(harness.renders).toContain("roster-list");
});
