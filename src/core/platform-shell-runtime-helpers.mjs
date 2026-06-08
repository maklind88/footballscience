export function createPlatformShellRuntimeHelpers({
  getWorkspaceModuleRuntimeController = () => null,
  getActiveWorkspaceId = () => "",
  getSessionPlannerAutosaveBoundary = () => null,
} = {}) {
  const resolveController = () => {
    const controller = getWorkspaceModuleRuntimeController();
    return controller && typeof controller === "object" ? controller : null;
  };

  const resolveAutosaveBoundary = () => {
    const boundary = getSessionPlannerAutosaveBoundary();
    return boundary && typeof boundary === "object" ? boundary : null;
  };

  return {
    queueWorkspaceModulePreload(workspaceId = "") {
      return resolveController()?.queueWorkspaceModulePreload?.(workspaceId);
    },
    preloadWorkspaceFromTrigger(trigger = null) {
      return resolveController()?.preloadWorkspaceFromTrigger?.(trigger);
    },
    isSessionPlannerAutosaveKey(key = "") {
      return resolveAutosaveBoundary()?.isAutosaveKey?.(key) || false;
    },
    shouldShowPlatformAutosaveStatus(workspaceId = getActiveWorkspaceId()) {
      return resolveAutosaveBoundary()?.shouldShowStatus?.(workspaceId) || false;
    },
    syncPlatformAutosaveStatusVisibility(workspaceId = getActiveWorkspaceId()) {
      return resolveAutosaveBoundary()?.syncVisibility?.(workspaceId);
    },
    setPlatformAutosaveStatusForKey(key, state, message = "") {
      return resolveAutosaveBoundary()?.setStatusForKey?.(key, state, message);
    },
  };
}
