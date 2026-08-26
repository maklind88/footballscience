export function createSessionPlannerRuntimeStateService(deps = {}) {
  const {
    canWriteCentralBackedCache = () => false,
    captureBoardHistoryFromState = () => {},
    clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    cloneState = (state) => state,
    createDefaultState = () => ({}),
    dataSafetySnapshotStoreName = "snapshots",
    findWorkspaceFieldElements = () => [],
    formatMultiValue = (value) => value,
    getActiveWorkspaceId = () => "",
    getSelectedBlock = () => null,
    getSessionPlannerState = () => null,
    logEvent = () => {},
    markBlockFieldsUpdated = () => {},
    mergeStateForWrite = (_existingState, nextState) => nextState,
    mergeStateFromBackup = (currentState) => ({ state: currentState, recoveredSessions: 0 }),
    openDataSafetyDatabase = async () => null,
    rawDataSafetyGetItem = () => null,
    rawDataSafetySetItem = () => {},
    recordDataSafetyWrite = () => {},
    renderWorkspace = () => {},
    sessionPlannerAutosaveBoundary = {
      markSessionPlannerWrite: () => {},
      setStatusForKey: () => false,
    },
    sessionPlannerMultiSelectFields = new Set(),
    sessionPlannerStorageKey = "football-session-planner-v3",
    setSessionPlannerState = () => {},
    showToast = () => {},
    win = globalThis,
  } = deps;

  const quotaFallbackSnapshotId = `${sessionPlannerStorageKey}-quota-fallback`;
  let snapshotRecoveryQueued = false;
  let pendingQuotaFallback = null;
  let quotaFallbackDrainPromise = null;
  let quotaFallbackLastResult = true;

  function isStorageQuotaError(error) {
    return (
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      Number(error?.code) === 22 ||
      Number(error?.code) === 1014 ||
      /quota/i.test(String(error?.message || ""))
    );
  }

  function setSaveStatus(state, message) {
    sessionPlannerAutosaveBoundary.setStatusForKey?.(
      sessionPlannerStorageKey,
      state,
      message
    );
  }

  function cacheQuotaFallbackValue(value) {
    return Boolean(win.footballScienceCentralState?.setCachedValue?.(
      sessionPlannerStorageKey,
      value,
      { source: "local-write", durable: false, serverBacked: false }
    ));
  }

  async function persistQuotaFallbackSnapshot(value) {
    const database = await openDataSafetyDatabase();
    if (!database) throw new Error("Local backup storage is not available.");
    const snapshot = {
      id: quotaFallbackSnapshotId,
      schema: "football-science-backup-v1",
      app: "Football Science",
      createdAt: new Date().toISOString(),
      reason: "session-planner-quota-fallback",
      storage: { [sessionPlannerStorageKey]: value },
    };
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(dataSafetySnapshotStoreName, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Local backup failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Local backup was cancelled."));
      transaction.objectStore(dataSafetySnapshotStoreName).put(snapshot);
    });
    return snapshot;
  }

  async function drainQuotaFallbackWrites() {
    let succeeded = true;
    while (pendingQuotaFallback) {
      const currentFallback = pendingQuotaFallback;
      pendingQuotaFallback = null;
      try {
        await persistQuotaFallbackSnapshot(currentFallback.value);
        if (!canWriteCentralBackedCache()) {
          succeeded = false;
          setSaveStatus("issue", "Saved locally; sync pending");
          continue;
        }
        recordDataSafetyWrite(sessionPlannerStorageKey, currentFallback.value);
      } catch (error) {
        succeeded = false;
        setSaveStatus("issue", "Save failed");
        logEvent(`Session planner fallback save failed: ${error?.message || "Unknown error"}`);
      }
    }
    quotaFallbackLastResult = succeeded;
    return succeeded;
  }

  function ensureQuotaFallbackDrain() {
    if (quotaFallbackDrainPromise) return quotaFallbackDrainPromise;
    quotaFallbackDrainPromise = drainQuotaFallbackWrites().finally(() => {
      quotaFallbackDrainPromise = null;
      if (pendingQuotaFallback) ensureQuotaFallbackDrain();
    });
    return quotaFallbackDrainPromise;
  }

  function queueQuotaFallback(value) {
    pendingQuotaFallback = { value };
    cacheQuotaFallbackValue(value);
    setSaveStatus("saving", "Saving");
    ensureQuotaFallbackDrain();
    return true;
  }

  async function flushQuotaFallback() {
    while (quotaFallbackDrainPromise || pendingQuotaFallback) {
      await (quotaFallbackDrainPromise || ensureQuotaFallbackDrain());
    }
    return quotaFallbackLastResult;
  }


  function areBlockFieldValuesEqual(previousValue, nextValue) {
    if (Object.is(previousValue, nextValue)) {
      return true;
    }
    if (
      !previousValue ||
      !nextValue ||
      typeof previousValue !== "object" ||
      typeof nextValue !== "object"
    ) {
      return false;
    }
    try {
      return JSON.stringify(previousValue) === JSON.stringify(nextValue);
    } catch {
      return false;
    }
  }

  function assignBlockFieldValue(block, field, rawValue) {
    if (!block || !(field in block)) return false;
    if (field === "minutes") {
      block[field] = Math.max(0, Number(rawValue) || 0);
    } else if (field === "intensity") {
      block[field] = clamp(Number(rawValue) || 1, 1, 5);
    } else if (sessionPlannerMultiSelectFields.has(field)) {
      block[field] = formatMultiValue(rawValue);
    } else {
      block[field] = rawValue;
    }
    return true;
  }

  function syncSelectedBlockFieldsFromDom() {
    const block = getSelectedBlock();
    if (!block) return;
    let hasChanged = false;
    const changedFields = [];
    findWorkspaceFieldElements().forEach((field) => {
      const fieldKey = field.dataset.sessionField;
      if (!fieldKey || !(fieldKey in block)) return;
      const previousValue = block[fieldKey];
      if (
        assignBlockFieldValue(block, fieldKey, field.value) &&
        !areBlockFieldValuesEqual(previousValue, block[fieldKey])
      ) {
        hasChanged = true;
        changedFields.push(fieldKey);
      }
    });
    if (hasChanged) {
      markBlockFieldsUpdated(block, changedFields);
      writeState();
    }
  }

  function readState() {
    try {
      const raw = win.localStorage.getItem(sessionPlannerStorageKey);
      if (!raw) return createDefaultState();
      const state = cloneState(JSON.parse(raw));
      if (JSON.stringify(state) !== raw) {
        persistNormalizedState(state);
      }
      return state;
    } catch {
      return createDefaultState();
    }
  }

  function persistNormalizedState(nextState) {
    const nextValue = JSON.stringify(nextState);
    try {
      rawDataSafetySetItem(sessionPlannerStorageKey, nextValue);
      if (win.__footballScienceCentralHydrating) {
        win.setTimeout(() => {
          if (rawDataSafetyGetItem(sessionPlannerStorageKey) === nextValue && canWriteCentralBackedCache()) {
            recordDataSafetyWrite(sessionPlannerStorageKey, nextValue);
          }
        }, 0);
        return;
      }
      if (canWriteCentralBackedCache()) {
        recordDataSafetyWrite(sessionPlannerStorageKey, nextValue);
      }
    } catch {
    }
  }

  async function findStateInSnapshots(currentState) {
    try {
      const database = await openDataSafetyDatabase();
      const snapshots = await new Promise((resolve, reject) => {
        const transaction = database.transaction(dataSafetySnapshotStoreName, "readonly");
        const request = transaction.objectStore(dataSafetySnapshotStoreName).getAll();
        request.onsuccess = () => resolve(Array.from(request.result || []));
        request.onerror = () => reject(request.error);
      });
      const orderedSnapshots = snapshots.sort((a, b) =>
        String(b?.createdAt || b?.id || "").localeCompare(String(a?.createdAt || a?.id || ""))
      );
      let recoveredState = cloneState(currentState);
      let recoveredSessions = 0;
      orderedSnapshots.forEach((snapshot) => {
        const storage = snapshot?.storage && typeof snapshot.storage === "object" ? snapshot.storage : {};
        const rawState = storage[sessionPlannerStorageKey];
        if (typeof rawState !== "string") return;
        try {
          const backupState = cloneState(JSON.parse(rawState));
          if (snapshot?.reason === "session-planner-quota-fallback") {
            const previousValue = JSON.stringify(recoveredState);
            recoveredState = mergeQuotaFallbackState(recoveredState, backupState);
            if (JSON.stringify(recoveredState) !== previousValue) recoveredSessions += 1;
            return;
          }
          const mergeResult = mergeStateFromBackup(recoveredState, backupState);
          recoveredState = mergeResult.state;
          recoveredSessions += mergeResult.recoveredSessions;
        } catch {
        }
      });
      return recoveredSessions ? recoveredState : null;
    } catch {
      return null;
    }
  }

  function queueSnapshotRecovery() {
    if (snapshotRecoveryQueued) return;
    snapshotRecoveryQueued = true;
    const currentState = getSessionPlannerState() || readState();
    findStateInSnapshots(currentState).then((recoveredState) => {
      snapshotRecoveryQueued = false;
      if (!recoveredState) return;
      setSessionPlannerState(recoveredState);
      if (!writeState()) return;
      if (getActiveWorkspaceId() === "session-planner") {
        renderWorkspace({ preserveDateStripScroll: true });
        showToast("Session planner restored from local backup.");
      }
    });
  }

  function mergeQuotaFallbackState(currentState, fallbackState) {
    const currentSelectedDate = currentState?.selectedDate || "";
    const currentSelectedBlockIds = Object.fromEntries(
      Object.entries(currentState?.sessions || {}).map(([dateValue, session]) => [
        dateValue,
        session?.selectedBlockId || "",
      ])
    );
    const mergedState = mergeStateForWrite(currentState, fallbackState);
    mergedState.selectedDate = currentSelectedDate || mergedState.selectedDate;
    Object.entries(currentSelectedBlockIds).forEach(([dateValue, selectedBlockId]) => {
      const mergedSession = mergedState.sessions?.[dateValue];
      if (selectedBlockId && mergedSession?.blocks?.some((block) => block.id === selectedBlockId)) {
        mergedSession.selectedBlockId = selectedBlockId;
      }
    });
    return mergedState;
  }

  function writeState() {
    const state = getSessionPlannerState();
    if (!state) return false;
    let nextValue = "";
    try {
      let existingState = null;
      let rawExistingState = null;
      try {
        rawExistingState = win.localStorage.getItem(sessionPlannerStorageKey);
        existingState = rawExistingState ? cloneState(JSON.parse(rawExistingState)) : null;
      } catch {
        existingState = null;
        rawExistingState = null;
      }
      const nextState = existingState ? mergeStateForWrite(existingState, state) : cloneState(state);
      nextValue = JSON.stringify(nextState);
      if (rawExistingState === nextValue) {
        setSessionPlannerState(nextState);
        return true;
      }
      captureBoardHistoryFromState();
      setSessionPlannerState(nextState);
      sessionPlannerAutosaveBoundary.markSessionPlannerWrite();
      win.localStorage.setItem(sessionPlannerStorageKey, nextValue);
      return true;
    } catch (error) {
      if (isStorageQuotaError(error)) {
        logEvent("Session planner write moved to durable fallback storage.");
        return queueQuotaFallback(nextValue);
      }
      setSaveStatus("issue", "Save failed");
      logEvent("Session planner could not be written to local storage.");
      return false;
    }
  }

  return {
    areBlockFieldValuesEqual,
    assignBlockFieldValue,
    findStateInSnapshots,
    flushQuotaFallback,
    persistNormalizedState,
    queueSnapshotRecovery,
    readState,
    syncSelectedBlockFieldsFromDom,
    writeState,
  };
}
