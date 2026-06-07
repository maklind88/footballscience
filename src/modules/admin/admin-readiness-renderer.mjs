import { formatAdminDateTime } from "./admin-display-helpers.mjs";

const readinessStatusLabels = Object.freeze({
  pass: "Ready",
  warning: "Needs attention",
  missing: "Missing",
});

const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createAdminReadinessRenderer({
  escapeHtml = defaultEscapeHtml,
  getReadinessState = () => ({}),
  readAppearanceState,
  getHomeAppearanceImpactSummary,
  platformAppearanceDensityOptions = [],
  platformAppearanceHomeComponentTypeIds = [],
  platformAppearanceHomeSectionDefaults = [],
  platformAppearanceThemeOptions = [],
  platformAppearanceToneOptions = [],
} = {}) {
  const normalizeReadinessStatus = (status) =>
    ["pass", "warning", "missing"].includes(status) ? status : "warning";

  const renderReadinessStatus = (status) => {
    const normalizedStatus = normalizeReadinessStatus(status);
    return `<span class="pr-status is-${escapeHtml(normalizedStatus)}">${escapeHtml(
      readinessStatusLabels[normalizedStatus] || normalizedStatus
    )}</span>`;
  };

  const renderReadinessEmptyState = () => {
    const { loading, loadError } = getReadinessState();
    if (loading) {
      return `<div class="pr-empty">Loading readiness...</div>`;
    }
    if (loadError) {
      return `<div class="pr-empty is-error">${escapeHtml(loadError)}</div>`;
    }
    return `<div class="pr-empty">Readiness loads from admin API.</div>`;
  };

  const createReadinessFallbackReport = () => ({
    summary: { readySections: 0, totalSections: 0, totalModules: 0, legacyModules: 0 },
    sections: [],
    modules: [],
    environment: [],
    observabilitySignals: [],
  });

  const renderReadinessDashboard = () => {
    const { report: readinessReport, loading, loadError, loadedAt } = getReadinessState();
    const report = readinessReport || createReadinessFallbackReport();
    const esc = escapeHtml;
    const sections = Array.isArray(report.sections) ? report.sections : [];
    const modules = Array.isArray(report.modules) ? report.modules : [];
    const environment = Array.isArray(report.environment) ? report.environment : [];
    const signals = Array.isArray(report.observabilitySignals) ? report.observabilitySignals : [];
    const live = report.liveSignals || [];
    const priorities = Array.isArray(report.operatingPriorities) ? report.operatingPriorities : [];
    const migrations = Array.isArray(report.databasePrimaryMigrationPlan) ? report.databasePrimaryMigrationPlan : [];
    const scouting = report.scoutingPerformance || {};
    const score = report.summary ? `${report.summary.readySections}/${report.summary.totalSections}` : "0/0";
    const missingEnv = environment.filter((entry) => normalizeReadinessStatus(entry.status) === "missing").length;
    const overallStatus = normalizeReadinessStatus(report.overallStatus);
    const nextPriority = priorities[0] || null;
    const compactRow = (title, subtitle = "", status = "") =>
      `<article class="pr-signal-row"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span>${status ? renderReadinessStatus(status) : ""}</article>`;
    const moduleRow = (title, meta, scope, status) =>
      `<article class="pr-module-row"><div><strong>${esc(title)}</strong><small>${esc(meta)}</small></div><span>${esc(scope || "")}</span>${renderReadinessStatus(status)}</article>`;
    const detailPanel = (title, rows) =>
      `<div><h3>${esc(title)}</h3><div class="pr-list">${rows || renderReadinessEmptyState()}</div></div>`;
    const sectionCards = sections
      .map(
        (section) =>
          `<article class="pr-section is-${esc(normalizeReadinessStatus(section.status))}"><div><strong>${esc(section.label)}</strong><p>${esc(section.details)}</p></div>${renderReadinessStatus(section.status)}</article>`
      )
      .join("");
    const priorityRows = priorities
      .slice(0, 6)
      .map((priority) => compactRow(`P${priority.priority} · ${priority.label}`, priority.nextStep || priority.target || priority.risk || ""))
      .join("");
    const migrationRows = migrations
      .slice(0, 10)
      .map((item) => compactRow(`P${item.priority} · ${item.moduleId}`, item.nextStep || item.target || ""))
      .join("");
    const scoutingRows = `${compactRow("First page", `${scouting?.datasetRules?.firstPageMaxRecords || 0} records`)}${compactRow(
      "Worker",
      scouting?.datasetRules?.requiresWorkerSource ? "Required" : "Not required"
    )}${compactRow("Signals", `${scouting?.requiredSignals?.length || 0}`)}`;
    const moduleRows = modules
      .slice(0, 14)
      .map((module) => moduleRow(module.label || module.id, `${module.id} · ${module.implementation || "unclassified"}`, module.scope || "scope", module.status))
      .join("");
    const environmentRows = environment
      .map(
        (entry) =>
          `<article class="pr-env-row is-${esc(normalizeReadinessStatus(entry.status))}"><div><strong>${esc(entry.label)}</strong><small>${esc(entry.location)}</small></div><span>${esc(entry.missing?.length ? entry.missing.join(", ") : "OK")}</span>${renderReadinessStatus(entry.status)}</article>`
      )
      .join("");
    const signalRows = signals.map((signal) => compactRow(signal.label, signal.source)).join("");
    const liveRows = live.map((signal) => compactRow(signal.label, signal.details || signal.source, signal.status)).join("");

    return `
    <article class="admin-card pr-card">
      <div class="staff-card-head">
        <div>
          <h2>Platform Health</h2>
          <span>${loadedAt ? `Updated ${esc(formatAdminDateTime(loadedAt))}` : "Platform Readiness"}</span>
        </div>
        <button type="button" class="admin-send-button" data-pr-refresh>Refresh</button>
      </div>
      ${
        !readinessReport && (loading || loadError)
          ? renderReadinessEmptyState()
          : `
      <section class="pr-section is-${esc(overallStatus)}">
        <div><strong>Live Health</strong><p>${esc(nextPriority?.nextStep || `Ready ${score}, Missing env ${missingEnv}.`)}</p></div>${renderReadinessStatus(overallStatus)}
      </section>
      <section class="pr-section-grid">${sectionCards}</section>
      <section class="pr-detail-grid">
        ${detailPanel("Live Signals", liveRows)}
        ${detailPanel("Next Actions", priorityRows)}
        ${detailPanel("Database Migration", migrationRows)}
        ${detailPanel("Scouting Speed", scoutingRows)}
        ${detailPanel("Module Map", moduleRows)}
        ${detailPanel("Secrets & Staging", environmentRows)}
        ${detailPanel("Observability", signalRows)}
      </section>
      `
      }
    </article>
  `;
  };

  const renderAppearanceSelect = (name, options, selectedValue, labelMap = {}) => `
    <select name="${escapeHtml(name)}">
      ${options
        .map(
          (option) =>
            `<option value="${escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${escapeHtml(labelMap[option] || option)}</option>`
        )
        .join("")}
    </select>
  `;

  const formatAppearanceImpact = (impact) => {
    if (!impact?.count) {
      return `<div class="appearance-impact-summary appearance-impact-empty"><strong>0</strong></div>`;
    }
    return `
    <div class="appearance-impact-summary">
      <strong>${escapeHtml(impact.enabledCount)} / ${escapeHtml(impact.count)}</strong>
    </div>
  `;
  };

  const renderAppearanceGovernancePanel = () => {
    const appearance = readAppearanceState();
    const home = appearance.modules.home;
    const densityLabels = { compact: "Compact", normal: "Normal", airy: "Airy" };
    const toneLabels = { default: "Default", calm: "Calm", pitch: "Pitch", contrast: "Contrast" };
    const themeLabels = { system: "Follow app theme", light: "Light", dark: "Dark" };
    const impactByType = Object.fromEntries(getHomeAppearanceImpactSummary(appearance).map((impact) => [impact.componentType, impact]));
    const componentTypeRows = platformAppearanceHomeComponentTypeIds
      .map((typeId) => {
        const defaults = home.componentTypes[typeId];
        const impact = impactByType[typeId];
        return `
        <article class="appearance-type-row">
          <div>
            <strong>${escapeHtml(defaults.label)}</strong>
          </div>
          ${formatAppearanceImpact(impact)}
          <label>
            <span>Density</span>
            ${renderAppearanceSelect(`componentType.${typeId}.density`, platformAppearanceDensityOptions, defaults.density, densityLabels)}
          </label>
          <label>
            <span>Tone</span>
            ${renderAppearanceSelect(`componentType.${typeId}.tone`, platformAppearanceToneOptions, defaults.tone, toneLabels)}
          </label>
        </article>
      `;
      })
      .join("");
    const sectionRows = platformAppearanceHomeSectionDefaults
      .map((section) => {
        const value = home.sections[section.id] || section;
        return `
        <article class="appearance-section-row">
          <label class="appearance-section-visible">
            <input type="checkbox" name="section.${escapeHtml(section.id)}.enabled" ${value.enabled ? "checked" : ""} />
            <span>${escapeHtml(section.label)}</span>
          </label>
          <label>
            <span>Order</span>
            <input name="section.${escapeHtml(section.id)}.order" type="number" min="1" max="99" value="${escapeHtml(value.order)}" />
          </label>
          <label>
            <span>Kicker</span>
            <input name="section.${escapeHtml(section.id)}.eyebrow" value="${escapeHtml(value.eyebrow)}" maxlength="36" />
          </label>
          <label>
            <span>Title</span>
            <input name="section.${escapeHtml(section.id)}.title" value="${escapeHtml(value.title)}" maxlength="58" />
          </label>
        </article>
      `;
      })
      .join("");

    return `
    <form id="platformAppearanceForm" class="admin-card appearance-governance-card">
      <div class="staff-card-head">
        <div>
          <h2>Appearance</h2>
          <span>Platform Admin</span>
        </div>
        <span class="profile-role-pill">Home</span>
      </div>
      <section class="appearance-governance-block">
        <div class="appearance-block-head">
          <h3>Home defaults</h3>
        </div>
        <div class="appearance-home-defaults">
          <label>
            <span>Home density</span>
            ${renderAppearanceSelect("home.density", platformAppearanceDensityOptions, home.density, densityLabels)}
          </label>
          <label>
            <span>Theme scope</span>
            ${renderAppearanceSelect("home.theme", platformAppearanceThemeOptions, home.theme, themeLabels)}
          </label>
        </div>
      </section>
      <section class="appearance-governance-block">
        <div class="appearance-block-head">
          <h3>Type rules</h3>
        </div>
        <div class="appearance-type-list">${componentTypeRows}</div>
      </section>
      <section class="appearance-governance-block">
        <div class="appearance-block-head">
          <h3>Home sections</h3>
        </div>
        <div class="appearance-section-list">${sectionRows}</div>
      </section>
      <div class="profile-form-footer admin-access-footer">
        <span class="appearance-actions">
          <button type="button" class="admin-send-button" data-platform-appearance-reset>Reset</button>
          <button type="submit">Publish</button>
        </span>
      </div>
    </form>
  `;
  };

  return {
    normalizeReadinessStatus,
    renderReadinessStatus,
    renderReadinessEmptyState,
    createReadinessFallbackReport,
    renderReadinessDashboard,
    renderAppearanceSelect,
    formatAppearanceImpact,
    renderAppearanceGovernancePanel,
  };
}
