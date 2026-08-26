import { renderClipLibrary } from "./ClipLibrary.js";
import { renderPresentationModule } from "./PresentationModule.js";
import { escapeHtml } from "./renderHelpers.js";

const analysisRoomTabs = Object.freeze([
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "fs-player", label: "FS Player", icon: "play" },
  { id: "team-performance", label: "Team Performance", icon: "numbers", disabled: true },
  { id: "presentation", label: "Presentation", icon: "presentation" },
  { id: "match-report", label: "Clip Library", icon: "report" },
]);

const TEAM_PERFORMANCE_DASHBOARD_URL = "https://ncskunk-harris.github.io/Team_Match_Performance_Dashboard/";

const analysisRoomTabIcons = Object.freeze({
  overview: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="7" height="6" rx="1.5"></rect>
      <rect x="13" y="5" width="7" height="6" rx="1.5"></rect>
      <rect x="4" y="13" width="7" height="6" rx="1.5"></rect>
      <rect x="13" y="13" width="7" height="6" rx="1.5"></rect>
    </svg>
  `,
  play: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8"></circle>
      <path d="m10 8.5 6 3.5-6 3.5Z"></path>
    </svg>
  `,
  report: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4h7l3 3v13H7z"></path>
      <path d="M14 4v4h4"></path>
      <path d="M9.5 12h5"></path>
      <path d="M9.5 15.5h4"></path>
    </svg>
  `,
  numbers: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 19V9"></path>
      <path d="M12 19V5"></path>
      <path d="M19 19v-7"></path>
      <path d="M4 19h16"></path>
    </svg>
  `,
  presentation: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="6" width="14" height="12" rx="2"></rect>
      <path d="M8.5 10h7"></path>
      <path d="M8.5 14h4.5"></path>
    </svg>
  `,
});

function renderAnalysisRoomTabIcon(icon) {
  return analysisRoomTabIcons[icon] || analysisRoomTabIcons.overview;
}

function renderAnalysisRoomTabs(activeId = "fs-player") {
  return `
    <nav class="analysis-room-tabs" aria-label="Analysis Room sections">
      ${analysisRoomTabs.filter((tab) => tab.disabled !== true).map((tab) => {
        const active = tab.id === activeId;
        return `
          <button
            type="button"
            class="analysis-room-tab${active ? " is-active" : ""}"
            ${active ? `aria-current="page"` : ""}
            data-video-analysis-room-tab="${escapeHtml(tab.id)}"
          >
            ${renderAnalysisRoomTabIcon(tab.icon)}
            <span>${escapeHtml(tab.label)}</span>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function teamNameForContext(context = {}) {
  return String(
    context.teamName
      || context.team?.name
      || context.currentUser?.teamName
      || context.currentUser?.team
      || "Team",
  ).trim() || "Team";
}

function teamInitials(team = {}, teamName = "Team") {
  const shortName = String(team.shortName || team.short_name || "").trim();
  if (shortName && shortName.length <= 4) return shortName.toUpperCase();
  return String(teamName || "Team")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "TM";
}

function renderTeamMark(context = {}) {
  const team = context.team || {};
  const teamName = teamNameForContext(context);
  const logoUrl = String(
    context.teamLogoUrl
      || team.logoUrl
      || team.logo_url
      || team.logo
      || team.badgeUrl
      || team.crestUrl
      || "",
  ).trim();
  return `
    <span class="analysis-room-team-mark${logoUrl ? " has-logo" : " is-empty"}" aria-label="${escapeHtml(`${teamName} logo`)}">
      ${logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(`${teamName} logo`)}" />`
        : `<strong>${escapeHtml(teamInitials(team, teamName))}</strong>`}
    </span>
  `;
}

export function renderAnalysisRoomHeader(context = {}, activeTabId = "fs-player") {
  const teamName = teamNameForContext(context);
  return `
    <header class="analysis-room-header">
      <div class="analysis-room-team-head">
        ${renderTeamMark(context)}
        <div class="analysis-room-team-copy">
          <p class="analysis-room-kicker">Analysis Room</p>
          <h2>${escapeHtml(teamName)}</h2>
        </div>
      </div>
      ${renderAnalysisRoomTabs(activeTabId)}
    </header>
  `;
}

export function activeAnalysisRoomTab(state = {}) {
  if (state.view === "library") return "overview";
  if (state.activeAnalysisRoomTab === "presentation") return "presentation";
  if (state.activeAnalysisRoomTab === "match-report") return "match-report";
  return "fs-player";
}

export function renderPresentationWorkspace(state = {}) {
  return `<section class="video-analysis-presentation-workspace">${renderPresentationModule(state)}</section>`;
}

export function renderClipLibraryWorkspace(state = {}) {
  return `<section class="video-analysis-clip-library-workspace">${renderClipLibrary(state)}</section>`;
}

export function renderTeamPerformanceWorkspace() {
  return `
    <section class="analysis-room-team-performance-workspace" aria-label="Team Performance">
      <iframe
        class="analysis-room-team-performance-frame"
        title="Team Performance"
        src="${escapeHtml(TEAM_PERFORMANCE_DASHBOARD_URL)}"
        sandbox="allow-scripts allow-modals allow-same-origin"
        referrerpolicy="no-referrer"
        loading="lazy"
      ></iframe>
    </section>
  `;
}
