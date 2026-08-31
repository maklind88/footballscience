import { expect, test } from "@playwright/test";
import { createScoutingProfileModalController } from "../src/modules/scouting/index.mjs";

function createModal(calls, options = {}) {
  return {
    contains: () => options.containsActiveElement === true,
    focus: (focusOptions) => calls.push(["focus", focusOptions]),
  };
}

function createHarness(options = {}) {
  let now = options.now || 1000;
  let nextTimerId = 20;
  const timers = new Map();
  const calls = [];
  const state = {
    profileRoleProfileId: "role-old",
    profileSpiderSeasonMode: "season",
    profileSpiderSeasonValue: "2025",
    profileTab: "history",
    selectedRecordId: options.selectedRecordId || "",
  };
  const modal = options.modal === false ? null : createModal(calls, options.modalOptions);
  const backdrop = options.backdrop
    ? {
        remove: () => calls.push(["remove-backdrop"]),
      }
    : null;
  const documentRef = {
    activeElement: options.activeElement || null,
  };
  const controller = createScoutingProfileModalController({
    clearTimeout: (timerId) => {
      calls.push(["clear-timeout", timerId || 0]);
      timers.delete(timerId);
    },
    documentRef,
    ensureFocusObserver: () => calls.push(["ensure-focus-observer"]),
    ensureState: () => state,
    focusElementWithoutScroll: () => calls.push(["focus-without-scroll"]),
    getProfileBackdrop: () => backdrop,
    getProfileModal: () => modal,
    hasProfileModal: () => options.hasProfileModal === true,
    normalizeText: (value = "", limit = 160) => String(value || "").trim().slice(0, limit),
    now: () => now,
    queueProfileHydration: (recordId) => calls.push(["hydrate-profile", recordId]),
    refreshSummaryMetrics: () => calls.push(["refresh-summary"]),
    renderProfileModal: (recordId, renderOptions = {}) => calls.push(["render-profile", recordId, renderOptions]),
    renderWorkspace: () => calls.push(["render-workspace"]),
    setTimeout: (callback, delayMs) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, callback);
      calls.push(["set-timeout", timerId, delayMs]);
      return timerId;
    },
    writeState: (writeOptions) => calls.push(["write", writeOptions]),
  });
  return {
    calls,
    controller,
    documentRef,
    runTimer(timerId) {
      timers.get(timerId)?.();
    },
    setNow(value) {
      now = value;
    },
    state,
  };
}

test("Scouting profile modal controller opens records with reset profile state and queued focus", () => {
  const harness = createHarness();

  const result = harness.controller.openRecord(" record-1 ");

  expect(result).toEqual({ changed: true, recordId: "record-1", status: "opened" });
  expect(harness.state).toMatchObject({
    selectedRecordId: "record-1",
    profileTab: "overview",
    profileRoleProfileId: "auto",
    profileSpiderSeasonMode: "latest",
    profileSpiderSeasonValue: "",
  });
  expect(harness.controller.getFocusState()).toMatchObject({
    focusTimer: 20,
    postOpenTimer: 21,
    pendingFocusRecordId: "record-1",
    pendingFocusUntil: 2500,
  });
  expect(harness.calls).toEqual([
    ["ensure-focus-observer"],
    ["render-profile", "record-1", { lightweightOverview: true }],
    ["focus", { preventScroll: true }],
    ["focus-without-scroll"],
    ["clear-timeout", 0],
    ["set-timeout", 20, 40],
    ["set-timeout", 21, 500],
  ]);

  harness.documentRef.activeElement = {};
  harness.runTimer(20);

  expect(harness.calls.slice(-2)).toEqual([
    ["focus", { preventScroll: true }],
    ["focus-without-scroll"],
  ]);
  expect(harness.controller.getFocusState()).toMatchObject({ focusTimer: 0, pendingFocusRecordId: "", pendingFocusUntil: 0 });

  harness.runTimer(21);
  expect(harness.calls.slice(-3)).toEqual([
    ["render-profile", "record-1", {}],
    ["write", { syncCentral: false }],
    ["hydrate-profile", "record-1"],
  ]);
  expect(harness.controller.getFocusState().postOpenTimer).toBe(0);
});

test("Scouting profile modal controller only refocuses an already open profile", () => {
  const harness = createHarness({ hasProfileModal: true, selectedRecordId: "record-1" });

  const result = harness.controller.openRecord("record-1");

  expect(result).toEqual({ changed: false, recordId: "record-1", status: "already-open" });
  expect(harness.calls).toEqual([
    ["clear-timeout", 0],
    ["set-timeout", 20, 40],
  ]);
  expect(harness.state.profileTab).toBe("history");
});

test("Scouting profile modal controller cancels deferred hydration when the profile closes", () => {
  const harness = createHarness({ backdrop: true });

  harness.controller.openRecord("record-1");
  const callCountBeforeClose = harness.calls.length;
  harness.controller.closeRecord();
  harness.runTimer(21);

  expect(harness.calls.slice(callCountBeforeClose)).toEqual([
    ["clear-timeout", 21],
    ["write", { syncCentral: false }],
    ["remove-backdrop"],
    ["refresh-summary"],
  ]);
  expect(harness.calls).not.toContainEqual(["hydrate-profile", "record-1"]);
});

test("Scouting profile modal controller skips queued focus after stale selection or expiry", () => {
  const harness = createHarness();

  harness.controller.openRecord("record-1");
  harness.state.selectedRecordId = "record-2";
  harness.runTimer(20);

  expect(harness.calls.slice(-1)).toEqual([["clear-timeout", 20]]);
  expect(harness.controller.getFocusState().focusTimer).toBe(0);

  const expiredHarness = createHarness();
  expiredHarness.controller.openRecord("record-1");
  expiredHarness.setNow(3000);
  expiredHarness.runTimer(20);

  expect(expiredHarness.calls.slice(-1)).toEqual([["clear-timeout", 20]]);
});

test("Scouting profile modal controller respects active inputs inside the modal", () => {
  const activeInput = { matches: () => true };
  const harness = createHarness({ activeElement: activeInput, modalOptions: { containsActiveElement: true } });

  expect(harness.controller.focusModal()).toBe(false);
  expect(harness.calls).toEqual([]);
});

test("Scouting profile modal controller closes profile modal or falls back to workspace render", () => {
  const modalHarness = createHarness({ backdrop: true, selectedRecordId: "record-1" });

  expect(modalHarness.controller.closeRecord()).toEqual({ changed: true, surface: "profile-modal", status: "closed" });
  expect(modalHarness.state.selectedRecordId).toBe("");
  expect(modalHarness.calls).toEqual([
    ["write", { syncCentral: false }],
    ["remove-backdrop"],
    ["refresh-summary"],
  ]);

  const workspaceHarness = createHarness({ selectedRecordId: "record-1" });

  expect(workspaceHarness.controller.closeRecord()).toEqual({ changed: true, surface: "workspace", status: "closed" });
  expect(workspaceHarness.calls).toEqual([
    ["write", { syncCentral: false }],
    ["render-workspace"],
  ]);
});
