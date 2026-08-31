function normalizeTabId(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function hasTab(tabs = [], tabId = "") {
  return Array.isArray(tabs) && tabs.some((tab) => tab?.id === tabId);
}

export function createScoutingTabController(deps = {}) {
  function getTabs() {
    const tabs = deps.getTabs?.();
    return Array.isArray(tabs) ? tabs : [];
  }

  function renderActiveTabSurface(previousTab, nextTabId, options = {}) {
    const render = () => {
      options.beforeRender?.();
      deps.renderActiveTabSurfaceOrWorkspace?.({ preserveFocus: false });
      deps.resetScrollPosition?.({ previousTab, tabId: nextTabId });
    };
    if (deps.shouldDeferTabSurfaceRender?.(nextTabId, previousTab) === true) {
      const scheduled = deps.scheduleTabSurfaceRender?.(render, { previousTab, tabId: nextTabId });
      if (scheduled !== false) {
        return { deferred: true };
      }
    }
    render();
    return { deferred: false };
  }

  function setActiveTab(tabId, options = {}) {
    const state = options.state || deps.ensureState?.();
    const nextTabId = normalizeTabId(tabId);
    if (!state || !hasTab(getTabs(), nextTabId)) {
      return { changed: false, status: "invalid-tab" };
    }
    if (state.activeTab === nextTabId) {
      return { changed: false, status: "unchanged" };
    }

    const previousTab = state.activeTab || "";
    const perf = deps.startPerformance?.("tab.switch", { from: previousTab, to: nextTabId });
    state.activeTab = nextTabId;

    if (nextTabId === "shadow-xi") {
      deps.resetShadowSelection?.(state);
    }
    if (nextTabId !== "reports") {
      deps.clearReportsExpandedPanels?.();
    }
    if (nextTabId !== "database") {
      deps.cancelDatabaseBackgroundTimers?.();
    }
    if (previousTab === "database" && nextTabId !== "database") {
      deps.resetDatabaseTransientUi?.();
    }

    const deferStateWrite = options.deferStateWrite === true && deps.shouldDeferTabSurfaceRender?.(nextTabId, previousTab) === true;
    if (!deferStateWrite) {
      deps.writeState?.({ syncCentral: false });
    }
    deps.syncTabButtonsDom?.(state);
    const renderResult = renderActiveTabSurface(previousTab, nextTabId, {
      beforeRender: deferStateWrite ? () => deps.writeState?.({ syncCentral: false }) : null,
    });
    perf?.end?.({ deferred: renderResult.deferred, from: previousTab, to: nextTabId });
    return { changed: true, previousTab, tabId: nextTabId, status: "updated" };
  }

  return {
    setActiveTab,
  };
}
