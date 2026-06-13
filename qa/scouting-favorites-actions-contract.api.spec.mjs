import { expect, test } from "@playwright/test";
import { createScoutingFavoritesActions } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function createHarness(options = {}) {
  const calls = [];
  const state = {
    favoriteRecordIds: Array.isArray(options.favoriteRecordIds) ? options.favoriteRecordIds.slice() : [],
  };
  const records = new Map([["record-1", { id: "record-1", name: "Player One" }]]);
  let perfNow = 100;
  const actions = createScoutingFavoritesActions({
    canEdit: () => options.canEdit !== false,
    ensureState: () => state,
    getPerformanceNow: () => {
      perfNow += 12;
      return perfNow;
    },
    getRecordById: (recordId) => records.get(recordId) || null,
    hasProfileModal: () => options.profileModal === true,
    isPerfDebug: () => options.perfDebug === true,
    logDebugTimings: (timings) => calls.push(["debug", timings]),
    normalizeText,
    refreshSummaryMetrics: () => calls.push(["summary"]),
    refreshWorkspaceAfterLocalMutation: (refreshOptions) => calls.push(["refresh", refreshOptions]),
    rememberRecordSnapshot: (record, currentState, snapshotOptions) =>
      calls.push(["snapshot", record.id, currentState === state, snapshotOptions || null]),
    startPerformance: (label, detail) => ({
      end: (result) => calls.push(["perf", label, detail, result]),
    }),
    updateFavoriteControls: (recordId, currentState) => calls.push(["controls", recordId, currentState === state]),
    writeState: () => calls.push(["write"]),
  });
  return { actions, calls, state };
}

test("Scouting favorite actions toggle normal player cards with one local refresh", () => {
  const { actions, calls, state } = createHarness({ favoriteRecordIds: ["record-2"] });

  const result = actions.toggleFavorite(" record-1 ");

  expect(result).toMatchObject({ changed: true, favorite: true, recordId: "record-1", status: "updated" });
  expect(state.favoriteRecordIds).toEqual(["record-1", "record-2"]);
  expect(calls).toEqual([
    ["snapshot", "record-1", true, null],
    ["write"],
    ["refresh", { preserveFocus: true }],
    ["perf", "favorite.toggle", { recordId: " record-1 " }, { status: "updated" }],
  ]);
});

test("Scouting favorite actions keep profile modal updates lightweight", () => {
  const { actions, calls, state } = createHarness({ favoriteRecordIds: ["record-1"], profileModal: true });

  const result = actions.toggleFavorite("record-1");

  expect(result).toMatchObject({ changed: true, favorite: false, recordId: "record-1", status: "profile-modal" });
  expect(state.favoriteRecordIds).toEqual([]);
  expect(calls).toEqual([
    ["controls", "record-1", true],
    ["summary"],
    ["snapshot", "record-1", true, { includeAnalysis: false }],
    ["write"],
    ["perf", "favorite.toggle", { recordId: "record-1" }, { status: "profile-modal" }],
  ]);
});

test("Scouting favorite actions block writes when scouting cannot be edited", () => {
  const { actions, calls, state } = createHarness({ canEdit: false, favoriteRecordIds: ["record-1"] });

  const result = actions.toggleFavorite("record-1");

  expect(result).toEqual({ changed: false, status: "blocked" });
  expect(state.favoriteRecordIds).toEqual(["record-1"]);
  expect(calls).toEqual([["perf", "favorite.toggle", { recordId: "record-1" }, { status: "blocked" }]]);
});

test("Scouting favorite actions keep existing performance debug output available", () => {
  const { actions, calls } = createHarness({ perfDebug: true });

  actions.toggleFavorite("record-1");

  const debugCall = calls.find((call) => call[0] === "debug");
  expect(debugCall?.[1].map((entry) => entry.label)).toEqual([
    "start",
    "state-ready",
    "favorite-state-updated",
    "record-ready",
    "snapshot-ready",
    "state-written",
    "workspace-refreshed",
  ]);
  expect(debugCall?.[1].every((entry) => Number.isFinite(entry.ms))).toBe(true);
});
