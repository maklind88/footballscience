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
    mutateManifestWithResult = (mutator) => ({ manifest: mutateManifest(mutator), persisted: true }),
    queueStatusRefresh = () => {},
    queueSnapshot = () => {},
    rawGetItem = () => null,
    rawSetItem = () => {},
    readManifest = () => ({}),
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
  let centralStateManifestReader = null;
  let centralStateManifestRetryRequested = false;
  let centralStateWriteGeneration = 0;
  const centralStateWriteQueue = new Map();
  const centralStateWriteSuppressionKeys = new Set();
  let sessionPlannerCentralSyncNoticeAt = 0;
  const centralStateHydrationRetryMs = 250;

  function reportSyncStatus(key, state, message) {
    setAutosaveStatusForKey(key, state, message);
    handleSyncStatus(key, state, message);
  }

  function getCentralStateBridge() { return win.footballScienceCentralState ?? null; }

  function getCentralStatePrincipalScope(user = getCurrentUser()) {
    const principal = user && typeof user === "object" ? user : {};
    if (!String(principal.id || "")) {
      return "";
    }
    return [principal.id, principal.clubId, principal.teamId]
      .map((value) => String(value || ""))
      .join(":");
  }

  function getCentralStatePrincipalEpoch(bridge = getCentralStateBridge()) {
    const epoch = Number(bridge?.getStatus?.()?.principalEpoch);
    return Number.isInteger(epoch) && epoch >= 0 ? epoch : null;
  }

  function isCentralStateWriteForCurrentPrincipal(write = {}) {
    const currentScope = getCentralStatePrincipalScope();
    const currentEpoch = getCentralStatePrincipalEpoch();
    return Boolean(
      currentScope &&
      write.principalScope === currentScope &&
      (
        write.principalEpoch === null ||
        write.principalEpoch === undefined ||
        currentEpoch === write.principalEpoch
      )
    );
  }

  function getCentralStateMetadataForKey(key) {
    const metadata = getCentralStateBridge()?.getStatus?.()?.metadata;
    const entry = metadata?.[String(key || "")];
    return entry && typeof entry === "object" ? entry : {};
  }

  function getCentralStateRevisionForKey(key) {
    const revision = Number(getCentralStateMetadataForKey(key).revision);
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
  }

  function getCentralStateBridgeHydrationState(bridge = getCentralStateBridge()) {
    const status = bridge?.getStatus?.() || {};
    if (status.hydrating === true) {
      return "active";
    }
    if (String(status.hydrationError || "").trim()) {
      return "failed";
    }
    const hydrated = typeof bridge?.isHydrated === "function" ? Boolean(bridge.isHydrated()) : true;
    return hydrated ? "ready" : "pending";
  }

  function isCentralStateBridgeHydrated(bridge = getCentralStateBridge()) {
    return getCentralStateBridgeHydrationState(bridge) === "ready";
  }

  function canWriteCentralStateKey(key, bridge = getCentralStateBridge()) {
    return typeof bridge?.canWriteKey === "function" && bridge.canWriteKey(String(key || "")) === true;
  }

  function canAutomaticallyRetryCentralStateKey(key, bridge = getCentralStateBridge()) {
    return (
      canWriteCentralStateKey(key, bridge) &&
      (
        typeof bridge?.canAutoRetryKey !== "function" ||
        bridge.canAutoRetryKey(String(key || "")) === true
      )
    );
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

  function createCentralManifestGeneration(entry = {}, value = null) {
    return {
      principalScope: String(entry.principalScope || ""),
      hash: String(entry.hash || ""),
      writes: Number(entry.writes || 0),
      updatedAt: String(entry.updatedAt || ""),
      deletedAt: String(entry.deletedAt || ""),
      value: typeof value === "string" ? value : null,
    };
  }

  function matchesCentralManifestGeneration(entry = {}, value = null, expected = null) {
    if (!expected) {
      return false;
    }
    const current = createCentralManifestGeneration(entry, value);
    return (
      current.principalScope === expected.principalScope &&
      current.hash === expected.hash &&
      current.writes === expected.writes &&
      current.updatedAt === expected.updatedAt &&
      current.deletedAt === expected.deletedAt &&
      current.value === expected.value
    );
  }

  function isCentralStateWriteGenerationCurrent(write = {}) {
    if (!write.manifestGeneration) {
      return false;
    }
    let matches = false;
    mutateManifest((manifest) => {
      const currentEntry = manifest.entries[String(write.key || "")] || {};
      matches = Boolean(
        currentEntry.pendingCentralSync &&
        matchesCentralManifestGeneration(currentEntry, rawGetItem(write.key), write.manifestGeneration)
      );
    });
    return matches;
  }

  function isVerifiedCentralStateAcknowledgement(write = {}, result = {}, baseRevision = 0) {
    if (result?.localDev === true) {
      return true;
    }
    const acknowledgedRevision = getCentralSyncResultRevision(result);
    return Boolean(
      String(result?.key || "") === String(write.key || "") &&
      acknowledgedRevision > Number(baseRevision || 0)
    );
  }

  function setCentralSyncPendingState(key, isPending = false, isRemoved = false, principalScope = "", options = {}) {
    const normalizedKey = String(key || "");
    const normalizedPrincipalScope = String(principalScope || "");
    let changed = false;
    let generation = null;
    mutateManifest((manifest) => {
      const currentEntry = manifest.entries[normalizedKey] || {};
      if (
        !isPending &&
        normalizedPrincipalScope &&
        String(currentEntry.principalScope || "") !== normalizedPrincipalScope
      ) {
        return;
      }
      if (
        !isPending &&
        !matchesCentralManifestGeneration(
          currentEntry,
          rawGetItem(normalizedKey),
          options.expectedGeneration
        )
      ) {
        return;
      }
      manifest.entries[normalizedKey] = {
        ...(currentEntry?.label ? currentEntry : { label: getStorageLabel(normalizedKey), writes: 0, size: 0, hash: "", updatedAt: "", deletedAt: "" }),
        ...currentEntry,
        pendingCentralSync: Boolean(isPending),
        principalScope: isPending ? normalizedPrincipalScope : String(currentEntry.principalScope || normalizedPrincipalScope),
        deletedAt: isRemoved ? getDataSafetyNow() : currentEntry.deletedAt || "",
      };
      if (!isPending && normalizedPrincipalScope && manifest.principalPending?.[normalizedPrincipalScope]?.[normalizedKey]) {
        delete manifest.principalPending[normalizedPrincipalScope][normalizedKey];
        if (!Object.keys(manifest.principalPending[normalizedPrincipalScope]).length) {
          delete manifest.principalPending[normalizedPrincipalScope];
        }
      }
      manifest.activePrincipalScope = normalizedPrincipalScope || String(manifest.activePrincipalScope || "");
      changed = true;
      if (isPending) {
        generation = createCentralManifestGeneration(
          manifest.entries[normalizedKey],
          typeof options.value === "string" ? options.value : rawGetItem(normalizedKey)
        );
      }
    });
    if (changed) {
      queueStatusRefresh();
    }
    return isPending ? generation : changed;
  }

  function acknowledgeCentralStateWrite(write = {}) {
    if (!isCentralStateWriteForCurrentPrincipal(write)) {
      return false;
    }
    const queuedWrite = centralStateWriteQueue.get(String(write.key || ""));
    if (
      queuedWrite &&
      (
        queuedWrite.principalScope !== write.principalScope ||
        Number(queuedWrite.generation) > Number(write.generation)
      )
    ) {
      return false;
    }
    return setCentralSyncPendingState(write.key, false, write.removed, write.principalScope, {
      expectedGeneration: write.manifestGeneration,
    });
  }

  function getNewerQueuedCentralStateWrite(write = {}) {
    const queuedWrite = centralStateWriteQueue.get(String(write.key || ""));
    if (
      !queuedWrite ||
      queuedWrite.principalScope !== write.principalScope ||
      Number(queuedWrite.generation) <= Number(write.generation)
    ) {
      return null;
    }
    return queuedWrite;
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
    if (typeof readManifest === "function") {
      centralStateManifestReader = readManifest;
    }
    if (centralStateWriteTimer || centralStateWriteFlushInFlight || win.__footballScienceCentralHydrating) {
      centralStateManifestRetryRequested = true;
      return;
    }
    if (centralStateWriteQueue.size) {
      centralStateManifestRetryRequested = true;
      centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, 120);
      return;
    }
    const principalScope = getCentralStatePrincipalScope();
    if (!principalScope || !bridge?.syncKey) return;
    centralStateManifestRetryRequested = false;
    const manifest = typeof readManifest === "function" ? readManifest() : {};
    for (const [key, entry] of Object.entries(manifest.entries || {})) {
      const value = rawGetItem(key);
      if (
        entry?.pendingCentralSync &&
        entry.principalScope === principalScope &&
        canAutomaticallyRetryCentralStateKey(key, bridge) &&
        (entry.deletedAt || value !== null)
      ) {
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
      return false;
    }
    const queuedWrite = centralStateWriteQueue.get(key);
    const currentValue = rawGetItem(key);
    const hasNewerQueuedWrite = Boolean(
      queuedWrite &&
      queuedWrite.principalScope === write.principalScope &&
      Number(queuedWrite.generation) > Number(write.generation)
    );
    const canRestoreConflictGeneration =
      typeof write.conflictHydratedValue === "string" &&
      currentValue === write.conflictHydratedValue;
    const generationBound = Boolean(write.manifestGeneration);
    if (
      !isCentralStateWriteForCurrentPrincipal(write) ||
      (generationBound && !isCentralStateWriteGenerationCurrent(write)) ||
      hasNewerQueuedWrite ||
      (currentValue !== write.value && !canRestoreConflictGeneration)
    ) {
      return false;
    }
    if (syncedValue === currentValue) {
      return true;
    }
    const valueToApply =
      key === scheduleStorageKey
        ? mergeScheduleStatePreservingLocalUi(rawGetItem(key), syncedValue)
        : key === periodizationStorageKey
          ? mergePeriodizationStatePreservingLocalUi(rawGetItem(key), syncedValue)
          : key === dashboardPresentationStorageKey
            ? mergeDashboardPresentationStatePreservingLocalEdits(rawGetItem(key), syncedValue)
            : syncedValue;
    let manifestUpdated = false;
    let nextManifestGeneration = null;
    let previousManifestGeneration = null;
    const mutationResult = mutateManifestWithResult((manifest) => {
      const currentEntry = manifest.entries[key] || {};
      previousManifestGeneration = createCentralManifestGeneration(currentEntry, currentValue);
      if (
        generationBound &&
        !matchesCentralManifestGeneration(currentEntry, currentValue, write.manifestGeneration)
      ) {
        return;
      }
      win.__footballScienceCentralHydrating = true;
      try {
        rawSetItem(key, valueToApply);
      } finally {
        win.__footballScienceCentralHydrating = false;
      }
      if (rawGetItem(key) !== valueToApply) {
        return;
      }
      manifest.entries[key] = {
        ...(currentEntry?.label ? currentEntry : { label: getStorageLabel(key), writes: 0 }),
        ...currentEntry,
        updatedAt: getDataSafetyNow(),
        size: valueToApply.length,
        hash: hashString(valueToApply),
        pendingCentralSync: generationBound,
      };
      if (generationBound) {
        nextManifestGeneration = createCentralManifestGeneration(manifest.entries[key], valueToApply);
      }
      manifestUpdated = true;
    });
    const restorePreviousValueIfGenerationIsUnchanged = () => {
      const persistedEntry = readManifest()?.entries?.[key] || {};
      if (
        rawGetItem(key) !== valueToApply ||
        !matchesCentralManifestGeneration(
          persistedEntry,
          currentValue,
          previousManifestGeneration
        )
      ) {
        return false;
      }
      win.__footballScienceCentralHydrating = true;
      try {
        rawSetItem(key, currentValue);
      } finally {
        win.__footballScienceCentralHydrating = false;
      }
      return rawGetItem(key) === currentValue;
    };
    if (!manifestUpdated || mutationResult?.persisted !== true) {
      if (manifestUpdated) restorePreviousValueIfGenerationIsUnchanged();
      return false;
    }
    const persistedEntry = readManifest()?.entries?.[key] || {};
    if (
      rawGetItem(key) !== valueToApply ||
      (
        generationBound &&
        !matchesCentralManifestGeneration(persistedEntry, valueToApply, nextManifestGeneration)
      )
    ) {
      restorePreviousValueIfGenerationIsUnchanged();
      return false;
    }
    if (generationBound) {
      write.manifestGeneration = nextManifestGeneration;
    }
    queueSnapshot("central-merge");
    handleSyncedStateValue(key, valueToApply);
    return true;
  }

  function persistCentralStateServerRevision(key, result = {}, expectedGeneration = null) {
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
      if (
        expectedGeneration &&
        !matchesCentralManifestGeneration(
          currentEntry,
          rawGetItem(normalizedKey),
          expectedGeneration
        )
      ) {
        return;
      }
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

  function advanceQueuedWriteBaseRevision(write = {}, result = {}) {
    const queuedWrite = centralStateWriteQueue.get(String(write.key || ""));
    const acknowledgedRevision = getCentralSyncResultRevision(result);
    if (
      !queuedWrite ||
      queuedWrite.principalScope !== write.principalScope ||
      Number(queuedWrite.generation) <= Number(write.generation) ||
      !acknowledgedRevision
    ) {
      return;
    }
    queuedWrite.baseRevision = Math.max(Number(queuedWrite.baseRevision) || 0, acknowledgedRevision);
  }

  function bindConflictHydratedValueToNewerWrite(write = {}, hydratedServerValue) {
    if (typeof hydratedServerValue !== "string") {
      return;
    }
    const queuedWrite = centralStateWriteQueue.get(String(write.key || ""));
    if (
      !queuedWrite ||
      queuedWrite.principalScope !== write.principalScope ||
      Number(queuedWrite.generation) <= Number(write.generation)
    ) {
      return;
    }
    queuedWrite.conflictHydratedValue = hydratedServerValue;
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
    const retryableKeys = new Set([
      scheduleStorageKey,
      sessionPlannerStorageKey,
      ...retryConflictStorageKeys,
    ].filter(Boolean));
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
      isGenerationCurrent: () =>
        isCentralStateWriteForCurrentPrincipal(write) &&
        isCentralStateWriteGenerationCurrent(write),
    });
    if (!retryResult?.ok) {
      return retryResult || null;
    }
    if (!isVerifiedCentralStateAcknowledgement(write, retryResult, retryBaseRevision)) {
      return {
        ok: false,
        status: 409,
        conflict: true,
        reason: "Central sync acknowledgement did not match the queued write.",
      };
    }
    if (
      !isCentralStateWriteForCurrentPrincipal(write) ||
      !isCentralStateWriteGenerationCurrent(write) ||
      (
        typeof retryResult.value === "string" &&
        !applyCentralSyncedStateValue(write, retryResult.value)
      )
    ) {
      return { ok: false, status: 409, conflict: true, reason: "A newer local generation is pending." };
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
    const principalScope = getCentralStatePrincipalScope();
    if (!principalScope || !bridge?.syncKey) {
      queueCentralStateStatus("Central sync unavailable.");
      reportSyncStatus(normalizedKey, "issue", "Central sync unavailable.");
      return;
    }
    const manifestGeneration = setCentralSyncPendingState(
      normalizedKey,
      true,
      Boolean(options.removed),
      principalScope,
      { value: rawGetItem(normalizedKey) }
    );
    if (!manifestGeneration) {
      reportSyncStatus(normalizedKey, "issue", "Local save generation could not be recorded safely.");
      return;
    }
    const automaticRetry = Boolean(options.automaticRetry);
    if (automaticRetry && !canAutomaticallyRetryCentralStateKey(normalizedKey, bridge)) {
      return;
    }
    reportSyncStatus(normalizedKey, "saving", "Saving");
    centralStateWriteGeneration += 1;
    centralStateWriteQueue.set(normalizedKey, {
      key: normalizedKey,
      value: String(value ?? ""),
      removed: Boolean(options.removed),
      automaticRetry,
      principalScope,
      principalEpoch: getCentralStatePrincipalEpoch(bridge),
      generation: centralStateWriteGeneration,
      manifestGeneration,
      networkRetryCount: 0,
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
    const hydrationState = getCentralStateBridgeHydrationState(bridge);
    if (hydrationState !== "ready") {
      const hydrationError = String(bridge?.getStatus?.()?.hydrationError || "").trim();
      const message = hydrationState === "failed"
        ? hydrationError || "Central sync could not load. Your changes remain pending."
        : "Central sync is loading.";
      queueCentralStateStatus(message);
      if (hydrationState === "failed") {
        centralStateWriteQueue.forEach((write) => {
          reportSyncStatus(write.key, "issue", message);
        });
      } else if (!centralStateWriteTimer) {
        centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, centralStateHydrationRetryMs);
      }
      return;
    }
    const writes = Array.from(centralStateWriteQueue.values());
    let acknowledgedSessionPlannerAutosave = false;
    let hadExplicitPermissionDenial = false;
    let hadUnresolvedWrite = false;
    let shouldRescheduleQueuedWrites = true;
    let queuedWriteRescheduleDelayMs = 120;
    centralStateWriteQueue.clear();
    centralStateWriteFlushInFlight = true;
    try {
      for (let index = 0; index < writes.length; index += 1) {
        const write = writes[index];
        if (Number(write.networkRetryCount) > 1) {
          continue;
        }
        if (!isCentralStateWriteForCurrentPrincipal(write)) {
          continue;
        }
        if (write.automaticRetry && !canAutomaticallyRetryCentralStateKey(write.key, bridge)) {
          continue;
        }
        if (!isCentralStateWriteGenerationCurrent(write)) {
          continue;
        }
        const baseRevision = getCentralStateWriteBaseRevision(write);
        const result = await bridge.syncKey(write.key, write.value, {
          removed: write.removed,
          baseRevision,
          isGenerationCurrent: () =>
            isCentralStateWriteForCurrentPrincipal(write) &&
            isCentralStateWriteGenerationCurrent(write),
        });
        if (!isCentralStateWriteForCurrentPrincipal(write)) {
          continue;
        }
        const generationCurrent = isCentralStateWriteGenerationCurrent(write);
        if (!generationCurrent) {
          continue;
        }
        if (result?.ok && !isVerifiedCentralStateAcknowledgement(write, result, baseRevision)) {
          const reason = "Central sync acknowledgement did not match the queued write.";
          queueCentralStateStatus(reason);
          reportSyncStatus(write.key, "issue", reason);
          hadUnresolvedWrite = true;
          continue;
        }
        if (result?.ok) {
          advanceQueuedWriteBaseRevision(write, result);
          if (!generationCurrent) {
            continue;
          }
        }
        if (!result?.ok) {
          if (result?.status === 403) {
            hadUnresolvedWrite = true;
            if (!write.automaticRetry) {
              hadExplicitPermissionDenial = true;
              const reason = result?.reason || "You do not have permission to save this data.";
              queueCentralStateStatus(reason);
              reportSyncStatus(write.key, "issue", reason);
            }
            continue;
          }
          if (result?.conflict || result?.status === 409) {
            const retryResult = generationCurrent
              ? await retryCentralStateWriteAfterConflict(write, result, bridge)
              : null;
            if (retryResult?.ok) {
              if (!isCentralStateWriteGenerationCurrent(write)) {
                continue;
              }
              const acknowledgedCurrentWrite = acknowledgeCentralStateWrite(write);
              persistCentralStateServerRevision(write.key, retryResult, write.manifestGeneration);
              advanceQueuedWriteBaseRevision(write, retryResult);
              if (acknowledgedCurrentWrite) {
                queueCentralStateStatus("");
                reportSyncStatus(write.key, "saved", "Saved");
                acknowledgedSessionPlannerAutosave ||= isSessionPlannerAutosaveKey(write.key);
              }
              continue;
            }
            if (write.key !== sessionPlannerStorageKey) {
              const hydrationResult = await bridge.hydrate?.({
                forceApply: true,
                returnEntries: true,
                isGenerationCurrent: () =>
                  isCentralStateWriteForCurrentPrincipal(write) &&
                  isCentralStateWriteGenerationCurrent(write),
              }).catch(() => false);
              if (hydrationResult === true || hydrationResult?.ok) {
                const hydratedGenerationCurrent = isCentralStateWriteGenerationCurrent(write);
                const hydratedNewerQueuedWrite = getNewerQueuedCentralStateWrite(write);
                if (!hydratedGenerationCurrent && !hydratedNewerQueuedWrite) {
                  continue;
                }
                const hydratedMetadata = hydrationResult?.metadata?.[write.key] || {
                  revision: getCentralStateRevisionForKey(write.key),
                };
                if (hydratedGenerationCurrent) {
                  persistCentralStateServerRevision(write.key, hydratedMetadata, write.manifestGeneration);
                }
                advanceQueuedWriteBaseRevision(write, hydratedMetadata);
                const hydratedServerValue = hydrationResult?.entries?.[write.key];
                bindConflictHydratedValueToNewerWrite(write, hydratedServerValue);
                if (
                  hydratedGenerationCurrent &&
                  typeof hydratedServerValue === "string" &&
                  hydratedServerValue === write.value
                ) {
                  const acknowledgedCurrentWrite = acknowledgeCentralStateWrite(write);
                  if (!acknowledgedCurrentWrite) {
                    continue;
                  }
                  queueCentralStateStatus("");
                  reportSyncStatus(write.key, "saved", "Saved");
                  continue;
                }
              }
            } else if (generationCurrent) {
              acknowledgeCentralStateWrite(write);
            }
            queueCentralStateStatus(result?.reason || "Central newer.");
            registerSessionPlannerCentralSyncConflict(write, result);
            reportSyncStatus(write.key, "issue", "Sync needs attention");
            hadUnresolvedWrite = true;
            continue;
          }
          for (let retryIndex = index; retryIndex < writes.length; retryIndex += 1) {
            const retryWrite = writes[retryIndex];
            if (retryIndex === index) {
              retryWrite.networkRetryCount = Number(retryWrite.networkRetryCount || 0) + 1;
            }
            const queuedWrite = centralStateWriteQueue.get(retryWrite.key);
            if (!queuedWrite || Number(queuedWrite.generation) <= Number(retryWrite.generation)) {
              centralStateWriteQueue.set(retryWrite.key, retryWrite);
            }
          }
          shouldRescheduleQueuedWrites = Array.from(centralStateWriteQueue.values())
            .some((queuedWrite) => Number(queuedWrite.networkRetryCount || 0) <= 1);
          queuedWriteRescheduleDelayMs = 1000;
          queueCentralStateStatus(result?.reason || "Sync failed.");
          reportSyncStatus(write.key, "issue", result?.reason || "Sync failed.");
          hadUnresolvedWrite = true;
          return;
        }
        if (
          typeof result.value === "string" &&
          !applyCentralSyncedStateValue(write, result.value)
        ) {
          const reason = "Central sync could not persist the local acknowledgement safely.";
          queueCentralStateStatus(reason);
          reportSyncStatus(write.key, "issue", reason);
          hadUnresolvedWrite = true;
          continue;
        }
        if (!isCentralStateWriteGenerationCurrent(write)) {
          continue;
        }
        persistCentralStateServerRevision(write.key, result, write.manifestGeneration);
        if (result?.merged && write.key === sessionPlannerStorageKey && getActiveWorkspaceId() === "session-planner") {
          showSessionPlannerToast("Central sync merged.", "warning");
        }
        const acknowledgedCurrentWrite = acknowledgeCentralStateWrite(write);
        if (acknowledgedCurrentWrite && !isSessionPlannerAutosaveKey(write.key)) {
          reportSyncStatus(write.key, "saved", "Saved");
        }
        acknowledgedSessionPlannerAutosave ||= acknowledgedCurrentWrite && isSessionPlannerAutosaveKey(write.key);
      }
      if (!hadExplicitPermissionDenial && !hadUnresolvedWrite && !centralStateWriteQueue.size) {
        queueCentralStateStatus("");
      }
      if (acknowledgedSessionPlannerAutosave && !hadExplicitPermissionDenial && !centralStateWriteQueue.size) {
        reportSyncStatus(sessionPlannerStorageKey, "saved", "Saved");
      }
    } finally {
      centralStateWriteFlushInFlight = false;
      const retryManifestAfterFlush = centralStateManifestRetryRequested;
      centralStateManifestRetryRequested = false;
      if (retryManifestAfterFlush && centralStateManifestReader) {
        retryCentral(centralStateManifestReader);
      }
      if (shouldRescheduleQueuedWrites && centralStateWriteQueue.size && !centralStateWriteTimer) {
        centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, queuedWriteRescheduleDelayMs);
      }
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
