import { normalizeShareTarget, normalizeSmartCollection } from "./presentationService.js";

export function sortSmartCollections(collections = []) {
  return collections
    .map(normalizeSmartCollection)
    .sort((a, b) => {
      const pinnedDiff = Number(Boolean(b.metadata?.pinned)) - Number(Boolean(a.metadata?.pinned));
      if (pinnedDiff) return pinnedDiff;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
}

export function findSmartCollection(state = {}, id = "") {
  const key = String(id || "").trim();
  return (state.presentation?.smartCollections || [])
    .map(normalizeSmartCollection)
    .find((collection) => collection.id === key || collection.title === key) || null;
}

export function smartCollectionDraftFromCollection(collection = {}) {
  const normalized = normalizeSmartCollection(collection);
  return {
    id: normalized.id,
    title: normalized.title,
    description: normalized.description,
    visibility: normalized.visibility,
    sortMode: normalized.sortMode,
    pinned: Boolean(normalized.metadata?.pinned),
    shareTargets: normalized.shareTargets,
    targetType: "role",
    targetId: "",
    accessLevel: "view",
  };
}

export function shareTargetFromDraft(draft = {}, emptyMessage = "Choose a share target first.") {
  const targetType = draft.targetType || "role";
  const targetId = String(draft.targetId || (targetType === "team" ? "team" : targetType === "role" ? "coach" : "")).trim();
  if (!targetId) return { error: emptyMessage, target: null };
  return {
    error: "",
    target: normalizeShareTarget({
      targetType,
      targetId,
      accessLevel: draft.accessLevel || (targetType === "role" ? "edit" : "view"),
    }),
  };
}
