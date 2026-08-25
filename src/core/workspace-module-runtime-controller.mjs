import { createLeaderboardSurfaceRuntime } from "./leaderboard-surface-runtime.mjs";

export function createWorkspaceModuleRuntimeController(deps = {}) {
  const {
    ui = {},
    win = globalThis,
    platformModuleLoader = {},
    getAssetVersion = () => Date.now(),
    getUsers = () => [],
    getCurrentUser = () => null,
    formatUserName = null,
    getScheduleStateForGameplan = () => ({}),
    getScheduleStateForVideoAnalysis = getScheduleStateForGameplan,
    getPlayerProfilesStateForGameplan = () => ({}),
    getPlayerProfilesStateForVideoAnalysis = getPlayerProfilesStateForGameplan,
    getPlayerProfilesStateForIdp = getPlayerProfilesStateForVideoAnalysis,
    getPlayerProfilesStateForLeaderboard = getPlayerProfilesStateForVideoAnalysis,
    openPresentationMode = () => {},
    getExerciseLibraryForIdp = () => [],
    renderPlayerProfileScoutingSpider = () => "",
    canEditGameplan = () => false,
    canDeleteGameplan = () => false,
    canEditVideoAnalysis = () => false,
    canEditIdp = () => false,
    canViewLeaderboard = () => false,
    canEditLeaderboard = () => false,
    getAuthToken = () => "",
    getUserTeamId = () => "",
    getActivePlatformTeam = () => null,
    getPlatformTeamDisplayTeam = () => null,
    getPlatformTeamDisplayName = () => "",
    getPlatformTeamLogoUrl = () => "",
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
  let videoAnalysisModulePromise = null;
  let videoAnalysisModule = null;
  let idpModulePromise = null;
  let idpModule = null;
  let scoutingWorkspaceModulePromise = null;
  let scoutingWorkspaceModule = null;
  let scoutingMenuPreloadTimer = 0;
  const leaderboardRuntime = createLeaderboardSurfaceRuntime({
    ui,
    win,
    platformModuleLoader,
    getAssetVersion,
    getCurrentUser,
    getActivePlatformTeam,
    getPlatformTeamDisplayTeam,
    getPlatformTeamDisplayName,
    getPlatformTeamLogoUrl,
    getUserTeamId,
    getAuthToken,
    getPlayerProfilesState: getPlayerProfilesStateForLeaderboard,
    canView: canViewLeaderboard,
    canEdit: canEditLeaderboard,
  });

  function getGameplanContext() {
    return {
      win,
      users: getUsers(),
      currentUser: getCurrentUser(),
      getScheduleState: getScheduleStateForGameplan,
      getPlayerProfilesState: getPlayerProfilesStateForGameplan,
      openPresentationMode,
      canEdit: canEditGameplan,
      canDelete: canDeleteGameplan,
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
      platformModuleLoader.loadStylesheet("gameplan-command", "src/modules/gameplan/gameplan-command.css", {
        id: "gameplanCommandStylesheet",
        required: true,
      }),
      platformModuleLoader.loadModule("gameplan", () => import(`../../gameplan.js?v=${encodeURIComponent(getAssetVersion())}`)),
    ]).then(([, , module]) => {
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

  function getVideoAnalysisContext() {
    const currentUser = getCurrentUser();
    const teamNameFromUser = currentUser?.teamName || currentUser?.team || "";
    const displayTeam = getPlatformTeamDisplayTeam(currentUser);
    const displayTeamName = getPlatformTeamDisplayName(currentUser);
    const teamName = displayTeam?.name || displayTeamName || teamNameFromUser || "Team";
    const team = displayTeam || {
      name: teamName,
      shortName: currentUser?.teamShortName || currentUser?.team_short_name || "",
      logoUrl: currentUser?.teamLogoUrl || currentUser?.team_logo_url || currentUser?.teamLogo || "",
    };
    return {
      ui,
      win,
      currentUser,
      users: getUsers(),
      formatUserName,
      team,
      teamName,
      teamLogoUrl: getPlatformTeamLogoUrl(team),
      getAuthToken,
      getScheduleState: getScheduleStateForVideoAnalysis,
      getPlayerProfilesState: getPlayerProfilesStateForVideoAnalysis,
      canEdit: canEditVideoAnalysis,
    };
  }

  function getIdpContext() {
    const currentUser = getCurrentUser();
    const teamNameFromUser = currentUser?.teamName || currentUser?.team || "";
    const displayTeam = getPlatformTeamDisplayTeam(currentUser);
    const displayTeamName = getPlatformTeamDisplayName(currentUser);
    const teamName = displayTeam?.name || displayTeamName || teamNameFromUser || "Team";
    const team = displayTeam || {
      name: teamName,
      shortName: currentUser?.teamShortName || currentUser?.team_short_name || "",
      logoUrl: currentUser?.teamLogoUrl || currentUser?.team_logo_url || currentUser?.teamLogo || "",
    };
    return {
      ui,
      win,
      currentUser,
      users: getUsers(),
      formatUserName,
      team,
      teamName,
      teamLogoUrl: getPlatformTeamLogoUrl(team),
      getAuthToken,
      getPlayerProfilesState: getPlayerProfilesStateForIdp,
      getExerciseLibrary: getExerciseLibraryForIdp,
      renderPlayerProfileScoutingSpider,
      canEdit: canEditIdp,
    };
  }

  function loadVideoAnalysisModule() {
    if (videoAnalysisModule) {
      return Promise.resolve(videoAnalysisModule);
    }
    if (!videoAnalysisModulePromise) {
      videoAnalysisModulePromise = Promise.all([
        platformModuleLoader.loadStylesheet("video-analysis", "src/modules/video-analysis/video-analysis.css", {
          id: "videoAnalysisStylesheet",
          required: true,
        }),
        platformModuleLoader.loadModule("video-analysis", () =>
          import(`../modules/video-analysis/index.js?v=${encodeURIComponent(getAssetVersion())}`)
        ),
      ])
        .then(([, module]) => {
          videoAnalysisModule = module;
          return module;
        })
        .catch((error) => {
          videoAnalysisModulePromise = null;
          throw error;
        });
    }
    return videoAnalysisModulePromise;
  }

  function loadIdpModule() {
    if (idpModule) {
      return Promise.resolve(idpModule);
    }
    if (!idpModulePromise) {
      idpModulePromise = Promise.all([
        platformModuleLoader.loadStylesheet("idp", "src/modules/idp/idp.css", {
          id: "idpStylesheet",
          required: true,
        }),
        platformModuleLoader.loadModule("idp", () =>
          import(`../modules/idp/index.mjs?v=${encodeURIComponent(getAssetVersion())}`)
        ),
      ])
        .then(([, module]) => {
          idpModule = module;
          return module;
        })
        .catch((error) => {
          idpModulePromise = null;
          throw error;
        });
    }
    return idpModulePromise;
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
        platformModuleLoader.loadStylesheet("scouting-experience", "src/modules/scouting/scouting-experience.css", {
          id: "scoutingExperienceStylesheet",
          required: true,
        }),
        platformModuleLoader.loadStylesheet("scouting-experience-details", "src/modules/scouting/scouting-experience-details.css", {
          id: "scoutingExperienceDetailsStylesheet",
          required: true,
        }),
        platformModuleLoader.loadStylesheet("scouting-experience-responsive", "src/modules/scouting/scouting-experience-responsive.css", {
          id: "scoutingExperienceResponsiveStylesheet",
          required: true,
        }),
        platformModuleLoader.loadStylesheet("scouting-theme", "src/modules/scouting/scouting-theme.css", {
          id: "scoutingThemeStylesheet",
          required: true,
        }),
        platformModuleLoader.loadModule("scouting-workspace", () =>
          import(`../../scouting-workspace.js?v=${encodeURIComponent(getAssetVersion())}`)
        ),
      ])
        .then(([, , , , , module]) => {
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
    if (!videoAnalysisModule) {
      ui.analysisRoomWorkspace.innerHTML = `
      <section class="video-analysis-shell">
        <section class="video-analysis-player">
          <h2>Loading Analysis Room</h2>
          <p>Preparing the Analysis Room.</p>
        </section>
      </section>
    `;
      loadVideoAnalysisModule()
        .then((module) => module.render(getVideoAnalysisContext()))
        .catch(() => {
          ui.analysisRoomWorkspace.innerHTML = `
          <section class="video-analysis-shell">
            <section class="video-analysis-player">
              <h2>Analysis Room could not load</h2>
              <p>Refresh and try FS Player again.</p>
            </section>
          </section>
        `;
        });
      return;
    }
    videoAnalysisModule.render(getVideoAnalysisContext());
  }

  function renderIdpWorkspace() {
    if (!ui.idpWorkspace) {
      return;
    }
    if (!idpModule) {
      ui.idpWorkspace.innerHTML = `
      <section class="idp-shell">
        <section class="idp-loading-panel">
          <h2>Loading IDP</h2>
          <p>Preparing player development plans and evidence.</p>
        </section>
      </section>
    `;
      loadIdpModule()
        .then((module) => module.render(getIdpContext()))
        .catch(() => {
          ui.idpWorkspace.innerHTML = `
          <section class="idp-shell">
            <section class="idp-loading-panel">
              <h2>IDP could not load</h2>
              <p>Refresh and try Player Development again.</p>
            </section>
          </section>
        `;
        });
      return;
    }
    idpModule.render(getIdpContext());
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
    if (viewId === "idp") {
      hydrateState.idp?.();
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
    if (viewId === "analysis-room") {
      loadVideoAnalysisModule();
    }
    if (viewId === "idp") {
      loadIdpModule();
    }
    if (viewId === "scouting") {
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

  function getWorkspaceModuleEventHandlerName(eventType = "") {
    const type = String(eventType || "").trim();
    return type ? `handle${type[0].toUpperCase()}${type.slice(1)}` : "";
  }

  function bindWorkspaceModuleEvent(root, type, handler) {
    if (!root || typeof root.addEventListener !== "function") {
      return;
    }
    root.addEventListener(type, handler);
  }

  function bindWorkspaceModuleEvents() {
    ["click", "input", "change", "submit"].forEach((type) => {
      bindWorkspaceModuleEvent(ui.scoutingWorkspace, type, (event) => {
        scoutingWorkspaceModule?.[getWorkspaceModuleEventHandlerName(type)]?.(event, getScoutingWorkspaceContext());
      });
      bindWorkspaceModuleEvent(ui.gameplanWorkspace, type, (event) => {
        gameplanModule?.[getWorkspaceModuleEventHandlerName(type)]?.(event, getGameplanContext());
      });
      bindWorkspaceModuleEvent(ui.transferRoomWorkspace, type, (event) => {
        transferRoomRuntime?.workspaceModule?.[getWorkspaceModuleEventHandlerName(type)]?.(
          event,
          getTransferRoomWorkspaceContext()
        );
      });
      bindWorkspaceModuleEvent(ui.analysisRoomWorkspace, type, (event) => {
        videoAnalysisModule?.[getWorkspaceModuleEventHandlerName(type)]?.(event, getVideoAnalysisContext());
      });
      bindWorkspaceModuleEvent(ui.idpWorkspace, type, (event) => {
        idpModule?.[getWorkspaceModuleEventHandlerName(type)]?.(event, getIdpContext());
      });
    });
  }

  return Object.freeze({
    bindWorkspaceModuleEvents,
    canEditLeaderboard: leaderboardRuntime.canEdit,
    canViewLeaderboard: leaderboardRuntime.canView,
    getGameplanContext,
    getIdpContext,
    getScoutingAnalysisRoomContext,
    getScoutingWorkspaceContext,
    getVideoAnalysisContext,
    getTransferRoomWorkspaceContext,
    hydrateWorkspaceModuleState,
    loadGameplanModule,
    loadIdpModule,
    mountLeaderboardHome: leaderboardRuntime.mountHome,
    openLeaderboardAward: leaderboardRuntime.openAward,
    openLeaderboardDialog: leaderboardRuntime.openDialog,
    requestCloseLeaderboard: leaderboardRuntime.requestClose,
    loadScoutingWorkspaceModule,
    loadTransferRoomWorkspaceModule,
    loadVideoAnalysisModule,
    preloadWorkspaceFromTrigger,
    queueWorkspaceModulePreload,
    renderAnalysisRoomWorkspace,
    renderGameplanWorkspace,
    renderIdpWorkspace,
    unmountLeaderboardHome: leaderboardRuntime.unmountHome,
    renderScoutingWorkspace,
    renderTransferRoomWorkspace,
  });
}
