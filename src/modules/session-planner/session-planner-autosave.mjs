export const sessionPlannerModuleId = "session-planner";
export const sessionPlannerStorageKey = "football-session-planner-v3";
export const sessionPlannerAutosaveActiveWindowMs = 15000;

function getNow(now) {
  const timestamp = Number(typeof now === "function" ? now() : Date.now());
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now();
}

export function isSessionPlannerAutosaveKey(key = "", storageKey = sessionPlannerStorageKey) {
  return String(key || "") === storageKey;
}

export function shouldShowSessionPlannerAutosaveStatus(workspaceId = "") {
  return String(workspaceId || "") === sessionPlannerModuleId;
}

export function createSessionPlannerAutosaveBoundary(options = {}) {
  const storageKey = String(options.storageKey || sessionPlannerStorageKey);
  const activeWindowMs = Number.isFinite(Number(options.activeWindowMs))
    ? Math.max(0, Number(options.activeWindowMs))
    : sessionPlannerAutosaveActiveWindowMs;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const getActiveWorkspaceId =
    typeof options.getActiveWorkspaceId === "function" ? options.getActiveWorkspaceId : () => "";
  const setStatus = typeof options.setStatus === "function" ? options.setStatus : () => {};
  const setVisible = typeof options.setVisible === "function" ? options.setVisible : () => {};
  let lastSessionPlannerWriteAt = Number.NEGATIVE_INFINITY;
  let hasPendingResolution = false;

  function markSessionPlannerWrite() {
    lastSessionPlannerWriteAt = getNow(now);
    return lastSessionPlannerWriteAt;
  }

  function shouldSurfaceStatus(key = "", state = "", workspaceId = getActiveWorkspaceId()) {
    if (!isSessionPlannerAutosaveKey(key, storageKey) || !shouldShowSessionPlannerAutosaveStatus(workspaceId)) {
      return false;
    }
    const normalizedState = String(state || "");
    if (normalizedState === "issue") {
      return true;
    }
    // A verified "saved" outcome must resolve a surfaced saving/issue state
    // even outside the activity window. Restored pending work can fail and
    // recover after reload without any new local edit timestamp. The sync
    // owner remains responsible for verifying the receipt and pending work.
    if (normalizedState === "saved" && hasPendingResolution) {
      return true;
    }
    return getNow(now) - lastSessionPlannerWriteAt <= activeWindowMs;
  }

  function setStatusForKey(key = "", state = "", message = "") {
    if (!shouldSurfaceStatus(key, state)) {
      return false;
    }
    setStatus(state, message);
    const normalizedState = String(state || "");
    if (normalizedState === "saving" || normalizedState === "issue") {
      hasPendingResolution = true;
    } else if (normalizedState === "saved") {
      hasPendingResolution = false;
    }
    return true;
  }

  function syncVisibility(workspaceId = getActiveWorkspaceId()) {
    const visible = shouldShowSessionPlannerAutosaveStatus(workspaceId);
    setVisible(visible);
    return visible;
  }

  return Object.freeze({
    storageKey,
    moduleId: sessionPlannerModuleId,
    isAutosaveKey: (key = "") => isSessionPlannerAutosaveKey(key, storageKey),
    markSessionPlannerWrite,
    setStatusForKey,
    shouldShowStatus: shouldShowSessionPlannerAutosaveStatus,
    shouldSurfaceStatus,
    syncVisibility,
  });
}
