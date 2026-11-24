import { dateLabel } from "./performance-overview.mjs";
import { activityFormKey, formatLoad, loadMetrics, parseLoadInput, planningRole, playerTargetInputPrefix, summarizeLoadTargets, summarizePlayerWeek } from "./performance-load-plan.mjs";
import { amountInput, dayAndActivity, metricHeader } from "./performance-load-plan-fields.mjs";
import { renderTeamWeekMatrix } from "./performance-team-week-matrix.mjs";
import { formatGpsValue, gpsSummaryMetrics, renderGpsAvailability, renderGpsMetric } from "./performance-week-gps.mjs";

function weekGoals({ escape, draft, week, canEdit, readTeamInput, status, feedbackForm }, planned) {
  const saved = draft.getWeekGoal(week);
  return `<section class="pr-team-goals" aria-labelledby="pr-team-goals-title">
    <h3 id="pr-team-goals-title">Weekly training goals</h3>
    <form data-pr-load-form="week-goal" novalidate>
      <div class="pr-plan-reference-fields">
        ${loadMetrics.map((metric) => `<label><span>${metric.name}</span>${amountInput(
          metric, metric.key, saved?.[metric.key], `Weekly squad ${metric.name}`, escape, canEdit,
          { typed: readTeamInput("week-goal", metric.key), focus: `week-goal:${metric.key}` }
        )}<small>Planned · ${formatLoad(planned[metric.key].total, metric)} ${metric.unit}</small></label>`).join("")}
      </div>
      <div class="pr-plan-form-foot">
        <span>Squad totals across all training and recovery sessions this week.</span>
        ${canEdit ? '<button type="submit" class="pr-plan-primary" data-pr-focus="save-week-goals">Save weekly goals</button>' : ""}
      </div>
      <p class="pr-team-feedback" data-pr-team-feedback="week-goal" aria-hidden="true">${feedbackForm === "week-goal" ? escape(status) : ""}</p>
    </form>
  </section>`;
}

function aggregateCell({ total, count }, metric, rosterSize, coverage = "", actual) {
  return `<td><strong>${formatLoad(count ? Math.round(total / count) : null, metric)}</strong>
    <small>${count} / ${rosterSize} players</small>${count ? `<small>${formatLoad(total, metric)} ${metric.unit} total</small>` : ""}${coverage ? `<small>${coverage}</small>` : ""}
    ${actual ? `<small class="pr-gps-aggregate">GPS total · ${formatGpsValue(actual.total, metric)}</small>
      <small>${actual.count} player${actual.count === 1 ? "" : "s"} included</small>` : ""}
  </td>`;
}

function activityPicker(days, activityId, escape, editableActivity) {
  return `<label class="pr-plan-select">
    <span>Activity to edit</span>
    <select data-pr-team-activity data-pr-focus="team-activity-selector">
      <option value=""${activityId ? "" : " selected"}>Select an activity</option>
      ${days.flatMap((day) => day.activities.filter(({ id }) => editableActivity(id)).map((activity) => {
        const title = activity.title || activity.type;
        const context = activity.type === "match" ? " · Match estimate" : "";
        return `<option value="${escape(activity.id)}"${activity.id === activityId ? " selected" : ""}>${dateLabel(day.date)} · ${escape(title)}${context}</option>`;
      })).join("")}
    </select>
  </label>`;
}

function activityEditor({ escape, draft, players, teamPlayers, days, activityId, editableActivity, readTeamInput, status, feedbackForm, gps, showGps }) {
  const activity = days.flatMap((day) => day.activities).find(({ id }) => id === activityId);
  if (!players.length || !days.some(({ activities }) => activities.length)) return "";
  const waiting = players.length - teamPlayers.length;
  const note = waiting ? `<p class="pr-plan-explanation">${waiting} Squad profiles are waiting for sync.</p>` : "";
  if (!teamPlayers.length || !days.some(({ activities }) => activities.some(({ id }) => editableActivity(id)))) {
    return `<div class="pr-team-editor"><p class="pr-plan-explanation">Player targets become editable when Squad and Schedule have synced.</p></div>`;
  }
  const picker = activityPicker(days, activityId, escape, editableActivity);
  if (!activity) return `<div class="pr-team-editor">${picker}${note}</div>`;
  const formKey = activityFormKey(activity.id);
  const rows = teamPlayers.map((player) => {
    const targets = draft.getTargets(player.id, activity.id);
    const prefix = playerTargetInputPrefix(player.id);
    const role = planningRole(player);
    const measured = showGps ? gps.getActual(player.id, activity.id) : null;
    return `<tr><th scope="row">${escape(player.name)}${role ? `<small class="pr-team-role">${escape(role)}</small>` : ""}</th>
      ${loadMetrics.map((metric) => {
        const field = prefix + metric.key;
        const typed = readTeamInput(formKey, field);
        const plannedMarkup = amountInput(metric, field, targets?.[metric.key], `${player.name} ${metric.name}`, escape, true, {
          typed, focus: `team-target:${field}`,
        });
        const planned = typed === undefined ? targets?.[metric.key] : parseLoadInput(typed, metric);
        return `<td>${showGps ? renderGpsMetric(plannedMarkup, planned, measured, metric) : plannedMarkup}</td>`;
      }).join("")}</tr>`;
  }).join("");

  return `<section class="pr-team-editor" aria-labelledby="pr-team-target-title">
    <header class="pr-team-editor-head"><h3 id="pr-team-target-title">Player targets</h3>${picker}</header>
    ${note}
    <form data-pr-load-form="team-activity" data-pr-activity-id="${escape(activity.id)}" novalidate>
      <div class="pr-team-bulk">
        <div class="pr-plan-reference-fields">
          ${loadMetrics.map((metric) => {
            const name = "bulk-" + metric.key;
            return `<label><span>${metric.name}</span>${amountInput(metric, name, null, `All players ${metric.name}`, escape, true, {
              typed: readTeamInput(formKey, name), focus: name,
            })}</label>`;
          }).join("")}
        </div>
        <button type="button" data-pr-action="plan-team-fill" class="pr-team-secondary">Apply to all</button>
      </div>
      <p class="pr-plan-explanation">Apply filled values to every row below, then adjust individual targets before saving.</p>
      <div class="pr-plan-table-wrap"><table class="pr-plan-table" aria-label="Player targets for selected activity">
        <thead><tr><th scope="col">Player</th>${metricHeader()}</tr></thead><tbody>${rows}</tbody>
      </table></div>
      <div class="pr-plan-form-foot">
        <span>Blank means no target set. Use 0 for planned zero.</span>
        <button type="submit" class="pr-plan-primary" data-pr-focus="save-team-targets">Save player targets</button>
      </div>
      <p class="pr-team-feedback" data-pr-team-feedback="team-activity" aria-hidden="true">${feedbackForm === "team-activity" ? escape(status) : ""}</p>
    </form>
  </section>`;
}

function renderActivitySummary(context, activities, playerTotals, totals) {
  const { escape, draft, players, teamPlayers, days, canEdit, activityId, editableActivity, gps, showGps } = context;
  const rosterSize = players.length;
  const rows = days.flatMap((day) => {
    if (!day.activities.length) return [`<tr class="pr-plan-rest"><th scope="row">${dayAndActivity(day, null, escape)}</th><td colspan="3">—</td></tr>`];
    return day.activities.map((activity) => {
      const summary = summarizeLoadTargets(players.map((player) => draft.getTargets(player.id, activity.id)));
      const actual = showGps ? summarizeLoadTargets(players.map((player) => gpsSummaryMetrics(gps.getActual(player.id, activity.id)))) : null;
      const active = activity.id === activityId;
      return `<tr><th scope="row">${dayAndActivity(day, activity, escape)}
        ${canEdit && teamPlayers.length && editableActivity(activity.id) ? `<button type="button" data-pr-action="plan-team-activity" data-pr-value="${escape(activity.id)}"
          aria-pressed="${active}" aria-label="Edit player targets for ${escape(activity.title || activity.type)} on ${dateLabel(day.date)}"
          class="pr-plan-reference-link pr-team-row-action">${active ? "Editing player targets" : "Edit player targets"}</button>` : ""}</th>
        ${loadMetrics.map((metric) => aggregateCell(summary[metric.key], metric, rosterSize, "", actual?.[metric.key])).join("")}</tr>`;
    });
  }).join("");

  return `<p class="pr-plan-explanation">Each activity shows the average per player, the squad total, and how many players have a target.${showGps ? " GPS totals show how many players are included per metric." : ""}</p>
    <div class="pr-plan-table-wrap"><table class="pr-plan-table"><thead><tr><th scope="col">Activity · Periodization</th>${metricHeader()}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>${[["training", "Training week"], ["matches", "Match estimates"]].map(([key, label]) => {
      const activityCount = activities.filter(({ type }) => (type === "match") === (key === "matches")).length;
      return `<tr><th scope="row">${label} <small>Average of players’ entered totals</small></th>
        ${loadMetrics.map((metric) => {
          const entries = playerTotals.reduce((sum, player) => sum + player[key][metric.key].count, 0);
          const coverage = activityCount ? `${entries} / ${activityCount * rosterSize} activity targets set` : "";
          return aggregateCell(totals[key][metric.key], metric, rosterSize, coverage);
        }).join("")}</tr>`;
    }).join("")}</tfoot></table></div>
    ${canEdit ? activityEditor(context) : ""}`;
}

export function renderTeamWeek(context) {
  const { days, draft, players, teamView, gps, showGps } = context;
  const activities = days.flatMap((day) => day.activities);
  const playerTotals = players.map((player) => summarizePlayerWeek(draft, player.id, activities));
  const totals = Object.fromEntries(["training", "matches"].map((type) => [type,
    summarizeLoadTargets(playerTotals.map((summary) => Object.fromEntries(
      loadMetrics.map(({ key }) => [key, summary[type][key].total])
    ))),
  ]));
  return `${weekGoals(context, totals.training)}
    <div class="pr-team-view-tools">
      <div class="pr-plan-switches" role="group" aria-label="Team week layout">
        ${[["activities", "By activity"], ["players", "By player"]].map(([id, label]) =>
          `<button type="button" data-pr-action="plan-team-view" data-pr-value="${id}" data-pr-focus="team-view:${id}" aria-pressed="${teamView === id}">${label}</button>`
        ).join("")}
      </div>
      <button class="pr-team-secondary pr-team-gps-toggle" type="button" data-pr-action="plan-team-gps" data-pr-focus="team-gps" aria-pressed="${showGps}">Plan vs GPS</button>
    </div>
    ${showGps ? renderGpsAvailability(gps) : ""}
    ${teamView === "players" ? renderTeamWeekMatrix(context) : renderActivitySummary(context, activities, playerTotals, totals)}`;
}
