function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createPlatformNavigationRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getTopIconSvg = typeof options.getTopIconSvg === "function" ? options.getTopIconSvg : () => "";
  const getTopIconLabel = typeof options.getTopIconLabel === "function" ? options.getTopIconLabel : (workspace = {}) => workspace.title || workspace.id || "";

  function renderPlatformNavItem(workspace, activeWorkspaceId, extraClass = "") {
    const label = getTopIconLabel(workspace);
    const activeClass = workspace.id === activeWorkspaceId ? " is-active" : "";
    return `
          <button type="button" class="platform-nav-item${extraClass}${activeClass}" data-open-workspace="${escapeHtml(workspace.id)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
            <span class="platform-nav-icon" aria-hidden="true">${getTopIconSvg(workspace.id)}</span>
            <span class="platform-nav-text">
              <strong>${escapeHtml(label)}</strong>
              <small>${escapeHtml(workspace.meta)}</small>
            </span>
          </button>
        `;
  }

  function renderTopIconMenu({ workspaces = [], activeWorkspaceId = "", hasHomeNotification = false } = {}) {
    return workspaces
      .map((workspace) => {
        const isActive = workspace.id === activeWorkspaceId;
        const label = getTopIconLabel(workspace);
        const hasNotification = workspace.id === "home" && hasHomeNotification;
        return `
        <button
          type="button"
          class="top-icon-menu-item${isActive ? " is-active" : ""}${hasNotification ? " has-notification" : ""}"
          data-open-workspace="${escapeHtml(workspace.id)}"
          aria-label="${escapeHtml(hasNotification ? `${label}, new activity` : label)}"
        >
          <span class="top-icon-menu-graphic">${getTopIconSvg(workspace.id)}</span>
          <span class="top-icon-menu-label">${escapeHtml(label)}</span>
        </button>
      `;
      })
      .join("");
  }

  function renderPlatformWorkspaceList({ primaryWorkspaces = [], overflowWorkspaces = [], activeWorkspaceId = "" } = {}) {
    const hasActiveOverflowWorkspace = overflowWorkspaces.some((workspace) => workspace.id === activeWorkspaceId);
    const overflowMarkup = overflowWorkspaces.length
      ? `
        <details class="platform-nav-more">
          <summary class="platform-nav-item platform-nav-more-trigger${hasActiveOverflowWorkspace ? " is-active" : ""}" aria-label="More sections" title="More sections">
            <span class="platform-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="5" cy="12" r="1.5"></circle>
                <circle cx="12" cy="12" r="1.5"></circle>
                <circle cx="19" cy="12" r="1.5"></circle>
              </svg>
            </span>
            <span class="platform-nav-text">
              <strong>More</strong>
              <small>Team, admin, identity</small>
            </span>
          </summary>
          <div class="platform-nav-more-menu" role="menu" aria-label="More platform sections">
            ${overflowWorkspaces.map((workspace) => renderPlatformNavItem(workspace, activeWorkspaceId, " platform-nav-more-item")).join("")}
          </div>
        </details>
      `
      : "";
    return `${primaryWorkspaces.map((workspace) => renderPlatformNavItem(workspace, activeWorkspaceId)).join("")}${overflowMarkup}`;
  }

  function renderWorkspaceList({ visibleWorkspaces = [], activeWorkspaceId = "", isPlatformNav = false, primaryWorkspaces = [], overflowWorkspaces = [] } = {}) {
    if (isPlatformNav) {
      return renderPlatformWorkspaceList({ primaryWorkspaces, overflowWorkspaces, activeWorkspaceId });
    }
    return visibleWorkspaces
      .map((workspace) => {
        const activeClass = workspace.id === activeWorkspaceId ? " is-active" : "";
        return `
        <button type="button" class="workspace-nav-item${activeClass}" data-open-workspace="${workspace.id}">
          <div class="workspace-nav-head">
            <span class="workspace-nav-title">${escapeHtml(workspace.title)}</span>
            <span class="workspace-nav-status">${escapeHtml(workspace.status)}</span>
          </div>
          <span class="workspace-nav-meta">${escapeHtml(workspace.meta)}</span>
          <span class="workspace-nav-copy">${escapeHtml(workspace.description)}</span>
        </button>
      `;
      })
      .join("");
  }

  function renderWorkspaceQuickSwitchOptions(workspaces = []) {
    return workspaces
      .map((workspace) => `<option value="${escapeHtml(workspace.id)}">${escapeHtml(workspace.title)}</option>`)
      .join("");
  }

  return {
    renderTopIconMenu,
    renderWorkspaceList,
    renderWorkspaceQuickSwitchOptions,
  };
}
