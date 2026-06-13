import { expect, test } from "@playwright/test";
import { createScoutingMyTeamActions } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function createHarness(overrides = {}) {
  const state = {
    activeTab: "lists",
    myTeam: {
      formation: "4-3-3",
      slots: {},
      positions: {},
    },
  };
  const players = [
    { id: "player-1", name: "Player One" },
    { id: "player-2", name: "Player Two" },
  ];
  const slots = [
    { id: "gk", label: "GK" },
    { id: "rb", label: "RB" },
  ];
  const calls = {
    writes: 0,
    localRefreshes: [],
    activeRefreshes: [],
    perf: [],
  };
  let selectedPlayerId = overrides.selectedPlayerId || "";
  const deps = {
    canEdit: () => overrides.canEdit ?? true,
    ensureState: () => state,
    getMyTeamPlayerById: (playerId) => players.find((player) => player.id === playerId) || null,
    getMyTeamPlayerId: (player) => player?.id || "",
    getMyTeamState: (currentState) => currentState.myTeam,
    getSelectedPlayerId: () => selectedPlayerId,
    getShadowSlot: (slotId) => slots.find((slot) => slot.id === slotId) || null,
    normalizeFormation: (value) => normalizeText(value, 20) || "4-3-3",
    normalizePitchCoordinate: (value) => Math.max(6, Math.min(94, Math.round(Number(value) * 10) / 10)),
    normalizeText,
    refreshWorkspaceAfterLocalMutation: (options) => calls.localRefreshes.push(options),
    renderActiveTabSurfaceOrWorkspace: (options) => calls.activeRefreshes.push(options),
    setSelectedPlayerId: (playerId) => {
      selectedPlayerId = playerId || "";
    },
    startPerformance: (label, detail) => {
      const entry = { label, detail, ended: null };
      calls.perf.push(entry);
      return {
        end(endDetail) {
          entry.ended = endDetail;
        },
      };
    },
    writeState: () => {
      calls.writes += 1;
    },
  };
  return {
    actions: createScoutingMyTeamActions(deps),
    calls,
    get selectedPlayerId() {
      return selectedPlayerId;
    },
    state,
  };
}

test("Scouting My Team actions assign players and clear selected player state", () => {
  const harness = createHarness({ selectedPlayerId: "player-1" });

  const result = harness.actions.assignPlayerToSlot("player-1", "gk");

  expect(result).toMatchObject({ changed: true, playerId: "player-1", slotId: "gk", status: "updated" });
  expect(harness.state.myTeam.slots).toEqual({ gk: ["player-1"] });
  expect(harness.selectedPlayerId).toBe("");
  expect(harness.calls.writes).toBe(1);
  expect(harness.calls.localRefreshes).toEqual([{ preserveFocus: true }]);
  expect(harness.calls.perf[0]).toMatchObject({
    label: "my-team.assign",
    ended: { status: "updated", slot: "gk" },
  });
});

test("Scouting My Team actions remove a player from every slot", () => {
  const harness = createHarness({ selectedPlayerId: "player-1" });
  harness.state.myTeam.slots = { gk: ["player-1"], rb: ["player-2", "player-1"] };

  const result = harness.actions.removePlayerFromAllSlots("player-1");

  expect(result).toMatchObject({ changed: true, playerId: "player-1", status: "updated" });
  expect(harness.state.myTeam.slots).toEqual({ rb: ["player-2"] });
  expect(harness.selectedPlayerId).toBe("");
  expect(harness.calls.writes).toBe(1);
  expect(harness.calls.localRefreshes).toEqual([{ preserveFocus: true }]);
});

test("Scouting My Team actions update formation through the active-tab refresh path", () => {
  const harness = createHarness();

  const result = harness.actions.setFormation("3-5-2");

  expect(result).toEqual({ changed: true, formation: "3-5-2", status: "updated" });
  expect(harness.state.activeTab).toBe("my-team");
  expect(harness.state.myTeam.formation).toBe("3-5-2");
  expect(harness.calls.writes).toBe(1);
  expect(harness.calls.activeRefreshes).toEqual([{ preserveFocus: true }]);
  expect(harness.calls.localRefreshes).toEqual([]);
});

test("Scouting My Team actions save pitch slot positions by formation", () => {
  const harness = createHarness();
  harness.state.myTeam.formation = "4-2-3-1";

  const result = harness.actions.setSlotPitchPosition("rb", 101.111, 3.222);

  expect(result).toMatchObject({
    changed: true,
    slotId: "rb",
    formation: "4-2-3-1",
    position: { x: 94, y: 6 },
    status: "updated",
  });
  expect(harness.state.myTeam.positions).toEqual({
    "4-2-3-1": {
      rb: { x: 94, y: 6 },
    },
  });
  expect(harness.calls.writes).toBe(1);
  expect(harness.calls.localRefreshes).toEqual([{ preserveFocus: true }]);
});

test("Scouting My Team actions fail closed when editing is unavailable", () => {
  const harness = createHarness({ canEdit: false, selectedPlayerId: "player-1" });

  const result = harness.actions.assignPlayerToSlot("player-1", "gk");

  expect(result).toEqual({ changed: false, status: "blocked" });
  expect(harness.state.myTeam.slots).toEqual({});
  expect(harness.selectedPlayerId).toBe("player-1");
  expect(harness.calls.writes).toBe(0);
});
