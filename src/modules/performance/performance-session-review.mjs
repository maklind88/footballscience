import { loadMetrics, planningRole, previewTeamTargets } from "./performance-load-plan.mjs";
import { availabilityLabels, dateLabel, participationStatus } from "./performance-overview.mjs";
import { createSessionComparison, trainingPlanAverage } from "./performance-session-review-data.mjs";
import { deltaText, formatGpsValue } from "./performance-week-gps.mjs";

const title = (activity) => activity.title || (activity.type === "match" ? "Match" : "Training");
const timeFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

function weekStrip({ days, review, escape }) {
  return `<div role="group" aria-label="Week days" class="pr-review-days">
    ${days.map((day) => {
      const selected = day.date === review.day.date;
      const hasMatch = day.activities.some(({ type }) => type === "match");
      const label = hasMatch ? "Match" : day.activities.length ? "Training" : day.events.length ? day.events[0].title : "No activity";
      return `<button type="button" data-pr-action="plan-review-day" data-pr-value="${day.date}"
        data-pr-focus="review-day:${day.date}" aria-pressed="${selected}"${hasMatch ? ' class="pr-review-match-day"' : ""}>
        <span>${dateLabel(day.date, { weekday: "short" })} <strong>${dateLabel(day.date, { day: "numeric" })}</strong></span>
        <small>${escape(day.matchContext || "—")}</small><span class="pr-review-day-type">${escape(label || "Other activity")}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function activityButton(activity, label, escape, inWeek = true) {
  return `<button type="button" class="pr-plan-reference-link" data-pr-action="${inWeek ? "plan-review-activity" : "plan-review-jump"}"
    data-pr-value="${escape(activity.id)}" data-pr-date="${escape(activity.date)}"
    data-pr-focus="review-activity:${escape(activity.id)}">${escape(label)}</button>`;
}

function sessionHeading(context) {
  const { review: { day, activity, match, followingTraining }, escape, canEdit, editableActivity, teamPlayers, reviewEditing } = context;
  const inWeek = (item) => context.days.some(({ date }) => date === item.date);
  const details = [dateLabel(day.date), activity.time, day.matchContext, activity.physicalLoad,
    activity.minutes != null ? `${activity.minutes} min planned${day.plan?.hasUntimedBlocks ? " (timed blocks)" : ""}` : null].filter(Boolean);
  return `${day.activities.length > 1 ? `<div role="group" aria-label="Sessions on selected day" class="pr-review-day-sessions">
    ${day.activities.map((item) => item.id === activity.id ? `<strong>${escape(title(item))}</strong>` : activityButton(item, title(item), escape)).join("")}
  </div>` : ""}
  <div class="pr-review-session-head">
    <div>
      <div class="pr-review-session-meta">${escape(details.join(" · "))}</div>
      <h3>${escape(title(activity))}</h3>
      ${match && match.id !== activity.id ? `<div class="pr-review-fixture">Previous match <span>${escape(dateLabel(match.date))} ·
        ${activityButton(match, title(match), escape, inWeek(match))}</span></div>` : ""}
      ${followingTraining ? `<div class="pr-review-fixture">Next training <span>${dateLabel(followingTraining.date)} ·
        ${activityButton(followingTraining, title(followingTraining), escape, inWeek(followingTraining))}</span></div>` : ""}
    </div>
    ${canEdit && teamPlayers.length && editableActivity(activity.id) ? `<button type="button"
      class="pr-team-secondary pr-review-edit" data-pr-action="plan-review-edit"
      data-pr-focus="review-edit" data-pr-value="${reviewEditing ? "" : escape(activity.id)}" aria-pressed="${reviewEditing}">
      ${reviewEditing ? "Back to review" : "Edit player targets"}</button>` : ""}
  </div>`;
}

function analysis(context, metric, comparison) {
  const { gps, players, review, draft, reviewEditing } = context;
  const activityId = review.activity.id;
  const planned = players.map(({ id }) => draft.getTargets(id, activityId)?.[metric.key]).filter(Number.isFinite);
  const planAverage = planned.length ? planned.reduce((total, value) => total + value, 0) / planned.length : null;
  const weekAverage = trainingPlanAverage(context, metric);
  const sources = {
    "not-connected": "GPS source not connected",
    unavailable: "GPS source unavailable",
    ready: gps.sample ? "Example GPS data" : "Linked GPS data",
  };
  const delta = comparison.count ? deltaText(comparison.actual, comparison.plan, metric) : "";
  return `<div class="pr-review-summary">
    <div class="pr-review-pair">
      <span>Comparable avg per player</span>
      ${comparison.count ? `<div><strong>${formatGpsValue(comparison.plan, metric)}</strong><span>Plan</span></div>
        <div><strong>${formatGpsValue(comparison.actual, metric)}</strong><span>GPS</span></div>
        <div><strong>${delta}</strong><span>Difference</span></div>` : '<p>No comparable values for this measure</p>'}
      <small>${comparison.count} of ${players.length} players comparable · ${sources[gps.status]}${reviewEditing ? " · Saved plan" : ""}</small>
    </div>
    <dl class="pr-review-plan-avg">
      <div><dt>Session plan avg</dt><dd>${formatGpsValue(planAverage, metric)}</dd><small>${planned.length} of ${players.length} players planned</small></div>
      <div><dt data-pr-review-week-label>Training week plan avg</dt><dd data-pr-review-week-avg>${formatGpsValue(weekAverage.count ? weekAverage.total / weekAverage.count : null, metric)}</dd><small data-pr-review-week-count>${weekAverage.count} of ${players.length} players planned</small></div>
    </dl>
  </div>`;
}

export function matchExposure(gps, playerId, match) {
  const duration = match && gps?.getActual(playerId, match.id)?.sessionDurationMinutes;
  return Number.isFinite(duration) ? `${timeFormat.format(duration)} min` : "—";
}

function comparisonTable(context, metric, comparison) {
  const { review: { match, activity }, escape, matchGps, recommendation, draft, canEdit, readTeamInput } = context;
  const showRecommendation = activity.type !== "match" && recommendation?.size > 0;
  const rows = comparison.rows.map(({ player, plan, actual, comparable, status }) => {
    const role = planningRole(player);
    const target = canEdit ? previewTeamTargets(draft, player.id, activity.id, readTeamInput)[metric.key] : plan;
    const changed = !Object.is(target ?? null, plan ?? null);
    const recommendationLabel = showRecommendation ? availabilityLabels[participationStatus(recommendation.get(player.id))] : "";
    return `<tr><th scope="row"><button class="pr-plan-reference-link" type="button" data-pr-action="plan-player"
      data-pr-value="${escape(player.id)}">${escape(player.name)}</button>${role ? `<small>${escape(role)}</small>` : ""}</th>
      ${match ? `<td>${matchExposure(matchGps, player.id, match)}</td>` : ""}
      ${showRecommendation ? `<td>${recommendationLabel}</td>` : ""}
      <td>${formatGpsValue(plan, metric)}${changed ? `<small>Draft ${formatGpsValue(target, metric)}</small>` : ""}</td>
      <td>${formatGpsValue(actual, metric)}</td>
      <td>${comparable && Number.isFinite(plan) ? deltaText(actual, plan, metric) : "—"}</td>
      <td class="pr-review-row-note">${status || "Comparable"}</td>
    </tr>`;
  }).join("");
  return `<div class="pr-review-table-wrap" tabindex="0" role="region" aria-label="Scrollable session comparison">
    <table class="pr-review-table" aria-label="Session player comparison">
      <thead><tr><th scope="col">Player</th>${match ? '<th scope="col">Match GPS time</th>' : ""}
        ${showRecommendation ? '<th scope="col">Medical recommendation</th>' : ""}
        <th scope="col">Plan</th><th scope="col">GPS</th><th scope="col">Δ</th><th scope="col">Comparison</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderSessionReview(context, renderEditor) {
  const { review: { activity, day, match }, reviewMetric, reviewEditing, teamPlayers: players } = context;
  const strip = weekStrip(context);
  if (!activity) return `${strip}<p class="pr-review-empty">${dateLabel(day.date)} · No training or match scheduled.</p>`;
  const metric = loadMetrics.find(({ key }) => key === reviewMetric);
  const comparison = createSessionComparison(players, activity.id, metric, context.draft.getTargets, context.gps);
  return `<section class="pr-session-review" aria-label="Session review">
    ${strip}
    ${sessionHeading(context)}
    <div class="pr-review-measures" role="group" aria-label="Review measure">
      ${loadMetrics.map(({ key, short }) => `<button type="button" data-pr-action="plan-review-metric"
        data-pr-value="${key}" data-pr-focus="review-metric:${key}" aria-pressed="${key === metric.key}">${short}</button>`).join("")}
    </div>
    ${analysis({ ...context, players }, metric, comparison)}
    ${match ? '<p class="pr-review-minute-note">Match GPS time is the recorded device session. Official playing minutes are unavailable.</p>' : ""}
    ${reviewEditing
      ? renderEditor({ ...context, showGps: true, reviewMode: true })
      : players.length ? comparisonTable(context, metric, comparison) : '<p class="pr-review-empty">No Squad players for this week.</p>'}
  </section>`;
}
