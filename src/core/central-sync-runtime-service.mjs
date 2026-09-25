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
    readManifest = () => ({}),
    queueStatusRefresh = () => {},
    queueSnapshot = () => {},
    rawGetItem = () => null,
    rawSetItem = () => {},
    cacheAcknowledgedValue = rawSetItem,
    retryConflictStorageKeys = [],
    dashboardPresentationStorageKey = "",
    getSessionPlannerLocalUiState = () => ({ state: {} }),
    sessionPlannerStorageKey = "",
    setPiecesRoomStorageKey = "",
    scheduleStorageKey = "",
    periodizationStorageKey = "",
    setAutosaveStatusForKey = () => {},
    shouldDeferReload = () => false,
    showSessionPlannerToast = () => {},
    win = globalThis,
  } = deps;

  let centralStateWriteTimer = null;
  let centralStateWriteFlushPromise = null;
  let pendingManifestRetry = null;
  const conflictedWrites = new Map();
  const centralStateWriteQueue = new Map();
  const centralStateActiveWrites = new Map();
  const centralStateWriteSuppressionKeys = new Set();
  let sessionPlannerCentralSyncNoticeAt = 0;
  const centralStateHydrationRetryMs = 250;
  const successorPersistenceIssue = "Local save metadata could not be verified. Retry when browser storage is available.";
  function isConflictedWrite(write) {
    const previous = conflictedWrites.get(write.key);
    return previous && previous.value === write.value && previous.removed === write.removed &&
      previous.principalScope === write.principalScope && previous.baseRevision === write.baseRevision;
  }

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

  function advanceQueuedWriteBaseRevision(key, result = {}, queuedWrite = centralStateWriteQueue.get(String(key || ""))) {
    const normalizedKey = String(key || "");
    if (!normalizedKey || normalizedKey !== scheduleStorageKey) {
      return false;
    }
    if (!queuedWrite?.followsActiveWrite) {
      return false;
    }
    const acknowledgedRevision = getCentralSyncResultRevision(result);
    if (!acknowledgedRevision) {
      return false;
    }
    const nextBaseRevision = Math.max(Number(queuedWrite.baseRevision) || 0, acknowledgedRevision);
    let advanced = false;
    const expected = queuedWrite.pendingEntry;
    const fields = ["hash", "writes", "updatedAt", "deletedAt", "principalScope", "pendingBaseRevision"];
    mutateManifest((manifest) => {
      const entry = manifest.entries[normalizedKey];
      if (!entry?.pendingCentralSync || !expected || fields.some((field) => field !== "pendingBaseRevision" && entry[field] !== expected[field]) ||
          ![expected.pendingBaseRevision, nextBaseRevision].includes(entry.pendingBaseRevision) ||
          rawGetItem(normalizedKey) !== (queuedWrite.removed ? null : queuedWrite.value)) return;
      entry.pendingBaseRevision = nextBaseRevision;
      advanced = true;
    });
    if (!advanced) return null;
    queuedWrite.predecessorAckRevision = acknowledgedRevision;
    const persisted = readManifest()?.entries?.[normalizedKey];
    if (!persisted?.pendingCentralSync || fields.some((field) => persisted[field] !==
        (field === "pendingBaseRevision" ? nextBaseRevision : expected[field])) ||
        rawGetItem(normalizedKey) !== (queuedWrite.removed ? null : queuedWrite.value)) return false;
    queuedWrite.baseRevision = nextBaseRevision;
    queuedWrite.pendingEntry = { ...persisted };
    queuedWrite.followsActiveWrite = false;
    delete queuedWrite.predecessorAckRevision;
    return true;
  }

  function isCentralStateWriteGenerationCurrent(write = {}, allowOwnQueuedWrite = false) {
    const key = String(write.key || "");
    if (!key || (centralStateWriteQueue.has(key) && (!allowOwnQueuedWrite || centralStateWriteQueue.get(key) !== write))) {
      return false;
    }
    const currentValue = rawGetItem(key);
    const viewToken = getCentralStateBridge()?.getCachedValueInfo?.(key)?.sessionViewToken;
    if (write.sessionViewToken && viewToken && write.sessionViewToken !== viewToken) return false;
    return write.removed ? currentValue === null : currentValue === write.value;
  }

  function wasWriteAcknowledgedByRead(write) {
    const bridge = getCentralStateBridge();
    if ((!write.removed && write.key !== "football-medical-team-v1") || !write.pendingEntry ||
        (write.principalScope && write.principalScope !== bridge?.getReadScope?.()) ||
        bridge?.getCachedValueInfo?.(write.key)?.source === "central-readonly-baseline") return false;
    const entry = readManifest()?.entries?.[write.key];
    const fields = ["hash", "writes", "updatedAt", "deletedAt", "principalScope", "pendingBaseRevision"];
    return entry?.pendingCentralSync === false && !entry.localWritePrepared && Number.isInteger(entry.serverRevision) &&
      entry.serverRevision > Math.max(getCentralStateWriteBaseRevision(write), Number(write.pendingEntry.serverRevision) || 0) &&
      fields.every((field) => entry[field] === write.pendingEntry[field]) && isCentralStateWriteGenerationCurrent(write, true);
  }

  function canWriteCentralBackedCache() {
    if (win.__footballScienceCentralHydrating) {
      return true;
    }
    const bridge = getCentralStateBridge();
    return Boolean(getCurrentUser() && bridge?.syncKey);
  }

  function createCentralBackedStorageError() { return new Error("Central sync is not ready."); }

  function setCentralSyncPendingState(key, isPending = false, isRemoved = false, principalScope = "", baseRevision) {
    const normalizedKey = String(key || "");
    const updated = mutateManifest((manifest) => {
      const currentEntry = manifest.entries[normalizedKey] || {};
      if (isPending && currentEntry.localWritePrepared) manifest.lastSavedAt = currentEntry.updatedAt;
      manifest.entries[normalizedKey] = {
        ...(currentEntry?.label ? currentEntry : { label: getStorageLabel(normalizedKey), writes: 0, size: 0, hash: "", updatedAt: "", deletedAt: "" }),
        ...currentEntry,
        pendingCentralSync: Boolean(isPending),
        ...(currentEntry.localWritePrepared ? { localWritePrepared: false } : {}),
        ...(isPending && principalScope ? { principalScope } : {}),
        ...(isPending && Number.isInteger(baseRevision) && baseRevision >= 0 ? {
          pendingBaseRevision: baseRevision,
          ...(Number.isInteger(Number(currentEntry.serverRevision)) ? {} : { serverRevision: baseRevision }),
        } : {}),
        deletedAt: isRemoved ? currentEntry.deletedAt || getDataSafetyNow() : "",
      };
    });
    queueStatusRefresh();
    const expected = updated?.entries?.[normalizedKey];
    if (!expected || JSON.stringify(readManifest()?.entries?.[normalizedKey]) !== JSON.stringify(expected)) return null;
    return { ...expected };
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

  async function retryCentral(readManifest) {
    if (!getCurrentUser() || !getCentralStateBridge()?.syncKey) return;
    // Retire the exact read receipt at the ready event, before later hydration cache bookkeeping.
    for (const [key, write] of [...centralStateWriteQueue, ...centralStateActiveWrites]) {
      if (!wasWriteAcknowledgedByRead(write)) continue;
      if (centralStateWriteQueue.get(key) === write) centralStateWriteQueue.delete(key);
      if (centralStateActiveWrites.get(key) === write) write.readAcknowledged = true;
      conflictedWrites.delete(key);
      reportSyncStatus(key, "saved", "Saved");
    }
    if (typeof readManifest === "function") pendingManifestRetry = { readManifest };
    if (centralStateWriteTimer || centralStateWriteFlushPromise || win.__footballScienceCentralHydrating) return;
    if (centralStateWriteQueue.size) {
      // Resume retained writes on an external recovery event, never a failure loop.
      centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, 120);
      return;
    }
    const userId = getCurrentUser()?.id;
    const principalScope = getCentralStateBridge()?.getReadScope?.();
    const retryRequest = pendingManifestRetry;
    let durableState = null;
    let setPiecesDurableState = null;
    try {
      durableState = getCentralStateBridge()?.getSessionPendingState ? await getCentralStateBridge().getSessionPendingState() : null;
      if (getCurrentUser()?.id !== userId || getCentralStateBridge()?.getReadScope?.() !== principalScope) return;
      setPiecesDurableState = getCentralStateBridge()?.getSetPiecesPendingState
        ? await getCentralStateBridge().getSetPiecesPendingState() : null;
    } catch {
      if (getCurrentUser()?.id === userId && getCentralStateBridge()?.getReadScope?.() === principalScope) {
        reportSyncStatus(sessionPlannerStorageKey, "issue", "Local save queue unavailable");
        if (setPiecesRoomStorageKey) reportSyncStatus(setPiecesRoomStorageKey, "issue", "Local save queue unavailable");
      }
    }
    if (getCurrentUser()?.id !== userId || getCentralStateBridge()?.getReadScope?.() !== principalScope || centralStateWriteQueue.size || centralStateWriteFlushPromise) return;
    if (pendingManifestRetry === retryRequest) pendingManifestRetry = null;
    if (durableState) queueCentralStateWrite(sessionPlannerStorageKey, rawGetItem(sessionPlannerStorageKey) ?? durableState, { automatic: true, sessionReplay: true });
    if (setPiecesDurableState) queueCentralStateWrite(setPiecesRoomStorageKey, rawGetItem(setPiecesRoomStorageKey) ?? setPiecesDurableState, { automatic: true, setPiecesReplay: true });
    const manifest = typeof readManifest === "function" ? readManifest() : {};
    for (const [key, entry] of Object.entries(manifest.entries || {})) {
      if (entry.principalScope && entry.principalScope !== getCentralStateBridge()?.getReadScope?.()) continue;
      if (getCentralStateBridge()?.getCachedValueInfo?.(key)?.source === "central-readonly-baseline") continue;
      // New Sessions retries use immutable journal entries, never an old whole-calendar cache.
      if (key === sessionPlannerStorageKey && getCentralStateBridge()?.stageSessionWrite) continue;
      if (key === setPiecesRoomStorageKey && getCentralStateBridge()?.getSetPiecesPendingState) continue;
      if (key === sessionPlannerStorageKey &&
          getCentralStateBridge()?.getCachedValueInfo?.(key)?.source === "central-pending-baseline") continue;
      const value = rawGetItem(key);
      if (
        entry?.pendingCentralSync &&
        (entry.deletedAt || value !== null) &&
        getCentralStateBridge()?.canAutoSyncKey?.(key) !== false
      ) {
        const revision = Number(entry.pendingBaseRevision ?? entry.serverRevision);
        queueCentralStateWrite(key, value ?? "", { removed: !!entry.deletedAt, automatic: true,
          retainedGeneration: true, principalScope: entry.principalScope, baseRevision: Number.isInteger(revision) && revision >= 0 ? revision : 0 });
      }
    }
  }

  function applyCentralSyncedStateValue(write = {}, syncedValue) {
    const key = String(write.key || "");
    if (!key || write.removed || typeof syncedValue !== "string") {
      return;
    }
    if (!isCentralStateWriteGenerationCurrent(write) ||
        (syncedValue === write.value && key !== sessionPlannerStorageKey)) {
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
    let phase = "cache";
    let appliedValue = write.value;
    try {
      const wasHydrating = win.__footballScienceCentralHydrating;
      win.__footballScienceCentralHydrating = true;
      try {
        (key === sessionPlannerStorageKey ? cacheAcknowledgedValue : rawSetItem)(key, valueToApply);
        appliedValue = valueToApply;
      } finally {
        win.__footballScienceCentralHydrating = wasHydrating;
      }
      phase = "manifest";
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
      phase = "snapshot";
      queueSnapshot("central-merge");
      phase = "view";
      handleSyncedStateValue(key, valueToApply);
      return { appliedValue };
    } catch (error) {
      const errorType = ["QuotaExceededError", "SecurityError", "ReferenceError", "TypeError"].includes(error?.name) ? error.name : "Error";
      try { win.console?.warn?.("Central save acknowledgement refresh failed", { key, phase, errorType }); } catch {}
      const prefix = key === sessionPlannerStorageKey ? "Training saved centrally" : "Changes saved centrally";
      const issue = phase === "view" ? `${prefix}; the view could not be refreshed.`
        : phase === "cache" ? `${prefix}; browser cache could not be refreshed.`
          : `${prefix}; local recovery metadata could not be refreshed.`;
      return { appliedValue, issue };
    }
  }

  function reconcileScheduleAcknowledgementOrder(write) {
    if (write.key !== scheduleStorageKey || write.removed || !write.pendingEntry) return write;
    const value = rawGetItem(write.key), entry = readManifest()?.entries?.[write.key];
    const fields = ["hash", "writes", "updatedAt", "deletedAt", "principalScope", "pendingBaseRevision"];
    if (value === write.value || !entry?.pendingCentralSync || entry.localWritePrepared ||
        fields.some((field) => entry[field] !== write.pendingEntry[field]) ||
        !isCentralStateWriteGenerationCurrent({ ...write, value })) return write;
    // Only object key order may change; array order, fields and values remain significant.
    const ordered = (item) => Array.isArray(item) ? item.map(ordered)
      : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, ordered(item[key])])) : item;
    try {
      if (JSON.stringify(ordered(JSON.parse(value))) === JSON.stringify(ordered(JSON.parse(write.value)))) {
        return { ...write, value };
      }
    } catch { /* Malformed values cannot acknowledge a generation. */ }
    return write;
  }

  function finishAcknowledgedWrite(write, result) {
    write = reconcileScheduleAcknowledgementOrder(write);
    const cached = getCentralStateBridge()?.getCachedValueInfo?.(write.key);
    // A read projection can refresh unrelated server fields without creating a
    // new edit. Only that exact draft generation may accept this receipt.
    if (write.key === sessionPlannerStorageKey && write.sessionViewToken &&
        cached?.sessionViewToken === write.sessionViewToken && cached.source === "session-journal-pending") {
      write = { ...write, value: cached.value };
    }
    advanceQueuedWriteBaseRevision(write.key, result);
    const successorIssue = centralStateWriteQueue.get(write.key)?.predecessorAckRevision ? successorPersistenceIssue : "";
    if (successorIssue) reportSyncStatus(write.key, "issue", successorIssue);
    persistCentralStateServerRevision(write.key, result);
    const currentBeforeApply = isCentralStateWriteGenerationCurrent(write);
    const applied = applyCentralSyncedStateValue(write, result.value);
    // Refresh callbacks can create a newer edit. Never acknowledge it with A's receipt.
    if (currentBeforeApply && isCentralStateWriteGenerationCurrent({ ...write, value: applied?.appliedValue ?? write.value })) {
      setCentralSyncPendingState(write.key, false, write.removed);
      reportSyncStatus(write.key, applied?.issue ? "issue" : "saved", applied?.issue || "Saved");
    }
    return applied?.issue || successorIssue;
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
    if (write.retainedGeneration) return false;
    const key = String(write.key || "");
    const retryableKeys = new Set([sessionPlannerStorageKey, ...retryConflictStorageKeys].filter(Boolean));
    return retryableKeys.has(key) && !write.removed && Number(write.retryCount || 0) <= 0;
  }

  async function retryCentralStateWriteAfterConflict(write = {}, result = {}, bridge = getCentralStateBridge()) {
    if (write.principalScope && write.principalScope !== bridge?.getReadScope?.()) return { ok: false, staleContext: true };
    if (!shouldRetryCentralStateWriteAfterConflict(write)) {
      return null;
    }
    const retryBaseRevision = getCentralSyncResultRevision(result);
    if (!retryBaseRevision || !bridge?.syncKey) {
      return null;
    }
    centralStateActiveWrites.set(write.key, write);
    let retryResult;
    try {
      retryResult = await bridge.syncKey(write.key, write.value, {
        removed: false,
        baseRevision: retryBaseRevision,
      });
    } finally {
      centralStateActiveWrites.delete(write.key);
    }
    if (write.principalScope && write.principalScope !== bridge?.getReadScope?.()) return { ok: false, staleContext: true };
    if (!retryResult?.ok) {
      return retryResult || null;
    }
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
    if (bridge?.getCachedValueInfo?.(normalizedKey)?.source === "central-readonly-baseline") return;
    if (!getCurrentUser() || !bridge?.syncKey) {
      queueCentralStateStatus("Central sync unavailable.");
      reportSyncStatus(normalizedKey, "issue", "Central sync unavailable.");
      return;
    }
    const principalScope = options.principalScope || bridge.getReadScope?.();
    if (typeof bridge.getReadScope === "function" && (!principalScope || principalScope !== bridge.getReadScope())) return;
    const prepared = readManifest()?.entries?.[normalizedKey];
    if (prepared?.localWritePrepared && (prepared.hash !== hashString(String(value ?? "")) ||
        rawGetItem(normalizedKey) !== (options.removed ? null : String(value ?? "")))) {
      reportSyncStatus(normalizedKey, "issue", successorPersistenceIssue);
      return false;
    }
    const baseRevision = Number.isInteger(options.baseRevision) && options.baseRevision >= 0 ? options.baseRevision
      : isCentralStateBridgeHydrated(bridge) ? getCentralStateRevisionForKey(normalizedKey) : null;
    reportSyncStatus(normalizedKey, "saving", "Saving");
    const pendingEntry = setCentralSyncPendingState(normalizedKey, true, Boolean(options.removed), principalScope, baseRevision);
    if (!pendingEntry) {
      reportSyncStatus(normalizedKey, "issue", successorPersistenceIssue);
      return false;
    }
    let stage = null;
    let stageKind = "";
    if (normalizedKey === sessionPlannerStorageKey && !options.removed && bridge.stageSessionWrite) {
      stageKind = "session";
      stage = () => options.sessionReplay
        ? Promise.resolve({ ok: true })
        : bridge.stageSessionWrite(String(value ?? ""), {
            previousValue: options.previousValue,
            previousPending: options.previousPending,
          });
    } else if (normalizedKey === setPiecesRoomStorageKey && !options.removed &&
        !options.setPiecesReplay && bridge.stageSetPiecesWrite) {
      stageKind = "set-pieces";
      stage = () => bridge.stageSetPiecesWrite(String(value ?? ""), {
        previousValue: options.previousValue,
      });
    }
    centralStateWriteQueue.set(normalizedKey, {
      key: normalizedKey,
      value: String(value ?? ""),
      removed: Boolean(options.removed),
      automatic: Boolean(options.automatic),
      retainedGeneration: Boolean(options.retainedGeneration),
      // Reloaded tombstones may have lost their receipt before the runtime was replaced.
      retryAfterFailure: Boolean(options.retainedGeneration && options.removed),
      principalScope,
      baseRevision,
      pendingEntry,
      followsActiveWrite: centralStateActiveWrites.has(normalizedKey),
      ...(normalizedKey === sessionPlannerStorageKey ? { sessionViewToken: options.sessionViewToken || bridge.getCachedValueInfo?.(normalizedKey)?.sessionViewToken } : {}),
      previousValue: typeof options.previousValue === "string" ? options.previousValue : undefined,
      setPiecesReplay: Boolean(options.setPiecesReplay || stageKind === "set-pieces"),
      ...(stage ? {
        stage,
        stageKind,
        staged: Promise.resolve().then(stage).catch((error) => ({ ok: false, reason: error.message })),
      } : {}),
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
    if ((bridge.getStatus?.()?.hydrating && Array.from(centralStateWriteQueue.values()).some((write) => write.retryAfterFailure)) ||
        !isCentralStateBridgeHydrated(bridge)) {
      queueCentralStateStatus("Central sync is loading.");
      if (!centralStateWriteTimer) {
        centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, centralStateHydrationRetryMs);
      }
      return false;
    }
    const writes = Array.from(centralStateWriteQueue.values());
    let flushIssue = "";
    centralStateWriteQueue.clear();
    for (let index = 0; index < writes.length; index += 1) {
      const write = writes[index];
      if (write.principalScope && write.principalScope !== bridge.getReadScope?.()) continue;
      if (wasWriteAcknowledgedByRead(write)) {
        conflictedWrites.delete(write.key);
        reportSyncStatus(write.key, "saved", "Saved");
        continue;
      }
      if (isConflictedWrite(write)) {
        flushIssue = "Local changes need review";
        reportSyncStatus(write.key, "issue", flushIssue);
        continue;
      }
      if (bridge.getCachedValueInfo?.(write.key)?.source === "central-readonly-baseline") continue;
      if (write.automatic && bridge.canAutoSyncKey?.(write.key) === false) {
        continue;
      }
      if (write.predecessorAckRevision) {
        const advanced = advanceQueuedWriteBaseRevision(write.key, { revision: write.predecessorAckRevision }, write);
        if (advanced === null) continue; // A newer generation superseded this queued successor.
        if (!advanced) {
          if (!centralStateWriteQueue.has(write.key)) centralStateWriteQueue.set(write.key, write);
          flushIssue = successorPersistenceIssue;
          reportSyncStatus(write.key, "issue", flushIssue);
          continue;
        }
      }
      centralStateActiveWrites.set(write.key, write);
      let result;
      try {
        const staged = write.stage ? await (write.staged || write.stage()) : { ok: true };
        write.staged = null;
        if (write.principalScope && write.principalScope !== bridge.getReadScope?.()) continue;
        // Earlier requests can yield while a read starts or acknowledges this retry.
        if (write.readAcknowledged || wasWriteAcknowledgedByRead(write)) {
          reportSyncStatus(write.key, "saved", "Saved");
          continue;
        }
        if (write.retryAfterFailure && bridge.getStatus?.()?.hydrating) {
          for (const retained of writes.slice(index)) {
            if (!centralStateWriteQueue.has(retained.key)) centralStateWriteQueue.set(retained.key, retained);
          }
          if (!centralStateWriteTimer) {
            centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, centralStateHydrationRetryMs);
          }
          return false;
        }
        let retryReadOk = true;
        if (write.retryAfterFailure && write.removed) {
          // A failed response may hide a committed deletion. Read its receipt before resending.
          retryReadOk = await Promise.resolve().then(() => bridge.hydrate?.({ fresh: true })).catch(() => false);
          if (write.principalScope && write.principalScope !== bridge.getReadScope?.()) continue;
          if (write.readAcknowledged || wasWriteAcknowledgedByRead(write)) {
            reportSyncStatus(write.key, "saved", "Saved");
            continue;
          }
          const entry = readManifest()?.entries?.[write.key];
          if (!isCentralStateWriteGenerationCurrent(write) || !entry?.pendingCentralSync ||
              ["hash", "writes", "updatedAt", "deletedAt", "principalScope", "pendingBaseRevision"].some(
                (field) => entry[field] !== write.pendingEntry?.[field])) continue;
          if (bridge.getCachedValueInfo?.(write.key)?.source === "central-readonly-baseline" ||
              (write.automatic && bridge.canAutoSyncKey?.(write.key) === false)) continue;
        }
        result = !staged.ok ? staged : !retryReadOk
          ? { ok: false, reason: "Central deletion could not be verified. Local changes were retained." }
          : await bridge.syncKey(write.key, write.value, {
          removed: write.removed,
          baseRevision: getCentralStateWriteBaseRevision(write),
          ...(write.previousValue !== undefined ? { previousValue: write.previousValue } : {}),
          ...(write.setPiecesReplay ? { setPiecesReplay: true } : {}),
          ...(write.stageKind === "session" ? { sessionStaged: true } : {}),
        });
      } catch (error) {
        result = { ok: false, reason: error?.message || "Central sync failed. Local changes were retained." };
      } finally {
        centralStateActiveWrites.delete(write.key);
      }
      // Hydration can separate the server view while this older write is awaiting a response.
      if (write.principalScope && write.principalScope !== bridge.getReadScope?.()) continue;
      if (write.readAcknowledged) continue;
      if (result?.staleContext) continue;
      if (bridge.getCachedValueInfo?.(write.key)?.source === "central-readonly-baseline") continue;
      if (!result?.ok) {
        if (result?.reviewRequired) {
          flushIssue = result.reason;
          setCentralSyncPendingState(write.key, true, false);
          queueCentralStateStatus(result.reason);
          reportSyncStatus(write.key, "issue", result.reason);
          continue;
        }
        if (result?.conflict || result?.status === 409) {
          const retryResult = await retryCentralStateWriteAfterConflict(write, result, bridge);
          if (write.principalScope && write.principalScope !== bridge.getReadScope?.()) continue;
          if (write.readAcknowledged || retryResult?.staleContext) continue;
          if (bridge.getCachedValueInfo?.(write.key)?.source === "central-readonly-baseline") continue;
          if (retryResult?.ok) {
            flushIssue = finishAcknowledgedWrite(write, retryResult) || flushIssue;
            continue;
          }
          if (write.key === scheduleStorageKey) {
            // Schedule is a shared revision-guarded blob. A forced hydration
            // here would replace the unsynced local edit, while retrying the
            // whole blob at a newer revision could overwrite a colleague.
          } else if (write.key !== sessionPlannerStorageKey && !write.retainedGeneration) {
            const hydrated = await bridge.hydrate?.({ forceApply: true }).catch(() => false);
            if (write.principalScope && write.principalScope !== bridge.getReadScope?.()) continue;
            if (bridge.getCachedValueInfo?.(write.key)?.source === "central-readonly-baseline") continue;
            // A Medical read can preserve the pending draft; it is not a write receipt.
            if (hydrated && write.key !== "football-medical-team-v1") {
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
          }
          flushIssue = result?.reason || "Central newer.";
          queueCentralStateStatus(flushIssue);
          conflictedWrites.set(write.key, write);
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
          if (write.key === sessionPlannerStorageKey && result.durablePending) {
            setCentralSyncPendingState(write.key, true, false);
            flushIssue = result.reason || "Local changes retained; access denied.";
          } else if (isCentralStateWriteGenerationCurrent(write)) {
            setCentralSyncPendingState(write.key, false, write.removed);
          }
          reportSyncStatus(write.key, "issue", result?.reason || "Not authorized for this data.");
          continue;
        }
        for (let retryIndex = index; retryIndex < writes.length; retryIndex += 1) {
          const retryWrite = writes[retryIndex];
          if (retryIndex === index) retryWrite.retryAfterFailure = true;
          if (!centralStateWriteQueue.has(retryWrite.key)) {
            centralStateWriteQueue.set(retryWrite.key, retryWrite);
          }
        }
        queueCentralStateStatus(result?.reason || "Sync failed.");
        reportSyncStatus(write.key, "issue", result?.reason || "Sync failed.");
        return false;
      }
      flushIssue = finishAcknowledgedWrite(write, result) || flushIssue;
      if (result?.merged && write.key === sessionPlannerStorageKey && getActiveWorkspaceId() === "session-planner") {
        showSessionPlannerToast("Central sync merged.", "warning");
      }
    }
    queueCentralStateStatus(flushIssue);
    return !Array.from(centralStateWriteQueue.values()).some((write) => write.predecessorAckRevision);
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
        if (canContinue && pendingManifestRetry && !centralStateWriteQueue.size && !centralStateWriteTimer) {
          return retryCentral(pendingManifestRetry.readManifest).then(() => canContinue);
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
