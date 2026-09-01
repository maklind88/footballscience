import {
  addScoutingRecordIdToShadowSlot,
  removeScoutingRecordIdFromShadowSlot,
  reorderScoutingRecordIdInShadowSlot,
} from "./scouting-decision-actions.mjs";

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

function normalizeShadowCoordinate(value) {
  return Math.max(6, Math.min(94, Math.round(Number(value) * 10) / 10));
}

function canMutate(deps = {}) {
  return deps.canEdit?.() === true;
}

function getActionState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : null;
}

function getShadowXiState(state = {}) {
  state.shadowXi = state.shadowXi && typeof state.shadowXi === "object" ? state.shadowXi : {};
  return state.shadowXi;
}

function getSlotWithFallback(deps = {}, state = {}, slotId = "") {
  return (
    deps.getShadowSlot?.(slotId) ||
    deps.getShadowSlot?.(state.shadowXi?.selectedSlotId) ||
    deps.getShadowSlot?.(deps.getPreferredSlotId?.()) ||
    deps.getFirstShadowSlot?.() ||
    null
  );
}

function finishShadowWrite(deps = {}, options = {}, recordId = "") {
  deps.writeState?.(options.writeOptions || undefined);
  deps.refreshWorkspaceAfterShadowMutation?.(options.refreshOptions || { preserveFocus: true }, recordId);
}

export function createScoutingShadowXiActions(deps = {}) {
  function selectSlot(slotId) {
    const state = deps.getCurrentState?.() || getActionState(deps);
    const id = normalizeText(deps, slotId, 40);
    const slot = deps.getShadowSlot?.(id);
    if (!state || !slot) {
      return { changed: false, slotId: id, status: "empty" };
    }
    const shadowXi = getShadowXiState(state);
    deps.setPreferredSlotId?.(slot.id);
    shadowXi.selectedSlotId = slot.id;
    if (typeof deps.setActiveTab === "function") {
      deps.setActiveTab("database", { state });
    } else {
      state.activeTab = "database";
      deps.writeState?.({ syncCentral: false });
      deps.renderActiveTabSurfaceOrWorkspace?.({ preserveFocus: true });
    }
    return { changed: true, slotId: slot.id, status: "updated" };
  }

  function clearSlotSelection() {
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, status: "empty" };
    }
    const shadowXi = getShadowXiState(state);
    deps.setPreferredSlotId?.("");
    shadowXi.selectedSlotId = "";
    deps.writeState?.({ syncCentral: false });
    deps.refreshWorkspaceAfterShadowMutation?.({ preserveFocus: true });
    return { changed: true, status: "updated" };
  }

  function setFormation(value) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, status: "empty" };
    }
    const shadowXi = getShadowXiState(state);
    shadowXi.formation = deps.normalizeFormation?.(value) || "4-3-3";
    finishShadowWrite(deps);
    return { changed: true, formation: shadowXi.formation, status: "updated" };
  }

  function setSlotPitchPosition(slotId = "", xValue, yValue) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const slot = deps.getShadowSlot?.(slotId);
    if (!state || !slot) {
      return { changed: false, slotId: normalizeText(deps, slotId, 40), status: "empty" };
    }
    const shadowXi = getShadowXiState(state);
    const formation = deps.normalizeFormation?.(shadowXi.formation) || "4-3-3";
    const x = normalizeShadowCoordinate(xValue);
    const y = normalizeShadowCoordinate(yValue);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { changed: false, slotId: slot.id, status: "empty" };
    }
    state.shadowXi = {
      ...shadowXi,
      formation,
      positions: {
        ...(shadowXi.positions || {}),
        [formation]: {
          ...(shadowXi.positions?.[formation] || {}),
          [slot.id]: { x, y },
        },
      },
    };
    finishShadowWrite(deps);
    return { changed: true, slotId: slot.id, formation, position: { x, y }, status: "updated" };
  }

  function setRecordMeta(slotId, recordId, patch = {}) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const shadowXi = state ? getShadowXiState(state) : null;
    const slot = deps.getShadowSlot?.(slotId);
    const id = normalizeText(deps, recordId, 160);
    if (!state || !shadowXi || !slot || !id || !deps.getShadowSlotRecordIds?.(slot.id, state)?.includes(id)) {
      return { changed: false, recordId: id, slotId: slot?.id || "", status: "empty" };
    }
    const key = deps.getShadowMetaKey?.(slot.id, id);
    const currentMeta = deps.getShadowRecordMeta?.(slot.id, id, state) || {};
    shadowXi.meta = {
      ...(shadowXi.meta && typeof shadowXi.meta === "object" ? shadowXi.meta : {}),
      [key]: {
        ...currentMeta,
        ...patch,
        tag: deps.normalizeShadowTag?.(patch.tag || currentMeta.tag) || "",
        updatedAt: deps.now?.() || new Date().toISOString(),
      },
    };
    finishShadowWrite(deps, {}, id);
    return { changed: true, recordId: id, slotId: slot.id, metaKey: key, status: "updated" };
  }

  function moveRecord(slotId, recordId, direction) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const shadowXi = state ? getShadowXiState(state) : null;
    const slot = deps.getShadowSlot?.(slotId);
    const id = normalizeText(deps, recordId, 160);
    const current = slot ? deps.getShadowSlotRecordIds?.(slot.id, state) || [] : [];
    const index = current.indexOf(id);
    if (!state || !shadowXi || !slot || index < 0) {
      return { changed: false, recordId: id, slotId: slot?.id || "", status: "empty" };
    }
    const nextIndex = direction === "down" ? Math.min(current.length - 1, index + 1) : Math.max(0, index - 1);
    if (nextIndex === index) {
      return { changed: false, recordId: id, slotId: slot.id, status: "unchanged" };
    }
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    shadowXi.slots = {
      ...(shadowXi.slots || {}),
      [slot.id]: next,
    };
    shadowXi.selectedSlotId = slot.id;
    deps.setPreferredSlotId?.(slot.id);
    finishShadowWrite(deps, {}, id);
    return { changed: true, recordId: id, slotId: slot.id, status: "updated" };
  }

  function reorderRecord(slotId, recordId, beforeRecordId = "") {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, status: "empty" };
    }
    const mutation = reorderScoutingRecordIdInShadowSlot(state, { recordId, slotId, beforeRecordId });
    if (!mutation.changed) {
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    deps.setPreferredSlotId?.(mutation.slotId);
    finishShadowWrite(deps, {}, mutation.recordId);
    return { ...mutation, status: "updated" };
  }

  function addRecordToShadow(recordId, slotId) {
    const perf = startActionPerformance(deps, "shadow.add", { recordId, slotId });
    if (!canMutate(deps)) {
      perf.end({ status: "blocked" });
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const id = normalizeText(deps, recordId, 160);
    const record = deps.getRecordById?.(id);
    const slot = state ? getSlotWithFallback(deps, state, slotId) : null;
    if (!state || !id || !slot) {
      perf.end({ status: "empty" });
      return { changed: false, recordId: id, slotId: slot?.id || "", status: "empty" };
    }
    if (record) {
      deps.rememberRecordSnapshot?.(record, state, { includeAnalysis: true });
    }
    const currentRecordIds = deps.getShadowSlotRecordIds?.(slot.id, state) || [];
    const mutation = addScoutingRecordIdToShadowSlot(state, {
      recordId: id,
      slotId: slot.id,
      meta: {
        ...(deps.getShadowRecordMeta?.(slot.id, id, state) || {}),
        tag: deps.getRecordAge?.(record) <= 23 ? "u23" : currentRecordIds.length ? "backup" : "first-choice",
        playerName: record ? deps.getRecordName?.(record) || "" : "",
        team: record ? deps.getRecordTeam?.(record) || "" : "",
        league: record ? deps.getRecordLeague?.(record) || "" : "",
        season: record ? deps.getRecordSeason?.(record) || "" : "",
        position: record ? deps.getRecordPosition?.(record) || "" : "",
        updatedAt: deps.now?.() || new Date().toISOString(),
      },
    });
    if (!mutation.changed) {
      perf.end({ status: mutation.reason || "unchanged" });
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    deps.setPreferredSlotId?.(slot.id);
    deps.writeState?.();
    deps.refreshWorkspaceAfterShadowMutation?.({ preserveFocus: state.activeTab === "database" }, id);
    perf.end({ status: "updated", slot: slot.id });
    return { ...mutation, status: "updated" };
  }

  function removeRecordFromShadow(recordId, slotId) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, status: "empty" };
    }
    const mutation = removeScoutingRecordIdFromShadowSlot(state, { recordId, slotId });
    if (!mutation.changed) {
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    deps.setPreferredSlotId?.(mutation.slotId);
    finishShadowWrite(deps, {}, mutation.recordId);
    return { ...mutation, status: "updated" };
  }

  return {
    addRecordToShadow,
    clearSlotSelection,
    moveRecord,
    removeRecordFromShadow,
    reorderRecord,
    selectSlot,
    setFormation,
    setRecordMeta,
    setSlotPitchPosition,
  };
}
