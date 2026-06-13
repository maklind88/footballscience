function normalizeControllerText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function escapeControllerHtml(value = "", escapeHtml = null) {
  if (typeof escapeHtml === "function") {
    return escapeHtml(value);
  }
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getScheduler(deps = {}) {
  const windowRef = deps.windowRef || (typeof globalThis !== "undefined" ? globalThis.window : null);
  if (typeof deps.requestIdleCallback === "function") {
    return (callback) => deps.requestIdleCallback(callback, { timeout: 1200 });
  }
  if (typeof windowRef?.requestIdleCallback === "function") {
    return (callback) => windowRef.requestIdleCallback(callback, { timeout: 1200 });
  }
  const setTimeoutRef = deps.setTimeout || windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout;
  return (callback) => setTimeoutRef(callback, 80);
}

export function createScoutingProfileOverviewController(deps = {}) {
  const inProgress = new Set();

  function normalizeText(value = "", limit = 160) {
    return normalizeControllerText(value, limit, deps.normalizeText);
  }

  function escapeHtml(value = "") {
    return escapeControllerHtml(value, deps.escapeHtml);
  }

  function getState() {
    return deps.ensureState?.() || {};
  }

  function isOverviewActive(state = {}, recordId = "") {
    return normalizeText(state.selectedRecordId, 160) === recordId && deps.normalizeProfileTab?.(state.profileTab) === "overview";
  }

  function renderShell(record) {
    return deps.renderShell?.(record) || "";
  }

  function updateDecisionStrip(modal, record, state, recordId) {
    const decisionStrip = modal?.querySelector?.("[data-scouting-profile-decision-strip]");
    if (!decisionStrip) {
      return false;
    }
    const profileRoleProfileId = deps.normalizeRoleProfileId?.(state.profileRoleProfileId, "auto") || "auto";
    const selectedProfileRoleId = profileRoleProfileId === "auto" ? "" : profileRoleProfileId;
    const roleFitScore = deps.getRoleFitScore?.(record, selectedProfileRoleId);
    const intelligence = deps.getIntelligenceProfile?.(record, state, selectedProfileRoleId);
    const shadowRoles = (deps.getShadowSlots?.() || []).filter((slot) => deps.getShadowSlotRecordIds?.(slot.id, state)?.includes(recordId));
    const roleFit = decisionStrip.querySelector?.("[data-scouting-profile-role-fit]");
    const roleFitLabel = decisionStrip.querySelector?.("[data-scouting-profile-role-fit-label]");
    const roleFloor = decisionStrip.querySelector?.("[data-scouting-profile-role-floor]");
    const roleFloorLabel = decisionStrip.querySelector?.("[data-scouting-profile-role-floor-label]");
    const confidence = decisionStrip.querySelector?.("[data-scouting-profile-confidence]");
    const signalLabel = decisionStrip.querySelector?.("[data-scouting-profile-best-signal]");
    const roleStack = decisionStrip.querySelector?.("[data-scouting-profile-role-stack]");
    const roleStackLabel = decisionStrip.querySelector?.("[data-scouting-profile-role-stack-label]");
    if (roleFit) {
      roleFit.className = `is-${escapeHtml(deps.getRoleFitTier?.(roleFitScore))}`;
      roleFit.textContent = Number.isFinite(roleFitScore) ? `P${escapeHtml(deps.formatNumber?.(roleFitScore))}` : "n/a";
    }
    if (roleFitLabel) {
      roleFitLabel.textContent = escapeHtml([deps.getRoleFitLabel?.(roleFitScore), intelligence?.roleLabel].filter(Boolean).join(" / "));
    }
    if (roleFloor) {
      roleFloor.textContent = Number.isFinite(intelligence?.floor?.score) ? `P${escapeHtml(deps.formatNumber?.(intelligence.floor.score))}` : "n/a";
    }
    if (roleFloorLabel) {
      roleFloorLabel.textContent = escapeHtml(intelligence?.floor?.label || "No floor signal");
    }
    if (confidence) {
      confidence.textContent = escapeHtml(intelligence?.confidence?.label || "n/a");
    }
    if (signalLabel) {
      signalLabel.textContent = escapeHtml(intelligence?.signal?.headline || "No standout role signal yet");
    }
    if (roleStack) {
      roleStack.textContent = String(shadowRoles.length);
    }
    if (roleStackLabel) {
      roleStackLabel.textContent = escapeHtml(shadowRoles.length ? shadowRoles.map((slot) => slot.label).join(", ") : "Not in Shadow XI");
    }
    return true;
  }

  function hydrateOverview(recordId) {
    const normalizedId = normalizeText(recordId, 160);
    if (!normalizedId) {
      return { changed: false, status: "empty" };
    }
    const state = getState();
    if (!isOverviewActive(state, normalizedId)) {
      return { changed: false, recordId: normalizedId, status: "inactive" };
    }
    if (inProgress.has(normalizedId)) {
      return { changed: false, recordId: normalizedId, status: "in-progress" };
    }
    const modal = deps.getProfileModal?.();
    if (!modal) {
      return { changed: false, recordId: normalizedId, status: "missing-modal" };
    }
    const record = deps.getRecordById?.(normalizedId);
    if (!record) {
      return { changed: false, recordId: normalizedId, status: "missing-record" };
    }
    inProgress.add(normalizedId);
    const scheduleHydration = getScheduler(deps);
    scheduleHydration(() => {
      try {
        const latestState = getState();
        if (!isOverviewActive(latestState, normalizedId)) {
          return;
        }
        const latestModal = deps.getProfileModal?.();
        if (!latestModal) {
          return;
        }
        const dossierNode = Array.from(latestModal.querySelectorAll?.("[data-scouting-profile-overview-shell]") || []).find(
          (entry) => entry.dataset?.scoutingProfileOverviewShell === normalizedId
        );
        if (dossierNode) {
          dossierNode.outerHTML = deps.renderDossier?.(record, latestState, deps.getProfileRows?.(record) || []) || "";
        }
        updateDecisionStrip(latestModal, record, latestState, normalizedId);
      } finally {
        inProgress.delete(normalizedId);
      }
    });
    return { changed: false, recordId: normalizedId, status: "scheduled" };
  }

  function clearInProgress() {
    inProgress.clear();
  }

  function getInProgressRecordIds() {
    return [...inProgress];
  }

  return {
    clearInProgress,
    getInProgressRecordIds,
    hydrateOverview,
    renderShell,
    updateDecisionStrip,
  };
}
