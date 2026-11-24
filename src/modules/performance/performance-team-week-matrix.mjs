import { dateLabel } from "./performance-overview.mjs";
import { activityFormKey, formatLoad, loadMetrics, parseLoadInput, planningRole, playerTargetInputPrefix, summarizeLoadTargets, teamWeekInputPrefix } from "./performance-load-plan.mjs";
import { amountInput } from "./performance-load-plan-fields.mjs";
import { formatGpsValue, gpsSummaryMetrics, renderGpsMetric } from "./performance-week-gps.mjs";

const totalGroups = [["week", "Week total"], ["training", "Training"], ["matches", "Match est."]];
const metricsByKey = new Map(loadMetrics.map((metric) => [metric.key, metric]));

function totalText(value, metric) {
  return Number.isFinite(value) ? `${formatLoad(value, metric)} ${metric.unit}` : "—";
}

function weekTotals(summary, gps) {
  return `<dl class="pr-week-row-totals" aria-label="Player week totals">
    ${totalGroups.map(([group, label]) => `<div><dt>${label}</dt><dd>
      ${loadMetrics.map((metric) => `<span data-pr-week-total="${group}:${metric.key}" title="${metric.name}">${totalText(summary[group][metric.key].total, metric)}</span>`).join("")}
    </dd></div>`).join("")}
    ${gps ? `<div class="pr-week-gps-total"><dt>GPS total</dt><dd>${loadMetrics.map((metric) => {
      const { total, count } = gps[metric.key];
      return `<span title="${metric.name} · ${count} activities included">${formatGpsValue(total, metric)}<small>${count} included</small></span>`;
    }).join("")}</dd></div>` : ""}
  </dl>`;
}

export function updateTeamWeekTotals(row, summary) {
  for (const amount of row.querySelectorAll("[data-pr-week-total]")) {
    const [group, key] = amount.dataset.prWeekTotal.split(":");
    amount.textContent = totalText(summary[group][key].total, metricsByKey.get(key));
  }
}

function activityHeader({ activity }, escape, showGps) {
  if (!activity) return '<th scope="col" class="pr-week-rest">No activity</th>';
  const details = activity.type === "match" ? "Match estimate" : [activity.physicalLoad, activity.time].filter(Boolean).join(" · ");
  return `<th scope="col" class="${activity.type === "match" ? "pr-week-match" : ""}">
    <strong>${escape(activity.title || activity.type)}</strong>
    ${details ? `<small>${escape(details)}</small>` : ""}
    ${showGps ? '<small class="pr-gps-column-key">Plan · GPS · Δ</small>' : ""}
  </th>`;
}

function activityCell({ player, day, activity, context, canEdit }) {
  if (!activity) return '<td class="pr-week-rest">—</td>';
  const { draft, escape, readTeamInput, editableActivity, gps, showGps } = context;
  const editable = canEdit && editableActivity(activity.id);
  const target = draft.getTargets(player.id, activity.id);
  const prefix = playerTargetInputPrefix(player.id);
  const inputPrefix = teamWeekInputPrefix(player.id, activity.id);
  const measured = showGps ? gps.getActual(player.id, activity.id) : null;
  return `<td data-pr-week-activity="${escape(activity.id)}" class="${activity.type === "match" ? "pr-week-match" : ""}">
    <div class="pr-week-cell-fields">
      ${loadMetrics.map((metric) => {
        const label = `${player.name} · ${dateLabel(day.date)} · ${activity.title || activity.type} · ${metric.name}`;
        const typed = readTeamInput(activityFormKey(activity.id), prefix + metric.key);
        const invalid = typed !== undefined && parseLoadInput(typed, metric) === undefined;
        const shortLabel = metric.key === "distance" ? "Dist." : metric.short;
        const plannedMarkup = editable
          ? amountInput(metric, inputPrefix + metric.key, target?.[metric.key], label, escape, true, { typed, focus: inputPrefix + metric.key, invalid })
          : `<strong title="${escape(label)}">${totalText(target?.[metric.key], metric)}</strong>`;
        const planned = editable && typed !== undefined ? parseLoadInput(typed, metric) : target?.[metric.key];
        return `<div class="pr-week-metric" data-pr-week-metric="${metric.key}"><span>${shortLabel}</span>${showGps
          ? renderGpsMetric(plannedMarkup, planned, measured, metric) : plannedMarkup}</div>`;
      }).join("")}
    </div>
  </td>`;
}

export function renderTeamWeekMatrix(context) {
  const { escape, days, players, teamPlayers, canEdit, editableActivity, getTeamWeekTotals, status, feedbackForm, gps, showGps } = context;
  if (!players.length) return '<p class="pr-placeholder">No Squad players available.</p>';
  const columns = days.flatMap((day) => day.activities.length
    ? day.activities.map((activity) => ({ day, activity }))
    : [{ day, activity: null }]);
  const editablePlayers = new Set(teamPlayers.map(({ id }) => id));
  const showSave = canEdit && editablePlayers.size && columns.some(({ activity }) => activity && editableActivity(activity.id));
  const waiting = canEdit && (editablePlayers.size !== players.length ||
    columns.some(({ activity }) => activity && !editableActivity(activity.id)));
  return `<section class="pr-week-matrix" aria-labelledby="pr-week-matrix-title">
    <form data-pr-load-form="team-week" novalidate>
      <div class="pr-week-matrix-head">
        <div><h3 id="pr-week-matrix-title">Player microcycles</h3>
          <p>Plan totals include match estimates. Training and match subtotals are shown separately.</p></div>
        ${showSave ? '<button type="submit" data-pr-focus="save-team-week" class="pr-plan-primary">Save week changes</button>' : ""}
      </div>
      ${showSave ? '<p class="pr-week-matrix-note">Totals update as you type. Blank means unset. Use 0 for planned zero.</p>' : ""}
      ${waiting ? '<p class="pr-week-matrix-note">Players and activities become editable after Squad and Schedule sync.</p>' : ""}
      <p class="pr-team-feedback" data-pr-team-feedback="team-week" aria-hidden="true">${feedbackForm === "team-week" ? escape(status) : ""}</p>
      <div class="pr-week-grid-wrap${showGps ? " pr-week-grid-compare" : ""}" tabindex="0" role="region" aria-label="Scrollable player week">
        <table class="pr-week-grid" aria-label="Player microcycles by day">
          <thead>
            <tr><th scope="col" rowspan="2" class="pr-week-player">Player &amp; week totals<small>Distance · HSR · Sprint</small></th>
              ${days.map((day) => `<th scope="colgroup" colspan="${day.activities.length || 1}">
                ${dateLabel(day.date)}${day.matchContext ? ` <small>${escape(day.matchContext)}</small>` : ""}
              </th>`).join("")}</tr>
            <tr>${columns.map((column) => activityHeader(column, escape, showGps)).join("")}</tr>
          </thead>
          <tbody>${players.map((player) => {
            const role = planningRole(player);
            const editable = canEdit && editablePlayers.has(player.id);
            const actual = showGps ? summarizeLoadTargets(columns.map(({ activity }) =>
              activity ? gpsSummaryMetrics(gps.getActual(player.id, activity.id)) : null
            )) : null;
            return `<tr data-pr-week-player="${escape(player.id)}">
              <th scope="row" class="pr-week-player"><span class="pr-week-player-name">${escape(player.name)}</span>
                ${role ? `<small>${escape(role)}</small>` : ""}
                ${weekTotals(getTeamWeekTotals(player.id), actual)}
              </th>
              ${columns.map((column) => activityCell({ ...column, player, context, canEdit: editable })).join("")}
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </form>
  </section>`;
}
