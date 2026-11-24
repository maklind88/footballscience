import { dateLabel } from "./performance-overview.mjs";
import { activityInputPrefix, formatLoad, loadMetrics, planningRole, summarizeLoadTargets, summarizePlayerWeek } from "./performance-load-plan.mjs";

function metricHeader() {
  return loadMetrics.map(({ name, unit }) => `<th scope="col">${name} <small>${unit}</small></th>`).join("");
}

function rangeLabel(days) {
  const first = dateLabel(days[0].date, { day: "numeric", month: "short" });
  const last = dateLabel(days.at(-1).date, { day: "numeric", month: "short", year: "numeric" });
  return `${first} – ${last}`;
}

function plannedActivityLabel(activity, escape) {
  const info = [
    activity.type === "match" ? "Match estimate" : activity.physicalLoad,
    activity.minutes != null ? `${activity.minutes} plan min` : "",
    activity.time,
  ].filter(Boolean);
  return `<div class="pr-plan-activity">
    <strong>${escape(activity.title || (activity.type === "match" ? "Match" : "Training"))}</strong>
    ${info.length ? `<small>${escape(info.join(" · "))}</small>` : ""}
  </div>`;
}

function dayAndActivity(day, activity, escape) {
  return `<span class="pr-plan-day-label">${dateLabel(day.date)} ${day.matchContext ? `<small>${escape(day.matchContext)}</small>` : ""}</span>
    ${activity ? plannedActivityLabel(activity, escape) : `<span class="pr-plan-no-activity">${day.sessionType === "Off" ? "Off" : "No training or match scheduled"}</span>`}`;
}

function amountInput(metric, name, value, label, escape, canEdit) {
  return `<div class="pr-plan-input">
    <input type="text" inputmode="${metric.scale === 1000 ? "decimal" : "numeric"}" name="${name}" aria-label="${escape(label)}"
      value="${value == null ? "" : value / metric.scale}" placeholder="—" autocomplete="off"${canEdit ? "" : " readonly"}>
    <span aria-hidden="true">${metric.unit}</span>
  </div>`;
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

function playerPlan({ escape, draft, selected, players, days, canEdit, playerUnavailable }) {
  if (playerUnavailable) return `
    <p class="pr-placeholder">This Squad profile is unavailable for the selected week.</p>
    ${players.length ? playerSelector(players, null, escape) : ""}`;
  if (!selected) return '<p class="pr-placeholder">No Squad players available.</p>';
  const activities = days.flatMap((day) => day.activities);
  const totals = summarizePlayerWeek(draft, selected.id, activities);
  const rows = days.flatMap((day) => {
    if (!day.activities.length) {
      return [`<tr class="pr-plan-rest"><th scope="row">${dayAndActivity(day, null, escape)}</th><td colspan="3">—</td></tr>`];
    }
    return day.activities.map((activity) => {
      const targets = draft.getTargets(selected.id, activity.id);
      return `<tr><th scope="row">${dayAndActivity(day, activity, escape)}</th>${loadMetrics.map((metric) =>
        `<td>${amountInput(metric, activityInputPrefix(activity) + metric.key, targets?.[metric.key],
          `${activity.title || activity.type} ${dateLabel(day.date)} ${metric.name}`, escape, canEdit)}</td>`).join("")}</tr>`;
    });
  }).join("");
  return `<div class="pr-plan-context">${playerSelector(players, selected, escape)}${referenceStrip(draft.getReference(selected))}
      <button type="button" data-pr-action="plan-reference" data-pr-value="${escape(`player:${selected.id}`)}" class="pr-plan-reference-link">${canEdit ? "Edit player baselines" : "View player baselines"}</button>
    </div>
    <div class="pr-plan-week-totals">
      <section><h3>Training planned</h3>${weeklyLoads(totals.training, "Player training totals")}</section>
      <section><h3>Match estimates</h3>${weeklyLoads(totals.matches, "Player match totals")}</section>
    </div>
    <form data-pr-load-form="player" novalidate>
      <div class="pr-plan-table-wrap"><table class="pr-plan-table"><thead><tr><th scope="col">Activity · Periodization</th>${metricHeader()}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="pr-plan-form-foot"><span>Blank means no target set. Use 0 for planned zero.</span>
        ${canEdit ? `<button class="pr-plan-primary" type="submit" data-pr-focus="save-player"${activities.length ? "" : " disabled"}>Save player plan</button>` : ""}
      </div>
    </form>`;
}

function aggregateCell({ total, count }, metric, rosterSize, coverage = "") {
  return `<td><strong>${formatLoad(count ? Math.round(total / count) : null, metric)}</strong>
    <small>${count} / ${rosterSize} players</small>${count ? `<small>${formatLoad(total, metric)} ${metric.unit} total</small>` : ""}${coverage ? `<small>${coverage}</small>` : ""}
  </td>`;
}

function teamPlan({ escape, draft, players, days }) {
  const activities = days.flatMap((day) => day.activities);
  const playerTotals = players.map((player) => summarizePlayerWeek(draft, player.id, activities));
  const rosterSize = players.length;
  function weekTotals(type) {
    return summarizeLoadTargets(playerTotals.map((summary) => Object.fromEntries(
      loadMetrics.map(({ key }) => [key, summary[type][key].total])
    )));
  }
  const rows = days.flatMap((day) => {
    if (!day.activities.length) return [`<tr class="pr-plan-rest"><th scope="row">${dayAndActivity(day, null, escape)}</th><td colspan="3">—</td></tr>`];
    return day.activities.map((activity) => {
      const summary = summarizeLoadTargets(players.map((player) => draft.getTargets(player.id, activity.id)));
      return `<tr><th scope="row">${dayAndActivity(day, activity, escape)}</th>
        ${loadMetrics.map((metric) => aggregateCell(summary[metric.key], metric, rosterSize)).join("")}</tr>`;
    });
  }).join("");
  return `<p class="pr-plan-explanation">Each activity shows the average per player, the squad total, and how many players have a target.</p>
    <div class="pr-plan-table-wrap"><table class="pr-plan-table"><thead><tr><th scope="col">Activity · Periodization</th>${metricHeader()}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>${[["training", "Training week"], ["matches", "Match estimates"]].map(([key, label]) => {
      const summary = weekTotals(key);
      const activityCount = activities.filter(({ type }) => (type === "match") === (key === "matches")).length;
      return `<tr><th scope="row">${label} <small>Average of players’ entered totals</small></th>
        ${loadMetrics.map((metric) => {
          const entries = playerTotals.reduce((sum, player) => sum + player[key][metric.key].count, 0);
          const coverage = activityCount ? `${entries} / ${activityCount * rosterSize} activity targets set` : "";
          return aggregateCell(summary[metric.key], metric, rosterSize, coverage);
        }).join("")}</tr>`;
    }).join("")}</tfoot></table></div>`;
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
  const { days, mode, status, escape, isSample, persisted, phase, canEdit, retry } = context;
  const label = persisted ? (phase === "ready" && !canEdit ? "Read only" : "Saved team plan") : `${isSample ? "Example week · " : ""}Draft in this tab`;
  const panels = { team: teamPlan, player: playerPlan, references: referencesView };
  return `<section class="pr-plan-workbench pr-panel">
    <header class="pr-plan-heading">
      <div><p>${rangeLabel(days)}</p><h2>Microcycle Load Plan</h2></div>
      <span class="pr-plan-draft">${label}</span>
    </header>
    <div class="pr-plan-switches" aria-label="Load plan view">
      ${[["team", "Team week"], ["player", "Player plan"], ["references", "Baselines"]].map(([id, label]) =>
        `<button type="button" data-pr-action="plan-mode" data-pr-value="${id}" data-pr-focus="plan-mode:${id}"
          aria-pressed="${mode === id}">${label}</button>`).join("")}
    </div>
    ${phase === "ready" ? panels[mode](context) : ""}
    <p class="pr-plan-status" role="status">${phase === "loading" ? "Loading saved plans…" : escape(status)}</p>
    ${persisted ? `<button type="button" class="pr-plan-reference-link" data-pr-action="plan-reload"${phase === "error" || retry ? "" : " hidden"}>Reload saved values</button>` : ""}
  </section>`;
}
