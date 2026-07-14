const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createAdminHealthCockpitRenderer({
  escapeHtml = defaultEscapeHtml,
  normalizeReadinessStatus = (status) => (["pass", "warning", "missing"].includes(status) ? status : "warning"),
  renderReadinessStatus = (status) => `<span class="pr-status is-${escapeHtml(status)}">${escapeHtml(status)}</span>`,
} = {}) {
  const esc = escapeHtml;

  function getItems(report = {}) {
    return Array.isArray(report.healthCockpit) ? report.healthCockpit : [];
  }

  function summarizeItems(items = []) {
    const list = Array.isArray(items) ? items : [];
    return {
      total: list.length,
      ready: list.filter((item) => normalizeReadinessStatus(item.status) === "pass").length,
      warning: list.filter((item) => normalizeReadinessStatus(item.status) === "warning").length,
      missing: list.filter((item) => normalizeReadinessStatus(item.status) === "missing").length,
    };
  }

  function renderSummary(report = {}) {
    const items = getItems(report);
    const summary = report.healthCockpitSummary || summarizeItems(items);
    const history = report.healthHistorySummary || {};
    const historyLabel = history.snapshots
      ? `${history.snapshots} · ${history.trend || "stable"}`
      : "No history";
    return `
      <section class="pr-score-grid" aria-label="Platform health summary">
        <div><span>Signals</span><strong>${esc(summary.ready || 0)} / ${esc(summary.total || 0)}</strong></div>
        <div><span>Warnings</span><strong>${esc(summary.warning || 0)}</strong></div>
        <div><span>Actions</span><strong>${esc(summary.missing || 0)}</strong></div>
        <div><span>History</span><strong>${esc(`Read-only · ${historyLabel}`)}</strong></div>
      </section>
    `;
  }

  function renderItem(item = {}) {
    const status = normalizeReadinessStatus(item.status);
    const title = item.label || item.id || "Health signal";
    const details = item.details || item.nextStep || "No details reported.";
    const meta = [item.group, item.owner].filter(Boolean).join(" · ");
    const nextStep = item.nextStep ? `<span>${esc(item.nextStep)}</span>` : "";
    return `
      <article class="pr-section is-${esc(status)}" data-platform-health-item="${esc(item.id || "")}">
        <div>
          <strong>${esc(title)}</strong>
          <p>${esc(details)}</p>
          ${meta ? `<p>${esc(meta)}</p>` : ""}
          ${nextStep}
        </div>
        ${renderReadinessStatus(status)}
      </article>
    `;
  }

  function renderHealthCockpit(report = {}) {
    const items = getItems(report);
    if (!items.length) {
      return "";
    }
    return `
      <section class="pr-health-cockpit" aria-label="Platform health cockpit">
        ${renderSummary(report)}
        <section class="pr-section-grid">${items.map(renderItem).join("")}</section>
      </section>
    `;
  }

  return {
    getItems,
    renderHealthCockpit,
    renderItem,
    renderSummary,
    summarizeItems,
  };
}
