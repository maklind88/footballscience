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
    transitionFenceStorageKey = "football-data-safety-transition-fence-v1",
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

  function isStorageQuotaError(error) {
    return (
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      Number(error?.code) === 22 ||
      Number(error?.code) === 1014 ||
      /quota/i.test(String(error?.message || ""))
    );
  }

  function getCentralCachedValue(key) {
    const value = getCentralStateBridge()?.getCachedValue?.(String(key || ""));
    return typeof value === "string" ? value : null;
  }

  function setCentralCachedValue(key, value) {
    return Boolean(getCentralStateBridge()?.setCachedValue?.(String(key || ""), String(value ?? "")));
  }

  function removeCentralCachedValue(key) {
    getCentralStateBridge()?.removeCachedValue?.(String(key || ""));
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

  function readCentralStateTransitionFence() {
    const storage = getStorage();
    if (!storage || !nativeGetItem) return null;
    try {
      const raw = nativeGetItem.call(storage, transitionFenceStorageKey);
      const fence = raw ? JSON.parse(raw) : null;
      if (!fence || typeof fence !== "object" || !String(fence.owner || "")) return null;
      const expiresAt = Number(fence.expiresAt || 0);
      if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now()) {
        try { nativeRemoveItem?.call(storage, transitionFenceStorageKey); } catch {}
        return null;
      }
      return fence;
    } catch {
      return null;
    }
  }

  function isCentralStateTransitionFenceActive() {
    return Boolean(readCentralStateTransitionFence()?.owner);
  }

  function createCentralStateTransitionFenceError() {
    return new Error("Local save is paused while account data is being isolated safely.");
  }


  function rawGetItem(key) {
    const storage = getStorage();
    if (!storage || !nativeGetItem) return null;
    if (isProtectedStorageKey(key)) {
      const cachedValue = getCentralCachedValue(key);
      if (cachedValue !== null) return cachedValue;
    }
    return nativeGetItem.call(storage, key);
  }

  function rawSetItem(key, value) {
    const storage = getStorage();
    if (!storage || !nativeSetItem) return;
    const normalizedKey = String(key || "");
    const normalizedValue = String(value ?? "");
    try {
      nativeSetItem.call(storage, normalizedKey, normalizedValue);
      if (isProtectedStorageKey(normalizedKey)) setCentralCachedValue(normalizedKey, normalizedValue);
    } catch (error) {
      if (!isProtectedStorageKey(normalizedKey) || !isStorageQuotaError(error) || !setCentralCachedValue(normalizedKey, normalizedValue)) {
        throw error;
      }
      try {
        nativeRemoveItem?.call(storage, normalizedKey);
      } catch {}
    }
  }

  function rawRemoveItem(key) {
    const storage = getStorage();
    if (!storage || !nativeRemoveItem) return;
    nativeRemoveItem.call(storage, key);
    if (isProtectedStorageKey(key)) removeCentralCachedValue(key);
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
      return true;
    } catch (error) {
      status.lastError = error?.message || "Data safety manifest could not be saved.";
      return false;
    }
  }

  function mutateManifestWithResult(mutator) {
    const manifest = readManifest();
    mutator(manifest);
    return {
      manifest,
      persisted: writeManifest(manifest),
    };
  }

  function mutateManifest(mutator) {
    return mutateManifestWithResult(mutator).manifest;
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
    if (isCentralStateTransitionFenceActive()) {
      throw createCentralStateTransitionFenceError();
    }
    if (win.__footballScienceCentralHydrating) {
      return typeof options.rawWrite === "function" ? options.rawWrite() : undefined;
    }
    const textValue = String(value ?? "");
    const now = getNow();
    status.lastError = "";
    const recordMetadata = {
      label: getStorageLabel(normalizedKey),
      updatedAt: now,
      size: textValue.length,
      hash: hashString(textValue),
    };
    if (!getCentralStateWriteSuppressionKeys().has(normalizedKey)) {
      const queued = queueCentralStateWrite(normalizedKey, textValue, {
        ...options,
        recordWrite: recordMetadata,
      });
      if (queued !== true) {
        throw new Error("The local save was rejected because its recovery record could not be persisted safely.");
      }
      queueSnapshot(options.removed ? "after-remove" : "autosave");
      queueStatusRefresh();
      return undefined;
    } else {
      const mutation = mutateManifestWithResult((manifest) => {
        const previousEntry = manifest.entries[normalizedKey] || {};
        manifest.lastSavedAt = now;
        manifest.lastKey = normalizedKey;
        manifest.lastError = "";
        manifest.entries[normalizedKey] = {
          ...previousEntry,
          ...recordMetadata,
          writes: Number(previousEntry.writes || 0) + 1,
          deletedAt: options.removed ? now : "",
        };
      });
      if (!mutation.persisted) {
        throw new Error("The local save was rejected because its recovery record could not be persisted safely.");
      }
    }
    const rawResult = typeof options.rawWrite === "function" ? options.rawWrite() : undefined;
    queueSnapshot(options.removed ? "after-remove" : "autosave");
    queueStatusRefresh();
    return rawResult;
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
        recordWrite(key, value, {
          rawWrite: () => rawSetItem(key, value),
        });
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
        recordWrite(currentKey, legacyValue, {
          rawWrite: () => rawSetItem(currentKey, legacyValue),
        });
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
    storageConstructor.prototype.getItem = function patchedDataSafetyGetItem(key) {
      const normalizedKey = String(key || "");
      if (this === storage && isProtectedStorageKey(normalizedKey)) {
        const cachedValue = getCentralCachedValue(normalizedKey);
        if (cachedValue !== null) return cachedValue;
      }
      return nativeGetItem.call(this, key);
    };
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
        if (previousValue === normalizedValue) {
          return nativeSetItem.call(this, key, value);
        }
        return recordWrite(normalizedKey, normalizedValue, {
          previousValue,
          rawWrite: () => rawSetItem(normalizedKey, normalizedValue),
        });
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
      if (previousValue === null) {
        return nativeRemoveItem.call(this, key);
      }
      return recordWrite(normalizedKey, "", {
        removed: true,
        previousValue,
        rawWrite: () => rawRemoveItem(normalizedKey),
      });
    };
    storageConstructor.prototype.clear = function patchedDataSafetyClear() {
      if (this !== storage) return nativeClear.call(this);
      const protectedData = collectStorageData();
      const protectedKeysToRemove = Object.keys(protectedData);
      if (protectedKeysToRemove.length && !canWriteCentralBackedCache()) {
        const error = createCentralBackedStorageError();
        handleWriteError(protectedKeysToRemove[0], error);
        throw error;
      }
      if (protectedKeysToRemove.length) saveSnapshot("before-clear");
      const allKeys = new Set();
      for (let index = 0; index < storage.length; index += 1) {
        const currentKey = rawKey(index);
        if (currentKey) allKeys.add(String(currentKey));
      }
      protectedKeysToRemove.forEach((key) => {
        recordWrite(key, "", {
          removed: true,
          previousValue: protectedData[key],
          rawWrite: () => rawRemoveItem(key),
        });
      });
      allKeys.forEach((key) => {
        if (!isProtectedStorageKey(key) && !isInternalStorageKey(key)) {
          nativeRemoveItem.call(storage, key);
        }
      });
      mutateManifest((manifest) => {
        manifest.lastSavedAt = getNow();
        manifest.lastKey = "localStorage.clear";
      });
      queueStatusRefresh();
      return undefined;
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
    getCentralCachedValue,
    setCentralCachedValue,
    removeCentralCachedValue,
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
    readCentralStateTransitionFence,
    isCentralStateTransitionFenceActive,
    mutateManifest,
    mutateManifestWithResult,
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
