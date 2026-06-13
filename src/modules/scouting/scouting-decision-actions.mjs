import { defaultScoutingState, scoutingShadowSlots } from "./scouting-defaults.mjs";
import {
  cloneScoutingList,
  normalizeScoutingMyTeamSlots,
  normalizeScoutingRecordIds,
  normalizeScoutingText,
} from "./scouting-state.mjs";

function getScoutingDecisionSlotIds() {
  return new Set(scoutingShadowSlots.map((slot) => slot.id));
}

function getFirstScoutingDecisionSlotId() {
  return scoutingShadowSlots[0]?.id || "";
}

function normalizeScoutingDecisionLists(state = {}) {
  const lists = Array.isArray(state.lists) ? state.lists.map(cloneScoutingList).filter((list) => list.name) : [];
  return lists.length ? lists : [cloneScoutingList(defaultScoutingState.lists[0])];
}

function getScoutingDecisionShadowMetaKey(slotId = "", recordId = "") {
  return `${normalizeScoutingText(slotId, 40)}:${normalizeScoutingText(recordId, 160)}`;
}

export function toggleScoutingFavoriteRecordId(state = {}, recordId = "") {
  const id = normalizeScoutingText(recordId, 160);
  if (!state || !id) {
    return { changed: false, favorite: false, recordId: id, reason: "empty" };
  }
  const currentIds = normalizeScoutingRecordIds(state.favoriteRecordIds);
  const favorite = !currentIds.includes(id);
  state.favoriteRecordIds = favorite
    ? [id, ...currentIds.filter((candidateId) => candidateId !== id)]
    : currentIds.filter((candidateId) => candidateId !== id);
  return { changed: true, favorite, recordId: id };
}

export function addScoutingRecordIdToDecisionList(state = {}, options = {}) {
  const id = normalizeScoutingText(options.recordId, 160);
  if (!state || !id) {
    return { changed: false, recordId: id, listId: "", reason: "empty" };
  }
  const lists = normalizeScoutingDecisionLists(state);
  const targetListId = normalizeScoutingText(options.listId, 120) || lists[0]?.id || "";
  const targetList = lists.find((list) => list.id === targetListId);
  if (!targetList) {
    state.lists = lists;
    return { changed: false, recordId: id, listId: targetListId, reason: "missing-list" };
  }
  const nextRecordIds = normalizeScoutingRecordIds([id, ...targetList.recordIds]);
  const changed = nextRecordIds.join("\u0000") !== normalizeScoutingRecordIds(targetList.recordIds).join("\u0000");
  state.lists = lists.map((list) => (list.id === targetListId ? cloneScoutingList({ ...list, recordIds: nextRecordIds }) : list));
  return { changed, recordId: id, listId: targetListId, reason: changed ? "updated" : "already-present" };
}

export function createScoutingDecisionList(state = {}, name = "") {
  const listName = normalizeScoutingText(name, 80);
  if (!state || !listName) {
    return { changed: false, listId: "", reason: "empty" };
  }
  const lists = normalizeScoutingDecisionLists(state);
  const list = cloneScoutingList({ name: listName, recordIds: [] });
  state.lists = [list, ...lists];
  return { changed: true, listId: list.id };
}

export function deleteScoutingDecisionListById(state = {}, listId = "") {
  const id = normalizeScoutingText(listId, 120);
  if (!state || !id) {
    return { changed: false, listId: id, deletedList: null, reason: "empty" };
  }
  const lists = normalizeScoutingDecisionLists(state);
  const deletedList = lists.find((list) => list.id === id) || null;
  if (!deletedList) {
    state.lists = lists;
    return { changed: false, listId: id, deletedList: null, reason: "missing-list" };
  }
  const nextLists = lists.filter((list) => list.id !== id);
  state.lists = nextLists.length ? nextLists : [cloneScoutingList(defaultScoutingState.lists[0])];
  return { changed: true, listId: id, deletedList };
}

export function addScoutingRecordIdToShadowSlot(state = {}, options = {}) {
  const id = normalizeScoutingText(options.recordId, 160);
  const slotIds = getScoutingDecisionSlotIds();
  const slotId = normalizeScoutingText(options.slotId, 40) || normalizeScoutingText(state?.shadowXi?.selectedSlotId, 40) || getFirstScoutingDecisionSlotId();
  if (!state || !id || !slotIds.has(slotId)) {
    return { changed: false, recordId: id, slotId, reason: "empty" };
  }
  const shadowXi = state.shadowXi && typeof state.shadowXi === "object" ? state.shadowXi : {};
  const currentSlots = shadowXi.slots && typeof shadowXi.slots === "object" ? shadowXi.slots : {};
  const currentRecordIds = normalizeScoutingRecordIds(Array.isArray(currentSlots[slotId]) ? currentSlots[slotId] : currentSlots[slotId] ? [currentSlots[slotId]] : []);
  const nextRecordIds = [id, ...currentRecordIds.filter((candidateId) => candidateId !== id)];
  const metaKey = getScoutingDecisionShadowMetaKey(slotId, id);
  const currentMeta = shadowXi.meta && typeof shadowXi.meta === "object" ? shadowXi.meta : {};

  state.shadowXi = {
    ...shadowXi,
    slots: {
      ...currentSlots,
      [slotId]: nextRecordIds,
    },
    meta: {
      ...currentMeta,
      [metaKey]: {
        ...(currentMeta[metaKey] && typeof currentMeta[metaKey] === "object" ? currentMeta[metaKey] : {}),
        ...(options.meta && typeof options.meta === "object" ? options.meta : {}),
      },
    },
    selectedSlotId: slotId,
  };
  return { changed: true, recordId: id, slotId, metaKey };
}

export function assignScoutingMyTeamPlayerIdToSlot(state = {}, options = {}) {
  const playerId = normalizeScoutingText(options.playerId, 160);
  const slotId = normalizeScoutingText(options.slotId, 40);
  const beforeId = normalizeScoutingText(options.beforePlayerId, 160);
  const slotIds = getScoutingDecisionSlotIds();
  if (!state || !playerId || !slotIds.has(slotId)) {
    return { changed: false, playerId, slotId, reason: "empty" };
  }
  const myTeam = state.myTeam && typeof state.myTeam === "object" ? state.myTeam : {};
  const currentSlots = normalizeScoutingMyTeamSlots(myTeam.slots, slotIds);
  const currentSlotId = Object.entries(currentSlots).find(([, playerIds]) => playerIds.includes(playerId))?.[0] || "";
  if (currentSlotId === slotId && beforeId === playerId) {
    state.myTeam = { ...myTeam, slots: currentSlots };
    return { changed: false, playerId, slotId, reason: "unchanged" };
  }

  const nextSlots = {};
  Object.entries(currentSlots).forEach(([currentSlot, playerIds]) => {
    const filteredIds = playerIds.filter((currentPlayerId) => currentPlayerId !== playerId);
    if (filteredIds.length) {
      nextSlots[currentSlot] = filteredIds;
    }
  });

  const targetStack = Array.isArray(nextSlots[slotId]) ? nextSlots[slotId].slice() : [];
  const beforeIndex = beforeId && beforeId !== playerId ? targetStack.indexOf(beforeId) : -1;
  if (beforeIndex >= 0) {
    targetStack.splice(beforeIndex, 0, playerId);
  } else {
    targetStack.push(playerId);
  }
  nextSlots[slotId] = normalizeScoutingRecordIds(targetStack);
  state.myTeam = {
    ...myTeam,
    slots: nextSlots,
  };
  return { changed: true, playerId, slotId };
}
