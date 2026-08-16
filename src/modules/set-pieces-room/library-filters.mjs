const filterGroups = Object.freeze(["moment", "restart", "subPhase"]);

function toValueSet(candidate) {
  if (candidate instanceof Set) return new Set(candidate);
  return new Set(Array.isArray(candidate) ? candidate : []);
}

export function createSetPieceLibraryFilters(candidate = {}) {
  return Object.fromEntries(filterGroups.map((group) => [group, toValueSet(candidate[group])]));
}

export function countSetPieceLibraryFilters(filters = {}) {
  return filterGroups.reduce((total, group) => total + toValueSet(filters[group]).size, 0);
}

export function updateSetPieceLibraryFilter(filters = {}, group = "", value = "", checked = false) {
  const next = createSetPieceLibraryFilters(filters);
  if (!filterGroups.includes(group) || !value) return next;
  if (checked) next[group].add(value);
  else next[group].delete(value);
  return next;
}

export function clearSetPieceLibraryFilters() {
  return createSetPieceLibraryFilters();
}

export function matchesSetPieceLibraryFilters(play = {}, filters = {}) {
  const normalized = createSetPieceLibraryFilters(filters);
  if (normalized.moment.size && !normalized.moment.has(play.moment)) return false;
  if (normalized.restart.size && !normalized.restart.has(play.restart)) return false;
  const playSubPhases = new Set(Array.isArray(play.subPhases) ? play.subPhases : []);
  if (normalized.subPhase.size && ![...normalized.subPhase].some((value) => playSubPhases.has(value))) return false;
  return true;
}
