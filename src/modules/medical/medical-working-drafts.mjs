// A working draft belongs to its reader and observed baseline, never to the cache.
// Successive edits against the same baseline replace that working version; a
// different baseline stays a separate unresolved branch. No central writes here.
export function createMedicalWorkingDrafts({ makeId = () => crypto.randomUUID() } = {}) {
  const branches = new Map(), active = new Map();
  function capture({ scope, value, previousValue, baseRevision, observedRevision = baseRevision }) {
    const existing = [...branches.values()].find(row => row.scope === scope && row.previousValue === previousValue
      && row.baseRevision === baseRevision && row.observedRevision === observedRevision);
    if (existing?.value === value) { active.set(scope, existing); return existing; }
    // Committed historical copies live in IndexedDB, not in this tab's working set.
    for (const [branch, row] of branches) if (row.scope === scope && row.durableId) branches.delete(branch);
    const row = { id: makeId(), schema: 1, scope, value, previousValue, baseRevision, observedRevision,
      createdAt: new Date().toISOString(), memoryOnly: true };
    if (existing) branches.delete(existing.id);
    branches.set(row.id, row);
    active.set(scope, row);
    return row;
  }
  function committed(row, result) {
    if (result?.id) row.durableId = result.id;
  }
  function list(scope) {
    return [...branches.values()].filter(row => row.scope === scope && !row.durableId);
  }
  function projectUnchangedBaseline(scope, raw, revision) {
    const row = active.get(scope);
    // A changed/removed central baseline must remain visible, with the local
    // branch separately available for review. Never merge clinical fields here.
    return row && row.observedRevision === revision && raw === row.previousValue ? row.value : undefined;
  }
  function forgetDurable(id) {
    for (const [branch, row] of branches) if (row.durableId === id) {
      branches.delete(branch);
      if (active.get(row.scope) === row) active.delete(row.scope);
    }
  }
  return { capture, committed, list, projectUnchangedBaseline, forgetDurable, beginEdit: scope => active.delete(scope) };
}
