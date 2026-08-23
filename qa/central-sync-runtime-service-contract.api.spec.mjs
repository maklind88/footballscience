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
  const syncStatuses = [];
  const handledKeys = [];
  const timers = new Map();
  let timerId = 0;
  let hydrated = options.hydrated !== false;
  let revision = Number.isInteger(Number(options.revision)) ? Number(options.revision) : 7;
  let syncResultIndex = 0;
  const win = {
    footballScienceCentralState: {
      getStatus: () => ({
        metadata: {
          "football-schedule-v1": { revision },
          "football-dashboard-presentation-mode-v1": { revision },
          "football-session-planner-v1": { revision },
        },
      }),
      isCentralKey: () => true,
      isHydrated: () => hydrated,
      canWriteKey: (key) => options.writeAccess?.[key] !== false,
      syncKey: async (key, value, syncOptions) => {
        syncCalls.push({ key, value, options: syncOptions });
        if (Array.isArray(options.syncResults)) {
          const result = options.syncResults[Math.min(syncResultIndex, options.syncResults.length - 1)];
          syncResultIndex += 1;
          return result;
        }
        return options.syncResult ?? { ok: true, value };
      },
      hydrate: async (hydrateOptions) => {
        syncCalls.push({ hydrate: true, options: hydrateOptions });
        options.onHydrate?.({
          manifest,
          rawValues,
          setRevision: (nextRevision) => {
            revision = Number(nextRevision) || 0;
          },
        });
        return options.hydrateResult !== false;
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
    handleSyncStatus: (...args) => syncStatuses.push(args),
    hashString: (value) => `hash-${String(value).length}`,
    isProtectedStorageKey: (key) => key.startsWith("football-"),
    isSessionPlannerAutosaveKey: (key) => key === "football-session-planner-v1",
    mergeDashboardPresentationStatePreservingLocalEdits: (currentValue, syncedValue) => `presentation:${currentValue}:${syncedValue}`,
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
    retryConflictStorageKeys: options.retryConflictStorageKeys || [],
    dashboardPresentationStorageKey: "football-dashboard-presentation-mode-v1",
    scheduleStorageKey: "football-schedule-v1",
    sessionPlannerLocalUiState: { state: { sessionPlannerCentralSyncConflict: "existing" } },
    getSessionPlannerLocalUiState: () => ({ state: { sessionPlannerCentralSyncConflict: "existing" } }),
    sessionPlannerStorageKey: "football-session-planner-v1",
    setAutosaveStatusForKey: (...args) => autosaveStatuses.push(args),
    showSessionPlannerToast: (...args) => autosaveStatuses.push(["toast", ...args]),
    win,
  });
  return {
    autosaveStatuses,
    handledKeys,
    manifest,
    rawValues,
    service,
    setHydrated: (nextValue) => {
      hydrated = Boolean(nextValue);
    },
    setRevision: (nextRevision) => {
      revision = Number(nextRevision) || 0;
    },
    snapshots,
    syncStatuses,
    syncCalls,
    timers,
    win,
  };
}

test("central sync runtime queues protected writes with revision metadata and flushes through the bridge", async () => {
  const harness = createServiceHarness({
    syncResult: {
      ok: true,
      value: "{\"blocks\":[]}",
      revision: 12,
      metadata: { revision: 12 },
    },
  });

  harness.service.queueCentralStateWrite("football-session-planner-v1", "{\"blocks\":[]}");
  expect(harness.manifest.entries["football-session-planner-v1"]).toMatchObject({
    label: "Label football-session-planner-v1",
    pendingCentralSync: true,
  });
  expect(harness.autosaveStatuses).toContainEqual(["football-session-planner-v1", "saving", "Saving"]);
  expect(harness.timers.size).toBeGreaterThanOrEqual(1);

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
  expect(harness.manifest.entries["football-session-planner-v1"]).toMatchObject({
    serverRevision: 12,
  });
  expect(harness.autosaveStatuses).toContainEqual(["football-session-planner-v1", "saved", "Saved"]);
});

test("central sync runtime keeps unauthorized automatic pending retries local without queueing a POST", async () => {
  const key = "football-medical-team-v1";
  const harness = createServiceHarness({ writeAccess: { [key]: false } });
  harness.rawValues.set(key, "{\"injuryPlans\":[{\"id\":\"pending-plan\"}]}");
  harness.manifest.entries[key] = {
    label: "Medical Room",
    pendingCentralSync: true,
  };

  harness.service.retryCentral(() => harness.manifest);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.timers.size).toBe(0);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
  expect(harness.manifest.lastCentralError).toBe("");
});

test("central sync runtime stops an automatic retry when access is revoked before flush", async () => {
  const key = "football-medical-team-v1";
  const writeAccess = { [key]: true };
  const harness = createServiceHarness({ writeAccess });
  harness.rawValues.set(key, "{\"injuryPlans\":[]}");
  harness.manifest.entries[key] = {
    label: "Medical Room",
    pendingCentralSync: true,
  };

  harness.service.retryCentral(() => harness.manifest);
  writeAccess[key] = false;
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
});

test("central sync runtime sends an explicit write to the backend even when cached access is false", async () => {
  const key = "football-schedule-v1";
  const harness = createServiceHarness({
    writeAccess: { [key]: false },
    syncResult: { ok: true, value: "{\"events\":[]}", revision: 8 },
  });

  harness.service.queueCentralStateWrite(key, "{\"events\":[]}");
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key,
      value: "{\"events\":[]}",
      options: { removed: false, baseRevision: 7 },
    },
  ]);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 8,
  });
});

test("central sync runtime does not retry a permission-denied write loop", async () => {
  const key = "football-medical-team-v1";
  const reason = "You do not have edit access for medical-team.";
  const harness = createServiceHarness({
    syncResult: { ok: false, status: 403, reason },
  });

  harness.service.queueCentralStateWrite(key, "{\"injuryPlans\":[]}");
  await harness.service.flushCentralStateWrites();
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toHaveLength(1);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
  expect(harness.manifest.lastCentralError).toBe(reason);
  expect(harness.syncStatuses).toContainEqual([key, "issue", reason]);
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);
});

test("central sync runtime reports saving and server-confirmed status for Set Pieces", async () => {
  const harness = createServiceHarness({ syncResult: { ok: true, value: "{\"plays\":[]}", revision: 8 } });
  harness.service.queueCentralStateWrite("football-set-pieces-room-v1", "{\"plays\":[]}");
  expect(harness.syncStatuses).toContainEqual(["football-set-pieces-room-v1", "saving", "Saving"]);

  await harness.service.flushCentralStateWrites();

  expect(harness.syncStatuses).toContainEqual(["football-set-pieces-room-v1", "saved", "Saved"]);
});

test("central sync runtime keeps the highest acknowledged server revision", async () => {
  for (const syncResult of [
    { ok: true, value: "{\"blocks\":[]}" },
    { ok: true, value: "{\"blocks\":[]}", revision: 8 },
  ]) {
    const harness = createServiceHarness({ syncResult });
    harness.manifest.entries["football-session-planner-v1"] = {
      label: "Session Planner",
      serverRevision: 9,
    };

    harness.service.queueCentralStateWrite("football-session-planner-v1", "{\"blocks\":[]}");
    await harness.service.flushCentralStateWrites();

    expect(harness.manifest.entries["football-session-planner-v1"]).toMatchObject({
      serverRevision: 9,
    });
  }
});

test("central sync runtime persists the acknowledged revision after a conflict retry", async () => {
  const harness = createServiceHarness({
    syncResults: [
      { ok: false, conflict: true, status: 409, currentRevision: 10 },
      { ok: true, value: "{\"blocks\":[]}", revision: 11 },
    ],
  });

  harness.service.queueCentralStateWrite("football-session-planner-v1", "{\"blocks\":[]}");
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-session-planner-v1",
      value: "{\"blocks\":[]}",
      options: { removed: false, baseRevision: 7 },
    },
    {
      key: "football-session-planner-v1",
      value: "{\"blocks\":[]}",
      options: { removed: false, baseRevision: 10 },
    },
  ]);
  expect(harness.manifest.entries["football-session-planner-v1"]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 11,
  });
});

test("central sync runtime reconciles a non-session conflict before clearing pending state", async () => {
  const value = "{\"events\":[{\"id\":\"training-1\"}]}";
  const harness = createServiceHarness({
    syncResult: { ok: false, conflict: true, status: 409, currentRevision: 10 },
    onHydrate: ({ setRevision }) => {
      setRevision(10);
    },
  });
  harness.rawValues.set("football-schedule-v1", value);

  harness.service.queueCentralStateWrite("football-schedule-v1", value);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value,
      options: { removed: false, baseRevision: 7 },
    },
    {
      hydrate: true,
      options: { forceApply: true },
    },
  ]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 10,
  });
  expect(harness.autosaveStatuses).toContainEqual(["football-schedule-v1", "saved", "Saved"]);
});

test("central sync runtime retries presentation mode conflicts so quick deletes do not restore old objects", async () => {
  const key = "football-dashboard-presentation-mode-v1";
  const deletedShapeValue = JSON.stringify({
    schema: "footballscience-presentation-mode-v1",
    version: 1,
    decks: {
      "2026-08-11": {
        updatedAt: "2026-08-11T12:00:02.000Z",
        infoSlides: [],
        shapes: {},
        textBoxes: {},
      },
    },
  });
  const harness = createServiceHarness({
    retryConflictStorageKeys: [key],
    syncResults: [
      { ok: false, conflict: true, status: 409, currentRevision: 10 },
      { ok: true, value: deletedShapeValue, revision: 11 },
    ],
  });
  harness.rawValues.set(key, deletedShapeValue);

  harness.service.queueCentralStateWrite(key, deletedShapeValue);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key,
      value: deletedShapeValue,
      options: { removed: false, baseRevision: 7 },
    },
    {
      key,
      value: deletedShapeValue,
      options: { removed: false, baseRevision: 10 },
    },
  ]);
  expect(harness.syncCalls.some((call) => call.hydrate)).toBe(false);
  expect(harness.rawValues.get(key)).toBe(deletedShapeValue);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 11,
  });
  expect(harness.autosaveStatuses).toContainEqual([key, "saved", "Saved"]);
});

test("central sync runtime keeps a non-session conflict pending when fresh hydration fails", async () => {
  const value = "{\"events\":[{\"id\":\"training-1\"}]}";
  const harness = createServiceHarness({
    hydrateResult: false,
    syncResult: { ok: false, conflict: true, status: 409, currentRevision: 10 },
  });
  harness.rawValues.set("football-schedule-v1", value);

  harness.service.queueCentralStateWrite("football-schedule-v1", value);
  await harness.service.flushCentralStateWrites();

  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
  });
  expect(harness.autosaveStatuses).toContainEqual([
    "football-schedule-v1",
    "issue",
    "Sync needs attention",
  ]);
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

test("central sync runtime merges presentation mode values before applying server conflict data", () => {
  const harness = createServiceHarness();
  harness.rawValues.set("football-dashboard-presentation-mode-v1", "local-presentation");

  harness.service.applyCentralSyncedStateValue(
    { key: "football-dashboard-presentation-mode-v1", value: "local-presentation" },
    "server-presentation"
  );

  expect(harness.rawValues.get("football-dashboard-presentation-mode-v1")).toBe(
    "presentation:local-presentation:server-presentation"
  );
  expect(harness.handledKeys).toEqual([
    {
      key: "football-dashboard-presentation-mode-v1",
      value: "presentation:local-presentation:server-presentation",
    },
  ]);
});

test("central sync runtime waits for hydration before flushing queued writes", async () => {
  const harness = createServiceHarness({ hydrated: false, revision: 0 });

  harness.service.queueCentralStateWrite("football-session-planner-v1", "{\"blocks\":[]}");
  const initialFlush = Array.from(harness.timers.values())[0];
  expect(typeof initialFlush).toBe("function");
  await initialFlush();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.timers.size).toBeGreaterThanOrEqual(1);
  expect(harness.manifest.entries["football-session-planner-v1"]).toMatchObject({
    pendingCentralSync: true,
  });
  expect(harness.manifest.lastCentralError).toBe("Central sync is loading.");

  harness.setRevision(9);
  harness.setHydrated(true);
  const retryFlush = Array.from(harness.timers.values()).at(-1);
  expect(typeof retryFlush).toBe("function");
  await retryFlush();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-session-planner-v1",
      value: "{\"blocks\":[]}",
      options: { removed: false, baseRevision: 9 },
    },
  ]);
  expect(harness.manifest.lastCentralError).toBe("");
});

test("central sync runtime keeps chat and workspace rendering outside the service", () => {
  const serviceSource = readFileSync(new URL("../src/core/central-sync-runtime-service.mjs", import.meta.url), "utf8");
  const facadeSource = readFileSync(new URL("../src/core/central-runtime-facade.mjs", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../app-runtime.js", import.meta.url), "utf8");

  expect(serviceSource).toContain("handleSyncedStateValue");
  expect(serviceSource).not.toMatch(/renderDashboardChatWidget|renderMedicalTeamWorkspace|renderPlayerProfilesWorkspace|renderScoutingWorkspace/);
  expect(facadeSource).toContain("createCentralSyncRuntimeService({");
  expect(facadeSource).not.toMatch(/renderDashboardChatWidget|renderMedicalTeamWorkspace|renderPlayerProfilesWorkspace|renderScoutingWorkspace/);
  expect(runtimeSource).toContain("function handleCentralSyncedStateValue");
  expect(runtimeSource).toContain("createCentralRuntimeFacade({");
  expect(runtimeSource).not.toContain("createCentralSyncRuntimeService({");
});
