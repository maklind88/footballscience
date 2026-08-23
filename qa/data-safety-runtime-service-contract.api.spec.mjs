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
    if (String(key) === "football-data-safety-v1" && options.failManifestWrites === true) {
      throw new Error("Manifest persistence failed.");
    }
    if (String(key) === options.quotaKey) {
      const error = new Error(`Setting ${String(key)} exceeded the quota.`);
      error.name = "QuotaExceededError";
      throw error;
    }
    if (String(key) === String(options.failRawSetKey || "")) {
      throw new Error("Raw set failed.");
    }
    this.values.set(String(key), String(value));
  };
  FakeStorage.prototype.removeItem = function removeItem(key) {
    if (String(key) === String(options.failRawRemoveKey || "")) {
      throw new Error("Raw remove failed.");
    }
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
    queueCentralStateWrite: (...args) => {
      queuedWrites.push(args);
      const [key, value, writeOptions = {}] = args;
      const normalizedKey = String(key);
      let previousEntry = null;
      const mutation = service.mutateManifestWithResult((manifest) => {
        previousEntry = manifest.entries[normalizedKey] || null;
        const recordWrite = writeOptions.recordWrite || {};
        manifest.lastSavedAt = String(recordWrite.updatedAt || "");
        manifest.lastKey = normalizedKey;
        manifest.lastError = "";
        manifest.entries[normalizedKey] = {
          ...(previousEntry || {}),
          ...recordWrite,
          writes: Number(previousEntry?.writes || 0) + 1,
          deletedAt: writeOptions.removed ? String(recordWrite.updatedAt || "") : "",
          pendingCentralSync: true,
          principalScope: "user-1:org-1:club-1:team-1:coach:active",
        };
      });
      if (!mutation.persisted) return false;
      try {
        if (typeof writeOptions.rawWrite === "function") writeOptions.rawWrite();
      } catch {
        service.mutateManifestWithResult((manifest) => {
          if (previousEntry) manifest.entries[normalizedKey] = previousEntry;
          else delete manifest.entries[normalizedKey];
        });
        return false;
      }
      const currentValue = service.rawGetItem(normalizedKey);
      if (writeOptions.removed ? currentValue !== null : currentValue !== String(value ?? "")) {
        service.mutateManifestWithResult((manifest) => {
          if (previousEntry) manifest.entries[normalizedKey] = previousEntry;
          else delete manifest.entries[normalizedKey];
        });
        return false;
      }
      return true;
    },
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
  expect(queuedWrites).toContainEqual([
    "football-schedule-v1",
    "{\"events\":[]}",
    expect.objectContaining({
      recordWrite: expect.objectContaining({ label: "Schedule", size: 13 }),
    }),
  ]);
  expect(service.createBackupEnvelope("manual").summary).toMatchObject({
    keyCount: 1,
    totalBytes: 13,
  });
  expect(typeof win.footballScienceDataSafety.exportBackup).toBe("function");
  expect(timers.size).toBeGreaterThan(0);
});

test("data safety runtime service applies hydration cache values without rewriting the pending generation", () => {
  const key = "football-medical-team-v1";
  const localValue = JSON.stringify({ injuryPlans: [{ id: "pending-a" }] });
  const hydratedValue = JSON.stringify({ injuryPlans: [{ id: "central" }, { id: "pending-a" }] });
  const { localStorage, queuedWrites, service, win } = createHarness();

  service.install();
  localStorage.setItem(key, localValue);
  service.mutateManifestWithResult((manifest) => {
    manifest.entries[key] = {
      ...manifest.entries[key],
      hash: "pending-generation-a",
      serverRevision: 7,
      updatedAt: "2026-08-23T12:00:00.000Z",
      writes: 4,
    };
  });
  const expectedEntry = structuredClone(service.readManifest().entries[key]);
  const queuedBeforeHydration = queuedWrites.length;

  win.__footballScienceCentralHydrating = true;
  try {
    localStorage.setItem(key, hydratedValue);
  } finally {
    win.__footballScienceCentralHydrating = false;
  }

  expect(service.rawGetItem(key)).toBe(hydratedValue);
  expect(queuedWrites).toHaveLength(queuedBeforeHydration);
  expect(service.readManifest().entries[key]).toEqual(expectedEntry);
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
  expect(queuedWrites).toContainEqual([
    key,
    value,
    expect.objectContaining({
      recordWrite: expect.objectContaining({ label: "Medical Room", size: value.length }),
    }),
  ]);
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

test("data safety runtime service rejects a protected write before raw data changes when the recovery manifest cannot persist", () => {
  const options = {};
  const { localStorage, service } = createHarness(options);

  service.install();
  options.failManifestWrites = true;

  expect(() => localStorage.setItem("football-schedule-v1", "{\"events\":[{\"id\":\"new\"}]}"))
    .toThrow("The local save was rejected because its recovery record could not be persisted safely.");
  expect(localStorage.values.has("football-schedule-v1")).toBe(false);
  expect(service.rawGetItem("football-schedule-v1")).toBe(null);
});

test("data safety runtime service rolls back pending metadata when raw set fails after manifest persistence", () => {
  const options = {};
  const { localStorage, service } = createHarness(options);
  const key = "football-schedule-v1";

  service.install();
  options.failRawSetKey = key;

  expect(() => localStorage.setItem(key, "{\"events\":[{\"id\":\"raw-fail\"}]}")).toThrow(
    "The local save was rejected because its recovery record could not be persisted safely."
  );
  expect(localStorage.values.has(key)).toBe(false);
  expect(service.rawGetItem(key)).toBe(null);
  expect(service.readManifest().entries[key]?.pendingCentralSync).not.toBe(true);
});

test("data safety runtime service rolls back pending metadata when raw delete fails after manifest persistence", () => {
  const options = {};
  const { localStorage, service } = createHarness(options);
  const key = "football-schedule-v1";
  const value = "{\"events\":[{\"id\":\"delete-survives\"}]}";

  localStorage.setItem(key, value);
  service.install();
  options.failRawRemoveKey = key;

  expect(() => localStorage.removeItem(key)).toThrow(
    "The local save was rejected because its recovery record could not be persisted safely."
  );
  expect(service.rawGetItem(key)).toBe(value);
  expect(service.readManifest().entries[key]?.pendingCentralSync).not.toBe(true);
});

test("data safety runtime service clear never removes protected raw data before tombstone commit succeeds", () => {
  const options = {};
  const { localStorage, service } = createHarness(options);
  const scheduleValue = "{\"events\":[{\"id\":\"clear-survives\"}]}";
  const medicalValue = "{\"players\":[{\"id\":\"medical-survives\"}]}";

  localStorage.setItem("football-schedule-v1", scheduleValue);
  localStorage.setItem("football-medical-team-v1", medicalValue);
  service.install();
  options.failRawRemoveKey = "football-schedule-v1";

  expect(() => localStorage.clear()).toThrow(
    "The local save was rejected because its recovery record could not be persisted safely."
  );
  expect(service.rawGetItem("football-schedule-v1")).toBe(scheduleValue);
  expect(service.rawGetItem("football-medical-team-v1")).toBe(medicalValue);
  expect(service.readManifest().entries["football-schedule-v1"]?.pendingCentralSync).not.toBe(true);
});

test("data safety runtime service rejects a protected delete before raw data changes when the recovery manifest cannot persist", () => {
  const options = {};
  const { localStorage, service } = createHarness(options);
  const key = "football-schedule-v1";
  const value = "{\"events\":[{\"id\":\"must-survive\"}]}";

  localStorage.setItem(key, value);
  service.install();
  options.failManifestWrites = true;

  expect(() => localStorage.removeItem(key))
    .toThrow("The local save was rejected because its recovery record could not be persisted safely.");
  expect(service.rawGetItem(key)).toBe(value);
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
