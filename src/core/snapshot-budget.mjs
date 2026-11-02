// Logical serialized UTF-16 bytes, not browser quota or physical disk usage.
// These limits govern optional full-envelope history, never module save journals.
export const DEFAULT_SNAPSHOT_BUDGET = Object.freeze({
  maxSnapshots: 30,
  maxSnapshotBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
});

export function snapshotBytes(value) {
  return JSON.stringify(value).length * 2;
}

export function snapshotBudget(options = {}) {
  const budget = { ...DEFAULT_SNAPSHOT_BUDGET, ...options };
  for (const value of Object.values(budget)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid snapshot storage budget.');
  }
  return budget;
}

export function snapshotBudgetError() {
  return new Error('Extra local history paused: its storage limit was reached. Existing copies were kept. Check module save status separately.');
}

export function isSessionRecoverySnapshot(row) {
  return typeof row?.id === 'string' && row.id.startsWith('football-session-planner-v3-quota-fallback');
}
