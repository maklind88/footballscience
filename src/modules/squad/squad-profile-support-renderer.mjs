const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createSquadProfileSupportRenderer({
  escapeHtml = defaultEscapeHtml,
  formatPlayerProfileChangeTime,
  getActiveTab,
  getPlayerProfileChangeLog,
  getPlayerProfileMedicalSnapshot,
  getRecentPlayerProfileChangeLog,
  isNewPlayerModalOpen,
  canEditPlayerProfiles,
  playerProfileRoleOptions = [],
  playerProfileRosterTypeOptions = [],
  playerProfileTabOptions = [],
} = {}) {
  const renderRoleOptions = (selectedRole = "") =>
    playerProfileRoleOptions
      .map((role) => `<option value="${escapeHtml(role)}" ${role === selectedRole ? "selected" : ""}>${escapeHtml(role)}</option>`)
      .join("");

  const renderSecondaryRoleOptions = (selectedRoles = []) => {
    const selected = new Set(selectedRoles);
    return playerProfileRoleOptions
      .map((role) => `<option value="${escapeHtml(role)}" ${selected.has(role) ? "selected" : ""}>${escapeHtml(role)}</option>`)
      .join("");
  };

  const renderOptionSet = (options, selectedKey = "") =>
    options
      .map((option) => `<option value="${escapeHtml(option.key)}" ${option.key === selectedKey ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
      .join("");

  const renderMedicalPanel = (player) => {
    const snapshot = getPlayerProfileMedicalSnapshot(player.id);
    return `
    <article class="squad-profile-section squad-medical-snapshot">
      <header class="squad-section-head">
        <div>
          <p>Medical Snapshot</p>
          <h2>Availability</h2>
        </div>
        <span class="squad-medical-cell medical-tone-${escapeHtml(snapshot.tone)}">${escapeHtml(snapshot.currentAvailability)}</span>
      </header>
      <div class="squad-snapshot-grid">
        <div>
          <span>Current availability</span>
          <strong>${escapeHtml(snapshot.currentAvailability)}</strong>
        </div>
        <div>
          <span>RTP / status</span>
          <strong>${escapeHtml(snapshot.rtpStatus)}</strong>
        </div>
        <div>
          <span>Coach note</span>
          <strong>${escapeHtml(snapshot.coachNote || "No coach note")}</strong>
        </div>
        <div>
          <span>Latest medical log</span>
          <strong>${escapeHtml(snapshot.latestLogSummary)}</strong>
        </div>
        ${
          snapshot.returnDateLabel
            ? `<div>
          <span>Expected return</span>
          <strong>${escapeHtml(snapshot.returnDateLabel)}</strong>
          ${snapshot.activeInjuryLabel ? `<small>${escapeHtml(snapshot.activeInjuryLabel)}</small>` : ""}
        </div>`
            : ""
        }
      </div>
    </article>
  `;
  };

  const renderFuturePanel = (player) => {
    const future = player.futureData;
    return `
    <article class="squad-profile-section">
      <header class="squad-section-head">
        <div>
          <p>Data Slots</p>
          <h2>Match / Load / Analysis</h2>
        </div>
        <span>${future.matchData.length + future.load.length + future.minutes.length} linked items</span>
      </header>
      <div class="squad-snapshot-grid">
        <div>
          <span>Match data</span>
          <strong>${future.matchData.length}</strong>
        </div>
        <div>
          <span>Load</span>
          <strong>${future.load.length}</strong>
        </div>
        <div>
          <span>Minutes</span>
          <strong>${future.minutes.length}</strong>
        </div>
      </div>
      <div class="squad-note-grid">
        <p>${escapeHtml(future.performanceNotes || "Performance notes will live here.")}</p>
        <p>${escapeHtml(future.scoutingNotes || "Scouting and analysis can be attached later.")}</p>
      </div>
    </article>
  `;
  };

  const renderChangeLogRows = (entries = []) => {
    if (!entries.length) {
      return `<p class="squad-change-empty">No changes tracked for this player yet.</p>`;
    }
    return entries
      .map(
        (entry) => `
      <article class="squad-change-row">
        <header>
          <div>
            <strong>${escapeHtml(entry.summary || "Profile updated")}</strong>
            <span>${escapeHtml(entry.actor || "Football Science")} · ${escapeHtml(formatPlayerProfileChangeTime(entry.createdAt))}</span>
          </div>
          <em>${escapeHtml(entry.type.replaceAll("-", " "))}</em>
        </header>
        ${
          entry.changes.length
            ? `<div class="squad-change-diff">
${entry.changes
  .slice(0, 5)
  .map(
    (change) => `
                    <span>
                      <b>${escapeHtml(change.field)}</b>
                      <small>${escapeHtml(change.from)} -> ${escapeHtml(change.to)}</small>
                    </span>
                  `
  )
  .join("")}
</div>`
            : ""
        }
      </article>
    `
      )
      .join("");
  };

  const renderHistoryPanel = (player) => {
    const playerEntries = getPlayerProfileChangeLog(player.id);
    const recentEntries = getRecentPlayerProfileChangeLog(5);
    return `
    <article class="squad-profile-section squad-change-history">
      <header class="squad-section-head">
        <div>
          <p>Change History</p>
          <h2>Profile Audit Trail</h2>
        </div>
        <span>${playerEntries.length} player changes</span>
      </header>
      <div class="squad-change-history-grid">
        <section>
          <h3>${escapeHtml(player.name)}</h3>
          <div class="squad-change-list">
            ${renderChangeLogRows(playerEntries)}
          </div>
        </section>
        <section>
          <h3>Recent Squad Room activity</h3>
          <div class="squad-change-list">
            ${renderChangeLogRows(recentEntries)}
          </div>
        </section>
      </div>
    </article>
  `;
  };

  const renderTabs = () => `
    <nav class="squad-profile-tabs" aria-label="Player profile sections">
      ${playerProfileTabOptions
        .map(
          (tab) => `
<button
type="button"
class="${tab.key === getActiveTab() ? "is-active" : ""}"
data-player-profile-tab="${escapeHtml(tab.key)}"
>
${escapeHtml(tab.label)}
</button>
`
        )
        .join("")}
    </nav>
  `;

  const getDraftValue = (draft = {}, key = "") => String(draft?.[key] ?? "").trim();

  const renderNewPlayerCard = (draft = {}) => {
    const canEdit = canEditPlayerProfiles();
    const draftPrimaryRole = getDraftValue(draft, "primaryRole") || "CB";
    const draftRosterType = getDraftValue(draft, "rosterType") || "squad";
    return `
    <article class="squad-add-player-card">
      <header class="squad-section-head">
        <div>
          <p>Squad Setup</p>
          <h2>Add Player</h2>
        </div>
      </header>
      <form id="playerProfileNewPlayerForm" class="squad-profile-form">
        <div class="squad-form-grid">
          <label>
            <span>Name</span>
            <input name="name" value="${escapeHtml(getDraftValue(draft, "name"))}" placeholder="Player name" ${canEdit ? "required" : "disabled"} />
          </label>
          <label>
            <span>Number</span>
            <input name="number" value="${escapeHtml(getDraftValue(draft, "number"))}" placeholder="#" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Birth date</span>
            <input name="birthDate" type="date" value="${escapeHtml(getDraftValue(draft, "birthDate"))}" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Position</span>
            <input name="position" value="${escapeHtml(getDraftValue(draft, "position"))}" placeholder="Defender" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Primary role</span>
            <select name="primaryRole" ${canEdit ? "" : "disabled"}>
              ${renderRoleOptions(draftPrimaryRole)}
            </select>
          </label>
          <label>
            <span>Roster type</span>
            <select name="rosterType" ${canEdit ? "" : "disabled"}>
              ${renderOptionSet(playerProfileRosterTypeOptions, draftRosterType)}
            </select>
          </label>
          <label>
            <span>Temporary group</span>
            <input name="temporaryGroup" value="${escapeHtml(getDraftValue(draft, "temporaryGroup"))}" placeholder="Academy Training Group" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Temporary from</span>
            <input name="temporaryFrom" type="date" value="${escapeHtml(getDraftValue(draft, "temporaryFrom"))}" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Temporary to</span>
            <input name="temporaryTo" type="date" value="${escapeHtml(getDraftValue(draft, "temporaryTo"))}" ${canEdit ? "" : "disabled"} />
          </label>
        </div>
        <button type="submit" ${canEdit ? "" : "disabled"}>Add player</button>
      </form>
    </article>
  `;
  };

  const renderNewPlayerModal = (draft = {}) => {
    if (!isNewPlayerModalOpen()) {
      return "";
    }
    return `
    <div class="squad-profile-modal-overlay" data-player-profile-new-modal-overlay>
      <div
        class="squad-profile-modal squad-new-player-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add player"
      >
        <button
          type="button"
          class="squad-profile-modal-close"
          data-player-profile-new-modal-close
          aria-label="Close add player"
        >
          &times;
        </button>
        <div class="squad-profile-modal-body">${renderNewPlayerCard(draft)}</div>
      </div>
    </div>
  `;
  };

  return {
    renderRoleOptions,
    renderSecondaryRoleOptions,
    renderOptionSet,
    renderMedicalPanel,
    renderFuturePanel,
    renderChangeLogRows,
    renderHistoryPanel,
    renderTabs,
    renderNewPlayerCard,
    renderNewPlayerModal,
  };
}
