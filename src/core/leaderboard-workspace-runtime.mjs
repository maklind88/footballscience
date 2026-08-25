const delegatedEventTypes = Object.freeze(["click", "input", "change", "submit"]);

function getEventHandlerName(eventType = "") {
  const type = String(eventType || "").trim();
  return type ? `handle${type[0].toUpperCase()}${type.slice(1)}` : "";
}

export function createLeaderboardWorkspaceRuntime(deps = {}) {
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
    canEdit = () => false,
  } = deps;

  let modulePromise = null;
  let workspaceModule = null;

  function getTeamIdentity() {
    const currentUser = getCurrentUser() || {};
    const activeTeam = getActivePlatformTeam();
    const displayTeam = activeTeam || getPlatformTeamDisplayTeam(currentUser);
    const teamName =
      displayTeam?.name ||
      getPlatformTeamDisplayName(currentUser) ||
      currentUser.teamName ||
      currentUser.team ||
      "Team";
    const team = displayTeam || {
      id: getUserTeamId(currentUser) || "",
      name: teamName,
      shortName: currentUser.teamShortName || currentUser.team_short_name || "",
      logoUrl: currentUser.teamLogoUrl || currentUser.team_logo_url || currentUser.teamLogo || "",
    };

    return Object.freeze({
      id: activeTeam?.id || "",
      name: teamName,
      shortName: team.shortName || "",
      logoUrl: getPlatformTeamLogoUrl(team),
    });
  }

  function getContext() {
    const currentUser = getCurrentUser();
    const team = getTeamIdentity();
    return {
      ui,
      win,
      currentUser,
      team,
      teamId: team.id,
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      getTeamIdentity,
      getAuthToken,
      canEdit,
    };
  }

  function loadModule() {
    if (workspaceModule) {
      return Promise.resolve(workspaceModule);
    }
    if (!modulePromise) {
      modulePromise = Promise.all([
        platformModuleLoader.loadStylesheet("leaderboard", "src/modules/leaderboard/leaderboard.css", {
          id: "leaderboardStylesheet",
          required: true,
        }),
        platformModuleLoader.loadModule("leaderboard", () =>
          import(`../modules/leaderboard/index.mjs?v=${encodeURIComponent(getAssetVersion())}`)
        ),
      ])
        .then(([, module]) => {
          workspaceModule = module;
          return module;
        })
        .catch((error) => {
          modulePromise = null;
          throw error;
        });
    }
    return modulePromise;
  }

  function render() {
    const root = ui.leaderboardWorkspace;
    if (!root) {
      return;
    }
    if (!workspaceModule) {
      root.innerHTML = `
        <section class="leaderboard-shell">
          <section class="leaderboard-loading-panel">
            <h2>Loading Leaderboard</h2>
            <p>Preparing the monthly team competition.</p>
          </section>
        </section>
      `;
      loadModule()
        .then((module) => module.render(getContext()))
        .catch(() => {
          root.innerHTML = `
            <section class="leaderboard-shell">
              <section class="leaderboard-loading-panel">
                <h2>Leaderboard could not load</h2>
                <p>Refresh and try again.</p>
              </section>
            </section>
          `;
        });
      return;
    }
    workspaceModule.render(getContext());
  }

  function bindEvents() {
    const root = ui.leaderboardWorkspace;
    if (!root || typeof root.addEventListener !== "function") {
      return;
    }
    delegatedEventTypes.forEach((type) => {
      root.addEventListener(type, (event) => {
        workspaceModule?.[getEventHandlerName(type)]?.(event, getContext());
      });
    });
  }

  return Object.freeze({
    bindEvents,
    getContext,
    getTeamIdentity,
    loadModule,
    render,
  });
}
