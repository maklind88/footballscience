import { dateLabel } from "./performance-overview.mjs";
import { activityInputPrefix, formatLoad, loadMetrics, planningRole, summarizePlayerWeek } from "./performance-load-plan.mjs";
import { amountInput, dayAndActivity, metricHeader } from "./performance-load-plan-fields.mjs";
import { formatGpsValue, gpsSummaryMetrics, renderGpsMetric } from "./performance-week-gps.mjs";
import { renderTeamWeek } from "./performance-team-week-renderer.mjs";

function rangeLabel(days) {
  const first = dateLabel(days[0].date, { day: "numeric", month: "short" });
  const last = dateLabel(days.at(-1).date, { day: "numeric", month: "short", year: "numeric" });
  return `${first} – ${last}`;
}

function weeklyLoads(summary, title) {
  return `<section class="pr-plan-totals" aria-label="${title}">
    ${loadMetrics.map((metric) => `<div><span>${metric.name}</span><strong>${formatLoad(summary[metric.key].total, metric)} <small>${metric.unit}</small></strong></div>`).join("")}
  </section>`;
}

function playerSelector(players, selected, escape) {
  return `<label class="pr-plan-select"><span>Player</span><select data-pr-plan-player data-pr-focus="plan-player">
    ${selected ? "" : '<option value="" selected disabled>Select a player</option>'}
    ${players.map((player) => `<option value="${escape(player.id)}"${player.id === selected?.id ? " selected" : ""}>
      ${escape(player.name)}${planningRole(player) ? ` · ${escape(planningRole(player))}` : ""}
    </option>`).join("")}
  </select></label>`;
}

function referenceStrip(reference) {
  return `<dl class="pr-plan-reference-strip" aria-label="Resolved reference">
    ${loadMetrics.map((metric) => {
      const resolved = reference[metric.key];
      return `<div><dt>${metric.short} reference</dt>
        <dd>${resolved ? `${formatLoad(resolved.value, metric)} ${metric.unit} <small>${resolved.source}</small>` : "Not set"}</dd></div>`;
    }).join("")}
  </dl>`;
}

function playerPlan({ escape, draft, selected, players, days, canEdit, playerUnavailable, gps }) {
  if (playerUnavailable) return `
    <p class="pr-placeholder">This Squad profile is unavailable for the selected week.</p>
    ${players.length ? playerSelector(players, null, escape) : ""}`;
  if (!selected) return '<p class="pr-placeholder">No Squad players available.</p>';
  const activities = days.flatMap((day) => day.activities);
  const totals = summarizePlayerWeek(draft, selected.id, activities);
  const actual = (activityId) => gps.getActual(selected.id, activityId);
  const hasActual = activities.some(({ id }) => actual(id));
  const measured = hasActual ? summarizePlayerWeek({
    getTargets: (_, activityId) => gpsSummaryMetrics(actual(activityId)),
  }, selected.id, activities) : null;
  const rows = days.flatMap((day) => {
    if (!day.activities.length) {
      return [`<tr class="pr-plan-rest"><th scope="row">${dayAndActivity(day, null, escape)}</th><td colspan="3">—</td></tr>`];
    }
    return day.activities.map((activity) => {
      const targets = draft.getTargets(selected.id, activity.id);
      return `<tr><th scope="row">${dayAndActivity(day, activity, escape)}</th>${loadMetrics.map((metric) => {
        const plan = targets?.[metric.key];
        const input = amountInput(metric, activityInputPrefix(activity) + metric.key, plan,
          `${activity.title || activity.type} ${dateLabel(day.date)} ${metric.name}`, escape, canEdit);
        return `<td>${hasActual ? renderGpsMetric(input, plan, actual(activity.id), metric) : input}</td>`;
      }).join("")}</tr>`;
    });
  }).join("");
  return `<div class="pr-plan-context">${playerSelector(players, selected, escape)}${referenceStrip(draft.getReference(selected))}
      <button type="button" data-pr-action="plan-reference" data-pr-value="${escape(`player:${selected.id}`)}" class="pr-plan-reference-link">${canEdit ? "Edit player baselines" : "View player baselines"}</button>
    </div>
    <div class="pr-plan-week-totals">
      <section><h3>Training planned</h3>${weeklyLoads(totals.training, "Player training totals")}</section>
      <section><h3>Match estimates</h3>${weeklyLoads(totals.matches, "Player match totals")}</section>
    </div>
    ${measured ? `<div class="pr-player-gps-summary"><h3>Measured this week</h3>
      <dl>${loadMetrics.map((metric) => `<div><dt>${metric.short}</dt><dd><strong>${formatGpsValue(measured.week[metric.key].total, metric)}</strong>
        <small>${measured.week[metric.key].count} of ${activities.length} activities</small></dd></div>`).join("")}</dl>
      <p>Totals include linked activities with confirmed definitions. Baselines above are separate references.</p></div>` : ""}
    <form data-pr-load-form="player" novalidate>
      <div class="pr-plan-table-wrap"><table class="pr-plan-table"><thead><tr><th scope="col">Activity · Periodization</th>${metricHeader()}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="pr-plan-form-foot"><span>Blank means no target set. Use 0 for planned zero.</span>
        ${canEdit ? `<button class="pr-plan-primary" type="submit" data-pr-focus="save-player"${activities.length ? "" : " disabled"}>Save player plan</button>` : ""}
      </div>
    </form>`;
}

function referencesView({ escape, players, referenceScope, draft, selected, canEdit }) {
  const roles = [...new Set(players.map(planningRole).filter(Boolean))].sort();
  const choices = [
    ["team", "Team default"],
    ...roles.map((role) => [`role:${role}`, `Position · ${role}`]),
    ...players.map((player) => [`player:${player.id}`, `Player · ${player.name}`]),
  ];
  const values = draft.getExplicitReference(referenceScope);
  const referencePlayer = players.find((player) => `player:${player.id}` === referenceScope) ?? selected;
  const coverage = players.map((player) => {
    const reference = draft.getReference(player);
    return `<tr><th scope="row">
      <button type="button" class="pr-plan-reference-link" data-pr-action="plan-reference" data-pr-value="${escape(`player:${player.id}`)}">${escape(player.name)}</button>
    </th>${loadMetrics.map((metric) => {
      const resolved = reference[metric.key];
      return `<td><strong>${formatLoad(resolved?.value, metric)}</strong>${resolved ? `<small>${resolved.source}</small>` : ""}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<p class="pr-plan-explanation">A player's own value takes precedence for each measure. Empty values use the position reference, then the team default.</p>
    <form data-pr-load-form="reference" novalidate>
      <label class="pr-plan-select"><span>${canEdit ? "Set reference for" : "Reference for"}</span><select data-pr-reference-scope data-pr-focus="plan-reference-scope">
        ${choices.map(([key, label]) => `<option value="${escape(key)}"${key === referenceScope ? " selected" : ""}>${escape(label)}</option>`).join("")}
      </select></label>
      <div class="pr-plan-reference-fields">
        ${loadMetrics.map((metric) => `<label><span>${metric.name}</span>${amountInput(metric, metric.key, values?.[metric.key], metric.name, escape, canEdit)}</label>`).join("")}
      </div>
      <div class="pr-plan-form-foot"><span>Reference values guide the plan for an activity.</span>
        ${canEdit ? `<button class="pr-plan-primary" type="submit" data-pr-focus="save-reference">Save reference</button>` : ""}
      </div>
    </form>
    ${referencePlayer ? `<h3 class="pr-plan-reference-name">${escape(referencePlayer.name)} · reference in use</h3>${referenceStrip(draft.getReference(referencePlayer))}` : ""}
    ${coverage ? `<h3 class="pr-plan-reference-name">Squad baselines</h3>
      <div class="pr-plan-table-wrap"><table class="pr-plan-table"><thead><tr><th scope="col">Player</th>${metricHeader()}</tr></thead>
        <tbody>${coverage}</tbody></table></div>` : ""}`;
}

export function renderLoadPlanning(context) {
  const { days, mode, status, escape, isSample, persisted, phase, canEdit, retry, feedbackForm, activityId, teamView } = context;
  const label = persisted ? (phase === "ready" && !canEdit ? "Read only" : "Saved team plan") : `${isSample ? "Example week · " : ""}Draft in this tab`;
  const inlineFeedback = mode === "team" && (feedbackForm === "week-goal" ||
    (teamView === "players" && feedbackForm === "team-week") ||
    (teamView === "activities" && canEdit && activityId && feedbackForm === "team-activity"));
  const panels = { team: renderTeamWeek, player: playerPlan, references: referencesView };
  return `<section class="pr-plan-workbench pr-panel">
    <header class="pr-plan-heading">
      <div><h2>Microcycle Load Plan</h2><p>${rangeLabel(days)} · <span>${label}</span></p></div>
      <div class="pr-plan-switches pr-plan-mode-switches" role="group" aria-label="Load plan view">
        ${[["team", "Team week"], ["player", "Player plan"], ["references", "Baselines"]].map(([id, label]) =>
          `<button type="button" data-pr-action="plan-mode" data-pr-value="${id}" data-pr-focus="plan-mode:${id}"
            aria-pressed="${mode === id}">${label}</button>`).join("")}
      </div>
    </header>
    ${phase === "ready" ? panels[mode](context) : ""}
    <p class="pr-plan-status${inlineFeedback ? " pr-plan-status-inline" : ""}" role="status">${phase === "loading" ? "Loading saved plans…" : escape(status)}</p>
    ${persisted ? `<button type="button" class="pr-plan-reference-link" data-pr-action="plan-reload"${phase === "error" || retry ? "" : " hidden"}>Reload saved values</button>` : ""}
  </section>`;
}
