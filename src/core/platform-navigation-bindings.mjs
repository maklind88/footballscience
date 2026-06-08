export function bindPlatformNavigationInteractions(deps = {}) {
  const {
    documentRef = globalThis.document,
    getHubState = () => null,
    platformNavigationController = {},
    preloadWorkspaceFromTrigger = () => {},
    renderWorkspaceChrome = () => {},
    setActiveWorkspace = () => {},
    ui = {},
    win = globalThis,
    writeWorkspaceHubState = () => {},
  } = deps;

  function getWorkspaceTrigger(event) {
    return event?.target?.closest?.("[data-open-workspace]") || null;
  }

  function handleOpenWorkspace(event) {
    if (event?.__footballScienceWorkspaceHandled) return;
    const trigger = getWorkspaceTrigger(event);
    if (!trigger) return;
    event.__footballScienceWorkspaceHandled = true;
    setActiveWorkspace(trigger.dataset.openWorkspace);
  }

  function handleOpenWorkspaceEvent(event) {
    const workspaceId = String(event?.detail?.workspaceId || event?.detail?.id || "").trim();
    if (!workspaceId) return;
    setActiveWorkspace(workspaceId);
  }

  function handleWorkspaceHover(event) {
    const trigger = getWorkspaceTrigger(event);
    preloadWorkspaceFromTrigger(trigger);
    platformNavigationController.showTopIconTooltip?.(trigger);
  }

  function handleWorkspaceLeave(event) {
    const trigger = getWorkspaceTrigger(event);
    if (trigger && !trigger.contains(event.relatedTarget)) {
      platformNavigationController.hideTopIconTooltip?.();
    }
  }

  ui.sidebarToggle?.addEventListener("click", () => {
    const hubState = getHubState();
    if (!hubState) return;
    hubState.sidebarCollapsed = !hubState.sidebarCollapsed;
    writeWorkspaceHubState();
    renderWorkspaceChrome();
  });

  ui.workspaceQuickSwitch?.addEventListener("change", () => {
    setActiveWorkspace(ui.workspaceQuickSwitch.value);
  });

  documentRef?.addEventListener?.("click", handleOpenWorkspace);

  [ui.workspaceList, ui.topIconMenu, ui.profileMenu].forEach((menu) => {
    menu?.addEventListener("click", handleOpenWorkspace);
    menu?.addEventListener("mouseover", handleWorkspaceHover);
    menu?.addEventListener("mouseout", handleWorkspaceLeave);
    menu?.addEventListener("focusin", handleWorkspaceHover);
    menu?.addEventListener("focusout", handleWorkspaceLeave);
  });

  win.addEventListener?.("scroll", platformNavigationController.hideTopIconTooltip, { passive: true });
  win.addEventListener?.("resize", platformNavigationController.hideTopIconTooltip);
  win.addEventListener?.("platform:open-workspace", handleOpenWorkspaceEvent);

  ui.workspaceTitle?.addEventListener("click", () => {
    if (!getHubState()) return;
    setActiveWorkspace("home");
  });

  ui.workspaceTitle?.addEventListener("keydown", (event) => {
    if (!getHubState() || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    setActiveWorkspace("home");
  });
}
