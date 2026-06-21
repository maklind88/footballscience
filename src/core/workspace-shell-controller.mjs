export function createWorkspaceShellController(deps = {}) {
  const {
    applyUserAvatar = () => {},
    closeDashboardModal = () => {},
    defaultHubState = { workspaces: [] },
    documentRef = globalThis.document,
    formatUserName = () => "",
    getAccessibleWorkspacePool = () => [],
    getDashboardDateLabel = () => "",
    getHubState = () => null,
    getSafeWorkspaceId = (workspaceId) => workspaceId,
    getFirstAccessibleWorkspaceId = () => "home",
    getUi = () => ({}),
    getWorkspaceById = () => null,
    getWorkspaceIdFromUrl = () => "",
    getWorkspaceViewId = (workspaceId) => workspaceId,
    hydrateWorkspaceModuleState = () => {},
    markDashboardHomeSeenForCurrentUser = () => {},
    onLeavePlayerProfiles = () => {},
    pauseSimulatorForWorkspaceSwitch = () => {},
    platformNavigationController = {},
    queueCriticalWorkspacePreloads = () => {},
    queueDashboardChatStylesheetLoad = () => {},
    queueWorkspaceModulePreload = () => {},
    readRememberedWorkspaceId = () => "",
    readWorkspaceHubState = () => null,
    rememberActiveWorkspaceId = () => {},
    renderDashboardCards = () => {},
    renderDashboardChatWidget = () => {},
    renderWorkspaceByViewId = () => {},
    repairWorkspaceState = (state) => state,
    resetGameSimulatorIntro = () => {},
    scheduleDashboardLoginPopups = () => {},
    setHubState = () => {},
    simulatorRender = () => {},
    startPlatformThemeScheduler = () => {},
    startSimulatorAnimationLoop = () => {},
    stopSimulatorAnimationLoop = () => {},
    syncAccountMenu = () => {},
    syncDashboardChatWidgetNotificationCursor = () => {},
    syncGameSimulatorIntroState = () => {},
    syncPlatformAutosaveStatusVisibility = () => {},
    syncPlatformUserFromAuth = () => null,
    win = globalThis,
    workspaceHubDefaultActiveWorkspaceId = "home",
    writeWorkspaceHubState = () => {},
  } = deps;
  let workspaceHistoryBound = false;

  function createWorkspaceHistoryUrl(workspaceId) {
    const safeWorkspaceId = String(workspaceId || "").trim();
    if (!safeWorkspaceId || !win?.location?.href) return "";
    try {
      const nextUrl = new URL(win.location.href);
      nextUrl.searchParams.set("workspace", safeWorkspaceId);
      nextUrl.searchParams.delete("space");
      return nextUrl.toString();
    } catch {
      return "";
    }
  }

  function createWorkspaceHistoryState(workspaceId) {
    return {
      ...(win?.history?.state && typeof win.history.state === "object" ? win.history.state : {}),
      footballScienceWorkspaceId: String(workspaceId || "").trim(),
    };
  }

  function replaceWorkspaceHistory(workspaceId) {
    const nextUrl = createWorkspaceHistoryUrl(workspaceId);
    if (!nextUrl || !win?.history?.replaceState) return;
    try {
      win.history.replaceState(createWorkspaceHistoryState(workspaceId), "", nextUrl);
    } catch {}
  }

  function pushWorkspaceHistory(workspaceId) {
    const nextUrl = createWorkspaceHistoryUrl(workspaceId);
    if (!nextUrl || !win?.history?.pushState) return;
    try {
      win.history.pushState(createWorkspaceHistoryState(workspaceId), "", nextUrl);
    } catch {}
  }

  function bindWorkspaceHistoryNavigation() {
    if (workspaceHistoryBound || !win?.addEventListener) return;
    workspaceHistoryBound = true;
    win.addEventListener("popstate", (event) => {
      const stateWorkspaceId = String(event?.state?.footballScienceWorkspaceId || "").trim();
      const nextWorkspaceId = getSafeWorkspaceId(stateWorkspaceId || getWorkspaceIdFromUrl()) || getHubState()?.activeWorkspaceId;
      if (!nextWorkspaceId) return;
      setActiveWorkspace(nextWorkspaceId, { skipHistory: true });
    });
  }

  function renderWorkspaceChrome() {
    let hubState = getHubState();
    if (!hubState) return;
    const ui = getUi();
    const currentUser = syncPlatformUserFromAuth();
    hubState = repairWorkspaceState(hubState);
    setHubState(hubState);
    const workspacePool =
      Array.isArray(hubState.workspaces) && hubState.workspaces.length
        ? hubState.workspaces
        : defaultHubState.workspaces;
    const accessibleWorkspacePool = getAccessibleWorkspacePool();
    const activeWorkspace =
      getWorkspaceById(hubState.activeWorkspaceId) ??
      accessibleWorkspacePool[0] ??
      workspacePool[0];
    if (activeWorkspace && hubState.activeWorkspaceId !== activeWorkspace.id) {
      hubState.activeWorkspaceId = activeWorkspace.id;
    }
    const activeViewId = getWorkspaceViewId(activeWorkspace.id);
    hydrateWorkspaceModuleState(activeWorkspace.id);
    syncPlatformAutosaveStatusVisibility(activeWorkspace.id);
    documentRef.body.dataset.appReady = "true";
    documentRef.body.dataset.activeWorkspace = activeWorkspace.id;
    documentRef.body.dataset.userRole = String(currentUser?.role || "guest").trim().toLowerCase() || "guest";
    ui.hubShell?.classList.toggle("is-sidebar-collapsed", hubState.sidebarCollapsed);
    if (ui.workspaceTitle) ui.workspaceTitle.textContent = activeWorkspace.title || "Football Science";
    if (ui.workspaceMeta) ui.workspaceMeta.textContent = "";
    if (ui.workspaceStatus) ui.workspaceStatus.textContent = activeWorkspace.status;
    if (ui.coachName) ui.coachName.textContent = currentUser ? formatUserName(currentUser) : hubState.profile.name;
    if (ui.coachRole) ui.coachRole.textContent = currentUser?.title ?? hubState.profile.role;
    applyUserAvatar(ui.coachAvatar, currentUser);
    ui.profileMenuButton?.classList.toggle("is-active", activeWorkspace.id === "my-profile");
    syncAccountMenu(currentUser);
    if (ui.dashboardDate) ui.dashboardDate.textContent = getDashboardDateLabel();
    if (ui.dashboardGreeting) {
      ui.dashboardGreeting.textContent = `Welcome back, ${currentUser?.firstName ?? hubState.profile.shortName}.`;
    }
    if (activeWorkspace.id === "home") {
      markDashboardHomeSeenForCurrentUser();
    } else {
      closeDashboardModal(false);
    }
    platformNavigationController.renderWorkspaceList?.();
    platformNavigationController.renderTopIconMenu?.();
    platformNavigationController.renderWorkspaceQuickSwitch?.(activeWorkspace.id);
    if (activeWorkspace.id === "home") renderDashboardCards();
    renderDashboardChatWidget();
    syncDashboardChatWidgetNotificationCursor();
    documentRef
      .querySelectorAll(".workspace-view")
      .forEach((view) => view.classList.toggle("is-active", view.dataset.workspaceView === activeViewId));
    documentRef
      .querySelectorAll("[data-open-workspace]")
      .forEach((trigger) => trigger.classList.toggle("is-active", trigger.dataset.openWorkspace === activeWorkspace.id));
    if (activeViewId === "placeholder") {
      platformNavigationController.renderPlaceholderWorkspace?.();
    } else {
      renderWorkspaceByViewId(activeViewId);
    }
    stopSimulatorAnimationLoop();
  }

  function setActiveWorkspace(workspaceId, options = {}) {
    const resolvedWorkspaceId = getSafeWorkspaceId(workspaceId) || getFirstAccessibleWorkspaceId(getHubState());
    const workspace = getWorkspaceById(resolvedWorkspaceId);
    if (!workspace) return;
    const hubState = getHubState();
    const previousWorkspaceId = hubState?.activeWorkspaceId;
    const targetWorkspaceId = workspace.id;
    const scrollStability = win?.footballScienceOverlayStability;
    scrollStability?.captureWorkspace?.(previousWorkspaceId);
    scrollStability?.prepareWorkspaceRestore?.(targetWorkspaceId);
    if (previousWorkspaceId === "game-simulator" && targetWorkspaceId !== "game-simulator") {
      pauseSimulatorForWorkspaceSwitch();
      stopSimulatorAnimationLoop();
    }
    if (previousWorkspaceId === "player-profiles" && targetWorkspaceId !== "player-profiles") {
      onLeavePlayerProfiles();
    }
    const targetViewId = getWorkspaceViewId(targetWorkspaceId);
    if (targetViewId && targetViewId !== "scouting") {
      queueWorkspaceModulePreload(targetWorkspaceId);
    }
    hubState.activeWorkspaceId = targetWorkspaceId;
    rememberActiveWorkspaceId(targetWorkspaceId);
    writeWorkspaceHubState();
    if (!options.skipHistory && previousWorkspaceId !== targetWorkspaceId) {
      pushWorkspaceHistory(targetWorkspaceId);
    }
    renderWorkspaceChrome();
    scrollStability?.restoreWorkspace?.(targetWorkspaceId);
  }

  function initializeWorkspaceHub() {
    startPlatformThemeScheduler();
    syncPlatformUserFromAuth();
    const nextHubState = repairWorkspaceState(readWorkspaceHubState());
    setHubState(nextHubState);
    const urlWorkspaceId = getWorkspaceIdFromUrl();
    const safeUrlWorkspaceId = getSafeWorkspaceId(urlWorkspaceId, nextHubState);
    const pendingWorkspaceId = win.__pendingWorkspaceId;
    const safePendingWorkspaceId = getSafeWorkspaceId(pendingWorkspaceId, nextHubState);
    const rememberedWorkspaceId = readRememberedWorkspaceId();
    const safeRememberedWorkspaceId = getSafeWorkspaceId(rememberedWorkspaceId, nextHubState);
    const safeHomeWorkspaceId = getSafeWorkspaceId(workspaceHubDefaultActiveWorkspaceId, nextHubState);
    const fallbackWorkspaceId = getFirstAccessibleWorkspaceId(nextHubState);
    if (safePendingWorkspaceId) {
      nextHubState.activeWorkspaceId = safePendingWorkspaceId;
    } else if (safeUrlWorkspaceId) {
      nextHubState.activeWorkspaceId = safeUrlWorkspaceId;
    } else if (safeRememberedWorkspaceId) {
      nextHubState.activeWorkspaceId = safeRememberedWorkspaceId;
    } else if (safeHomeWorkspaceId) {
      nextHubState.activeWorkspaceId = safeHomeWorkspaceId;
    } else {
      nextHubState.activeWorkspaceId = fallbackWorkspaceId;
    }
    nextHubState.activeWorkspaceId = getSafeWorkspaceId(nextHubState.activeWorkspaceId, nextHubState) || fallbackWorkspaceId;
    rememberActiveWorkspaceId(nextHubState.activeWorkspaceId);
    win.__pendingWorkspaceId = null;
    hydrateWorkspaceModuleState(nextHubState.activeWorkspaceId);
    writeWorkspaceHubState();
    bindWorkspaceHistoryNavigation();
    replaceWorkspaceHistory(nextHubState.activeWorkspaceId);
    win?.footballScienceOverlayStability?.prepareWorkspaceRestore?.(nextHubState.activeWorkspaceId);
    renderWorkspaceChrome();
    win?.footballScienceOverlayStability?.restoreWorkspace?.(nextHubState.activeWorkspaceId);
    queueDashboardChatStylesheetLoad();
    queueCriticalWorkspacePreloads();
    scheduleDashboardLoginPopups();
  }

  return {
    initializeWorkspaceHub,
    renderWorkspaceChrome,
    setActiveWorkspace,
  };
}
