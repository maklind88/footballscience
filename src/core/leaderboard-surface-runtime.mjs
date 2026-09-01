const leaderboardModuleId = "leaderboard";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function hasHomeHandleContract(handle) {
  return Boolean(
    handle
      && typeof handle.openDialog === "function"
      && typeof handle.openAward === "function"
      && typeof handle.getSnapshot === "function"
      && typeof handle.requestClose === "function"
      && typeof handle.unmount === "function"
  );
}

export function createLeaderboardSurfaceRuntime(deps = {}) {
  const {
    ui = {},
    win = globalThis,
    platformModuleLoader = {},
    getAssetVersion = () => Date.now(),
    getCurrentUser = () => null,
    getActivePlatformTeam = () => null,
    getPlatformTeamDisplayTeam = () => null,
    getPlatformTeamDisplayName = () => "",
    getPlatformTeamLogoUrl = () => "",
    getUserTeamId = () => "",
    getAuthToken = () => "",
    getPlayerProfilesState = () => ({}),
    canView = () => false,
    canEdit = () => false,
  } = deps;

  let modulePromise = null;
  let leaderboardModule = null;
  let homeHandle = null;
  let homeSummaryRoot = null;
  let activeScopeSignature = "";
  let mountGeneration = 0;
  let detachedSummaryRoot = null;

  function getTeamIdentity() {
    const currentUser = getCurrentUser() || {};
    const activeTeam = getActivePlatformTeam();
    const displayTeam = activeTeam || getPlatformTeamDisplayTeam(currentUser) || {};
    const name =
      displayTeam.name
      || getPlatformTeamDisplayName(currentUser)
      || currentUser.teamName
      || currentUser.team
      || "Team";
    const explicitTeamId = normalizeText(activeTeam?.id);
    const scopeTeamId = explicitTeamId || normalizeText(getUserTeamId(currentUser)) || "implicit-team";

    return Object.freeze({
      id: explicitTeamId,
      scopeId: scopeTeamId,
      name,
      shortName: normalizeText(displayTeam.shortName || currentUser.teamShortName || currentUser.team_short_name),
      logoUrl: getPlatformTeamLogoUrl(displayTeam),
    });
  }

  function getScopeSignature() {
    const currentUser = getCurrentUser() || {};
    const team = getTeamIdentity();
    const userId = normalizeText(currentUser.id || currentUser.userId || currentUser.user_id) || "anonymous-user";
    return `${team.scopeId}::${userId}`;
  }

  function getContext(overrides = {}) {
    const currentUser = getCurrentUser();
    const team = getTeamIdentity();
    return {
      win,
      currentUser,
      team: {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        logoUrl: team.logoUrl,
      },
      teamId: team.id,
      scopeKey: team.scopeId,
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      getTeamIdentity,
      getAuthToken,
      getPlayerProfilesState,
      canView,
      canEdit,
      ...overrides,
    };
  }

  function getDialogHost(override = null) {
    return override || ui.leaderboardDialogHost || null;
  }

  function getDetachedSummaryRoot() {
    if (!detachedSummaryRoot && typeof win?.document?.createElement === "function") {
      detachedSummaryRoot = win.document.createElement("div");
      detachedSummaryRoot.hidden = true;
    }
    return detachedSummaryRoot;
  }

  function renderLoading(root) {
    if (!root) return;
    root.hidden = false;
    root.innerHTML = `
      <section class="dashboard-leaderboard-loading" aria-busy="true" aria-label="Loading Leaderboard">
        <span></span><span></span><span></span>
      </section>
    `;
  }

  function renderLoadError(root) {
    if (!root) return;
    root.hidden = false;
    root.innerHTML = `
      <section class="dashboard-leaderboard-load-error" role="status">
        <strong>Leaderboard could not load</strong>
        <span>Refresh and try again.</span>
      </section>
    `;
  }

  function clearRoot(root) {
    if (!root) return;
    root.innerHTML = "";
    root.hidden = true;
  }

  function loadModule() {
    if (leaderboardModule) return Promise.resolve(leaderboardModule);
    if (!modulePromise) {
      modulePromise = Promise.all([
        platformModuleLoader.loadStylesheet(leaderboardModuleId, "src/modules/leaderboard/leaderboard.css", {
          id: "leaderboardStylesheet",
          required: true,
        }),
        platformModuleLoader.loadModule(leaderboardModuleId, () =>
          import(`../modules/leaderboard/leaderboard-home-surface.mjs?v=${encodeURIComponent(getAssetVersion())}`)
        ),
      ])
        .then(([, module]) => {
          leaderboardModule = module;
          return module;
        })
        .catch((error) => {
          modulePromise = null;
          throw error;
        });
    }
    return modulePromise;
  }

  function disposeMountedHome({ forceScopeChange = false } = {}) {
    mountGeneration += 1;
    if (!homeHandle) {
      clearRoot(homeSummaryRoot);
      homeSummaryRoot = null;
      return true;
    }
    const didUnmount = homeHandle.unmount(forceScopeChange ? { force: true } : undefined) !== false;
    if (!didUnmount && !forceScopeChange) return false;
    homeHandle = null;
    clearRoot(homeSummaryRoot);
    homeSummaryRoot = null;
    if (forceScopeChange) {
      const dialogHost = getDialogHost();
      if (dialogHost) dialogHost.innerHTML = "";
    }
    return true;
  }

  function syncScope() {
    const nextScopeSignature = getScopeSignature();
    if (activeScopeSignature && activeScopeSignature !== nextScopeSignature) {
      disposeMountedHome({ forceScopeChange: true });
    }
    activeScopeSignature = nextScopeSignature;
    return nextScopeSignature;
  }

  function mountHome(options = {}) {
    const summaryRoot = options.leaderboardSummary || options.root || null;
    const dialogHost = getDialogHost(options.leaderboardDialogHost);
    const scopeSignature = syncScope();

    if (!canView()) {
      disposeMountedHome();
      clearRoot(summaryRoot);
      return Promise.resolve(null);
    }
    if (!summaryRoot || !dialogHost) return Promise.resolve(null);
    if (homeHandle && homeSummaryRoot === summaryRoot && activeScopeSignature === scopeSignature) {
      return Promise.resolve(homeHandle);
    }
    if (homeHandle && !disposeMountedHome()) return Promise.resolve(homeHandle);

    homeSummaryRoot = summaryRoot;
    const generation = ++mountGeneration;
    renderLoading(summaryRoot);
    return loadModule()
      .then((module) => {
        if (generation !== mountGeneration || !canView()) return null;
        if (typeof module.mountLeaderboardHome !== "function") {
          throw new Error("Leaderboard is missing mountLeaderboardHome().");
        }
        const handle = module.mountLeaderboardHome(getContext({
          ui: {
            leaderboardSummary: summaryRoot,
            leaderboardDialogHost: dialogHost,
          },
        }));
        if (!hasHomeHandleContract(handle)) {
          throw new Error("Leaderboard returned an invalid Home mount handle.");
        }
        homeHandle = handle;
        return handle;
      })
      .catch(() => {
        if (generation === mountGeneration) renderLoadError(summaryRoot);
        return null;
      });
  }

  function unmountHome() {
    const scopeChanged = Boolean(activeScopeSignature && activeScopeSignature !== getScopeSignature());
    if (scopeChanged) {
      syncScope();
      return true;
    }
    return disposeMountedHome();
  }

  async function ensureCommandHandle() {
    syncScope();
    if (homeHandle) return homeHandle;
    const summaryRoot = homeSummaryRoot || getDetachedSummaryRoot();
    if (!summaryRoot) return null;
    return mountHome({
      leaderboardSummary: summaryRoot,
      leaderboardDialogHost: getDialogHost(),
    });
  }

  async function openDialog(opener = null) {
    syncScope();
    if (!canView()) return false;
    const handle = await ensureCommandHandle();
    if (!handle) return false;
    return (await handle.openDialog(opener)) !== false;
  }

  function getSnapshot() {
    syncScope();
    const team = getTeamIdentity();
    const fallback = {
      status: canView() ? "loading" : "unavailable",
      month: "",
      monthLabel: "",
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      requestError: "",
      standings: [],
    };
    if (!canView()) return fallback;
    if (typeof homeHandle?.getSnapshot !== "function") {
      void ensureCommandHandle();
      return fallback;
    }
    try {
      return homeHandle.getSnapshot() || fallback;
    } catch {
      return { ...fallback, status: "error", requestError: "Leaderboard could not load." };
    }
  }

  async function openAward(command = {}, opener = null) {
    syncScope();
    if (!canEdit()) return false;
    const handle = await ensureCommandHandle();
    if (!handle) return false;
    return (await handle.openAward({
      occurredOn: normalizeText(command.occurredOn),
      title: normalizeText(command.title),
    }, opener)) !== false;
  }

  function requestClose() {
    return homeHandle?.requestClose?.() !== false;
  }

  return Object.freeze({
    canEdit,
    canView,
    getContext,
    getSnapshot,
    getTeamIdentity,
    loadModule,
    mountHome,
    openAward,
    openDialog,
    requestClose,
    syncScope,
    unmountHome,
  });
}
