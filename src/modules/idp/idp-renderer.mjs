import {
  idpDevelopmentCategories,
  idpEvidenceTypes,
  idpFocusStatuses,
} from "./constants/idp-options.mjs";
import {
  renderClipBankOrganizer,
  renderIdpClipPreviewOverlay,
} from "./idp-clip-bank-renderer.mjs";
import {
  renderIdpPlayerBoardOverlay,
  renderIdpPlayerBoardPanel,
} from "./idp-player-board-renderer.mjs";

const defaultUiState = Object.freeze({
  selectedPlayerId: "",
  statusFilter: "All",
  ownerFilter: "All",
  categoryFilter: "All",
  openFilterMenu: "",
  searchQuery: "",
  profileView: "development",
  clipBankSearchQuery: "",
  actionMode: "",
  message: "",
  error: "",
  loading: false,
  selectedClipBankIds: [],
});

const profileTimelinePreviewLimit = 5;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function coachLabel(value = "") {
  return String(value ?? "")
    .replace(/\bNeeds Evidence\b/g, "Needs Observation")
    .replace(/\bAdd Evidence\b/g, "Add Observation")
    .replace(/\bAdd evidence\b/g, "Add observation")
    .replace(/\bMarked As Evidence\b/g, "Marked As Observation")
    .replace(/\bHas Evidence\b/g, "Has Observation")
    .replace(/\bFirst Evidence Added\b/g, "First Observation Added")
    .replace(/\bEvidence added\b/g, "Observation added")
    .replace(/\bEvidence queue\b/g, "Observation queue")
    .replace(/\bEvidence summary\b/g, "Observation summary")
    .replace(/\bEvidence type\b/g, "Observation type")
    .replace(/\bEvidence\b/g, "Observations")
    .replace(/\bevidence\b/g, "observations");
}

function optionList(options = [], selected = "", labelFormatter = (option) => option) {
  return options.map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(labelFormatter(option))}</option>`).join("");
}

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).trim();
}

const staffDirectoryRoles = new Set(["admin", "club-admin", "team-admin", "coach", "analyst", "performance"]);
const idpCoachRole = "coach";

function normalizeUserRole(user = {}) {
  const rawRole = Array.isArray(user.roles) ? user.roles.find(Boolean) : user.role || user.platformRole || user.staffRole;
  return normalizeText(rawRole, "").toLowerCase();
}

function getUserId(user = {}) {
  return normalizeText(user.id || user.userId || user.user_id || user.email, "");
}

function defaultFormatUserName(user = {}) {
  return normalizeText(
    user.name
      || user.displayName
      || user.fullName
      || [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(" ")
      || user.email,
    "Staff"
  );
}

function getDirectoryUsers(options = {}) {
  const users = Array.isArray(options.users) ? options.users : [];
  const currentUser = options.currentUser ? [options.currentUser] : [];
  const unique = new Map();
  for (const user of [...users, ...currentUser]) {
    const id = getUserId(user);
    if (!id || unique.has(id)) continue;
    const role = normalizeUserRole(user);
    if (String(user.status || "active").toLowerCase() === "archived") continue;
    unique.set(id, { ...user, id, role });
  }
  return [...unique.values()].sort((a, b) => defaultFormatUserName(a).localeCompare(defaultFormatUserName(b)));
}

function getStaffUsers(options = {}) {
  return getDirectoryUsers(options).filter((user) => staffDirectoryRoles.has(normalizeUserRole(user)));
}

function getIdpCoachUsers(options = {}) {
  return getStaffUsers(options).filter((user) => normalizeUserRole(user) === idpCoachRole);
}

function formatStaffName(ownerId = "", options = {}) {
  const id = normalizeText(ownerId, "");
  if (!id) return "Unassigned";
  const user = getDirectoryUsers(options).find((entry) => getUserId(entry) === id);
  if (!user) return id;
  const formatter = typeof options.formatUserName === "function" ? options.formatUserName : defaultFormatUserName;
  return normalizeText(formatter(user), defaultFormatUserName(user));
}

function isLikelyTechnicalId(value = "") {
  return /^[0-9a-f-]{24,}$/i.test(String(value || ""));
}

function timelineActorLabel(milestone = {}, options = {}) {
  const actorId = normalizeText(milestone.createdBy || milestone.created_by, "");
  if (!actorId) return "Actor not captured";
  const actorLabel = formatStaffName(actorId, options);
  if (actorLabel === actorId && isLikelyTechnicalId(actorId)) return "Staff member";
  return actorLabel;
}

function timelineSourceLabel(value = "") {
  const source = normalizeText(value, "");
  if (!source || source === "idp") return "";
  return coachLabel(source.replace(/[-_]/g, " "));
}

function primaryOwnerId(profile = {}, focus = {}) {
  return normalizeText(profile.ownerId || focus.ownerId, "");
}

function playerSquadNumber(profile = {}, fallback = "") {
  return normalizeText(profile.squadNumber || profile.squad_number || profile.number || profile.shirtNumber || profile.shirt_number, fallback);
}

function staffSelectOptions(options = {}, selectedOwnerId = "") {
  const staff = getIdpCoachUsers(options);
  const selected = normalizeText(selectedOwnerId, "");
  const selectedMissing = selected && !staff.some((user) => getUserId(user) === selected);
  return [
    `<option value="" ${selected ? "" : "selected"}>Unassigned</option>`,
    selectedMissing ? `<option value="" selected>Choose IDP coach</option>` : "",
    ...staff.map((user) => {
      const id = getUserId(user);
      const label = `${formatStaffName(id, options)} · Coach`;
      return `<option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }),
  ].join("");
}

function ownerFilterItems(options = {}) {
  const coachUsers = getIdpCoachUsers(options);
  return [
    { value: "All", label: "All IDP Coaches", meta: "Whole squad" },
    { value: "__unassigned", label: "Unassigned", meta: "No IDP coach" },
    ...coachUsers.map((user) => {
      const id = getUserId(user);
      return { value: id, label: formatStaffName(id, options), meta: "Coach" };
    }),
  ];
}

function categoryFilterItems() {
  return [
    { value: "All", label: "All", meta: "Every lens" },
    ...idpDevelopmentCategories.map((category) => ({ value: category, label: category, meta: "Development lens" })),
  ];
}

function renderFilterDropdown({
  filter = "",
  label = "",
  selected = "All",
  items = [],
  openFilterMenu = "",
  ariaLabel = "",
} = {}) {
  const selectedItem = items.find((item) => item.value === selected) || items[0] || { value: "All", label: "All", meta: "" };
  const isOpen = openFilterMenu === filter;
  return `
    <div class="idp-control-select idp-filter-dropdown ${isOpen ? "is-open" : ""}" data-idp-filter-shell="${escapeHtml(filter)}">
      <span>${escapeHtml(label)}</span>
      <button type="button" class="idp-filter-button" data-idp-filter="${escapeHtml(filter)}" data-idp-filter-toggle="${escapeHtml(filter)}" aria-haspopup="listbox" aria-expanded="${isOpen ? "true" : "false"}" aria-label="${escapeHtml(ariaLabel || label)}">
        <strong>${escapeHtml(selectedItem.label)}</strong>
        <i aria-hidden="true"></i>
      </button>
      ${isOpen ? `
        <div class="idp-filter-menu" role="listbox" aria-label="${escapeHtml(ariaLabel || label)}">
          ${items.map((item) => `
            <button type="button" class="idp-filter-option ${item.value === selectedItem.value ? "is-selected" : ""}" data-idp-filter-option="${escapeHtml(filter)}" data-idp-filter-value="${escapeHtml(item.value)}" role="option" aria-selected="${item.value === selectedItem.value ? "true" : "false"}">
              <span>${escapeHtml(item.label)}</span>
              ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
            </button>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function initialsFromName(value = "", fallback = "IDP") {
  const parts = normalizeText(value, fallback).split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback.slice(0, 3).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function statusTone(status = "") {
  const normalized = String(status).toLowerCase();
  if (normalized === "active" || normalized.includes("track")) return "good";
  if (normalized.includes("no active idp") || normalized.includes("inactive") || normalized.includes("paused")) return "neutral";
  if (normalized.includes("due") || normalized.includes("needs") || normalized.includes("no active focus")) return "warning";
  if (normalized.includes("ready")) return "good";
  if (normalized.includes("new clips")) return "info";
  return "neutral";
}

function isInactiveIdpProfile(profile = {}) {
  return normalizeText(profile.status, "").toLowerCase() === "none";
}

function idpStatusLabel(profile = {}, focus = null) {
  if (isInactiveIdpProfile(profile)) return "No Active IDP";
  return focus?.status || "No Active Focus";
}

function activeFocus(detail = {}) {
  if (isInactiveIdpProfile(detail.profile || {})) return null;
  return (detail.focuses || []).find((focus) => ["Active", "Needs Evidence", "Ready For Review", "Reviewed"].includes(focus.status))
    || detail.focuses?.[0]
    || null;
}

function getTeamName(options = {}) {
  return normalizeText(
    options.teamName
      || options.team?.name
      || options.currentUser?.teamName
      || options.currentUser?.team
      || options.currentUser?.clubName
      || options.currentUser?.club,
    "North Carolina Courage"
  );
}

function getTeamLogoUrl(options = {}) {
  return normalizeText(
    options.teamLogoUrl
      || options.team?.logoUrl
      || options.team?.logo_url
      || options.team?.logo
      || options.team?.badgeUrl
      || options.team?.crestUrl
      || options.currentUser?.teamLogoUrl
      || options.currentUser?.team_logo_url
      || options.currentUser?.teamLogo,
    ""
  );
}

function renderTeamMark(options = {}) {
  const teamName = getTeamName(options);
  const logoUrl = getTeamLogoUrl(options);
  const shortName = normalizeText(options.team?.shortName || options.team?.short_name || options.currentUser?.teamShortName, "");
  return `
    <span class="idp-team-mark${logoUrl ? " has-logo" : " is-initials"}" aria-label="${escapeHtml(`${teamName} logo`)}">
      ${logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(`${teamName} logo`)}">`
        : `<strong>${escapeHtml((shortName && shortName.length <= 4 ? shortName : initialsFromName(teamName, "NCC")).toUpperCase())}</strong>`}
    </span>
  `;
}

function filterDashboardRows(state = {}, options = {}) {
  const { selectedPlayerId, statusFilter, ownerFilter, categoryFilter, searchQuery } = { ...defaultUiState, ...(state.ui || {}) };
  const query = String(searchQuery || "").trim().toLowerCase();
  const rows = (state.dashboardPlayers || []).filter((entry) => {
    const focus = entry.focus || {};
    const profile = entry.profile || {};
    const ownerId = primaryOwnerId(profile, focus);
    const ownerLabel = formatStaffName(ownerId, options);
    const haystack = [profile.playerName, playerSquadNumber(profile), focus.title, focus.category, ownerId, ownerLabel, entry.nextAction, entry.overallStatus, coachLabel(entry.nextAction), coachLabel(entry.overallStatus)].join(" ").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (statusFilter !== "All" && entry.overallStatus !== statusFilter) return false;
    if (ownerFilter === "__unassigned" && ownerId) return false;
    if (ownerFilter !== "All" && ownerFilter !== "__unassigned" && ownerId !== ownerFilter) return false;
    if (categoryFilter !== "All" && focus.category !== categoryFilter) return false;
    return true;
  });
  return { rows, selectedPlayerId };
}

function formatDate(value = "", fallback = "-") {
  const text = normalizeText(value, "");
  return text || fallback;
}

function formatShortDate(value = "", fallback = "-") {
  const text = normalizeText(value, "");
  if (!text) return fallback;
  const [, month = "", day = ""] = text.match(/^\d{4}-(\d{2})-(\d{2})/) || [];
  return month && day ? `${day}/${month}` : text;
}

function daysUntil(value = "") {
  const text = normalizeText(value, "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const target = new Date(`${text}T00:00:00Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function reviewUrgencyLabel(profile = {}, focus = null) {
  const date = profile.nextReviewOn || focus?.reviewDate || "";
  const remaining = daysUntil(date);
  if (remaining === null) return "No review date";
  if (remaining < 0) return "Review overdue";
  if (remaining === 0) return "Review today";
  if (remaining <= 7) return `${remaining} days to review`;
  return `Review ${formatShortDate(date)}`;
}

function getReviewLabel(entry = {}) {
  const profile = entry.profile || {};
  const focus = entry.focus || {};
  const nextReview = profile.nextReviewOn || focus.reviewDate || "";
  const lastReview = profile.lastReviewOn || "";
  if (lastReview && nextReview) return `${lastReview} -> ${nextReview}`;
  return nextReview ? `Next ${nextReview}` : lastReview ? `Last ${lastReview}` : "No date";
}

function overviewStatusFilters(selected = "All") {
  const filters = [
    ["All", "All"],
    ["Needs Evidence", "Attention"],
    ["Review Due", "Review"],
    ["No Active IDP", "Paused"],
    ["New Clips To Review", "Clips"],
  ];
  return filters.map(([value, label]) => `
    <button type="button" class="${value === selected ? "is-active" : ""}" data-idp-status-filter="${escapeHtml(value)}">
      ${escapeHtml(label)}
    </button>
  `).join("");
}

function buildOverviewInsights(state = {}, options = {}) {
  const players = state.dashboardPlayers || [];
  const needsAttention = players.filter((entry) => statusTone(entry.overallStatus) === "warning").length;
  const reviewDue = players.filter((entry) => String(entry.overallStatus || "").toLowerCase().includes("review")).length;
  const inactive = players.filter((entry) => isInactiveIdpProfile(entry.profile || {}) || entry.overallStatus === "No Active IDP").length;
  const unassigned = players.filter((entry) => !primaryOwnerId(entry.profile || {}, entry.focus || {})).length;
  const clipQueue = players.reduce((total, entry) => total + Number(entry.newClipCount || 0), 0);
  const firstOwner = players.map((entry) => primaryOwnerId(entry.profile || {}, entry.focus || {})).find(Boolean);
  return [
    { label: "Attention", value: needsAttention, detail: reviewDue ? `${reviewDue} review loops close` : "No urgent review loops", tone: needsAttention ? "warning" : "good" },
    { label: "Unassigned", value: unassigned, detail: firstOwner ? `Lead: ${formatStaffName(firstOwner, options)}` : "No IDP Coach set", tone: unassigned ? "warning" : "neutral" },
    { label: "Paused", value: inactive, detail: "Injury or paused development plan", tone: inactive ? "info" : "neutral" },
    { label: "Clips", value: clipQueue, detail: clipQueue ? "Moments waiting for decision" : "No clips waiting", tone: clipQueue ? "info" : "good" },
  ];
}

function renderOverviewInsights(state = {}, options = {}) {
  return buildOverviewInsights(state, options).map((item) => `
    <article class="idp-overview-insight is-${escapeHtml(item.tone)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(String(item.value))}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </article>
  `).join("");
}

function renderOverviewRows(state = {}, dashboard = filterDashboardRows(state), options = {}) {
  const { rows, selectedPlayerId } = dashboard;
  if (!rows.length) {
    return `
      <div class="idp-empty-row">
        <strong>No players match this cockpit view.</strong>
        <span>Clear the search or switch the status lens to see the full squad.</span>
      </div>
    `;
  }
  return rows.map((entry) => {
    const profile = entry.profile || {};
    const focus = entry.focus || {};
    const active = selectedPlayerId === profile.playerId;
    const playerName = profile.playerName || "Player";
    const squadNumber = playerSquadNumber(profile);
    const ownerId = primaryOwnerId(profile, focus);
    const idpInactive = isInactiveIdpProfile(profile);
    const tone = statusTone(entry.overallStatus);
    const reviewLabel = idpInactive ? "Paused" : reviewUrgencyLabel(profile, focus);
    const nextAction = idpInactive ? "Monitor availability" : coachLabel(entry.nextAction || "Add evidence");
    return `
      <button type="button" class="idp-overview-row is-${escapeHtml(tone)}${active ? " is-active" : ""}" data-idp-player="${escapeHtml(profile.playerId)}">
        <span class="idp-overview-rank" aria-label="${escapeHtml(squadNumber ? `Squad number ${squadNumber}` : "Squad number not set")}">${escapeHtml(squadNumber || "-")}</span>
        <span class="idp-overview-player">
          <span class="idp-player-avatar" aria-hidden="true">${escapeHtml(initialsFromName(playerName, "P"))}</span>
          <span>
            <strong>${escapeHtml(playerName)}</strong>
            <small>
              <span>${escapeHtml([profile.position, profile.role].filter(Boolean).join(" / ") || "Squad")}</span>
              <span>${escapeHtml(formatStaffName(ownerId, options))}</span>
            </small>
          </span>
        </span>
        <span class="idp-overview-focus">
          <small>Current Focus</small>
          <strong>${escapeHtml(idpInactive ? "No active IDP" : focus.title || "No active focus")}</strong>
          <em>${escapeHtml(idpInactive ? "Inactive from Squad Room" : focus.category || "Tactical")}</em>
        </span>
        <span class="idp-overview-metrics">
          <span class="idp-overview-metric"><strong>${escapeHtml(String(entry.evidenceCount || 0))}</strong><small>Observations</small></span>
          <span class="idp-overview-metric"><strong>${escapeHtml(String(entry.newClipCount || 0))}</strong><small>Clips</small></span>
          <span class="idp-status-pill is-${escapeHtml(tone)}">${escapeHtml(coachLabel(entry.overallStatus))}</span>
        </span>
        <span class="idp-overview-review">
          <small>Review</small>
          <strong>${escapeHtml(reviewLabel)}</strong>
          <em>${escapeHtml(getReviewLabel(entry))}</em>
        </span>
        <span class="idp-overview-action">
          <small>Next Action</small>
          <strong>${escapeHtml(nextAction)}</strong>
        </span>
        <span class="idp-open-profile">Profile</span>
      </button>
    `;
  }).join("");
}

function buildSummary(state = {}) {
  const players = state.dashboardPlayers || [];
  const warningCount = players.filter((entry) => statusTone(entry.overallStatus) === "warning").length;
  const reviewCount = players.filter((entry) => String(entry.overallStatus || "").toLowerCase().includes("review")).length;
  const clipCount = players.reduce((total, entry) => total + Number(entry.newClipCount || 0), 0);
  return [
    { label: "Players", value: players.length },
    { label: "Needs attention", value: warningCount },
    { label: "Reviews", value: reviewCount },
    { label: "New clips", value: clipCount },
  ];
}

function renderSummary(state = {}) {
  return buildSummary(state).map((item) => `
    <div class="idp-summary-chip">
      <strong>${escapeHtml(String(item.value))}</strong>
      <span>${escapeHtml(item.label)}</span>
    </div>
  `).join("");
}

function renderTimeline(detail = {}) {
  const milestones = detail.milestones || [];
  if (!milestones.length) return `<div class="idp-muted">No milestones yet.</div>`;
  return milestones.slice(0, 8).map((milestone) => `
    <div class="idp-timeline-item">
      <span></span>
      <div>
        <strong>${escapeHtml(coachLabel(milestone.title || milestone.milestoneType))}</strong>
        <small>${escapeHtml(milestone.occurredOn || "")}</small>
      </div>
    </div>
  `).join("");
}

function renderClipBank(detail = {}, canEdit = false) {
  const clips = detail.clipBank || [];
  if (!clips.length) return `<div class="idp-muted">No clips waiting.</div>`;
  return clips.slice(0, 8).map((clip) => `
    <div class="idp-list-item">
      <div>
        <strong>${escapeHtml(coachLabel(clip.status))}</strong>
        <small>${escapeHtml(clip.sourceModule)} / ${escapeHtml(clip.clipInstanceId)}</small>
      </div>
      ${canEdit ? `<button type="button" data-idp-action="evidence">Log observation</button>` : ""}
    </div>
  `).join("");
}

function renderEvidence(detail = {}) {
  const evidence = detail.evidence || [];
  if (!evidence.length) return `<div class="idp-muted">No observations yet.</div>`;
  return evidence.slice(0, 8).map((item) => `
    <div class="idp-list-item">
      <div>
        <strong>${escapeHtml(coachLabel(item.evidenceType))}</strong>
        <small>${escapeHtml(item.note || item.sourceModule)}</small>
      </div>
      <time>${escapeHtml(item.createdAt ? item.createdAt.slice(0, 10) : "")}</time>
    </div>
  `).join("");
}

function latestItem(items = [], dateKey = "createdAt") {
  return [...items].filter(Boolean).sort((a, b) => String(b[dateKey] || "").localeCompare(String(a[dateKey] || "")))[0] || null;
}

function latestObservation(detail = {}, type = "") {
  const observations = detail.evidence || [];
  const matchType = normalizeText(type, "");
  const candidates = matchType ? observations.filter((item) => item.evidenceType === matchType) : observations;
  return latestItem(candidates);
}

function observationTypeCounts(detail = {}) {
  const counts = new Map();
  for (const item of detail.evidence || []) {
    const key = coachLabel(item.evidenceType || "Coach Note");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function progressPulse(detail = {}, focus = null, idpInactive = false) {
  const observations = detail.evidence?.length || 0;
  const clips = detail.clipBank?.filter((clip) => !["Archived", "Hidden"].includes(clip.status))?.length || 0;
  const reviews = detail.reviews?.length || 0;
  const status = coachLabel(focus?.status || "");
  if (idpInactive) return { label: "Paused", tone: "warning", detail: "IDP inactive from Squad Room" };
  if (String(focus?.status || "").toLowerCase().includes("ready")) {
    return { label: "Ready for review", tone: "good", detail: `${observations} observations in the loop` };
  }
  if (clips > 0) return { label: "Video review needed", tone: "info", detail: `${clips} clips waiting for coach decision` };
  if (!observations) return { label: "Needs first signal", tone: "warning", detail: "Start with one match or training observation" };
  if (reviews > 0) return { label: "Review loop active", tone: "good", detail: `${reviews} review${reviews === 1 ? "" : "s"} completed` };
  if (observations >= 3) return { label: "Pattern emerging", tone: "good", detail: "Enough observations to discuss trend" };
  return { label: status || "On track", tone: "neutral", detail: `${observations} observations captured` };
}

function pulseLevel(detail = {}) {
  const score = (detail.evidence?.length || 0) * 22 + (detail.reviews?.length || 0) * 18;
  if (score >= 88) return 5;
  if (score >= 66) return 4;
  if (score >= 44) return 3;
  if (score >= 22) return 2;
  return 1;
}

function buildDevelopmentObjective(profile = {}, focus = null, idpInactive = false) {
  if (idpInactive) return "IDP is paused. Keep historical learning visible and reactivate when the player returns to full development work.";
  const role = [profile.position, profile.role].filter(Boolean).join(" / ") || "their role";
  const phase = [focus?.linkedPhase, focus?.linkedSubPhase].filter(Boolean).join(" / ");
  const context = phase || focus?.category || "the current focus";
  const description = normalizeText(focus?.description, "");
  if (description) {
    const title = normalizeText(focus?.title, "");
    let cleaned = title && description.toLowerCase().startsWith(title.toLowerCase())
      ? description.slice(title.length).replace(/^[\s,.:;-]+/, "")
      : description;
    cleaned = cleaned.replace(/^so the player can\s+/i, "The player can ");
    cleaned = cleaned.replace(/^so\s+/i, "To ");
    return cleaned || description;
  }
  return `Collect match and training evidence for this focus, then decide the next coaching action for ${role}${context ? ` in ${context}` : ""}.`;
}

function buildSuccessCriteria(detail = {}, focus = null, profile = {}, idpInactive = false) {
  if (idpInactive) {
    return [
      { label: "Availability reviewed", state: "watch" },
      { label: "Historical observations preserved", state: "done" },
      { label: "Reactivate when Squad status changes", state: "next" },
    ];
  }
  const observations = detail.evidence?.length || 0;
  const clips = detail.clipBank?.length || 0;
  const reviewDate = profile.nextReviewOn || focus?.reviewDate || "";
  return [
    { label: `${focus?.category || "Tactical"} behavior is visible in training and match context`, state: observations >= 2 ? "done" : "next" },
    { label: observations >= 3 ? "3+ relevant observations logged" : `Log ${Math.max(1, 3 - observations)} more relevant observation${3 - observations === 1 ? "" : "s"}`, state: observations >= 3 ? "done" : "next" },
    { label: clips ? "Clip bank has reviewable moments" : "Capture at least one video moment", state: clips ? "done" : "watch" },
    { label: reviewDate ? `Review loop set for ${formatShortDate(reviewDate)}` : "Set the next review date", state: reviewDate ? "done" : "watch" },
  ];
}

function lensCounts(detail = {}, focus = null) {
  const counts = new Map([
    ["Technical", 0],
    ["Tactical", 0],
    ["Physical", 0],
    ["Psychological", 0],
    ["Social", 0],
  ]);
  const primary = focus?.category === "Leadership" ? "Social" : focus?.category || "Tactical";
  counts.set(primary, (counts.get(primary) || 0) + 2);
  for (const item of detail.evidence || []) {
    const type = item.evidenceType || "";
    if (/video|match|training/i.test(type)) counts.set("Tactical", counts.get("Tactical") + 1);
    if (/performance|medical|physical/i.test(type)) counts.set("Physical", counts.get("Physical") + 1);
    if (/reflection|review|coach note/i.test(type)) counts.set("Psychological", counts.get("Psychological") + 1);
    if (/leadership/i.test(type)) counts.set("Social", counts.get("Social") + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({
    label,
    value,
    active: label === primary,
  }));
}

function renderSuccessCriteria(criteria = []) {
  return `
    <div class="idp-success-list">
      ${criteria.map((item) => `
        <div class="idp-success-item is-${escapeHtml(item.state || "next")}">
          <span></span>
          <strong>${escapeHtml(item.label)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFourCornerLens(detail = {}, focus = null) {
  return `
    <article class="idp-panel idp-lens-panel">
      <div class="idp-panel-head"><p>Development Lens</p><span>4C</span></div>
      <div class="idp-lens-grid">
        ${lensCounts(detail, focus).map((item) => `
          <div class="idp-lens-cell${item.active ? " is-primary" : ""}">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.value ? `${item.value} signals` : "watch")}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderPlayerVoice(detail = {}, profile = {}) {
  const reflection = latestObservation(detail, "Player Reflection");
  const leadership = normalizeText(profile.leadershipProfile, "");
  return `
    <article class="idp-panel idp-voice-panel">
      <div class="idp-panel-head"><p>Player Voice</p><span>${reflection ? "1" : "0"}</span></div>
      <blockquote>${escapeHtml(reflection?.note || leadership || "No player reflection captured yet.")}</blockquote>
      <div class="idp-meta-line">${escapeHtml(reflection ? `Captured ${formatShortDate(reflection.createdAt)}` : "Use the next check-in to add the player's words.")}</div>
    </article>
  `;
}

function renderStageQuickActions(canEdit = false, focusId = "", idpInactive = false) {
  if (!canEdit || idpInactive) return "";
  return `
    <details class="idp-stage-actions">
      <summary aria-label="Open quick actions" title="Quick actions">+</summary>
      <div class="idp-stage-actions-menu" role="menu" aria-label="Quick actions">
        <button type="button" data-idp-action="ownership" role="menuitem">Assign Coach</button>
        <button type="button" data-idp-action="focus" role="menuitem">Update Focus</button>
        <button type="button" data-idp-action="evidence" role="menuitem">Add Observation</button>
        <button type="button" data-idp-action="review" role="menuitem" ${focusId ? "" : "disabled aria-disabled=\"true\""}>Complete Review</button>
      </div>
    </details>
  `;
}

function normalizeProfileView(value = "") {
  return value === "clip-bank" ? "clip-bank" : "development";
}

function renderProfileMenu(profileView = "development") {
  const isClipBank = normalizeProfileView(profileView) === "clip-bank";
  return `
    <nav class="idp-profile-menu" aria-label="Player profile navigation">
      <button type="button" data-idp-back-overview>Overview</button>
      <button type="button" class="${isClipBank ? "is-active" : ""}" data-idp-profile-view="clip-bank" aria-pressed="${isClipBank ? "true" : "false"}">Clip Bank</button>
    </nav>
  `;
}

function renderObservationButtons(item = {}, canEdit = false) {
  if (!canEdit || !item.id) return "";
  const id = escapeHtml(item.id);
  return `
    <div class="idp-stream-actions" aria-label="Observation actions">
      <button type="button" data-idp-edit-evidence="${id}" aria-label="Edit observation" title="Edit observation">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z"></path>
          <path d="M13.5 6 18 10.5"></path>
        </svg>
      </button>
      <button type="button" data-idp-delete-evidence="${id}" aria-label="Delete observation" title="Delete observation">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 7h14"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M8 7l1-3h6l1 3"></path>
          <path d="M7 7l1 13h8l1-13"></path>
        </svg>
      </button>
    </div>
  `;
}

function renderFocusForm(focus = null) {
  const focusId = focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "";
  return `
    <form class="idp-action-form" data-idp-create-focus>
      <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
      <label>
        <span>Focus</span>
        <input name="title" value="${escapeHtml(focus?.title || "")}" placeholder="Current focus" required>
      </label>
      <label>
        <span>Category</span>
        <select name="category">${optionList(idpDevelopmentCategories, focus?.category || "Tactical")}</select>
      </label>
      <label>
        <span>Status</span>
        <select name="status">${optionList(idpFocusStatuses, focus?.status || "Active", coachLabel)}</select>
      </label>
      <label>
        <span>Review date</span>
        <input name="reviewDate" type="date" value="${escapeHtml(focus?.reviewDate || "")}">
      </label>
      <div class="idp-action-form-actions">
        <button type="button" class="idp-secondary-action" data-idp-close-action>Cancel</button>
        <button type="submit">Save focus</button>
      </div>
    </form>
  `;
}

function renderEvidenceForm(focus = null, evidence = null) {
  const isEditing = Boolean(evidence?.id);
  const focusId = evidence?.focusId || (focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "");
  const focusTitle = normalizeText(focus?.title, "General development notes");
  return `
    <form class="idp-action-form" ${isEditing ? "data-idp-update-evidence" : "data-idp-add-evidence"}>
      ${isEditing ? `<input type="hidden" name="evidenceId" value="${escapeHtml(evidence.id)}">` : ""}
      <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
      <label>
        <span>Observation type</span>
        <select name="evidenceType">${optionList(idpEvidenceTypes, evidence?.evidenceType || "Coach Note")}</select>
      </label>
      <label class="idp-form-wide">
        <span>Note</span>
        <textarea name="note" rows="4" placeholder="What did the player show?">${escapeHtml(evidence?.note || "")}</textarea>
      </label>
      ${focusId || isEditing ? "" : `<div class="idp-form-note">This observation will start a saved IDP note thread for ${escapeHtml(focusTitle)}.</div>`}
      <div class="idp-action-form-actions">
        <button type="button" class="idp-secondary-action" data-idp-close-action>Cancel</button>
        <button type="submit">${isEditing ? "Save observation" : "Add observation"}</button>
      </div>
    </form>
  `;
}

function renderReviewForm(focus = null) {
  const focusId = focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "";
  return `
    <form class="idp-action-form" data-idp-complete-review>
      <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
      <label class="idp-form-wide">
        <span>Progress</span>
        <textarea name="progressSummary" rows="3" placeholder="What changed since the last review?"></textarea>
      </label>
      <label class="idp-form-wide">
        <span>Observation summary</span>
        <textarea name="evidenceSummary" rows="3" placeholder="Observations used for the decision"></textarea>
      </label>
      <label>
        <span>Next action</span>
        <input name="nextAction" placeholder="Next action">
      </label>
      <div class="idp-action-form-actions">
        <button type="button" class="idp-secondary-action" data-idp-close-action>Cancel</button>
        <button type="submit" ${focusId ? "" : "disabled"}>Complete review</button>
      </div>
    </form>
  `;
}

function renderOwnershipForm(detail = {}, focus = null, options = {}) {
  const profile = detail.profile || {};
  const focusId = focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "";
  const selectedOwnerId = primaryOwnerId(profile, focus || {});
  return `
    <form class="idp-action-form" data-idp-assign-owner>
      <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
      <label>
        <span>Primary IDP Coach</span>
        <select name="ownerId">${staffSelectOptions(options, selectedOwnerId)}</select>
      </label>
      <div class="idp-form-note">This coach owns the player's IDP follow-up. The active focus owner is updated at the same time.</div>
      <div class="idp-action-form-actions">
        <button type="button" class="idp-secondary-action" data-idp-close-action>Cancel</button>
        <button type="submit">Save assignment</button>
      </div>
    </form>
  `;
}

function renderActionOverlay(state = {}, focus = null, canEdit = false, options = {}) {
  const mode = state.ui?.actionMode || "";
  if (!canEdit || !mode) return "";
  const profile = state.playerDetail?.profile || {};
  const ownerId = primaryOwnerId(profile, focus || {});
  const editingEvidence = mode === "edit-evidence"
    ? (state.playerDetail?.evidence || []).find((item) => item.id === state.ui?.editEvidenceId) || null
    : null;
  const copy = {
    ownership: ["Assign IDP Coach", "Choose who owns this player's development follow-up."],
    focus: ["Update focus", "Change the player's current development priority, status, and review date."],
    evidence: ["Add observation", "Capture a coach note, clip review, test result, or meeting signal for this focus."],
    "edit-evidence": ["Edit observation", "Update the coaching signal without creating a duplicate note."],
    review: ["Complete review", "Close the current review loop and set the next action."],
  };
  const [title, description] = copy[mode] || copy.focus;
  const form = mode === "edit-evidence" && !editingEvidence
    ? `<div class="idp-empty-signal">Observation no longer available.</div>`
    : mode === "ownership"
    ? renderOwnershipForm(state.playerDetail, focus, options)
    : mode === "evidence"
      ? renderEvidenceForm(focus)
      : mode === "edit-evidence"
        ? renderEvidenceForm(focus, editingEvidence)
      : mode === "review"
        ? renderReviewForm(focus)
        : renderFocusForm(focus);
  return `
    <section class="idp-action-layer" data-idp-action-layer role="presentation">
      <article class="idp-action-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <header>
          <div>
            <p>Player Development</p>
            <h2>${escapeHtml(title)}</h2>
            <span>${escapeHtml(description)}</span>
          </div>
          <button type="button" class="idp-dialog-close" data-idp-close-action aria-label="Close">x</button>
        </header>
        <div class="idp-action-context" aria-label="Action context">
          <span><small>Player</small><strong>${escapeHtml(profile.playerName || "Player")}</strong></span>
          <span><small>Current Focus</small><strong>${escapeHtml(focus?.title || "Create current focus")}</strong></span>
          <span><small>IDP Coach</small><strong>${escapeHtml(formatStaffName(ownerId, options))}</strong></span>
        </div>
        ${form}
      </article>
    </section>
  `;
}

function renderOverviewBoard(state = {}, ui = defaultUiState, options = {}) {
  const ownerItems = ownerFilterItems(options);
  const categoryItems = categoryFilterItems();
  const ownerValues = new Set(ownerItems.map((item) => item.value));
  const categoryValues = new Set(categoryItems.map((item) => item.value));
  const normalizedUi = {
    ...defaultUiState,
    ...ui,
    ownerFilter: ownerValues.has(ui.ownerFilter) ? ui.ownerFilter : "All",
    categoryFilter: categoryValues.has(ui.categoryFilter) ? ui.categoryFilter : "All",
  };
  const dashboard = filterDashboardRows({ ...state, ui: normalizedUi }, options);
  return `
    <section class="idp-overview-board">
      <div class="idp-overview-command">
        <div class="idp-toolbar">
          <select class="idp-filter-native-status" data-idp-filter="status" aria-label="Filter by status">
            ${optionList(["All", "On Track", "Needs Evidence", "Review Due", "No Active Focus", "No Active IDP", "New Clips To Review"], normalizedUi.statusFilter, coachLabel)}
          </select>
          <label class="idp-search-box">
            <span>Search</span>
            <span class="idp-search-control">
              <input data-idp-search value="${escapeHtml(normalizedUi.searchQuery)}" placeholder="Player, focus or coach" aria-label="Search player or focus">
              <button type="button" class="idp-search-button" data-idp-search-submit aria-label="Search players">
                <span class="idp-search-icon" aria-hidden="true"></span>
              </button>
            </span>
          </label>
          ${renderFilterDropdown({
            filter: "owner",
            label: "IDP Coach",
            selected: normalizedUi.ownerFilter,
            items: ownerItems,
            openFilterMenu: normalizedUi.openFilterMenu,
            ariaLabel: "Filter by IDP Coach",
          })}
          ${renderFilterDropdown({
            filter: "category",
            label: "Development lens",
            selected: normalizedUi.categoryFilter,
            items: categoryItems,
            openFilterMenu: normalizedUi.openFilterMenu,
            ariaLabel: "Filter by category",
          })}
        </div>
      </div>
      <div class="idp-overview-table" role="table" aria-label="Player development overview">
        <div class="idp-overview-row is-header" role="row">
          <span>#</span>
          <span>Player</span>
          <span>Current Focus</span>
          <span>Observations</span>
          <span>Review / IDP Coach</span>
          <span>Next Action</span>
          <span>Profile</span>
        </div>
        <div class="idp-overview-rows">
          ${renderOverviewRows({ ...state, ui: normalizedUi }, dashboard, options)}
        </div>
      </div>
    </section>
  `;
}

function renderOwnershipPanel(detail = {}, focus = null, canEdit = false, options = {}) {
  const profile = detail.profile || {};
  const profileOwnerId = normalizeText(profile.ownerId, "");
  const focusOwnerId = normalizeText(focus?.ownerId, "");
  const supportOwners = (detail.ownership || [])
    .filter((item) => item && item.status !== "inactive" && item.status !== "archived")
    .filter((item) => ["support-staff", "review-owner", "evidence-contributor"].includes(item.ownership_type || item.ownershipType))
    .slice(0, 3);
  return `
    <article class="idp-panel">
      <div class="idp-panel-head"><p>Staff Ownership</p><span>${escapeHtml(String((detail.ownership || []).length))}</span></div>
      <div class="idp-owner-grid">
        <div class="idp-owner-row">
          <span>Primary IDP Coach</span>
          <strong>${escapeHtml(formatStaffName(profileOwnerId || focusOwnerId, options))}</strong>
        </div>
        <div class="idp-owner-row">
          <span>Current Focus Owner</span>
          <strong>${escapeHtml(formatStaffName(focusOwnerId || profileOwnerId, options))}</strong>
        </div>
        <div class="idp-owner-row">
          <span>Next Review</span>
          <strong>${escapeHtml(formatDate(profile.nextReviewOn || focus?.reviewDate, "No review date"))}</strong>
        </div>
        ${supportOwners.length ? supportOwners.map((owner) => `
          <div class="idp-owner-row">
            <span>${escapeHtml(owner.ownership_type || owner.ownershipType || "Support")}</span>
            <strong>${escapeHtml(formatStaffName(owner.owner_id || owner.ownerId, options))}</strong>
          </div>
        `).join("") : ""}
      </div>
      ${canEdit ? `<button type="button" class="idp-owner-action" data-idp-action="ownership">Assign coach</button>` : ""}
    </article>
  `;
}

function renderCriteriaTrack(criteria = []) {
  return `
    <div class="idp-criteria-track" aria-label="Success Criteria">
      ${criteria.map((item, index) => `
        <div class="idp-criteria-node is-${escapeHtml(item.state || "next")}">
          <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
          <strong>${escapeHtml(item.label)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLensCompass(detail = {}, focus = null) {
  return `
    <article class="idp-lens-compass">
      <div class="idp-section-kicker">Development Lens</div>
      <div class="idp-compass-grid">
        ${lensCounts(detail, focus).map((item) => `
          <div class="idp-compass-cell${item.active ? " is-primary" : ""}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value ? `${item.value}` : "0")}</strong>
            <small>${escapeHtml(item.value === 1 ? "signal" : "signals")}</small>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderSignalRadar(observationMix = [], total = 0) {
  const maxCount = Math.max(1, ...observationMix.map(([, count]) => count));
  return `
    <article class="idp-signal-radar">
      <div class="idp-section-kicker">Signal Map</div>
      <strong>${escapeHtml(String(total))}</strong>
      <span>coach observations in this IDP loop</span>
      <div class="idp-signal-bars">
        ${observationMix.length
          ? observationMix.map(([label, count]) => `
            <div class="idp-signal-bar">
              <small>${escapeHtml(label)}</small>
              <i><b class="is-level-${escapeHtml(String(Math.max(1, Math.ceil((count / maxCount) * 5))))}"></b></i>
              <em>${escapeHtml(String(count))}</em>
            </div>
          `).join("")
          : `<div class="idp-empty-signal">No observation pattern yet.</div>`}
      </div>
    </article>
  `;
}

function renderProfileFilmstrip(detail = {}, canEdit = false, ui = {}) {
  return renderClipBankOrganizer(detail, canEdit, ui);
}

function renderProfileClipBankPage(detail = {}, canEdit = false, ui = {}) {
  const clips = Array.isArray(detail.clipBank) ? detail.clipBank : [];
  return `
    <section class="idp-profile-subpage idp-profile-clip-bank-page">
      <div class="idp-profile-subpage-head">
        <div>
          <span>Player Clip Bank</span>
          <strong>${escapeHtml(String(clips.length))} clips connected to this IDP</strong>
          <small>Match and training evidence for this player's development loop.</small>
        </div>
        <button type="button" data-idp-profile-view="development">Player Profile</button>
      </div>
      ${renderProfileFilmstrip(detail, canEdit, ui)}
    </section>
  `;
}

function renderProfileSignalStream(detail = {}, canEdit = false) {
  const evidence = detail.evidence || [];
  return `
    <article class="idp-signal-stream-panel">
      <div class="idp-section-head">
        <div>
          <span>Observations</span>
          <strong>${escapeHtml(String(evidence.length))} captured signals</strong>
        </div>
      </div>
      <div class="idp-signal-stream">
        ${evidence.length
          ? evidence.map((item) => `
            <div class="idp-stream-item">
              <time>${escapeHtml(formatShortDate(item.createdAt, "--"))}</time>
              <div>
                <strong>${escapeHtml(coachLabel(item.evidenceType))}</strong>
                <span>${escapeHtml(item.note || item.sourceModule || "Observation logged")}</span>
              </div>
              ${renderObservationButtons(item, canEdit)}
            </div>
          `).join("")
          : `<div class="idp-empty-signal">No observations yet.</div>`}
      </div>
    </article>
  `;
}

function renderTimelineRiverItem(milestone = {}, options = {}) {
  const label = coachLabel(milestone.title || milestone.milestoneType || "Timeline update");
  const date = milestone.occurredOn || milestone.createdAt || "";
  const actor = timelineActorLabel(milestone, options);
  const actorText = actor === "Actor not captured" ? actor : `By ${actor}`;
  const source = timelineSourceLabel(milestone.sourceModule || "");
  return `
    <div class="idp-river-item">
      <span></span>
      <div>
        <strong>${escapeHtml(label)}</strong>
        <small>
          <span>${escapeHtml(formatShortDate(date, "No date"))}</span>
          <span>${escapeHtml(actorText)}</span>
          ${source ? `<span>${escapeHtml(source)}</span>` : ""}
        </small>
      </div>
    </div>
  `;
}

function renderProfileTimelineRiver(detail = {}, options = {}) {
  const milestones = detail.milestones || [];
  const visibleMilestones = milestones.slice(0, profileTimelinePreviewLimit);
  const hiddenMilestones = milestones.slice(profileTimelinePreviewLimit);
  return `
    <article class="idp-river-panel">
      <div class="idp-section-head">
        <div>
          <span>Development Timeline</span>
          <strong>${escapeHtml(milestones.length ? `${Math.min(milestones.length, profileTimelinePreviewLimit)} latest updates` : "No milestones yet")}</strong>
        </div>
      </div>
      <div class="idp-timeline-river">
        ${milestones.length
          ? `
            ${visibleMilestones.map((milestone) => renderTimelineRiverItem(milestone, options)).join("")}
            ${hiddenMilestones.length ? `
              <details class="idp-river-more">
                <summary data-idp-timeline-more>
                  <span>Show more</span>
                  <strong>${escapeHtml(String(hiddenMilestones.length))}</strong>
                </summary>
                <div class="idp-river-more-list">
                  ${hiddenMilestones.map((milestone) => renderTimelineRiverItem(milestone, options)).join("")}
                </div>
              </details>
            ` : ""}
          `
          : `<div class="idp-empty-signal">The first completed action will start the timeline.</div>`}
      </div>
    </article>
  `;
}

function renderPlayerProfile(state = {}, canEdit = false, options = {}) {
  const detail = state.playerDetail;
  if (!detail?.profile?.playerId) {
    return `<section class="idp-player-profile"><div class="idp-muted">Loading player profile.</div></section>`;
  }
  const profile = detail.profile;
  const focus = activeFocus(detail);
  const idpInactive = isInactiveIdpProfile(profile);
  const focusId = focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "";
  const nextAction = detail.nextActions?.find((action) => action.status === "open") || detail.nextActions?.[0] || {};
  const ownerId = primaryOwnerId(profile, focus || {});
  const pulse = progressPulse(detail, focus, idpInactive);
  const criteria = buildSuccessCriteria(detail, focus, profile, idpInactive);
  const observationMix = observationTypeCounts(detail).slice(0, 3);
  const latestReview = latestItem(detail.reviews || []);
  const latestSignal = latestObservation(detail);
  const reflection = latestObservation(detail, "Player Reflection");
  const leadership = normalizeText(profile.leadershipProfile, "");
  const strengths = Array.isArray(profile.strengths) ? profile.strengths.slice(0, 3) : [];
  const profileView = normalizeProfileView(state.ui?.profileView || "");
  return `
    <section class="idp-player-profile idp-profile-experience">
      <header class="idp-profile-stage">
        <div class="idp-stage-identity">
          <span class="idp-stage-watermark" aria-hidden="true">${escapeHtml(initialsFromName(profile.playerName || "Player", "P"))}</span>
          <h2>${escapeHtml(profile.playerName || "Player")}</h2>
          <p>${escapeHtml([profile.position, profile.role].filter(Boolean).join(" / ") || "Squad")}</p>
          <div class="idp-stage-tags">
            <span class="idp-status-pill is-${statusTone(idpStatusLabel(profile, focus))}">${escapeHtml(coachLabel(idpStatusLabel(profile, focus)))}</span>
            <span>${escapeHtml(formatStaffName(ownerId, options))}</span>
            <span>${escapeHtml(reviewUrgencyLabel(profile, focus))}</span>
          </div>
        </div>
        ${renderStageQuickActions(canEdit, focusId, idpInactive)}
      </header>
      ${idpInactive ? `<div class="idp-notice is-warning">IDP is inactive from Squad Room. Historical observations, clips and ownership remain visible here.</div>` : ""}
      ${renderProfileMenu(profileView)}
      ${profileView === "clip-bank" ? renderProfileClipBankPage(detail, canEdit && !idpInactive, state.ui || {}) : `
      <section class="idp-development-board">
        <article class="idp-focus-story idp-focus-clarity-card">
          <div class="idp-focus-clarity-head">
            <div>
              <div class="idp-section-kicker">Current Focus</div>
              <h3>${escapeHtml(idpInactive ? "No active IDP" : focus?.title || "Create current focus")}</h3>
            </div>
            <div class="idp-focus-meta">
              <span>${escapeHtml(idpInactive ? "Paused" : focus?.category || "Tactical")}</span>
              <span>${escapeHtml([profile.position, profile.role].filter(Boolean).join(" / ") || "Squad")}</span>
              <span>${escapeHtml(reviewUrgencyLabel(profile, focus))}</span>
            </div>
          </div>
          <div class="idp-focus-coach-cue">
            <span>Coach cue</span>
            <strong>${escapeHtml(buildDevelopmentObjective(profile, focus, idpInactive))}</strong>
          </div>
          ${strengths.length ? `
            <div class="idp-focus-strengths">
              <span>Player strengths</span>
              <div class="idp-strength-row">${strengths.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
            </div>
          ` : ""}
          <div class="idp-section-kicker">Success Criteria</div>
          ${renderCriteriaTrack(criteria)}
        </article>
        ${renderIdpPlayerBoardPanel(
          detail,
          focus || {},
          profile,
          pulse,
          idpInactive ? { title: "No IDP action required", dueOn: "Paused" } : nextAction,
          canEdit && !idpInactive,
          state.ui || {}
        )}
      </section>
      <section class="idp-intelligence-board">
        ${renderLensCompass(detail, focus)}
        ${renderSignalRadar(observationMix, detail.evidence?.length || 0)}
        <article class="idp-player-voice-card">
          <div class="idp-section-kicker">Player Voice</div>
          <blockquote>${escapeHtml(reflection?.note || leadership || "No player reflection captured yet.")}</blockquote>
          <span>${escapeHtml(reflection ? `Captured ${formatShortDate(reflection.createdAt)}` : "Use the next check-in to add the player's words.")}</span>
        </article>
        <article class="idp-review-card">
          <div class="idp-section-kicker">Last Review</div>
          <strong>${escapeHtml(latestReview?.progressSummary || "No review completed yet.")}</strong>
          <span>${escapeHtml(latestReview ? formatShortDate(latestReview.createdAt) : "Complete the first review to lock the learning loop.")}</span>
        </article>
      </section>
      <section class="idp-workflow-board">
        ${renderProfileSignalStream(detail, canEdit && !idpInactive)}
        ${renderProfileTimelineRiver(detail, options)}
      </section>
      `}
      ${renderActionOverlay(state, focus, canEdit && !idpInactive, options)}
      ${renderIdpPlayerBoardOverlay(detail, focus || {}, profile, state.ui || {}, canEdit && !idpInactive)}
      ${renderIdpClipPreviewOverlay(detail, state.ui || {})}
    </section>
  `;
}

export function renderIdpWorkspace(state = {}, options = {}) {
  const canEdit = Boolean(options.canEdit);
  const ui = { ...defaultUiState, ...(state.ui || {}) };
  const teamName = getTeamName(options);
  const hasSelectedPlayer = Boolean(ui.selectedPlayerId);
  return `
    <section class="idp-shell${hasSelectedPlayer ? " is-profile-mode" : " is-overview-mode"}">
      <header class="idp-header">
        <div class="idp-title-lockup">
          ${renderTeamMark(options)}
          <div>
            <p>IDP</p>
            <h1>Player Development</h1>
            <span>${escapeHtml(teamName)}</span>
          </div>
        </div>
        ${hasSelectedPlayer ? "" : `
          <div class="idp-summary-strip" aria-label="Player development overview">
            ${renderSummary(state)}
          </div>
        `}
      </header>
      ${ui.loading ? `<div class="idp-notice">Loading player development plans.</div>` : ""}
      ${ui.error ? `<div class="idp-notice is-warning">${escapeHtml(ui.error)}</div>` : ""}
      ${ui.message ? `<div class="idp-notice">${escapeHtml(ui.message)}</div>` : ""}
      ${hasSelectedPlayer ? renderPlayerProfile(state, canEdit, options) : renderOverviewBoard(state, ui, options)}
    </section>
  `;
}
