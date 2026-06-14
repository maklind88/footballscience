import {
  idpDevelopmentCategories,
  idpEvidenceTypes,
  idpFocusStatuses,
} from "./constants/idp-options.mjs";

const defaultUiState = Object.freeze({
  selectedPlayerId: "",
  statusFilter: "All",
  categoryFilter: "All",
  searchQuery: "",
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

function optionList(options = [], selected = "") {
  return options.map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
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

function renderDashboardRows(state = {}) {
  const { selectedPlayerId, statusFilter, categoryFilter, searchQuery } = { ...defaultUiState, ...(state.ui || {}) };
  const query = String(searchQuery || "").trim().toLowerCase();
  const rows = (state.dashboardPlayers || []).filter((entry) => {
    const focus = entry.focus || {};
    const haystack = [entry.profile?.playerName, focus.title, focus.category, entry.nextAction, entry.overallStatus].join(" ").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (statusFilter !== "All" && entry.overallStatus !== statusFilter) return false;
    if (categoryFilter !== "All" && focus.category !== categoryFilter) return false;
    return true;
  });
  if (!rows.length) {
    return `<div class="idp-empty-row">No players match the current view.</div>`;
  }
  return rows.map((entry) => {
    const profile = entry.profile || {};
    const focus = entry.focus || {};
    const active = selectedPlayerId === profile.playerId;
    return `
      <button type="button" class="idp-dashboard-row${active ? " is-active" : ""}" data-idp-player="${escapeHtml(profile.playerId)}">
        <span class="idp-player-cell">
          <strong>${escapeHtml(profile.playerName || "Player")}</strong>
          <small>${escapeHtml([profile.position, profile.role].filter(Boolean).join(" / "))}</small>
        </span>
        <span class="idp-focus-cell">
          <strong>${escapeHtml(focus.title || "No active focus")}</strong>
          <small>${escapeHtml(focus.category || "Tactical")}${focus.reviewDate ? ` / ${escapeHtml(focus.reviewDate)}` : ""}</small>
        </span>
        <span>${escapeHtml(focus.ownerId || profile.ownerId || "-")}</span>
        <span>${escapeHtml(String(entry.evidenceCount || 0))}</span>
        <span>${escapeHtml(String(entry.newClipCount || 0))}</span>
        <span class="idp-status-pill is-${statusTone(entry.overallStatus)}">${escapeHtml(entry.overallStatus)}</span>
        <span>${escapeHtml(entry.nextAction || "Add evidence")}</span>
      </button>
    `;
  }).join("");
}

function renderTimeline(detail = {}) {
  const milestones = detail.milestones || [];
  if (!milestones.length) return `<div class="idp-muted">No milestones yet.</div>`;
  return milestones.slice(0, 8).map((milestone) => `
    <div class="idp-timeline-item">
      <span></span>
      <div>
        <strong>${escapeHtml(milestone.title || milestone.milestoneType)}</strong>
        <small>${escapeHtml(milestone.occurredOn || "")}</small>
      </div>
    </div>
  `).join("");
}

function renderClipBank(detail = {}) {
  const clips = detail.clipBank || [];
  if (!clips.length) return `<div class="idp-muted">No clips waiting.</div>`;
  return clips.slice(0, 8).map((clip) => `
    <div class="idp-list-item">
      <div>
        <strong>${escapeHtml(clip.status)}</strong>
        <small>${escapeHtml(clip.sourceModule)} / ${escapeHtml(clip.clipInstanceId)}</small>
      </div>
      <button type="button" data-idp-clip-evidence="${escapeHtml(clip.id)}">Evidence</button>
    </div>
  `).join("");
}

function renderEvidence(detail = {}) {
  const evidence = detail.evidence || [];
  if (!evidence.length) return `<div class="idp-muted">Evidence queue is empty.</div>`;
  return evidence.slice(0, 8).map((item) => `
    <div class="idp-list-item">
      <div>
        <strong>${escapeHtml(item.evidenceType)}</strong>
        <small>${escapeHtml(item.note || item.sourceModule)}</small>
      </div>
      <time>${escapeHtml(item.createdAt ? item.createdAt.slice(0, 10) : "")}</time>
    </div>
  `).join("");
}

function renderPlayerPanel(state = {}, canEdit = false) {
  const detail = state.playerDetail;
  if (!detail?.profile?.playerId) {
    return `<section class="idp-player-panel"><div class="idp-muted">Select a player.</div></section>`;
  }
  const profile = detail.profile;
  const focus = activeFocus(detail);
  const nextAction = detail.nextActions?.find((action) => action.status === "open") || detail.nextActions?.[0] || {};
  return `
    <section class="idp-player-panel">
      <header class="idp-player-header">
        <div>
          <p>${escapeHtml([profile.position, profile.role].filter(Boolean).join(" / ") || "Squad")}</p>
          <h2>${escapeHtml(profile.playerName || "Player")}</h2>
        </div>
        <span class="idp-status-pill is-${statusTone(focus?.status)}">${escapeHtml(focus?.status || "No Active Focus")}</span>
      </header>
      <section class="idp-player-grid">
        <article class="idp-panel">
          <p>Current Focus</p>
          <h3>${escapeHtml(focus?.title || "Create current focus")}</h3>
          <div class="idp-meta-line">${escapeHtml([focus?.category, focus?.linkedPhase, focus?.linkedSubPhase].filter(Boolean).join(" / "))}</div>
        </article>
        <article class="idp-panel">
          <p>Next Action</p>
          <h3>${escapeHtml(nextAction.title || "Add evidence")}</h3>
          <div class="idp-meta-line">${escapeHtml(nextAction.dueOn || focus?.reviewDate || "")}</div>
        </article>
      </section>
      <section class="idp-player-columns">
        <article class="idp-panel">
          <div class="idp-panel-head"><p>Clip Bank</p><span>${escapeHtml(String(detail.clipBank?.length || 0))}</span></div>
          ${renderClipBank(detail)}
        </article>
        <article class="idp-panel">
          <div class="idp-panel-head"><p>Evidence</p><span>${escapeHtml(String(detail.evidence?.length || 0))}</span></div>
          ${renderEvidence(detail)}
        </article>
      </section>
      <section class="idp-player-columns">
        <article class="idp-panel">
          <p>Development Timeline</p>
          ${renderTimeline(detail)}
        </article>
        <article class="idp-panel">
          <p>Staff Ownership</p>
          <div class="idp-muted">${escapeHtml(focus?.ownerId || profile.ownerId || "Unassigned")}</div>
        </article>
      </section>
      ${canEdit ? renderCommandForms(detail, focus) : ""}
    </section>
  `;
}

function renderCommandForms(detail = {}, focus = null) {
  const focusId = focus?.id && !String(focus.id).startsWith("legacy-focus-") ? focus.id : "";
  return `
    <section class="idp-command-band">
      <form data-idp-create-focus>
        <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
        <input name="title" placeholder="Current focus" required>
        <select name="category">${optionList(idpDevelopmentCategories, focus?.category || "Tactical")}</select>
        <select name="status">${optionList(idpFocusStatuses, focus?.status || "Active")}</select>
        <input name="reviewDate" type="date" value="${escapeHtml(focus?.reviewDate || "")}">
        <button type="submit">Save Focus</button>
      </form>
      <form data-idp-add-evidence>
        <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
        <select name="evidenceType">${optionList(idpEvidenceTypes, "Coach Note")}</select>
        <input name="note" placeholder="Short note">
        <button type="submit" ${focusId ? "" : "disabled"}>Add Evidence</button>
      </form>
      <form data-idp-complete-review>
        <input type="hidden" name="focusId" value="${escapeHtml(focusId)}">
        <input name="progressSummary" placeholder="Progress">
        <input name="nextAction" placeholder="Next action">
        <button type="submit" ${focusId ? "" : "disabled"}>Complete Review</button>
      </form>
    </section>
  `;
}

export function renderIdpWorkspace(state = {}, options = {}) {
  const canEdit = Boolean(options.canEdit);
  const ui = { ...defaultUiState, ...(state.ui || {}) };
  return `
    <section class="idp-shell">
      <header class="idp-header">
        <div>
          <p>IDP</p>
          <h1>Player Development</h1>
        </div>
        <div class="idp-toolbar">
          <select data-idp-filter="status">
            ${optionList(["All", "On Track", "Needs Evidence", "Review Due", "No Active Focus", "New Clips To Review"], ui.statusFilter)}
          </select>
          <select data-idp-filter="category">
            ${optionList(["All", ...idpDevelopmentCategories], ui.categoryFilter)}
          </select>
          <input data-idp-search value="${escapeHtml(ui.searchQuery)}" placeholder="Search player or focus">
        </div>
      </header>
      ${ui.loading ? `<div class="idp-notice">Loading player development plans.</div>` : ""}
      ${ui.error ? `<div class="idp-notice is-warning">${escapeHtml(ui.error)}</div>` : ""}
      ${ui.message ? `<div class="idp-notice">${escapeHtml(ui.message)}</div>` : ""}
      <section class="idp-layout">
        <section class="idp-dashboard">
          <div class="idp-dashboard-head">
            <span>Player</span><span>Focus</span><span>Owner</span><span>Evidence</span><span>Clips</span><span>Status</span><span>Next</span>
          </div>
          ${renderDashboardRows(state)}
        </section>
        ${renderPlayerPanel(state, canEdit)}
      </section>
    </section>
  `;
}
