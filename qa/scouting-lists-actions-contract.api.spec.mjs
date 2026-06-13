import { expect, test } from "@playwright/test";
import { createScoutingListsActions } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function createHarness(overrides = {}) {
  const state = {
    lists: [
      { id: "priority", name: "Priority", recordIds: [] },
      { id: "watch", name: "Watch", recordIds: ["record-2"] },
    ],
  };
  const records = new Map([
    ["record-1", { id: "record-1", name: "Record One" }],
    ["record-2", { id: "record-2", name: "Record Two" }],
  ]);
  const calls = {
    confirms: [],
    snapshots: [],
    writes: 0,
    refreshes: [],
    perf: [],
  };
  const deps = {
    canEdit: () => overrides.canEdit ?? true,
    confirm: (message) => {
      calls.confirms.push(message);
      return overrides.confirm ?? true;
    },
    ensureState: () => state,
    getRecordById: (recordId) => records.get(recordId) || null,
    normalizeText,
    refreshWorkspaceAfterLocalMutation: (options) => calls.refreshes.push(options),
    rememberRecordSnapshot: (record, currentState) => calls.snapshots.push({ record, currentState }),
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
    actions: createScoutingListsActions(deps),
    calls,
    state,
  };
}

test("Scouting Lists actions add saved players to the requested list", () => {
  const harness = createHarness();

  const result = harness.actions.addRecordToList("record-1", "watch");

  expect(result).toMatchObject({ changed: true, recordId: "record-1", listId: "watch", status: "updated" });
  expect(harness.state.lists.find((list) => list.id === "watch")?.recordIds).toEqual(["record-1", "record-2"]);
  expect(harness.calls.snapshots).toHaveLength(1);
  expect(harness.calls.writes).toBe(1);
  expect(harness.calls.refreshes).toEqual([{ preserveFocus: true }]);
  expect(harness.calls.perf[0]).toMatchObject({
    label: "list.add",
    ended: { status: "updated" },
  });
});

test("Scouting Lists actions create new lists with normalized names", () => {
  const harness = createHarness();

  const result = harness.actions.createList("  Summer targets  ");

  expect(result).toMatchObject({ changed: true, status: "updated" });
  expect(harness.state.lists[0]).toMatchObject({ name: "Summer targets", recordIds: [] });
  expect(harness.calls.writes).toBe(1);
  expect(harness.calls.refreshes).toEqual([{ preserveFocus: true }]);
});

test("Scouting Lists actions delete only after user confirmation", () => {
  const cancelled = createHarness({ confirm: false });

  const cancelledResult = cancelled.actions.deleteList("watch");

  expect(cancelledResult).toEqual({ changed: false, listId: "watch", status: "cancelled" });
  expect(cancelled.state.lists.map((list) => list.id)).toEqual(["priority", "watch"]);
  expect(cancelled.calls.writes).toBe(0);

  const confirmed = createHarness({ confirm: true });
  const confirmedResult = confirmed.actions.deleteList("watch");

  expect(confirmedResult).toMatchObject({ changed: true, listId: "watch", status: "updated" });
  expect(confirmed.state.lists.map((list) => list.id)).toEqual(["priority"]);
  expect(confirmed.calls.confirms[0]).toContain("Watch");
  expect(confirmed.calls.writes).toBe(1);
  expect(confirmed.calls.refreshes).toEqual([{ preserveFocus: true }]);
});

test("Scouting Lists actions fail closed when editing is unavailable", () => {
  const harness = createHarness({ canEdit: false });

  const result = harness.actions.addRecordToList("record-1", "watch");

  expect(result).toEqual({ changed: false, status: "blocked" });
  expect(harness.state.lists.find((list) => list.id === "watch")?.recordIds).toEqual(["record-2"]);
  expect(harness.calls.snapshots).toEqual([]);
  expect(harness.calls.writes).toBe(0);
});
