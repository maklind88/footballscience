const id = "performance-room";

export function createPerformanceSurfaceRuntime({
  root, win, loader, assetVersion, getAuth, getUser, getActiveWorkspace, getWorkspace,
  defaultTeamId, getAuthToken, openSource, onOpenSourceDate, ...sources
}) {
  let surface;
  let loading;
  const central = () => win.footballScienceCentralState;
  const getScope = () => central()?.getReadScope?.() || "";
  let verifiedScope = central()?.isHydrated?.() ? getScope() : "";
  win.addEventListener?.("footballscience:central-state-ready", () => {
    verifiedScope = getScope();
  });
  const canRead = (workspace) => Boolean(getUser()?.id && getWorkspace(workspace));
  const isSelected = () => getActiveWorkspace() === id && canRead(id);
  // The current owner workspaces use the legacy first-team dataset. Squad and
  // Schedule also contain Courage seeds, so never open this projection for another team.
  const isTeamSupported = () => [defaultTeamId, "team-ncc-first"].includes(
    getUser()?.teamId || getUser()?.team_id || sources.getTeam()?.id
  );
  const isReady = () => getAuth()?.isDevMode?.() === true || Boolean(verifiedScope && verifiedScope === getScope());
  const isActive = () => isSelected() && isTeamSupported() && isReady();

  function openAuthorizedSource(workspace, date) {
    if (!isActive() || !canRead(workspace) || !openSource(workspace)) return;
    if (date) onOpenSourceDate(workspace, date);
  }

  function render() {
    if (!root) return;
    if (!isSelected()) {
      if (root.firstChild) root.replaceChildren();
      return;
    }
    if (!isTeamSupported()) {
      root.textContent = "Performance sources are not connected for this team.";
      return;
    }
    if (!isReady()) {
      root.textContent = "Waiting for the team’s workspace data…";
      return;
    }
    if (surface) {
      surface.render();
      return;
    }
    if (loading) return;
    root.textContent = "Loading Performance Room…";
    loading = Promise.all([
      loader.loadStylesheet(id, "src/modules/performance/performance.css", { id: "performanceStylesheet", required: true }),
      loader.loadModule(id, () => import(`./index.mjs?v=${encodeURIComponent(assetVersion)}`)),
    ]).then(([, module]) => {
      const params = new URLSearchParams(win.location?.search);
      surface = module.createPerformanceSurface({
        ...sources, root, canRead, isActive, openSource: openAuthorizedSource,
        loadPlanningEnabled: canRead("player-profiles") && canRead("schedule"),
        getLoadPlanToken: getAuth()?.isDevMode?.() === true ? null : getAuthToken,
        openLoadPlan: params.get("performancePlan") === "team-week",
        openGpsHistory: params.get("performancePlan") === "gps-history",
        initialLoadPlanDate: params.get("performanceDate"),
        initialLoadPlanPlayer: () => new URLSearchParams(win.location?.search).get("performancePlayer"),
        getScope: () => JSON.stringify([getUser()?.id, getUser()?.role, getScope()]),
      });
      if (isActive()) surface.render();
    }).catch((error) => {
      win.console.error("Performance Room could not load.", error);
      if (isActive()) root.textContent = "Performance Room could not load. Reopen the workspace to try again.";
    }).finally(() => { loading = null; });
  }

  return { render };
}
