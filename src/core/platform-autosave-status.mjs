const supportedAutosaveStates = new Set(["saved", "saving", "issue", "conflict"]);

export function getPlatformAutosaveStatusLabel(state = "saved") {
  if (state === "saving") return "Saving";
  if (state === "issue" || state === "conflict") return "Sync issue";
  return "Saved";
}

export function createPlatformAutosaveStatusController(options = {}) {
  const doc = options.documentRef || globalThis.document || null;
  const win = options.windowRef || globalThis.window || null;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const escape =
    typeof options.escapeHtml === "function"
      ? options.escapeHtml
      : (value) =>
          String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

  let status = {
    state: "saved",
    message: "Saved",
    updatedAt: "",
  };
  let idleTimer = null;
  let isIdle = true;
  let visible = options.visible !== false;

  function getStatusElement() {
    if (!doc?.body) {
      return null;
    }
    let statusElement = doc.querySelector("[data-platform-autosave-status]");
    if (!statusElement) {
      statusElement = doc.createElement("div");
      statusElement.className = "platform-autosave-status";
      statusElement.dataset.platformAutosaveStatus = "";
      statusElement.setAttribute("role", "status");
      statusElement.setAttribute("aria-live", "polite");
      statusElement.hidden = !visible;
      doc.body.appendChild(statusElement);
    }
    return statusElement;
  }

  function render() {
    const statusElement = getStatusElement();
    if (!statusElement) {
      return;
    }
    statusElement.hidden = !visible;
    if (!visible) {
      return;
    }
    const state = status.state || "saved";
    const label = getPlatformAutosaveStatusLabel(state);
    const detail = status.message && status.message !== label ? status.message : "";
    statusElement.className = `platform-autosave-status is-${state}${isIdle && state === "saved" ? " is-idle" : ""}`;
    statusElement.innerHTML = `
      <span class="platform-autosave-status-dot" aria-hidden="true"></span>
      <strong>${escape(label)}</strong>
      ${detail ? `<small>${escape(detail)}</small>` : ""}
    `;
  }

  function set(state = "saved", message = "") {
    const nextState = supportedAutosaveStates.has(state) ? state : "saved";
    status = {
      state: nextState,
      message: String(message || getPlatformAutosaveStatusLabel(nextState)),
      updatedAt: now(),
    };
    if (idleTimer && win?.clearTimeout) {
      win.clearTimeout(idleTimer);
      idleTimer = null;
    }
    isIdle = false;
    render();
    if (nextState === "saved" && win?.setTimeout) {
      idleTimer = win.setTimeout(() => {
        idleTimer = null;
        isIdle = true;
        render();
      }, 2200);
    }
  }

  function setVisible(nextVisible = true) {
    visible = Boolean(nextVisible);
    render();
  }

  return Object.freeze({
    getStatus: () => ({ ...status }),
    render,
    set,
    setVisible,
  });
}
