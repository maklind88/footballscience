import { squadRoleGroups } from "../squad/players.mjs";

const measures = [
  ["GPS time", "min", 1, 1, (record) => record?.sessionDurationMinutes],
  ["Distance", "km", 1000, 2, (record) => record?.metrics?.distance],
  ["HML", "m", 1, 0, (record) => record?.metrics?.hml],
  ["High-speed running", "m", 1, 0, (record) => record?.metrics?.hsr],
  ["Sprint distance", "m", 1, 0, (record) => record?.metrics?.sprint],
  ["Accelerations", "", 1, 1, (record) => record?.metrics?.accelerations],
  ["Decelerations", "", 1, 1, (record) => record?.metrics?.decelerations],
  ["Top speed", "km/h", 1, 1, (record) => record?.metrics?.maxSpeed],
].map(([label, unit, scale, maximumFractionDigits, read]) => ({
  label, unit, scale, read, display: new Intl.NumberFormat("en-GB", { maximumFractionDigits }),
}));

const groupLabels = { goalkeeper: "Goalkeepers", defender: "Defenders", midfielder: "Midfielders", forward: "Forwards" };

function groupOf(player) {
  const group = String(player.roleGroup || player.position || "").toLowerCase();
  return squadRoleGroups.includes(group) ? group : "";
}

function valueLabel(value, { display, scale }) {
  return Number.isFinite(value) ? display.format(value / scale) : "—";
}

function averageCell(measure, roster, getActual) {
  const values = roster.map(({ id }) => measure.read(getActual(id))).filter(Number.isFinite);
  const average = values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  return `<td><strong>${valueLabel(average, measure)}</strong><small title="${values.length} of ${roster.length} measured">${values.length} / ${roster.length}</small></td>`;
}

export function renderComparisonTable({ review, players, selected, gps, escape }) {
  const teams = squadRoleGroups.map((group) => ({
    label: groupLabels[group], roster: players.filter((player) => groupOf(player) === group),
  })).filter(({ roster }) => roster.length);
  const getActual = (id) => gps.getActual(id, review.activity.id);
  const athlete = selected ? getActual(selected.id) : null;
  const groups = [{ label: "Squad avg", roster: players }, ...teams];
  const collected = players.reduce((count, { id }) => count + Number(Boolean(getActual(id))), 0);
  const coverage = gps.status === "unavailable" ? "GPS temporarily unavailable"
    : collected ? `${collected} of ${players.length} players with linked GPS` : "No linked GPS for this activity";
  return `<div class="pr-comparison-toolbar">
    <div><strong>${escape(review.activity.title || (review.activity.type === "match" ? "Match" : "Training"))}</strong>
    <small>${coverage}${gps.sample ? " · Example data" : ""}</small></div>
    <label class="pr-plan-select"><span>Compare player</span><select data-pr-plan-player data-pr-focus="compare-player">
      ${selected ? "" : '<option value="" disabled selected>Select a player</option>'}
      ${players.map((player) => `<option value="${escape(player.id)}"${player.id === selected?.id ? " selected" : ""}>${escape(player.name)}</option>`).join("")}
    </select></label>
  </div>
  <div class="pr-comparison-scroll" tabindex="0" role="region" aria-label="Scrollable GPS comparison">
    <table class="pr-table pr-comparison-table">
      <caption class="pr-visually-hidden">GPS comparison for the selected activity</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col" class="pr-comparison-player">${selected ? escape(selected.name) : "Player"}</th>
        ${groups.map(({ label }) => `<th scope="col">${label}</th>`).join("")}</tr></thead>
      <tbody>${measures.map((measure) => `<tr>
        <th scope="row">${measure.label}${measure.unit ? ` <small>${measure.unit}</small>` : ""}</th>
        <td class="pr-comparison-player"><strong>${valueLabel(measure.read(athlete), measure)}</strong></td>
        ${groups.map(({ roster }) => averageCell(measure, roster, getActual)).join("")}</tr>`).join("")}</tbody>
    </table>
  </div>
  <p class="pr-footnote">Averages use measured values for this activity. Counts show measured players / group size. Groups follow current Squad profiles. GPS time is device duration.</p>`;
}
