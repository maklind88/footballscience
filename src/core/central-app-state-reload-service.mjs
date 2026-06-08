export function createCentralAppStateReloadService(deps = {}) {
  const {
    activeRefreshMinMs = 30000,
    defaultActiveWorkspaceId = "home",
    documentRef = globalThis.document,
    intervalRefreshMinMs = 120000,
    refreshIntervalMs = 120000,
    sessionPlannerLocalUiState = { state: {} },
    ui = {},
    win = globalThis,
  } = deps;

  let reloadPending = false;
  let refreshTimer = null;
  let lastRefreshAt = 0;
  let refreshInFlight = false;

  const call = (name, ...args) => deps[name]?.(...args);
  const getHubState = () => call("getHubState") || null;
  const setHubState = (nextState) => call("setHubState", nextState);
  const getSessionPlannerState = () => call("getSessionPlannerState") || null;

  function getCurrentSessionPlannerUiSelection() {
    const sessionPlannerState = getSessionPlannerState();
    const dateValue = sessionPlannerState?.selectedDate || "";
    return {
      dateValue,
      blockId: dateValue ? sessionPlannerState?.sessions?.[dateValue]?.selectedBlockId || "" : "",
    };
  }

  function readSessionPlannerStatePreservingUiSelection(previousSelection = getCurrentSessionPlannerUiSelection()) {
    const nextState = call("readSessionPlannerState");
    if (getHubState()?.activeWorkspaceId !== "session-planner" || !previousSelection.dateValue) {
      return nextState;
    }
    const previousSession = nextState.sessions?.[previousSelection.dateValue];
    if (!previousSession) {
      return nextState;
    }
    nextState.selectedDate = previousSelection.dateValue;
    if (previousSession.blocks.some((block) => block.id === previousSelection.blockId)) {
      previousSession.selectedBlockId = previousSelection.blockId;
    }
    return nextState;
  }

  function reloadCentralizedAppStateFromStorage() {
    if (!call("getCurrentPlatformUser")) {
      return;
    }
    const previousSessionPlannerSelection = getCurrentSessionPlannerUiSelection();
    const previousWorkspaceId = getHubState()?.activeWorkspaceId || defaultActiveWorkspaceId;
    if (getHubState()?.activeWorkspaceId === "session-planner") {
      call("syncSelectedSessionPlannerBlockFieldsFromDom");
    }
    setHubState(call("repairWorkspaceState", {
      ...call("readWorkspaceHubState"),
      activeWorkspaceId: previousWorkspaceId,
    }));
    call("setPeriodizationState", call("readPeriodizationState"));
    call("setScheduleState", call("readScheduleState"));
    call("setMedicalState", call("readMedicalState"));
    call("setPlayerProfilesState", call("readPlayerProfilesState"));
    call("setScoutingState", call("readScoutingState"));
    call("setTransferRoomState", call("readTransferRoomState"));
    call("setSessionPlannerState", readSessionPlannerStatePreservingUiSelection(previousSessionPlannerSelection));
    call("setSessionPlannerExerciseLibrary", call("readSessionPlannerExerciseLibrary"));
    call("syncGameSimulatorSavedSequencesFromStorage");
    call("queueSessionPlannerSnapshotRecovery");
    call("renderWorkspaceChrome");
    call("scheduleDashboardLoginPopups");
  }

  function shouldDeferCentralizedAppStateReload() {
    const activeElement = documentRef.activeElement;
    if (call("isEditableKeyboardTarget", activeElement)) {
      return true;
    }
    if (getHubState()?.activeWorkspaceId === "scouting") {
      const scoutingRoot = ui.scoutingWorkspace;
      if (
        scoutingRoot?.querySelector(
          ".scouting-profile-backdrop,[data-scouting-role-model-overlay],[data-scouting-report-builder-overlay],[data-scouting-saved-views-overlay],[data-scouting-settings-overlay],details[open],[data-scouting-active-content] .is-dragging"
        )
      ) {
        return true;
      }
    }
    const localState = sessionPlannerLocalUiState.state || {};
    return Boolean(
      localState.sessionPlannerLibraryOpen ||
      localState.sessionPlannerPendingLibrarySave ||
      localState.sessionPlannerVisualPreviewOpen ||
      localState.sessionPlannerPrintOverlayOpen ||
      localState.sessionPlannerTacticalboardOpen ||
      localState.sessionPlannerPlayerBoardOpen ||
      localState.sessionPlannerPlayerBoardSelectedPlayerId ||
      localState.sessionPlannerTacticalDragState ||
      localState.sessionPlannerTacticalSelectionState ||
      localState.sessionPlannerPlayerBoardSelectionState ||
      localState.sessionPlannerPlayerBoardDragState
    );
  }

  function setCentralizedAppStateReloadPending(isPending = true) {
    reloadPending = Boolean(isPending);
  }

  function requestCentralizedAppStateReload() {
    if (!call("getCurrentPlatformUser")) {
      return;
    }
    if (shouldDeferCentralizedAppStateReload()) {
      reloadPending = true;
      return;
    }
    reloadPending = false;
    reloadCentralizedAppStateFromStorage();
  }

  function flushDeferredCentralizedAppStateReload() {
    if (!reloadPending || shouldDeferCentralizedAppStateReload()) {
      return;
    }
    requestCentralizedAppStateReload();
  }

  function refreshCentralStateFromSource(reason = "refresh", options = {}) {
    const bridge = call("getCentralStateBridge");
    if (documentRef.visibilityState === "hidden" || refreshInFlight || !call("getCurrentPlatformUser") || !bridge?.hydrate) return;
    if (reason === "interval" && !documentRef.hasFocus()) return;
    const now = Date.now();
    const minInterval = options.force ? 0 : reason === "interval" ? intervalRefreshMinMs : activeRefreshMinMs;
    if (minInterval && now - lastRefreshAt < minInterval) return;
    refreshInFlight = true;
    lastRefreshAt = now;
    const retryAfterHydrate = call("hasPendingCentralStateWrites");
    bridge.hydrate().then(() => {
      if (retryAfterHydrate) call("retryCentral");
    }).catch((error) => {
      call("queueCentralStateStatus", error?.message || `${reason} failed.`);
    }).finally(() => {
      refreshInFlight = false;
    });
  }

  function startCentralStateRefreshTimer() {
    if (refreshTimer) {
      return refreshTimer;
    }
    refreshTimer = win.setInterval(() => {
      refreshCentralStateFromSource("interval");
    }, refreshIntervalMs);
    return refreshTimer;
  }

  return {
    flushDeferredCentralizedAppStateReload,
    getCurrentSessionPlannerUiSelection,
    isCentralizedAppStateReloadPending: () => reloadPending,
    readSessionPlannerStatePreservingUiSelection,
    refreshCentralStateFromSource,
    reloadCentralizedAppStateFromStorage,
    requestCentralizedAppStateReload,
    setCentralizedAppStateReloadPending,
    shouldDeferCentralizedAppStateReload,
    startCentralStateRefreshTimer,
  };
}
