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
      setCachedValue: (key, value) => {
        centralCache.set(String(key), String(value));
        return true;
      },
      removeCachedValue: (key) => centralCache.delete(String(key)),
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
  return { centralCache, dataSafetyStatus, localStorage, queuedWrites, service, timers, win };
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

test("data safety runtime service falls back to central memory when browser cache quota is full", () => {
  const key = "football-medical-team-v1";
  const value = JSON.stringify({ players: [{ id: "player-1", recommendation: "75%" }] });
  const { centralCache, localStorage, queuedWrites, service } = createHarness({ quotaKey: key });

  service.install();
  expect(() => localStorage.setItem(key, value)).not.toThrow();

  expect(localStorage.values.has(key)).toBe(false);
  expect(centralCache.get(key)).toBe(value);
  expect(localStorage.getItem(key)).toBe(value);
  expect(service.rawGetItem(key)).toBe(value);
  expect(service.createBackupEnvelope("quota-fallback").storage[key]).toBe(value);
  expect(queuedWrites).toContainEqual([key, value, {}]);
  expect(service.status.lastError).toBe("");
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
