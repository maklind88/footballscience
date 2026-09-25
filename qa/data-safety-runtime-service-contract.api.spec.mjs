import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createDataSafetyRuntimeService } from "../src/core/data-safety-runtime-service.mjs";
import { createCentralAppStateReloadService } from "../src/core/central-app-state-reload-service.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createFakeStorageConstructor(options = {}) {
  function FakeStorage() {
    this.values = new Map();
  }
  Object.defineProperty(FakeStorage.prototype, "length", {
    get() {
      return this.values.size;
    },
  });
  FakeStorage.prototype.getItem = function getItem(key) {
    const normalizedKey = String(key);
    return this.values.has(normalizedKey) ? this.values.get(normalizedKey) : null;
  };
  FakeStorage.prototype.setItem = function setItem(key, value) {
    if (options.failRecovery && String(key).startsWith("football-data-safety-v1:recovery:")) throw new Error("Recovery quota exceeded");
    if (String(key) === options.failureKey) throw options.storageError;
    if (String(key) === options.quotaKey) {
      options.beforeQuotaFailure?.(this);
      const error = new Error(`Setting ${String(key)} exceeded the quota.`);
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(String(key), String(value));
  };
  FakeStorage.prototype.removeItem = function removeItem(key) {
    this.values.delete(String(key));
  };
  FakeStorage.prototype.clear = function clear() {
    this.values.clear();
  };
  FakeStorage.prototype.key = function key(index) {
    return Array.from(this.values.keys())[index] ?? null;
  };
  return FakeStorage;
}

function createStatusElement() {
  const toggles = [];
  return {
    classList: {
      toggle: (...args) => toggles.push(args),
    },
    textContent: "",
    title: "",
    toggles,
  };
}

function createHarness(options = {}) {
  const StorageConstructor = createFakeStorageConstructor(options);
  const localStorage = new StorageConstructor();
  const centralCache = new Map(Object.entries(options.centralCache || {}));
  const centralCacheInfo = new Map(Object.entries(options.centralCacheInfo || {}));
  const timers = new Map();
  const queuedWrites = [];
  let timerId = 0;
  const dataSafetyStatus = createStatusElement();
  const win = {
    crypto: { randomUUID },
    localStorage,
    location: {
      href: "https://footballscience.xyz/",
      reload: () => {},
    },
    footballScienceCentralState: {
      getCachedValue: (key) => centralCache.get(String(key)),
      getCachedValueInfo: (key) => {
        const normalizedKey = String(key);
        if (!centralCache.has(normalizedKey)) return { value: undefined, source: "", durable: false };
        return {
          value: centralCache.get(normalizedKey),
          source: "local-write",
          durable: true,
          ...(centralCacheInfo.get(normalizedKey) || {}),
        };
      },
      setCachedValue: (key, value, info = {}) => {
        centralCache.set(String(key), String(value));
        centralCacheInfo.set(String(key), {
          source: info.source || "local-write",
          durable: info.durable !== false,
          serverBacked: Boolean(info.serverBacked),
        });
        return true;
      },
      removeCachedValue: (key) => {
        centralCacheInfo.delete(String(key));
        return centralCache.delete(String(key));
      },
      getStatus: () => options.centralStatus || {},
      canAutoSyncKey: () => options.canEdit !== false,
    },
    setTimeout: (callback, delay) => {
      timerId += 1;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    alert: () => {},
    confirm: () => true,
  };
  const service = createDataSafetyRuntimeService({
    win,
    documentRef: {
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => {}, remove: () => {} }),
    },
    navigatorRef: {
      storage: { persist: () => Promise.resolve(true) },
    },
    storageConstructor: StorageConstructor,
    blobConstructor: class BlobMock {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    urlApi: {
      createObjectURL: () => "blob://backup",
      revokeObjectURL: () => {},
    },
    ui: { dataSafetyStatus },
    storageKey: "football-data-safety-v1",
    exportSchema: "football-science-backup-v1",
    databaseName: "football-science-data-safety-v1",
    snapshotStoreName: "snapshots",
    latestStoreName: "latest",
    maxSnapshots: 30,
    protectedStorageKeys: [
      "football-schedule-v1",
      "football-medical-team-v1",
      "football-session-planner-v3",
      "football-set-pieces-room-v1",
      "football-periodization-v2",
    ],
    journaledStorageKeys: ["football-session-planner-v3", "football-set-pieces-room-v1"],
    storageLabels: {
      "football-schedule-v1": "Schedule",
      "football-medical-team-v1": "Medical Room",
    },
    legacyStorageKeys: {
      "football-schedule-v1": ["football-schedule-v0"],
    },
    formatDataSafetyTime: options.formatTime || ((value) => (value ? "now" : "")),
    canWriteCentralBackedCache: () => options.canWrite !== false,
    createCentralBackedStorageError: () => new Error("Central sync is not ready."),
    getCentralStateBridge: () => win.footballScienceCentralState,
    getCentralStateWriteSuppressionKeys: () => options.suppressionKeys || new Set(),
    queueCentralStateWrite: (...args) => queuedWrites.push(args),
  });
  return { centralCache, centralCacheInfo, dataSafetyStatus, localStorage, queuedWrites, service, timers, win };
}

test("a central reload persists user DOM edits before enabling normalization suppression", async () => {
  const h = createHarness(), key = "football-session-planner-v3";
  h.win.footballScienceCentralState.getReadScope = () => "owner-A";
  h.service.install(); await Promise.resolve();
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: {
    pendingCentralSync: true, principalScope: "owner-A", deletedAt: "deleted", serverRevision: 7, writes: 2,
  } } }));
  const typed = '{"sessions":{"2026-09-29":{"title":"New user text"}}}';
  let reloaded;
  const reload = createCentralAppStateReloadService({ win: h.win,
    getCurrentPlatformUser: () => ({ id: "actor" }), getHubState: () => ({ activeWorkspaceId: "session-planner" }),
    syncSelectedSessionPlannerBlockFieldsFromDom: () => h.localStorage.setItem(key, typed),
    readSessionPlannerState: () => JSON.parse(h.localStorage.getItem(key) || "{}"),
    setSessionPlannerState: (value) => { reloaded = value; },
  });
  reload.reloadCentralizedAppStateFromStorage();
  expect(h.localStorage.values.get(key)).toBe(typed);
  expect(reloaded).toEqual(JSON.parse(typed));
  expect(h.service.readManifest().entries[key].deletedAt).toBe("");
  expect(h.queuedWrites).toHaveLength(1);
  expect(Boolean(h.win.__footballScienceCentralReloading)).toBe(false);
});

for (const raw of [false, true]) {
test(`view normalization preserves a pending deletion but a later user edit is allowed (raw: ${raw})`, async () => {
  const h = createHarness(), key = "football-medical-team-v1";
  h.win.footballScienceCentralState.getReadScope = () => "owner-A";
  h.win.footballScienceCentralState.canAutoSyncKey = () => true;
  h.service.install(); await Promise.resolve();
  const entry = { pendingCentralSync: true, principalScope: "owner-A", deletedAt: "deleted", serverRevision: 7, writes: 2 };
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: entry } }));
  h.win.__footballScienceCentralReloading = true;
  if (raw) h.service.rawSetItem(key, "automatic defaults");
  else h.localStorage.setItem(key, "automatic defaults");
  expect(h.localStorage.values.has(key)).toBe(false);
  expect(h.centralCache.has(key)).toBe(false);
  expect(h.service.readManifest().entries[key]).toEqual(entry);
  expect(h.queuedWrites).toEqual([]);
  h.win.__footballScienceCentralReloading = false;
  h.localStorage.setItem(key, "intentional new user edit");
  expect(h.localStorage.values.get(key)).toBe("intentional new user edit");
  expect(h.service.readManifest().entries[key].deletedAt).toBe("");
  expect(h.queuedWrites).toHaveLength(1);
});
}

for (const key of ["football-schedule-v1", "football-session-planner-v3", "football-periodization-v2"]) {
for (const removed of [false, true]) {
test(`ordinary protected ${removed ? "delete" : "write"} requires durable ownership before raw mutation (${key})`, async () => {
  const options = {}, h = createHarness(options);
  h.win.footballScienceCentralState.getReadScope = () => "owner-A";
  h.service.install(); await Promise.resolve();
  h.localStorage.values.set(key, "original");
  const entry = { principalScope: "owner-A", pendingCentralSync: true, hash: "original", writes: 7, serverRevision: 1 };
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: entry } }));
  options.quotaKey = "football-data-safety-v1";
  expect(() => removed ? h.localStorage.removeItem(key) : h.localStorage.setItem(key, "private new edit")).toThrow();
  expect(h.localStorage.values.get(key)).toBe("original");
  expect(h.service.readManifest().entries[key]).toEqual(entry);
  expect(h.queuedWrites).toEqual([]);
  h.win.footballScienceCentralState.getReadScope = () => "owner-B";
  expect(h.localStorage.values.get(key)).not.toBe("private new edit");
});
}
}

test("editing an owned pending draft retains its original revision for the next queued generation", async () => {
  const h = createHarness(), key = "football-schedule-v1";
  h.win.footballScienceCentralState.getReadScope = () => "owner-A";
  h.service.install(); await Promise.resolve();
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: {
    [key]: { pendingCentralSync: true, principalScope: "owner-A", serverRevision: 1, writes: 7 },
  } }));
  h.service.recordWrite(key, "new local edit");
  expect(h.queuedWrites[0]).toEqual([key, "new local edit", { baseRevision: 1 }]);
});

for (const tombstone of [false, true]) {
test(`bulk clear fails before mutation while protected data or pending deletion exists (${tombstone})`, async () => {
  const h = createHarness(), key = "football-schedule-v1";
  h.service.install(); await Promise.resolve();
  if (!tombstone) h.localStorage.values.set(key, "retained draft");
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: {
    pendingCentralSync: true, principalScope: "actor-A", deletedAt: tombstone ? "deleted" : "",
  } } }));
  const before = [...h.localStorage.values];
  expect(() => h.localStorage.clear()).toThrow(/Bulk storage clear/);
  expect([...h.localStorage.values]).toEqual(before);
  expect(h.queuedWrites).toEqual([]);
});
}

for (const newer of [false, true]) {
test(`raw failure after ownership persistence never queues the rejected edit or restores over a successor (newer: ${newer})`, async () => {
  const key = "football-schedule-v1", manifestKey = "football-data-safety-v1";
  const options = {}, h = createHarness(options);
  h.win.footballScienceCentralState.getReadScope = () => "actor-A";
  h.service.install(); await Promise.resolve();
  h.localStorage.values.set(key, "original");
  const entry = { principalScope: "actor-A", pendingCentralSync: true, hash: "original", writes: 7, serverRevision: 4 };
  h.localStorage.values.set(manifestKey, JSON.stringify({ entries: { [key]: entry } }));
  const successor = { ...entry, hash: "successor", writes: 9 };
  options.quotaKey = key;
  const previousSavedAt = h.service.readManifest().lastSavedAt;
  options.beforeQuotaFailure = (storage) => {
    if (!newer) return;
    storage.values.set(key, "successor");
    storage.values.set(manifestKey, JSON.stringify({ entries: { [key]: successor } }));
  };
  expect(() => h.localStorage.setItem(key, "rejected edit")).toThrow(/quota/i);
  expect(h.localStorage.values.get(key)).toBe(newer ? "successor" : "original");
  expect(h.service.readManifest().entries[key]).toEqual(newer ? successor : entry);
  if (!newer) expect(h.service.readManifest().lastSavedAt).toBe(previousSavedAt);
  expect(h.queuedWrites).toEqual([]);
});
}

test("Medical boot normalization cannot replace a pending draft before the central read view exists", async () => {
  const key = "football-medical-team-v1";
  const h = createHarness({ canEdit: false });
  const entry = { pendingCentralSync: true, hash: "original", writes: 7, serverRevision: 1 };
  h.localStorage.values.set(key, "private original draft");
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: entry } }));
  h.service.install();
  await Promise.resolve();
  expect(() => h.service.rawSetItem(key, "sanitized boot normalization")).toThrow(/local copy was retained/);
  expect(h.localStorage.values.get(key)).toBe("private original draft");
  expect(h.service.readManifest().entries[key]).toEqual(entry);
  expect(h.queuedWrites).toEqual([]);
});

test("null backup is rejected with feedback and no mutation", async () => {
  const h = createHarness(); h.service.install(); await Promise.resolve();
  const before = Array.from(h.localStorage.values), alerts = [];
  h.win.alert = (message) => alerts.push(message);
  await h.service.importBackupFile({ text: async () => "null" });
  expect(alerts.join(" ")).toContain("restorable");
  expect(Array.from(h.localStorage.values)).toEqual(before);
  expect(h.queuedWrites).toEqual([]);
});

test("backup preflight rejects pending unauthorized Medical before restoring an earlier Schedule key", async () => {
  const key = "football-medical-team-v1";
  const h = createHarness({ canEdit: false });
  h.localStorage.values.set(key, "draft");
  h.localStorage.values.set("football-schedule-v1", "schedule");
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: { pendingCentralSync: true } } }));
  h.service.install(); await Promise.resolve();
  const before = Array.from(h.localStorage.values);
  await h.service.importBackupFile({ text: async () => JSON.stringify({ keys: {
    "football-schedule-v1": "replacement", [key]: "replacement",
  } }) });
  expect(Array.from(h.localStorage.values)).toEqual(before);
  expect(h.queuedWrites).toEqual([]);
});

test("backup import rejects a separated Medical view before restoring any entry", async () => {
  const key = "football-medical-team-v1";
  const h = createHarness({ centralCache: { [key]: "server view" },
    centralCacheInfo: { [key]: { source: "central-readonly-baseline", durable: false } } });
  h.localStorage.values.set(key, "old draft");
  h.localStorage.values.set("football-schedule-v1", "old schedule");
  h.service.install();
  await Promise.resolve();
  const before = Array.from(h.localStorage.values);
  const alerts = [];
  h.win.alert = (message) => alerts.push(message);
  await h.service.importBackupFile({ text: async () => JSON.stringify({ keys: {
    "football-schedule-v1": "imported schedule", [key]: "imported Medical",
  } }) });
  expect(Array.from(h.localStorage.values)).toEqual(before);
  expect(h.queuedWrites).toEqual([]);
  expect(alerts.some((message) => message.includes("Backup restored"))).toBe(false);
  expect(alerts.join(" ")).toContain("recovery");
});

test("backup import rechecks the read-only view after confirmation", async () => {
  const key = "football-medical-team-v1";
  const h = createHarness({ centralCache: { [key]: "server view" } });
  h.localStorage.values.set(key, "draft");
  h.localStorage.values.set("football-schedule-v1", "schedule");
  h.service.install(); await Promise.resolve();
  const before = Array.from(h.localStorage.values);
  h.win.confirm = () => { h.centralCacheInfo.set(key, { source: "central-readonly-baseline" }); return true; };
  await h.service.importBackupFile({ text: async () => JSON.stringify({ keys: { "football-schedule-v1": "replacement", [key]: "replacement" } }) });
  expect(Array.from(h.localStorage.values)).toEqual(before);
  expect(h.queuedWrites).toEqual([]);
});

test("archived recovery in an exported backup is never automatically adopted by import", async () => {
  const h = createHarness(); h.service.install(); await Promise.resolve();
  const before = Array.from(h.localStorage.values), alerts = [];
  h.win.alert = (message) => alerts.push(message);
  await h.service.importBackupFile({ text: async () => JSON.stringify({
    keys: { "football-medical-team-v1": "new view" }, recoveryCopies: { archived: "private old draft" },
  }) });
  expect(Array.from(h.localStorage.values)).toEqual(before);
  expect(alerts.join(" ")).toContain("explicit review");
  expect(h.queuedWrites).toEqual([]);
});

test("exported separated recovery cannot lose its classification through backup import", async () => {
  const key = "football-medical-team-v1";
  const h = createHarness({ centralCache: { [key]: "server view" }, centralCacheInfo: { [key]: { source: "central-readonly-baseline" } } });
  h.localStorage.values.set(key, "private draft"); h.service.install();
  const backup = h.service.createBackupEnvelope();
  expect(backup.recoverySeparations).toEqual([key]);
  const destination = createHarness(); destination.service.install(); await Promise.resolve();
  await destination.service.importBackupFile({ text: async () => JSON.stringify(backup) });
  expect(destination.localStorage.values.has(key)).toBe(false);
  expect(destination.queuedWrites).toEqual([]);
});

for (const failRecovery of [false, true]) {
  test(`new authorized Medical edit archives the old pending generation before replacing it (quota: ${failRecovery})`, async () => {
    const key = "football-medical-team-v1";
    const h = createHarness({ failRecovery, centralCache: { [key]: "fresh server view" },
      centralCacheInfo: { [key]: { source: "central-readonly-baseline", canEdit: true, readScope: "actor-org-a", durable: false } } });
    const entry = { pendingCentralSync: true, hash: "old", writes: 7, serverRevision: 1 };
    h.localStorage.values.set(key, "old private draft");
    h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: entry } }));
    h.service.install();
    await Promise.resolve();
    if (failRecovery) {
      expect(() => h.localStorage.setItem(key, "new authorized edit")).toThrow(/quota/i);
      expect(h.localStorage.values.get(key)).toBe("old private draft");
      expect(h.service.readManifest().entries[key]).toEqual(entry);
      expect(h.queuedWrites).toEqual([]);
      return;
    }
    h.localStorage.setItem(key, "new authorized edit");
    expect(JSON.parse(h.localStorage.values.get("football-data-safety-v1:medical-recovery"))).toMatchObject({ readScope: "actor-org-a" });
    expect(h.localStorage.values.get(key)).toBe("new authorized edit");
    expect(h.queuedWrites.map(([writeKey, value]) => [writeKey, value])).toEqual([[key, "new authorized edit"]]);
    const recovery = Object.values(h.service.createBackupEnvelope().recoveryCopies).map(JSON.parse);
    expect(recovery).toHaveLength(1);
    expect(recovery[0]).toMatchObject({ key, value: "old private draft", entry });
    h.centralCache.clear(); h.centralCacheInfo.clear();
    expect(Object.values(h.service.createBackupEnvelope().recoveryCopies).map(JSON.parse)).toEqual(recovery);
    expect(() => h.localStorage.clear()).toThrow(/recovery/);
    expect(h.localStorage.values.get(key)).toBe("new authorized edit");
  });
}

for (const failureKey of ["football-medical-team-v1", "football-data-safety-v1:medical-recovery"]) {
  test(`a failed replacement removes only its unused archive (${failureKey})`, async () => {
    const key = "football-medical-team-v1";
    const h = createHarness({ quotaKey: failureKey, centralCache: { [key]: "server view" },
      centralCacheInfo: { [key]: { source: "central-readonly-baseline", canEdit: true, readScope: "actor-org-a", durable: false } } });
    const entry = { pendingCentralSync: true, hash: "old", writes: 7 };
    h.localStorage.values.set(key, "original");
    h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: entry } }));
    h.localStorage.values.set("football-data-safety-v1:medical-recovery", '["old",7,"",""]');
    h.service.install(); await Promise.resolve();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(() => h.localStorage.setItem(key, "new authorized edit")).toThrow(/quota/i);
      expect(h.localStorage.values.get(key)).toBe("original");
      expect(h.localStorage.values.get("football-data-safety-v1:medical-recovery")).toBe('["old",7,"",""]');
      expect(h.service.readManifest().entries[key]).toEqual(entry);
      expect(h.service.createBackupEnvelope().recoveryCopies).toEqual({});
      expect(h.queuedWrites).toEqual([]);
    }
  });
}

for (const hasReadView of [false, true]) {
  test(`clear preserves pending Medical tombstones without a native value (read view: ${hasReadView})`, async () => {
    const key = "football-medical-team-v1";
    const h = createHarness(hasReadView ? { centralCache: { [key]: "{}" },
      centralCacheInfo: { [key]: { source: "central-readonly-baseline", durable: false } } } : {});
    const entry = { pendingCentralSync: true, hash: "deleted", writes: 7, deletedAt: "deletion-time" };
    h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: entry } }));
    h.localStorage.values.set("football-data-safety-v1:medical-recovery", '["deleted",7,"","deletion-time"]');
    h.service.install(); await Promise.resolve();
    const before = Array.from(h.localStorage.values);
    expect(() => h.localStorage.clear()).toThrow(/recovery/);
    expect(Array.from(h.localStorage.values)).toEqual(before);
    expect(h.queuedWrites).toEqual([]);
  });
}

test("failed replacement cleanup cannot remove an archive needed by a newer local generation", async () => {
  const key = "football-medical-team-v1", markerKey = "football-data-safety-v1:medical-recovery";
  const newer = { pendingCentralSync: true, hash: "newer", writes: 9 };
  const h = createHarness({ quotaKey: key, beforeQuotaFailure: (storage) => {
    storage.values.set(key, "newer C");
    storage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: newer } }));
    storage.values.set(markerKey, "newer owner marker");
  }, centralCache: { [key]: "server view" },
  centralCacheInfo: { [key]: { source: "central-readonly-baseline", canEdit: true, readScope: "actor-org-a", durable: false } } });
  h.localStorage.values.set(key, "original A");
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "old", writes: 7 } } }));
  h.service.install(); await Promise.resolve();
  expect(() => h.localStorage.setItem(key, "replacement B")).toThrow(/quota/i);
  expect(h.localStorage.values.get(key)).toBe("newer C");
  expect(h.localStorage.values.get(markerKey)).toBe("newer owner marker");
  expect(h.service.readManifest().entries[key]).toEqual(newer);
  expect(Object.values(h.service.createBackupEnvelope().recoveryCopies).map(JSON.parse)).toMatchObject([{ value: "original A" }]);
  expect(h.queuedWrites).toEqual([]);
});

for (const pending of [false, true]) {
test(`replacement fails visibly and retains both copies when only the manifest write exceeds quota (pending: ${pending})`, async () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const h = createHarness({ quotaKey: manifestKey, centralCache: { [key]: "server view" },
    centralCacheInfo: { [key]: { source: "central-readonly-baseline", canEdit: true, readScope: "actor-org-a", durable: false } } });
  const entry = { pendingCentralSync: pending, hash: "old", writes: 7 };
  const manifest = JSON.stringify({ entries: { [key]: entry } });
  h.localStorage.values.set(key, "original A");
  h.localStorage.values.set(manifestKey, manifest);
  h.service.install(); await Promise.resolve();
  expect(() => h.localStorage.setItem(key, "replacement B")).toThrow(/metadata could not be saved/);
  expect(h.localStorage.values.get(key)).toBe("replacement B");
  expect(h.localStorage.values.get(manifestKey)).toBe(manifest);
  expect(Object.values(h.service.createBackupEnvelope().recoveryCopies).map(JSON.parse)).toMatchObject([{ value: "original A", entry }]);
  expect(h.service.status.lastError).toContain("Both versions were retained");
  expect(h.queuedWrites).toEqual([]);
});
}

for (const readView of [false, true]) {
test(`backup retains separated tombstone metadata and refuses automatic import (read view: ${readView})`, async () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const h = createHarness({ canEdit: false, ...(readView ? { centralCache: { [key]: "server view" },
    centralCacheInfo: { [key]: { source: "central-readonly-baseline" } } } : {}) });
  const entry = { pendingCentralSync: true, deletedAt: "deletion-time", hash: "deleted", writes: 9 };
  const marker = '["deleted",9,"","deletion-time"]';
  h.localStorage.values.set(manifestKey, JSON.stringify({ entries: { [key]: entry } }));
  h.localStorage.values.set(`${manifestKey}:medical-recovery`, marker);
  h.localStorage.values.set("football-schedule-v1", "restorable schedule");
  h.service.install(); await Promise.resolve();
  const backup = h.service.createBackupEnvelope();
  expect(backup.recoverySeparations).toEqual([key]);
  expect(backup.recoveryState[key]).toEqual({ value: null, entry, marker });
  const destination = createHarness(), alerts = [];
  destination.win.alert = (message) => alerts.push(message);
  destination.service.install(); await Promise.resolve();
  const before = Array.from(destination.localStorage.values);
  await destination.service.importBackupFile({ text: async () => JSON.stringify(backup) });
  expect(Array.from(destination.localStorage.values)).toEqual(before);
  expect(alerts.join(" ")).toContain("explicit review");
  expect(destination.queuedWrites).toEqual([]);
});
}

test("read-only central view preserves the pending disk generation during UI normalization, quota and backup", () => {
  const key = "football-medical-team-v1";
  const h = createHarness({ quotaKey: key, centralCache: { [key]: "server recommendation" },
    centralCacheInfo: { [key]: { source: "central-readonly-baseline", durable: false, serverBacked: true } } });
  const manifest = JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "draft", writes: 7, serverRevision: 1 } } });
  h.localStorage.values.set(key, "unsent clinical draft");
  h.localStorage.values.set("football-data-safety-v1", manifest);
  h.service.install();
  const installedManifest = h.localStorage.values.get("football-data-safety-v1");
  expect(h.localStorage.getItem(key)).toBe("server recommendation");
  expect(h.service.rawGetItem(key)).toBe("unsent clinical draft");
  h.service.rawSetItem(key, "normalized coach view");
  expect(h.localStorage.getItem(key)).toBe("normalized coach view");
  expect(h.service.rawGetItem(key)).toBe("unsent clinical draft");
  expect(h.service.createBackupEnvelope("manual").storage[key]).toBe("unsent clinical draft");
  expect(h.localStorage.values.get("football-data-safety-v1")).toBe(installedManifest);
  expect(h.service.readManifest().entries).toEqual(JSON.parse(manifest).entries);
  expect(h.centralCacheInfo.get(key)).toEqual({ source: "central-readonly-baseline", durable: false, serverBacked: true });
  expect(h.queuedWrites).toEqual([]);
});

test("read-only central view rejects write/remove/clear before touching any durable recovery data", () => {
  const key = "football-medical-team-v1";
  const h = createHarness({ centralCache: { [key]: "server view" },
    centralCacheInfo: { [key]: { source: "central-readonly-baseline", durable: false, serverBacked: true } } });
  h.localStorage.values.set(key, "draft");
  h.localStorage.values.set("football-schedule-v1", "schedule");
  h.service.install();
  const before = Array.from(h.localStorage.values);
  for (const action of [() => h.localStorage.setItem(key, "edit"), () => h.localStorage.removeItem(key), () => h.localStorage.clear()]) {
    expect(action).toThrow(/read-only/);
    expect(Array.from(h.localStorage.values)).toEqual(before);
  }
  expect(h.queuedWrites).toEqual([]);
});

test("background reads do not appear as saves or move the last saved time", () => {
  const centralStatus = { hydrated: true, lastSyncedAt: "10:00", lastFetchedAt: "10:00", lastSavedAt: "" };
  const h = createHarness({ centralStatus, formatTime: (value) => value || "" });
  h.service.refreshStatus();
  expect(h.dataSafetyStatus.textContent).toBe("Up to date");
  expect(h.dataSafetyStatus.title).toContain("Last checked for updates 10:00");
  centralStatus.lastSavedAt = "10:01";
  h.service.refreshStatus();
  expect(h.dataSafetyStatus.textContent).toBe("Saved 10:01");
  centralStatus.lastFetchedAt = centralStatus.lastSyncedAt = "10:04";
  h.service.refreshStatus();
  expect(h.dataSafetyStatus.textContent).toBe("Saved 10:01");
  expect(h.dataSafetyStatus.title).toContain("Last checked for updates 10:04");
  expect(h.queuedWrites).toEqual([]);
});

test("pending writes and errors take priority over a successful background read", () => {
  const centralStatus = { lastSyncedAt: "10:04", lastFetchedAt: "10:04", lastSavedAt: "10:01" };
  const h = createHarness({ centralStatus });
  h.service.install();
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({
    lastSavedAt: "10:03", entries: { "football-schedule-v1": { pendingCentralSync: true } },
  }));
  h.service.refreshStatus();
  expect(h.dataSafetyStatus.textContent).toBe("Sync pending now");
  centralStatus.lastWriteError = "Save failed";
  h.service.refreshStatus();
  expect(h.dataSafetyStatus.textContent).toBe("Sync needs attention");
  expect(h.dataSafetyStatus.title).toBe("Save failed");
});

test("journaled workspaces receive their exact pre-edit cache through the protected storage boundary", () => {
  const h = createHarness();
  h.service.install();
  const key = "football-session-planner-v3";
  h.localStorage.setItem(key, "before");
  h.localStorage.setItem(key, "after");
  expect(h.queuedWrites.at(-1)).toEqual([key, "after", { previousValue: "before", previousPending: true }]);
  h.localStorage.values.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: { pendingCentralSync: true } } }));
  h.localStorage.setItem(key, "third");
  expect(h.queuedWrites.at(-1)).toEqual([key, "third", { previousValue: "after", previousPending: true }]);
  h.localStorage.setItem("football-schedule-v1", "schedule");
  expect(h.queuedWrites.at(-1)).toEqual(["football-schedule-v1", "schedule", {}]);

  const setPiecesKey = "football-set-pieces-room-v1";
  h.localStorage.setItem(setPiecesKey, "set-pieces-before");
  h.localStorage.setItem(setPiecesKey, "set-pieces-after");
  expect(h.queuedWrites.at(-1)).toEqual([
    setPiecesKey,
    "set-pieces-after",
    { previousValue: "set-pieces-before", previousPending: false },
  ]);
});

test("acknowledged cache quota fallback is server-backed, never local durability or another write", () => {
  const key = "football-session-planner-v3";
  const h = createHarness({ quotaKey: key });
  h.service.install();
  h.localStorage.values.set(key, "previous durable cache");
  h.centralCache.set(key, "acknowledged local edit");
  h.service.cacheAcknowledgedValue(key, "server merged value");
  expect(h.service.rawGetItem(key)).toBe("server merged value");
  expect(h.localStorage.values.get(key)).toBe("previous durable cache");
  expect(h.centralCacheInfo.get(key)).toEqual({ source: "central-acknowledgement", durable: false, serverBacked: true });
  expect(h.service.createBackupEnvelope("ack-cache").storage[key]).toBe("previous durable cache");
  expect(h.queuedWrites).toEqual([]);
});

test("acknowledged cache fallback fails closed without an accepting bridge", () => {
  const key = "football-session-planner-v3";
  const h = createHarness({ quotaKey: key });
  h.service.install();
  h.localStorage.values.set(key, "previous durable cache");
  h.win.footballScienceCentralState.setCachedValue = () => false;
  expect(() => h.service.cacheAcknowledgedValue(key, "server value")).toThrow(/quota/);
  expect(h.localStorage.values.get(key)).toBe("previous durable cache");
  expect(h.queuedWrites).toEqual([]);
});

test("acknowledged cache cannot treat a security failure as quota recovery", () => {
  const key = "football-session-planner-v3";
  const error = new Error("Storage is denied"); error.name = "SecurityError";
  const h = createHarness({ failureKey: key, storageError: error });
  h.service.install(); h.localStorage.values.set(key, "original");
  expect(() => h.service.cacheAcknowledgedValue(key, "acknowledged")).toThrow(error);
  expect(h.localStorage.values.get(key)).toBe("original");
  expect(h.centralCache.has(key)).toBe(false);
  expect(h.queuedWrites).toEqual([]);
});

test("data safety runtime service owns protected storage body outside app-runtime", () => {
  const runtimeSource = readProjectFile("app-runtime.js");
  const serviceSource = readProjectFile("src/core/data-safety-runtime-service.mjs");
  const facadeSource = readProjectFile("src/core/central-runtime-facade.mjs");

  expect(runtimeSource).toContain("createCentralRuntimeFacade({");
  expect(runtimeSource).not.toContain("createDataSafetyRuntimeService({");
  expect(facadeSource).toContain("createDataSafetyRuntimeService({");
  expect(facadeSource).toContain("recordDataSafetyWrite");
  expect(runtimeSource).not.toContain("function collectFootballScienceStorageData");
  expect(runtimeSource).not.toContain("function exportFootballScienceDataBackup() {");
  expect(runtimeSource).not.toContain("function installFootballDataSafety() {");
  expect(serviceSource).toContain("function collectStorageData()");
  expect(serviceSource).toContain("function exportBackup()");
  expect(serviceSource).toContain("function install()");
  expect(serviceSource).not.toMatch(/renderDashboardChatWidget|renderMedicalTeamWorkspace|renderPlayerProfilesWorkspace|renderScoutingWorkspace/);
});

test("data safety runtime service preserves protected localStorage write tracking and central queue", () => {
  const { localStorage, queuedWrites, service, timers, win } = createHarness();

  service.install();
  localStorage.setItem("football-schedule-v1", "{\"events\":[]}");

  const manifest = service.readManifest();
  expect(manifest.entries["football-schedule-v1"]).toMatchObject({
    label: "Schedule",
    size: 13,
    writes: 1,
  });
  expect(queuedWrites).toContainEqual(["football-schedule-v1", "{\"events\":[]}", {}]);
  expect(service.createBackupEnvelope("manual").summary).toMatchObject({
    keyCount: 1,
    totalBytes: 13,
  });
  expect(typeof win.footballScienceDataSafety.exportBackup).toBe("function");
  expect(timers.size).toBeGreaterThan(0);
});

test("data safety runtime service fails closed when protected browser cache quota is full", () => {
  const key = "football-medical-team-v1";
  const value = JSON.stringify({ players: [{ id: "player-1", recommendation: "75%" }] });
  const { centralCache, localStorage, queuedWrites, service } = createHarness({ quotaKey: key });

  service.install();
  expect(() => localStorage.setItem(key, value)).toThrow("exceeded the quota");

  expect(localStorage.values.has(key)).toBe(false);
  expect(centralCache.has(key)).toBe(false);
  expect(localStorage.getItem(key)).toBe(null);
  expect(service.rawGetItem(key)).toBe(null);
  expect(service.createBackupEnvelope("quota-fallback").storage[key]).toBeUndefined();
  expect(queuedWrites).toEqual([]);
  expect(service.status.lastError).toContain("exceeded the quota");
  expect(service.readManifest().lastError).toContain("exceeded the quota");
});

test("data safety runtime service preserves the previous protected value when a replacement exceeds quota", () => {
  const key = "football-medical-team-v1";
  const previousValue = JSON.stringify({ players: [{ id: "player-1", recommendation: "75%" }] });
  const nextValue = JSON.stringify({ players: [{ id: "player-1", recommendation: "100%" }] });
  const { centralCache, centralCacheInfo, localStorage, queuedWrites, service } = createHarness({ quotaKey: key });

  localStorage.values.set(key, previousValue);
  centralCache.set(key, previousValue);
  centralCacheInfo.set(key, { source: "local-write", durable: true, serverBacked: false });
  service.install();

  expect(() => localStorage.setItem(key, nextValue)).toThrow("exceeded the quota");

  expect(localStorage.values.get(key)).toBe(previousValue);
  expect(localStorage.getItem(key)).toBe(previousValue);
  expect(centralCache.get(key)).toBe(previousValue);
  expect(queuedWrites).toEqual([]);
});

test("data safety runtime service blocks protected writes until central sync is ready", () => {
  const { localStorage, queuedWrites, service } = createHarness({ canWrite: false });

  service.install();

  expect(() => localStorage.setItem("football-schedule-v1", "{\"events\":[]}")).toThrow("Central sync is not ready.");
  expect(localStorage.getItem("football-schedule-v1")).toBe(null);
  expect(queuedWrites).toEqual([]);
  expect(service.status.lastError).toBe("Central sync is not ready.");
  expect(service.readManifest().lastError).toBe("Central sync is not ready.");
});

test("data safety runtime service surfaces central write errors without requiring hydration failure", () => {
  const { dataSafetyStatus, service } = createHarness({
    centralStatus: {
      hydrated: true,
      lastError: "",
      lastWriteError: "You do not have edit access for medical-team.",
    },
  });

  service.install();
  service.refreshStatus();

  expect(dataSafetyStatus.textContent).toBe("Sync needs attention");
  expect(dataSafetyStatus.title).toBe("You do not have edit access for medical-team.");
  expect(dataSafetyStatus.toggles).toContainEqual(["is-error", true]);
});

test("data safety runtime service reads server-backed hydration cache without exporting it as local backup", () => {
  const key = "football-medical-team-v1";
  const value = JSON.stringify({ players: [{ id: "player-1", recommendation: "75%" }] });
  const { localStorage, service } = createHarness({
    centralCache: { [key]: value },
    centralCacheInfo: {
      [key]: { source: "central-hydration", durable: false, serverBacked: true },
    },
  });

  service.install();

  expect(localStorage.getItem(key)).toBe(value);
  expect(service.rawGetItem(key)).toBe(value);
  expect(service.createBackupEnvelope("server-backed-cache").storage[key]).toBeUndefined();
});

test("data safety runtime service records protected removals as central tombstones", () => {
  const { localStorage, queuedWrites, service } = createHarness();

  service.install();
  localStorage.setItem("football-schedule-v1", "{\"events\":[]}");
  queuedWrites.length = 0;

  localStorage.removeItem("football-schedule-v1");

  expect(localStorage.getItem("football-schedule-v1")).toBe(null);
  expect(queuedWrites).toEqual([["football-schedule-v1", "", { removed: true }]]);
  expect(service.readManifest().entries["football-schedule-v1"]).toMatchObject({
    deletedAt: expect.any(String),
  });
});

test("data safety runtime service preserves legacy migration and queued snapshot flushing", () => {
  const { localStorage, queuedWrites, service, timers } = createHarness();

  localStorage.setItem("football-schedule-v0", "legacy-schedule");
  service.install();

  expect(localStorage.getItem("football-schedule-v1")).toBe("legacy-schedule");
  expect(service.readManifest().entries["football-schedule-v1"]).toMatchObject({
    migratedFrom: "football-schedule-v0",
  });
  expect(queuedWrites.some(([key, value]) => key === "football-schedule-v1" && value === "legacy-schedule")).toBe(true);
  expect(timers.size).toBeGreaterThan(0);
  expect(service.flushQueuedSnapshot("pagehide")).toBe(true);
});
