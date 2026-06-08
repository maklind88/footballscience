import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlayerProfileRuntimeWriteService } from "../src/modules/squad/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createHarness(options = {}) {
  let playerProfilesState = options.playerProfilesState || {
    selectedPlayerId: "p1",
    removedPlayerIds: ["new-1"],
    players: [
      {
        id: "p1",
        name: "Existing Player",
        primaryRole: "CB",
        roleGroup: "defender",
        rosterType: "squad",
        countsInSquad: true,
        squadStatus: "active",
        attributeRatings: { technical: 3 },
        idp: { status: "active" },
        futureData: { notes: "old" },
      },
    ],
  };
  const changes = [];
  const medicalSyncs = [];
  const writes = [];
  const archives = [];
  const validate = options.validate || ((values) => ({
    ok: true,
    status: "success",
    errors: [],
    warnings: [],
    duplicates: [],
    player: {
      ...values,
      id: values.playerId || values.id || "new-1",
      name: values.name || "New Player",
      primaryRole: values.primaryRole || "CB",
      roleGroup: values.roleGroup || "defender",
      rosterType: values.rosterType || "squad",
      squadStatus: values.squadStatus || "active",
      countsInSquad: typeof values.countsInSquad === "boolean" ? values.countsInSquad : true,
    },
  }));
  const service = createPlayerProfileRuntimeWriteService({
    archiveMedicalPlayersForRemovedPlayerProfile: (player) => archives.push(player),
    comparePlayerProfiles: (first = {}, second = {}) => String(first.name || "").localeCompare(String(second.name || "")),
    ensurePlayerProfilesState: () => playerProfilesState,
    formatPlayerProfileChangeValue: (value) => String(value || ""),
    getNow: () => "2026-05-31T11:14:00.000Z",
    getPlayerProfileChangeDiffs: (previous, next) => previous.name === next.name ? [] : [{ field: "Name", from: previous.name, to: next.name }],
    getPlayerProfileRoleGroupForRole: (role) => (role === "ST" ? "forward" : "defender"),
    getPlayerProfilesState: () => playerProfilesState,
    isCurrentPlatformUserAdmin: () => options.admin !== false,
    normalizePlayerProfile: (player = {}) => ({ ...player }),
    normalizePlayerProfileRemovedIds: (value = []) => Array.from(new Set((Array.isArray(value) ? value : []).filter(Boolean))),
    normalizePlayerProfileRole: (value, fallback = "CB") => String(value || fallback),
    normalizePlayerProfileRosterType: (value, fallback = "squad") => String(value || fallback),
    playerProfileRoleGroupOptions: [{ key: "defender", label: "Defender" }],
    playerProfileRosterTypeCountsInSquad: (value) => value === "squad",
    playerProfileRosterTypeOptions: [{ key: "squad", label: "Squad" }],
    playerProfileSquadStatusOptions: [{ key: "active", label: "Active" }],
    recordPlayerProfileChange: (type, player, diff) => changes.push({ type, player, diff }),
    setPlayerProfilesState: (nextState) => {
      playerProfilesState = nextState;
    },
    syncMedicalPlayersFromPlayerProfiles: (players) => medicalSyncs.push(players),
    validatePlayerProfileFormValues: validate,
    writePlayerProfilesState: () => writes.push("players"),
  });
  return {
    archives,
    changes,
    getState: () => playerProfilesState,
    medicalSyncs,
    service,
    writes,
  };
}

test("Squad player profile write service owns add/update/remove bodies outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const workspaceComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const facade = readProjectFile("src/modules/squad/player-profile-runtime-facade.mjs");
  const service = readProjectFile("src/modules/squad/player-profile-runtime-write-service.mjs");
  const index = readProjectFile("src/modules/squad/index.mjs");

  expect(typeof createPlayerProfileRuntimeWriteService).toBe("function");
  expect(app).toContain("createWorkspaceRuntimeComposition({");
  expect(app).not.toContain("createPlayerProfileRuntimeFacade({");
  expect(workspaceComposer).toContain("createPlayerProfileRuntimeFacade({");
  expect(app).toContain('import * as playerProfileRuntimeAccessors from "./src/modules/squad/player-profile-runtime-accessors.mjs";');
  expect(app).toContain("addPlayerProfile,");
  expect(app).toContain("updatePlayerProfile,");
  expect(app).toContain("removePlayerProfile,");
  expect(workspaceComposer).toContain("deps.configurePlayerProfileRuntimeAccessors(() => playerProfileRuntimeFacade);");
  expect(facade).toContain("createPlayerProfileRuntimeWriteService({");
  expect(app).not.toContain("function addPlayerProfile(values = {}) {\nensurePlayerProfilesState();");
  expect(app).not.toContain("function addPlayerProfile(...args)");
  expect(app).not.toContain("function updatePlayerProfile(values = {}) {\nensurePlayerProfilesState();");
  expect(service).toContain("function removePlayerProfile(playerId)");
  expect(service).not.toContain("createDashboardChat");
  expect(index).toContain('export * from "./player-profile-runtime-write-service.mjs";');
  expect(index).toContain('export * from "./player-profile-runtime-facade.mjs";');
});

test("Squad player profile write service preserves add behavior and Medical sync", () => {
  const harness = createHarness();
  const result = harness.service.addPlayerProfile({
    id: "new-1",
    name: "New Player",
    primaryRole: "ST",
    position: "Forward",
  });

  expect(result).toMatchObject({ ok: true, status: "success", player: { id: "new-1", name: "New Player" } });
  expect(harness.getState().selectedPlayerId).toBe("new-1");
  expect(harness.getState().removedPlayerIds).toEqual([]);
  expect(harness.changes[0]).toMatchObject({ type: "player-added", player: { id: "new-1" } });
  expect(harness.writes).toEqual(["players"]);
  expect(harness.medicalSyncs).toEqual([[expect.objectContaining({ id: "new-1" })]]);
});

test("Squad player profile write service preserves update behavior and nested state merge", () => {
  const harness = createHarness();
  const result = harness.service.updatePlayerProfile({
    playerId: "p1",
    name: "Updated Player",
    primaryRole: "ST",
    rosterType: "guest",
    temporaryGroup: "Trial",
    attributeRatings: { tactical: 4 },
    idp: { nextAction: "Review" },
    futureData: { notes: "new" },
  });

  expect(result).toMatchObject({ ok: true, player: { id: "p1", name: "Updated Player" } });
  expect(harness.getState().players[0]).toMatchObject({
    name: "Updated Player",
    roleGroup: "forward",
    rosterType: "guest",
    countsInSquad: false,
    temporaryGroup: "Trial",
    updatedAt: "2026-05-31T11:14:00.000Z",
  });
  expect(harness.getState().players[0].attributeRatings).toMatchObject({ technical: 3, tactical: 4 });
  expect(harness.changes[0]).toMatchObject({ type: "profile-updated" });
  expect(harness.medicalSyncs).toHaveLength(1);
});

test("Squad player profile write service preserves remove admin guard and Medical archive hook", () => {
  const readOnlyHarness = createHarness({ admin: false });
  expect(readOnlyHarness.service.removePlayerProfile("p1")).toBe(false);
  expect(readOnlyHarness.getState().players).toHaveLength(1);

  const harness = createHarness();
  expect(harness.service.removePlayerProfile("p1")).toBe(true);
  expect(harness.getState().players).toEqual([]);
  expect(harness.getState().removedPlayerIds).toEqual(["new-1", "p1"]);
  expect(harness.changes[0]).toMatchObject({ type: "player-removed", player: { id: "p1" } });
  expect(harness.archives).toEqual([expect.objectContaining({ id: "p1", name: "Existing Player" })]);
});

test("Squad player profile write service preserves validation failures", () => {
  const harness = createHarness({
    validate: () => ({
      ok: false,
      status: "error",
      errors: ["Name is required."],
      warnings: [],
      duplicates: [],
      player: null,
    }),
  });

  expect(harness.service.addPlayerProfile({ name: "" })).toMatchObject({
    ok: false,
    status: "error",
    errors: ["Name is required."],
    player: null,
  });
  expect(harness.writes).toEqual([]);
  expect(harness.medicalSyncs).toEqual([]);
});
