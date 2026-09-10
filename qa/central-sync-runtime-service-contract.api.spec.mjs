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

test("retry never acknowledges the read-only Sessions baseline as the missing pending edit", async () => {
  const harness = createServiceHarness({ cachedInfo: { source: "central-pending-baseline", serverBacked: true } });
  const key = "football-session-planner-v1";
  harness.rawValues.set(key, "central baseline");
  harness.manifest.entries[key] = { pendingCentralSync: true, hash: "local-unsaved" };
  harness.service.retryCentral(() => harness.manifest);
  await harness.service.flushCentralStateWrites();
  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries[key]).toEqual({ pendingCentralSync: true, hash: "local-unsaved" });
});

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
          "football-medical-team-v1": { revision },
        },
      }),
      isCentralKey: () => true,
      getCachedValueInfo: () => options.cachedInfo || {},
      isHydrated: () => hydrated,
      canAutoSyncKey: (key) =>
        typeof options.canAutoSyncKey === "function" ? options.canAutoSyncKey(key) : true,
      syncKey: async (key, value, syncOptions) => {
        syncCalls.push({ key, value, options: syncOptions });
        if (typeof options.syncKey === "function") {
          return options.syncKey({ key, value, syncOptions });
        }
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
      if (key === options.failCacheKey) throw new Error("Browser cache quota exceeded");
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

test("an acknowledged Sessions save with a cache failure does not discard other modules' queued writes", async () => {
  const session = "football-session-planner-v1", other = "football-medical-team-v1";
  const h = createServiceHarness({ failCacheKey: session, syncKey: async ({ key, value }) => ({ ok: true, value: key === session ? "merged central training" : value, metadata: { revision: 8 } }) });
  h.rawValues.set(session, "local training"); h.rawValues.set(other, "medical edit");
  h.service.queueCentralStateWrite(session, "local training");
  h.service.queueCentralStateWrite(other, "medical edit");
  expect(await h.service.flushCentralStateWrites()).toBe(true);
  expect(h.syncCalls.map((call) => call.key)).toEqual([session, other]);
  expect(h.manifest.entries[session].pendingCentralSync).toBe(false);
  expect(h.rawValues.get(session)).toBe("local training");
  expect(h.autosaveStatuses).toContainEqual([session, "issue", "Training saved centrally; browser cache could not be refreshed."]);
  expect(h.autosaveStatuses.some(([key, status]) => key === session && status === "saved")).toBe(false);
});

test("denied durable Sessions writes remain pending without blocking another module", async () => {
  const key = "football-session-planner-v1", other = "football-medical-team-v1";
  const h = createServiceHarness({ syncKey: async ({ key: current, value }) => current === key ? { ok: false, status: 403, durablePending: true, reason: "Access denied; local edit retained" } : { ok: true, value } });
  h.rawValues.set(key, "local draft"); h.rawValues.set(other, "permitted edit");
  h.service.queueCentralStateWrite(key, "local draft"); h.service.queueCentralStateWrite(other, "permitted edit");
  expect(await h.service.flushCentralStateWrites()).toBe(true);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.syncCalls.map((call) => call.key)).toEqual([key, other]);
  expect(h.autosaveStatuses.some(([current, status]) => current === key && status === "saved")).toBe(false);
});

test("central sync runtime queues protected writes with revision metadata and flushes through the bridge", async () => {
  const harness = createServiceHarness({
    syncResult: {
      ok: true,
      value: "{\"blocks\":[]}",
      revision: 12,
      metadata: { revision: 12 },
    },
  });

  harness.rawValues.set("football-session-planner-v1", "{\"blocks\":[]}");
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

test("central sync runtime reports saving and server-confirmed status for Set Pieces", async () => {
  const value = "{\"plays\":[]}";
  const harness = createServiceHarness({ syncResult: { ok: true, value, revision: 8 } });
  harness.rawValues.set("football-set-pieces-room-v1", value);
  harness.service.queueCentralStateWrite("football-set-pieces-room-v1", value);
  expect(harness.syncStatuses).toContainEqual(["football-set-pieces-room-v1", "saving", "Saving"]);

  await harness.service.flushCentralStateWrites();

  expect(harness.syncStatuses).toContainEqual(["football-set-pieces-room-v1", "saved", "Saved"]);
});

test("a Sessions acknowledgement cannot report Saved for a newer local generation", async () => {
  const key = "football-session-planner-v1";
  let finish;
  const h = createServiceHarness({ syncKey: () => new Promise((resolve) => { finish = resolve; }) });
  h.rawValues.set(key, "first");
  h.service.queueCentralStateWrite(key, "first");
  const flushing = h.service.flushCentralStateWrites();
  h.rawValues.set(key, "second");
  h.service.queueCentralStateWrite(key, "second");
  finish({ ok: true, value: "first", revision: 8 });
  await flushing;
  expect(h.autosaveStatuses.filter(([, state]) => state === "saved")).toEqual([]);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
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
  const value = "{\"blocks\":[]}";
  const harness = createServiceHarness({
    syncResults: [
      { ok: false, conflict: true, status: 409, currentRevision: 10 },
      { ok: true, value, revision: 11 },
    ],
  });

  harness.rawValues.set("football-session-planner-v1", value);
  harness.service.queueCentralStateWrite("football-session-planner-v1", value);
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

test("central sync runtime preserves a conflicted Schedule edit instead of force-hydrating it away", async () => {
  const value = "{\"events\":[{\"id\":\"training-1\"}]}";
  const harness = createServiceHarness({
    syncResult: { ok: false, conflict: true, status: 409, currentRevision: 10 },
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
  ]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
  });
  expect(harness.rawValues.get("football-schedule-v1")).toBe(value);
  expect(harness.autosaveStatuses).toContainEqual([
    "football-schedule-v1",
    "issue",
    "Sync needs attention",
  ]);
});

test("central sync runtime serializes overlapping Schedule generations and advances the second base revision", async () => {
  const firstValue = "{\"events\":[{\"id\":\"training-a\"}]}";
  const secondValue = "{\"events\":[{\"id\":\"training-a\"},{\"id\":\"training-b\"}]}";
  let releaseFirstWrite;
  const firstWritePending = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  let callCount = 0;
  const harness = createServiceHarness({
    revision: 7,
    syncKey: async ({ value }) => {
      callCount += 1;
      if (callCount === 1) {
        await firstWritePending;
        harness.setRevision(8);
        return { ok: true, value, revision: 8 };
      }
      harness.setRevision(9);
      return { ok: true, value, revision: 9 };
    },
  });

  harness.rawValues.set("football-schedule-v1", firstValue);
  harness.service.queueCentralStateWrite("football-schedule-v1", firstValue);
  const firstFlush = harness.service.flushCentralStateWrites();

  harness.rawValues.set("football-schedule-v1", secondValue);
  harness.service.queueCentralStateWrite("football-schedule-v1", secondValue);
  const overlappingFlush = harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toHaveLength(1);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
  });

  releaseFirstWrite();
  await Promise.all([firstFlush, overlappingFlush]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
    serverRevision: 8,
  });

  const nextFlush = Array.from(harness.timers.values()).at(-1);
  expect(typeof nextFlush).toBe("function");
  await nextFlush();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value: firstValue,
      options: { removed: false, baseRevision: 7 },
    },
    {
      key: "football-schedule-v1",
      value: secondValue,
      options: { removed: false, baseRevision: 8 },
    },
  ]);
  expect(harness.rawValues.get("football-schedule-v1")).toBe(secondValue);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 9,
  });
});

test("central sync runtime does not borrow an unrelated newer bridge revision", async () => {
  const value = "{\"events\":[{\"id\":\"training-a\"}]}";
  const harness = createServiceHarness({
    revision: 7,
    syncResult: { ok: false, conflict: true, status: 409, currentRevision: 9 },
  });
  harness.rawValues.set("football-schedule-v1", value);

  harness.service.queueCentralStateWrite("football-schedule-v1", value);
  harness.setRevision(9);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value,
      options: { removed: false, baseRevision: 7 },
    },
  ]);
  expect(harness.rawValues.get("football-schedule-v1")).toBe(value);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
  });
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

test("central sync runtime retries pending tombstones even when local raw value is gone", async () => {
  const harness = createServiceHarness({ syncResult: { ok: true, value: "", revision: 12 } });
  harness.manifest.entries["football-schedule-v1"] = {
    label: "Schedule",
    pendingCentralSync: true,
    deletedAt: "2026-06-08T11:59:00.000Z",
  };

  harness.service.retryCentral(() => harness.manifest);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value: "",
      options: { removed: true, baseRevision: 7 },
    },
  ]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
    deletedAt: "2026-06-08T12:00:00.000Z",
    serverRevision: 12,
  });
});

test("central sync runtime leaves denied automatic Medical retries pending without posting", async () => {
  const key = "football-medical-team-v1";
  const value = JSON.stringify({ players: [{ id: "player-1", recommendation: "75%" }] });
  const harness = createServiceHarness({ canAutoSyncKey: () => false });
  harness.rawValues.set(key, value);
  harness.manifest.entries[key] = {
    label: "Medical Room",
    pendingCentralSync: true,
  };

  harness.service.retryCentral(() => harness.manifest);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: true,
  });
});

test("central sync runtime rechecks automatic Medical access immediately before posting", async () => {
  const key = "football-medical-team-v1";
  const value = JSON.stringify({ players: [{ id: "player-1", recommendation: "75%" }] });
  let automaticWriteAllowed = true;
  const harness = createServiceHarness({ canAutoSyncKey: () => automaticWriteAllowed });
  harness.rawValues.set(key, value);
  harness.manifest.entries[key] = {
    label: "Medical Room",
    pendingCentralSync: true,
  };

  harness.service.retryCentral(() => harness.manifest);
  automaticWriteAllowed = false;
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: true,
  });
});

test("central sync runtime still sends explicit Medical writes to backend authorization", async () => {
  const key = "football-medical-team-v1";
  const value = JSON.stringify({ players: [{ id: "player-1", recommendation: "75%" }] });
  const harness = createServiceHarness({
    canAutoSyncKey: () => false,
    syncResult: { ok: true, value, revision: 12 },
  });

  harness.rawValues.set(key, value);
  harness.service.queueCentralStateWrite(key, value);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key,
      value,
      options: { removed: false, baseRevision: 7 },
    },
  ]);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 12,
  });
});

test("central sync runtime clears tombstone intent when a later set resurrects the key", async () => {
  const value = "{\"events\":[{\"id\":\"training-2\"}]}";
  const harness = createServiceHarness({ syncResult: { ok: true, value, revision: 13 } });
  harness.manifest.entries["football-schedule-v1"] = {
    label: "Schedule",
    pendingCentralSync: true,
    deletedAt: "2026-06-08T11:59:00.000Z",
  };
  harness.rawValues.set("football-schedule-v1", value);

  harness.service.queueCentralStateWrite("football-schedule-v1", value);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
    deletedAt: "",
  });

  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value,
      options: { removed: false, baseRevision: 7 },
    },
  ]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
    deletedAt: "",
    serverRevision: 13,
  });
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
