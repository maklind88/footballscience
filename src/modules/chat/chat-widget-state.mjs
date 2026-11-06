// Navigation is session state. Persisting a convenience copy must never block it.
export function createChatWidgetState({ getCurrentUser, readJson, writeJson, storageKey, normalizeThreadId, teamThreadId }) {
  let scope = null;
  let state = { isOpen: false, selectedThreadId: teamThreadId };

  function syncScope() {
    const user = getCurrentUser();
    // Auth may still be loading. Defer the first disk read until a user exists.
    if (scope === null && !user?.id) return;
    const nextScope = JSON.stringify([user?.id || "", user?.organizationId || "", user?.teamId || ""]);
    if (scope === nextScope) return;
    // Only the initial load may use the existing preference. A changed principal
    // must not inherit the previous session's memory or its stale disk copy.
    let selectedThreadId = teamThreadId;
    if (scope === null) {
      try { selectedThreadId = normalizeThreadId(readJson(storageKey, {})?.selectedThreadId, teamThreadId); }
      catch { /* Storage can be unavailable even for reads. */ }
    }
    scope = nextScope;
    state = { isOpen: false, selectedThreadId };
  }

  function read() {
    syncScope();
    return { ...state };
  }

  function write(nextState) {
    syncScope();
    state = {
      isOpen: Boolean(nextState?.isOpen),
      selectedThreadId: normalizeThreadId(nextState?.selectedThreadId, teamThreadId),
    };
    try {
      writeJson(storageKey, { ...state, isOpen: false });
    } catch {
      // Keep navigation usable if a storage adapter throws instead of logging.
    }
  }

  return { read, write };
}
