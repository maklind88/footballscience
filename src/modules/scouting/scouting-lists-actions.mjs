import {
  addScoutingRecordIdToDecisionList,
  createScoutingDecisionList,
  deleteScoutingDecisionListById,
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

function finishWrite(deps = {}) {
  deps.writeState?.();
  deps.refreshWorkspaceAfterLocalMutation?.({ preserveFocus: true });
}

export function createScoutingListsActions(deps = {}) {
  function addRecordToList(recordId, listId) {
    const perf = startActionPerformance(deps, "list.add", { recordId, listId });
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
    const targetListId = normalizeText(deps, listId, 120) || state.lists?.[0]?.id;
    const record = deps.getRecordById?.(id);
    if (record) {
      deps.rememberRecordSnapshot?.(record, state);
    }
    const mutation = addScoutingRecordIdToDecisionList(state, { recordId: id, listId: targetListId });
    if (!mutation.changed) {
      perf.end({ status: mutation.reason || "unchanged" });
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    finishWrite(deps);
    perf.end({ status: "updated" });
    return { ...mutation, status: "updated" };
  }

  function createList(name) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const listName = normalizeText(deps, name, 80);
    if (!listName) {
      return { changed: false, status: "empty" };
    }
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, status: "empty" };
    }
    const mutation = createScoutingDecisionList(state, listName);
    if (!mutation.changed) {
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    finishWrite(deps);
    return { ...mutation, status: "updated" };
  }

  function deleteList(listId) {
    if (!canMutate(deps)) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const id = normalizeText(deps, listId, 120);
    const list = state?.lists?.find((item) => item.id === id);
    if (!state || !id || !list) {
      return { changed: false, listId: id, status: "empty" };
    }
    const confirmed = deps.confirm?.(`Delete scouting list "${list.name}"? Players stay in the scouting database.`) === true;
    if (!confirmed) {
      return { changed: false, listId: id, status: "cancelled" };
    }
    const mutation = deleteScoutingDecisionListById(state, id);
    if (!mutation.changed) {
      return { ...mutation, status: mutation.reason || "unchanged" };
    }
    finishWrite(deps);
    return { ...mutation, status: "updated" };
  }

  return {
    addRecordToList,
    createList,
    deleteList,
  };
}
