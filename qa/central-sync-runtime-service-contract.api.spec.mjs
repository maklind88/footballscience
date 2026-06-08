import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createCentralSyncRuntimeService } from "../src/core/central-sync-runtime-service.mjs";

function createManifest() {
  return {
    entries: {},
    lastCentralError: "",
    lastCentralSyncedAt: "",
  };
}

function createServiceHarness(options = {}) {
  const manifest = createManifest();
  const rawValues = new Map();
  const syncCalls = [];
  const autosaveStatuses = [];
  const snapshots = [];
  const handledKeys = [];
  const timers = new Map();
  let timerId = 0;
  const win = {
    footballScienceCentralState: {
      getStatus: () => ({ metadata: { "football-session-planner-v1": { revision: 7 } } }),
      isCentralKey: () => true,
      syncKey: async (key, value, syncOptions) => {
        syncCalls.push({ key, value, options: syncOptions });
        return options.syncResult ?? { ok: true, value };
      },
      hydrate: async () => {
        syncCalls.push({ hydrate: true });
      },
    },
    setTimeout: (callback) => {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  };
  const service = createCentralSyncRuntimeService({
    getActiveWorkspaceId: () => options.activeWorkspaceId || "session-planner",
    getCurrentUser: () => options.currentUser ?? { id: "coach-1" },
    getDataSafetyNow: () => "2026-06-08T12:00:00.000Z",
    getStorageLabel: (key) => `Label ${key}`,
    handleSyncedStateValue: (key, value) => handledKeys.push({ key, value }),
    hashString: (value) => `hash-${String(value).length}`,
    isProtectedStorageKey: (key) => key.startsWith("football-"),
    isSessionPlannerAutosaveKey: (key) => key === "football-session-planner-v1",
    mergePeriodizationStatePreservingLocalUi: (_currentValue, syncedValue) => `periodization:${syncedValue}`,
    mergeScheduleStatePreservingLocalUi: (_currentValue, syncedValue) => `schedule:${syncedValue}`,
    mutateManifest: (mutator) => {
      mutator(manifest);
      return manifest;
    },
    periodizationStorageKey: "football-periodization-v2",
    queueSnapshot: (reason) => snapshots.push(reason),
    queueStatusRefresh: () => {},
    rawGetItem: (key) => rawValues.get(key) ?? null,
    rawSetItem: (key, value) => {
      rawValues.set(key, value);
    },
    scheduleStorageKey: "football-schedule-v1",
    sessionPlannerLocalUiState: { state: { sessionPlannerCentralSyncConflict: "existing" } },
    getSessionPlannerLocalUiState: () => ({ state: { sessionPlannerCentralSyncConflict: "existing" } }),
    sessionPlannerStorageKey: "football-session-planner-v1",
    setAutosaveStatusForKey: (...args) => autosaveStatuses.push(args),
    showSessionPlannerToast: (...args) => autosaveStatuses.push(["toast", ...args]),
    win,
  });
  return { autosaveStatuses, handledKeys, manifest, rawValues, service, snapshots, syncCalls, timers, win };
}

test("central sync runtime queues protected writes with revision metadata and flushes through the bridge", async () => {
  const harness = createServiceHarness();

  harness.service.queueCentralStateWrite("football-session-planner-v1", "{\"blocks\":[]}");
  expect(harness.manifest.entries["football-session-planner-v1"]).toMatchObject({
    label: "Label football-session-planner-v1",
    pendingCentralSync: true,
  });
  expect(harness.autosaveStatuses).toContainEqual(["football-session-planner-v1", "saving", "Saving"]);
  expect(harness.timers.size).toBe(1);

  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-session-planner-v1",
      value: "{\"blocks\":[]}",
      options: { removed: false, baseRevision: 7 },
    },
  ]);
  expect(harness.manifest.lastCentralError).toBe("");
  expect(harness.manifest.lastCentralSyncedAt).toBe("2026-06-08T12:00:00.000Z");
  expect(harness.autosaveStatuses).toContainEqual(["football-session-planner-v1", "saved", "Saved"]);
});

test("central sync runtime applies newer server values through the injected render boundary", () => {
  const harness = createServiceHarness();
  harness.rawValues.set("football-schedule-v1", "local");

  harness.service.applyCentralSyncedStateValue({ key: "football-schedule-v1", value: "local" }, "server");

  expect(harness.rawValues.get("football-schedule-v1")).toBe("schedule:server");
  expect(harness.snapshots).toEqual(["central-merge"]);
  expect(harness.handledKeys).toEqual([{ key: "football-schedule-v1", value: "schedule:server" }]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    hash: "hash-15",
    pendingCentralSync: false,
    size: 15,
  });
});

test("central sync runtime keeps chat and workspace rendering outside the service", () => {
  const serviceSource = readFileSync(new URL("../src/core/central-sync-runtime-service.mjs", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../app-runtime.js", import.meta.url), "utf8");

  expect(serviceSource).toContain("handleSyncedStateValue");
  expect(serviceSource).not.toMatch(/renderDashboardChatWidget|renderMedicalTeamWorkspace|renderPlayerProfilesWorkspace|renderScoutingWorkspace/);
  expect(runtimeSource).toContain("function handleCentralSyncedStateValue");
  expect(runtimeSource).toContain("createCentralSyncRuntimeService");
});
