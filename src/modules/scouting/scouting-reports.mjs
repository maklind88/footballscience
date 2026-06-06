export function renderScoutingReportsWorkspace(deps = {}) {
  const state = deps.ensureState();
  const renderSection = (label, renderer) => {
    if (typeof window === "undefined" || !window.__footballScienceScoutingPerfDebug) {
      return renderer();
    }
    const startedAt = performance.now();
    const html = renderer();
    console.log(`[scouting-render-performance] ${label}: ${Math.round(performance.now() - startedAt)}ms`);
    return html;
  };
  return `
    <div class="scouting-reports-shell">
      ${renderSection("reports.next-action", () => deps.renderNextActionCenter(state, { includeRecommendations: false }))}
      ${renderSection("reports.panel", () => deps.renderReportsPanel())}
      ${renderSection("reports.role-models", () => deps.renderRoleModelsPanel())}
      ${renderSection("reports.targets", () =>
        renderScoutingReportsLazyPanel(deps, "targets", "Funnel", "Pipeline board", "Load funnel", deps.renderTargetsPanel)
      )}
      ${renderSection("reports.budget", () => deps.renderBudgetBoard(state))}
    </div>
  `;
}

function renderScoutingReportsLazyPanel(deps, panelId, title, detail, actionLabel, renderer) {
  const id = deps.normalizeText(panelId, 80);
  if (deps.expandedPanels.has(id)) {
    return renderer();
  }
  return `
    <section class="scouting-role-models scouting-role-model-launcher" data-scouting-reports-lazy-panel="${deps.escapeHtml(id)}">
      <div class="scouting-role-model-head">
        <div>
          <p class="placeholder-tag">${deps.escapeHtml(detail)}</p>
          <h2>${deps.escapeHtml(title)}</h2>
        </div>
        <div class="scouting-role-model-toolbar">
          <button type="button" class="scouting-primary-button" data-expand-scouting-reports-panel="${deps.escapeHtml(id)}">${deps.escapeHtml(actionLabel)}</button>
        </div>
      </div>
    </section>
  `;
}
