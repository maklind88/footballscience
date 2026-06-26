import {
  getMedicalRtpLibrarySearchText,
  medicalRtpLibraryFilterOptions,
  medicalRtpLibraryProfiles as defaultMedicalRtpLibraryProfiles,
} from "./medical-rtp-library-data.mjs";
import { createMedicalRtpProgramRenderer } from "./medical-rtp-program-renderer.mjs";

const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalOperationsRenderer({
  escapeHtml = defaultEscapeHtml,
  formatMedicalDateLabel,
  getMedicalCoachHandoverItems,
  getMedicalDailyStats,
  getMedicalHistoryDateFilter = () => "all",
  getMedicalHistoryEvents,
  getMedicalHistoryPlayerFilter = () => "all",
  getMedicalHistorySearchQuery = () => "",
  getMedicalRtpLibraryProfiles = () => defaultMedicalRtpLibraryProfiles,
  getMedicalRtpPhaseOption,
  medicalClearanceRoles = [],
  medicalLoadGateOptions = [],
  getMedicalPlayerRtpCoachStatus = () => null,
  renderMedicalCoachHandoverPanel,
  renderMedicalDailyHuddle,
  getSelectedMedicalPlayer = () => null,
} = {}) {
  const renderOpsStat = (label, value, meta = "", tone = "") => `
<article class="medical-ops-stat${tone ? ` medical-ops-stat-${escapeHtml(tone)}` : ""}">
<span>${escapeHtml(label)}</span>
<strong>${escapeHtml(value)}</strong>
${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
</article>
`;

  const renderSignalDrivers = (signal, limit = 3) => {
    const drivers = signal.drivers.slice(0, limit);
    if (!drivers.length) {
      return `<span class="medical-ops-chip medical-ops-chip-clear">Clear</span>`;
    }
    return drivers
      .map((driver) => `<span class="medical-ops-chip medical-ops-chip-${driver.severity >= 3 ? "high" : driver.severity === 2 ? "medium" : "low"}">${escapeHtml(driver.label)}</span>`)
      .join("");
  };

  const renderTabs = (activeTab, tabOptions = [], extraClass = "") => {
    const className = ["medical-ops-tabs", extraClass].filter(Boolean).join(" ");
    return `
<nav class="${escapeHtml(className)}" aria-label="Medical operations tabs">
${tabOptions
  .map(
    (tab) => `
<button
type="button"
class="${activeTab === tab.key ? "is-active" : ""}"
data-medical-ops-tab="${escapeHtml(tab.key)}"
aria-pressed="${activeTab === tab.key ? "true" : "false"}"
>${escapeHtml(tab.label)}</button>
`
  )
  .join("")}
</nav>
`;
  };

  const renderTopMenu = (activeTab, tabOptions = []) => `
<section class="medical-ops-top-menu" data-medical-ops-top-menu aria-label="Medical operations menu">
${renderTabs(activeTab, tabOptions, "medical-ops-tabs-top")}
</section>
`;

  const rtpProgramRenderer = createMedicalRtpProgramRenderer({
    escapeHtml,
    getMedicalRtpPhaseOption,
    medicalClearanceRoles,
    medicalLoadGateOptions,
  });

  const normalizeRtpCaseText = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();

  const planHasRtpStarter = (plan = {}) =>
    Boolean(
      plan.rtpLibraryProfileId ||
        plan.rtpLibraryProfileName ||
        (Array.isArray(plan.rtpProgramGateCriteria) && plan.rtpProgramGateCriteria.length) ||
        (Array.isArray(plan.rtpProgramNextSteps) && plan.rtpProgramNextSteps.length)
    );

  const getProfileMatchText = (profile = {}) =>
    [
      profile.id,
      profile.name,
      profile.system,
      profile.bodyArea,
      ...(profile.symptoms || []),
      ...(profile.riskTags || []),
      ...(profile.movementPlanes || []),
    ]
      .map(normalizeRtpCaseText)
      .join(" ");

  const getPlanMatchTerms = (plan = {}) =>
    [plan.injuryType, plan.bodyArea, plan.phase, plan.comment, plan.coachNote]
      .map(normalizeRtpCaseText)
      .filter(Boolean);

  const getProfileScoreForPlan = (profile, plan) => {
    const terms = getPlanMatchTerms(plan);
    const text = getProfileMatchText(profile);
    return terms.reduce((score, term) => {
      if (!term) return score;
      if (normalizeRtpCaseText(profile.name) === term) return score + 8;
      if (normalizeRtpCaseText(profile.bodyArea) === term) return score + 4;
      return text.includes(term) || term.includes(normalizeRtpCaseText(profile.bodyArea)) ? score + 2 : score;
    }, 0);
  };

  const getSuggestedProfilesForPlan = (plan = {}) =>
    [...getMedicalRtpLibraryProfiles()].sort((first, second) => {
      const scoreDiff = getProfileScoreForPlan(second, plan) - getProfileScoreForPlan(first, plan);
      return scoreDiff || String(first.name || "").localeCompare(String(second.name || ""));
    });

  const renderCaseRtpStarterLinker = (summary) => {
    const profiles = getMedicalRtpLibraryProfiles();
    const casesNeedingStarter = summary.activeCases.filter(({ plan }) => !planHasRtpStarter(plan));
    if (!profiles.length || !casesNeedingStarter.length) {
      return "";
    }
    return `
<section class="medical-rtp-case-linker" aria-label="Apply RTP Library starters to active cases">
<header>
<div>
<span>RTP starter needed</span>
<strong>${casesNeedingStarter.length}/${summary.activeCases.length} active case${summary.activeCases.length === 1 ? "" : "s"} need a structured starter</strong>
<small>Choose a Library profile, fill the existing Medical Plan draft, review, then save. Nothing is auto-saved.</small>
</div>
<b>Medical review required</b>
</header>
<div class="medical-rtp-case-linker-grid">
${casesNeedingStarter
  .map(({ player, plan, severity, review }) => {
    const suggestedProfiles = getSuggestedProfilesForPlan(plan);
    const topProfile = suggestedProfiles[0] || profiles[0];
    return `
<article class="medical-rtp-case-linker-card medical-ops-tone-${escapeHtml(severity.tone)}">
<div>
<strong>${escapeHtml(player.name)}</strong>
<small>${escapeHtml([player.position || "Position", plan.injuryType, plan.bodyArea].filter(Boolean).join(" / "))}</small>
</div>
<span>
<strong>${escapeHtml(review.label)}</strong>
<small>${topProfile ? `Suggested: ${escapeHtml(topProfile.name)}` : "Select RTP profile"}</small>
</span>
<form data-medical-rtp-case-linker-form data-medical-plan-id="${escapeHtml(plan.id)}">
<label>
<span>RTP Library profile</span>
<select data-medical-rtp-case-profile aria-label="RTP Library profile for ${escapeHtml(player.name)}">
${suggestedProfiles
  .map((profileItem, index) => `<option value="${escapeHtml(profileItem.id)}">${index === 0 ? "Suggested: " : ""}${escapeHtml(profileItem.name)}</option>`)
  .join("")}
</select>
</label>
<button type="submit">Apply to this case</button>
</form>
</article>
`;
  })
  .join("")}
</div>
</section>
`;
  };

  const renderPlayerAvailability = (summary) => {
    const players = summary.signals;
    return `
<article class="medical-ops-card medical-ops-player-availability-card">
<div class="medical-command-head">
<span>Player Availability</span>
<strong>${players.length}</strong>
</div>
<div class="medical-ops-player-table">
<div class="medical-ops-player-table-head" aria-hidden="true">
<span>Player</span>
<span>Status</span>
<span>7 days</span>
</div>
<div class="medical-ops-player-table-body">
${
  players.length
    ? players
        .map((signal) => {
          const participationLabel = signal.record ? `${signal.record.participation}%` : "Not set";
          const trailingLabel = signal.trailing.average === null ? "-" : `${signal.trailing.average}%`;
          const trailingMeta = signal.trailing.records.length ? `${signal.trailing.records.length}/7 logged` : "No trend";
          return `
<button type="button" data-medical-select-player="${escapeHtml(signal.player.id)}" class="medical-ops-player-row medical-ops-tone-${escapeHtml(signal.tone)}">
<span>
<strong>${escapeHtml(signal.player.name)}</strong>
<small>${escapeHtml(signal.player.position || "Position")}</small>
</span>
<span>
<strong>${escapeHtml(signal.status.label)}</strong>
<small>${escapeHtml(participationLabel)}</small>
</span>
<span>
<strong>${escapeHtml(trailingLabel)}</strong>
<small>${escapeHtml(trailingMeta)}</small>
</span>
</button>
`;
        })
        .join("")
    : `<div class="medical-empty-inline">No players available in the medical roster.</div>`
}
</div>
</div>
</article>
`;
  };

  const renderOverview = (summary, selectedDate) => {
    const actionSignals = summary.actionSignals.slice(0, 5);
    const briefing = summary.actionRequired
      ? `${summary.actionRequired} player${summary.actionRequired === 1 ? "" : "s"} need medical action before the next football decision.`
      : summary.activeCases.length
        ? `${summary.activeCases.length} active case${summary.activeCases.length === 1 ? "" : "s"} under control.`
        : "No active medical blockers for the selected date.";
    return `
<div class="medical-ops-overview">
<article class="medical-ops-brief">
<span>Medical Briefing</span>
<strong>${escapeHtml(briefing)}</strong>
<small>${escapeHtml(formatMedicalDateLabel(selectedDate, "long"))}</small>
</article>
<div class="medical-ops-stats">
${renderOpsStat("Action required", String(summary.actionRequired), "review / clearance / mismatch", summary.actionRequired ? "high" : "clear")}
${renderOpsStat("Active cases", String(summary.activeCases.length), "current plans", summary.activeCases.length ? "medium" : "clear")}
${renderOpsStat("Clearance blockers", String(summary.clearanceBlockers.length), "sign-off / gates", summary.clearanceBlockers.length ? "high" : "clear")}
${renderOpsStat("Actual missing", String(summary.actualMissing), "today's participation", summary.actualMissing ? "low" : "clear")}
${renderOpsStat("GPS / match load", "Pending", "Performance Room bridge", "neutral")}
</div>
<article class="medical-ops-card">
<div class="medical-command-head">
<span>Action Required</span>
<strong>${summary.actionRequired}</strong>
</div>
<div class="medical-ops-signal-list">
${actionSignals.length
  ? actionSignals
      .map(
        (signal) => `
<button type="button" data-medical-select-player="${escapeHtml(signal.player.id)}" class="medical-ops-signal-row medical-ops-tone-${escapeHtml(signal.actionTone)}">
<span>${escapeHtml(signal.player.name)}</span>
<strong>${escapeHtml(signal.actionLabel)}</strong>
<small>${escapeHtml(signal.primaryActionDriver)}</small>
</button>
`
      )
      .join("")
  : `<div class="medical-empty-inline">No medical actions required for the selected date.</div>`}
</div>
</article>
${renderMedicalDailyHuddle()}
${renderMedicalCoachHandoverPanel()}
${renderPlayerAvailability(summary)}
<article class="medical-ops-card">
<div class="medical-command-head">
<span>Active Case Board</span>
<strong>${summary.activeCases.length}</strong>
</div>
<div class="medical-ops-case-list">
${summary.activeCases.length
  ? summary.activeCases
      .slice(0, 6)
      .map(
        ({ player, plan, severity, daysRemaining, review, clearance }) => `
<button type="button" data-medical-edit-injury-plan="${escapeHtml(plan.id)}" class="medical-ops-case-row medical-ops-tone-${escapeHtml(severity.tone)}" aria-label="Edit ${escapeHtml(player.name)} medical plan">
<span class="medical-case-player">
<strong>${escapeHtml(player.name)}</strong>
<small>${escapeHtml(player.position || "Position")} / ${escapeHtml(severity.label)}</small>
</span>
<span class="medical-case-plan">
<strong>${escapeHtml(plan.injuryType)}</strong>
<small>${escapeHtml([plan.bodyArea, getMedicalRtpPhaseOption(plan.rtpPhase).label].filter(Boolean).join(" / "))}</small>
</span>
<span class="medical-case-metric">
<strong>${plan.participation}%</strong>
<small>recommended</small>
</span>
<span class="medical-case-metric">
<strong>${daysRemaining}</strong>
<small>days left</small>
</span>
<span class="medical-case-footer">
<small>${escapeHtml(review.label)}</small>
<small>${clearance.signOffCount}/${medicalClearanceRoles.length} sign-off / ${clearance.gatePassCount}/${medicalLoadGateOptions.length} gates</small>
<b>Edit plan</b>
</span>
</button>
`
      )
      .join("")
  : `<div class="medical-empty-inline">No active clinical cases today.</div>`}
</div>
</article>
</div>
`;
  };

  const renderSignals = (summary) => `
<div class="medical-ops-table medical-ops-signals-table">
<div class="medical-ops-table-head" aria-hidden="true">
<span>Player</span>
<span>Availability</span>
<span>Case / RTP</span>
<span>Signals</span>
<span>Action</span>
</div>
${summary.signals
  .map((signal) => {
    const planLabel = signal.activePlan
      ? `${signal.activePlan.injuryType} / ${getMedicalRtpPhaseOption(signal.activePlan.rtpPhase).label}`
      : "No active case";
    return `
<button type="button" data-medical-select-player="${escapeHtml(signal.player.id)}" class="medical-ops-table-row medical-ops-tone-${escapeHtml(signal.tone)}">
<span>${escapeHtml(signal.player.name)}<small>${escapeHtml(signal.player.position || "Position")}</small></span>
<strong>${signal.record ? `${signal.record.participation}%` : "Not set"}<small>${escapeHtml(signal.status.label)}</small></strong>
<span>${escapeHtml(planLabel)}<small>${signal.trailing.average === null ? "No 7-day trend" : `${signal.trailing.average}% trailing average`}</small></span>
<span class="medical-ops-driver-cell">${renderSignalDrivers(signal, 4)}</span>
<strong>${escapeHtml(signal.actionSeverity ? signal.actionLabel : signal.label)}<small>${escapeHtml(signal.actionSeverity ? signal.primaryActionDriver : "No action")}</small></strong>
</button>
`;
  })
  .join("")}
</div>
`;

  const renderCases = (summary) => `
<div class="medical-rtp-case-layout">
${rtpProgramRenderer.renderRtpCaseProgramCards(summary)}
${renderCaseRtpStarterLinker(summary)}
<div class="medical-ops-table medical-ops-cases-table">
<div class="medical-ops-table-head" aria-hidden="true">
<span>Player</span>
<span>Case</span>
<span>Window</span>
<span>RTP / Recommendation</span>
<span>Clearance</span>
</div>
${summary.activeCases.length
  ? summary.activeCases
      .map(
        ({ player, plan, severity, daysRemaining, elapsedDays, review, clearance }) => `
<button type="button" data-medical-select-player="${escapeHtml(player.id)}" class="medical-ops-table-row medical-ops-tone-${escapeHtml(severity.tone)}">
<span>${escapeHtml(player.name)}<small>${escapeHtml(player.position || "Position")}</small></span>
<strong>${escapeHtml(plan.injuryType)}<small>${escapeHtml([plan.bodyArea, severity.label].filter(Boolean).join(" / "))}</small></strong>
<span>${escapeHtml(formatMedicalDateLabel(plan.startDate))} - ${escapeHtml(formatMedicalDateLabel(plan.endDate))}<small>${elapsedDays} done / ${daysRemaining} left</small></span>
<strong>${escapeHtml(getMedicalRtpPhaseOption(plan.rtpPhase).label)}<small>${plan.participation}% recommended</small></strong>
<span>${clearance.signOffCount}/${medicalClearanceRoles.length} sign-off<small>${clearance.gatePassCount}/${medicalLoadGateOptions.length} gates / ${escapeHtml(review.label)}</small></span>
</button>
`
      )
      .join("")
  : `<div class="medical-empty-inline">No active clinical cases today.</div>`}
</div>
</div>
`;

  const renderRtpLibrary = () => {
    const selectedPlayer = getSelectedMedicalPlayer();
    const profiles = getMedicalRtpLibraryProfiles();
    const renderSelect = (label, key, options = []) => `
<label>
<span>${escapeHtml(label)}</span>
<select data-medical-rtp-library-filter="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">
<option value="all">All</option>
${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
</select>
</label>
`;
    const renderTags = (items = [], limit = 4) =>
      items
        .slice(0, limit)
        .map((item) => `<span class="medical-ops-chip medical-ops-chip-low">${escapeHtml(item)}</span>`)
        .join("");
    const renderList = (title, items = []) => `
<section>
<h4>${escapeHtml(title)}</h4>
<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
</section>
`;
    const renderProfileBody = (profileItem) => `
<div class="medical-rtp-profile-body">
<section class="medical-rtp-profile-summary">
<div>
<h3>Quick Summary</h3>
<p>${escapeHtml(profileItem.summary)}</p>
</div>
<div>
<h3>Medical-safe Evidence</h3>
<p><strong>Evidence:</strong> ${escapeHtml(profileItem.evidence)}</p>
<p><strong>Experience/consensus:</strong> ${escapeHtml(profileItem.experience)}</p>
</div>
</section>
<div class="medical-rtp-profile-tags">
${renderTags(profileItem.riskTags, 5)}
</div>
<div class="medical-rtp-profile-sections">
${renderList("Red flags", profileItem.redFlags)}
${renderList("Progression criteria", profileItem.criteria)}
${renderList("Return-to-training checklist", profileItem.trainingChecklist)}
${renderList("Return-to-match checklist", profileItem.matchChecklist)}
${renderList("Common mistakes / risks", profileItem.mistakes)}
</div>
<div class="medical-rtp-profile-actions">
<button
type="button"
data-medical-apply-rtp-starter
data-medical-rtp-profile-id="${escapeHtml(profileItem.id)}"
data-medical-player-id="${escapeHtml(selectedPlayer?.id || "")}"
${selectedPlayer ? "" : "disabled"}
>Apply as medical starter${selectedPlayer ? ` for ${escapeHtml(selectedPlayer.name)}` : ""}</button>
<small>This fills the Medical Plan draft only. Medical still owns the final player-specific program.</small>
</div>
</div>
`;
    const renderProfileModal = (profileItem) => {
      const safeProfileId = escapeHtml(profileItem.id);
      return `
<div class="medical-rtp-profile-modal" data-medical-rtp-profile-modal="${safeProfileId}" hidden aria-hidden="true">
<button type="button" class="medical-rtp-profile-modal-backdrop" data-medical-close-rtp-profile aria-label="Close RTP profile"></button>
<section
id="medical-rtp-profile-dialog-${safeProfileId}"
class="medical-rtp-profile-dialog"
role="dialog"
aria-modal="true"
aria-labelledby="medical-rtp-profile-title-${safeProfileId}"
tabindex="-1"
>
<header>
<div>
<span>RTP profile</span>
<h3 id="medical-rtp-profile-title-${safeProfileId}">${escapeHtml(profileItem.name)}</h3>
<small>${escapeHtml(profileItem.system)} / ${escapeHtml(profileItem.bodyArea)} / ${escapeHtml(profileItem.evidenceLevel)}</small>
</div>
<button type="button" class="medical-rtp-profile-modal-close" data-medical-close-rtp-profile aria-label="Close ${escapeHtml(profileItem.name)} profile">Close</button>
</header>
<div class="medical-rtp-profile-dialog-body">
${renderProfileBody(profileItem)}
</div>
</section>
</div>
`;
    };
    return `
<div class="medical-rtp-library" data-medical-rtp-library>
<form class="medical-rtp-library-controls" data-medical-rtp-library-controls>
<label class="medical-rtp-library-search">
<span>Full text search</span>
<input type="search" data-medical-rtp-library-search placeholder="Search injury, system, body area, symptom, position or risk" />
</label>
${renderSelect("Movement plane", "movement", medicalRtpLibraryFilterOptions.movementPlanes)}
${renderSelect("Position", "position", medicalRtpLibraryFilterOptions.positions)}
${renderSelect("Season", "season", medicalRtpLibraryFilterOptions.seasons)}
${renderSelect("Sex", "sex", medicalRtpLibraryFilterOptions.sex)}
${renderSelect("Level", "level", medicalRtpLibraryFilterOptions.level)}
</form>
<div class="medical-rtp-library-meta">
<span><strong data-medical-rtp-library-count>${profiles.length}</strong> visible</span>
<span>Evidence and expert consensus are separated in every profile.</span>
</div>
<div class="medical-rtp-profile-grid">
${profiles
  .map((profileItem) => {
    const searchText = getMedicalRtpLibrarySearchText(profileItem);
    return `
<article
class="medical-rtp-profile-card"
data-medical-rtp-profile
data-search="${escapeHtml(searchText)}"
data-movement="${escapeHtml(profileItem.movementPlanes.join(" "))}"
data-position="${escapeHtml(profileItem.positions.join(" "))}"
data-season="${escapeHtml(profileItem.season.join(" "))}"
data-sex="${escapeHtml(profileItem.sex.join(" "))}"
data-level="${escapeHtml(profileItem.level.join(" "))}"
>
<button
type="button"
class="medical-rtp-profile-trigger"
data-medical-open-rtp-profile="${escapeHtml(profileItem.id)}"
aria-haspopup="dialog"
aria-controls="medical-rtp-profile-dialog-${escapeHtml(profileItem.id)}"
>
<span>
<strong>${escapeHtml(profileItem.name)}</strong>
<small>${escapeHtml(profileItem.system)} / ${escapeHtml(profileItem.bodyArea)} / ${escapeHtml(profileItem.evidenceLevel)}</small>
</span>
<b>Open profile</b>
</button>
</article>
`;
  })
  .join("")}
</div>
${profiles.map(renderProfileModal).join("")}
<div class="medical-empty-inline medical-rtp-library-empty" data-medical-rtp-library-empty hidden>No RTP profiles match the current search and filters.</div>
</div>
`;
  };

  const normalizeHistoryFilterText = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();

  const getHistoryDateOptions = (events) =>
    Array.from(new Set(events.map((event) => event.date).filter(Boolean))).sort((first, second) => second.localeCompare(first));

  const getHistoryPlayerOptions = (events) =>
    Array.from(
      events
        .filter((event) => event.player?.id)
        .reduce((players, event) => players.set(event.player.id, event.player), new Map())
        .values()
    ).sort((first, second) => String(first.name || "").localeCompare(String(second.name || "")));

  const eventMatchesHistorySearch = (event, query) => {
    if (!query) return true;
    const haystack = [
      event.date,
      formatMedicalDateLabel(event.date),
      event.player?.name,
      event.player?.position,
      event.type,
      event.title,
      event.detail,
      event.coachShared ? "approved coach-safe" : "private medical only",
    ]
      .map(normalizeHistoryFilterText)
      .join(" ");
    return haystack.includes(query);
  };

  const renderHistoryFilters = ({ dateOptions, playerOptions, selectedDate, selectedPlayerId, searchQuery, visibleCount, totalCount }) => `
<form class="medical-ops-history-controls" id="medicalHistoryFilterForm" data-medical-history-filter-form aria-label="Filter medical history">
<label class="medical-ops-history-search">
<span>Search</span>
<input type="search" name="historySearch" value="${escapeHtml(searchQuery)}" placeholder="Search restricted history" data-medical-history-search>
</label>
<button type="submit" class="medical-ops-history-search-button">Search</button>
<label>
<span>Date</span>
<select name="historyDate" data-medical-history-date-filter>
<option value="all"${selectedDate === "all" ? " selected" : ""}>All dates</option>
${dateOptions.map((date) => `<option value="${escapeHtml(date)}"${date === selectedDate ? " selected" : ""}>${escapeHtml(formatMedicalDateLabel(date))}</option>`).join("")}
</select>
</label>
<label>
<span>Player</span>
<select name="historyPlayer" data-medical-history-player-filter>
<option value="all"${selectedPlayerId === "all" ? " selected" : ""}>All players</option>
${playerOptions.map((player) => `<option value="${escapeHtml(player.id)}"${player.id === selectedPlayerId ? " selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
</select>
</label>
<small>${visibleCount}/${totalCount} restricted items</small>
</form>
`;

  const renderHistory = () => {
    const allEvents = getMedicalHistoryEvents(300);
    const dateOptions = getHistoryDateOptions(allEvents);
    const playerOptions = getHistoryPlayerOptions(allEvents);
    const selectedDateCandidate = String(getMedicalHistoryDateFilter() || "all");
    const selectedPlayerCandidate = String(getMedicalHistoryPlayerFilter() || "all");
    const selectedDate = selectedDateCandidate === "all" || dateOptions.includes(selectedDateCandidate) ? selectedDateCandidate : "all";
    const selectedPlayerId =
      selectedPlayerCandidate === "all" || playerOptions.some((player) => player.id === selectedPlayerCandidate) ? selectedPlayerCandidate : "all";
    const searchQuery = String(getMedicalHistorySearchQuery() || "");
    const normalizedQuery = normalizeHistoryFilterText(searchQuery);
    const filteredEvents = allEvents
      .filter((event) => selectedDate === "all" || event.date === selectedDate)
      .filter((event) => selectedPlayerId === "all" || event.player?.id === selectedPlayerId)
      .filter((event) => eventMatchesHistorySearch(event, normalizedQuery));
    const events = filteredEvents.slice(0, 40);
    return `
${renderHistoryFilters({
  dateOptions,
  playerOptions,
  selectedDate,
  selectedPlayerId,
  searchQuery,
  visibleCount: filteredEvents.length,
  totalCount: allEvents.length,
})}
<div class="medical-ops-table medical-ops-history-table">
<div class="medical-ops-table-head" aria-hidden="true">
<span>Date</span>
<span>Player</span>
<span>Type</span>
<span>Detail</span>
<span>Share</span>
</div>
${events.length
  ? events
      .map(
        (event) => `
<button type="button" data-medical-select-player="${escapeHtml(event.player.id)}" class="medical-ops-table-row">
<span>${escapeHtml(formatMedicalDateLabel(event.date))}</span>
<strong>${escapeHtml(event.player.name)}<small>${escapeHtml(event.player.position || "Position")}</small></strong>
<span>${escapeHtml(event.type)}</span>
<span>${escapeHtml(event.title)}<small>${escapeHtml(event.detail)}</small></span>
<strong>${event.coachShared ? "Approved" : "Private"}<small>${event.coachShared ? "coach-safe" : "medical only"}</small></strong>
</button>
`
      )
      .join("")
  : `<div class="medical-empty-inline">${allEvents.length ? "No restricted history matches the current filters." : "No restricted medical history yet."}</div>`}
</div>
`;
  };

  const renderSeason = (summary) => {
    const season = summary.season;
    return `
<div class="medical-ops-season">
<div class="medical-ops-stats">
${renderOpsStat("Season cases", String(season.plans.length), "medical plans", season.plans.length ? "medium" : "clear")}
${renderOpsStat("Active now", String(season.activeCount), "current cases", season.activeCount ? "medium" : "clear")}
${renderOpsStat("Returned", String(season.returnedCount), "closed windows", "clear")}
${renderOpsStat("Managed days", String(season.managedDays), `${season.unavailableDays} unavailable`, season.managedDays ? "low" : "clear")}
</div>
<article class="medical-ops-card">
<div class="medical-command-head">
<span>Case Severity</span>
<strong>${season.plans.length}</strong>
</div>
<div class="medical-ops-severity-grid">
<div><span>Major</span><strong>${season.major}</strong></div>
<div><span>Moderate</span><strong>${season.moderate}</strong></div>
<div><span>Minor</span><strong>${season.minor}</strong></div>
<div><span>Light</span><strong>${season.light}</strong></div>
</div>
</article>
<article class="medical-ops-card">
<div class="medical-command-head">
<span>Most Managed Days</span>
<strong>${season.topPlayerDays.length}</strong>
</div>
<div class="medical-ops-signal-list">
${season.topPlayerDays.length
  ? season.topPlayerDays
      .map(
        ({ player, days }) => `
<button type="button" data-medical-select-player="${escapeHtml(player.id)}" class="medical-ops-signal-row">
<span>${escapeHtml(player.name)}</span>
<strong>${days} days</strong>
<small>${escapeHtml(player.position || "Position")}</small>
</button>
`
      )
      .join("")
  : `<div class="medical-empty-inline">No managed medical days this season.</div>`}
</div>
</article>
</div>
`;
  };

  const renderCoachSafeSummary = (selectedDate) => {
    const items = getMedicalCoachHandoverItems(selectedDate);
    const stats = getMedicalDailyStats(selectedDate);
    return `
<section class="medical-operations-system is-coach-safe" data-medical-operations-system>
<header class="medical-ops-header">
<div>
<p class="placeholder-tag">Medical Operations</p>
<h2>Coach-Safe Summary</h2>
</div>
<span class="medical-ops-boundary">Approved share only</span>
</header>
<div class="medical-ops-stats">
${renderOpsStat("Full", String(stats.fullCount), "100%", "clear")}
${renderOpsStat("Modified", String(stats.modifiedCount), "10-75%", stats.modifiedCount ? "medium" : "clear")}
${renderOpsStat("Unavailable", String(stats.unavailableCount), "0%", stats.unavailableCount ? "high" : "clear")}
${renderOpsStat("Coach notes", String(items.length), "approved", items.length ? "low" : "clear")}
</div>
</section>
`;
  };

  const renderPrivateSystem = (summary, activeTab, selectedDate) => {
    const body =
      activeTab === "signals"
        ? renderSignals(summary)
        : activeTab === "cases"
          ? renderCases(summary)
          : activeTab === "history"
            ? renderHistory(summary)
            : activeTab === "rtp-library"
              ? renderRtpLibrary(summary)
              : activeTab === "season"
                ? renderSeason(summary)
              : renderSignals(summary);
    return `
<section class="medical-operations-system" data-medical-operations-system aria-label="Medical operations intelligence board">
${body}
</section>
`;
  };

  return {
    renderOpsStat,
    renderSignalDrivers,
    renderTabs,
    renderTopMenu,
    renderOverview,
    renderPlayerAvailability,
    renderSignals,
    renderCases,
    renderRtpLibrary,
    renderHistory,
    renderSeason,
    renderCoachSafeSummary,
    renderPrivateSystem,
  };
}
