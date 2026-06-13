import { toggleScoutingFavoriteRecordId } from "./scouting-decision-actions.mjs";

function createNoopPerformance() {
  return { end() {} };
}

function startActionPerformance(deps = {}, label = "", detail = {}) {
  return deps.startPerformance?.(label, detail) || createNoopPerformance();
}

function normalizeText(deps = {}, value = "", limit = 160) {
  if (typeof deps.normalizeText === "function") {
    return deps.normalizeText(value, limit);
  }
  return String(value || "").trim().slice(0, limit);
}

function canMutate(deps = {}) {
  return deps.canEdit?.() === true;
}

function getActionState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : null;
}

function createDebugTimings(deps = {}) {
  return deps.isPerfDebug?.() === true ? [] : null;
}

function markDebugTiming(deps = {}, timings = null, label = "") {
  if (!timings) {
    return;
  }
  const now = Number(deps.getPerformanceNow?.());
  timings.push({ label, at: Number.isFinite(now) ? now : Date.now() });
}

function logDebugTimings(deps = {}, timings = null) {
  if (!timings?.length) {
    return;
  }
  const base = timings[0]?.at || 0;
  deps.logDebugTimings?.(
    timings.map((item) => ({
      label: item.label,
      ms: Math.round(item.at - base),
    }))
  );
}

export function createScoutingFavoritesActions(deps = {}) {
  function toggleFavorite(recordId) {
    const perf = startActionPerformance(deps, "favorite.toggle", { recordId });
    const debugTimings = createDebugTimings(deps);
    markDebugTiming(deps, debugTimings, "start");
    if (!canMutate(deps)) {
      perf.end({ status: "blocked" });
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const id = normalizeText(deps, recordId, 160);
    if (!state || !id) {
      perf.end({ status: "empty" });
      return { changed: false, recordId: id, status: "empty" };
    }
    markDebugTiming(deps, debugTimings, "state-ready");
    const hasProfileModal = deps.hasProfileModal?.() === true;
    const mutation = toggleScoutingFavoriteRecordId(state, id);
    if (!mutation.changed) {
      perf.end({ status: mutation.reason || "unchanged" });
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    markDebugTiming(deps, debugTimings, "favorite-state-updated");
    if (hasProfileModal) {
      deps.updateFavoriteControls?.(id, state);
      markDebugTiming(deps, debugTimings, "favorite-controls-updated");
      deps.refreshSummaryMetrics?.();
      markDebugTiming(deps, debugTimings, "summary-updated");
      const record = deps.getRecordById?.(id);
      if (record) {
        deps.rememberRecordSnapshot?.(record, state, { includeAnalysis: false });
      }
      deps.writeState?.();
      markDebugTiming(deps, debugTimings, "state-written");
      logDebugTimings(deps, debugTimings);
      perf.end({ status: "profile-modal" });
      return { ...mutation, status: "profile-modal" };
    }

    const record = deps.getRecordById?.(id);
    markDebugTiming(deps, debugTimings, "record-ready");
    if (record) {
      deps.rememberRecordSnapshot?.(record, state);
    }
    markDebugTiming(deps, debugTimings, "snapshot-ready");
    deps.writeState?.();
    markDebugTiming(deps, debugTimings, "state-written");
    deps.refreshWorkspaceAfterLocalMutation?.({ preserveFocus: true });
    markDebugTiming(deps, debugTimings, "workspace-refreshed");
    logDebugTimings(deps, debugTimings);
    perf.end({ status: "updated" });
    return { ...mutation, status: "updated" };
  }

  return {
    toggleFavorite,
  };
}
