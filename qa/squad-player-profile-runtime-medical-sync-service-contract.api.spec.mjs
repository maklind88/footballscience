import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlayerProfileRuntimeMedicalSyncService } from "../src/modules/squad/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createHarness(options = {}) {
  let playerProfilesState = options.playerProfilesState || { removedPlayerIds: ["p2"] };
  let medicalState = options.medicalState || {
    selectedPlayerId: "p2",
    players: [
      { id: "p1", name: "Active Player", number: "10" },
      { id: "p2", name: "Removed Player", number: "8" },
      { id: "archived", name: "Archived Player", archivedAt: "2026-05-01T09:00:00.000Z" },
    ],
    records: [{ id: "r1", playerId: "p2", comment: "Record" }],
    injuryPlans: [{ id: "plan1", playerId: "p2", injuryType: "Hamstring" }],
  };
  const upserts = [];
  const writes = [];
  const clinicalCommits = [];
  const service = createPlayerProfileRuntimeMedicalSyncService({
    canViewPrivateMedicalDetails: () => options.canViewPrivate !== false,
    commitMedicalClinicalState: (type, summary) => clinicalCommits.push({ type, summary }),
    createDashboardId: (prefix) => `${prefix}-1`,
    ensureMedicalState: () => medicalState,
    ensurePlayerProfilesState: () => playerProfilesState,
    getActiveMedicalPlayers: () => medicalState.players.filter((player) => !player.archivedAt),
    getCurrentMedicalActorId: () => "medical-user",
    getMedicalState: () => medicalState,
    getNow: () => "2026-05-31T11:14:00.000Z",
    isMedicalItemArchived: (item = {}) => Boolean(item.archivedAt),
    normalizeMedicalInjuryPlan: (plan = {}) => ({ ...plan }),
    normalizeMedicalPlayer: (player = {}) => (player && player.id && player.name ? { ...player } : null),
    normalizeMedicalRecord: (record = {}) => ({ ...record }),
    normalizePlayerProfileName: (value = "") => String(value).trim().toLowerCase(),
    normalizePlayerProfileRemovedIds: (value = []) => Array.from(new Set((Array.isArray(value) ? value : []).filter(Boolean))),
    setMedicalState: (nextState) => {
      medicalState = nextState;
    },
    upsertMedicalPlayers: (players) => upserts.push(players),
    writeMedicalState: () => writes.push("medical"),
  });
  return {
    clinicalCommits,
    getMedicalState: () => medicalState,
    getPlayerProfilesState: () => playerProfilesState,
    service,
    setPlayerProfilesState: (nextState) => {
      playerProfilesState = nextState;
    },
    upserts,
    writes,
  };
}

test("Squad player profile Medical sync service owns sync and archive bodies outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const service = readProjectFile("src/modules/squad/player-profile-runtime-medical-sync-service.mjs");
  const index = readProjectFile("src/modules/squad/index.mjs");

  expect(typeof createPlayerProfileRuntimeMedicalSyncService).toBe("function");
  expect(app).toContain("createPlayerProfileRuntimeFacade({");
  expect(app).toContain('import * as playerProfileRuntimeAccessors from "./src/modules/squad/player-profile-runtime-accessors.mjs";');
  expect(app).toContain("archiveMedicalPlayersRemovedFromSquad,");
  expect(app).toContain("buildMedicalPlayerFromPlayerProfile,");
  expect(app).toContain("syncMedicalPlayersFromPlayerProfiles,");
  expect(app).toContain("configurePlayerProfileRuntimeAccessors(() => playerProfileRuntimeFacade);");
  expect(app).not.toContain("createPlayerProfileRuntimeMedicalSyncService({");
  expect(app).not.toContain("function archiveMedicalPlayersRemovedFromSquad(...args)");
  expect(app).not.toContain("function buildMedicalPlayerFromPlayerProfile(player = {}) {\nconst now = new Date().toISOString();");
  expect(app).not.toContain("function archiveMedicalPlayersRemovedFromSquad(options = {}) {\nif (!medicalState");
  expect(service).toContain("createPlayerProfileRuntimeMedicalSyncService");
  expect(service).toContain("function archiveMedicalPlayersRemovedFromSquad(archiveOptions = {})");
  expect(service).toContain("commitMedicalClinicalState");
  expect(service).not.toContain("createDashboardChat");
  expect(index).toContain('export * from "./player-profile-runtime-medical-sync-service.mjs";');
  expect(index).toContain('export * from "./player-profile-runtime-facade.mjs";');
});

test("Squad player profile Medical sync service converts profiles and upserts Medical players", () => {
  const harness = createHarness();

  const medicalPlayer = harness.service.buildMedicalPlayerFromPlayerProfile({
    id: "p9",
    name: "New Player",
    number: "9",
    position: "Forward",
    primaryRole: "ST",
  });

  expect(medicalPlayer).toMatchObject({
    id: "p9",
    name: "New Player",
    number: "9",
    primaryRole: "ST",
    createdAt: "2026-05-31T11:14:00.000Z",
    updatedAt: "2026-05-31T11:14:00.000Z",
  });

  harness.service.syncMedicalPlayersFromPlayerProfiles([{ id: "p9", name: "New Player" }, { id: "", name: "" }]);
  expect(harness.upserts).toEqual([[expect.objectContaining({ id: "p9", name: "New Player" })]]);
});

test("Squad player profile Medical sync service matches and archives removed squad players", () => {
  const harness = createHarness();

  expect(harness.service.getMedicalPlayersMatchingPlayerProfile({ id: "p2", name: "Removed Player" })).toHaveLength(1);
  expect(harness.service.isMedicalPlayerRemovedFromSquad({ id: "p2" })).toBe(true);

  const archived = harness.service.archiveMedicalPlayersRemovedFromSquad();
  expect(archived.map((player) => player.id)).toEqual(["p2"]);
  expect(harness.getMedicalState().players.find((player) => player.id === "p2")).toMatchObject({
    archivedAt: "2026-05-31T11:14:00.000Z",
    archivedBy: "medical-user",
    archiveReason: "Removed from Squad Room",
  });
  expect(harness.getMedicalState().records[0]).toMatchObject({
    archivedAt: "2026-05-31T11:14:00.000Z",
    archiveReason: "Player removed from Squad Room",
  });
  expect(harness.getMedicalState().injuryPlans[0]).toMatchObject({
    archivedAt: "2026-05-31T11:14:00.000Z",
    archiveReason: "Player removed from Squad Room",
  });
  expect(harness.getMedicalState().selectedPlayerId).toBe("p1");
  expect(harness.writes).toEqual(["medical"]);
});

test("Squad player profile Medical sync service archives direct profile removals with clinical commit", () => {
  const harness = createHarness({
    playerProfilesState: { removedPlayerIds: [] },
    medicalState: {
      selectedPlayerId: "p1",
      players: [{ id: "p1", name: "Active Player", number: "10" }],
      records: [{ id: "r1", playerId: "p1" }],
      injuryPlans: [{ id: "plan1", playerId: "p1" }],
    },
  });

  const archived = harness.service.archiveMedicalPlayersForRemovedPlayerProfile({ name: "Active Player" });

  expect(archived.map((player) => player.id)).toEqual(["p1"]);
  expect(harness.getMedicalState().players[0]).toMatchObject({
    archivedAt: "2026-05-31T11:14:00.000Z",
    archiveReason: "Removed from Squad Room",
  });
  expect(harness.clinicalCommits).toEqual([
    {
      type: "player-removed-from-squad",
      summary: "Active Player archived after Squad Room removal.",
    },
  ]);
});
