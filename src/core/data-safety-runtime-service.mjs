import { createLocalSaveIssues } from "./local-save-issues.mjs";
import { storeDistinctSnapshot } from "./distinct-snapshot-store.mjs";
import { openStorageHealth } from "./storage-health-dialog.mjs";
import { confirmPlatformAction } from "./platform-confirm-dialog.mjs";
import { createLocalDatabaseConnection } from "./local-database-connection.mjs";

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
    journaledStorageKeys = ["football-session-planner-v3"],
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
  const journaledStorageKeySet = new Set(journaledStorageKeys);
  const status = {
    lastError: "",
    lastSnapshotError: "",
  };
  let issueSequence = 0;
  const saveIssues = createLocalSaveIssues({ readManifest, status,
    mutateManifest: mutator => { const manifest = readManifest(); mutator(manifest); return writeManifest(manifest); },
    getScope: () => getCentralStateBridge()?.getReadScope?.(), isProtectedKey: isProtectedStorageKey,
    createId: () => win.crypto?.randomUUID?.() || `${Date.now()}-${++issueSequence}-${Math.random().toString(16).slice(2)}`,
  });
  let nativeGetItem = null;
  let nativeSetItem = null;
  let nativeRemoveItem = null;
  let nativeClear = null;
  let nativeKey = null;
  let snapshotTimer = null;
  let statusTimer = null;
  const { open: openDatabase } = createLocalDatabaseConnection({ getIndexedDB: () => win.indexedDB, databaseName,
    stores: [snapshotStoreName, latestStoreName].map((name) => ({ name, keyPath: "id" })) });
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

  function getCentralCachedValueInfo(key) {
    const bridge = getCentralStateBridge();
    if (typeof bridge?.getCachedValueInfo === "function") {
      const info = bridge.getCachedValueInfo(String(key || ""));
      return info && typeof info === "object" ? info : {};
    }
    const value = bridge?.getCachedValue?.(String(key || ""));
    return typeof value === "string" ? { value, source: "legacy", durable: true } : {};
  }

  function setCentralCachedValue(key, value, options = {}) {
    return Boolean(getCentralStateBridge()?.setCachedValue?.(String(key || ""), String(value ?? ""), options));
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

  function rawGetItem(key) {
    const storage = getStorage();
    if (!storage || !nativeGetItem) return null;
    if (isProtectedStorageKey(key) && getCentralCachedValueInfo(key).source !== "central-readonly-baseline") {
      const cachedValue = getCentralCachedValue(key);
      if (cachedValue !== null) return cachedValue;
    }
    return nativeGetItem.call(storage, key);
  }

  function hasUnauthorizedMedicalRecovery(key) {
    return key === "football-medical-team-v1" && readManifest().entries[key]?.pendingCentralSync &&
      getCentralStateBridge()?.canAutoSyncKey?.(key) !== true;
  }

  function isPendingDeletionReload(key) {
    if (!win.__footballScienceCentralReloading || !isProtectedStorageKey(key)) return false;
    const entry = readManifest().entries?.[key];
    return Boolean(entry?.pendingCentralSync && entry.deletedAt);
  }

  function rawSetItem(key, value, options = {}) {
    const storage = getStorage();
    if (!storage || !nativeSetItem) return;
    const normalizedKey = String(key || "");
    const normalizedValue = String(value ?? "");
    if (isPendingDeletionReload(normalizedKey)) return;
    const readView = getCentralCachedValueInfo(normalizedKey);
    if (readView.source !== "central-readonly-baseline" && hasUnauthorizedMedicalRecovery(normalizedKey)) {
      throw new Error("Medical recovery is pending an authorized central read. The local copy was retained.");
    }
    if (readView.source === "central-readonly-baseline" && !options.explicitReadViewWrite) {
      // Coach-only UI normalization stays in memory, away from the pending recovery copy.
      if (!setCentralCachedValue(normalizedKey, normalizedValue, readView)) {
        throw new Error("Central read view unavailable. The local recovery copy was retained.");
      }
      return;
    }
    const recovery = readView.source === "central-readonly-baseline" ? archiveReadViewRecovery(normalizedKey, readView) : null;
    const previousNativeValue = isProtectedStorageKey(normalizedKey)
      ? nativeGetItem?.call(storage, normalizedKey)
      : null;
    try {
      nativeSetItem.call(storage, normalizedKey, normalizedValue);
      if (isProtectedStorageKey(normalizedKey)) setCentralCachedValue(normalizedKey, normalizedValue);
    } catch (error) {
      if (recovery) discardUnchangedRecoveryArchive(recovery);
      if (isProtectedStorageKey(normalizedKey) && isStorageQuotaError(error)) {
        // Only a verified server acknowledgement may replace the read cache
        // without local durability. Preserve the previous native recovery copy.
        if (options.serverAcknowledged && setCentralCachedValue(normalizedKey, normalizedValue, {
          source: "central-acknowledgement", durable: false, serverBacked: true,
        })) return;
        const cachedInfo = getCentralCachedValueInfo(normalizedKey);
        if (previousNativeValue === null) {
          if (!(cachedInfo.serverBacked && cachedInfo.durable === false)) {
            removeCentralCachedValue(normalizedKey);
          }
          try {
            nativeRemoveItem?.call(storage, normalizedKey);
          } catch {}
        }
      }
      throw error;
    }
  }

  function cacheAcknowledgedValue(key, value) {
    if (!getStorage() || !nativeSetItem) throw new Error("Browser cache is unavailable.");
    rawSetItem(key, value, { serverAcknowledged: true });
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

  function collectRecoveryCopies() {
    const storage = getStorage(), copies = {};
    for (let index = 0; storage && index < storage.length; index += 1) {
      const key = rawKey(index);
      if (key?.startsWith(`${storageKey}:recovery:`)) copies[key] = nativeGetItem.call(storage, key);
    }
    return copies;
  }

  function archiveReadViewRecovery(key, view) {
    if (key !== "football-medical-team-v1" || !view.canEdit || !view.readScope || getCentralStateBridge()?.canAutoSyncKey?.(key) !== true) {
      throw new Error("This central view is read-only. The local recovery copy was retained.");
    }
    const storage = getStorage();
    const value = nativeGetItem.call(storage, key);
    const manifest = JSON.parse(nativeGetItem.call(storage, storageKey) || "{}");
    if (!manifest.entries || typeof manifest.entries !== "object") throw new Error("Local recovery metadata could not be verified.");
    const entry = manifest.entries[key] || {};
    const recoveryKey = `${storageKey}:recovery:${win.crypto.randomUUID()}`;
    // Never adopt this historical copy as a new actor's edit or automatic retry.
    const recovery = JSON.stringify({ key, value, entry, createdAt: getNow(), ownership: "unverified-recovery" });
    const markerKey = `${storageKey}:medical-recovery`;
    const previousMarker = nativeGetItem.call(storage, markerKey);
    const marker = JSON.stringify({ readScope: view.readScope, incompleteReplacement: true,
      generation: JSON.stringify([entry.hash || "", entry.writes || 0, entry.updatedAt || "", entry.deletedAt || ""]) });
    const archive = { key, value, entry, recoveryKey, recovery, markerKey, previousMarker, marker };
    try {
      nativeSetItem.call(storage, recoveryKey, recovery);
      if (nativeGetItem.call(storage, recoveryKey) !== recovery) throw new Error("Local recovery copy could not be verified.");
      nativeSetItem.call(storage, markerKey, marker);
      if (nativeGetItem.call(storage, markerKey) !== marker) throw new Error("Medical draft ownership could not be preserved.");
      if (nativeGetItem.call(storage, key) !== value ||
          JSON.stringify(readManifest().entries[key] || {}) !== JSON.stringify(entry)) {
        throw new Error("Local recovery changed. Retry your new edit after refreshing.");
      }
      return archive;
    } catch (error) {
      discardUnchangedRecoveryArchive(archive);
      throw error;
    }
  }

  function discardUnchangedRecoveryArchive(archive) {
    const storage = getStorage();
    // Remove only this unused archive, never a replacement or a newer local generation.
    if (nativeGetItem.call(storage, archive.key) !== archive.value ||
        JSON.stringify(readManifest().entries[archive.key] || {}) !== JSON.stringify(archive.entry)) return;
    try {
      if (nativeGetItem.call(storage, archive.markerKey) === archive.marker) {
        if (archive.previousMarker === null) nativeRemoveItem.call(storage, archive.markerKey);
        else nativeSetItem.call(storage, archive.markerKey, archive.previousMarker);
      }
      if (nativeGetItem.call(storage, archive.recoveryKey) === archive.recovery) nativeRemoveItem.call(storage, archive.recoveryKey);
    } catch { /* Retain the archive if its cleanup cannot be verified safely. */ }
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
      if (!getStorage() || !nativeSetItem) throw new Error("Data safety manifest storage is unavailable.");
      rawSetItem(storageKey, JSON.stringify(normalizedManifest));
      return true;
    } catch (error) {
      status.lastError = error?.message || "Data safety manifest could not be saved.";
      return false;
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
    const previousIssue = saveIssues.capture(normalizedKey);
    let retainedBaseRevision;
    const writtenManifest = mutateManifest((manifest) => {
      const previousEntry = manifest.entries[normalizedKey] || {};
      if (previousEntry.pendingCentralSync && previousEntry.principalScope &&
          previousEntry.principalScope === getCentralStateBridge()?.getReadScope?.() &&
          !options.replacement && !win.__footballScienceCentralHydrating) {
        const revision = Number(previousEntry.pendingBaseRevision ?? previousEntry.serverRevision);
        retainedBaseRevision = Number.isInteger(revision) && revision >= 0 ? revision : 0;
      }
      if (!options.deferQueue) manifest.lastSavedAt = now;
      manifest.lastKey = normalizedKey;
      manifest.entries[normalizedKey] = {
        label: getStorageLabel(normalizedKey),
        updatedAt: now,
        size: textValue.length,
        hash: hashString(textValue),
        writes: Number(previousEntry.writes || 0) + 1,
        deletedAt: options.removed ? now : "",
        ...(!win.__footballScienceCentralHydrating && getCentralStateBridge()?.getReadScope?.()
          ? { principalScope: getCentralStateBridge().getReadScope() } : {}),
        ...(options.requirePersisted ? { pendingCentralSync: true,
          ...(options.deferQueue ? { localWritePrepared: true } : {}),
          pendingBaseRevision: retainedBaseRevision ?? Number(getCentralStateBridge()?.getStatus?.()?.metadata?.[normalizedKey]?.revision || 0),
          serverRevision: Number(previousEntry.serverRevision || 0),
        } : {}),
      };
    });
    if (options.requirePersisted && JSON.stringify(readManifest().entries[normalizedKey]) !==
        JSON.stringify(writtenManifest.entries[normalizedKey])) {
      // Do not overwrite a newer raw value to roll back. Both copies remain available for recovery.
      throw new Error(options.replacement
        ? "Medical edit was not queued: recovery metadata could not be saved. Both versions were retained."
        : "Edit was not queued: recovery metadata could not be saved.");
    }
    const queueOptions = { ...options, ...(retainedBaseRevision === undefined ? {} : { baseRevision: retainedBaseRevision }) };
    if (options.deferQueue) return { entry: writtenManifest.entries[normalizedKey], queueOptions };
    queueSnapshot(options.removed ? "after-remove" : "autosave");
    if (!getCentralStateWriteSuppressionKeys().has(normalizedKey)) {
      if (queueCentralStateWrite(normalizedKey, textValue, queueOptions) === false) {
        throw new Error("Edit remains local: pending sync metadata could not be saved.");
      }
    }
    saveIssues.resolve(previousIssue);
    queueStatusRefresh();
  }

  function writeProtectedValue(key, value, options, mutateRaw) {
    const previousIssue = saveIssues.capture(key);
    const storage = getStorage();
    const previousRaw = nativeGetItem.call(storage, key);
    const manifest = JSON.parse(nativeGetItem.call(storage, storageKey) || '{"entries":{}}');
    if (!manifest.entries || typeof manifest.entries !== "object" || Array.isArray(manifest.entries)) {
      throw new Error("Local save metadata could not be verified.");
    }
    const bridge = getCentralStateBridge();
    if (typeof bridge?.getReadScope === "function" && !bridge.getReadScope()) throw createCentralBackedStorageError();
    const previousEntry = manifest.entries[key];
    // Persist ownership and retry intent before any ordinary user cache mutation.
    const prepared = recordWrite(key, value, { ...options, requirePersisted: true, deferQueue: true });
    let result;
    try {
      result = mutateRaw();
    } catch (error) {
      if (nativeGetItem.call(storage, key) === previousRaw) mutateManifest((manifest) => {
        if (JSON.stringify(manifest.entries[key]) !== JSON.stringify(prepared.entry)) return;
        if (previousEntry) manifest.entries[key] = previousEntry;
        else delete manifest.entries[key];
      });
      throw error;
    }
    queueSnapshot(options.removed ? "after-remove" : "autosave");
    const { deferQueue, requirePersisted, ...queueOptions } = prepared.queueOptions;
    if (!getCentralStateWriteSuppressionKeys().has(key) && queueCentralStateWrite(key, value, queueOptions) === false) {
      throw new Error("Edit remains local: pending sync metadata could not be saved.");
    }
    saveIssues.resolve(previousIssue);
    queueStatusRefresh();
    return result;
  }

  function handleWriteError(key, error) {
    const message = error?.message || "Save failed.";
    saveIssues.report(String(key || ""), message);
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
      const value = isProtectedStorageKey(key)
        ? (nativeGetItem ? nativeGetItem.call(storage, key) : null)
        : rawGetItem(key);
      const cachedInfo = isProtectedStorageKey(key) ? getCentralCachedValueInfo(key) : {};
      if (value === null && cachedInfo?.value !== undefined && cachedInfo.durable !== true) {
        return;
      }
      if (value !== null) data[key] = value;
    });
    return data;
  }

  function createBackupEnvelope(reason = "manual") {
    const storage = collectStorageData();
    const manifest = readManifest();
    const recoverySeparations = [...protectedStorageKeySet].filter((key) =>
      getCentralCachedValueInfo(key).source === "central-readonly-baseline" ||
      (key === "football-medical-team-v1" && manifest.entries[key]?.pendingCentralSync));
    const recoveryState = Object.fromEntries(recoverySeparations.map((key) => [key, {
      value: nativeGetItem?.call(getStorage(), key) ?? null,
      entry: manifest.entries[key] || null,
      marker: key === "football-medical-team-v1" ? nativeGetItem?.call(getStorage(), `${storageKey}:medical-recovery`) ?? null : null,
    }]));
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
      recoveryCopies: collectRecoveryCopies(),
      saveContext: {
        scope: getCentralStateBridge()?.getReadScope?.() || "",
        entries: Object.fromEntries(Object.entries(manifest.entries || {}).filter(([key]) => isProtectedStorageKey(key)).map(([key, entry]) => [key,
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? Object.fromEntries(["principalScope", "pendingCentralSync", "pendingBaseRevision", "serverRevision", "writes", "hash", "updatedAt", "deletedAt", "localWritePrepared"]
              .filter(field => Object.hasOwn(entry, field)).map(field => [field, entry[field]]))
            : null,
        ])),
      },
      recoverySeparations,
      recoveryState,
    };
  }

  function waitForTransaction(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function pruneSnapshots(database) {
    const keys = await new Promise((resolve, reject) => {
      const transaction = database.transaction(snapshotStoreName, "readonly");
      const request = transaction.objectStore(snapshotStoreName).getAllKeys();
      request.onsuccess = () => resolve(Array.from(request.result || []));
      request.onerror = () => reject(request.error);
    });
    // Pending Sessions recovery copies are not rotating historical snapshots.
    const rotatingKeys = keys.filter((key) => !String(key).startsWith("football-session-planner-v3-quota-fallback"));
    if (rotatingKeys.length <= maxSnapshots) return;
    const keysToDelete = rotatingKeys.sort().slice(0, rotatingKeys.length - maxSnapshots);
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
      const stored = await storeDistinctSnapshot(database, snapshotStoreName, latestStoreName, snapshot);
      if (stored.written) await pruneSnapshots(database);
      // A cache copy is not acknowledgement of a failed user save. An in-memory
      // draft may be absent from it, including one created while this write awaited.
      status.lastSnapshotError = "";
      mutateManifest((manifest) => {
        manifest.lastSnapshotAt = stored.createdAt;
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
    const error = saveIssues.error(manifest);
    const libraryStorageUnknown = ["football-session-exercise-library-v1", "football-session-exercise-library-folders-v1"]
      .some(key => getCentralStateBridge()?.getLibrarySaveState?.(key)?.storageUnavailable);
    const libraryReadError = ["football-session-exercise-library-v1", "football-session-exercise-library-folders-v1"]
      .some(key => getCentralStateBridge()?.getLibrarySaveState?.(key)?.readError);
    const libraryReadDenied = ["football-session-exercise-library-v1", "football-session-exercise-library-folders-v1"]
      .some(key => getCentralStateBridge()?.getLibrarySaveState?.(key)?.readDenied);
    const centralError = centralStatus.lastError || centralStatus.lastWriteError || manifest.lastCentralError || centralStatus.libraryStorageError ||
      (libraryReadError ? "The central library could not be verified. Existing copies were retained." : libraryReadDenied ? "Library access was denied. Retained edits have not been discarded." : libraryStorageUnknown ? "Library recovery storage cannot be checked. A confirmed central save is still valid." : "");
    const snapshotWarning = status.lastSnapshotError || manifest.lastSnapshotError;
    const libraryPending = ["football-session-exercise-library-v1", "football-session-exercise-library-folders-v1"]
      .some(key => getCentralStateBridge()?.getLibrarySaveState?.(key)?.pending);
    const hasPendingCentralSync = libraryPending || Object.values(manifest.entries || {}).some((entry) => entry?.pendingCentralSync);
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
    const centralSavedTime = formatDataSafetyTime(centralStatus.lastSavedAt);
    const fetchedTime = formatDataSafetyTime(centralStatus.lastFetchedAt);
    const snapshotTime = formatDataSafetyTime(manifest.lastSnapshotAt);
    const savedTime = formatDataSafetyTime(manifest.lastSavedAt);
    if (centralStatus.localDev) {
      ui.dataSafetyStatus.textContent = "Local dev cache";
      ui.dataSafetyStatus.title = "Localhost cache only.";
      return;
    }
    if (hasPendingCentralSync) {
      ui.dataSafetyStatus.textContent = savedTime ? `Sync pending ${savedTime}` : "Sync pending";
      ui.dataSafetyStatus.title = "Waiting for central confirmation. Keep this page open if local saving has failed.";
      return;
    }
    if (centralTime) {
      ui.dataSafetyStatus.textContent = centralSavedTime ? `Saved ${centralSavedTime}` : "Up to date";
      ui.dataSafetyStatus.title = [
        centralSavedTime ? `Changes saved to server ${centralSavedTime}.` : "No pending changes.",
        fetchedTime ? `Last checked for updates ${fetchedTime}.` : "",
      ].filter(Boolean).join(" ");
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

  async function exportBackup() {
    try {
      const scope = getCentralStateBridge()?.getReadScope?.();
      const libraryRecovery = await getCentralStateBridge()?.exportLibraryRecovery?.();
      if (scope !== getCentralStateBridge()?.getReadScope?.()) throw new Error("Account changed during export.");
      const backup = createBackupEnvelope("manual-export");
      if (libraryRecovery) backup.libraryRecovery = libraryRecovery;
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
    if (backup?.libraryRecovery?.baselines?.length || backup?.libraryRecovery?.pending?.length || backup?.libraryRecovery?.recovery?.length || Object.keys(backup?.recoveryCopies || {}).length || backup?.recoverySeparations?.length || Object.keys(backup?.recoveryState || {}).length) {
      win.alert?.("Backup not restored. Archived recovery copies require explicit review and cannot be imported automatically. Use Storage health to review library backup files.");
      return;
    }
    const entries = Object.entries(storage || {}).filter(([key, value]) => isProtectedStorageKey(key) && typeof value === "string");
    if (!entries.length) {
      win.alert?.("That backup did not contain any restorable Football Science data.");
      return;
    }
    const canRestore = () => {
      if (!entries.some(([key]) => getCentralCachedValueInfo(key).source === "central-readonly-baseline" || hasUnauthorizedMedicalRecovery(key))) return true;
      win.alert?.("Backup not restored. A local recovery copy needs review before replacing this central view.");
      return false;
    };
    if (!canRestore()) return;
    const createdAt = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : "unknown time";
    const confirmed = await confirmPlatformAction({
      eyebrow: "Data Safety",
      title: "Restore backup?",
      message: `Restore Football Science data from ${createdAt}?\n\nCurrent local data will be snapshotted first, then the page will reload.`,
      confirmLabel: "Restore",
      tone: "warning",
      win,
    });
    if (!confirmed || !canRestore()) return;
    await saveSnapshot("before-restore");
    if (!canRestore()) return;
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
      // View normalization is not a new user edit and must not resurrect a pending deletion.
      if (isPendingDeletionReload(normalizedKey)) return;
      const readView = getCentralCachedValueInfo(normalizedKey);
      const separated = readView.source === "central-readonly-baseline";
      if (separated && !readView.canEdit) {
        throw new Error("This central view is read-only. The local recovery copy was retained.");
      }
      if (!canWriteCentralBackedCache()) {
        const error = createCentralBackedStorageError();
        handleWriteError(normalizedKey, error);
        throw error;
      }
      const previousValue = rawGetItem(normalizedKey);
      const previousPending = normalizedKey === "football-session-planner-v3" && Boolean(readManifest().entries?.[normalizedKey]?.pendingCentralSync);
      try {
        if (!separated && !win.__footballScienceCentralHydrating && previousValue !== normalizedValue) {
          return writeProtectedValue(normalizedKey, normalizedValue,
            journaledStorageKeySet.has(normalizedKey) ? { previousValue, previousPending } : {},
            () => rawSetItem(normalizedKey, normalizedValue));
        }
        const result = rawSetItem(normalizedKey, normalizedValue, { explicitReadViewWrite: separated });
        // Applying a verified read is not a new edit or a receipt. Keep any
        // pending generation intact until its own successful write is confirmed.
        if (!win.__footballScienceCentralHydrating && (separated || previousValue !== normalizedValue)) recordWrite(normalizedKey, normalizedValue,
          separated ? { requirePersisted: true, replacement: true } : journaledStorageKeySet.has(normalizedKey) ? { previousValue, previousPending } : {});
        return result;
      } catch (error) {
        handleWriteError(normalizedKey, error);
        throw error;
      }
    };
    storageConstructor.prototype.removeItem = function patchedDataSafetyRemoveItem(key) {
      const normalizedKey = String(key || "");
      if (this !== storage || !isProtectedStorageKey(normalizedKey)) return nativeRemoveItem.call(this, key);
      if (getCentralCachedValueInfo(normalizedKey).source === "central-readonly-baseline") {
        throw new Error("This central view is read-only. The local recovery copy was retained.");
      }
      if (!canWriteCentralBackedCache()) {
        const error = createCentralBackedStorageError();
        handleWriteError(normalizedKey, error);
        throw error;
      }
      const previousValue = rawGetItem(normalizedKey);
      if (previousValue !== null) saveSnapshot("before-remove");
      if (previousValue !== null && !win.__footballScienceCentralHydrating) {
        try {
          return writeProtectedValue(normalizedKey, "", { removed: true }, () => rawRemoveItem(normalizedKey));
        } catch (error) {
          handleWriteError(normalizedKey, error);
          throw error;
        }
      }
      const result = rawRemoveItem(normalizedKey);
      if (previousValue !== null) recordWrite(normalizedKey, "", { removed: true });
      return result;
    };
    storageConstructor.prototype.clear = function patchedDataSafetyClear() {
      if (this === storage && (readManifest().entries["football-medical-team-v1"]?.pendingCentralSync ||
          getCentralCachedValueInfo("football-medical-team-v1").source === "central-readonly-baseline")) {
        throw new Error("This central view is read-only. The local recovery copy was retained.");
      }
      if (this === storage && Object.keys(collectRecoveryCopies()).length) {
        throw new Error("Local recovery copies must be reviewed before clearing storage.");
      }
      const removedKeys = this === storage ? Object.keys(collectStorageData()) : [];
      if (removedKeys.some((key) => getCentralCachedValueInfo(key).source === "central-readonly-baseline")) {
        throw new Error("This central view is read-only. The local recovery copy was retained.");
      }
      if (this === storage && (removedKeys.length || Object.values(readManifest().entries).some((entry) => entry.pendingCentralSync))) {
        throw new Error("Protected data must be removed explicitly. Bulk storage clear cannot preserve pending sync safely.");
      }
      if (this === storage && removedKeys.length && !canWriteCentralBackedCache()) {
        const error = createCentralBackedStorageError();
        handleWriteError(removedKeys[0], error);
        throw error;
      }
      if (this === storage && Object.keys(collectStorageData()).length) saveSnapshot("before-clear");
      const result = nativeClear.call(this);
      if (this === storage) {
        removedKeys.forEach((key) => removeCentralCachedValue(key));
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
    win.addEventListener?.("footballscience:library-save-status", queueStatusRefresh);
    migrateLegacyStorageKeys();
    mutateManifest((manifest) => {
      manifest.lastSeenAt = getNow();
    });
    ui.dataSafetyHealthButton?.addEventListener("click", () => openStorageHealth({
      documentRef, navigatorRef, indexedDB: win.indexedDB, storage: {
        get length() { return getStorage()?.length || 0; },
        key: rawKey,
        getItem: (key) => nativeGetItem.call(getStorage(), key),
      },
      reviewLibrary: () => getCentralStateBridge()?.reviewLibraryRecovery?.(),
      storageLabels, storageKey, getScope: () => getCentralStateBridge()?.getReadScope?.() || "",
    }));
    requestPersistentStorage();
    queueSnapshot("startup");
    refreshStatus();
    win.footballScienceDataSafety = {
      reportSaveIssue: (key, message) => {
        if (!isProtectedStorageKey(key)) return;
        handleWriteError(key, new Error(message));
        refreshStatus();
      },
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
    cacheAcknowledgedValue,
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
