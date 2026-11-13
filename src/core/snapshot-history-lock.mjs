// Both legacy and compact history must hold the same origin-wide lock until
// their transaction finishes. This does not fence code predating the protocol.
export async function withSnapshotHistoryLock(operation, { locks, timeoutMs = 4000 } = {}) {
  if (!locks?.request) return operation(); // Legacy IDB transactions remain atomic.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await locks.request('footballscience-history-write-v1', { signal: controller.signal }, async () => {
      clearTimeout(timer); // A timed-out wait must never run later; an active write must finish.
      return operation();
    });
  } finally { clearTimeout(timer); }
}
