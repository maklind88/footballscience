// View choices are tab-local and scoped to the current authorized central reader.
// They never mutate the clinical blob or its pending save generation.
export function createMedicalViewPreferences({ win = globalThis, isDateValue = () => false, logEvent = () => {} } = {}) {
  function getMedicalViewScope() {
    return win.footballScienceCentralState?.getReadScope?.() || "";
  }

  function apply(state) {
    try {
      const scope = getMedicalViewScope();
      const view = JSON.parse(win.sessionStorage?.getItem("football-medical-view-v1") || "null");
      if (!scope || view?.scope !== scope) return state;
      if (isDateValue(view.selectedDate)) state.selectedDate = view.selectedDate;
      if (state.players?.some(player => player.id === view.selectedPlayerId && !player.archivedAt && !player.deletedAt)) {
        state.selectedPlayerId = view.selectedPlayerId;
      }
    } catch { /* View preferences are optional; the authorized clinical read is not. */ }
    return state;
  }

  function write(state) {
    if (!state) return;
    try {
      const scope = getMedicalViewScope();
      if (!scope || !win.sessionStorage) return false;
      // Never modify the clinical generation: a focused view can lag behind a
      // central read, and even UI-only edits to that blob invalidate pending receipts.
      win.sessionStorage.setItem("football-medical-view-v1", JSON.stringify({
        scope, selectedDate: state.selectedDate, selectedPlayerId: state.selectedPlayerId,
      }));
      return true;
    } catch {
      logEvent("Medical view selection is kept in memory; browser preferences could not be updated.");
      return false;
    }
  }

  return { apply, write };
}
