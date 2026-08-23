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
  let centralStateWriteFlushInFlight = false;
  const centralStateWriteQueue = new Map();
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

  function canWriteCentralStateKey(key, bridge = getCentralStateBridge()) {
    return typeof bridge?.canWriteKey === "function" && bridge.canWriteKey(String(key || "")) === true;
  }

  function getCentralStateWriteBaseRevision(write = {}) {
    if (write.baseRevision !== null && write.baseRevision !== undefined && write.baseRevision !== "") {
      const revision = Number(write.baseRevision);
      if (Number.isInteger(revision) && revision >= 0) {
        return revision;
      }
    }
    return getCentralStateRevisionForKey(write.key);
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
        deletedAt: isRemoved ? getDataSafetyNow() : currentEntry.deletedAt || "",
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
    if (centralStateWriteTimer || centralStateWriteFlushInFlight || centralStateWriteQueue.size) {
      return true;
    }
    const manifest = typeof readManifest === "function" ? readManifest() : {};
    return Object.values(manifest.entries || {}).some((entry) => entry?.pendingCentralSync);
  }

  function retryCentral(readManifest) {
    const bridge = getCentralStateBridge();
    if (centralStateWriteTimer || centralStateWriteFlushInFlight || centralStateWriteQueue.size || win.__footballScienceCentralHydrating || !getCurrentUser() || !bridge?.syncKey) return;
    const manifest = typeof readManifest === "function" ? readManifest() : {};
    for (const [key, entry] of Object.entries(manifest.entries || {})) {
      const value = rawGetItem(key);
      if (entry?.pendingCentralSync && canWriteCentralStateKey(key, bridge) && (entry.deletedAt || value !== null)) {
        queueCentralStateWrite(key, value ?? "", {
          removed: !!entry.deletedAt,
          automaticRetry: true,
        });
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
    const retryResult = await bridge.syncKey(write.key, write.value, {
      removed: false,
      baseRevision: retryBaseRevision,
    });
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
    setCentralSyncPendingState(normalizedKey, true, Boolean(options.removed));
    const automaticRetry = Boolean(options.automaticRetry);
    if (automaticRetry && !canWriteCentralStateKey(normalizedKey, bridge)) {
      return;
    }
    reportSyncStatus(normalizedKey, "saving", "Saving");
    centralStateWriteQueue.set(normalizedKey, {
      key: normalizedKey,
      value: String(value ?? ""),
      removed: Boolean(options.removed),
      automaticRetry,
      baseRevision: isCentralStateBridgeHydrated(bridge) ? getCentralStateRevisionForKey(normalizedKey) : null,
    });
    if (centralStateWriteTimer) {
      win.clearTimeout(centralStateWriteTimer);
    }
    centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, 120);
  }

  async function flushCentralStateWrites() {
    centralStateWriteTimer = null;
    const bridge = getCentralStateBridge();
    if (centralStateWriteFlushInFlight || !bridge?.syncKey || !centralStateWriteQueue.size) {
      return;
    }
    if (!isCentralStateBridgeHydrated(bridge)) {
      queueCentralStateStatus("Central sync is loading.");
      if (!centralStateWriteTimer) {
        centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, centralStateHydrationRetryMs);
      }
      return;
    }
    const writes = Array.from(centralStateWriteQueue.values());
    const touchedSessionPlannerAutosave = writes.some(
      (write) =>
        (!write.automaticRetry || canWriteCentralStateKey(write.key, bridge)) &&
        isSessionPlannerAutosaveKey(write.key)
    );
    let hadExplicitPermissionDenial = false;
    centralStateWriteQueue.clear();
    centralStateWriteFlushInFlight = true;
    try {
      for (let index = 0; index < writes.length; index += 1) {
        const write = writes[index];
        if (write.automaticRetry && !canWriteCentralStateKey(write.key, bridge)) {
          continue;
        }
        const result = await bridge.syncKey(write.key, write.value, {
          removed: write.removed,
          baseRevision: getCentralStateWriteBaseRevision(write),
        });
        if (!result?.ok) {
          if (result?.status === 403) {
            if (!write.automaticRetry) {
              hadExplicitPermissionDenial = true;
              const reason = result?.reason || "You do not have permission to save this data.";
              queueCentralStateStatus(reason);
              reportSyncStatus(write.key, "issue", reason);
            }
            continue;
          }
          if (result?.conflict || result?.status === 409) {
            const retryResult = await retryCentralStateWriteAfterConflict(write, result, bridge);
            if (retryResult?.ok) {
              setCentralSyncPendingState(write.key, false, write.removed);
              persistCentralStateServerRevision(write.key, retryResult);
              queueCentralStateStatus("");
              reportSyncStatus(write.key, "saved", "Saved");
              continue;
            }
            if (write.key !== sessionPlannerStorageKey) {
              const hydrated = await bridge.hydrate?.({ forceApply: true }).catch(() => false);
              if (hydrated) {
                setCentralSyncPendingState(write.key, false, write.removed);
                persistCentralStateServerRevision(write.key, {
                  revision: getCentralStateRevisionForKey(write.key),
                });
                if (rawGetItem(write.key) === write.value) {
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
          for (let retryIndex = index; retryIndex < writes.length; retryIndex += 1) {
            const retryWrite = writes[retryIndex];
            centralStateWriteQueue.set(retryWrite.key, retryWrite);
          }
          queueCentralStateStatus(result?.reason || "Sync failed.");
          reportSyncStatus(write.key, "issue", result?.reason || "Sync failed.");
          return;
        }
        persistCentralStateServerRevision(write.key, result);
        applyCentralSyncedStateValue(write, result.value);
        if (result?.merged && write.key === sessionPlannerStorageKey && getActiveWorkspaceId() === "session-planner") {
          showSessionPlannerToast("Central sync merged.", "warning");
        }
        setCentralSyncPendingState(write.key, false, write.removed);
        if (!isSessionPlannerAutosaveKey(write.key)) {
          reportSyncStatus(write.key, "saved", "Saved");
        }
      }
      if (!hadExplicitPermissionDenial) {
        queueCentralStateStatus("");
      }
      if (touchedSessionPlannerAutosave && !hadExplicitPermissionDenial) {
        reportSyncStatus(sessionPlannerStorageKey, "saved", "Saved");
      }
    } finally {
      centralStateWriteFlushInFlight = false;
    }
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
