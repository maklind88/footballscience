import { dateLabel, shiftDate } from "./performance-overview.mjs";

const archiveColumns = [
  ["distance", "Distance (km)", 1000, 2],
  ["hml", "HML (m)", 1, 1],
  ["hsr", "HSR (m)", 1, 1],
  ["sprint", "Sprint (m)", 1, 1],
  ["gpsMinutes", "GPS time (min)", 1, 1],
  ["maxSpeed", "Max speed (km/h)", 1, 1],
  ["accelerations", "Accel.", 1, 0],
  ["decelerations", "Decel.", 1, 0],
].map(([key, label, divisor, maximumFractionDigits]) => ({
  key, label, divisor, formatter: new Intl.NumberFormat("en-US", { maximumFractionDigits }),
}));

const links = {
  linked: "Linked at import",
  "unmatched-player": "Player needs a Squad link",
  "unmatched-activity": "Pass needs a Schedule link",
  "ambiguous-activity": "Multiple possible sessions",
  review: "Needs review",
};

export function createGpsHistory(readWeek, render) {
  let request;
  let entry;
  let player = "";

  function reset() {
    request?.abort();
    entry = null;
    request = null;
    player = "";
  }

  function getWeek(week) {
    if (entry?.week === week) return { ...entry, player };
    request?.abort();
    const controller = new AbortController();
    request = controller;
    entry = { week, status: "loading", rows: [] };
    const update = (result) => {
      if (controller.signal.aborted) return;
      entry = { week, ...result };
      request = null;
      render();
    };
    readWeek(week, controller.signal).then(update, () => update({ status: "unavailable", rows: [] }));
    return { ...entry, player };
  }

  function selectPlayer(value) {
    player = value;
  }

  return { getWeek, reset, selectPlayer };
}

function formatMetric(value, divisor, formatter) {
  return Number.isFinite(value) ? formatter.format(value / divisor) : "—";
}

export function renderGpsHistory({ week, status, rows, player }, escape) {
  const players = [...new Set(rows.map((row) => row.player))].sort((first, second) => first.localeCompare(second));
  const selected = players.includes(player) ? player : "";
  const visible = selected ? rows.filter((row) => row.player === selected) : rows;
  const weekLabel = `${dateLabel(week)} – ${dateLabel(shiftDate(week, 6))}`;
  const messages = {
    loading: "Loading GPS history…",
    unavailable: "GPS history is temporarily unavailable.",
    "not-connected": "GPS history is not connected for this team.",
    ready: "No workbook GPS entries for this week.",
  };
  const retry = status === "unavailable"
    ? '<button type="button" class="pr-link" data-pr-action="gps-history-retry">Try again</button>' : "";
  const controls = players.length ? `<label class="pr-plan-select">Player
    <select data-pr-gps-history-player data-pr-focus="gps-history-player">
      <option value="">All players</option>
      ${players.map((name) => `<option value="${escape(name)}"${name === selected ? " selected" : ""}>${escape(name)}</option>`).join("")}
    </select></label>` : "";
  const result = visible.length ? `<div class="pr-table-wrap"><table class="pr-table pr-gps-history-table">
    <thead><tr><th scope="col">Date</th><th scope="col">Player</th><th scope="col">Activity</th>
    ${archiveColumns.map(({ label }) => `<th scope="col">${label}</th>`).join("")}
    <th scope="col">Link status</th></tr></thead>
    <tbody>${visible.map((row) => `<tr>
      <th scope="row"><time datetime="${escape(row.date)}">${dateLabel(row.date)}</time></th>
      <td>${escape(row.player)}</td><td>${row.type === "match" ? escape(row.opponent || "Match") : "Training"}</td>
      ${archiveColumns.map(({ key, divisor, formatter }) => `<td>${formatMetric(row.metrics[key], divisor, formatter)}</td>`).join("")}
      <td>${links[row.link] || links.review}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="pr-placeholder" role="status">${messages[status] || messages.unavailable}</p>${retry}`;
  return `<section class="pr-panel">
    <header class="pr-panel-head"><div><h2>GPS History</h2><p>${weekLabel}${rows.length ? ` · ${visible.length} of ${rows.length} records` : ""}</p></div>${controls}</header>
    <p class="pr-footnote">Reviewed workbook values at their source session scope. — indicates missing data. GPS time is device duration.</p>
    ${result}
  </section>`;
}
