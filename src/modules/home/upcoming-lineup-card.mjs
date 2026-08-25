import { resolveGameplanPresentationLineup } from "../gameplan/gameplan-presentation-adapter.mjs";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMeetingType(value = "") {
  return cleanText(value).toLowerCase() === "technical" ? "technical" : "team";
}

function getSelectionStatus(count = 0, expectedCount = 0, hasSelection = false) {
  if (!hasSelection) return "missing";
  if (expectedCount && count >= expectedCount) return "ready";
  return count ? "partial" : "empty";
}

function getSelectionRoute(lineup = {}, match = {}, target = "starting-xi") {
  const isMatchSquad = target === "match-squad";
  const ownDate = isMatchSquad ? lineup.matchSquadSourceDate : lineup.startingXiSourceDate;
  const pairedDate = isMatchSquad ? lineup.startingXiSourceDate : lineup.matchSquadSourceDate;
  const ownMeetingType = isMatchSquad
    ? lineup.matchSquadSourceMeetingType
    : lineup.startingXiSourceMeetingType;
  const pairedMeetingType = isMatchSquad
    ? lineup.startingXiSourceMeetingType
    : lineup.matchSquadSourceMeetingType;
  return {
    dateValue: cleanText(ownDate || pairedDate || match?.date),
    meetingType: normalizeMeetingType(ownMeetingType || pairedMeetingType || lineup.sourceMeetingType),
    target,
  };
}

export function selectHomeUpcomingLineup({
  nextMatch = null,
  scheduleMatches = [],
  presentationState = {},
  players = [],
  dateLabel = "",
  relativeLabel = "",
  history = [],
} = {}) {
  const match = nextMatch && typeof nextMatch === "object" ? nextMatch : null;
  const lineup = resolveGameplanPresentationLineup({
    presentationState,
    scheduleMatches,
    plan: match
      ? {
          matchEventId: cleanText(match.id),
          date: cleanText(match.date),
          lineup: {},
        }
      : { lineup: {} },
    players,
  });
  const startingXiCount = lineup.startingPlayerIds.length;
  const matchSquadCount = lineup.matchSquadPlayerIds.length;
  const matchTitle = cleanText(match?.title || match?.opponent || "Upcoming match");
  const matchMeta = [relativeLabel || dateLabel, cleanText(match?.time)].filter(Boolean).join(" · ");

  return {
    hasMatch: Boolean(match),
    matchId: cleanText(match?.id),
    dateValue: cleanText(match?.date),
    title: matchTitle,
    meta: matchMeta,
    formationLabel: lineup.formationLabel || "4-3-3",
    selectedCount: startingXiCount,
    startingXiCount,
    matchSquadCount,
    hasStartingXi: Boolean(lineup.hasStartingXi),
    hasMatchSquad: Boolean(lineup.hasMatchSquad),
    status: getSelectionStatus(startingXiCount, 11, Boolean(lineup.hasStartingXi)),
    startingXiStatus: getSelectionStatus(startingXiCount, 11, Boolean(lineup.hasStartingXi)),
    matchSquadStatus: getSelectionStatus(matchSquadCount, 0, Boolean(lineup.hasMatchSquad)),
    source: lineup.source || "Presentation",
    sourceDate: lineup.startingXiSourceDate || lineup.matchSquadSourceDate || lineup.sourceDate || "",
    sourceMeetingType: normalizeMeetingType(
      lineup.startingXiSourceMeetingType || lineup.matchSquadSourceMeetingType || lineup.sourceMeetingType
    ),
    routes: {
      matchSquad: getSelectionRoute(lineup, match, "match-squad"),
      startingXi: getSelectionRoute(lineup, match, "starting-xi"),
    },
    history: Array.isArray(history) ? history : [],
  };
}

function getMatchSquadLabel(lineup = {}) {
  if (!lineup.hasMatchSquad) return "Select squad";
  return lineup.matchSquadCount === 1 ? "1 selected" : `${lineup.matchSquadCount} selected`;
}

function getStartingXiLabel(lineup = {}) {
  return lineup.hasStartingXi ? `${lineup.startingXiCount}/11` : "Select lineup";
}

function renderSelectionButton({
  label = "",
  detail = "",
  statusLabel = "",
  status = "missing",
  route = {},
  createIfMissing = false,
  escapeHtml = String,
} = {}) {
  return `
    <button
      type="button"
      class="dashboard-match-selection-row is-${escapeHtml(status)}"
      data-dashboard-open-match-selection
      data-match-selection-date="${escapeHtml(route.dateValue || "")}"
      data-match-selection-meeting-type="${escapeHtml(route.meetingType || "team")}"
      data-match-selection-target="${escapeHtml(route.target || "")}"
      data-match-selection-create="${createIfMissing ? "true" : "false"}"
    >
      <span class="dashboard-match-selection-copy">
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail)}</small>
      </span>
      <span class="dashboard-match-selection-state">${escapeHtml(statusLabel)}</span>
      <span class="dashboard-match-selection-chevron" aria-hidden="true">&#8250;</span>
    </button>
  `;
}

function renderHistoryItem(item = {}, escapeHtml = String) {
  const actions = [];
  if (item.hasMatchSquad) {
    actions.push(
      renderSelectionButton({
        label: "Match squad",
        detail: item.matchSquadCount === 1 ? "1 player" : `${item.matchSquadCount} players`,
        statusLabel: "Open",
        status: item.matchSquadStatus,
        route: item.routes?.matchSquad,
        escapeHtml,
      })
    );
  }
  if (item.hasStartingXi) {
    actions.push(
      renderSelectionButton({
        label: "Starting XI",
        detail: item.formationLabel || "Lineup",
        statusLabel: `${item.startingXiCount}/11`,
        status: item.startingXiStatus,
        route: item.routes?.startingXi,
        escapeHtml,
      })
    );
  }
  return `
    <section class="dashboard-match-history-item" aria-label="${escapeHtml(item.title || "Previous match")}">
      <header>
        <strong>${escapeHtml(item.title || "Previous match")}</strong>
        <span>${escapeHtml(item.meta || item.dateLabel || "")}</span>
      </header>
      <div>${actions.join("")}</div>
    </section>
  `;
}

function renderHistoryMenu(history = [], escapeHtml = String) {
  return `
    <details class="dashboard-match-history">
      <summary>
        <span>Previous matches</span>
        <small>${history.length ? history.length : "None saved"}</small>
        <span aria-hidden="true">&#8250;</span>
      </summary>
      <div class="dashboard-match-history-menu">
        ${history.length
          ? history.map((item) => renderHistoryItem(item, escapeHtml)).join("")
          : '<p role="note">Saved squads and lineups will appear here after matchday.</p>'}
      </div>
    </details>
  `;
}

export function renderHomeUpcomingLineupCard(context = {}, escapeHtml = String) {
  const lineup = context.upcomingLineup || selectHomeUpcomingLineup();
  const history = Array.isArray(lineup.history) ? lineup.history : [];

  return `
    <article class="dashboard-panel dashboard-upcoming-lineup-card" aria-label="Upcoming match selection">
      <header class="dashboard-match-gateway-head">
        <div>
          <p class="dashboard-card-kicker">Next Match</p>
          <h2>Team Selection</h2>
        </div>
        ${lineup.hasMatch ? `<span>${escapeHtml(lineup.meta || lineup.dateValue)}</span>` : ""}
      </header>
      ${lineup.hasMatch
        ? `
          <div class="dashboard-match-gateway-summary">
            <strong>${escapeHtml(lineup.title)}</strong>
            <span>Prepare the squad and starting lineup in Presentation Mode.</span>
          </div>
          <nav class="dashboard-match-selection-actions" aria-label="${escapeHtml(`${lineup.title} team selection`)}">
            ${renderSelectionButton({
              label: "Match squad",
              detail: "Select the players available for matchday",
              statusLabel: getMatchSquadLabel(lineup),
              status: lineup.matchSquadStatus,
              route: lineup.routes?.matchSquad,
              createIfMissing: true,
              escapeHtml,
            })}
            ${renderSelectionButton({
              label: "Starting XI",
              detail: lineup.hasStartingXi ? lineup.formationLabel : "Choose the starting formation and players",
              statusLabel: getStartingXiLabel(lineup),
              status: lineup.startingXiStatus,
              route: lineup.routes?.startingXi,
              createIfMissing: true,
              escapeHtml,
            })}
          </nav>
        `
        : `
          <div class="dashboard-match-gateway-empty">
            <strong>No upcoming match</strong>
            <span>Add the next fixture in Schedule to prepare its squad and Starting XI.</span>
            <button type="button" class="secondary dashboard-link-button" data-open-workspace="schedule">Open schedule</button>
          </div>
        `}
      <footer class="dashboard-match-gateway-footer">
        ${renderHistoryMenu(history, escapeHtml)}
      </footer>
    </article>
  `;
}
