function normalizeControllerText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function escapeControllerHtml(value = "", escapeHtml = null) {
  if (typeof escapeHtml === "function") {
    return escapeHtml(value);
  }
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createScoutingMiniRadarService(deps = {}) {
  let radarCache = new Map();

  function normalizeText(value = "", limit = 160) {
    return normalizeControllerText(value, limit, deps.normalizeText);
  }

  function escapeHtml(value = "") {
    return escapeControllerHtml(value, deps.escapeHtml);
  }

  function getShortLabel(label = "") {
    const cleaned = normalizeText(label, 80)
      .replace(/\b(per|p90|90|min|minutes|weighted|role|driver|use|volume)\b/gi, "")
      .replace(/[()%]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const words = (cleaned || normalizeText(label, 80)).split(/[\s/-]+/).filter(Boolean);
    if (!words.length) {
      return "Metric";
    }
    if (words.length === 1) {
      return words[0].slice(0, 10);
    }
    return words
      .slice(0, 2)
      .map((word) => word.slice(0, 5))
      .join(" ");
  }

  function getMarkup(record) {
    const recordId = deps.getRecordId?.(record) || "";
    const benchmarkMode = deps.getBenchmarkMode?.() || "";
    const cacheKey = `${recordId}:${benchmarkMode}`;
    if (radarCache.has(cacheKey)) {
      return radarCache.get(cacheKey);
    }
    const template = deps.getRadarTemplate?.(record, "", benchmarkMode) || [];
    if (!template.length) {
      const empty = `<div class="scouting-mini-radar-empty">No data</div>`;
      radarCache.set(cacheKey, empty);
      return empty;
    }
    const points = template.slice(0, 6).map((item, index, templateItems) => {
      const percentile = deps.getTemplatePercentile?.(record, item, benchmarkMode) || 1;
      const label = normalizeText(item.label || item.metric || item.id, 80) || `Metric ${index + 1}`;
      const angle = -Math.PI / 2 + (index / templateItems.length) * (Math.PI * 2);
      const radius = 30;
      const center = 36;
      const valueRadius = (radius * percentile) / 100;
      const labelRadius = 36;
      const labelX = center + Math.cos(angle) * labelRadius;
      const labelY = center + Math.sin(angle) * labelRadius;
      return {
        axisX: center + Math.cos(angle) * radius,
        axisY: center + Math.sin(angle) * radius,
        label,
        labelX,
        labelY,
        percentile,
        shortLabel: getShortLabel(label),
        x: center + Math.cos(angle) * valueRadius,
        y: center + Math.sin(angle) * valueRadius,
      };
    });
    const polygon = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const markup = `
    <div class="scouting-mini-radar">
      <strong class="scouting-mini-radar-title">${escapeHtml(template.profileLabel || "Role spider")}</strong>
      <svg class="scouting-mini-radar-svg" viewBox="-8 -8 88 88" role="img" aria-label="Role spider">
        ${points
          .map(
            (point) =>
              `<line class="scouting-radar-axis" x1="36" y1="36" x2="${point.axisX.toFixed(1)}" y2="${point.axisY.toFixed(1)}" />`
          )
          .join("")}
        <circle class="scouting-radar-ring" cx="36" cy="36" r="30" />
        <polygon class="scouting-radar-shape" points="${polygon}" />
        ${points
          .map(
            (point) => `
              <text class="scouting-radar-label" x="${point.labelX.toFixed(1)}" y="${point.labelY.toFixed(1)}">
                <tspan x="${point.labelX.toFixed(1)}">${escapeHtml(point.shortLabel)}</tspan>
                <tspan x="${point.labelX.toFixed(1)}" dy="4.4">P${escapeHtml(point.percentile)}</tspan>
              </text>
            `
          )
          .join("")}
        ${points
          .map(
            (point) => `
              <circle
                class="scouting-radar-dot"
                cx="${point.x.toFixed(1)}"
                cy="${point.y.toFixed(1)}"
                r="2.15"
                tabindex="0"
                aria-label="${escapeHtml(`${point.label}: P${point.percentile}`)}"
              >
                <title>${escapeHtml(`${point.label}: P${point.percentile}`)}</title>
              </circle>
            `
          )
          .join("")}
      </svg>
    </div>
  `;
    radarCache.set(cacheKey, markup);
    return markup;
  }

  function hydrateShell(shell = null) {
    if (!shell || shell.dataset?.scoutingMiniRadarLoaded === "1") {
      return { changed: false, status: "skipped" };
    }
    const recordId = normalizeText(shell.dataset?.scoutingMiniRadarShell, 160);
    if (!recordId) {
      return { changed: false, status: "missing-record-id" };
    }
    const record = deps.getRecordById?.(recordId);
    if (!record) {
      return { changed: false, recordId, status: "missing-record" };
    }
    const popover = shell.querySelector?.("[role='img']");
    if (!popover) {
      return { changed: false, recordId, status: "missing-popover" };
    }
    if (shell.dataset) {
      shell.dataset.scoutingMiniRadarLoaded = "1";
    }
    popover.innerHTML = getMarkup(record);
    return { changed: true, recordId, status: "hydrated" };
  }

  function bindShells(root = deps.getRoot?.()) {
    const nodes = root?.querySelectorAll?.("[data-scouting-mini-radar-shell]") || [];
    nodes.forEach((shell) => {
      if (shell.dataset?.scoutingMiniRadarBound === "1") {
        return;
      }
      const hydrate = () => hydrateShell(shell);
      shell.addEventListener?.("mouseenter", hydrate, { passive: true });
      shell.addEventListener?.("focusin", hydrate, { passive: true });
      if (shell.dataset) {
        shell.dataset.scoutingMiniRadarBound = "1";
      }
    });
    return nodes.length;
  }

  function resetCache() {
    radarCache = new Map();
  }

  function getCacheSize() {
    return radarCache.size;
  }

  return {
    bindShells,
    getCacheSize,
    getMarkup,
    getShortLabel,
    hydrateShell,
    resetCache,
  };
}
