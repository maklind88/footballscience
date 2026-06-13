const DRAG_DROP_TABS = new Set(["database", "shadow-xi", "my-team", "reports"]);

function normalizeTabId(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function createScoutingPostRenderController(deps = {}) {
  function run(state = deps.ensureState?.()) {
    if (!state) {
      return { status: "skipped" };
    }
    const activeTab = normalizeTabId(state.activeTab);

    if (DRAG_DROP_TABS.has(activeTab)) {
      deps.bindDragAndDrop?.();
    }
    if (activeTab === "my-team") {
      deps.bindMyTeamSpiderShells?.();
    }
    if (activeTab === "database") {
      deps.bindRecordMiniRadarShells?.();
      deps.scheduleDatabaseAutoLoad?.();
      if (deps.isAdvancedDatabaseMode?.()) {
        deps.loadImportHistory?.();
      }
    }
    if (deps.shouldFocusProfileModal?.(state.selectedRecordId)) {
      deps.focusProfileModal?.();
      deps.queueProfileModalFocus?.(state.selectedRecordId);
    }
    if (state.selectedRecordId && deps.normalizeProfileTab?.(state.profileTab) === "overview") {
      deps.queueProfileHydration?.(state.selectedRecordId);
    }
    if (activeTab === "database") {
      deps.scheduleDatabaseWorkerPrewarm?.(1200);
    }

    return { status: "updated", tab: activeTab };
  }

  return {
    run,
  };
}
