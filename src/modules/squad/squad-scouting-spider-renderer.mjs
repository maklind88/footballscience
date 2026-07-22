function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatPlayerProfileScoutingNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "n/a";
  }
  return number.toLocaleString("en-US", { maximumFractionDigits: Math.abs(number) < 10 ? 2 : 1 });
}

export function formatPlayerProfileScoutingMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return "";
  }
  return Math.round(minutes).toLocaleString("en-US");
}

export function createSquadScoutingSpiderRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getDatabase = typeof options.getDatabase === "function" ? options.getDatabase : () => null;
  const queueDatabaseLoad = typeof options.queueDatabaseLoad === "function" ? options.queueDatabaseLoad : () => {};
  const findRecord = typeof options.findRecord === "function" ? options.findRecord : () => null;
  const getPositionGroup = typeof options.getPositionGroup === "function" ? options.getPositionGroup : () => "OTHER";
  const getMetricValue = typeof options.getMetricValue === "function" ? options.getMetricValue : () => null;
  const getPercentile = typeof options.getPercentile === "function" ? options.getPercentile : () => null;
  const getMetric = typeof options.getMetric === "function" ? options.getMetric : () => null;
  const templates = options.templates || {};
  const recordIndex = options.recordIndex || {};
  const defaultCardClassName = options.cardClassName || "squad-profile-section player-profile-scouting-spider-card";
  const defaultHeaderClassName = options.headerClassName || "squad-section-head";
  const defaultKickerLabel = options.kickerLabel || "NWSL data spider";
  const defaultTitleLabel = options.titleLabel || "Performance Radar";
  const defaultMaxMetricCount = 6;

  function getRenderOptions(renderOptions = {}) {
    return {
      cardClassName: renderOptions.cardClassName || defaultCardClassName,
      headerClassName: renderOptions.headerClassName || defaultHeaderClassName,
      kickerLabel: renderOptions.kickerLabel || defaultKickerLabel,
      titleLabel: renderOptions.titleLabel || defaultTitleLabel,
      maxMetricCount: Number.isInteger(renderOptions.maxMetricCount) && renderOptions.maxMetricCount > 0
        ? renderOptions.maxMetricCount
        : defaultMaxMetricCount,
      metricSelectionKey: renderOptions.metricSelectionKey || "",
      selectedMetricIds: Array.isArray(renderOptions.selectedMetricIds) ? renderOptions.selectedMetricIds : [],
      showMetricPicker: Boolean(renderOptions.showMetricPicker),
      includeDatabaseMetricChoices: Boolean(renderOptions.includeDatabaseMetricChoices),
      metricPickerOpen: Boolean(renderOptions.metricPickerOpen),
      metricPickerSearchQuery: String(renderOptions.metricPickerSearchQuery || "").trim(),
      seasonOptions: Array.isArray(renderOptions.seasonOptions) ? renderOptions.seasonOptions : [],
      selectedSeason: String(renderOptions.selectedSeason || "").trim(),
    };
  }

  function uniqueMetricIds(metricIds = []) {
    return [...new Set(metricIds.map((metricId) => String(metricId || "").trim()).filter(Boolean))];
  }

  function getComparableAxes(record, database, template = []) {
    return template
      .map((axis) => {
        const value = getMetricValue(record, axis.metricId);
        const percentile = getPercentile(record, axis.metricId, axis.direction || "higher");
        const metric = getMetric(database, axis.metricId);
        return metric && Number.isFinite(value) && Number.isFinite(percentile)
          ? { ...axis, value, percentile, metric }
          : null;
      })
      .filter(Boolean);
  }

  function getAvailableAxes(record, database, template = [], renderOptions = {}) {
    const curatedAxes = getComparableAxes(record, database, template);
    if (!renderOptions.includeDatabaseMetricChoices) return curatedAxes;
    const curatedMetricIds = new Set(curatedAxes.map((axis) => axis.metricId));
    const extraAxes = (database?.metrics || [])
      .filter((metric) => metric?.id && !curatedMetricIds.has(metric.id))
      .map((metric) => {
        const value = getMetricValue(record, metric.id);
        const percentile = getPercentile(record, metric.id, metric.direction || "higher");
        return Number.isFinite(value) && Number.isFinite(percentile)
          ? {
              label: metric.label || metric.id,
              metricId: metric.id,
              direction: metric.direction || "higher",
              value,
              percentile,
              metric,
            }
          : null;
      })
      .filter(Boolean);
    return [...curatedAxes, ...extraAxes];
  }

  function selectAxes(availableAxes = [], selectedMetricIds = [], maxMetricCount = defaultMaxMetricCount) {
    const byMetricId = new Map(availableAxes.map((axis) => [axis.metricId, axis]));
    const selectedAxes = uniqueMetricIds(selectedMetricIds)
      .map((metricId) => byMetricId.get(metricId))
      .filter(Boolean);
    if (!selectedAxes.length) return availableAxes.slice(0, maxMetricCount);
    return selectedAxes.slice(0, maxMetricCount);
  }

  function getMetricDescription(axis = {}) {
    const metric = axis.metric || {};
    return [
      metric.description,
      metric.label && metric.label !== axis.label ? metric.label : "",
      metric.unit ? `Unit: ${metric.unit}` : "",
    ].map((value) => String(value || "").trim()).filter(Boolean).join(" · ");
  }

  function getMetricSearchText(axis = {}) {
    return [
      axis.label,
      axis.metricId,
      axis.metric?.label,
      axis.metric?.description,
      axis.metric?.unit,
      axis.direction === "lower" ? "low is good" : "",
    ].join(" ").toLowerCase();
  }

  function renderMetricPicker(availableAxes = [], selectedAxes = [], renderOptions = {}) {
    if (!renderOptions.showMetricPicker || availableAxes.length <= renderOptions.maxMetricCount) return "";
    const selectedMetricIds = new Set(selectedAxes.map((axis) => axis.metricId));
    const selectionKey = escapeHtml(renderOptions.metricSelectionKey || "player-profile");
    const searchQuery = String(renderOptions.metricPickerSearchQuery || "").trim();
    const normalizedSearchQuery = searchQuery.toLowerCase();
    const visibleAxes = availableAxes.filter((axis) => !normalizedSearchQuery || getMetricSearchText(axis).includes(normalizedSearchQuery));
    return `
      <details class="player-profile-scouting-metric-picker" ${renderOptions.metricPickerOpen ? "open" : ""}>
        <summary>
          <span>Metrics</span>
          <strong>${escapeHtml(selectedAxes.length)}/${escapeHtml(renderOptions.maxMetricCount)}</strong>
        </summary>
        <div class="player-profile-scouting-metric-picker-menu" role="group" aria-label="Choose radar metrics">
          <label class="player-profile-scouting-metric-search">
            <span>Search metrics</span>
            <input
              type="search"
              value="${escapeHtml(searchQuery)}"
              placeholder="Search metric, value or role"
              data-player-profile-scouting-metric-search="${selectionKey}"
            >
          </label>
          <p class="player-profile-scouting-metric-picker-hint">Tick up to ${escapeHtml(renderOptions.maxMetricCount)} metrics for this player's radar.</p>
          ${availableAxes
            .map(
              (axis) => {
                const isVisible = visibleAxes.includes(axis);
                const description = getMetricDescription(axis);
                return `
                <label
                  class="player-profile-scouting-metric-option"
                  data-player-profile-scouting-metric-row
                  data-player-profile-scouting-metric-search-text="${escapeHtml(getMetricSearchText(axis))}"
                  ${isVisible ? "" : "hidden"}
                >
                  <input
                    type="checkbox"
                    data-player-profile-scouting-metric-toggle="${escapeHtml(axis.metricId)}"
                    data-player-profile-scouting-metric-key="${selectionKey}"
                    ${selectedMetricIds.has(axis.metricId) ? "checked" : ""}
                  >
                  <span>
                    <span class="player-profile-scouting-metric-name">${escapeHtml(axis.label)}</span>
                    <small>${escapeHtml(description || axis.metric?.label || axis.metricId)}</small>
                    <em>Current value: ${escapeHtml(formatPlayerProfileScoutingNumber(axis.value))}${axis.direction === "lower" ? " / low is good" : ""}</em>
                  </span>
                  <b>P${escapeHtml(axis.percentile)}</b>
                </label>
              `;
              }
            )
            .join("")}
          ${visibleAxes.length ? "" : `<div class="player-profile-scouting-metric-picker-empty">No metrics match this search.</div>`}
        </div>
      </details>
    `;
  }

  function renderSeasonPicker(renderOptions = {}) {
    if (!renderOptions.seasonOptions.length) return "";
    const selectedSeason = String(renderOptions.selectedSeason || renderOptions.seasonOptions[0]?.value || "").trim();
    if (renderOptions.seasonOptions.length === 1) {
      return `<span>${escapeHtml(renderOptions.seasonOptions[0].label || selectedSeason)}</span>`;
    }
    return `
      <label class="player-profile-scouting-season-picker">
        <span>Season</span>
        <select data-player-profile-scouting-season-select="${escapeHtml(renderOptions.metricSelectionKey || "player-profile")}">
          ${renderOptions.seasonOptions.map((season) => {
            const value = String(season?.value || season?.label || "").trim();
            const label = String(season?.label || value).trim();
            return value
              ? `<option value="${escapeHtml(value)}" ${value === selectedSeason ? "selected" : ""}>${escapeHtml(label)}</option>`
              : "";
          }).join("")}
        </select>
      </label>
    `;
  }

  function renderNoDataSpider(message = "No data") {
    return `
    <svg class="player-profile-scouting-spider" viewBox="0 0 220 220" role="img" aria-label="${escapeHtml(message)}">
      <circle class="player-profile-scouting-ring" cx="110" cy="110" r="74" />
      <circle class="player-profile-scouting-ring" cx="110" cy="110" r="49" />
      <circle class="player-profile-scouting-ring" cx="110" cy="110" r="25" />
      <text class="player-profile-scouting-empty-text" x="110" y="108">${escapeHtml(message)}</text>
      <text class="player-profile-scouting-empty-subtext" x="110" y="126">Scouting data</text>
    </svg>
  `;
  }

  function renderEmptyCard(status, message, renderOptions = {}) {
    const { cardClassName, headerClassName, kickerLabel, titleLabel } = getRenderOptions(renderOptions);
    return `
      <article class="${escapeHtml(cardClassName)}">
        <header class="${escapeHtml(headerClassName)}">
          <div>
            <p>${escapeHtml(kickerLabel)}</p>
            <h2>${escapeHtml(titleLabel)}</h2>
          </div>
          <span>${escapeHtml(status)}</span>
        </header>
        <div class="player-profile-scouting-spider-layout">
          ${renderNoDataSpider("No data")}
          <p>${escapeHtml(message)}</p>
        </div>
      </article>
    `;
  }

  function render(player, renderOptions = {}) {
    const database = getDatabase();
    if (!database) {
      queueDatabaseLoad();
      return renderEmptyCard(
        "Loading data",
        "Scouting player database data is being loaded. If no matching row exists after import, this stays as a clean no-data spider.",
        renderOptions
      );
    }
    const renderConfig = getRenderOptions(renderOptions);
    const record = findRecord(player, renderConfig);
    if (!record) {
      return renderEmptyCard(
        "No verified data",
        "No linked scouting player database row exists for this player yet. When imported data matches the profile name, this spider will become data-driven.",
        renderOptions
      );
    }
    const group = getPositionGroup(record, player);
    const template = templates[group] || templates.OTHER || [];
    const availableAxes = getAvailableAxes(record, database, template, renderConfig);
    const axes = selectAxes(availableAxes, renderConfig.selectedMetricIds, renderConfig.maxMetricCount);
    if (axes.length < 3) {
      return renderEmptyCard(
        record[recordIndex.season] || "NWSL",
        "NWSL row found, but not enough comparable KPI fields exist to draw a reliable spider.",
        renderOptions
      );
    }
    const center = 110;
    const radius = 74;
    const angleOffset = -Math.PI / 2;
    const points = axes.map((axis, index) => {
      const angle = angleOffset + (index / axes.length) * Math.PI * 2;
      const valueRadius = radius * (axis.percentile / 100);
      return {
        ...axis,
        x: center + Math.cos(angle) * valueRadius,
        y: center + Math.sin(angle) * valueRadius,
        axisX: center + Math.cos(angle) * radius,
        axisY: center + Math.sin(angle) * radius,
        labelX: center + Math.cos(angle) * (radius + 26),
        labelY: center + Math.sin(angle) * (radius + 26),
      };
    });
    const polygon = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const { cardClassName, headerClassName, kickerLabel, titleLabel } = renderConfig;
    const teamLabel = String(record[recordIndex.team] || "").trim() || "NWSL";
    const minutesLabel = formatPlayerProfileScoutingMinutes(record[recordIndex.minutes]);
    const recordSeason = String(record[recordIndex.season] || "").trim();
    const seasonControl = renderSeasonPicker({
      ...renderConfig,
      seasonOptions: renderConfig.seasonOptions.length
        ? renderConfig.seasonOptions
        : recordSeason
          ? [{ label: recordSeason, value: recordSeason }]
          : [],
      selectedSeason: renderConfig.selectedSeason || recordSeason,
    });
    return `
    <article class="${escapeHtml(cardClassName)}">
      <header class="${escapeHtml(headerClassName)}">
        <div>
          <p>${escapeHtml(kickerLabel)}</p>
          <h2>${escapeHtml(titleLabel)}</h2>
        </div>
        <div class="player-profile-scouting-radar-tools">
          ${seasonControl}
          <div class="player-profile-scouting-radar-meta">
            <span>${escapeHtml(teamLabel)}</span>
            ${minutesLabel ? `<span>Minutes ${escapeHtml(minutesLabel)}</span>` : ""}
          </div>
          ${renderMetricPicker(availableAxes, axes, renderConfig)}
        </div>
      </header>
      <div class="player-profile-scouting-spider-layout">
        <svg class="player-profile-scouting-spider" viewBox="0 0 220 220" role="img" aria-label="NWSL performance spider">
          <circle class="player-profile-scouting-ring" cx="${center}" cy="${center}" r="${radius}" />
          <circle class="player-profile-scouting-ring" cx="${center}" cy="${center}" r="${radius * 0.66}" />
          <circle class="player-profile-scouting-ring" cx="${center}" cy="${center}" r="${radius * 0.33}" />
          ${points.map((point) => `<line class="player-profile-scouting-axis" x1="${center}" y1="${center}" x2="${point.axisX.toFixed(1)}" y2="${point.axisY.toFixed(1)}" />`).join("")}
          <polygon class="player-profile-scouting-shape" points="${polygon}" />
          ${points
            .map(
              (point) => `
<circle class="player-profile-scouting-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.1" />
<text class="player-profile-scouting-label" x="${point.labelX.toFixed(1)}" y="${point.labelY.toFixed(1)}">${escapeHtml(point.label)}</text>
`
            )
            .join("")}
        </svg>
        <div class="player-profile-scouting-metrics">
          ${axes
            .map(
              (axis) => `
<div>
<span>${escapeHtml(axis.label)}</span>
<strong>P${escapeHtml(axis.percentile)}</strong>
<small>${escapeHtml(axis.metric.label)}: ${escapeHtml(formatPlayerProfileScoutingNumber(axis.value))}${axis.direction === "lower" ? " / low is good" : ""}</small>
</div>
`
            )
            .join("")}
        </div>
      </div>
    </article>
  `;
  }

  return {
    render,
    renderNoDataSpider,
  };
}
