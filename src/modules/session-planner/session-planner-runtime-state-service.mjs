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
    sessionPlannerAutosaveBoundary = { markSessionPlannerWrite: () => {} },
    sessionPlannerMultiSelectFields = new Set(),
    sessionPlannerStorageKey = "football-session-planner-v3",
    setSessionPlannerState = () => {},
    showToast = () => {},
    win = globalThis,
  } = deps;

  let snapshotRecoveryQueued = false;

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

  function writeState() {
    const state = getSessionPlannerState();
    if (!state) return false;
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
      const nextValue = JSON.stringify(nextState);
      if (rawExistingState === nextValue) {
        setSessionPlannerState(nextState);
        return true;
      }
      captureBoardHistoryFromState();
      setSessionPlannerState(nextState);
      sessionPlannerAutosaveBoundary.markSessionPlannerWrite();
      win.localStorage.setItem(sessionPlannerStorageKey, nextValue);
      return true;
    } catch {
      logEvent("Session planner could not be written to local storage.");
      return false;
    }
  }

  return {
    areBlockFieldValuesEqual,
    assignBlockFieldValue,
    findStateInSnapshots,
    persistNormalizedState,
    queueSnapshotRecovery,
    readState,
    syncSelectedBlockFieldsFromDom,
    writeState,
  };
}
