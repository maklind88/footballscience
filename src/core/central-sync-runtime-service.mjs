export function createCentralSyncRuntimeService(deps = {}) {
  const {
    getActiveWorkspaceId = () => "",
    getCurrentUser = () => null,
    getDataSafetyNow = () => new Date().toISOString(),
    getStorageLabel = (key) => String(key || ""),
    handleSyncStatus = () => {},
    handleSyncedStateValue = () => {},
    hashString = (value) => String(value ?? "").length.toString(36),
    isProtectedStorageKey = () => false,
    isSessionPlannerAutosaveKey = () => false,
    mergeDashboardPresentationStatePreservingLocalEdits = (_currentValue, syncedValue) => syncedValue,
    mergePeriodizationStatePreservingLocalUi = (_currentValue, syncedValue) => syncedValue,
    mergeScheduleStatePreservingLocalUi = (_currentValue, syncedValue) => syncedValue,
    mutateManifest = () => ({}),
    queueStatusRefresh = () => {},
    queueSnapshot = () => {},
    rawGetItem = () => null,
    rawSetItem = () => {},
    retryConflictStorageKeys = [],
    dashboardPresentationStorageKey = "",
    getSessionPlannerLocalUiState = () => ({ state: {} }),
    sessionPlannerStorageKey = "",
    scheduleStorageKey = "",
    periodizationStorageKey = "",
    setAutosaveStatusForKey = () => {},
    shouldDeferReload = () => false,
    showSessionPlannerToast = () => {},
    win = globalThis,
  } = deps;

  let centralStateWriteTimer = null;
  let centralStateWriteFlushPromise = null;
  const centralStateWriteQueue = new Map();
  const centralStateActiveWriteKeys = new Set();
  const centralStateWriteSuppressionKeys = new Set();
  let sessionPlannerCentralSyncNoticeAt = 0;
  const centralStateHydrationRetryMs = 250;

  function reportSyncStatus(key, state, message) {
    setAutosaveStatusForKey(key, state, message);
    handleSyncStatus(key, state, message);
  }

  function getCentralStateBridge() { return win.footballScienceCentralState ?? null; }

  function getCentralStateMetadataForKey(key) {
    const metadata = getCentralStateBridge()?.getStatus?.()?.metadata;
    const entry = metadata?.[String(key || "")];
    return entry && typeof entry === "object" ? entry : {};
  }

  function getCentralStateRevisionForKey(key) {
    const revision = Number(getCentralStateMetadataForKey(key).revision);
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
  }

  function isCentralStateBridgeHydrated(bridge = getCentralStateBridge()) {
    return typeof bridge?.isHydrated === "function" ? Boolean(bridge.isHydrated()) : true;
  }

  function getCentralStateWriteBaseRevision(write = {}) {
    const currentRevision = getCentralStateRevisionForKey(write.key);
    if (write.baseRevision !== null && write.baseRevision !== undefined && write.baseRevision !== "") {
      const revision = Number(write.baseRevision);
      if (Number.isInteger(revision) && revision >= 0) {
        return revision;
      }
    }
    return currentRevision;
  }

  function advanceQueuedWriteBaseRevision(key, result = {}) {
    const normalizedKey = String(key || "");
    if (!normalizedKey || normalizedKey !== scheduleStorageKey) {
      return false;
    }
    const queuedWrite = centralStateWriteQueue.get(normalizedKey);
    if (!queuedWrite?.followsActiveWrite) {
      return false;
    }
    const acknowledgedRevision = getCentralSyncResultRevision(result);
    if (!acknowledgedRevision) {
      return false;
    }
    queuedWrite.baseRevision = Math.max(Number(queuedWrite.baseRevision) || 0, acknowledgedRevision);
    queuedWrite.followsActiveWrite = false;
    return true;
  }

  function isCentralStateWriteGenerationCurrent(write = {}) {
    const key = String(write.key || "");
    if (!key || centralStateWriteQueue.has(key)) {
      return false;
    }
    const currentValue = rawGetItem(key);
    return write.removed ? currentValue === null : currentValue === write.value;
  }

  function canWriteCentralBackedCache() {
    if (win.__footballScienceCentralHydrating) {
      return true;
    }
    const bridge = getCentralStateBridge();
    return Boolean(getCurrentUser() && bridge?.syncKey);
  }

  function createCentralBackedStorageError() { return new Error("Central sync is not ready."); }

  function setCentralSyncPendingState(key, isPending = false, isRemoved = false) {
    const normalizedKey = String(key || "");
    mutateManifest((manifest) => {
      const currentEntry = manifest.entries[normalizedKey] || {};
      manifest.entries[normalizedKey] = {
        ...(currentEntry?.label ? currentEntry : { label: getStorageLabel(normalizedKey), writes: 0, size: 0, hash: "", updatedAt: "", deletedAt: "" }),
        ...currentEntry,
        pendingCentralSync: Boolean(isPending),
        deletedAt: isRemoved ? getDataSafetyNow() : "",
      };
    });
    queueStatusRefresh();
  }

  function queueCentralStateStatus(error = "") {
    mutateManifest((manifest) => {
      if (error) {
        manifest.lastCentralError = error;
        return;
      }
      manifest.lastCentralError = "";
      manifest.lastCentralSyncedAt = getDataSafetyNow();
    });
    queueStatusRefresh();
  }

  function hasPendingCentralStateWrites(readManifest) {
    if (centralStateWriteTimer || centralStateWriteQueue.size) {
      return true;
    }
    const manifest = typeof readManifest === "function" ? readManifest() : {};
    return Object.values(manifest.entries || {}).some((entry) => entry?.pendingCentralSync);
  }

  function retryCentral(readManifest) {
    if (centralStateWriteTimer || centralStateWriteQueue.size || win.__footballScienceCentralHydrating || !getCurrentUser() || !getCentralStateBridge()?.syncKey) return;
    const manifest = typeof readManifest === "function" ? readManifest() : {};
    for (const [key, entry] of Object.entries(manifest.entries || {})) {
      if (key === sessionPlannerStorageKey &&
          getCentralStateBridge()?.getCachedValueInfo?.(key)?.source === "central-pending-baseline") continue;
      const value = rawGetItem(key);
      if (
        entry?.pendingCentralSync &&
        (entry.deletedAt || value !== null) &&
        getCentralStateBridge()?.canAutoSyncKey?.(key) !== false
      ) {
        queueCentralStateWrite(key, value ?? "", { removed: !!entry.deletedAt, automatic: true });
      }
    }
  }

  function applyCentralSyncedStateValue(write = {}, syncedValue) {
    const key = String(write.key || "");
    if (!key || write.removed || typeof syncedValue !== "string") {
      return;
    }
    if (centralStateWriteQueue.has(key) || rawGetItem(key) !== write.value || syncedValue === write.value) {
      return;
    }
    const valueToApply =
      key === scheduleStorageKey
        ? mergeScheduleStatePreservingLocalUi(rawGetItem(key), syncedValue)
        : key === periodizationStorageKey
          ? mergePeriodizationStatePreservingLocalUi(rawGetItem(key), syncedValue)
          : key === dashboardPresentationStorageKey
            ? mergeDashboardPresentationStatePreservingLocalEdits(rawGetItem(key), syncedValue)
            : syncedValue;
    win.__footballScienceCentralHydrating = true;
    try {
      rawSetItem(key, valueToApply);
    } finally {
      win.__footballScienceCentralHydrating = false;
    }
    mutateManifest((manifest) => {
      const currentEntry = manifest.entries[key] || {};
      manifest.entries[key] = {
        ...(currentEntry?.label ? currentEntry : { label: getStorageLabel(key), writes: 0 }),
        ...currentEntry,
        updatedAt: getDataSafetyNow(),
        size: valueToApply.length,
        hash: hashString(valueToApply),
        pendingCentralSync: false,
      };
    });
    queueSnapshot("central-merge");
    handleSyncedStateValue(key, valueToApply);
  }

  function persistCentralStateServerRevision(key, result = {}) {
    const revision = getCentralSyncResultRevision(result);
    if (!Number.isInteger(revision) || revision <= 0) {
      return;
    }
    const normalizedKey = String(key || "");
    if (!normalizedKey) {
      return;
    }
    mutateManifest((manifest) => {
      const currentEntry = manifest.entries[normalizedKey] || {};
      const currentRevision = Number(currentEntry.serverRevision);
      const serverRevision =
        Number.isInteger(currentRevision) && currentRevision > revision ? currentRevision : revision;
      manifest.entries[normalizedKey] = {
        ...(currentEntry?.label
          ? currentEntry
          : {
              label: getStorageLabel(normalizedKey),
              writes: 0,
              size: 0,
              hash: "",
              updatedAt: "",
              deletedAt: "",
            }),
        ...currentEntry,
        serverRevision,
      };
    });
  }

  function getCentralSyncResultValue(result = {}) {
    const candidates = [
      result?.value,
      result?.currentValue,
      result?.serverValue,
      result?.data?.value,
      result?.record?.value,
    ];
    return candidates.find((value) => typeof value === "string") ?? "";
  }

  function getCentralSyncResultRevision(result = {}) {
    const revision = Number(result?.currentRevision ?? result?.revision ?? result?.metadata?.revision);
    return Number.isInteger(revision) && revision > 0 ? revision : 0;
  }

  function showSessionPlannerCentralSyncNotice(message = "Session synced with the latest team changes.", tone = "warning") {
    const now = Date.now();
    if (now - sessionPlannerCentralSyncNoticeAt < 12000) {
      return;
    }
    sessionPlannerCentralSyncNoticeAt = now;
    if (getActiveWorkspaceId() === "session-planner") {
      showSessionPlannerToast(message, tone);
    }
  }

  function shouldRetryCentralStateWriteAfterConflict(write = {}) {
    const key = String(write.key || "");
    const retryableKeys = new Set([sessionPlannerStorageKey, ...retryConflictStorageKeys].filter(Boolean));
    return retryableKeys.has(key) && !write.removed && Number(write.retryCount || 0) <= 0;
  }

  async function retryCentralStateWriteAfterConflict(write = {}, result = {}, bridge = getCentralStateBridge()) {
    if (!shouldRetryCentralStateWriteAfterConflict(write)) {
      return null;
    }
    const retryBaseRevision = getCentralSyncResultRevision(result);
    if (!retryBaseRevision || !bridge?.syncKey) {
      return null;
    }
    centralStateActiveWriteKeys.add(write.key);
    let retryResult;
    try {
      retryResult = await bridge.syncKey(write.key, write.value, {
        removed: false,
        baseRevision: retryBaseRevision,
      });
    } finally {
      centralStateActiveWriteKeys.delete(write.key);
    }
    if (!retryResult?.ok) {
      return retryResult || null;
    }
    applyCentralSyncedStateValue(write, retryResult.value);
    if (String(write.key || "") === sessionPlannerStorageKey && retryResult?.merged) {
      showSessionPlannerCentralSyncNotice("Session synced with the latest team changes.");
    }
    return retryResult;
  }

  function registerSessionPlannerCentralSyncConflict(write = {}, result = {}) {
    if (String(write.key || "") !== sessionPlannerStorageKey) {
      return;
    }
    getSessionPlannerLocalUiState().state.sessionPlannerCentralSyncConflict = null;
    showSessionPlannerCentralSyncNotice(
      result?.reason ? `Session sync needs attention: ${result.reason}` : "Session sync needs attention. Your latest edit stayed local.",
      "warning"
    );
  }

  function queueCentralStateWrite(key, value, options = {}) {
    if (win.__footballScienceCentralHydrating) {
      return;
    }
    const normalizedKey = String(key || "");
    if (!isProtectedStorageKey(normalizedKey)) {
      return;
    }
    const bridge = getCentralStateBridge();
    if (typeof bridge?.isCentralKey === "function" && !bridge.isCentralKey(normalizedKey)) {
      return;
    }
    if (!getCurrentUser() || !bridge?.syncKey) {
      queueCentralStateStatus("Central sync unavailable.");
      reportSyncStatus(normalizedKey, "issue", "Central sync unavailable.");
      return;
    }
    reportSyncStatus(normalizedKey, "saving", "Saving");
    setCentralSyncPendingState(normalizedKey, true, Boolean(options.removed));
    centralStateWriteQueue.set(normalizedKey, {
      key: normalizedKey,
      value: String(value ?? ""),
      removed: Boolean(options.removed),
      automatic: Boolean(options.automatic),
      baseRevision: isCentralStateBridgeHydrated(bridge) ? getCentralStateRevisionForKey(normalizedKey) : null,
      followsActiveWrite: centralStateActiveWriteKeys.has(normalizedKey),
    });
    if (centralStateWriteTimer) {
      win.clearTimeout(centralStateWriteTimer);
    }
    centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, 120);
  }

  async function runCentralStateWriteFlush() {
    const bridge = getCentralStateBridge();
    if (!bridge?.syncKey || !centralStateWriteQueue.size) {
      return true;
    }
    if (!isCentralStateBridgeHydrated(bridge)) {
      queueCentralStateStatus("Central sync is loading.");
      if (!centralStateWriteTimer) {
        centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, centralStateHydrationRetryMs);
      }
      return false;
    }
    const writes = Array.from(centralStateWriteQueue.values());
    const touchedSessionPlannerAutosave = writes.some((write) => isSessionPlannerAutosaveKey(write.key));
    centralStateWriteQueue.clear();
    for (let index = 0; index < writes.length; index += 1) {
      const write = writes[index];
      if (write.automatic && bridge.canAutoSyncKey?.(write.key) === false) {
        continue;
      }
      centralStateActiveWriteKeys.add(write.key);
      let result;
      try {
        result = await bridge.syncKey(write.key, write.value, {
          removed: write.removed,
          baseRevision: getCentralStateWriteBaseRevision(write),
        });
      } finally {
        centralStateActiveWriteKeys.delete(write.key);
      }
      if (!result?.ok) {
        if (result?.conflict || result?.status === 409) {
          const retryResult = await retryCentralStateWriteAfterConflict(write, result, bridge);
          if (retryResult?.ok) {
            advanceQueuedWriteBaseRevision(write.key, retryResult);
            persistCentralStateServerRevision(write.key, retryResult);
            if (isCentralStateWriteGenerationCurrent(write)) {
              setCentralSyncPendingState(write.key, false, write.removed);
              queueCentralStateStatus("");
              reportSyncStatus(write.key, "saved", "Saved");
            }
            continue;
          }
          if (write.key === scheduleStorageKey) {
            // Schedule is a shared revision-guarded blob. A forced hydration
            // here would replace the unsynced local edit, while retrying the
            // whole blob at a newer revision could overwrite a colleague.
          } else if (write.key !== sessionPlannerStorageKey) {
            const hydrated = await bridge.hydrate?.({ forceApply: true }).catch(() => false);
            if (hydrated) {
              persistCentralStateServerRevision(write.key, {
                revision: getCentralStateRevisionForKey(write.key),
              });
              if (isCentralStateWriteGenerationCurrent(write)) {
                setCentralSyncPendingState(write.key, false, write.removed);
                queueCentralStateStatus("");
                reportSyncStatus(write.key, "saved", "Saved");
                continue;
              }
            }
          } else {
            setCentralSyncPendingState(write.key, false, write.removed);
          }
          queueCentralStateStatus(result?.reason || "Central newer.");
          registerSessionPlannerCentralSyncConflict(write, result);
          reportSyncStatus(write.key, "issue", "Sync needs attention");
          continue;
        }
        if (result?.status === 403) {
          // A 403 means the server permanently refused this specific key for
          // the current actor (e.g. a role without edit access to that
          // workspace). That will never succeed on retry, so drop it instead
          // of requeueing forever and blocking every other pending write
          // behind it, and keep this key's own denial local instead of
          // pinning the global sync status.
          if (isCentralStateWriteGenerationCurrent(write)) {
            setCentralSyncPendingState(write.key, false, write.removed);
          }
          reportSyncStatus(write.key, "issue", result?.reason || "Not authorized for this data.");
          continue;
        }
        for (let retryIndex = index; retryIndex < writes.length; retryIndex += 1) {
          const retryWrite = writes[retryIndex];
          if (!centralStateWriteQueue.has(retryWrite.key)) {
            centralStateWriteQueue.set(retryWrite.key, retryWrite);
          }
        }
        queueCentralStateStatus(result?.reason || "Sync failed.");
        reportSyncStatus(write.key, "issue", result?.reason || "Sync failed.");
        return false;
      }
      advanceQueuedWriteBaseRevision(write.key, result);
      persistCentralStateServerRevision(write.key, result);
      applyCentralSyncedStateValue(write, result.value);
      if (result?.merged && write.key === sessionPlannerStorageKey && getActiveWorkspaceId() === "session-planner") {
        showSessionPlannerToast("Central sync merged.", "warning");
      }
      if (isCentralStateWriteGenerationCurrent(write)) {
        setCentralSyncPendingState(write.key, false, write.removed);
        if (!isSessionPlannerAutosaveKey(write.key)) {
          reportSyncStatus(write.key, "saved", "Saved");
        }
      }
    }
    queueCentralStateStatus("");
    if (touchedSessionPlannerAutosave) {
      reportSyncStatus(sessionPlannerStorageKey, "saved", "Saved");
    }
    return true;
  }

  function flushCentralStateWrites() {
    centralStateWriteTimer = null;
    if (centralStateWriteFlushPromise) {
      return centralStateWriteFlushPromise;
    }
    centralStateWriteFlushPromise = runCentralStateWriteFlush().then(
      (canContinue) => {
        centralStateWriteFlushPromise = null;
        if (canContinue && centralStateWriteQueue.size && !centralStateWriteTimer) {
          centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, 120);
        }
        return canContinue;
      },
      (error) => {
        centralStateWriteFlushPromise = null;
        throw error;
      }
    );
    return centralStateWriteFlushPromise;
  }

  function clearCentralStateWriteTimer() {
    if (!centralStateWriteTimer) {
      return false;
    }
    win.clearTimeout(centralStateWriteTimer);
    centralStateWriteTimer = null;
    return true;
  }

  return {
    applyCentralSyncedStateValue,
    canWriteCentralBackedCache,
    centralStateWriteSuppressionKeys,
    clearCentralStateWriteTimer,
    createCentralBackedStorageError,
    flushCentralStateWrites,
    getCentralStateBridge,
    getCentralStateMetadataForKey,
    getCentralStateRevisionForKey,
    getCentralStateWriteBaseRevision,
    getCentralSyncResultRevision,
    getCentralSyncResultValue,
    hasPendingCentralStateWrites,
    queueCentralStateStatus,
    queueCentralStateWrite,
    registerSessionPlannerCentralSyncConflict,
    retryCentral,
    retryCentralStateWriteAfterConflict,
  };
}
