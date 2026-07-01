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

  function getRenderOptions(renderOptions = {}) {
    return {
      cardClassName: renderOptions.cardClassName || defaultCardClassName,
      headerClassName: renderOptions.headerClassName || defaultHeaderClassName,
      kickerLabel: renderOptions.kickerLabel || defaultKickerLabel,
      titleLabel: renderOptions.titleLabel || defaultTitleLabel,
    };
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
    const record = findRecord(player);
    if (!record) {
      return renderEmptyCard(
        "No verified data",
        "No linked scouting player database row exists for this player yet. When imported data matches the profile name, this spider will become data-driven.",
        renderOptions
      );
    }
    const group = getPositionGroup(record, player);
    const template = templates[group] || templates.OTHER || [];
    const axes = template
      .map((axis) => {
        const value = getMetricValue(record, axis.metricId);
        const percentile = getPercentile(record, axis.metricId, axis.direction || "higher");
        const metric = getMetric(database, axis.metricId);
        return metric && Number.isFinite(value) && Number.isFinite(percentile)
          ? { ...axis, value, percentile, metric }
          : null;
      })
      .filter(Boolean);
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
    const { cardClassName, headerClassName, kickerLabel, titleLabel } = getRenderOptions(renderOptions);
    return `
    <article class="${escapeHtml(cardClassName)}">
      <header class="${escapeHtml(headerClassName)}">
        <div>
          <p>${escapeHtml(kickerLabel)}</p>
          <h2>${escapeHtml(titleLabel)}</h2>
        </div>
        <span>${escapeHtml([record[recordIndex.team], record[recordIndex.season]].filter(Boolean).join(" / ") || "NWSL")}</span>
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
