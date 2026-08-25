const topIconLabels = Object.freeze({
  home: "Home",
  schedule: "Schedule",
  periodization: "Period",
  "session-planner": "Sessions",
  idp: "IDP",
  "player-profiles": "Squad Room",
  leaderboard: "Leaderboard",
  scouting: "Scouting",
  "transfer-room": "Transfers",
  "analysis-room": "Analysis",
  staff: "Team",
  "medical-team": "Medical",
  admin: "Admin",
  "set-pieces-room": "Set Pieces",
});

export function getPlatformTopIconLabel(workspace = {}) {
  return topIconLabels[workspace?.id] ?? workspace?.title ?? "";
}

function getTopIconTriggerLabel(trigger) {
  return (
    trigger?.querySelector(".top-icon-menu-label")?.textContent?.trim() ||
    trigger?.querySelector(".platform-nav-text strong")?.textContent?.trim() ||
    trigger?.getAttribute("aria-label") ||
    ""
  );
}

export function createPlatformNavigationController(options = {}) {
  const doc = options.document ?? globalThis.document;
  const win = options.window ?? globalThis.window;
  const renderer = options.renderer;
  const getUi = typeof options.getUi === "function" ? options.getUi : () => ({});
  const getHubState = typeof options.getHubState === "function" ? options.getHubState : () => null;
  const setHubState = typeof options.setHubState === "function" ? options.setHubState : () => {};
  const getWorkspaceById = typeof options.getWorkspaceById === "function" ? options.getWorkspaceById : () => null;
  const getVisibleWorkspaces =
    typeof options.getVisibleWorkspaces === "function" ? options.getVisibleWorkspaces : () => [];
  const getAccessibleWorkspacePool =
    typeof options.getAccessibleWorkspacePool === "function" ? options.getAccessibleWorkspacePool : () => [];
  const canAccessWorkspace = typeof options.canAccessWorkspace === "function" ? options.canAccessWorkspace : () => false;
  const repairWorkspaceState = typeof options.repairWorkspaceState === "function" ? options.repairWorkspaceState : (state) => state;
  const hasHomeNotifications = typeof options.hasHomeNotifications === "function" ? options.hasHomeNotifications : () => false;
  const topIconMenuOrder = Array.isArray(options.topIconMenuOrder) ? options.topIconMenuOrder : [];
  const sidebarPrimaryOrder = Array.isArray(options.sidebarPrimaryOrder) ? options.sidebarPrimaryOrder : [];
  const sidebarMoreOrder = Array.isArray(options.sidebarMoreOrder) ? options.sidebarMoreOrder : [];
  const placeholderContent = options.placeholderContent && typeof options.placeholderContent === "object" ? options.placeholderContent : {};

  function getTooltip() {
    let tooltip = doc?.querySelector?.(".top-icon-menu-floating-label");
    if (!tooltip && doc?.createElement && doc?.body?.append) {
      tooltip = doc.createElement("div");
      tooltip.className = "top-icon-menu-floating-label";
      tooltip.setAttribute("role", "tooltip");
      doc.body.append(tooltip);
    }
    return tooltip;
  }

  function hideTopIconTooltip() {
    const tooltip = doc?.querySelector?.(".top-icon-menu-floating-label");
    tooltip?.classList?.remove("is-visible");
  }

  function showTopIconTooltip(trigger) {
    const label = getTopIconTriggerLabel(trigger);
    if (!trigger || !label) {
      hideTopIconTooltip();
      return;
    }
    const tooltip = getTooltip();
    if (!tooltip || !win) {
      return;
    }
    tooltip.textContent = label;
    tooltip.classList.add("is-visible");
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const edgeGap = 10;
    if (trigger.closest(".platform-sidebar")) {
      const left = Math.min(triggerRect.right + 12, win.innerWidth - tooltipRect.width - edgeGap);
      const top = Math.min(
        Math.max(triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2, edgeGap),
        win.innerHeight - tooltipRect.height - edgeGap
      );
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
      return;
    }
    const left = Math.min(
      Math.max(triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2, edgeGap),
      win.innerWidth - tooltipRect.width - edgeGap
    );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.round(triggerRect.bottom + 8)}px`;
  }

  function isSidebarWorkspaceVisible(workspace) {
    return workspace && canAccessWorkspace(workspace) && (!workspace.hiddenFromNav || workspace.id === "home");
  }

  function renderTopIconMenu() {
    const ui = getUi();
    const hubState = getHubState();
    if (!ui.topIconMenu || !hubState || !renderer?.renderTopIconMenu) {
      return;
    }
    const workspaces = topIconMenuOrder.map((workspaceId) => getWorkspaceById(workspaceId)).filter(isSidebarWorkspaceVisible);
    const nextMarkup = renderer.renderTopIconMenu({
      workspaces,
      activeWorkspaceId: hubState.activeWorkspaceId,
      hasHomeNotification: hasHomeNotifications(),
    });
    if (ui.topIconMenu.__lastRenderedMarkup === nextMarkup) {
      return;
    }
    ui.topIconMenu.__lastRenderedMarkup = nextMarkup;
    ui.topIconMenu.innerHTML = nextMarkup;
  }

  function renderWorkspaceList() {
    const ui = getUi();
    if (!ui.workspaceList || !renderer?.renderWorkspaceList) {
      return;
    }
    const repairedState = repairWorkspaceState(getHubState());
    setHubState(repairedState);
    let visibleWorkspaces = getVisibleWorkspaces();
    const isPlatformNav = ui.workspaceList.classList.contains("platform-nav");
    if (isPlatformNav) {
      const primaryWorkspaces = sidebarPrimaryOrder.map((workspaceId) => getWorkspaceById(workspaceId)).filter(isSidebarWorkspaceVisible);
      const overflowWorkspaces = sidebarMoreOrder.map((workspaceId) => getWorkspaceById(workspaceId)).filter(isSidebarWorkspaceVisible);
      ui.workspaceList.innerHTML = renderer.renderWorkspaceList({
        isPlatformNav,
        primaryWorkspaces,
        overflowWorkspaces,
        activeWorkspaceId: repairedState?.activeWorkspaceId,
      });
      return;
    }
    if (!visibleWorkspaces.length) {
      if (ui.workspaceSearch) {
        ui.workspaceSearch.value = "";
      }
      visibleWorkspaces = repairedState?.workspaces || [];
    }
    ui.workspaceList.innerHTML = renderer.renderWorkspaceList({
      visibleWorkspaces,
      activeWorkspaceId: repairedState?.activeWorkspaceId,
    });
  }

  function renderWorkspaceQuickSwitch(activeWorkspaceId = getHubState()?.activeWorkspaceId) {
    const ui = getUi();
    const hubState = getHubState();
    if (!ui.workspaceQuickSwitch || !hubState || !renderer?.renderWorkspaceQuickSwitchOptions) {
      return;
    }
    const workspaces = getAccessibleWorkspacePool().filter((workspace) => !workspace.hiddenFromNav || workspace.id === activeWorkspaceId);
    ui.workspaceQuickSwitch.innerHTML = renderer.renderWorkspaceQuickSwitchOptions(workspaces);
    ui.workspaceQuickSwitch.value = activeWorkspaceId;
  }

  function renderPlaceholderWorkspace() {
    const ui = getUi();
    const hubState = getHubState();
    if (!ui.placeholderTag || !ui.placeholderTitle || !ui.placeholderDescription || !ui.placeholderModules || !hubState) {
      return;
    }
    const workspace = getWorkspaceById(hubState.activeWorkspaceId);
    const content = placeholderContent[workspace?.id] ?? {
      tag: "Workspace",
      title: workspace?.title ?? "Workspace",
      description: workspace?.description ?? "This workspace shell is ready for the next module.",
      modules: [],
    };
    ui.placeholderTag.textContent = content.tag;
    ui.placeholderTitle.textContent = content.title;
    ui.placeholderDescription.textContent = content.description;
    ui.placeholderModules.innerHTML = "";
  }

  return {
    hideTopIconTooltip,
    renderPlaceholderWorkspace,
    renderTopIconMenu,
    renderWorkspaceList,
    renderWorkspaceQuickSwitch,
    showTopIconTooltip,
  };
}
