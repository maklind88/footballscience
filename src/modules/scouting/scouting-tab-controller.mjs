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

  function setActiveTab(tabId) {
    const state = deps.ensureState?.();
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

    deps.writeState?.({ syncCentral: false });
    deps.syncTabButtonsDom?.(state);
    deps.renderActiveTabSurfaceOrWorkspace?.({ preserveFocus: false });
    perf?.end?.({ from: previousTab, to: nextTabId });
    return { changed: true, previousTab, tabId: nextTabId, status: "updated" };
  }

  return {
    setActiveTab,
  };
}
