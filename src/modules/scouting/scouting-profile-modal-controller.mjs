function normalizeControllerText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function getTimerApi(deps = {}) {
  const windowRef = deps.windowRef || (typeof globalThis !== "undefined" ? globalThis.window : null);
  return {
    clearTimeout: deps.clearTimeout || windowRef?.clearTimeout?.bind(windowRef) || globalThis.clearTimeout,
    setTimeout: deps.setTimeout || windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout,
  };
}

export function createScoutingProfileModalController(deps = {}) {
  const timers = getTimerApi(deps);
  let pendingFocusRecordId = "";
  let pendingFocusUntil = 0;
  let focusTimer = 0;
  let postOpenTimer = 0;

  function normalizeText(value = "", limit = 160) {
    return normalizeControllerText(value, limit, deps.normalizeText);
  }

  function getState() {
    return deps.ensureState?.() || {};
  }

  function focusModal() {
    const modal = deps.getProfileModal?.();
    if (!modal || typeof modal.focus !== "function") {
      return false;
    }
    const activeElement = deps.documentRef?.activeElement || null;
    if (modal.contains?.(activeElement) && activeElement?.matches?.("input, textarea, select, [contenteditable='true']")) {
      return false;
    }
    try {
      modal.focus({ preventScroll: true });
    } catch {
      modal.focus();
    }
    if (deps.documentRef?.activeElement !== modal) {
      deps.focusElementWithoutScroll?.(modal);
    }
    return true;
  }

  function shouldFocus(recordId) {
    const id = normalizeText(recordId, 160);
    return Boolean(id && pendingFocusRecordId === id && (deps.now?.() ?? Date.now()) <= pendingFocusUntil);
  }

  function clearFocusQueue() {
    timers.clearTimeout?.(focusTimer);
    focusTimer = 0;
  }

  function queueFocus(recordId) {
    const targetId = normalizeText(recordId, 160);
    clearFocusQueue();
    const applyFocus = () => {
      if (normalizeText(getState().selectedRecordId, 160) !== targetId || !shouldFocus(targetId)) {
        clearFocusQueue();
        return;
      }
      focusModal();
      focusTimer = 0;
      pendingFocusRecordId = "";
      pendingFocusUntil = 0;
    };
    focusTimer = timers.setTimeout?.(applyFocus, 40) || 0;
    return focusTimer;
  }

  function clearPostOpenQueue() {
    if (postOpenTimer) {
      timers.clearTimeout?.(postOpenTimer);
      postOpenTimer = 0;
    }
  }

  function queuePostOpen(recordId) {
    const targetId = normalizeText(recordId, 160);
    clearPostOpenQueue();
    postOpenTimer = timers.setTimeout?.(() => {
      postOpenTimer = 0;
      const state = getState();
      if (normalizeText(state.selectedRecordId, 160) !== targetId) {
        return;
      }
      if (normalizeText(state.profileTab, 40) === "overview") {
        deps.renderProfileModal?.(targetId);
      }
      deps.writeState?.({ syncCentral: false });
      deps.queueProfileHydration?.(targetId);
    }, 700) || 0;
    return postOpenTimer;
  }

  function openRecord(recordId) {
    const state = getState();
    const normalizedRecordId = normalizeText(recordId, 160);
    if (!normalizedRecordId) {
      return { changed: false, recordId: normalizedRecordId, status: "empty" };
    }
    if (deps.hasProfileModal?.() && normalizeText(state.selectedRecordId, 160) === normalizedRecordId) {
      queueFocus(normalizedRecordId);
      return { changed: false, recordId: normalizedRecordId, status: "already-open" };
    }
    state.selectedRecordId = normalizedRecordId;
    state.profileTab = "overview";
    state.profileRoleProfileId = "auto";
    state.profileSpiderSeasonMode = "latest";
    state.profileSpiderSeasonValue = "";
    pendingFocusRecordId = normalizedRecordId;
    pendingFocusUntil = (deps.now?.() ?? Date.now()) + 1500;
    deps.ensureFocusObserver?.();
    deps.renderProfileModal?.(normalizedRecordId, { lightweightOverview: true });
    focusModal();
    queueFocus(normalizedRecordId);
    queuePostOpen(normalizedRecordId);
    return { changed: true, recordId: normalizedRecordId, status: "opened" };
  }

  function closeRecord() {
    const state = getState();
    clearPostOpenQueue();
    state.selectedRecordId = "";
    deps.writeState?.({ syncCentral: false });
    const backdrop = deps.getProfileBackdrop?.();
    if (backdrop) {
      backdrop.remove?.();
      deps.refreshSummaryMetrics?.();
      return { changed: true, surface: "profile-modal", status: "closed" };
    }
    deps.renderWorkspace?.();
    return { changed: true, surface: "workspace", status: "closed" };
  }

  function getFocusState() {
    return {
      focusTimer,
      postOpenTimer,
      pendingFocusRecordId,
      pendingFocusUntil,
    };
  }

  return {
    closeRecord,
    focusModal,
    getFocusState,
    openRecord,
    queueFocus,
    queuePostOpen,
    shouldFocus,
  };
}
