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
  let hydrating = Boolean(options.hydrating);
  let lastError = String(options.lastError || "");
  let hydrationError = String(options.hydrationError || "");
  let revision = Number.isInteger(Number(options.revision)) ? Number(options.revision) : 7;
  let principalEpoch = Number.isInteger(Number(options.principalEpoch)) ? Number(options.principalEpoch) : 1;
  let currentUser = options.currentUser ?? { id: "coach-1", clubId: "club-1", teamId: "team-1" };
  let syncResultIndex = 0;
  let failNextSafeManifestWrite = Boolean(options.failNextSafeManifestWrite);
  const win = {
    footballScienceCentralState: {
      getStatus: () => ({
        hydrating,
        hydrationError,
        lastError,
        principalEpoch,
        metadata: {
          "football-schedule-v1": { revision },
          "football-dashboard-presentation-mode-v1": { revision },
          "football-session-planner-v1": { revision },
          "football-medical-team-v1": { revision },
        },
      }),
      isCentralKey: () => true,
      isHydrated: () => hydrated,
      canWriteKey: (key) => options.writeAccess?.[key] !== false,
      canAutoRetryKey: (key) => options.autoRetryAccess?.[key] !== false,
      syncKey: async (key, value, syncOptions) => {
        const { isGenerationCurrent: _isGenerationCurrent, ...recordedOptions } = syncOptions || {};
        syncCalls.push({ key, value, options: recordedOptions });
        let result;
        if (typeof options.syncKey === "function") {
          result = await options.syncKey({ key, value, syncOptions, syncCalls });
        } else if (Array.isArray(options.syncResults)) {
          result = options.syncResults[Math.min(syncResultIndex, options.syncResults.length - 1)];
          syncResultIndex += 1;
        } else {
          result = options.syncResult ?? { ok: true, value };
        }
        if (!result?.ok || options.preserveSyncResult === true) {
          return result;
        }
        return {
          ...result,
          key: Object.prototype.hasOwnProperty.call(result, "key") ? result.key : key,
          revision: Number.isInteger(Number(result.revision))
            ? Number(result.revision)
            : Number(syncOptions?.baseRevision || 0) + 1,
        };
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
        if (options.hydratePayload !== undefined) {
          return options.hydratePayload;
        }
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
    getCurrentUser: () => currentUser,
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
    mutateManifestWithResult: (mutator) => {
      const draft = structuredClone(manifest);
      mutator(draft);
      if (failNextSafeManifestWrite) {
        failNextSafeManifestWrite = false;
        options.onSafeManifestPersistenceFailure?.({ manifest, rawValues });
        return { manifest: draft, persisted: false };
      }
      Object.keys(manifest).forEach((key) => delete manifest[key]);
      Object.assign(manifest, draft);
      return { manifest, persisted: true };
    },
    periodizationStorageKey: "football-periodization-v2",
    queueSnapshot: (reason) => snapshots.push(reason),
    queueStatusRefresh: () => {},
    rawGetItem: (key) => rawValues.get(key) ?? null,
    rawSetItem: (key, value) => {
      rawValues.set(key, value);
    },
    readManifest: () => manifest,
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
  const queueCentralStateWrite = service.queueCentralStateWrite.bind(service);
  service.queueCentralStateWrite = (key, value, queueOptions = {}) => {
    if (queueOptions.removed) {
      rawValues.delete(key);
    } else {
      rawValues.set(key, String(value ?? ""));
    }
    return queueCentralStateWrite(key, value, queueOptions);
  };
  return {
    autosaveStatuses,
    handledKeys,
    manifest,
    rawValues,
    service,
    setHydrated: (nextValue) => {
      hydrated = Boolean(nextValue);
    },
    setHydrating: (nextValue) => {
      hydrating = Boolean(nextValue);
    },
    setHydrationError: (nextValue) => {
      hydrationError = String(nextValue || "");
    },
    setCurrentUser: (nextUser) => {
      currentUser = nextUser;
    },
    setLastError: (nextValue) => {
      lastError = String(nextValue || "");
    },
    setRevision: (nextRevision) => {
      revision = Number(nextRevision) || 0;
    },
    setPrincipalEpoch: (nextEpoch) => {
      principalEpoch = Number(nextEpoch) || 0;
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

test("central sync runtime keeps reconcile-blocked automatic retries pending until a fresh snapshot allows them", async () => {
  const key = "football-medical-team-v1";
  const autoRetryAccess = { [key]: false };
  const harness = createServiceHarness({ autoRetryAccess });
  harness.rawValues.set(key, "{\"injuryPlans\":[{\"id\":\"pending-plan-b\"}]}");
  harness.manifest.entries[key] = {
    label: "Medical Room",
    pendingCentralSync: true,
    principalScope: "coach-1:club-1:team-1",
    serverRevision: 7,
  };

  harness.service.retryCentral(() => harness.manifest);
  await harness.service.flushCentralStateWrites();
  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true, serverRevision: 7 });

  autoRetryAccess[key] = true;
  harness.service.retryCentral(() => harness.manifest);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([{
    key,
    value: "{\"injuryPlans\":[{\"id\":\"pending-plan-b\"}]}",
    options: { removed: false, baseRevision: 7 },
  }]);
});

test("central sync runtime stops an automatic retry when access is revoked before flush", async () => {
  const key = "football-medical-team-v1";
  const writeAccess = { [key]: true };
  const harness = createServiceHarness({ writeAccess });
  harness.rawValues.set(key, "{\"injuryPlans\":[]}");
  harness.manifest.entries[key] = {
    label: "Medical Room",
    pendingCentralSync: true,
    principalScope: "coach-1:club-1:team-1",
  };

  harness.service.retryCentral(() => harness.manifest);
  writeAccess[key] = false;
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
});

test("central sync runtime rechecks automatic retry eligibility immediately before send", async () => {
  const key = "football-medical-team-v1";
  const autoRetryAccess = { [key]: true };
  const harness = createServiceHarness({ autoRetryAccess });
  harness.rawValues.set(key, "{\"injuryPlans\":[{\"id\":\"pending-b\"}]}");
  harness.manifest.entries[key] = {
    label: "Medical Room",
    pendingCentralSync: true,
    principalScope: "coach-1:club-1:team-1",
    serverRevision: 7,
  };

  harness.service.retryCentral(() => harness.manifest);
  autoRetryAccess[key] = false;
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: true,
    principalScope: "coach-1:club-1:team-1",
    serverRevision: 7,
  });
});

test("central sync runtime never sends or acknowledges a queued generation under another principal", async () => {
  const key = "football-medical-team-v1";
  let resolveWrite;
  const deferredWrite = new Promise((resolve) => { resolveWrite = resolve; });
  const harness = createServiceHarness({
    syncKey: async () => deferredWrite,
  });
  const value = "{\"injuryPlans\":[{\"id\":\"principal-a\"}]}";

  harness.service.queueCentralStateWrite(key, value);
  const flush = harness.service.flushCentralStateWrites();
  await expect.poll(() => harness.syncCalls.length).toBe(1);
  harness.setCurrentUser({ id: "coach-2", clubId: "club-2", teamId: "team-2" });
  resolveWrite({ ok: true, key, value, revision: 8 });
  await flush;

  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: true,
    principalScope: "coach-1:club-1:team-1",
  });
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);

  harness.service.retryCentral(() => harness.manifest);
  await harness.service.flushCentralStateWrites();
  expect(harness.syncCalls).toHaveLength(1);
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

for (const invalidAcknowledgement of [
  { label: "missing key", result: { ok: true, value: "A", revision: 99 } },
  { label: "stale revision", result: { ok: true, key: "football-schedule-v1", value: "A", revision: 7 } },
]) {
  test(`central sync runtime keeps pending data when an acknowledgement has ${invalidAcknowledgement.label}`, async () => {
    const key = "football-schedule-v1";
    const harness = createServiceHarness({
      preserveSyncResult: true,
      syncResult: invalidAcknowledgement.result,
    });

    harness.service.queueCentralStateWrite(key, "A");
    await harness.service.flushCentralStateWrites();

    expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
    expect(harness.manifest.entries[key].serverRevision).toBeUndefined();
    expect(harness.syncStatuses).toContainEqual([
      key,
      "issue",
      "Central sync acknowledgement did not match the queued write.",
    ]);
  });
}

test("central sync runtime allows a later valid explicit write after an operation-level 403", async () => {
  const key = "football-medical-team-v1";
  const harness = createServiceHarness({
    syncResults: [
      { ok: false, status: 403, reason: "Operation denied." },
      { ok: true, key, value: "B", revision: 8 },
    ],
  });

  harness.service.queueCentralStateWrite(key, "A");
  await harness.service.flushCentralStateWrites();
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });

  harness.service.queueCentralStateWrite(key, "B");
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls.filter((call) => call.key === key).map(({ value }) => value)).toEqual(["A", "B"]);
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

test("central sync runtime drains a newer queued generation after an in-flight acknowledgement", async () => {
  const key = "football-schedule-v1";
  const firstValue = "{\"events\":[{\"id\":\"training-a\"}]}";
  const secondValue = "{\"events\":[{\"id\":\"training-b\"}]}";
  let resolveFirstWrite;
  const firstWrite = new Promise((resolve) => {
    resolveFirstWrite = resolve;
  });
  const harness = createServiceHarness({
    syncKey: async ({ value, syncOptions, syncCalls }) => {
      if (syncCalls.length === 1) {
        return firstWrite;
      }
      if (Number(syncOptions?.baseRevision) === 7) {
        return { ok: false, conflict: true, status: 409, currentRevision: 8 };
      }
      return { ok: true, key, value, revision: 9 };
    },
  });

  harness.service.queueCentralStateWrite(key, firstValue);
  const firstFlush = harness.service.flushCentralStateWrites();
  await expect.poll(() => harness.syncCalls.length).toBe(1);

  harness.service.queueCentralStateWrite(key, secondValue);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });

  resolveFirstWrite({ ok: true, value: firstValue, revision: 8 });
  await firstFlush;

  expect(harness.syncCalls).toHaveLength(1);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);

  const followUpFlush = Array.from(harness.timers.values()).at(-1);
  expect(typeof followUpFlush).toBe("function");
  await followUpFlush();

  expect(harness.syncCalls).toEqual([
    { key, value: firstValue, options: { removed: false, baseRevision: 7 } },
    { key, value: secondValue, options: { removed: false, baseRevision: 7 } },
    { key, value: secondValue, options: { removed: false, baseRevision: 8 } },
  ]);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 9,
  });
});

test("central sync runtime schedules one bounded drain when A fails while B is already queued", async () => {
  const key = "football-schedule-v1";
  let resolveFirstWrite;
  const firstWrite = new Promise((resolve) => { resolveFirstWrite = resolve; });
  const harness = createServiceHarness({
    syncKey: async ({ value, syncCalls }) => {
      if (syncCalls.length === 1) {
        return firstWrite;
      }
      return { ok: true, key, value, revision: 8 };
    },
  });

  harness.service.queueCentralStateWrite(key, "A");
  const firstFlush = harness.service.flushCentralStateWrites();
  await expect.poll(() => harness.syncCalls.length).toBe(1);
  harness.service.queueCentralStateWrite(key, "B");
  const bTimer = Array.from(harness.timers.values()).at(-1);
  await bTimer();

  resolveFirstWrite({ ok: false, status: 0, reason: "Network unavailable." });
  await firstFlush;

  const retryTimer = Array.from(harness.timers.values()).at(-1);
  expect(typeof retryTimer).toBe("function");
  expect(harness.timers.size).toBeGreaterThanOrEqual(2);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });

  await retryTimer();
  expect(harness.syncCalls.map(({ value }) => value)).toEqual(["A", "B"]);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: false });
});

test("central sync runtime gives B its own bounded attempt after A exhausts two network attempts", async () => {
  const keyA = "football-schedule-v1";
  const keyB = "football-medical-team-v1";
  let aAttempts = 0;
  const harness = createServiceHarness({
    syncKey: async ({ key, value }) => {
      if (key === keyA) {
        aAttempts += 1;
        return { ok: false, status: 0, reason: `Network failure ${aAttempts}` };
      }
      return { ok: true, key, value, revision: 8 };
    },
  });

  harness.service.queueCentralStateWrite(keyA, "A");
  harness.service.queueCentralStateWrite(keyB, "B");
  await harness.service.flushCentralStateWrites();
  const retryA = Array.from(harness.timers.values()).at(-1);
  await retryA();
  const drainB = Array.from(harness.timers.values()).at(-1);
  await drainB();

  expect(harness.syncCalls.filter((call) => call.key).map(({ key }) => key)).toEqual([keyA, keyA, keyB]);
  expect(harness.manifest.entries[keyA]).toMatchObject({ pendingCentralSync: true });
  expect(harness.manifest.entries[keyB]).toMatchObject({ pendingCentralSync: false });
});

test("central sync runtime keeps manifest retry intent sticky until A, B, and C are drained", async () => {
  const activeKey = "football-schedule-v1";
  const pendingKey = "football-medical-team-v1";
  let resolveA;
  const aWrite = new Promise((resolve) => { resolveA = resolve; });
  const harness = createServiceHarness({
    syncKey: async ({ key, value, syncCalls }) => {
      if (syncCalls.length === 1) {
        return aWrite;
      }
      return { ok: true, key, value, revision: key === activeKey ? 9 : 8 };
    },
  });
  harness.rawValues.set(pendingKey, "C");
  harness.manifest.entries[pendingKey] = {
    label: "Medical Room",
    pendingCentralSync: true,
    principalScope: "coach-1:club-1:team-1",
  };

  harness.service.queueCentralStateWrite(activeKey, "A");
  const aFlush = harness.service.flushCentralStateWrites();
  await expect.poll(() => harness.syncCalls.length).toBe(1);
  harness.service.queueCentralStateWrite(activeKey, "B");
  harness.service.retryCentral(() => harness.manifest);

  resolveA({ ok: true, key: activeKey, value: "A", revision: 8 });
  await aFlush;
  const bFlush = Array.from(harness.timers.values()).at(-1);
  await bFlush();
  const cFlush = Array.from(harness.timers.values()).at(-1);
  await cFlush();

  expect(harness.syncCalls.filter((call) => call.key).map(({ key, value }) => [key, value])).toEqual([
    [activeKey, "A"],
    [activeKey, "B"],
    [pendingKey, "C"],
  ]);
  expect(harness.manifest.entries[pendingKey]).toMatchObject({ pendingCentralSync: false });
});

test("central sync runtime revisits a ready-event manifest retry after an unrelated write finishes", async () => {
  const activeKey = "football-schedule-v1";
  const pendingKey = "football-medical-team-v1";
  let resolveActiveWrite;
  const activeWrite = new Promise((resolve) => { resolveActiveWrite = resolve; });
  const harness = createServiceHarness({
    syncKey: async ({ key, value }) => {
      if (key === activeKey) {
        return activeWrite;
      }
      return { ok: true, value, revision: 8 };
    },
  });
  harness.rawValues.set(pendingKey, "{\"injuryPlans\":[{\"id\":\"pending-plan\"}]}");
  harness.manifest.entries[pendingKey] = {
    label: "Medical Room",
    pendingCentralSync: true,
    principalScope: "coach-1:club-1:team-1",
  };

  harness.service.queueCentralStateWrite(activeKey, "{\"events\":[]}");
  const activeFlush = harness.service.flushCentralStateWrites();
  await expect.poll(() => harness.syncCalls.length).toBe(1);
  harness.service.retryCentral(() => harness.manifest);

  resolveActiveWrite({ ok: true, value: "{\"events\":[]}", revision: 8 });
  await activeFlush;
  const followUpFlush = Array.from(harness.timers.values()).at(-1);
  expect(typeof followUpFlush).toBe("function");
  await followUpFlush();

  expect(harness.syncCalls.map(({ key }) => key)).toEqual([activeKey, pendingKey]);
  expect(harness.manifest.entries[pendingKey]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 8,
  });
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

test("central sync runtime retries a current Schedule conflict before clearing pending state", async () => {
  const value = "{\"events\":[{\"id\":\"training-1\"}]}";
  const harness = createServiceHarness({
    syncResults: [
      { ok: false, conflict: true, status: 409, currentRevision: 10 },
      { ok: true, key: "football-schedule-v1", value, revision: 11 },
    ],
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
      key: "football-schedule-v1",
      value,
      options: { removed: false, baseRevision: 10 },
    },
  ]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 11,
  });
  expect(harness.autosaveStatuses).toContainEqual(["football-schedule-v1", "saved", "Saved"]);
});

test("central sync runtime never hydrates stale A over B and retries B with the fresh revision", async () => {
  const key = "football-schedule-v1";
  const firstValue = "{\"events\":[{\"id\":\"training-a\"}]}";
  const secondValue = "{\"events\":[{\"id\":\"training-b\"}]}";
  let resolveFirstWrite;
  let postCount = 0;
  const firstWrite = new Promise((resolve) => {
    resolveFirstWrite = resolve;
  });
  const harness = createServiceHarness({
    syncKey: async ({ value, syncOptions }) => {
      postCount += 1;
      if (postCount === 1) {
        return firstWrite;
      }
      if (Number(syncOptions?.baseRevision) === 7) {
        return { ok: false, conflict: true, status: 409, currentRevision: 10 };
      }
      return { ok: true, key, value, revision: 11 };
    },
  });

  harness.rawValues.set(key, firstValue);
  harness.service.queueCentralStateWrite(key, firstValue);
  const firstFlush = harness.service.flushCentralStateWrites();
  await expect.poll(() => postCount).toBe(1);

  harness.rawValues.set(key, secondValue);
  harness.service.queueCentralStateWrite(key, secondValue);
  resolveFirstWrite({ ok: false, conflict: true, status: 409, currentRevision: 10 });
  await firstFlush;

  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);

  const followUpFlush = Array.from(harness.timers.values()).at(-1);
  expect(typeof followUpFlush).toBe("function");
  await followUpFlush();

  expect(harness.syncCalls.filter((call) => call.key === key)).toEqual([
    { key, value: firstValue, options: { removed: false, baseRevision: 7 } },
    { key, value: secondValue, options: { removed: false, baseRevision: 7 } },
    { key, value: secondValue, options: { removed: false, baseRevision: 10 } },
  ]);
  expect(harness.syncCalls.some((call) => call.hydrate)).toBe(false);
  expect(harness.manifest.entries[key]).toMatchObject({
    pendingCentralSync: false,
    serverRevision: 11,
  });
  expect(harness.rawValues.get(key)).toBe(secondValue);
});

test("central sync runtime never lets B acknowledgement overwrite a newer local C generation", async () => {
  const key = "football-medical-team-v1";
  const serverValue = "SERVER";
  let resolveA;
  let resolveB;
  const aWrite = new Promise((resolve) => { resolveA = resolve; });
  const bWrite = new Promise((resolve) => { resolveB = resolve; });
  let postCount = 0;
  const harness = createServiceHarness({
    hydratePayload: {
      ok: true,
      entries: { [key]: serverValue },
      metadata: { [key]: { revision: 10 } },
    },
    onHydrate: ({ setRevision }) => {
      setRevision(10);
    },
    syncKey: async () => {
      postCount += 1;
      return postCount === 1 ? aWrite : bWrite;
    },
  });

  harness.rawValues.set(key, "A");
  harness.service.queueCentralStateWrite(key, "A");
  const aFlush = harness.service.flushCentralStateWrites();
  await expect.poll(() => postCount).toBe(1);
  harness.rawValues.set(key, "B");
  harness.service.queueCentralStateWrite(key, "B");
  resolveA({ ok: false, conflict: true, status: 409, currentRevision: 10 });
  await aFlush;

  const bFlushCallback = Array.from(harness.timers.values()).at(-1);
  const bFlush = bFlushCallback();
  await expect.poll(() => postCount).toBe(2);
  harness.rawValues.set(key, "C");
  harness.service.queueCentralStateWrite(key, "C");
  resolveB({ ok: true, key, value: "B", revision: 11 });
  await bFlush;

  expect(harness.rawValues.get(key)).toBe("C");
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
});

test("central sync runtime never acknowledges an older response over a newer cross-tab generation", async () => {
  const key = "football-medical-team-v1";
  let resolveA;
  const deferredA = new Promise((resolve) => { resolveA = resolve; });
  const harness = createServiceHarness({ syncKey: async () => deferredA });

  harness.service.queueCentralStateWrite(key, "A");
  const flush = harness.service.flushCentralStateWrites();
  await expect.poll(() => harness.syncCalls.length).toBe(1);

  const crossTabEntry = {
    ...harness.manifest.entries[key],
    hash: "hash-cross-tab-b",
    writes: Number(harness.manifest.entries[key].writes || 0) + 1,
    updatedAt: "2026-06-08T12:00:01.000Z",
    pendingCentralSync: false,
    serverRevision: 7,
  };
  harness.rawValues.set(key, "B");
  harness.manifest.entries[key] = crossTabEntry;

  resolveA({ ok: true, key, value: "A", revision: 8 });
  await flush;

  expect(harness.rawValues.get(key)).toBe("B");
  expect(harness.manifest.entries[key]).toEqual(crossTabEntry);
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);
});

test("central sync runtime rejects an in-flight response from an older auth epoch", async () => {
  const key = "football-medical-team-v1";
  let resolveWrite;
  let generationCurrentAtResponse = true;
  const harness = createServiceHarness({
    syncKey: async ({ syncOptions }) => {
      await new Promise((resolve) => { resolveWrite = resolve; });
      generationCurrentAtResponse = syncOptions.isGenerationCurrent();
      return { ok: true, key, value: "A", revision: 8 };
    },
  });

  harness.service.queueCentralStateWrite(key, "A");
  const flush = harness.service.flushCentralStateWrites();
  await expect.poll(() => harness.syncCalls.length).toBe(1);
  harness.setPrincipalEpoch(2);
  resolveWrite();
  await flush;

  expect(generationCurrentAtResponse).toBe(false);
  expect(harness.rawValues.get(key)).toBe("A");
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
  expect(harness.manifest.entries[key].serverRevision).toBeUndefined();
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);
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

  harness.service.applyCentralSyncedStateValue({
    key: "football-schedule-v1",
    value: "local",
    principalScope: "coach-1:club-1:team-1",
  }, "server");

  expect(harness.rawValues.get("football-schedule-v1")).toBe("schedule:server");
  expect(harness.snapshots).toEqual(["central-merge"]);
  expect(harness.handledKeys).toEqual([{ key: "football-schedule-v1", value: "schedule:server" }]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    hash: "hash-15",
    pendingCentralSync: false,
    size: 15,
  });
});

test("central sync runtime restores pending local data when manifest persistence fails after the raw write", async () => {
  const key = "football-medical-team-v1";
  const localValue = JSON.stringify({ injuryPlans: [{ id: "local-a" }] });
  const serverValue = JSON.stringify({ injuryPlans: [{ id: "server" }] });
  const harness = createServiceHarness({
    failNextSafeManifestWrite: true,
    syncResult: { ok: true, key, value: serverValue, revision: 8 },
  });

  harness.service.queueCentralStateWrite(key, localValue);
  const pendingEntry = structuredClone(harness.manifest.entries[key]);
  await harness.service.flushCentralStateWrites();

  expect(harness.rawValues.get(key)).toBe(localValue);
  expect(harness.manifest.entries[key]).toEqual(pendingEntry);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
  expect(harness.manifest.entries[key].serverRevision).toBeUndefined();
  expect(harness.snapshots).toEqual([]);
  expect(harness.handledKeys).toEqual([]);
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);
});

test("central sync runtime never rolls A back over a newer generation after manifest persistence fails", async () => {
  const key = "football-medical-team-v1";
  const localValue = JSON.stringify({ injuryPlans: [{ id: "local-a" }] });
  const serverAndNewerValue = JSON.stringify({ injuryPlans: [{ id: "shared-value" }] });
  let newerEntry;
  const harness = createServiceHarness({
    failNextSafeManifestWrite: true,
    syncResult: { ok: true, key, value: serverAndNewerValue, revision: 8 },
    onSafeManifestPersistenceFailure: ({ manifest, rawValues }) => {
      newerEntry = {
        ...manifest.entries[key],
        hash: "hash-newer-c",
        writes: Number(manifest.entries[key]?.writes || 0) + 1,
        updatedAt: "2026-06-08T12:00:02.000Z",
        pendingCentralSync: true,
      };
      rawValues.set(key, serverAndNewerValue);
      manifest.entries[key] = newerEntry;
    },
  });

  harness.service.queueCentralStateWrite(key, localValue);
  await harness.service.flushCentralStateWrites();

  expect(harness.rawValues.get(key)).toBe(serverAndNewerValue);
  expect(harness.manifest.entries[key]).toEqual(newerEntry);
  expect(harness.manifest.entries[key]).toMatchObject({ pendingCentralSync: true });
  expect(harness.syncStatuses).not.toContainEqual([key, "saved", "Saved"]);
});

test("central sync runtime merges presentation mode values before applying server conflict data", () => {
  const harness = createServiceHarness();
  harness.rawValues.set("football-dashboard-presentation-mode-v1", "local-presentation");

  harness.service.applyCentralSyncedStateValue(
    {
      key: "football-dashboard-presentation-mode-v1",
      value: "local-presentation",
      principalScope: "coach-1:club-1:team-1",
    },
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

test("central sync runtime waits for refresh hydration and uses its acknowledged revision", async () => {
  const harness = createServiceHarness({ hydrated: true, hydrating: true, revision: 2 });

  harness.service.queueCentralStateWrite("football-schedule-v1", "{\"events\":[\"B\"]}");
  const initialFlush = Array.from(harness.timers.values())[0];
  expect(typeof initialFlush).toBe("function");
  await initialFlush();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
  });

  harness.setRevision(3);
  harness.setHydrating(false);
  const retryFlush = Array.from(harness.timers.values()).at(-1);
  expect(typeof retryFlush).toBe("function");
  await retryFlush();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value: "{\"events\":[\"B\"]}",
      options: { removed: false, baseRevision: 3 },
    },
  ]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
  });
});

test("central sync runtime stops retry timers after terminal hydration failure and drains after recovery", async () => {
  const harness = createServiceHarness({
    hydrated: false,
    hydrationError: "Central app data could not be loaded.",
    revision: 2,
  });

  harness.service.queueCentralStateWrite("football-schedule-v1", "{\"events\":[\"B\"]}");
  const failedFlush = Array.from(harness.timers.values())[0];
  expect(typeof failedFlush).toBe("function");
  await failedFlush();

  expect(harness.syncCalls).toEqual([]);
  expect(harness.timers).toHaveProperty("size", 1);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: true,
  });
  expect(harness.manifest.lastCentralError).toBe("Central app data could not be loaded.");
  expect(harness.syncStatuses).toContainEqual([
    "football-schedule-v1",
    "issue",
    "Central app data could not be loaded.",
  ]);

  harness.setHydrationError("");
  harness.setHydrated(true);
  harness.setRevision(3);
  await harness.service.flushCentralStateWrites();

  expect(harness.syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value: "{\"events\":[\"B\"]}",
      options: { removed: false, baseRevision: 3 },
    },
  ]);
  expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
  });
});

for (const previousWriteError of [
  "Previous POST failed.",
  "Previous write returned 409.",
  "Previous write returned 403.",
]) {
  test(`central sync runtime does not treat ${previousWriteError} as a hydration failure`, async () => {
    const harness = createServiceHarness({
      hydrated: true,
      lastError: previousWriteError,
      revision: 4,
    });

    harness.service.queueCentralStateWrite("football-schedule-v1", "{\"events\":[\"B\"]}");
    const flush = Array.from(harness.timers.values())[0];
    expect(typeof flush).toBe("function");
    await flush();

    expect(harness.syncCalls).toEqual([
      {
        key: "football-schedule-v1",
        value: "{\"events\":[\"B\"]}",
        options: { removed: false, baseRevision: 4 },
      },
    ]);
    expect(harness.manifest.entries["football-schedule-v1"]).toMatchObject({
      pendingCentralSync: false,
    });
  });
}

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
