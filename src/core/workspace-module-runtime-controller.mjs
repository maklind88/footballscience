export function createWorkspaceModuleRuntimeController(deps = {}) {
  const {
    ui = {},
    win = globalThis,
    platformModuleLoader = {},
    getAssetVersion = () => Date.now(),
    getUsers = () => [],
    getCurrentUser = () => null,
    getScheduleStateForGameplan = () => ({}),
    getPlayerProfilesStateForGameplan = () => ({}),
    canEditGameplan = () => false,
    getAuthToken = () => "",
    suppressCentralWrites = () => {},
    unsuppressCentralWrites = () => {},
    escapeHtml = (value) => String(value ?? ""),
    getScoutingTeamName = () => "",
    ensureScoutingState = () => ({}),
    writeScoutingState = () => {},
    canEditScouting = () => false,
    canSendToTransferRoom = () => false,
    sendToTransferRoom = () => {},
    scoutingTabs = [],
    scoutingShadowSlots = [],
    scoutingCoreMetricOptions = [],
    scoutingStatusOptions = [],
    scoutingPriorityOptions = [],
    transferRoomRuntime = null,
    getWorkspaceViewId = (workspaceId) => workspaceId,
    getSafeWorkspaceId = (workspaceId) => workspaceId,
    getHubState = () => null,
    workspaceHubDefaultActiveWorkspaceId = "home",
    hydrateState = {},
    shouldDeferCentralizedAppStateReload = () => false,
  } = deps;

  let gameplanModule = null;
  let scoutingWorkspaceModulePromise = null;
  let scoutingWorkspaceModule = null;
  let scoutingMenuPreloadTimer = 0;

  function getGameplanContext() {
    return {
      users: getUsers(),
      currentUser: getCurrentUser(),
      getScheduleState: getScheduleStateForGameplan,
      getPlayerProfilesState: getPlayerProfilesStateForGameplan,
      canEdit: canEditGameplan,
      getAuthToken,
      suppressCentralWrites,
      unsuppressCentralWrites,
    };
  }

  function loadGameplanModule() {
    if (gameplanModule) {
      return Promise.resolve(gameplanModule);
    }
    return Promise.all([
      platformModuleLoader.loadStylesheet("gameplan", "gameplan.css", {
        id: "gameplanStylesheet",
        required: true,
      }),
      platformModuleLoader.loadModule("gameplan", () => import(`../../gameplan.js?v=${encodeURIComponent(getAssetVersion())}`)),
    ]).then(([, module]) => {
      gameplanModule = module;
      return module;
    });
  }

  function renderGameplanWorkspace() {
    if (!ui.gameplanWorkspace) {
      return;
    }
    if (!gameplanModule) {
      ui.gameplanWorkspace.textContent = "Loading Gameplan";
      loadGameplanModule()
        .then((module) => module.render(getGameplanContext()))
        .catch(() => {
          ui.gameplanWorkspace.textContent = "Gameplan could not load";
        });
      return;
    }
    gameplanModule.render(getGameplanContext());
  }

  function getScoutingWorkspaceContext() {
    return {
      ui,
      platformModuleLoader,
      escapeHtml,
      teamName: getScoutingTeamName(),
      ensureState: ensureScoutingState,
      writeState: writeScoutingState,
      canEdit: canEditScouting,
      canSendToTransferRoom,
      sendToTransferRoom,
      tabs: scoutingTabs,
      shadowSlots: scoutingShadowSlots,
      coreMetricOptions: scoutingCoreMetricOptions,
      scoutingStatusOptions,
      scoutingPriorityOptions,
    };
  }

  function getScoutingAnalysisRoomContext() {
    const context = getScoutingWorkspaceContext();
    return {
      ...context,
      ui: {
        ...context.ui,
        scoutingWorkspace: ui.analysisRoomWorkspace,
      },
    };
  }

  function loadScoutingWorkspaceModule() {
    if (scoutingWorkspaceModule) {
      return Promise.resolve(scoutingWorkspaceModule);
    }
    if (!scoutingWorkspaceModulePromise) {
      scoutingWorkspaceModulePromise = Promise.all([
        platformModuleLoader.loadStylesheet("scouting-workspace", "scouting-workspace.css", {
          id: "scoutingWorkspaceStylesheet",
          required: true,
        }),
        platformModuleLoader.loadModule("scouting-workspace", () =>
          import(`../../scouting-workspace.js?v=${encodeURIComponent(getAssetVersion())}`)
        ),
      ])
        .then(([, module]) => {
          scoutingWorkspaceModule = module;
          return module;
        })
        .catch((error) => {
          scoutingWorkspaceModulePromise = null;
          throw error;
        });
    }
    return scoutingWorkspaceModulePromise;
  }

  function loadScoutingWorkspaceModuleAfterPaint() {
    return new Promise((resolve, reject) => {
      const scheduleLoad = () => {
        loadScoutingWorkspaceModule().then(resolve).catch(reject);
      };
      if (typeof win.requestAnimationFrame === "function") {
        win.requestAnimationFrame(() => win.requestAnimationFrame(scheduleLoad));
        return;
      }
      win.setTimeout(scheduleLoad, 0);
    });
  }

  function renderScoutingWorkspace() {
    if (!ui.scoutingWorkspace) {
      return;
    }
    if (!scoutingWorkspaceModule) {
      ui.scoutingWorkspace.innerHTML = `
      <section class="scouting-shell">
        <section class="scouting-load-panel">
          <h2>Loading Scouting</h2>
          <p>Preparing the Shadow XI workspace and scouting database.</p>
        </section>
      </section>
    `;
      loadScoutingWorkspaceModuleAfterPaint()
        .then((module) => module.render(getScoutingWorkspaceContext()))
        .catch(() => {
          ui.scoutingWorkspace.innerHTML = `
          <section class="scouting-shell">
            <section class="scouting-load-panel">
              <h2>Scouting could not load</h2>
              <p>Refresh and try again.</p>
            </section>
          </section>
        `;
        });
      return;
    }
    scoutingWorkspaceModule.render(getScoutingWorkspaceContext());
  }

  function renderAnalysisRoomWorkspace() {
    if (!ui.analysisRoomWorkspace) {
      return;
    }
    if (!scoutingWorkspaceModule) {
      ui.analysisRoomWorkspace.innerHTML = `
      <section class="scouting-shell">
        <section class="scouting-load-panel">
          <h2>Loading Analysis Room</h2>
          <p>Preparing the own-team performance room.</p>
        </section>
      </section>
    `;
      loadScoutingWorkspaceModule()
        .then((module) => module.renderAnalysisRoom(getScoutingAnalysisRoomContext()))
        .catch(() => {
          ui.analysisRoomWorkspace.innerHTML = `
          <section class="scouting-shell">
            <section class="scouting-load-panel">
              <h2>Analysis Room could not load</h2>
              <p>Refresh and try again.</p>
            </section>
          </section>
        `;
        });
      return;
    }
    scoutingWorkspaceModule.renderAnalysisRoom(getScoutingAnalysisRoomContext());
  }

  function getTransferRoomWorkspaceContext() { return transferRoomRuntime?.getContext?.(); }
  function loadTransferRoomWorkspaceModule() { return transferRoomRuntime?.loadWorkspaceModule?.(); }
  function renderTransferRoomWorkspace() { return transferRoomRuntime?.render?.(); }

  function hydrateWorkspaceModuleState(workspaceId = getHubState()?.activeWorkspaceId) {
    const viewId = getWorkspaceViewId(workspaceId || workspaceHubDefaultActiveWorkspaceId);
    if (viewId === "schedule") {
      hydrateState.schedule?.();
      return;
    }
    if (viewId === "periodization") {
      hydrateState.periodization?.();
      return;
    }
    if (viewId === "session-planner") {
      hydrateState.sessionPlanner?.();
      return;
    }
    if (viewId === "medical-team") {
      hydrateState.medical?.();
      return;
    }
    if (viewId === "player-profiles") {
      hydrateState.playerProfiles?.();
      return;
    }
    if (viewId === "scouting") {
      ensureScoutingState();
      return;
    }
    if (viewId === "transfer-room") {
      hydrateState.transferRoom?.();
    }
  }

  function queueWorkspaceModulePreload(workspaceId = "") {
    const safeWorkspaceId = getSafeWorkspaceId(workspaceId, getHubState()) || workspaceId;
    const viewId = getWorkspaceViewId(safeWorkspaceId || workspaceHubDefaultActiveWorkspaceId);
    if (viewId === "game-simulator") {
      hydrateState.gameSimulator?.();
    }
    if (viewId === "analysis-room" || viewId === "scouting") {
      loadScoutingWorkspaceModule();
    }
    if (viewId === "transfer-room") {
      loadTransferRoomWorkspaceModule();
    }
  }

  function preloadWorkspaceFromTrigger(trigger) {
    const workspaceId = trigger?.dataset?.openWorkspace || "";
    if (!workspaceId) {
      return;
    }
    if (getWorkspaceViewId(getSafeWorkspaceId(workspaceId, getHubState()) || workspaceId) === "scouting") {
      win.clearTimeout(scoutingMenuPreloadTimer);
      scoutingMenuPreloadTimer = win.setTimeout(() => queueWorkspaceModulePreload(workspaceId), 180);
      return;
    }
    queueWorkspaceModulePreload(workspaceId);
  }

  return Object.freeze({
    getGameplanContext,
    getScoutingAnalysisRoomContext,
    getScoutingWorkspaceContext,
    getTransferRoomWorkspaceContext,
    hydrateWorkspaceModuleState,
    loadGameplanModule,
    loadScoutingWorkspaceModule,
    loadTransferRoomWorkspaceModule,
    preloadWorkspaceFromTrigger,
    queueWorkspaceModulePreload,
    renderAnalysisRoomWorkspace,
    renderGameplanWorkspace,
    renderScoutingWorkspace,
    renderTransferRoomWorkspace,
  });
}
