// Read-only consumer of Sessions' public journal contract. A full-calendar cache
// or a caller flag is never a substitute for a committed, scoped pending operation.
export async function verifySessionJournalReplay(bridge, key, scope) {
  const current = () => Boolean(scope) && bridge.getReadScope?.() === scope;
  if (!current()) return { ok: false, staleContext: true };
  if (bridge.canAutoSyncKey?.(key) !== true) return { ok: false, status: 403, durablePending: true,
    reason: 'Local changes retained; access denied.' };
  const pending = await bridge.getSessionPendingState();
  if (!current()) return { ok: false, staleContext: true };
  if (bridge.canAutoSyncKey?.(key) !== true) return { ok: false, status: 403, durablePending: true,
    reason: 'Local changes retained; access denied.' };
  if (typeof pending !== 'string' || !pending) return { ok: false,
    reason: 'Pending training could not be verified in local save storage. Refresh before retrying.' };
  if (bridge.getSessionWorkingCopy()) return { ok: false,
    reason: 'Newer training changes are not saved on this device. Keep this page open and retry.' };
  return { ok: true };
}
