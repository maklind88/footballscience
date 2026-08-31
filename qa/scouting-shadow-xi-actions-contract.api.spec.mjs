import { expect, test } from "@playwright/test";
import { createScoutingShadowXiActions } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function createHarness(overrides = {}) {
  const state = {
    activeTab: "database",
    shadowXi: {
      formation: "4-3-3",
      selectedSlotId: "",
      slots: {
        cf: ["record-2"],
        rb: ["record-3", "record-4"],
      },
      positions: {},
      meta: {},
    },
  };
  const slots = [
    { id: "cf", label: "CF" },
    { id: "rb", label: "RB" },
  ];
  const records = new Map([
    ["record-1", { id: "record-1", name: "Young Target", age: 21, team: "North", league: "League A", season: "2026", position: "CF" }],
    ["record-2", { id: "record-2", name: "Current Target", age: 27, team: "South", league: "League B", season: "2025", position: "CF" }],
    ["record-3", { id: "record-3", name: "Right Back A", age: 24, team: "East", league: "League C", season: "2026", position: "RB" }],
    ["record-4", { id: "record-4", name: "Right Back B", age: 25, team: "West", league: "League C", season: "2026", position: "RB" }],
  ]);
  const calls = {
    activeRefreshes: [],
    ensureState: 0,
    perf: [],
    refreshes: [],
    snapshots: [],
    writes: [],
  };
  let preferredSlotId = overrides.preferredSlotId || "";
  const deps = {
    canEdit: () => overrides.canEdit ?? true,
    ensureState: () => {
      calls.ensureState += 1;
      return state;
    },
    getCurrentState: () => state,
    getFirstShadowSlot: () => slots[0],
    getPreferredSlotId: () => preferredSlotId,
    getRecordAge: (record) => Number(record?.age),
    getRecordById: (recordId) => records.get(recordId) || null,
    getRecordLeague: (record) => record?.league || "",
    getRecordName: (record) => record?.name || "",
    getRecordPosition: (record) => record?.position || "",
    getRecordSeason: (record) => record?.season || "",
    getRecordTeam: (record) => record?.team || "",
    getShadowMetaKey: (slotId, recordId) => `${slotId}:${recordId}`,
    getShadowRecordMeta: (slotId, recordId, currentState) => currentState.shadowXi.meta[`${slotId}:${recordId}`] || {},
    getShadowSlot: (slotId) => slots.find((slot) => slot.id === slotId) || null,
    getShadowSlotRecordIds: (slotId, currentState) => Array.isArray(currentState.shadowXi.slots[slotId]) ? currentState.shadowXi.slots[slotId].slice() : [],
    normalizeFormation: (value) => normalizeText(value, 20) || "4-3-3",
    normalizeShadowTag: (value) => normalizeText(value, 40) || "monitor",
    normalizeText,
    now: () => "2026-06-13T12:00:00.000Z",
    refreshWorkspaceAfterShadowMutation: (options, recordId) => calls.refreshes.push({ options, recordId }),
    rememberRecordSnapshot: (record, currentState, options) => calls.snapshots.push({ record, currentState, options }),
    renderActiveTabSurfaceOrWorkspace: (options) => calls.activeRefreshes.push(options),
    setActiveTab: overrides.setActiveTab
      ? (tabId, options) => overrides.setActiveTab(tabId, options, state, calls)
      : undefined,
    setPreferredSlotId: (slotId) => {
      preferredSlotId = slotId || "";
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
    writeState: (options) => calls.writes.push(options || {}),
  };
  return {
    actions: createScoutingShadowXiActions(deps),
    calls,
    get preferredSlotId() {
      return preferredSlotId;
    },
    state,
  };
}

test("Scouting Shadow XI actions add records with slot meta and preferred slot state", () => {
  const harness = createHarness();

  const result = harness.actions.addRecordToShadow("record-1", "cf");

  expect(result).toMatchObject({ changed: true, recordId: "record-1", slotId: "cf", status: "updated" });
  expect(harness.state.shadowXi.slots.cf).toEqual(["record-1", "record-2"]);
  expect(harness.state.shadowXi.meta["cf:record-1"]).toMatchObject({
    tag: "u23",
    playerName: "Young Target",
    team: "North",
    league: "League A",
    season: "2026",
    position: "CF",
    updatedAt: "2026-06-13T12:00:00.000Z",
  });
  expect(harness.preferredSlotId).toBe("cf");
  expect(harness.calls.snapshots[0]).toMatchObject({ options: { includeAnalysis: true } });
  expect(harness.calls.writes).toEqual([{}]);
  expect(harness.calls.refreshes).toEqual([{ options: { preserveFocus: true }, recordId: "record-1" }]);
  expect(harness.calls.perf[0]).toMatchObject({
    label: "shadow.add",
    ended: { status: "updated", slot: "cf" },
  });
});

test("Scouting Shadow XI actions move and reorder records across slots", () => {
  const harness = createHarness();

  const moved = harness.actions.moveRecord("rb", "record-3", "down");
  expect(moved).toMatchObject({ changed: true, recordId: "record-3", slotId: "rb", status: "updated" });
  expect(harness.state.shadowXi.slots.rb).toEqual(["record-4", "record-3"]);

  const reordered = harness.actions.reorderRecord("cf", "record-4", "record-2");
  expect(reordered).toMatchObject({ changed: true, recordId: "record-4", slotId: "cf", status: "updated" });
  expect(harness.state.shadowXi.slots.cf).toEqual(["record-4", "record-2"]);
  expect(harness.state.shadowXi.slots.rb).toEqual(["record-3"]);
  expect(harness.preferredSlotId).toBe("cf");
});

test("Scouting Shadow XI actions select and clear slot focus", () => {
  const harness = createHarness();

  const selected = harness.actions.selectSlot("rb");
  expect(selected).toEqual({ changed: true, slotId: "rb", status: "updated" });
  expect(harness.state.activeTab).toBe("database");
  expect(harness.state.shadowXi.selectedSlotId).toBe("rb");
  expect(harness.preferredSlotId).toBe("rb");
  expect(harness.calls.writes).toEqual([{ syncCentral: false }]);
  expect(harness.calls.activeRefreshes).toEqual([{ preserveFocus: true }]);

  const cleared = harness.actions.clearSlotSelection();
  expect(cleared).toEqual({ changed: true, status: "updated" });
  expect(harness.state.shadowXi.selectedSlotId).toBe("");
  expect(harness.preferredSlotId).toBe("");
  expect(harness.calls.writes[1]).toEqual({ syncCentral: false });
});

test("Scouting Shadow XI slot navigation uses the shared deferred tab controller", () => {
  const harness = createHarness({
    setActiveTab: (tabId, options, state, calls) => {
      expect(options.state).toBe(state);
      state.activeTab = tabId;
      calls.activeRefreshes.push({ deferredTab: tabId });
    },
  });
  harness.state.activeTab = "shadow-xi";

  const selected = harness.actions.selectSlot("rb");

  expect(selected).toMatchObject({ changed: true, slotId: "rb" });
  expect(harness.state.activeTab).toBe("database");
  expect(harness.calls.activeRefreshes).toEqual([{ deferredTab: "database" }]);
  expect(harness.calls.writes).toEqual([]);
  expect(harness.calls.ensureState).toBe(0);
});

test("Scouting Shadow XI actions save formation, pitch position, and record meta", () => {
  const harness = createHarness();

  expect(harness.actions.setFormation("3-5-2")).toEqual({ changed: true, formation: "3-5-2", status: "updated" });
  expect(harness.actions.setSlotPitchPosition("rb", 101.9, 2.2)).toMatchObject({
    changed: true,
    slotId: "rb",
    formation: "3-5-2",
    position: { x: 94, y: 6 },
    status: "updated",
  });
  expect(harness.actions.setRecordMeta("rb", "record-3", { tag: "starter", notes: "Fit" })).toMatchObject({
    changed: true,
    recordId: "record-3",
    slotId: "rb",
    metaKey: "rb:record-3",
    status: "updated",
  });
  expect(harness.state.shadowXi.positions).toEqual({
    "3-5-2": {
      rb: { x: 94, y: 6 },
    },
  });
  expect(harness.state.shadowXi.meta["rb:record-3"]).toMatchObject({
    tag: "starter",
    notes: "Fit",
    updatedAt: "2026-06-13T12:00:00.000Z",
  });
});

test("Scouting Shadow XI actions fail closed when editing is unavailable", () => {
  const harness = createHarness({ canEdit: false });

  const result = harness.actions.addRecordToShadow("record-1", "cf");

  expect(result).toEqual({ changed: false, status: "blocked" });
  expect(harness.state.shadowXi.slots.cf).toEqual(["record-2"]);
  expect(harness.calls.snapshots).toEqual([]);
  expect(harness.calls.writes).toEqual([]);
});
