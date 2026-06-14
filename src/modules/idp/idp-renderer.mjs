import {
  idpDevelopmentCategories,
  idpEvidenceTypes,
  idpFocusStatuses,
} from "./constants/idp-options.mjs";

const defaultUiState = Object.freeze({
  selectedPlayerId: "",
  statusFilter: "All",
  ownerFilter: "All",
  categoryFilter: "All",
  searchQuery: "",
  actionMode: "",
  message: "",
  error: "",
  loading: false,
});

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

const assignableIdpRoles = new Set(["admin", "club-admin", "team-admin", "coach", "analyst", "performance"]);

function normalizeUserRole(user = {}) {
  const rawRole = Array.isArray(user.roles) ? user.roles.find(Boolean) : user.role || user.platformRole || user.staffRole;
  return normalizeText(rawRole, "coach").toLowerCase();
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

function getStaffUsers(options = {}) {
  const users = Array.isArray(options.users) ? options.users : [];
  const currentUser = options.currentUser ? [options.currentUser] : [];
  const unique = new Map();
  for (const user of [...users, ...currentUser]) {
    const id = getUserId(user);
    if (!id || unique.has(id)) continue;
    const role = normalizeUserRole(user);
    if (!assignableIdpRoles.has(role)) continue;
    if (String(user.status || "active").toLowerCase() === "archived") continue;
    unique.set(id, { ...user, id, role });
  }
  return [...unique.values()].sort((a, b) => defaultFormatUserName(a).localeCompare(defaultFormatUserName(b)));
}

function formatStaffName(ownerId = "", options = {}) {
  const id = normalizeText(ownerId, "");
  if (!id) return "Unassigned";
  const user = getStaffUsers(options).find((entry) => getUserId(entry) === id);
  if (!user) return id;
  const formatter = typeof options.formatUserName === "function" ? options.formatUserName : defaultFormatUserName;
  return normalizeText(formatter(user), defaultFormatUserName(user));
}

function primaryOwnerId(profile = {}, focus = {}) {
  return normalizeText(profile.ownerId || focus.ownerId, "");
}

function staffSelectOptions(options = {}, selectedOwnerId = "") {
  const staff = getStaffUsers(options);
  const selected = normalizeText(selectedOwnerId, "");
  const selectedMissing = selected && !staff.some((user) => getUserId(user) === selected);
  return [
    `<option value="" ${selected ? "" : "selected"}>Unassigned</option>`,
    selectedMissing ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>` : "",
    ...staff.map((user) => {
      const id = getUserId(user);
      const label = `${formatStaffName(id, options)} · ${normalizeUserRole(user)}`;
      return `<option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }),
  ].join("");
}

function ownerFilterOptions(state = {}, options = {}, selected = "All") {
  const staffIds = new Set(getStaffUsers(options).map(getUserId));
  for (const entry of state.dashboardPlayers || []) {
    const ownerId = primaryOwnerId(entry.profile || {}, entry.focus || {});
    if (ownerId) staffIds.add(ownerId);
  }
  return [
    `<option value="All" ${selected === "All" ? "selected" : ""}>All IDP Coaches</option>`,
    `<option value="__unassigned" ${selected === "__unassigned" ? "selected" : ""}>Unassigned</option>`,
    ...[...staffIds].filter(Boolean).sort((a, b) => formatStaffName(a, options).localeCompare(formatStaffName(b, options))).map((ownerId) =>
      `<option value="${escapeHtml(ownerId)}" ${ownerId === selected ? "selected" : ""}>${escapeHtml(formatStaffName(ownerId, options))}</option>`
    ),
  ].join("");
}

function initialsFromName(value = "", fallback = "IDP") {
  const parts = normalizeText(value, fallback).split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback.slice(0, 3).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function statusTone(status = "") {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("due") || normalized.includes("needs") || normalized.includes("no active")) return "warning";
  if (normalized.includes("ready") || normalized.includes("track")) return "good";
  if (normalized.includes("new clips")) return "info";
  return "neutral";
}

function activeFocus(detail = {}) {
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
    const haystack = [profile.playerName, focus.title, focus.category, ownerId, ownerLabel, entry.nextAction, entry.overallStatus, coachLabel(entry.nextAction), coachLabel(entry.overallStatus)].join(" ").toLowerCase();
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

function getReviewLabel(entry = {}) {
  const profile = entry.profile || {};
  const focus = entry.focus || {};
  const nextReview = profile.nextReviewOn || focus.reviewDate || "";
  const lastReview = profile.lastReviewOn || "";
  if (lastReview && nextReview) return `${lastReview} -> ${nextReview}`;
  return nextReview ? `Next ${nextReview}` : lastReview ? `Last ${lastReview}` : "No date";
}

function renderOverviewRows(state = {}, dashboard = filterDashboardRows(state), options = {}) {
  const { rows, selectedPlayerId } = dashboard;
  if (!rows.length) {
    return `<div class="idp-empty-row">No players match the current view.</div>`;
  }
  return rows.map((entry) => {
    const profile = entry.profile || {};
    const focus = entry.focus || {};
    const active = selectedPlayerId === profile.playerId;
    const playerName = profile.playerName || "Player";
    const ownerId = primaryOwnerId(profile, focus);
    return `
      <button type="button" class="idp-overview-row${active ? " is-active" : ""}" data-idp-player="${escapeHtml(profile.playerId)}">
        <span class="idp-overview-player">
          <span class="idp-player-avatar" aria-hidden="true">${escapeHtml(initialsFromName(playerName, "P"))}</span>
          <span>
            <strong>${escapeHtml(playerName)}</strong>
            <small>${escapeHtml([profile.position, profile.role].filter(Boolean).join(" / ") || "Squad")}</small>
          </span>
        </span>
        <span class="idp-overview-focus">
          <strong>${escapeHtml(focus.title || "No active focus")}</strong>
          <small>${escapeHtml(focus.category || "-")}</small>
        </span>
        <span><span class="idp-status-pill is-${statusTone(entry.overallStatus)}">${escapeHtml(coachLabel(entry.overallStatus))}</span></span>
        <span class="idp-overview-metric"><strong>${escapeHtml(String(entry.evidenceCount || 0))}</strong><small>Observations</small></span>
        <span class="idp-overview-metric"><strong>${escapeHtml(String(entry.newClipCount || 0))}</strong><small>Clips</small></span>
        <span class="idp-overview-review"><strong>${escapeHtml(getReviewLabel(entry))}</strong><small>${escapeHtml(formatStaffName(ownerId, options))}</small></span>
        <span class="idp-overview-action">${escapeHtml(coachLabel(entry.nextAction || "Add evidence"))}</span>
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

function renderActionRail(canEdit = false, focusId = "") {
  if (!canEdit) return "";
  return `
    <div class="idp-action-rail" aria-label="Player development actions">
      <button type="button" data-idp-action="ownership">Assign coach</button>
      <button type="button" data-idp-action="focus">Update focus</button>
      <button type="button" data-idp-action="evidence" ${focusId ? "" : "disabled"}>Add observation</button>
      <button type="button" data-idp-action="review" ${focusId ? "" : "disabled"}>Complete review</button>
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

function renderEvidenceForm(focus = null) {
  const focusId = focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "";
  return `
    <form class="idp-action-form" data-idp-add-evidence>
      <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
      <label>
        <span>Observation type</span>
        <select name="evidenceType">${optionList(idpEvidenceTypes, "Coach Note")}</select>
      </label>
      <label class="idp-form-wide">
        <span>Note</span>
        <textarea name="note" rows="4" placeholder="What did the player show?"></textarea>
      </label>
      <div class="idp-action-form-actions">
        <button type="button" class="idp-secondary-action" data-idp-close-action>Cancel</button>
        <button type="submit" ${focusId ? "" : "disabled"}>Add observation</button>
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
  const copy = {
    ownership: ["Assign IDP Coach", "Choose who owns this player's development follow-up."],
    focus: ["Update focus", "Change the player's current development priority, status, and review date."],
    evidence: ["Add observation", "Capture a coach note, clip review, test result, or meeting signal for this focus."],
    review: ["Complete review", "Close the current review loop and set the next action."],
  };
  const [title, description] = copy[mode] || copy.focus;
  const form = mode === "ownership"
    ? renderOwnershipForm(state.playerDetail, focus, options)
    : mode === "evidence"
      ? renderEvidenceForm(focus)
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
        ${form}
      </article>
    </section>
  `;
}

function renderOverviewBoard(state = {}, ui = defaultUiState, options = {}) {
  const dashboard = filterDashboardRows({ ...state, ui }, options);
  const visiblePlayerCount = dashboard.rows.length;
  const totalPlayerCount = state.dashboardPlayers?.length || 0;
  return `
    <section class="idp-overview-board">
      <div class="idp-overview-head">
        <div>
          <p>Overview</p>
          <h2>Players</h2>
        </div>
        <span class="idp-sidebar-count">${escapeHtml(String(visiblePlayerCount))}/${escapeHtml(String(totalPlayerCount))} visible</span>
      </div>
      <div class="idp-toolbar">
        <select data-idp-filter="status" aria-label="Filter by status">
          ${optionList(["All", "On Track", "Needs Evidence", "Review Due", "No Active Focus", "New Clips To Review"], ui.statusFilter, coachLabel)}
        </select>
        <select data-idp-filter="category" aria-label="Filter by category">
          ${optionList(["All", ...idpDevelopmentCategories], ui.categoryFilter)}
        </select>
        <select data-idp-filter="owner" aria-label="Filter by IDP Coach">
          ${ownerFilterOptions(state, options, ui.ownerFilter)}
        </select>
        <input data-idp-search value="${escapeHtml(ui.searchQuery)}" placeholder="Search player or focus" aria-label="Search player or focus">
      </div>
      <div class="idp-overview-table" role="table" aria-label="Player development overview">
        <div class="idp-overview-row is-header" role="row">
          <span>Player</span>
          <span>Current Focus</span>
          <span>Status</span>
          <span>Observations</span>
          <span>Clips</span>
          <span>Review / IDP Coach</span>
          <span>Next Action</span>
        </div>
        <div class="idp-overview-rows">
          ${renderOverviewRows({ ...state, ui }, dashboard, options)}
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

function renderPlayerProfile(state = {}, canEdit = false, options = {}) {
  const detail = state.playerDetail;
  if (!detail?.profile?.playerId) {
    return `<section class="idp-player-profile"><div class="idp-muted">Loading player profile.</div></section>`;
  }
  const profile = detail.profile;
  const focus = activeFocus(detail);
  const focusId = focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "";
  const nextAction = detail.nextActions?.find((action) => action.status === "open") || detail.nextActions?.[0] || {};
  return `
    <section class="idp-player-profile">
      <header class="idp-profile-hero">
        <button type="button" class="idp-back-button" data-idp-back-overview>Overview</button>
        <div class="idp-profile-title">
          <span class="idp-player-avatar is-large" aria-hidden="true">${escapeHtml(initialsFromName(profile.playerName || "Player", "P"))}</span>
          <div>
            <p>Player Development Profile</p>
            <h2>${escapeHtml(profile.playerName || "Player")}</h2>
            <span>${escapeHtml([profile.position, profile.role].filter(Boolean).join(" / ") || "Squad")}</span>
          </div>
        </div>
        <div class="idp-profile-actions">
          <span class="idp-status-pill is-${statusTone(focus?.status)}">${escapeHtml(coachLabel(focus?.status || "No Active Focus"))}</span>
          ${renderActionRail(canEdit, focusId)}
        </div>
      </header>
      <section class="idp-profile-core">
        <article class="idp-panel idp-primary-panel idp-focus-panel">
          <p>Current Focus</p>
          <h3>${escapeHtml(focus?.title || "Create current focus")}</h3>
          <div class="idp-meta-line">${escapeHtml([focus?.category, focus?.linkedPhase, focus?.linkedSubPhase].filter(Boolean).join(" / ") || "Tactical")}</div>
        </article>
        <article class="idp-panel idp-next-panel">
          <p>Next Action</p>
          <h3>${escapeHtml(coachLabel(nextAction.title || "Add evidence"))}</h3>
          <div class="idp-meta-line">${escapeHtml(formatDate(nextAction.dueOn || focus?.reviewDate, "No date set"))}</div>
        </article>
        <article class="idp-panel idp-stat-panel">
          <p>Observations</p>
          <h3>${escapeHtml(String(detail.evidence?.length || 0))}</h3>
          <div class="idp-meta-line">observations logged</div>
        </article>
        <article class="idp-panel idp-stat-panel">
          <p>Clip Bank</p>
          <h3>${escapeHtml(String(detail.clipBank?.length || 0))}</h3>
          <div class="idp-meta-line">clips waiting</div>
        </article>
      </section>
      <section class="idp-profile-work">
        <article class="idp-panel">
          <div class="idp-panel-head"><p>Clip Bank</p><span>${escapeHtml(String(detail.clipBank?.length || 0))}</span></div>
          ${renderClipBank(detail, canEdit)}
        </article>
        <article class="idp-panel">
          <div class="idp-panel-head"><p>Observations</p><span>${escapeHtml(String(detail.evidence?.length || 0))}</span></div>
          ${renderEvidence(detail)}
        </article>
        <article class="idp-panel">
          <p>Development Timeline</p>
          ${renderTimeline(detail)}
        </article>
        ${renderOwnershipPanel(detail, focus, canEdit, options)}
      </section>
      ${renderActionOverlay(state, focus, canEdit, options)}
    </section>
  `;
}

export function renderIdpWorkspace(state = {}, options = {}) {
  const canEdit = Boolean(options.canEdit);
  const ui = { ...defaultUiState, ...(state.ui || {}) };
  const teamName = getTeamName(options);
  const hasSelectedPlayer = Boolean(ui.selectedPlayerId);
  return `
    <section class="idp-shell">
      <header class="idp-header">
        <div class="idp-title-lockup">
          ${renderTeamMark(options)}
          <div>
            <p>IDP</p>
            <h1>Player Development</h1>
            <span>${escapeHtml(teamName)}</span>
          </div>
        </div>
        <div class="idp-summary-strip" aria-label="Player development overview">
          ${renderSummary(state)}
        </div>
      </header>
      ${ui.loading ? `<div class="idp-notice">Loading player development plans.</div>` : ""}
      ${ui.error ? `<div class="idp-notice is-warning">${escapeHtml(ui.error)}</div>` : ""}
      ${ui.message ? `<div class="idp-notice">${escapeHtml(ui.message)}</div>` : ""}
      ${hasSelectedPlayer ? renderPlayerProfile(state, canEdit, options) : renderOverviewBoard(state, ui, options)}
    </section>
  `;
}
