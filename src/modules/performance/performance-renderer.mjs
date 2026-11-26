import { scheduleEventTypes } from "../schedule/events.mjs";
import { availabilityLabels, dateLabel } from "./performance-overview.mjs";
import { renderPerformanceCheckins } from "./performance-checkins.mjs";
import { renderGpsHistory } from "./performance-gps-history.mjs";
import { renderLoadPlanning } from "./performance-load-plan-renderer.mjs";

export const performanceViews = Object.freeze({
  overview: "Overview",
  "load-plan": "Team week",
  microcycle: "Microcycle",
  season: "Season Monitoring",
  players: "Players",
  checkins: "Wellness & RPE",
  positions: "Positions",
  testing: "Testing",
  drills: "Drill Library",
  data: "Data Review",
  "gps-history": "GPS History",
});

const availabilityKeys = Object.keys(availabilityLabels);
const unavailableMetrics = {
  gps: "GPS coverage is shown in load planning",
  wellness: "Wellness feed not connected",
  rpe: "RPE collection not connected",
  testing: "Testing results not connected",
};
const primaryViews = new Set(["overview", "load-plan", "players", "microcycle", "checkins"]);
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const minutes = (value) => value == null ? "—" : `${number.format(value)} min`;

function action(escape, type, value, label, attrs = "") {
  return `<button type="button" data-pr-action="${type}" data-pr-value="${escape(value)}" data-pr-focus="${escape(`${type}:${value}`)}"${attrs}>${label}</button>`;
}

function sourceLink(ctx, id, label, date = "") {
  if (!ctx.canRead(id)) return "";
  return action(ctx.escape, "source", id, `${label} <span aria-hidden="true">↗</span>`,
    ` class="pr-source" data-pr-date="${ctx.escape(date)}"`);
}

function panel(heading, content, options = {}) {
  const { className = "", subtitle = "", control = "" } = options;
  return `<section class="pr-panel ${className}">
    <header class="pr-panel-head"><div><h2>${heading}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${control}</header>
    ${content}
  </section>`;
}

function placeholder(message) {
  return `<p class="pr-placeholder">${message}</p>`;
}

function safeReport(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function dayChart(ctx) {
  const { escape, date, metric, overview: { days } } = ctx;
  const hasMinutes = days.some((day) => day.plan?.minutes != null);
  const graphMax = Math.max(60, Math.ceil(Math.max(...days.map((day) => day.plan?.minutes ?? 0)) / 60) * 60);
  const showMinutes = metric === "minutes";
  const chart = days.map((day) => {
    const labels = day.events.map((event) => event.title || scheduleEventTypes[event.type]?.label || "Activity");
    const match = day.events.some((event) => event.type === "match");
    const amount = day.plan?.minutes;
    const load = day.physicalLoad || "—";
    const sublabel = day.matchDay || (match ? "Match" : "");
    const label = [dateLabel(day.date), ...labels, sublabel, showMinutes ? `Planned ${minutes(amount)}` : `Load focus ${load}`].filter(Boolean).join(" · ");
    return action(escape, "day", day.date, `
      ${showMinutes ? `<span class="pr-plot" aria-hidden="true">
          ${amount != null ? `<span class="pr-bar" style="--pr-bar:${amount * 100 / graphMax}%"></span>` : `<span class="pr-dash">—</span>`}
        </span>` : `<span class="pr-load-focus">${escape(load)}</span>`}
      <span class="pr-day-name">${dateLabel(day.date, { weekday: "short" })}</span>
      <span class="pr-day-md">${escape(sublabel || dateLabel(day.date, { day: "numeric", month: "short" }))}</span>
      <span class="pr-day-event">${escape(labels.join(" · ") || day.sessionType || "—")}</span>`,
    ` class="pr-day${match ? " pr-match-day" : ""}" aria-label="${escape(label)}" title="${escape(label)}" aria-pressed="${day.date === date}"`);
  }).join("");
  const control = `<div class="pr-segment" aria-label="Microcycle metric">${[["minutes", "Minutes"], ["focus", "Load focus"]]
    .map(([value, label]) => action(escape, "metric", value, label, ` aria-pressed="${metric === value}"`)).join("")}</div>`;
  const axis = showMinutes && hasMinutes
    ? `<div class="pr-axis" aria-hidden="true">${[1, .75, .5, .25, 0].map((tick) => `<span>${graphMax * tick}</span>`).join("")}</div>` : "";
  const weekLabel = `${dateLabel(days[0].date, { day: "numeric", month: "short" })} – ${dateLabel(days.at(-1).date, { day: "numeric", month: "short" })}`;
  return panel("Microcycle Progress", `<div class="pr-chart ${axis ? "pr-chart-axis" : ""}">${axis}<div class="pr-days">${chart}</div></div>
       <div class="pr-chart-foot">${showMinutes ? `<span><i class="pr-legend-dot"></i> Planned minutes</span>${ctx.loadPlanningEnabled ? action(escape, "view", "load-plan", "View GPS in Team week ›", ' class="pr-link pr-chart-link"') : ""}` : "<span>Physical load from Periodization</span>"}</div>`,
    { className: "pr-microcycle", subtitle: weekLabel, control });
}

function availabilitySummary(ctx) {
  const { escape, overview: { squad, counts } } = ctx;
  const total = squad.length;
  let position = 0;
  const segments = availabilityKeys.filter((key) => counts[key]).map((key) => {
    const start = position;
    position += (counts[key] / total) * 100;
    return `var(--pr-${key}) ${start}% ${position}%`;
  });
  const gradient = segments.length ? `conic-gradient(${segments.join(",")})` : "var(--pr-track)";
  return panel("Squad Availability", `<div class="pr-ring-layout">
    <div class="pr-ring" style="--pr-ring:${gradient}"><div><strong>${total || "—"}</strong><small>Players</small></div></div>
    <div class="pr-ring-labels">${availabilityKeys.map((key) =>
      action(escape, "availability", key, `<span><i class="pr-fill-${key}"></i>${availabilityLabels[key]}</span><strong>${total ? counts[key] : "—"}</strong>`)).join("")}</div>
    </div>${total ? "" : placeholder("No visible Squad players for this date.")}`,
    { subtitle: `${counts.full} of ${total} full training · ${counts.unknown} not set` });
}

function weekLoad(ctx) {
  const days = ctx.overview.days;
  const timedDays = days.filter((day) => day.plan?.minutes != null);
  const totalMinutes = timedDays.length ? timedDays.reduce((sum, day) => sum + day.plan.minutes, 0) : null;
  const matches = days.flatMap((day) => day.events).filter((event) => event.type === "match").length;
  const details = [
    ["Timed session plans", timedDays.length],
    ["Matches scheduled", matches],

  ];
  return panel("Training Load (Week)", `<div class="pr-week-load"><strong>${minutes(totalMinutes)}</strong><span>Planned block time</span></div>
    <dl class="pr-paired">${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    ${action(ctx.escape, "view", "season", "Open season monitoring <span aria-hidden=\"true\">›</span>", ' class="pr-link"')}`);
}

function playerRow(ctx, player) {
  const { escape } = ctx;
  return action(escape, "player", player.id,
    `<span class="pr-player-number">${escape(player.number || "–")}</span><span><strong>${escape(player.name)}</strong><small>${escape(player.position || "Position not set")}</small></span>
      <span class="pr-tone-${player.availability}">${availabilityLabels[player.availability]}</span><span aria-hidden="true">›</span>`,
    ' class="pr-player-row"');
}

function individualFollowUp(ctx) {
  const { squad, counts } = ctx.overview;
  const limited = squad.filter((player) => ["modified", "unavailable"].includes(player.availability));
  return panel("Individual Follow-up", `<div class="pr-player-list">
    ${limited.slice(0, 4).map((player) => playerRow(ctx, player)).join("")}
    ${limited.length ? "" : placeholder(counts.full ? "No recorded modified or unavailable players." : "No dated recommendations available.")}
    </div>${action(ctx.escape, "view", "players", "Open player list <span aria-hidden=\"true\">›</span>", ' class="pr-link"')}`,
    { subtitle: "Modified and unavailable players" });
}

function selectedActivity(ctx) {
  const { escape, date, overview: { selected: day } } = ctx;
  const dayLabel = dateLabel(date, { weekday: "long", day: "numeric", month: "long" });
  const list = day.events.map((event) => `<li><time>${escape(event.time || "—")}</time><b>${escape(event.title || scheduleEventTypes[event.type]?.label || "Activity")}</b>
    <span>${escape(scheduleEventTypes[event.type]?.label || "Activity")}</span></li>`).join("");
  const reportUrl = safeReport(day.gpsReport);
  return panel(dayLabel, `<ul class="pr-activities">${list}</ul>${list ? "" : placeholder("No activities scheduled for this date.")}
    <dl class="pr-paired"><div><dt>Match day</dt><dd>${escape(day.matchDay || "—")}</dd></div><div><dt>Planned load focus</dt><dd>${escape(day.physicalLoad || "—")}</dd></div>
    <div><dt>Planned block time</dt><dd>${minutes(day.plan?.minutes)}</dd></div></dl>
    <div class="pr-source-links">${sourceLink(ctx, "schedule", "Schedule", date)}${sourceLink(ctx, "periodization", "Periodization", date)}
    ${sourceLink(ctx, "session-planner", "Session Planner", date)}
    ${reportUrl ? `<a class="pr-source" href="${escape(reportUrl)}" target="_blank" rel="noopener noreferrer">GPS report ↗</a>` : ""}
    </div>`, {
      subtitle: "Day activity and plan",
      control: ctx.view === "overview"
        ? action(escape, "view", "session", "Open session details ›", ' class="pr-link"')
        : "",
    });
}

function sessionDetails(ctx) {
  const { escape, overview: { selected: day } } = ctx;
  const rows = day.plan?.blocks.map((block) => `<tr><th scope="row">${escape(block.title)}</th><td>${minutes(block.minutes)}</td><td>${escape(block.intensity || "—")}</td></tr>`).join("");
  const matches = day.events.some((event) => event.type === "match");
  return `<div class="pr-detail-grid">${selectedActivity(ctx)}
    ${panel("Session Plan", rows ? `<div class="pr-table-wrap"><table class="pr-table"><thead><tr><th scope="col">Block</th><th scope="col">Planned</th><th scope="col">Intensity</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : placeholder("No session blocks saved for this date."), { subtitle: "Date-level plan from Session Planner" })}
    ${matches ? panel("Match Minutes", placeholder("Official player match minutes are not connected.")) : ""}
    </div>`;
}

function players(ctx) {
  const { escape, availabilityFilter, overview: { squad } } = ctx;
  const rows = squad.filter((player) => availabilityFilter === "all" || player.availability === availabilityFilter);
  return panel("Squad", `<div class="pr-player-list">${rows.map((player) => playerRow(ctx, player)).join("") || placeholder("No players in this view.")}</div>
    <div class="pr-source-links">${sourceLink(ctx, "medical-team", "Medical Team", ctx.date)}</div>`,
    { subtitle: dateLabel(ctx.date), control: `<div class="pr-segment pr-wrap" aria-label="Filter players">${["all", ...availabilityKeys]
      .map((value) => action(escape, "availability", value, availabilityLabels[value] || "All", ` aria-pressed="${availabilityFilter === value}"`)).join("")}</div>` });
}

function playerDetail(ctx) {
  const player = ctx.overview.squad.find(({ id }) => id === ctx.playerId);
  if (!player) return panel("Player", placeholder("This player is unavailable in the selected Squad view."));
  return panel(ctx.escape(player.name), `<dl class="pr-paired"><div><dt>Position</dt><dd>${ctx.escape(player.position || "—")}</dd></div>
    <div><dt>Availability recommendation</dt><dd class="pr-tone-${player.availability}">${availabilityLabels[player.availability]}</dd></div>
    </dl>
    <div class="pr-source-links">${ctx.loadPlanningEnabled ? action(ctx.escape, "plan-player", player.id, "Open player's load plan ›", ' class="pr-source"') : ""}
    ${ctx.checkinsEnabled ? action(ctx.escape, "player-checkins", player.id, "Wellness &amp; RPE ›", ' class="pr-source"') : ""}
    ${sourceLink(ctx, "player-profiles", "Squad")}${sourceLink(ctx, "idp", "Player Development")}</div>`, { subtitle: dateLabel(ctx.date) });
}

function positionGroups(ctx) {
  const { escape, overview: { squad } } = ctx;
  const groups = new Map();
  for (const player of squad) {
    const label = player.position || player.roleGroup || "Position not set";
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return panel("Positional Analysis", `<dl class="pr-paired">${Array.from(groups, ([label, count]) =>
    `<div><dt>${escape(label)}</dt><dd>${count} players</dd></div>`).join("")}</dl>
    ${squad.length ? "" : placeholder("No visible Squad players.")}
    ${ctx.loadPlanningEnabled ? action(escape, "open-compare", "", "Compare GPS by unit ›", ' class="pr-link"') : ""}`);
}

function seasonMonitoring(ctx) {
  const { escape, summary, range } = ctx;
  return panel("Season Monitoring", `<dl class="pr-paired">
    <div><dt>Planned block time</dt><dd>${minutes(summary.minutes)}</dd></div>
    <div><dt>Trainings scheduled</dt><dd>${summary.trainings}</dd></div><div><dt>Matches scheduled</dt><dd>${summary.matches}</dd></div>
    </dl><ul class="pr-season-list">${summary.plans.map(({ date, plan }) => `<li>${action(escape, "day", date,
      `<span>${dateLabel(date)}</span><strong>${minutes(plan.minutes)}</strong><span aria-hidden="true">›</span>`)}</li>`).join("")}</ul>
    ${summary.plans.length ? "" : placeholder("No session plans in this range.")}`,
  { subtitle: `${dateLabel(summary.from)} – ${dateLabel(summary.through)} · Timed blocks only`,
    control: `<div class="pr-segment" aria-label="Date range">${["7", "14", "28", "season"].map((value) =>
      action(escape, "range", value, value === "season" ? "Season" : `${value} days`, ` aria-pressed="${range === value}"`)).join("")}</div>` });
}

function drillLibrary(ctx) {
  const { escape, sources: { drills }, overview: { selected } } = ctx;
  const library = new Map(drills.map((drill) => [drill.id, drill]));
  const references = selected.plan?.blocks.filter((block) => library.has(block.exerciseId)) ?? [];
  return panel("Drill Library", `<dl class="pr-paired">
    <div><dt>Exercises in Session Planner</dt><dd>${drills.length}</dd></div>
    ${references.map((block) => `<div><dt>${escape(library.get(block.exerciseId).title || block.title)}</dt><dd>${minutes(block.minutes)} planned</dd></div>`).join("")}</dl>
    <p class="pr-footnote">GPS per drill requires GPS intervals linked to Session Planner blocks.</p>
    ${sourceLink(ctx, "session-planner", "Open Session Planner", ctx.date)}`, { subtitle: "Library and referenced exercises for the selected day" });
}

function dataReview(ctx) {
  const { overview: { squad, counts, selected } } = ctx;
  return panel("Data Sources", `<dl class="pr-paired">
    <div><dt>Schedule activities for selected day</dt><dd>${ctx.canRead("schedule") ? selected.events.length : "Access restricted"}</dd></div>
    <div><dt>Periodization load focus</dt><dd>${ctx.canRead("periodization") ? ctx.escape(selected.physicalLoad || "Not set") : "Access restricted"}</dd></div>
    <div><dt>Session Planner blocks</dt><dd>${ctx.canRead("session-planner") ? selected.plan?.blocks.length || 0 : "Access restricted"}</dd></div>
    <div><dt>Medical recommendations recorded</dt><dd>${ctx.canRead("medical-team") ? `${squad.length - counts.unknown} of ${squad.length}` : "Access restricted"}</dd></div>
    ${Object.entries(unavailableMetrics).map(([key, value]) => `<div><dt>${{ gps: "External load", wellness: "Wellness", rpe: "Internal load", testing: "Physical Testing" }[key]}</dt><dd>${ctx.checkinsEnabled && ["wellness", "rpe"].includes(key) ? action(ctx.escape, "view", "checkins", "Open check-ins ›", ' class="pr-link"') : value}</dd></div>`).join("")}
    <div><dt>Official player match minutes</dt><dd>No connected source</dd></div></dl>`, { subtitle: "Source coverage for the selected date" });
}

export function renderPerformanceRoom(ctx) {
  const { escape, date, teamName, teamLogo, view, overview } = ctx;
  const activeNav = view === "session" ? "microcycle" : view === "player" ? "players" : view;
  const match = overview.nextMatch;
  const heading = performanceViews[view] || (view === "session" ? "Session Details" : "Player Profile");
  const views = {
    overview: () => `<div class="pr-overview-main">${dayChart(ctx)}${selectedActivity(ctx)}</div>
      <div class="pr-overview-squad">${availabilitySummary(ctx)}${individualFollowUp(ctx)}</div>`,
    microcycle: () => `${ctx.loadPlanningEnabled ? action(escape, "view", "load-plan", "Open load planning ›", ' class="pr-link"') : ""}
      <div class="pr-microcycle-grid">${dayChart(ctx)}${weekLoad(ctx)}</div>${sessionDetails(ctx)}`,
    "load-plan": () => renderLoadPlanning({ ...ctx.planning, escape, checkinsEnabled: ctx.checkinsEnabled }),
    session: () => sessionDetails(ctx),
    season: () => seasonMonitoring(ctx),
    players: () => players(ctx),
    player: () => playerDetail(ctx),
    positions: () => positionGroups(ctx),
    testing: () => panel("Physical Testing", placeholder(`${unavailableMetrics.testing}. Speed, strength, CMJ and aerobic capacity will appear when a source is connected.`)),
    drills: () => drillLibrary(ctx),
    data: () => dataReview(ctx),
    checkins: () => renderPerformanceCheckins(ctx.checkinView, escape),
    "gps-history": () => renderGpsHistory(ctx.history, escape),
  };
  const navigation = Object.entries(performanceViews).filter(([key]) =>
    (key !== "gps-history" || ctx.gpsHistoryEnabled) &&
    (key !== "checkins" || ctx.checkinsEnabled) && (key !== "load-plan" || ctx.loadPlanningEnabled));
  const renderNav = (items) => items.map(([key, label]) => action(escape, "view", key, label,
    `${key === activeNav ? ' aria-current="page"' : ""}${key === "load-plan" ? ' aria-label="Open Team week"' : ""}`)).join("");
  return `<div class="pr-room" data-pr-screen="${view}">
    <header class="pr-header">
      <div class="pr-heading"><div class="pr-team">${teamLogo ? `<img src="${escape(teamLogo)}" alt="" width="26" height="26">` : ""}<span>${escape(teamName)}</span><span class="pr-team-year">${date.slice(0, 4)}</span></div>
        <h1>Head of Performance</h1></div>
      ${match && !ctx.isSample ? action(escape, "source", "schedule", `<span>Next match</span><strong>${escape(match.title || "Match")}</strong>
        <small>${dateLabel(match.date)}${match.time ? ` · ${escape(match.time)}` : ""}</small>`,
        ` class="pr-next-match" data-pr-date="${match.date}"`) : ""}
    </header>
    <div class="pr-toolbar">
      <nav class="pr-navigation" aria-label="Performance Room">
        <div>${renderNav(navigation.filter(([key]) => primaryViews.has(key)))}</div>
        <div class="pr-nav-analysis">${renderNav(navigation.filter(([key]) => !primaryViews.has(key)))}</div>
      </nav>
      <div class="pr-dates">
        ${action(escape, "week", "-1", "‹", ' aria-label="Previous week"')}
        <label class="pr-date-picker"><span class="pr-visually-hidden">Selected date</span><input type="date" data-pr-date-picker data-pr-focus="date-picker" value="${date}"></label>
        ${action(escape, "week", "1", "›", ' aria-label="Next week"')}
        ${action(escape, "today", "", "Today")}
      </div>
    </div>
    <section class="pr-content" aria-label="${heading}">
      <h2 class="pr-visually-hidden" tabindex="-1" data-pr-focus="detail-title">${heading}</h2>
      ${views[view]()}
    </section>
  </div>`;
}
