function normalizeIdPart(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "overview";
}

export function renderScoutingProfileTabNavigation(options = {}) {
  const tabs = Array.isArray(options.tabs) ? options.tabs : [];
  const activeTab = String(options.activeTab || tabs[0]?.value || "overview");
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : (value) => String(value ?? "");
  const idPrefix = normalizeIdPart(options.idPrefix || "scouting-profile");

  return `
    <nav class="scouting-profile-tabs" role="tablist" aria-label="Scouting profile sections">
      ${tabs
        .map((tab) => {
          const tabValue = String(tab?.value || "");
          const tabId = normalizeIdPart(tabValue);
          const selected = activeTab === tabValue;
          return `
            <button
              type="button"
              id="${idPrefix}-tab-${tabId}"
              class="${selected ? "is-active" : ""}"
              role="tab"
              aria-selected="${selected ? "true" : "false"}"
              aria-controls="${idPrefix}-panel-${tabId}"
              tabindex="${selected ? "0" : "-1"}"
              data-scouting-profile-tab="${escapeHtml(tabValue)}"
            >
              ${escapeHtml(tab?.label || tabValue)}
            </button>
          `;
        })
        .join("")}
    </nav>
  `;
}

export function renderScoutingProfileTabPanel(options = {}) {
  const activeTab = normalizeIdPart(options.activeTab || "overview");
  const idPrefix = normalizeIdPart(options.idPrefix || "scouting-profile");
  const content = String(options.content || "");

  return `
    <div
      id="${idPrefix}-panel-${activeTab}"
      class="scouting-profile-tab-panel is-active"
      role="tabpanel"
      aria-labelledby="${idPrefix}-tab-${activeTab}"
      data-scouting-profile-active-panel="${activeTab}"
    >
      ${content}
    </div>
  `;
}
