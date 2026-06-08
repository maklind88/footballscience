function defaultEscapeHtml(value) {
  return String(value ?? "");
}

export function createSessionPlannerToastController(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getState = typeof options.getState === "function" ? options.getState : () => ({});
  const getWorkspace = typeof options.getWorkspace === "function" ? options.getWorkspace : () => null;
  const win = options.win || globalThis;

  function render() {
    const workspace = getWorkspace();
    if (!workspace) return;
    const state = getState();
    const existingToast = workspace.querySelector("[data-session-toast]");
    if (!state.sessionPlannerToastMessage) {
      existingToast?.remove();
      return;
    }
    const toastMarkup = `
    <div class="session-toast is-${escapeHtml(state.sessionPlannerToastTone)}" data-session-toast role="status" aria-live="polite">
      <strong>${escapeHtml(state.sessionPlannerToastMessage)}</strong>
    </div>
  `;
    if (existingToast) {
      existingToast.outerHTML = toastMarkup;
      return;
    }
    workspace.insertAdjacentHTML("beforeend", toastMarkup);
  }

  function show(message, tone = "success") {
    const state = getState();
    state.sessionPlannerToastMessage = String(message || "");
    state.sessionPlannerToastTone = tone;
    render();
    if (state.sessionPlannerToastTimeoutId) {
      win.clearTimeout(state.sessionPlannerToastTimeoutId);
    }
    state.sessionPlannerToastTimeoutId = win.setTimeout(() => {
      state.sessionPlannerToastMessage = "";
      render();
    }, 3200);
  }

  return {
    render,
    show,
  };
}
