import {
  assignScoutingMyTeamPlayerIdToSlot,
  removeScoutingMyTeamPlayerIdFromAllSlots,
  removeScoutingMyTeamPlayerIdFromSlot,
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

function canMutate(deps = {}) {
  return deps.canEdit?.() === true;
}

function getActionState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : null;
}

function finishWrite(deps = {}, refresh = "local") {
  deps.writeState?.();
  if (refresh === "active-tab") {
    deps.renderActiveTabSurfaceOrWorkspace?.({ preserveFocus: true });
    return;
  }
  deps.refreshWorkspaceAfterLocalMutation?.({ preserveFocus: true });
}

export function createScoutingMyTeamActions(deps = {}) {
  function assignPlayerToSlot(playerId, slotId, beforePlayerId = "") {
    const perf = startActionPerformance(deps, "my-team.assign", { playerId, slotId });
    if (!canMutate(deps)) {
      perf.end({ status: "blocked" });
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const myTeam = deps.getMyTeamState?.(state);
    const player = deps.getMyTeamPlayerById?.(playerId);
    const slot = deps.getShadowSlot?.(slotId);
    if (!state || !myTeam || !player || !slot) {
      perf.end({ status: "empty" });
      return { changed: false, status: "empty" };
    }
    const id = normalizeText(deps, deps.getMyTeamPlayerId?.(player), 160);
    const beforeId = normalizeText(deps, beforePlayerId, 160);
    state.myTeam = myTeam;
    const mutation = assignScoutingMyTeamPlayerIdToSlot(state, {
      playerId: id,
      slotId: slot.id,
      beforePlayerId: beforeId,
    });
    if (!mutation.changed) {
      perf.end({ status: mutation.reason || "unchanged" });
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    if (deps.getSelectedPlayerId?.() === id) {
      deps.setSelectedPlayerId?.("");
    }
    finishWrite(deps);
    perf.end({ status: "updated", slot: slot.id });
    return { ...mutation, status: "updated" };
  }

  function removePlayerFromAllSlots(playerId = "") {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const normalizedPlayerId = normalizeText(deps, playerId, 160);
    if (!normalizedPlayerId) {
      return { changed: false, status: "empty" };
    }
    const state = getActionState(deps);
    const myTeam = deps.getMyTeamState?.(state);
    if (!state || !myTeam) {
      return { changed: false, status: "empty" };
    }
    state.myTeam = myTeam;
    const mutation = removeScoutingMyTeamPlayerIdFromAllSlots(state, normalizedPlayerId);
    if (!mutation.changed) {
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    if (deps.getSelectedPlayerId?.() === normalizedPlayerId) {
      deps.setSelectedPlayerId?.("");
    }
    finishWrite(deps);
    return { ...mutation, status: "updated" };
  }

  function removePlayerFromSlot(slotId, playerId = "") {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const myTeam = deps.getMyTeamState?.(state);
    const slot = deps.getShadowSlot?.(slotId);
    if (!state || !myTeam || !slot) {
      return { changed: false, status: "empty" };
    }
    state.myTeam = myTeam;
    const mutation = removeScoutingMyTeamPlayerIdFromSlot(state, { slotId: slot.id, playerId });
    if (!mutation.changed) {
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    finishWrite(deps);
    return { ...mutation, status: "updated" };
  }

  function setFormation(value) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const myTeam = deps.getMyTeamState?.(state);
    if (!state || !myTeam) {
      return { changed: false, status: "empty" };
    }
    myTeam.formation = deps.normalizeFormation?.(value) || "4-3-3";
    state.myTeam = myTeam;
    state.activeTab = "my-team";
    finishWrite(deps, "active-tab");
    return { changed: true, formation: myTeam.formation, status: "updated" };
  }

  function setSlotPitchPosition(slotId = "", xValue, yValue) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const slot = deps.getShadowSlot?.(slotId);
    const state = getActionState(deps);
    const myTeam = deps.getMyTeamState?.(state);
    if (!slot || !state || !myTeam) {
      return { changed: false, status: "empty" };
    }
    const formation = deps.normalizeFormation?.(myTeam.formation) || "4-3-3";
    const x = deps.normalizePitchCoordinate?.(xValue);
    const y = deps.normalizePitchCoordinate?.(yValue);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { changed: false, status: "empty" };
    }
    myTeam.positions = {
      ...(myTeam.positions || {}),
      [formation]: {
        ...(myTeam.positions?.[formation] || {}),
        [slot.id]: { x, y },
      },
    };
    state.myTeam = myTeam;
    finishWrite(deps);
    return { changed: true, slotId: slot.id, formation, position: { x, y }, status: "updated" };
  }

  return {
    assignPlayerToSlot,
    removePlayerFromAllSlots,
    removePlayerFromSlot,
    setFormation,
    setSlotPitchPosition,
  };
}
