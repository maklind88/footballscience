import { createTeamPerformanceAdapter } from "./team-performance-adapter.mjs";
import { renderTeamPerformance } from "./team-performance-renderer.mjs";

function initialState() {
  return { snapshot: null, filters: { offset: 0 }, view: "overview", preview: null, busy: false, busyLabel: "", error: "", message: "" };
}
export function createTeamPerformanceController(getContext = () => ({}), options = {}) {
  const request = options.request || createTeamPerformanceAdapter(getContext);
  let state = initialState();
  let root = null;
  let identity = "";
  let started = false;
  let pending = null;
  let sequence = 0;

  function paint(focusKey = "") {
    if (!root) return;
    root.innerHTML = renderTeamPerformance(state);
    if (focusKey) root.querySelector(`[data-performance-filter="${focusKey}"]`)?.focus();
  }
  async function run(command = null, focusKey = "") {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const seq = ++sequence;
    const timeout = setTimeout(() => controller.abort(), 60000);
    state.busy = true; state.error = ""; state.message = "";
    state.busyLabel = command ? command.action === "confirm-import" ? "Importing reviewed version..." : "Checking source..." : "Loading saved statistics...";
    paint();
    try {
      const result = await request(state.filters, command, controller.signal);
      if (seq !== sequence) return;
      if (!command) state.snapshot = result;
      else if (command.action === "preview-import") state.preview = result.preview;
      else {
        state.preview = null;
        state.filters = { offset: 0 };
        const snapshot = await request(state.filters, null, controller.signal);
        if (seq !== sequence) return;
        state.snapshot = snapshot;
        state.message = result.receipt.unchanged ? "Saved version is already current." : `Version ${result.receipt.revision} imported.`;
      }
    } catch (error) {
      if (seq !== sequence) return;
      if (!command) state.snapshot = null;
      state.preview = null;
      state.error = controller.signal.aborted ? "The request timed out. Reload to check the saved version." : error.message;
    } finally {
      clearTimeout(timeout);
      if (seq === sequence) { state.busy = false; pending = null; paint(focusKey); }
    }
  }
  function click(event) {
    const target = event.target.closest("button");
    if (!target || target.disabled || !root?.contains(target)) return;
    if (target.dataset.performanceView) {
      state.view = target.dataset.performanceView; paint();
      root?.querySelector(`[data-performance-view="${state.view}"]`)?.focus();
      return;
    }
    if (state.busy) return;
    if (target.dataset.performanceMatch) {
      state.filters.match = target.dataset.performanceMatch; state.filters.offset = 0; state.view = "events"; void run(); return;
    }
    if (target.dataset.performancePage) {
      state.filters.offset = Math.max(0, (state.filters.offset || 0) + (target.dataset.performancePage === "next" ? 50 : -50)); void run(); return;
    }
    const action = target.dataset.performanceAction;
    if (action === "reload") { state.preview = null; void run(); }
    if (action === "preview") void run({ action: "preview-import" });
    if (action === "cancel") { state.preview = null; paint(); }
    if (action === "confirm" && state.preview) void run({ action: "confirm-import", expectedHash: state.preview.hash, expectedRevision: state.preview.expectedRevision });
  }
  function change(event) {
    const key = event.target.dataset.performanceFilter;
    if (!key || state.busy) return;
    state.filters[key] = event.target.value;
    state.filters.offset = 0; state.preview = null;
    void run(null, key);
  }
  function unmount() {
    if (root) { root.removeEventListener("click", click); root.removeEventListener("change", change); }
    pending?.abort(); pending = null; sequence += 1; root = null; started = false;
    state = initialState();
  }
  function mount(element) {
    if (!element) { if (root) unmount(); return; }
    const context = getContext();
    const user = context.currentUser || context.user || context.getCurrentUser?.() || {};
    const key = `${user.id || context.userId || ""}:${context.platformTeamId || context.team?.id || context.teamId || ""}`;
    if (key !== identity) { unmount(); identity = key; }
    if (root !== element) {
      root?.removeEventListener("click", click); root?.removeEventListener("change", change);
      root = element; root.addEventListener("click", click); root.addEventListener("change", change);
    }
    paint();
    if (!started) { started = true; void run(); }
  }
  return { mount, unmount, getState: () => state };
}
