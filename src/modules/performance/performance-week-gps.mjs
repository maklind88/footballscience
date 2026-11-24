import { formatLoad, loadMetrics, parseLoadInput } from "./performance-load-plan.mjs";

const validStatus = new Set(["ready", "unavailable"]);
const metricByKey = new Map(loadMetrics.map((metric) => [metric.key, metric]));
const rowKey = (playerId, activityId) => JSON.stringify([playerId, activityId]);

export function createWeekGps(data) {
  const rows = new Map();
  if (data?.status === "ready" && Array.isArray(data.rows)) {
    for (const row of data.rows) rows.set(rowKey(row.playerId, row.activityId), row);
  }
  return {
    status: validStatus.has(data?.status) ? data.status : "not-connected",
    sample: data?.sample === true,
    hasRows: rows.size > 0,
    getActual: (playerId, activityId) => rows.get(rowKey(playerId, activityId)),
  };
}

export function gpsSummaryMetrics(record) {
  if (!record) return null;
  return Object.fromEntries(loadMetrics
    .filter(({ key }) => key === "distance" || record.comparable?.includes(key))
    .map(({ key }) => [key, record.metrics[key]]));
}

export function formatGpsValue(value, metric) {
  return Number.isFinite(value) ? `${formatLoad(value, metric)} ${metric.unit}` : "—";
}

function deltaText(actual, planned, metric) {
  if (!Number.isFinite(planned)) return "";
  const delta = actual - planned;
  const relative = formatLoad(Math.abs(delta), metric);
  const sign = relative === "0" ? "" : delta < 0 ? "−" : "+";
  return `${sign}${relative} ${metric.unit}`;
}

export function renderGpsMetric(plannedMarkup, planned, record, metric) {
  const actual = record?.metrics?.[metric.key];
  const measured = Number.isFinite(actual);
  const comparable = measured && record.comparable?.includes(metric.key);
  return `<div class="pr-gps-metric" data-pr-gps-field>
    <div class="pr-gps-amount"><small>Plan</small>${plannedMarkup}</div>
    <div class="pr-gps-amount">
      <small>GPS</small>
      <span aria-label="GPS ${metric.name}${measured ? "" : " missing"}">${formatGpsValue(actual, metric)}</span>
    </div>
    ${comparable ? `<div class="pr-gps-delta" title="GPS minus plan"><small>Δ</small>
      <span data-pr-gps-actual="${actual}" data-pr-gps-metric="${metric.key}" aria-label="GPS minus plan">${deltaText(actual, planned, metric)}</span>
    </div>` : ""}
  </div>`;
}

export function updateGpsDelta(input) {
  const output = input.closest("[data-pr-gps-field]")?.querySelector("[data-pr-gps-actual]");
  if (!output) return;
  const metric = metricByKey.get(output.dataset.prGpsMetric);
  output.textContent = deltaText(Number(output.dataset.prGpsActual), parseLoadInput(input.value, metric), metric);
}

export function renderGpsAvailability(gps) {
  const status = {
    "not-connected": "GPS source not connected",
    unavailable: "GPS data is temporarily unavailable",
    ready: gps.hasRows ? (gps.sample ? "Example GPS data" : "GPS data available") : "No linked GPS data for this week",
  }[gps.status];
  return `<div class="pr-gps-availability">
    <strong>${status}</strong><span>— means a value is missing. Δ requires matching definitions. HSR and sprint totals include only values with matching speed zones.</span>
  </div>`;
}
