const noop = () => {};
const asyncNoop = async () => {};

function callAsync(fn, ...args) {
  try {
    const result = typeof fn === "function" ? fn(...args) : null;
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // Global lifecycle handlers should never block app boot.
  }
}

export function bindPlatformGlobalRuntimeEvents(deps = {}) {
  const documentRef = deps.documentRef;
  const win = deps.win;
  const ui = deps.ui || {};
  if (!documentRef || !win) return;

  const getHubState = typeof deps.getHubState === "function" ? deps.getHubState : () => null;
  const getCurrentPlatformUser = deps.getCurrentPlatformUser || (() => null);
  const getCentralStateBridge = deps.getCentralStateBridge || (() => null);
  const setMedicalPlayerModalOpen = deps.setMedicalPlayerModalOpen || noop;
  const setMedicalPlayerModalTab = deps.setMedicalPlayerModalTab || noop;
  const setPlayerProfilesState = deps.setPlayerProfilesState || noop;
  const setScoutingState = deps.setScoutingState || noop;
  const setTransferRoomState = deps.setTransferRoomState || noop;
  const setHubActiveWorkspaceId = deps.setHubActiveWorkspaceId || ((workspaceId) => {
    const hubState = getHubState();
    if (hubState) hubState.activeWorkspaceId = workspaceId;
  });
  const setTimeoutRef = typeof win.setTimeout === "function" ? win.setTimeout.bind(win) : setTimeout;

  deps.workspaceModuleRuntimeController?.bindWorkspaceModuleEvents?.();

  documentRef.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    if (key === "enter" && deps.isSimulatorIntroActive?.() && !deps.isEditableKeyboardTarget?.(event.target)) {
      event.preventDefault();
      deps.launchGameSimulatorFromIntro?.();
      return;
    }
    if (event.key === "Escape" && deps.isProfileMenuOpen?.()) {
      deps.setProfileMenuOpen?.(false);
      ui.profileMenuButton?.focus?.();
    }
    if (event.key === "Escape" && deps.getMedicalPlayerModalOpen?.()) {
      setMedicalPlayerModalOpen(false);
      setMedicalPlayerModalTab("availability");
      deps.renderMedicalTeamWorkspace?.();
    }
    if (event.key === "Escape" && deps.getPlayerProfileModalOpen?.()) {
      deps.closePlayerProfileModal?.();
    }
    if (event.key === "Escape" && deps.getPlayerProfileNewPlayerModalOpen?.()) {
      deps.closePlayerProfileNewPlayerModal?.();
    }
    if (event.key === "Escape" && deps.getPeriodizationOverlayState?.().open) {
      deps.setPeriodizationOverlayState?.({ open: false, mode: "view" });
      deps.renderPeriodizationWorkspace?.();
    }
    if (event.key === "Escape" && deps.hasActiveMetricTooltip?.()) {
      deps.hideMetricTooltip?.({ force: true });
    }
  });

  documentRef.querySelectorAll?.(".hub-rail-button").forEach((button) => {
    button.addEventListener("click", () => {
      deps.setActiveWorkspace?.(button.dataset.openWorkspace);
    });
  });

  win.addEventListener("blur", () => {
    deps.setProfileMenuOpen?.(false);
  });

  win.addEventListener("platform:user-change", () => {
    deps.syncPlatformUserFromAuth?.();
    deps.syncAccountMenu?.();
    deps.setProfileMenuOpen?.(false);
    if (getCurrentPlatformUser()) {
      deps.startDashboardPresenceRuntime?.();
    } else {
      deps.stopDashboardPresenceRuntime?.();
    }
    if (getCurrentPlatformUser() && getCentralStateBridge()?.isHydrated?.()) {
      deps.reloadCentralizedAppStateFromStorage?.();
      return;
    }
    const hubState = getHubState();
    if (hubState) {
      if (!getCurrentPlatformUser()) {
        setHubActiveWorkspaceId("home");
      }
      deps.renderWorkspaceChrome?.();
    }
    deps.scheduleDashboardLoginPopups?.();
  });

  win.addEventListener("footballscience:central-state-ready", () => {
    const dataSafetyRuntimeStatus = deps.getDataSafetyRuntimeStatus?.();
    if (dataSafetyRuntimeStatus) {
      dataSafetyRuntimeStatus.lastError = "";
    }
    deps.retryCentral?.();
    deps.flushCentralStateWrites?.();
    deps.startDashboardPresenceRuntime?.();
    callAsync(deps.refreshDashboardPresence || asyncNoop, { forceRender: true });
    deps.requestCentralizedAppStateReload?.();
    deps.refreshDataSafetyStatus?.();
  });

  documentRef.addEventListener("focusout", () => {
    setTimeoutRef(deps.flushDeferredCentralizedAppStateReload || noop, 180);
  }, true);
  documentRef.addEventListener("pointerup", () => {
    setTimeoutRef(deps.flushDeferredCentralizedAppStateReload || noop, 180);
  }, true);

  win.addEventListener("focus", () => {
    deps.applyPlatformThemeByTime?.();
    deps.markDashboardPresenceActivity?.();
    deps.startDashboardPresenceRuntime?.();
    callAsync(deps.pushDashboardPresence || asyncNoop, "online");
    callAsync(deps.refreshDashboardPresence || asyncNoop, { forceRender: true });
    deps.queueDashboardChatCurrentViewRefresh?.({ delayMs: 250 });
    deps.refreshCentralStateFromSource?.("focus");
    setTimeoutRef(deps.flushDeferredCentralizedAppStateReload || noop, 180);
  });
  win.addEventListener("blur", () => {
    callAsync(deps.pushDashboardPresence || asyncNoop, "away", { force: true });
  });

  documentRef.addEventListener("visibilitychange", () => {
    if (documentRef.visibilityState !== "visible") {
      callAsync(deps.pushDashboardPresence || asyncNoop, "away", { force: true });
      deps.pauseDashboardPresenceRuntime?.();
      deps.renderDashboardChatWidget?.();
      return;
    }
    deps.applyPlatformThemeByTime?.();
    deps.markDashboardPresenceActivity?.();
    deps.startDashboardPresenceRuntime?.();
    callAsync(deps.pushDashboardPresence || asyncNoop, "online");
    callAsync(deps.refreshDashboardPresence || asyncNoop, { forceRender: true });
    if (documentRef.visibilityState !== "visible") {
      return;
    }
    deps.queueDashboardChatCurrentViewRefresh?.({ delayMs: 250 });
    deps.refreshCentralStateFromSource?.("visibility");
    setTimeoutRef(deps.flushDeferredCentralizedAppStateReload || noop, 180);
  });

  ["pointerdown", "keydown", "mousemove", "touchstart"].forEach((eventName) => {
    documentRef.addEventListener(
      eventName,
      () => {
        deps.markDashboardPresenceActivity?.();
      },
      { passive: true }
    );
  });

  deps.centralAppStateReloadService?.startCentralStateRefreshTimer?.();
  win.addEventListener("storage", (event) => {
    if (deps.isDataSafetyProtectedStorageKey?.(event.key)) {
      deps.queueDataSafetyStatusRefresh?.();
      if (event.key === deps.sessionPlannerStorageKey) {
        deps.queueDataSafetySnapshot?.("cross-tab-update");
      }
    }
    if (event.key === deps.dashboardChatStorageKey) {
      deps.clearDashboardChatRuntimeMessages?.();
      deps.purgeDashboardDeletedMessagesFromStorage?.();
      deps.renderDashboardChatWidget?.();
      deps.syncDashboardChatWidgetNotificationCursor?.();
      deps.platformNavigationController?.renderTopIconMenu?.();
      return;
    }
    if (event.key === deps.dashboardChatDeletedMessageIdsStorageKey) {
      deps.purgeDashboardDeletedMessagesFromStorage?.();
      deps.renderDashboardChatWidget?.();
      deps.syncDashboardChatWidgetNotificationCursor?.();
      deps.platformNavigationController?.renderTopIconMenu?.();
      return;
    }
    const isDashboardRefreshKey =
      event.key === deps.dashboardTaskStorageKey ||
      event.key === deps.dashboardNotificationSeenStorageKey ||
      event.key === deps.playerProfilesStorageKey ||
      event.key === deps.scoutingStorageKey ||
      event.key === deps.transferRoomStorageKey;
    if (!isDashboardRefreshKey) return;

    const hubState = getHubState();
    if (event.key === deps.playerProfilesStorageKey) {
      setPlayerProfilesState(deps.readPlayerProfilesState?.());
      if (hubState?.activeWorkspaceId === "transfer-room") {
        deps.syncTransferRoomLinkedState?.({ render: true });
        return;
      }
      if (hubState?.activeWorkspaceId === "medical-team") {
        deps.renderMedicalTeamWorkspace?.();
        return;
      }
      if (hubState?.activeWorkspaceId === "player-profiles") {
        deps.renderPlayerProfilesWorkspace?.();
        return;
      }
    }
    if (event.key === deps.scoutingStorageKey && hubState?.activeWorkspaceId === "transfer-room") {
      setScoutingState(deps.readScoutingState?.());
      deps.syncTransferRoomLinkedState?.({ render: true });
      return;
    }
    if (event.key === deps.scoutingStorageKey && hubState?.activeWorkspaceId === "scouting") {
      const currentScoutingState = deps.getScoutingState?.();
      setScoutingState(deps.preserveScoutingTransientUiState?.(deps.readScoutingState?.(), currentScoutingState));
      if (deps.shouldDeferCentralizedAppStateReload?.()) {
        deps.setCentralizedAppStateReloadPending?.(true);
        return;
      }
      deps.renderScoutingWorkspace?.();
      return;
    }
    if (event.key === deps.transferRoomStorageKey && hubState?.activeWorkspaceId === "transfer-room") {
      setTransferRoomState(deps.readTransferRoomState?.());
      deps.renderTransferRoomWorkspace?.();
      return;
    }
    if (hubState?.activeWorkspaceId === "home") {
      deps.markDashboardHomeSeenForCurrentUser?.();
      deps.renderDashboardCards?.();
    }
    deps.platformNavigationController?.renderTopIconMenu?.();
  });

  win.addEventListener("pagehide", () => {
    callAsync(deps.pushDashboardPresence || asyncNoop, "away");
    if (deps.clearCentralStateWriteTimer?.()) {
      deps.flushCentralStateWrites?.();
    }
    deps.flushQueuedDataSafetySnapshot?.("pagehide");
  });

  documentRef.addEventListener("click", (event) => {
    if (!ui.profileMenu || !deps.isProfileMenuOpen?.()) {
      return;
    }
    if (event.target.closest(".platform-account-menu")) {
      return;
    }
    deps.setProfileMenuOpen?.(false);
  });

  deps.refreshDataSafetyStatus?.();
  deps.initializeWorkspaceHub?.();
  if (getCurrentPlatformUser() && getCentralStateBridge()?.isHydrated?.()) {
    deps.retryCentral?.();
    callAsync(deps.flushCentralStateWrites || asyncNoop);
    deps.requestCentralizedAppStateReload?.();
    deps.refreshDataSafetyStatus?.();
  }
  deps.startDashboardPresenceRuntime?.();
  if (getHubState()?.activeWorkspaceId === "game-simulator") {
    deps.queueGameSimulatorControllersLoad?.();
    deps.renderSimulator?.();
    deps.startSimulatorAnimationLoop?.();
  }
}
