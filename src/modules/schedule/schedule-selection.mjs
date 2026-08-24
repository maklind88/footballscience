function normalizeSelectionId(value) {
  return String(value || "").trim();
}

function toSelectionIds(values) {
  if (values instanceof Set || Array.isArray(values)) {
    return Array.from(values, normalizeSelectionId).filter(Boolean);
  }
  const value = normalizeSelectionId(values);
  return value ? [value] : [];
}

export function createScheduleEventSelection(initialIds = []) {
  const selectedIds = new Set(toSelectionIds(initialIds));

  function clear() {
    const changed = selectedIds.size > 0;
    selectedIds.clear();
    return changed;
  }

  function replace(eventId) {
    const normalizedId = normalizeSelectionId(eventId);
    const changed = selectedIds.size !== 1 || !selectedIds.has(normalizedId);
    selectedIds.clear();
    if (normalizedId) {
      selectedIds.add(normalizedId);
    }
    return changed;
  }

  function restore(eventIds = []) {
    selectedIds.clear();
    toSelectionIds(eventIds).forEach((eventId) => selectedIds.add(eventId));
  }

  function toggle(eventId) {
    const normalizedId = normalizeSelectionId(eventId);
    if (!normalizedId) {
      return false;
    }
    if (selectedIds.has(normalizedId)) {
      selectedIds.delete(normalizedId);
      return false;
    }
    selectedIds.add(normalizedId);
    return true;
  }

  function remove(eventIds = []) {
    let changed = false;
    toSelectionIds(eventIds).forEach((eventId) => {
      changed = selectedIds.delete(eventId) || changed;
    });
    return changed;
  }

  function retain(eventIds = []) {
    const validIds = new Set(toSelectionIds(eventIds));
    let changed = false;
    selectedIds.forEach((eventId) => {
      if (!validIds.has(eventId)) {
        selectedIds.delete(eventId);
        changed = true;
      }
    });
    return changed;
  }

  function primary() {
    const values = Array.from(selectedIds);
    return values[values.length - 1] || "";
  }

  return Object.freeze({
    clear,
    has: (eventId) => selectedIds.has(normalizeSelectionId(eventId)),
    primary,
    remove,
    replace,
    restore,
    retain,
    size: () => selectedIds.size,
    toggle,
    values: () => Array.from(selectedIds),
  });
}
