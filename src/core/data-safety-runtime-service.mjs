import { confirmPlatformAction } from "./platform-confirm-dialog.mjs";

export function createDataSafetyRuntimeService(deps = {}) {
  const {
    win = globalThis,
    documentRef = globalThis.document,
    navigatorRef = globalThis.navigator,
    storageConstructor = globalThis.Storage,
    blobConstructor = globalThis.Blob,
    urlApi = globalThis.URL,
    ui = {},
    storageKey = "football-data-safety-v1",
    exportSchema = "football-science-backup-v1",
    databaseName = "football-science-data-safety-v1",
    snapshotStoreName = "snapshots",
    latestStoreName = "latest",
    maxSnapshots = 30,
    protectedStorageKeys = [],
    storageLabels = {},
    legacyStorageKeys = {},
    formatDataSafetyTime = (value) => String(value || ""),
    canWriteCentralBackedCache = () => true,
    createCentralBackedStorageError = () => new Error("Central sync is not ready."),
    getCentralStateBridge = () => null,
    getCentralStateWriteSuppressionKeys = () => new Set(),
    queueCentralStateWrite = () => {},
  } = deps;

  const protectedStorageKeySet = new Set(protectedStorageKeys);
  const status = {
    lastError: "",
    lastSnapshotError: "",
  };
  let nativeGetItem = null;
  let nativeSetItem = null;
  let nativeRemoveItem = null;
  let nativeClear = null;
  let nativeKey = null;
  let snapshotTimer = null;
  let statusTimer = null;
  let dbPromise = null;
  let installed = false;

  function getStorage() {
    try {
      return win.localStorage;
    } catch {
      return null;
    }
  }

  function getNow() { return new Date().toISOString(); }

  function isInternalStorageKey(key) {
    const normalizedKey = String(key || "");
    return normalizedKey === storageKey || normalizedKey.startsWith("football-data-safety-");
  }

  function isProtectedStorageKey(key) {
    const normalizedKey = String(key || "");
    if (!normalizedKey || isInternalStorageKey(normalizedKey)) return false;
    return protectedStorageKeySet.has(normalizedKey);
  }

  function rawGetItem(key) {
    const storage = getStorage();
    if (!storage || !nativeGetItem) return null;
    return nativeGetItem.call(storage, key);
  }

  function rawSetItem(key, value) {
    const storage = getStorage();
    if (!storage || !nativeSetItem) return;
    nativeSetItem.call(storage, key, value);
  }

  function rawRemoveItem(key) {
    const storage = getStorage();
    if (!storage || !nativeRemoveItem) return;
    nativeRemoveItem.call(storage, key);
  }

  function rawKey(index) {
    const storage = getStorage();
    if (!storage || !nativeKey) return null;
    return nativeKey.call(storage, index);
  }

  function createManifest() {
    return {
      version: 1,
      createdAt: getNow(),
      updatedAt: "",
      lastSavedAt: "",
      lastSnapshotAt: "",
      lastExportAt: "",
      lastImportedAt: "",
      lastCentralSyncedAt: "",
      lastKey: "",
      lastError: "",
      lastSnapshotError: "",
      lastCentralError: "",
      persistentStorage: null,
      entries: {},
    };
  }

  function readManifest() {
    try {
      const raw = rawGetItem(storageKey);
      if (!raw) return createManifest();
      const parsed = JSON.parse(raw);
      return {
        ...createManifest(),
        ...parsed,
        entries: parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {},
      };
    } catch {
      return createManifest();
    }
  }

  function writeManifest(manifest) {
    const normalizedManifest = {
      ...createManifest(),
      ...manifest,
      updatedAt: getNow(),
    };
    try {
      rawSetItem(storageKey, JSON.stringify(normalizedManifest));
    } catch (error) {
      status.lastError = error?.message || "Data safety manifest could not be saved.";
    }
  }

  function mutateManifest(mutator) {
    const manifest = readManifest();
    mutator(manifest);
    writeManifest(manifest);
    return manifest;
  }

  function hashString(value) {
    const text = String(value ?? "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function getStorageLabel(key) {
    return storageLabels[key] || key.replace(/^football-/, "").replaceAll("-", " ");
  }

  function recordWrite(key, value, options = {}) {
    const normalizedKey = String(key || "");
    if (!isProtectedStorageKey(normalizedKey)) return;
    const textValue = String(value ?? "");
    const now = getNow();
    status.lastError = "";
    mutateManifest((manifest) => {
      const previousEntry = manifest.entries[normalizedKey] || {};
      manifest.lastSavedAt = now;
      manifest.lastKey = normalizedKey;
      manifest.lastError = "";
      manifest.entries[normalizedKey] = {
        label: getStorageLabel(normalizedKey),
        updatedAt: now,
        size: textValue.length,
        hash: hashString(textValue),
        writes: Number(previousEntry.writes || 0) + 1,
        deletedAt: options.removed ? now : "",
      };
    });
    queueSnapshot(options.removed ? "after-remove" : "autosave");
    if (!getCentralStateWriteSuppressionKeys().has(normalizedKey)) {
      queueCentralStateWrite(normalizedKey, textValue, options);
    }
    queueStatusRefresh();
  }

  function handleWriteError(key, error) {
    const message = error?.message || "Save failed.";
    status.lastError = message;
    mutateManifest((manifest) => {
      manifest.lastKey = String(key || "");
      manifest.lastError = message;
    });
    queueStatusRefresh();
  }

  function collectStorageData() {
    const storage = getStorage();
    const data = {};
    if (!storage) return data;
    const keys = new Set(protectedStorageKeys);
    for (let index = 0; index < storage.length; index += 1) {
      const key = rawKey(index);
      if (isProtectedStorageKey(key)) keys.add(key);
    }
    keys.forEach((key) => {
      const value = rawGetItem(key);
      if (value !== null) data[key] = value;
    });
    return data;
  }

  function createBackupEnvelope(reason = "manual") {
    const storage = collectStorageData();
    const entries = Object.entries(storage).map(([key, value]) => ({
      key,
      label: getStorageLabel(key),
      size: value.length,
      hash: hashString(value),
    }));
    return {
      schema: exportSchema,
      app: "Football Science",
      createdAt: getNow(),
      reason,
      source: win.location?.href,
      summary: {
        keyCount: entries.length,
        totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
        entries,
      },
      storage,
    };
  }

  function waitForTransaction(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!win.indexedDB) {
        reject(new Error("IndexedDB is not available."));
        return;
      }
      const request = win.indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(snapshotStoreName)) {
          database.createObjectStore(snapshotStoreName, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(latestStoreName)) {
          database.createObjectStore(latestStoreName, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function pruneSnapshots(database) {
    const keys = await new Promise((resolve, reject) => {
      const transaction = database.transaction(snapshotStoreName, "readonly");
      const request = transaction.objectStore(snapshotStoreName).getAllKeys();
      request.onsuccess = () => resolve(Array.from(request.result || []));
      request.onerror = () => reject(request.error);
    });
    if (keys.length <= maxSnapshots) return;
    const keysToDelete = keys.sort().slice(0, keys.length - maxSnapshots);
    const transaction = database.transaction(snapshotStoreName, "readwrite");
    const store = transaction.objectStore(snapshotStoreName);
    keysToDelete.forEach((key) => store.delete(key));
    await waitForTransaction(transaction);
  }

  async function saveSnapshot(reason = "autosave") {
    const snapshot = {
      ...createBackupEnvelope(reason),
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };
    try {
      const database = await openDatabase();
      const transaction = database.transaction([snapshotStoreName, latestStoreName], "readwrite");
      transaction.objectStore(snapshotStoreName).put(snapshot);
      transaction.objectStore(latestStoreName).put({ ...snapshot, id: "latest" });
      await waitForTransaction(transaction);
      await pruneSnapshots(database);
      status.lastError = "";
      status.lastSnapshotError = "";
      mutateManifest((manifest) => {
        manifest.lastSnapshotAt = snapshot.createdAt;
        manifest.lastError = "";
        manifest.lastSnapshotError = "";
      });
      queueStatusRefresh();
      return true;
    } catch (error) {
      const message = error?.message || "Backup snapshot could not be saved.";
      status.lastSnapshotError = message;
      mutateManifest((manifest) => {
        manifest.lastSnapshotError = message;
      });
      queueStatusRefresh();
      return false;
    }
  }

  function queueSnapshot(reason = "autosave") {
    if (snapshotTimer) win.clearTimeout(snapshotTimer);
    snapshotTimer = win.setTimeout(() => {
      snapshotTimer = null;
      saveSnapshot(reason);
    }, 900);
  }

  function flushQueuedSnapshot(reason = "pagehide") {
    if (!snapshotTimer) return false;
    win.clearTimeout(snapshotTimer);
    snapshotTimer = null;
    saveSnapshot(reason);
    return true;
  }

  function refreshStatus() {
    if (!ui.dataSafetyStatus) return;
    const manifest = readManifest();
    const centralStatus = getCentralStateBridge()?.getStatus?.() ?? {};
    const error = status.lastError || manifest.lastError;
    const centralError = centralStatus.lastError || manifest.lastCentralError;
    const snapshotWarning = status.lastSnapshotError || manifest.lastSnapshotError;
    const hasPendingCentralSync = Object.values(manifest.entries || {}).some((entry) => entry?.pendingCentralSync);
    ui.dataSafetyStatus.classList.toggle("is-error", Boolean(error || centralError));
    ui.dataSafetyStatus.classList.toggle(
      "is-backed-up",
      Boolean((centralStatus.lastSyncedAt || manifest.lastCentralSyncedAt) && !hasPendingCentralSync && !error && !centralError)
    );
    if (centralError) {
      ui.dataSafetyStatus.textContent = "Sync needs attention";
      ui.dataSafetyStatus.title = centralError;
      return;
    }
    if (error) {
      ui.dataSafetyStatus.textContent = "Autosave needs attention";
      ui.dataSafetyStatus.title = error;
      return;
    }
    const centralTime = formatDataSafetyTime(centralStatus.lastSyncedAt || manifest.lastCentralSyncedAt);
    const snapshotTime = formatDataSafetyTime(manifest.lastSnapshotAt);
    const savedTime = formatDataSafetyTime(manifest.lastSavedAt);
    if (centralStatus.localDev) {
      ui.dataSafetyStatus.textContent = "Local dev cache";
      ui.dataSafetyStatus.title = "Localhost cache only.";
      return;
    }
    if (hasPendingCentralSync) {
      ui.dataSafetyStatus.textContent = savedTime ? `Sync pending ${savedTime}` : "Sync pending";
      ui.dataSafetyStatus.title = "Saved locally; waiting for Supabase.";
      return;
    }
    if (centralTime) {
      ui.dataSafetyStatus.textContent = `Central sync ${centralTime}`;
      ui.dataSafetyStatus.title = "Synced centrally.";
      return;
    }
    if (snapshotTime) {
      ui.dataSafetyStatus.textContent = `Central cache ${snapshotTime}`;
      ui.dataSafetyStatus.title = "Browser cache snapshot exists.";
      return;
    }
    if (savedTime) {
      ui.dataSafetyStatus.textContent = `Waiting for central sync ${savedTime}`;
      ui.dataSafetyStatus.title = snapshotWarning
        ? `Supabase is the source of truth. Browser cache snapshot issue: ${snapshotWarning}`
        : "Waiting for central sync.";
      return;
    }
    ui.dataSafetyStatus.textContent = "Sync ready";
    ui.dataSafetyStatus.title = snapshotWarning
      ? `Supabase sync is ready. Browser cache snapshot issue: ${snapshotWarning}`
      : "Sync starts after login.";
  }

  function queueStatusRefresh() {
    if (statusTimer) win.clearTimeout(statusTimer);
    statusTimer = win.setTimeout(() => {
      statusTimer = null;
      refreshStatus();
    }, 120);
  }

  function requestPersistentStorage() {
    if (!navigatorRef?.storage?.persist) return;
    navigatorRef.storage.persist().then((granted) => {
      mutateManifest((manifest) => {
        manifest.persistentStorage = Boolean(granted);
      });
      queueStatusRefresh();
    }).catch(() => {
      mutateManifest((manifest) => {
        manifest.persistentStorage = false;
      });
    });
  }

  function exportBackup() {
    try {
      const backup = createBackupEnvelope("manual-export");
      const backupText = JSON.stringify(backup, null, 2);
      const blob = new blobConstructor([backupText], { type: "application/json" });
      const url = urlApi.createObjectURL(blob);
      const datePart = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      const link = documentRef.createElement("a");
      link.href = url;
      link.download = `football-science-backup-${datePart}.json`;
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      win.setTimeout(() => urlApi.revokeObjectURL(url), 1000);
      mutateManifest((manifest) => {
        manifest.lastExportAt = backup.createdAt;
      });
      saveSnapshot("manual-export");
      refreshStatus();
    } catch (error) {
      const message = error?.message || "The backup could not be exported.";
      status.lastError = message;
      refreshStatus();
      win.alert?.(message);
    }
  }

  function getStorageFromBackup(backup) {
    if (!backup || typeof backup !== "object") return null;
    if (backup.schema === exportSchema && backup.storage && typeof backup.storage === "object") return backup.storage;
    if (backup.keys && typeof backup.keys === "object") return backup.keys;
    return null;
  }

  async function importBackupFile(file) {
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      win.alert?.("That file is not a valid Football Science backup.");
      return;
    }
    const storage = getStorageFromBackup(backup);
    const entries = Object.entries(storage || {}).filter(([key, value]) => isProtectedStorageKey(key) && typeof value === "string");
    if (!entries.length) {
      win.alert?.("That backup did not contain any restorable Football Science data.");
      return;
    }
    const createdAt = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : "unknown time";
    const confirmed = await confirmPlatformAction({
      eyebrow: "Data Safety",
      title: "Restore backup?",
      message: `Restore Football Science data from ${createdAt}?\n\nCurrent local data will be snapshotted first, then the page will reload.`,
      confirmLabel: "Restore",
      tone: "warning",
      win,
    });
    if (!confirmed) return;
    await saveSnapshot("before-restore");
    try {
      entries.forEach(([key, value]) => {
        rawSetItem(key, value);
        recordWrite(key, value);
      });
      mutateManifest((manifest) => {
        manifest.lastImportedAt = getNow();
        manifest.lastError = "";
      });
      await saveSnapshot("after-restore");
      win.alert?.("Backup restored. The page will reload now.");
      win.setTimeout(() => win.location.reload(), 250);
    } catch (error) {
      const message = error?.message || "The backup could not be restored.";
      status.lastError = message;
      refreshStatus();
      win.alert?.(message);
    }
  }

  function migrateLegacyStorageKeys() {
    Object.entries(legacyStorageKeys).forEach(([currentKey, legacyKeys]) => {
      if (rawGetItem(currentKey) !== null) return;
      const legacyKey = legacyKeys.find((key) => rawGetItem(key) !== null);
      if (!legacyKey) return;
      const legacyValue = rawGetItem(legacyKey);
      try {
        rawSetItem(currentKey, legacyValue);
        recordWrite(currentKey, legacyValue);
        mutateManifest((manifest) => {
          manifest.entries[currentKey] = {
            ...(manifest.entries[currentKey] || {}),
            migratedFrom: legacyKey,
            migratedAt: getNow(),
          };
        });
      } catch (error) {
        handleWriteError(currentKey, error);
      }
    });
  }

  function install() {
    if (installed || typeof win === "undefined" || !storageConstructor) return;
    const storage = getStorage();
    if (!storage) return;
    nativeGetItem = storageConstructor.prototype.getItem;
    nativeSetItem = storageConstructor.prototype.setItem;
    nativeRemoveItem = storageConstructor.prototype.removeItem;
    nativeClear = storageConstructor.prototype.clear;
    nativeKey = storageConstructor.prototype.key;
    storageConstructor.prototype.setItem = function patchedDataSafetySetItem(key, value) {
      const normalizedKey = String(key || "");
      const normalizedValue = String(value ?? "");
      if (this !== storage || !isProtectedStorageKey(normalizedKey)) return nativeSetItem.call(this, key, value);
      if (!canWriteCentralBackedCache()) {
        const error = createCentralBackedStorageError();
        handleWriteError(normalizedKey, error);
        throw error;
      }
      const previousValue = rawGetItem(normalizedKey);
      try {
        const result = nativeSetItem.call(this, normalizedKey, normalizedValue);
        if (previousValue !== normalizedValue) recordWrite(normalizedKey, normalizedValue);
        return result;
      } catch (error) {
        handleWriteError(normalizedKey, error);
        throw error;
      }
    };
    storageConstructor.prototype.removeItem = function patchedDataSafetyRemoveItem(key) {
      const normalizedKey = String(key || "");
      if (this !== storage || !isProtectedStorageKey(normalizedKey)) return nativeRemoveItem.call(this, key);
      if (!canWriteCentralBackedCache()) {
        const error = createCentralBackedStorageError();
        handleWriteError(normalizedKey, error);
        throw error;
      }
      const previousValue = rawGetItem(normalizedKey);
      if (previousValue !== null) saveSnapshot("before-remove");
      const result = nativeRemoveItem.call(this, normalizedKey);
      if (previousValue !== null) recordWrite(normalizedKey, "", { removed: true });
      return result;
    };
    storageConstructor.prototype.clear = function patchedDataSafetyClear() {
      const removedKeys = this === storage ? Object.keys(collectStorageData()) : [];
      if (this === storage && removedKeys.length && !canWriteCentralBackedCache()) {
        const error = createCentralBackedStorageError();
        handleWriteError(removedKeys[0], error);
        throw error;
      }
      if (this === storage && Object.keys(collectStorageData()).length) saveSnapshot("before-clear");
      const result = nativeClear.call(this);
      if (this === storage) {
        mutateManifest((manifest) => {
          manifest.lastSavedAt = getNow();
          manifest.lastKey = "localStorage.clear";
          manifest.entries = {};
        });
        removedKeys.forEach((key) => queueCentralStateWrite(key, "", { removed: true }));
        queueStatusRefresh();
      }
      return result;
    };
    installed = true;
    migrateLegacyStorageKeys();
    mutateManifest((manifest) => {
      manifest.lastSeenAt = getNow();
    });
    requestPersistentStorage();
    queueSnapshot("startup");
    refreshStatus();
    win.footballScienceDataSafety = {
      collect: collectStorageData,
      createBackup: createBackupEnvelope,
      exportBackup,
      importBackupFile,
      saveSnapshot,
    };
  }

  return {
    status,
    getNow,
    isInternalStorageKey,
    isProtectedStorageKey,
    rawGetItem,
    rawSetItem,
    rawRemoveItem,
    rawKey,
    createManifest,
    readManifest,
    writeManifest,
    mutateManifest,
    hashString,
    getStorageLabel,
    recordWrite,
    handleWriteError,
    collectStorageData,
    createBackupEnvelope,
    waitForTransaction,
    openDatabase,
    pruneSnapshots,
    saveSnapshot,
    queueSnapshot,
    flushQueuedSnapshot,
    refreshStatus,
    queueStatusRefresh,
    requestPersistentStorage,
    exportBackup,
    getStorageFromBackup,
    importBackupFile,
    migrateLegacyStorageKeys,
    install,
  };
}
