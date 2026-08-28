import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createDataSafetyRuntimeService } from "../src/core/data-safety-runtime-service.mjs";

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
    if (String(key) === options.quotaKey) {
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
    protectedStorageKeys: ["football-schedule-v1", "football-medical-team-v1"],
    storageLabels: {
      "football-schedule-v1": "Schedule",
      "football-medical-team-v1": "Medical Room",
    },
    legacyStorageKeys: {
      "football-schedule-v1": ["football-schedule-v0"],
    },
    formatDataSafetyTime: (value) => (value ? "now" : ""),
    canWriteCentralBackedCache: () => options.canWrite !== false,
    createCentralBackedStorageError: () => new Error("Central sync is not ready."),
    getCentralStateBridge: () => win.footballScienceCentralState,
    getCentralStateWriteSuppressionKeys: () => options.suppressionKeys || new Set(),
    queueCentralStateWrite: (...args) => queuedWrites.push(args),
  });
  return { centralCache, centralCacheInfo, dataSafetyStatus, localStorage, queuedWrites, service, timers, win };
}

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
