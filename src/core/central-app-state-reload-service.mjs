import { hasActivePlatformOverlay, platformOverlayStabilityRootSelectors } from "./overlay-stability.mjs";
import { getSquadCentralReloadKey } from "../modules/squad/squad-central-reload-key.mjs";

export function createCentralAppStateReloadService(deps = {}) {
  const {
    activeRefreshMinMs = 30000,
    defaultActiveWorkspaceId = "home",
    documentRef = globalThis.document,
    intervalRefreshMinMs = 120000,
    overlayRootSelectors = platformOverlayStabilityRootSelectors,
    refreshIntervalMs = 120000,
    sessionPlannerLocalUiState = { state: {} },
    ui = {},
    win = globalThis,
  } = deps;

  let reloadPending = false;
  let refreshTimer = null;
  let lastRefreshAt = 0;
  let lastRefreshAttemptAt = 0;
  let refreshFailures = 0;
  let refreshRetryTimer = null;
  let refreshScope = "";
  let refreshInFlight = false;
  let lastSessionPlannerReloadKey = "";
  let lastSquadReloadKey = "";

  const call = (name, ...args) => deps[name]?.(...args);
  const getHubState = () => call("getHubState") || null;
  const setHubState = (nextState) => call("setHubState", nextState);
  const getSessionPlannerState = () => call("getSessionPlannerState") || null;
  const getRefreshScope = () => JSON.stringify([
    call("getCurrentPlatformUser") || null,
    call("getCentralStateBridge")?.getReadScope?.() || "",
  ]);
  const refreshNow = () => deps.getRefreshNow?.() ?? Date.now();
  const setTimeoutRef = win.setTimeout?.bind(win) || globalThis.setTimeout;
  const clearTimeoutRef = win.clearTimeout?.bind(win) || globalThis.clearTimeout;
  const retryDelay = () => Math.min(5000 * (2 ** Math.max(0, refreshFailures - 1)), 30000);

  function clearRefreshRetry() {
    if (refreshRetryTimer !== null) clearTimeoutRef(refreshRetryTimer);
    refreshRetryTimer = null;
  }

  function rememberSquadWorkspaceRender() {
    // A locally redrawn dialog must not acknowledge deferred server changes.
    if (reloadPending || getHubState()?.activeWorkspaceId !== "player-profiles") return;
    lastSquadReloadKey = getSquadCentralReloadKey({
      currentUser: call("getCurrentPlatformUser"),
      metadata: call("getCentralStateBridge")?.getStatus?.()?.metadata,
      now: deps.getNow?.(),
    });
  }

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
    if (!previousSelection.dateValue) {
      return nextState;
    }
    nextState.selectedDate = previousSelection.dateValue;
    const previousSession = nextState.sessions?.[previousSelection.dateValue];
    if (previousSession?.blocks?.some((block) => block.id === previousSelection.blockId)) {
      previousSession.selectedBlockId = previousSelection.blockId;
    }
    return nextState;
  }

  function reloadCentralizedAppStateFromStorage() {
    if (call("getCurrentPlatformUser") && getHubState()?.activeWorkspaceId === "session-planner") {
      call("syncSelectedSessionPlannerBlockFieldsFromDom");
    }
    const wasReloading = win.__footballScienceCentralReloading;
    win.__footballScienceCentralReloading = true;
    try {
      return applyCentralizedAppStateFromStorage();
    } finally {
      win.__footballScienceCentralReloading = wasReloading;
    }
  }

  function applyCentralizedAppStateFromStorage() {
    const currentUser = call("getCurrentPlatformUser");
    if (!currentUser) {
      lastSessionPlannerReloadKey = "";
      lastSquadReloadKey = "";
      return;
    }
    const previousSessionPlannerSelection = getCurrentSessionPlannerUiSelection();
    const previousWorkspaceId = getHubState()?.activeWorkspaceId || defaultActiveWorkspaceId;
    const metadata = call("getCentralStateBridge")?.getStatus?.()?.metadata;
    const sessionRevision = metadata?.["football-session-planner-v3"]?.revision;
    const reloadKey = previousWorkspaceId === "session-planner" && Number.isInteger(sessionRevision)
      ? JSON.stringify([currentUser, metadata, previousSessionPlannerSelection])
      : "";
    const squadReloadKey = previousWorkspaceId === "player-profiles"
      ? getSquadCentralReloadKey({ currentUser, metadata, now: deps.getNow?.() })
      : "";
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
    if (previousWorkspaceId === "set-pieces-room") call("reloadSetPiecesRoomFromStorage");
    call("syncGameSimulatorSavedSequencesFromStorage");
    call("queueSessionPlannerSnapshotRecovery");
    // Identical acknowledged revisions must not rebuild the coach's current view.
    const unchangedSession = reloadKey && reloadKey === lastSessionPlannerReloadKey;
    const unchangedSquad = squadReloadKey && squadReloadKey === lastSquadReloadKey;
    if (!unchangedSession && !unchangedSquad) call("renderWorkspaceChrome");
    lastSessionPlannerReloadKey = reloadKey;
    lastSquadReloadKey = squadReloadKey;
    call("scheduleDashboardLoginPopups");
  }

  function shouldDeferCentralizedAppStateReload() {
    const activeElement = documentRef.activeElement;
    if (call("isEditableKeyboardTarget", activeElement)) {
      return true;
    }
    if (hasActivePlatformOverlay({ document: documentRef, rootSelectors: overlayRootSelectors, win })) {
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
    const expectedScope = getRefreshScope();
    if (refreshScope !== expectedScope) {
      clearRefreshRetry();
      refreshScope = expectedScope;
      lastRefreshAt = 0;
      refreshFailures = 0;
    }
    const now = refreshNow();
    const minInterval = options.force ? 0 : refreshFailures ? retryDelay()
      : reason === "interval" ? intervalRefreshMinMs : activeRefreshMinMs;
    if (minInterval && now - (refreshFailures ? lastRefreshAttemptAt : lastRefreshAt) < minInterval) return;
    clearRefreshRetry();
    refreshInFlight = true;
    lastRefreshAttemptAt = now;
    const retryAfterHydrate = call("hasPendingCentralStateWrites");
    // A false result is a failed/partial read, not proof that pending writes
    // may be replayed. Only a successful read starts the normal throttle.
    return Promise.resolve().then(() => bridge.hydrate()).then((result) => {
      if (getRefreshScope() !== expectedScope) return;
      if (result === false) throw new Error("Central data could not be fully refreshed.");
      lastRefreshAt = refreshNow();
      refreshFailures = 0;
      if (retryAfterHydrate) call("retryCentral");
    }).catch((error) => {
      if (getRefreshScope() !== expectedScope) return;
      refreshFailures += 1;
      call("queueCentralStateStatus", error?.message || `${reason} failed.`);
      // Bounded automatic recovery; lifecycle events can retry after backoff.
      if (refreshFailures <= 3) {
        refreshRetryTimer = setTimeoutRef(() => {
          refreshRetryTimer = null;
          if (getRefreshScope() !== expectedScope) return;
          return refreshCentralStateFromSource("retry");
        }, retryDelay());
      }
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
    rememberSquadWorkspaceRender,
    reloadCentralizedAppStateFromStorage,
    requestCentralizedAppStateReload,
    setCentralizedAppStateReloadPending,
    shouldDeferCentralizedAppStateReload,
    startCentralStateRefreshTimer,
  };
}
