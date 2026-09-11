import { createSessionPlannerRecoveryController, getSessionPlannerQuotaSnapshotId } from "./session-planner-recovery-controller.mjs";
import { createSessionLocalReviewService } from "./session-local-review-service.mjs";
import { sessionStateForStorage } from "./session-tactical-storage.mjs";

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
    getRecoveryContext = () => null,
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
    shouldDeferRecovery = () => false,
    showToast = () => {},
    win = globalThis,
  } = deps;

  let pendingQuotaFallback = null;
  let quotaFallbackDrainPromise = null;
  let quotaFallbackLastResult = true;
  const recovery = createSessionPlannerRecoveryController({
    cloneState,
    getContext: getRecoveryContext,
    getState: getSessionPlannerState,
    getStorageValue: () => rawDataSafetyGetItem(sessionPlannerStorageKey),
    hasPendingWrite: () => Boolean(pendingQuotaFallback || quotaFallbackDrainPromise),
    mergeState: (current, fallback) => mergeQuotaFallbackState(current, fallback, true),
    openDatabase: openDataSafetyDatabase,
    reportIssue: (message) => setSaveStatus("issue", message),
    restoreState: (state) => {
      const previousState = getSessionPlannerState();
      setSessionPlannerState(state);
      if (!writeState()) {
        setSessionPlannerState(previousState);
        return false;
      }
      if (getActiveWorkspaceId() === "session-planner") {
        renderWorkspace({ preserveDateStripScroll: true });
        showToast("Local session changes recovered; syncing.");
      }
      return true;
    },
    shouldDefer: shouldDeferRecovery,
    snapshotStoreName: dataSafetySnapshotStoreName,
    storageKey: sessionPlannerStorageKey,
  });

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

  async function persistQuotaFallbackSnapshot(fallback) {
    const { value, context, previousValue } = fallback;
    const bridge = win.footballScienceCentralState;
    if (bridge?.stageSessionWrite && !bridge.getStatus?.().localDev) {
      if (!context?.scope || getRecoveryContext()?.scope !== context.scope) throw new Error("Account or team changed. Local changes were retained.");
      const result = await bridge.stageSessionWrite(value, { previousValue, previousPending: fallback.previousPending });
      if (!result.ok) throw new Error(result.reason || "Local save storage failed.");
      fallback.journaled = true;
      return;
    }
    const database = await openDataSafetyDatabase();
    if (!database) throw new Error("Local backup storage is not available.");
    const snapshot = {
      id: getSessionPlannerQuotaSnapshotId(sessionPlannerStorageKey, context),
      schema: "football-science-backup-v1",
      app: "Football Science",
      createdAt: new Date().toISOString(),
      reason: "session-planner-quota-fallback",
      recovery: context ? { scope: context.scope, baseRevision: context.revision } : null,
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
        await persistQuotaFallbackSnapshot(currentFallback);
        if (pendingQuotaFallback && pendingQuotaFallback.context?.scope === currentFallback.context?.scope) continue;
        if (!canWriteCentralBackedCache() || !currentFallback.context?.scope ||
            getRecoveryContext()?.scope !== currentFallback.context.scope) {
          succeeded = false;
          setSaveStatus("issue", "Saved locally; sync pending");
          continue;
        }
        recordDataSafetyWrite(sessionPlannerStorageKey, currentFallback.value, {
          previousValue: currentFallback.previousValue, sessionReplay: Boolean(currentFallback.journaled),
        });
        setSaveStatus("saving", "Saved locally; syncing");
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

  function queueQuotaFallback(value, previousValue) {
    const context = getRecoveryContext();
    let previousPending = false;
    try { previousPending = Boolean(JSON.parse(rawDataSafetyGetItem("football-data-safety-v1") || "{}").entries?.[sessionPlannerStorageKey]?.pendingCentralSync); } catch {}
    // Coalesced drafts must keep the baseline of the earliest unstaged edit.
    if (pendingQuotaFallback && pendingQuotaFallback.context?.scope === context?.scope) {
      previousValue = pendingQuotaFallback.previousValue;
      previousPending = previousPending || pendingQuotaFallback.previousPending;
    }
    pendingQuotaFallback = { value, previousValue, previousPending, context: context ? { ...context } : null };
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

  function readCentralCacheFallbackState() {
    try {
      const cachedValue = win.footballScienceCentralState?.getCachedValue?.(sessionPlannerStorageKey);
      if (typeof cachedValue !== "string" || !cachedValue) return null;
      return cloneState(JSON.parse(cachedValue));
    } catch {
      return null;
    }
  }

  function readState() {
    try {
      const raw = win.localStorage.getItem(sessionPlannerStorageKey);
      if (!raw) {
        // Local storage can be evicted for this key when the browser's
        // storage quota is exhausted (see cacheCentralStateValue's
        // quota-error path), even though the server copy is intact and was
        // already loaded into the in-memory central cache during
        // hydration. Prefer that cache over silently rendering an empty
        // planner, which otherwise looks like saved exercises disappeared.
        const fallbackState = readCentralCacheFallbackState();
        if (fallbackState) return fallbackState;
        return createDefaultState();
      }
      const storedState = JSON.parse(raw);
      const state = cloneState(storedState);
      if (JSON.stringify(sessionStateForStorage(state, storedState)) !== raw) {
        persistNormalizedState(state, storedState);
      }
      return state;
    } catch {
      return readCentralCacheFallbackState() || createDefaultState();
    }
  }

  function persistNormalizedState(nextState, previousState = null) {
    const nextValue = JSON.stringify(sessionStateForStorage(nextState, previousState));
    try {
      rawDataSafetySetItem(sessionPlannerStorageKey, nextValue);
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
    return recovery.queue();
  }

  async function openLocalSaveReview() {
    const context = getRecoveryContext();
    const bridge = win.footballScienceCentralState;
    if (!context?.ready || !bridge?.getSessionCentralValue) return;
    const expectedLocalValue = win.localStorage.getItem(sessionPlannerStorageKey);
    const { openSessionSaveReview } = await import("./session-save-review.mjs");
    const legacy = createSessionLocalReviewService({
      openDatabase: openDataSafetyDatabase, getContext: getRecoveryContext,
      getCentralValue: () => bridge.getSessionCentralValue(),
      save: (value) => bridge.syncKey(sessionPlannerStorageKey, value), storageKey: sessionPlannerStorageKey,
    });
    return openSessionSaveReview({ document: win.document, bridge, legacy,
      canReview: () => getRecoveryContext()?.scope === context.scope && getRecoveryContext()?.ready,
      onResolved: async () => {
        await bridge.hydrate({ fresh: true });
        if (!(await legacy.list()).length && !(await bridge.getSessionSaveReviews()).length && !(await bridge.getSessionPendingState())) {
          if (await bridge.finishSessionLocalReview?.(expectedLocalValue)) setSaveStatus("saved", "Local review complete");
        }
      },
    });
  }

  function mergeQuotaFallbackState(currentState, fallbackState, preferCurrent = false) {
    const currentSelectedDate = currentState?.selectedDate || "";
    const currentSelectedBlockIds = Object.fromEntries(
      Object.entries(currentState?.sessions || {}).map(([dateValue, session]) => [
        dateValue,
        session?.selectedBlockId || "",
      ])
    );
    const mergedState = preferCurrent
      ? mergeStateForWrite(fallbackState, currentState)
      : mergeStateForWrite(currentState, fallbackState);
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
    let previousValue = null;
    try {
      let existingState = null;
      let storedState = null;
      let rawExistingState = null;
      try {
        rawExistingState = win.localStorage.getItem(sessionPlannerStorageKey);
        previousValue = rawExistingState;
        storedState = rawExistingState ? JSON.parse(rawExistingState) : null;
        existingState = storedState ? cloneState(storedState) : null;
      } catch {
        existingState = null;
        rawExistingState = null;
      }
      const nextState = existingState ? mergeStateForWrite(existingState, state) : cloneState(state);
      nextValue = JSON.stringify(sessionStateForStorage(nextState, storedState));
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
        return queueQuotaFallback(nextValue, previousValue);
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
    openLocalSaveReview,
    readState,
    syncSelectedBlockFieldsFromDom,
    writeState,
  };
}
