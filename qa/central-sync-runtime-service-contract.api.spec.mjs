import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createCentralSyncRuntimeService } from "../src/core/central-sync-runtime-service.mjs";
import { createSessionSaveClient } from "../src/modules/session-planner/session-save-client.mjs";
import { applySessionDateChange, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";

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
  const manifest = options.manifest || createManifest();
  const rawValues = options.rawValues || new Map();
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
    handleSyncedStateValue: (key, value) => {
      handledKeys.push({ key, value });
      options.onApply?.({ key, value, rawValues, manifest, service });
    },
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
    readManifest: () => manifest,
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

const sharedSaveKeys = [
  "football-schedule-v1", "football-medical-team-v1", "football-player-profiles-v1",
  "football-periodization-v2", "football-session-exercise-library-v1", "football-dashboard-tasks-v1",
];

for (const key of sharedSaveKeys) {
  for (const status of [403, 409]) {
    test(`${key} retains rejected ${status} drafts across restart without automatic overwrite or retry`, async () => {
      const draft = JSON.stringify({ name: "Local unsaved draft" });
      const h = createServiceHarness({
        syncResult: { ok: false, status, currentRevision: 9, reason: "Server refused this write" },
        onHydrate: ({ rawValues }) => rawValues.set(key, "older server snapshot"),
      });
      h.rawValues.set(key, draft);
      h.service.queueCentralStateWrite(key, draft);
      await h.service.flushCentralStateWrites();
      h.service.clearCentralStateWriteTimer();
      expect(h.rawValues.get(key)).toBe(draft);
      expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
      expect(h.manifest.entries[key].centralSyncReview?.status).toBe(status);
      expect(h.syncCalls.filter((call) => call.hydrate)).toEqual([]);
      expect(h.autosaveStatuses.some(([, state]) => state === "saved")).toBe(false);

      // New runtime, persisted manifest/raw: a fresh access snapshot must not retry the refused operation.
      const restarted = createServiceHarness({ manifest: structuredClone(h.manifest), rawValues: new Map(h.rawValues), revision: 99 });
      await restarted.service.retryCentral(() => restarted.manifest);
      await restarted.service.flushCentralStateWrites();
      expect(restarted.syncCalls).toEqual([]);
      expect(restarted.manifest.entries[key].pendingCentralSync).toBe(true);
      expect(restarted.rawValues.get(key)).toBe(draft);

      restarted.rawValues.set(key, "new explicit edit");
      restarted.service.queueCentralStateWrite(key, "new explicit edit");
      await restarted.service.flushCentralStateWrites();
      expect(restarted.syncCalls).toHaveLength(1);
      expect(restarted.syncCalls[0].value).toBe("new explicit edit");
      expect(restarted.manifest.entries[key].pendingCentralSync).toBe(false);
      expect(restarted.manifest.entries[key].centralSyncReview).toBeUndefined();
    });
  }
}

test("one rejected shared draft does not stop another module's accepted write", async () => {
  const key = "football-medical-team-v1", other = "football-schedule-v1";
  const h = createServiceHarness({ syncKey: async ({ key: current, value }) => current === key
    ? { ok: false, status: 403 } : { ok: true, value, revision: 8 } });
  h.rawValues.set(key, "medical draft"); h.rawValues.set(other, "schedule draft");
  h.service.queueCentralStateWrite(key, "medical draft"); h.service.queueCentralStateWrite(other, "schedule draft");
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.map((call) => call.key)).toEqual([key, other]);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.manifest.entries[other].pendingCentralSync).toBe(false);
});

test("late rejection of A must not block newer queued B", async () => {
  const key = "football-medical-team-v1";
  let resolveA;
  const h = createServiceHarness({ syncKey: async ({ value }) => value === "A"
    ? new Promise((resolve) => { resolveA = resolve; }) : { ok: true, value, revision: 8 } });
  h.rawValues.set(key, "A"); h.service.queueCentralStateWrite(key, "A");
  const flushing = h.service.flushCentralStateWrites();
  await Promise.resolve();
  h.rawValues.set(key, "B"); h.service.queueCentralStateWrite(key, "B");
  resolveA({ ok: false, status: 403 });
  await flushing;
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.manifest.entries[key].centralSyncReview).toBeUndefined();
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.map((call) => call.value)).toEqual(["A", "B"]);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(false);
});

for (const status of [403, 409]) {
  test(`rejected ${status} tombstone survives restart without resurrecting or retrying until a new write`, async () => {
    const key = "football-schedule-v1";
    const h = createServiceHarness({ syncResult: { ok: false, status, currentRevision: 8 } });
    h.service.queueCentralStateWrite(key, "", { removed: true });
    await h.service.flushCentralStateWrites();
    expect(h.manifest.entries[key]).toMatchObject({ pendingCentralSync: true, centralSyncReview: { status, baseRevision: 7 } });
    expect(h.manifest.entries[key].deletedAt).not.toBe("");
    const restarted = createServiceHarness({ manifest: structuredClone(h.manifest), rawValues: new Map(h.rawValues) });
    await restarted.service.retryCentral(() => restarted.manifest);
    await restarted.service.flushCentralStateWrites();
    expect(restarted.syncCalls).toEqual([]);
    expect(restarted.rawValues.has(key)).toBe(false);
    restarted.rawValues.set(key, "new explicit value");
    restarted.service.queueCentralStateWrite(key, "new explicit value");
    await restarted.service.flushCentralStateWrites();
    expect(restarted.syncCalls).toHaveLength(1);
    expect(restarted.syncCalls[0].options.removed).toBe(false);
    expect(restarted.manifest.entries[key]).toMatchObject({ deletedAt: "", pendingCentralSync: false });
    expect(restarted.manifest.entries[key].centralSyncReview).toBeUndefined();
  });
}

test("rejection never marks a newer same-value manifest generation for review", async () => {
  const key = "football-medical-team-v1";
  let resolveA;
  const h = createServiceHarness({ syncKey: () => new Promise((resolve) => { resolveA = resolve; }) });
  h.rawValues.set(key, "same value");
  h.manifest.entries[key] = { hash: "original-hash", writes: 1, updatedAt: "A" };
  h.service.queueCentralStateWrite(key, "same value");
  const flushing = h.service.flushCentralStateWrites();
  await Promise.resolve();
  h.manifest.entries[key] = { ...h.manifest.entries[key], writes: 2, updatedAt: "B", serverRevision: 10 };
  const newer = structuredClone(h.manifest.entries[key]);
  resolveA({ ok: false, status: 403 });
  await flushing;
  expect(h.manifest.entries[key]).toEqual(newer);
});

test("automatic write rechecks a persisted rejection hold just before sending", async () => {
  const key = "football-medical-team-v1";
  const h = createServiceHarness();
  h.rawValues.set(key, "draft"); h.service.queueCentralStateWrite(key, "draft", { automatic: true });
  h.manifest.entries[key].centralSyncReview = { status: 409, baseRevision: 7 };
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toEqual([]);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
});

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

test("a Sessions view failure is distinguished from a cache failure after acknowledgement", async () => {
  const key = "football-session-planner-v1", other = "football-medical-team-v1";
  const h = createServiceHarness({
    syncKey: async ({ key: current, value }) => ({ ok: true, value: current === key ? "server merge" : value, metadata: { revision: 8 } }),
    onApply: () => { throw new ReferenceError("private coaching text must not enter diagnostics"); },
  });
  const diagnostics = [];
  h.win.console = { warn: (...args) => diagnostics.push(args) };
  h.rawValues.set(key, "A"); h.rawValues.set(other, "medical");
  h.service.queueCentralStateWrite(key, "A"); h.service.queueCentralStateWrite(other, "medical");
  expect(await h.service.flushCentralStateWrites()).toBe(true);
  expect(h.rawValues.get(key)).toBe("server merge");
  expect(h.syncCalls.map((call) => call.key)).toEqual([key, other]);
  expect(h.autosaveStatuses).toContainEqual([key, "issue", "Training saved centrally; the view could not be refreshed."]);
  expect(JSON.stringify(diagnostics)).not.toContain("private coaching text");
  expect(diagnostics).toContainEqual(["Central save acknowledgement refresh failed", { key, phase: "view", errorType: "ReferenceError" }]);
});

test("a newer Sessions edit made during acknowledgement refresh keeps its pending status", async () => {
  const key = "football-session-planner-v1";
  const h = createServiceHarness({
    syncKey: async () => ({ ok: true, value: "server A", metadata: { revision: 8 } }),
    onApply: ({ rawValues, service }) => {
      rawValues.set(key, "B"); service.queueCentralStateWrite(key, "B");
      throw new Error("view failed after a new edit");
    },
  });
  h.rawValues.set(key, "A"); h.service.queueCentralStateWrite(key, "A");
  await h.service.flushCentralStateWrites();
  expect(h.rawValues.get(key)).toBe("B");
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.autosaveStatuses.at(-1)).toEqual([key, "saving", "Saving"]);
  expect(h.syncCalls).toHaveLength(1);
});

test("acknowledgement cache application restores its caller's hydration flag", () => {
  const h = createServiceHarness();
  const key = "football-session-planner-v1";
  h.rawValues.set(key, "A"); h.win.__footballScienceCentralHydrating = true;
  h.service.applyCentralSyncedStateValue({ key, value: "A" }, "server A");
  expect(h.win.__footballScienceCentralHydrating).toBe(true);
});

test("a shared module view failure cannot drop the remaining acknowledged-save queue", async () => {
  const key = "football-medical-team-v1", other = "football-schedule-v1";
  const h = createServiceHarness({ syncKey: async ({ key: current, value }) => ({ ok: true, value: current === key ? "server medical" : value }),
    onApply: () => { throw new Error("synthetic view failure"); },
  });
  h.rawValues.set(key, "medical"); h.rawValues.set(other, "schedule");
  h.service.queueCentralStateWrite(key, "medical"); h.service.queueCentralStateWrite(other, "schedule");
  expect(await h.service.flushCentralStateWrites()).toBe(true);
  expect(h.syncCalls.map((call) => call.key)).toEqual([key, other]);
  expect(h.manifest.entries[other].pendingCentralSync).toBe(false);
  expect(h.autosaveStatuses).toContainEqual([key, "issue", "Changes saved centrally; the view could not be refreshed."]);
});

test("a newer raw Sessions value is not acknowledged by an earlier successful conflict retry", async () => {
  const key = "football-session-planner-v1";
  const h = createServiceHarness({ syncResults: [{ ok: false, status: 409, revision: 8 }, { ok: true, value: "server A", revision: 9 }],
    onApply: ({ rawValues, manifest }) => {
      rawValues.set(key, "B"); manifest.entries[key] = { pendingCentralSync: true, hash: "B", writes: 20 };
    },
  });
  h.rawValues.set(key, "A"); h.service.queueCentralStateWrite(key, "A");
  await h.service.flushCentralStateWrites();
  expect(h.rawValues.get(key)).toBe("B");
  expect(h.manifest.entries[key]).toEqual({ pendingCentralSync: true, hash: "B", writes: 20 });
  expect(h.autosaveStatuses.some(([, state]) => state === "saved")).toBe(false);
  expect(h.syncCalls).toHaveLength(2);
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

test("an external retry resumes a timed-out queued Sessions save without losing the local edit", async () => {
  const key = "football-session-planner-v1";
  const value = "synthetic unsynced training for two days";
  const h = createServiceHarness({ syncResults: [
    { ok: false, status: 0, durablePending: true, reason: "Request timed out. Try again." },
    { ok: true, value, metadata: { revision: 8 } },
  ] });
  const fireTimer = async () => {
    expect(h.timers.size).toBe(1);
    const [id, callback] = [...h.timers][0];
    h.timers.delete(id);
    await callback();
  };
  h.rawValues.set(key, value);
  h.service.queueCentralStateWrite(key, value);
  await fireTimer();
  expect(h.syncCalls).toHaveLength(1);
  expect(h.timers.size).toBe(0);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.rawValues.get(key)).toBe(value);
  expect(h.autosaveStatuses.some(([, status]) => status === "saved")).toBe(false);

  await h.service.retryCentral(() => h.manifest);
  await h.service.retryCentral(() => h.manifest);
  await fireTimer();
  expect(h.syncCalls).toHaveLength(2);
  expect(h.syncCalls[1].value).toBe(value);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(false);
  expect(h.rawValues.get(key)).toBe(value);
  expect(h.autosaveStatuses.at(-1)).toEqual([key, "saved", "Saved"]);
  expect(h.timers.size).toBe(0);
});

test("external recovery drains the real Sessions journal after a lost reply with server revision checks", async () => {
  const key = "football-session-planner-v1", date = "2026-09-14", scope = "qa-coach:qa-org:qa-team";
  const before = { sessions: { [date]: { date, title: "Training", blocks: [{ id: "block-a", title: "Press", minutes: 15 }] } } };
  before.blockDeletionTombstones = { [date]: {} };
  const desired = structuredClone(before);
  desired.sessions[date].blocks[0].title = "Press together";
  let server = structuredClone(before), revision = 7, id = 0, acknowledge;
  const rows = new Map(), posts = [];
  const client = createSessionSaveClient({
    getScope: () => scope,
    makeId: () => `recovery-edit-${++id}`,
    store: {
      list: async (owner) => [...rows.values()].filter((row) => row.scope === owner).map((row) => structuredClone(row)),
      put: async (row) => { rows.set(row.change.id, structuredClone(row)); },
      remove: async (rowId) => { rows.delete(rowId); },
    },
    send: async (change, baseRevision) => {
      posts.push({ change: structuredClone(change), baseRevision });
      if (baseRevision !== revision) return { ok: false, status: 409, payload: { currentRevision: revision } };
      const applied = applySessionDateChange(server, change);
      expect(applied.ok).toBe(true);
      server = applied.state;
      revision++;
      if (posts.length === 1) return { ok: false, status: 0, payload: { reason: "Request timed out. Try again." } };
      await new Promise((resolve) => { acknowledge = resolve; });
      return { ok: true, payload: { sessionChange: { id: change.id, date, value: sessionDateValue(server, date) }, metadata: { revision } } };
    },
  });
  client.observe(JSON.stringify(before), { revision });
  const h = createServiceHarness({ syncKey: async () => client.replay() });
  h.win.footballScienceCentralState.stageSessionWrite = client.stage;
  h.win.footballScienceCentralState.getSessionPendingState = client.pendingState;
  const value = JSON.stringify(desired);
  h.rawValues.set(key, value);
  h.service.queueCentralStateWrite(key, value, { previousValue: JSON.stringify(before) });
  const fireTimer = () => {
    expect(h.timers.size).toBe(1);
    const [timer, callback] = [...h.timers][0];
    h.timers.delete(timer);
    return callback();
  };
  expect(await fireTimer()).toBe(false);
  expect(server).toEqual(desired);
  expect(rows.size).toBe(1);
  expect(h.timers.size).toBe(0);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  await h.service.retryCentral(() => h.manifest);
  const retry = fireTimer();
  await expect.poll(() => typeof acknowledge).toBe("function");
  expect(posts.map((post) => post.baseRevision)).toEqual([7, 7, 8]);
  expect(new Set(posts.map((post) => post.change.id)).size).toBe(1);
  expect(rows.size).toBe(1);
  expect(h.rawValues.get(key)).toBe(value);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.autosaveStatuses.some(([, status]) => status === "saved")).toBe(false);
  acknowledge();
  expect(await retry).toBe(true);
  expect(server).toEqual(desired);
  expect(server.sessions[date].blocks).toHaveLength(1);
  expect(rows.size).toBe(0);
  expect(await client.isSettled()).toBe(true);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(false);
  expect(h.autosaveStatuses.at(-1)).toEqual([key, "saved", "Saved"]);
  expect(h.timers.size).toBe(0);
});

test("a retry that times out again preserves pending data without a self-scheduled loop", async () => {
  const key = "football-session-planner-v1";
  const h = createServiceHarness({ syncResult: {
    ok: false, status: 0, durablePending: true, reason: "Request timed out. Try again.",
  } });
  h.rawValues.set(key, "local training");
  h.service.queueCentralStateWrite(key, "local training");
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    expect(h.timers.size).toBe(1);
    const [id, callback] = [...h.timers][0];
    h.timers.delete(id);
    await callback();
    expect(h.syncCalls).toHaveLength(attempt);
    expect(h.timers.size).toBe(0);
    expect(h.rawValues.get(key)).toBe("local training");
    expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
    if (attempt === 1) await h.service.retryCentral(() => h.manifest);
  }
  expect(h.autosaveStatuses.some(([, status]) => status === "saved")).toBe(false);
});

test("a timed-out retry acknowledgement cannot clear a newer queued local edit", async () => {
  const key = "football-session-planner-v1";
  let attempt = 0, finishRetry;
  const h = createServiceHarness({ syncKey: async ({ value }) => {
    attempt += 1;
    if (attempt === 1) return { ok: false, status: 0, durablePending: true };
    if (attempt === 2) return new Promise((resolve) => { finishRetry = resolve; });
    return { ok: true, value, revision: 9 };
  } });
  const fire = () => {
    expect(h.timers.size).toBe(1);
    const [id, callback] = [...h.timers][0];
    h.timers.delete(id);
    return callback();
  };
  h.rawValues.set(key, "A");
  h.service.queueCentralStateWrite(key, "A");
  await fire();
  await h.service.retryCentral(() => h.manifest);
  const retry = fire();
  h.rawValues.set(key, "B");
  h.service.queueCentralStateWrite(key, "B");
  await h.service.retryCentral(() => h.manifest);
  finishRetry({ ok: true, value: "A", revision: 8 });
  await retry;
  expect(h.rawValues.get(key)).toBe("B");
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.autosaveStatuses.some(([, status]) => status === "saved")).toBe(false);
  await fire();
  expect(h.syncCalls.map((call) => call.value)).toEqual(["A", "A", "B"]);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(false);
  expect(h.rawValues.get(key)).toBe("B");
  expect(h.timers.size).toBe(0);
});

test("external retry still checks automatic write access before sending a retained write", async () => {
  const key = "football-medical-team-v1";
  let allowed = true;
  const h = createServiceHarness({ canAutoSyncKey: () => allowed, syncResult: { ok: false, status: 0 } });
  h.rawValues.set(key, "private draft");
  h.service.queueCentralStateWrite(key, "private draft", { automatic: true });
  const fire = async () => {
    const [id, callback] = [...h.timers][0];
    h.timers.delete(id);
    await callback();
  };
  await fire();
  await h.service.retryCentral(() => h.manifest);
  allowed = false;
  await fire();
  expect(h.syncCalls).toHaveLength(1);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.rawValues.get(key)).toBe("private draft");
  expect(h.autosaveStatuses.some(([, status]) => status === "saved")).toBe(false);
  expect(h.timers.size).toBe(0);
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
