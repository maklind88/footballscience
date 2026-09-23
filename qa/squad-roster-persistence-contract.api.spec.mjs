import { expect, test } from "@playwright/test";
import { createPlayerProfileHelpers } from "../src/modules/squad/player-profile-helpers.mjs";
import { createPlayerProfileRuntimeStateService } from "../src/modules/squad/player-profile-runtime-state-service.mjs";
import { createPlayerProfileRuntimeWriteService } from "../src/modules/squad/player-profile-runtime-write-service.mjs";
import { playerProfileRosterTypeOptions } from "../src/modules/squad/player-profile-options.mjs";

function createHarness() {
  let tick = Date.parse("2026-09-14T12:00:00Z");
  let nextId = 0;
  const getNow = () => new Date(tick++).toISOString();
  const helpers = createPlayerProfileHelpers({ getNow });
  const storage = new Map();
  const medicalSyncs = [];
  let state = null;
  const stateService = createPlayerProfileRuntimeStateService({
    ...helpers,
    getNow,
    getPlayerProfilesState: () => state,
    setPlayerProfilesState: (next) => { state = next; },
    defaultMedicalPlayers: [],
    createDashboardId: () => `change-${++nextId}`,
    getCurrentPlatformUser: () => ({ name: "Test Coach" }),
    getSquadChangeSummary: () => "Profile updated",
    playerProfilesStorageKey: "test-profiles",
    playerProfilesSchemaVersion: 3,
    rawDataSafetySetItem: (key, value) => storage.set(key, value),
    logEvent: (message) => { throw new Error(message); },
    win: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    },
  });
  const writer = createPlayerProfileRuntimeWriteService({
    ...helpers,
    ...stateService,
    getNow,
    setPlayerProfilesState: (next) => { state = next; },
    syncMedicalPlayersFromPlayerProfiles: (players) => medicalSyncs.push(players),
  });
  const initialPlayer = helpers.normalizePlayerProfile({
    id: "test-player", name: "Test Player", rosterType: "squad",
    position: "Defender", primaryRole: "LB", secondaryRoles: ["CB"],
    status: "vacation", coachNotes: "Keep these coaching notes",
    idp: { status: "active", reviewDate: "2026-10-01" },
  });
  state = stateService.clonePlayerProfilesState({ players: [initialPlayer], changeLog: [] });
  return {
    helpers, stateService, medicalSyncs,
    player: () => state.players.find((player) => player.id === initialPlayer.id),
    snapshot: () => JSON.parse(storage.get("test-profiles")),
    update: (values) => writer.updatePlayerProfile({ playerId: initialPlayer.id, ...values }),
    reload: () => { state = stateService.readPlayerProfilesState(); },
  };
}

test("every roster label written to history can be read without a squad fallback", () => {
  const helpers = createPlayerProfileHelpers();
  for (const option of playerProfileRosterTypeOptions) {
    const label = helpers.formatPlayerProfileChangeValue(option.key, { options: playerProfileRosterTypeOptions });
    expect(helpers.normalizePlayerProfileRosterType(label, ""), label).toBe(option.key);
  }
  expect(helpers.normalizePlayerProfileRosterType("unknown roster", "")).toBe("");
});

for (const rosterType of ["guest", "academy", "trialist", "loan"]) {
  test(`${rosterType} promotion survives write, history replay and repeated reloads`, () => {
    const harness = createHarness();
    expect(harness.update({
      rosterType, temporaryGroup: "Training group",
      temporaryFrom: "2026-09-01", temporaryTo: "2026-09-30",
    }).ok).toBe(true);
    harness.reload();
    expect(harness.player()).toMatchObject({ rosterType, countsInSquad: false });

    expect(harness.update({ rosterType: "squad" }).ok).toBe(true);
    const saved = harness.snapshot();
    expect(saved.changeLog[0].changes).toContainEqual({
      field: "Roster type",
      from: playerProfileRosterTypeOptions.find((option) => option.key === rosterType).label,
      to: "Squad player",
    });
    const expected = {
      rosterType: "squad", countsInSquad: true,
      temporaryGroup: "", temporaryFrom: "", temporaryTo: "",
      status: "vacation", primaryRole: "LB", secondaryRoles: ["CB"],
      coachNotes: "Keep these coaching notes", idp: { status: "active", reviewDate: "2026-10-01" },
    };
    expect(harness.player()).toMatchObject(expected);
    expect(harness.medicalSyncs.at(-1)[0]).toMatchObject(expected);
    for (let i = 0; i < 3; i += 1) {
      harness.reload();
      expect(harness.player()).toMatchObject(expected);
    }

    // Previously drifted rows must also honor the already-saved promotion history.
    const drifted = structuredClone(saved);
    drifted.players[0].rosterType = rosterType;
    drifted.players[0].countsInSquad = false;
    expect(harness.stateService.clonePlayerProfilesState(drifted).players[0]).toMatchObject(expected);

    expect(harness.update({ status: "available" }).ok).toBe(true);
    harness.reload();
    expect(harness.player()).toMatchObject({ ...expected, status: "available" });
    expect(harness.update({ rosterType }).ok).toBe(true);
    harness.reload();
    expect(harness.player()).toMatchObject({ rosterType, countsInSquad: false, status: "available" });

    const removed = { ...saved, removedPlayerIds: ["test-player"] };
    expect(harness.stateService.clonePlayerProfilesState(removed).players).toEqual([]);
  });
}
