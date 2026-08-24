import { resolveGameplanPresentationLineup } from "../gameplan/gameplan-presentation-adapter.mjs";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getPlayerInitials(name = "") {
  return cleanText(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "-";
}

function getPlayerShortName(name = "", fallback = "") {
  const parts = cleanText(name).split(" ").filter(Boolean);
  return parts.at(-1) || cleanText(fallback) || "Position";
}

export function selectHomeUpcomingLineup({
  nextMatch = null,
  scheduleMatches = [],
  presentationState = {},
  players = [],
  dateLabel = "",
  relativeLabel = "",
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
  const selectedCount = lineup.startingPlayerIds.length;
  const matchTitle = cleanText(match?.title || match?.opponent || "Upcoming match");
  const matchMeta = [relativeLabel || dateLabel, cleanText(match?.time)].filter(Boolean).join(" · ");

  return {
    hasMatch: Boolean(match),
    matchId: cleanText(match?.id),
    dateValue: cleanText(match?.date),
    title: matchTitle,
    meta: matchMeta,
    formationLabel: lineup.formationLabel || "4-3-3",
    selectedCount,
    status: selectedCount === 11 ? "ready" : selectedCount ? "partial" : "missing",
    source: lineup.source || "Presentation",
    sourceDate: lineup.sourceDate || "",
    slots: lineup.slots.map((slot) => ({
      id: cleanText(slot.id),
      label: cleanText(slot.label),
      x: Math.max(9, Math.min(91, Number(slot.x) || 50)),
      y: Math.max(12, Math.min(84, Number(slot.y) || 50)),
      player: slot.player
        ? {
            id: cleanText(slot.player.id),
            name: cleanText(slot.player.name || "Player"),
            number: cleanText(slot.player.number),
          }
        : null,
    })),
  };
}

function renderLineupSlot(slot = {}, escapeHtml = String) {
  const player = slot.player || null;
  const marker = player?.number ? `#${player.number}` : player ? getPlayerInitials(player.name) : slot.label;
  const shortName = player ? getPlayerShortName(player.name, slot.label) : slot.label;
  const accessibleLabel = player ? `${player.name}, ${slot.label}` : `${slot.label}, not selected`;

  return `
    <span
      class="dashboard-lineup-slot${player ? " has-player" : ""}"
      style="--lineup-x:${slot.x}%;--lineup-y:${slot.y}%"
      aria-label="${escapeHtml(accessibleLabel)}"
    >
      <strong>${escapeHtml(marker)}</strong>
      ${player ? `<small>${escapeHtml(shortName)}</small>` : ""}
    </span>
  `;
}

export function renderHomeUpcomingLineupCard(context = {}, escapeHtml = String) {
  const lineup = context.upcomingLineup || selectHomeUpcomingLineup();
  const statusLabel = lineup.hasMatch ? `${lineup.selectedCount}/11` : "-";
  const stateLabel = lineup.status === "ready" ? "Ready" : lineup.status === "partial" ? "In progress" : "Not selected";
  const pitchLabel = lineup.hasMatch
    ? `${lineup.title}, ${lineup.formationLabel}, ${lineup.selectedCount} of 11 players selected`
    : "No upcoming match scheduled";

  return `
    <article class="dashboard-panel dashboard-upcoming-lineup-card" aria-label="Upcoming match starting eleven">
      <header class="dashboard-lineup-head">
        <div>
          <p class="dashboard-card-kicker">Next Match</p>
          <h2>Starting XI</h2>
        </div>
        <span class="dashboard-lineup-count is-${escapeHtml(lineup.status)}">${escapeHtml(statusLabel)}</span>
      </header>
      <div class="dashboard-lineup-match">
        <div>
          <strong>${escapeHtml(lineup.hasMatch ? lineup.title : "No upcoming match")}</strong>
          <span>${escapeHtml(lineup.hasMatch ? lineup.meta : "Schedule a match to prepare the lineup")}</span>
        </div>
        <span>${escapeHtml(lineup.formationLabel)}</span>
      </div>
      <div class="dashboard-lineup-pitch" role="img" aria-label="${escapeHtml(pitchLabel)}">
        <span class="dashboard-lineup-halfway" aria-hidden="true"></span>
        <span class="dashboard-lineup-circle" aria-hidden="true"></span>
        <span class="dashboard-lineup-box" aria-hidden="true"></span>
        ${lineup.slots.map((slot) => renderLineupSlot(slot, escapeHtml)).join("")}
      </div>
      <footer class="dashboard-lineup-footer">
        <span>${escapeHtml(lineup.hasMatch ? `${stateLabel} · ${lineup.source}` : "Schedule")}</span>
        <button type="button" class="secondary dashboard-link-button" data-open-workspace="${lineup.hasMatch ? "gameplan" : "schedule"}">
          ${lineup.hasMatch ? "Open gameplan" : "Open schedule"}
        </button>
      </footer>
    </article>
  `;
}
