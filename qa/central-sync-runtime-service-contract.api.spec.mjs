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

test("a ready read retires an active lost receipt before later cache bookkeeping", async () => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const h = createServiceHarness({ getReadScope: () => "actor-A", syncKey: () => barrier });
  const key = "football-medical-team-v1";
  h.rawValues.set(key, "draft");
  h.manifest.entries[key] = { label: "Medical", hash: "draft", writes: 7, updatedAt: "generation-a", serverRevision: 7 };
  h.service.queueCentralStateWrite(key, "draft");
  const flushing = h.service.flushCentralStateWrites();
  await expect.poll(() => h.syncCalls.length).toBe(1);
  h.manifest.entries[key].pendingCentralSync = false;
  h.manifest.entries[key].serverRevision = 8;
  await h.service.retryCentral(() => h.manifest);
  h.manifest.entries[key] = { label: "Medical", writes: 8, serverRevision: 8, hash: "cache-normalization" };
  h.rawValues.set(key, "normalized cache");
  release({ ok: false, status: 503 });
  await flushing;
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(1);
  expect(h.rawValues.get(key)).toBe("normalized cache");
  expect(h.manifest.entries[key].hash).toBe("cache-normalization");
});

test("a previously hydrated runtime waits for the active reconciliation read before retrying", async () => {
  const options = { hydrating: false, syncResult: { ok: false, status: 503 } }, h = createServiceHarness(options), key = "football-schedule-v1";
  h.rawValues.set(key, "draft");
  h.service.queueCentralStateWrite(key, "draft");
  await h.service.flushCentralStateWrites();
  options.hydrating = true;
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(1);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  options.hydrating = false;
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(2);
});

for (const phase of ["before-raw", "after-raw", "after-delete"]) {
test(`a prepared write resumes only when the durable raw generation matches after a crash (${phase})`, async () => {
  const h = createServiceHarness({ getReadScope: () => "actor-A", syncResult: { ok: true, revision: 8 } });
  const key = "football-schedule-v1", removed = phase === "after-delete", value = removed ? "" : "new draft";
  h.manifest.entries[key] = { principalScope: "actor-A", pendingCentralSync: true, localWritePrepared: true,
    hash: `hash-${value.length}`, writes: 7, pendingBaseRevision: 7, serverRevision: 7, deletedAt: removed ? "deleted" : "" };
  if (!removed) h.rawValues.set(key, phase === "before-raw" ? "old" : value);
  const before = structuredClone(h.manifest.entries[key]);
  await h.service.retryCentral(() => h.manifest);
  await h.service.flushCentralStateWrites();
  if (phase === "before-raw") {
    expect(h.syncCalls).toEqual([]);
    expect(h.manifest.entries[key]).toEqual(before);
  } else {
    expect(h.syncCalls).toHaveLength(1);
    expect(h.syncCalls[0]).toMatchObject({ key, value, options: { removed, baseRevision: 7 } });
    expect(h.manifest.entries[key]).toMatchObject({ pendingCentralSync: false, localWritePrepared: false, serverRevision: 8 });
  }
});
}

test("failed pending metadata persistence cannot enqueue a request or report a save", async () => {
  let blocked = true;
  const h = createServiceHarness({ getReadScope: () => "actor-A", failManifestWrite: () => blocked });
  const key = "football-schedule-v1";
  h.rawValues.set(key, "owned draft");
  h.manifest.entries[key] = { principalScope: "actor-A", pendingCentralSync: true, hash: "owned", writes: 7, serverRevision: 7 };
  const before = structuredClone(h.manifest.entries[key]);
  expect(h.service.queueCentralStateWrite(key, "owned draft")).toBe(false);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toEqual([]);
  expect(h.manifest.entries[key]).toEqual(before);
  expect(h.syncStatuses.some(([, state]) => state === "saved")).toBe(false);
  blocked = false;
  h.service.queueCentralStateWrite(key, "owned draft");
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(1);
});

for (const mismatch of ["none", "revision", "generation", "owner", "raw", "read-only"]) {
test(`a queued failed Medical write retires only an exact read-acknowledged generation (${mismatch})`, async () => {
  const key = "football-medical-team-v1";
  const cachedInfo = { source: "local-write" };
  const h = createServiceHarness({ revision: 1, cachedInfo, syncResult: { ok: false, status: 503, reason: "Lost receipt" } });
  h.rawValues.set(key, "draft");
  h.manifest.entries[key] = { label: "Medical", hash: "draft", writes: 7, updatedAt: "generation-a", serverRevision: 1 };
  h.service.queueCentralStateWrite(key, "draft");
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(1);
  const entry = h.manifest.entries[key];
  entry.pendingCentralSync = false;
  entry.serverRevision = mismatch === "revision" ? 1 : 2;
  if (mismatch === "generation") entry.writes += 1;
  if (mismatch === "owner") entry.principalScope = "another-owner";
  if (mismatch === "raw") h.rawValues.set(key, "newer draft");
  if (mismatch === "read-only") cachedInfo.source = "central-readonly-baseline";
  const expected = structuredClone(entry);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(["none", "read-only"].includes(mismatch) ? 1 : 2);
  expect(h.syncStatuses.some(([, status]) => status === "saved")).toBe(mismatch === "none");
  expect(h.manifest.entries[key]).toEqual(expected);
});
}

test("Medical read-only baseline never becomes a retry or acknowledgement even after access changes", async () => {
  const key = "football-medical-team-v1";
  const h = createServiceHarness({ cachedInfo: { source: "central-readonly-baseline", serverBacked: true } });
  h.rawValues.set(key, "unsent draft");
  const entry = { pendingCentralSync: true, hash: "draft", writes: 7, serverRevision: 1 };
  h.manifest.entries[key] = { ...entry };
  await h.service.retryCentral(() => h.manifest);
  h.service.queueCentralStateWrite(key, "server view", { automatic: true });
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toEqual([]);
  expect(h.manifest.entries[key]).toEqual(entry);
  expect(h.timers.size).toBe(0);
});

for (const status of [200, 403, 409, 0]) {
  test(`an in-flight ${status} response cannot mutate Medical recovery after a read-only view is installed`, async () => {
    const key = "football-medical-team-v1", cachedInfo = { source: "local-write" };
    const h = createServiceHarness({ cachedInfo, syncKey: async () => {
      cachedInfo.source = "central-readonly-baseline";
      return { ok: status === 200, status, revision: 8, value: "server view" };
    } });
    h.rawValues.set(key, "draft");
    h.manifest.entries[key] = { pendingCentralSync: true, hash: "draft", writes: 7, serverRevision: 1 };
    h.service.queueCentralStateWrite(key, "draft");
    const queuedEntry = structuredClone(h.manifest.entries[key]);
    await h.service.flushCentralStateWrites();
    expect(h.syncCalls).toHaveLength(1);
    expect(h.manifest.entries[key]).toEqual(queuedEntry);
    expect(h.rawValues.get(key)).toBe("draft");
    expect(h.handledKeys).toEqual([]);
  });
}

test("conflict hydration cannot acknowledge a Medical draft after separating its read-only view", async () => {
  const key = "football-medical-team-v1", cachedInfo = { source: "local-write" };
  const h = createServiceHarness({ cachedInfo,
    syncResult: { ok: false, status: 409, currentRevision: 8 },
    onHydrate: ({ setRevision }) => {
      cachedInfo.source = "central-readonly-baseline";
      setRevision(8);
    },
  });
  h.rawValues.set(key, "draft");
  h.manifest.entries[key] = { pendingCentralSync: true, hash: "draft", writes: 7, serverRevision: 1 };
  h.service.queueCentralStateWrite(key, "draft");
  const queuedEntry = structuredClone(h.manifest.entries[key]);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.filter((call) => call.hydrate)).toHaveLength(1);
  expect(h.manifest.entries[key]).toEqual(queuedEntry);
  expect(h.rawValues.get(key)).toBe("draft");
  expect(h.syncStatuses.some(([, status]) => status === "saved")).toBe(false);
});

test("Medical conflict hydration is never a receipt for an unchanged pending local write", async () => {
  const key = "football-medical-team-v1";
  const h = createServiceHarness({ syncResult: { ok: false, status: 409, currentRevision: 8 },
    onHydrate: ({ setRevision }) => { setRevision(8); } });
  h.rawValues.set(key, "draft");
  h.manifest.entries[key] = { pendingCentralSync: true, hash: "draft", writes: 7, serverRevision: 1 };
  h.service.queueCentralStateWrite(key, "draft");
  const pending = structuredClone(h.manifest.entries[key]);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.filter((call) => call.hydrate)).toHaveLength(1);
  expect(h.manifest.entries[key]).toEqual(pending);
  expect(h.rawValues.get(key)).toBe("draft");
  expect(h.syncStatuses.some(([, status]) => status === "saved")).toBe(false);
});

test("conflict retry cannot acknowledge Medical recovery if a read-only view appeared during the retry", async () => {
  const key = "football-medical-team-v1", cachedInfo = { source: "local-write" };
  let requests = 0;
  const h = createServiceHarness({ cachedInfo, retryConflictStorageKeys: [key], syncKey: async () => {
    if (++requests === 1) return { ok: false, status: 409, currentRevision: 8 };
    cachedInfo.source = "central-readonly-baseline";
    return { ok: true, revision: 9, value: "server view" };
  } });
  h.rawValues.set(key, "draft");
  h.manifest.entries[key] = { pendingCentralSync: true, hash: "draft", writes: 7, serverRevision: 1 };
  h.service.queueCentralStateWrite(key, "draft");
  const queuedEntry = structuredClone(h.manifest.entries[key]);
  await h.service.flushCentralStateWrites();
  expect(requests).toBe(2);
  expect(h.manifest.entries[key]).toEqual(queuedEntry);
  expect(h.rawValues.get(key)).toBe("draft");
  expect(h.handledKeys).toEqual([]);
});

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

for (const retry of [false, true]) {
test(`an obsolete account receipt never retries or acknowledges the next account's generation (retry: ${retry})`, async () => {
  const key = "football-medical-team-v1";
  let calls = 0;
  const h = createServiceHarness({ retryConflictStorageKeys: [key], syncKey: async () => {
    if (retry && ++calls === 1) return { ok: false, status: 409, currentRevision: 99 };
    h.rawValues.set(key, "new account B");
    h.manifest.entries[key] = { pendingCentralSync: true, hash: "B", writes: 8, serverRevision: 2 };
    return { ok: false, staleContext: true };
  } });
  h.rawValues.set(key, "old account A");
  h.manifest.entries[key] = { pendingCentralSync: true, hash: "A", writes: 7, serverRevision: 98 };
  h.service.queueCentralStateWrite(key, "old account A");
  await h.service.flushCentralStateWrites();
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(retry ? 2 : 1);
  expect(h.manifest.entries[key]).toEqual({ pendingCentralSync: true, hash: "B", writes: 8, serverRevision: 2 });
  expect(h.rawValues.get(key)).toBe("new account B");
  expect(h.handledKeys).toEqual([]);
  expect(h.syncStatuses.some(([, status]) => status === "saved")).toBe(false);
});
}

for (const key of ["football-schedule-v1", "football-periodization-v2", "football-player-profiles-v1"]) {
test(`a retained ${key} generation cannot retry under another account after ready or reload`, async () => {
  let scope = "org-a-actor";
  const h = createServiceHarness({ getReadScope: () => scope, syncKey: async () => {
    scope = "org-b-actor";
    return { ok: false, staleContext: true };
  } });
  h.rawValues.set(key, "private A");
  h.manifest.entries[key] = { pendingCentralSync: true, hash: "A", writes: 7 };
  h.service.queueCentralStateWrite(key, "private A");
  expect(h.manifest.entries[key].principalScope).toBe("org-a-actor");
  await h.service.flushCentralStateWrites();
  await h.service.retryCentral(() => h.manifest);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(1);
  expect(h.rawValues.get(key)).toBe("private A");
  const reloaded = createServiceHarness({ getReadScope: () => scope });
  reloaded.rawValues.set(key, h.rawValues.get(key));
  reloaded.manifest.entries[key] = structuredClone(h.manifest.entries[key]);
  await reloaded.service.retryCentral(() => reloaded.manifest);
  await reloaded.service.flushCentralStateWrites();
  expect(reloaded.syncCalls).toEqual([]);
  expect(reloaded.manifest.entries[key].pendingCentralSync).toBe(true);
  scope = "org-a-actor";
  await reloaded.service.retryCentral(() => reloaded.manifest);
  await reloaded.service.flushCentralStateWrites();
  expect(reloaded.syncCalls).toHaveLength(1);
  expect(reloaded.syncCalls[0].value).toBe("private A");
});
}

for (const boundary of ["journal stage", "conflict hydration"]) {
test(`account ownership is rechecked after awaiting ${boundary}`, async () => {
  const key = boundary === "journal stage" ? "football-session-planner-v1" : "football-medical-team-v1";
  let scope = "org-a-actor";
  const h = createServiceHarness({ getReadScope: () => scope,
    syncResult: { ok: false, status: 409, currentRevision: 8 },
    onHydrate: ({ setRevision }) => { scope = "org-b-actor"; setRevision(8); },
  });
  if (boundary === "journal stage") h.win.footballScienceCentralState.stageSessionWrite = async () => {
    scope = "org-b-actor";
    return { ok: true };
  };
  h.rawValues.set(key, "private A");
  h.manifest.entries[key] = { pendingCentralSync: true, hash: "A", writes: 7, serverRevision: 1 };
  h.service.queueCentralStateWrite(key, "private A");
  const entry = structuredClone(h.manifest.entries[key]);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(boundary === "journal stage" ? 0 : 2);
  expect(h.manifest.entries[key]).toEqual(entry);
  expect(h.rawValues.get(key)).toBe("private A");
  expect(h.handledKeys).toEqual([]);
  expect(h.syncStatuses.some(([, status]) => status === "saved")).toBe(false);
});
}

for (const boundary of ["queued timer", "active flush"]) {
test(`manifest recovery intent survives a ${boundary} until the owning pending generation drains`, async () => {
  let release, enter;
  const barrier = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { enter = resolve; });
  const h = createServiceHarness({ getReadScope: () => "owner-A", syncKey: async ({ key, value }) => {
    if (boundary === "active flush" && key === "football-medical-team-v1") { enter(); await barrier; }
    return { ok: true, value };
  } });
  const key = "football-schedule-v1";
  h.rawValues.set(key, "owner draft");
  h.manifest.entries[key] = { pendingCentralSync: true, principalScope: "owner-A", hash: "A", writes: 7 };
  h.rawValues.set("football-medical-team-v1", "other queued write");
  h.service.queueCentralStateWrite("football-medical-team-v1", "other queued write");
  let flushing;
  if (boundary === "active flush") { flushing = h.service.flushCentralStateWrites(); await entered; }
  await h.service.retryCentral(() => h.manifest);
  release();
  await (flushing || h.service.flushCentralStateWrites());
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.map((call) => call.key)).toEqual(["football-medical-team-v1", key]);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(false);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(2);
});
}

test("manifest retry remains requested when a new write queues during the journal read", async () => {
  let release, enter, reads = 0;
  const barrier = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { enter = resolve; });
  const h = createServiceHarness({ getReadScope: () => "owner-A" });
  h.win.footballScienceCentralState.getSessionPendingState = async () => {
    if (++reads === 1) { enter(); await barrier; }
    return null;
  };
  h.rawValues.set("football-schedule-v1", "owner draft");
  h.manifest.entries["football-schedule-v1"] = { pendingCentralSync: true, principalScope: "owner-A", hash: "A", writes: 7 };
  const retry = h.service.retryCentral(() => h.manifest);
  await entered;
  h.rawValues.set("football-medical-team-v1", "other write");
  h.service.queueCentralStateWrite("football-medical-team-v1", "other write");
  release(); await retry;
  await h.service.flushCentralStateWrites();
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.map((call) => call.key)).toEqual(["football-medical-team-v1", "football-schedule-v1"]);
  expect(h.manifest.entries["football-schedule-v1"].pendingCentralSync).toBe(false);
});

test("an older manifest scan cannot consume a newer recovery request", async () => {
  const releases = [], entered = [];
  let reads = 0;
  const signals = [0, 1].map((index) => new Promise((resolve) => { entered[index] = resolve; }));
  const barriers = [0, 1].map((index) => new Promise((resolve) => { releases[index] = resolve; }));
  const h = createServiceHarness({ getReadScope: () => "owner-A" });
  h.win.footballScienceCentralState.getSessionPendingState = async () => {
    const index = reads++;
    if (index < 2) { entered[index](); await barriers[index]; }
    return null;
  };
  const readManifest = () => h.manifest;
  const key = "football-schedule-v1", nextKey = "football-player-profiles-v1";
  h.rawValues.set(key, "draft A");
  h.manifest.entries[key] = { pendingCentralSync: true, principalScope: "owner-A", hash: "A", writes: 7 };
  const first = h.service.retryCentral(readManifest); await signals[0];
  const second = h.service.retryCentral(readManifest); await signals[1];
  releases[0](); await first;
  h.rawValues.set(nextKey, "draft C");
  h.manifest.entries[nextKey] = { pendingCentralSync: true, principalScope: "owner-A", hash: "C", writes: 8 };
  releases[1](); await second;
  await h.service.flushCentralStateWrites();
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.map((call) => call.key)).toEqual([key, nextKey]);
  expect(h.manifest.entries[nextKey].pendingCentralSync).toBe(false);
});

for (const revision of [0, 1, undefined]) {
test(`retained Schedule retry keeps its original revision ${revision} after a newer authorized read`, async () => {
  const key = "football-schedule-v1";
  const h = createServiceHarness({ getReadScope: () => "owner-A", revision: 2,
    syncResult: { ok: false, status: 409, currentRevision: 2 } });
  h.rawValues.set(key, "old draft");
  h.manifest.entries[key] = { pendingCentralSync: true, principalScope: "owner-A", serverRevision: revision, hash: "draft", writes: 7 };
  await h.service.retryCentral(() => h.manifest);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(1);
  expect(h.syncCalls[0].options.baseRevision).toBe(revision ?? 0);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.rawValues.get(key)).toBe("old draft");
});
}

test("an unchanged conflicting retained generation does not loop through later manifest recovery", async () => {
  const key = "football-schedule-v1";
  const h = createServiceHarness({ getReadScope: () => "owner-A", revision: 2,
    syncResult: { ok: false, status: 409, currentRevision: 2 } });
  h.rawValues.set(key, "old draft");
  h.manifest.entries[key] = { pendingCentralSync: true, principalScope: "owner-A", serverRevision: 1, writes: 7 };
  await h.service.retryCentral(() => h.manifest); await h.service.flushCentralStateWrites();
  await h.service.retryCentral(() => h.manifest); await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toHaveLength(1);
  expect(h.manifest.entries[key].pendingCentralSync).toBe(true);
  expect(h.syncStatuses.at(-1)).toEqual([key, "issue", "Local changes need review"]);
  expect(h.manifest.lastCentralError).toBe("Local changes need review");
});

test("pending base stays distinct from a newer acknowledged revision during recovery", async () => {
  const key = "football-schedule-v1";
  const h = createServiceHarness({ getReadScope: () => "owner-A", revision: 9,
    syncResult: { ok: false, status: 409, currentRevision: 9 } });
  h.rawValues.set(key, "old draft");
  h.manifest.entries[key] = { pendingCentralSync: true, principalScope: "owner-A", serverRevision: 9, pendingBaseRevision: 1 };
  await h.service.retryCentral(() => h.manifest); await h.service.flushCentralStateWrites();
  expect(h.syncCalls[0].options.baseRevision).toBe(1);
  expect(h.manifest.entries[key]).toMatchObject({ serverRevision: 9, pendingBaseRevision: 1, pendingCentralSync: true });
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
      getReadScope: options.getReadScope,
      getStatus: () => ({
        hydrating: Boolean(options.hydrating),
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
      const attempted = structuredClone(manifest);
      mutator(attempted);
      if (!options.failManifestWrite?.(attempted)) Object.assign(manifest, attempted);
      return attempted;
    },
    readManifest: () => structuredClone(manifest),
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

test("an identical Sessions acknowledgement finalizes the journal-only read cache", async () => {
  const key = "football-session-planner-v1";
  const h = createServiceHarness({ syncResult: { ok: true, value: "journal value", metadata: { revision: 8 } } });
  h.rawValues.set(key, "journal value");
  h.service.queueCentralStateWrite(key, "journal value");
  await h.service.flushCentralStateWrites();
  expect(h.handledKeys).toContainEqual({ key, value: "journal value" });
  expect(h.manifest.entries[key].pendingCentralSync).toBe(false);
});

for (const newerDraft of [false, true]) {
  test(`a read projection accepts only its own draft receipt (newer draft: ${newerDraft})`, async () => {
    const key = "football-session-planner-v1";
    const cachedInfo = { value: "own edit", source: "session-journal-pending", sessionViewToken: "draft-A" };
    let release, sending;
    const gate = new Promise((resolve) => { release = resolve; });
    const entered = new Promise((resolve) => { sending = resolve; });
    const h = createServiceHarness({ cachedInfo, syncKey: async () => {
      sending(); await gate;
      return { ok: true, value: "own edit + peer field", metadata: { revision: 8 } };
    } });
    h.rawValues.set(key, "own edit");
    h.service.queueCentralStateWrite(key, "own edit");
    const flush = h.service.flushCentralStateWrites();
    await entered;
    // B deliberately has identical bytes. Only the edit token distinguishes it.
    cachedInfo.value = "own edit + peer field";
    if (newerDraft) cachedInfo.sessionViewToken = "draft-B";
    h.rawValues.set(key, cachedInfo.value);
    release(); await flush;
    expect(h.rawValues.get(key)).toBe("own edit + peer field");
    expect(h.manifest.entries[key].pendingCentralSync).toBe(newerDraft);
    expect(h.handledKeys).toHaveLength(newerDraft ? 0 : 1);
    expect(h.autosaveStatuses.some(([, state]) => state === "saved")).toBe(!newerDraft);
  });
}

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

for (const successor of ["queued B", "newer C", "same-value C", "other owner C"]) {
test(`Schedule successor base survives acknowledgement and reload without adopting ${successor}`, async () => {
  const key = "football-schedule-v1";
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const h = createServiceHarness({ getReadScope: () => "owner-A", revision: 7,
    syncKey: async ({ value }) => { await barrier; return { ok: true, value, revision: 8 }; },
  });
  h.rawValues.set(key, "A");
  h.service.queueCentralStateWrite(key, "A");
  const flushing = h.service.flushCentralStateWrites();
  h.rawValues.set(key, "B");
  h.manifest.entries[key] = { hash: "B", writes: 2, updatedAt: "B-time", serverRevision: 7 };
  h.service.queueCentralStateWrite(key, "B");
  if (successor !== "queued B") {
    h.rawValues.set(key, successor === "same-value C" ? "B" : "C");
    h.manifest.entries[key] = { ...h.manifest.entries[key], hash: successor === "same-value C" ? "B" : "C", writes: 3, updatedAt: "C-time",
      principalScope: successor === "other owner C" ? "owner-C" : "owner-A", pendingBaseRevision: 4 };
  }
  release();
  await flushing;
  expect(h.syncCalls).toHaveLength(1);
  expect(h.manifest.entries[key]).toMatchObject(successor === "queued B"
    ? { hash: "B", writes: 2, updatedAt: "B-time", pendingCentralSync: true, pendingBaseRevision: 8 }
    : { hash: successor === "same-value C" ? "B" : "C", writes: 3, updatedAt: "C-time", pendingCentralSync: true, pendingBaseRevision: 4 });
  if (successor !== "queued B") return;
  const reloaded = createServiceHarness({ getReadScope: () => "owner-A", revision: 8,
    syncKey: async ({ value, syncOptions }) => syncOptions.baseRevision === 8
      ? { ok: true, value, revision: 9 } : { ok: false, status: 409, currentRevision: 8 },
  });
  reloaded.rawValues.set(key, h.rawValues.get(key));
  reloaded.manifest.entries[key] = structuredClone(h.manifest.entries[key]);
  await reloaded.service.retryCentral(() => reloaded.manifest);
  await reloaded.service.flushCentralStateWrites();
  await reloaded.service.flushCentralStateWrites();
  expect(reloaded.syncCalls).toEqual([{ key, value: "B", options: { removed: false, baseRevision: 8 } }]);
  expect(reloaded.rawValues.get(key)).toBe("B");
  expect(reloaded.manifest.entries[key]).toMatchObject({ pendingCentralSync: false, serverRevision: 9 });
});
}

for (const recovery of ["retry", "reload", "same-value newer C", "other owner C"]) {
test(`Schedule successor waits for durable base persistence after quota failure (${recovery})`, async () => {
  const key = "football-schedule-v1";
  let release, fail = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const h = createServiceHarness({ getReadScope: () => "owner-A", revision: 7,
    failManifestWrite: () => fail,
    syncKey: async ({ value, syncOptions }) => {
      if (value === "A") { await barrier; return { ok: true, value, revision: 8 }; }
      return syncOptions.baseRevision === 8 ? { ok: true, value, revision: 9 } : { ok: false, status: 409 };
    },
  });
  h.rawValues.set(key, "A");
  h.service.queueCentralStateWrite(key, "A");
  const flushing = h.service.flushCentralStateWrites();
  h.rawValues.set(key, "B");
  h.manifest.entries[key] = { hash: "B", writes: 2, updatedAt: "B-time", serverRevision: 7 };
  h.service.queueCentralStateWrite(key, "B");
  const durableB = structuredClone(h.manifest.entries[key]);
  fail = true;
  release(); await flushing;
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls.map(({ value }) => value)).toEqual(["A"]);
  expect(h.manifest.entries[key]).toEqual(durableB);
  expect(h.rawValues.get(key)).toBe("B");
  expect(h.syncStatuses.at(-1)).toEqual([key, "issue", "Local save metadata could not be verified. Retry when browser storage is available."]);
  if (recovery === "reload") {
    const reloaded = createServiceHarness({ getReadScope: () => "owner-A", revision: 8,
      syncResult: { ok: false, status: 409, currentRevision: 8 } });
    reloaded.rawValues.set(key, "B");
    reloaded.manifest.entries[key] = structuredClone(h.manifest.entries[key]);
    await reloaded.service.retryCentral(() => reloaded.manifest);
    await reloaded.service.flushCentralStateWrites();
    expect(reloaded.syncCalls[0].options.baseRevision).toBe(7);
    expect(reloaded.manifest.entries[key].pendingCentralSync).toBe(true);
    expect(reloaded.rawValues.get(key)).toBe("B");
    return;
  }
  if (recovery !== "retry") {
    h.manifest.entries[key] = { ...durableB, writes: 3, updatedAt: "C-time", pendingBaseRevision: 4,
      principalScope: recovery === "other owner C" ? "owner-C" : "owner-A" };
    const newer = structuredClone(h.manifest.entries[key]);
    fail = false;
    await h.service.flushCentralStateWrites();
    expect(h.syncCalls).toHaveLength(1);
    expect(h.manifest.entries[key]).toEqual(newer);
    expect(h.rawValues.get(key)).toBe("B");
    return;
  }
  fail = false;
  await h.service.retryCentral(() => h.manifest);
  await h.service.flushCentralStateWrites();
  expect(h.syncCalls).toEqual([
    { key, value: "A", options: { removed: false, baseRevision: 7 } },
    { key, value: "B", options: { removed: false, baseRevision: 8 } },
  ]);
  expect(h.manifest.entries[key]).toMatchObject({ pendingCentralSync: false, serverRevision: 9 });
});
}

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
    serverRevision: 7,
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
    deletedAt: "2026-06-08T11:59:00.000Z",
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
  expect(facadeSource).toContain("readManifest: dataSafetyRuntimeService.readManifest");
  expect(facadeSource).not.toMatch(/renderDashboardChatWidget|renderMedicalTeamWorkspace|renderPlayerProfilesWorkspace|renderScoutingWorkspace/);
  expect(runtimeSource).toContain("function handleCentralSyncedStateValue");
  expect(runtimeSource).toContain("createCentralRuntimeFacade({");
  expect(runtimeSource).not.toContain("createCentralSyncRuntimeService({");
});
