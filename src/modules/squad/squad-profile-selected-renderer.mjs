const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createSquadProfileSelectedRenderer({
  escapeHtml = defaultEscapeHtml,
  canEditPlayerProfiles,
  getActiveTab,
  getPlayerProfileDisplayBirthDateValue,
  getPlayerProfileEffectiveStatusFromSnapshot,
  getPlayerProfileMedicalSnapshot,
  getPlayerProfileOption,
  isCurrentPlatformUserAdmin,
  isProfileModalOpen,
  normalizePlayerProfileTab,
  playerProfileCareerPhaseOptions = [],
  playerProfileIdpStatusOptions = [],
  playerProfilePreferredSideOptions = [],
  playerProfileRoleGroupOptions = [],
  playerProfileRosterTypeOptions = [],
  playerProfileSquadStatusOptions = [],
  playerProfileStatusOptions = [],
  playerProfileTabOptions = [],
  playerProfileCountsInSquad,
  renderPlayerProfileAvatarUpload,
  renderPlayerProfileFuturePanel,
  renderPlayerProfileHistoryPanel,
  renderPlayerProfileMedicalPanel,
  renderPlayerProfileOptionSet,
  renderPlayerProfileRoleOptions,
  renderPlayerProfileSecondaryRoleOptions,
  renderPlayerProfileStatusChip,
  renderPlayerProfileTabs,
} = {}) {
  const renderSelectedPanel = (player) => {
    if (!player) {
      return `
      <aside class="squad-player-workbench">
        <article class="squad-profile-section">
          <p>Player Profile</p>
          <h2>Select a player</h2>
        </article>
      </aside>
    `;
    }
    const canEdit = canEditPlayerProfiles();
    const activeTab = normalizePlayerProfileTab(getActiveTab());
    const activeTabTitle = getPlayerProfileOption(playerProfileTabOptions, activeTab).label;
    const medicalSnapshot = getPlayerProfileMedicalSnapshot(player.id);
    const effectiveStatus = getPlayerProfileEffectiveStatusFromSnapshot(player, medicalSnapshot);
    const isSquadPlayer = playerProfileCountsInSquad(player);
    const rosterTypeField = `
            <label class="squad-tab-field-overview">
              <span>Roster type</span>
              <select name="rosterType" ${canEdit ? "" : "disabled"}>
                ${renderPlayerProfileOptionSet(playerProfileRosterTypeOptions, player.rosterType)}
              </select>
            </label>
          `;
    const temporaryRosterFields = isSquadPlayer
      ? ""
      : `
            <label class="squad-tab-field-overview">
              <span>Temporary group</span>
              <input name="temporaryGroup" value="${escapeHtml(player.temporaryGroup)}" placeholder="Academy Training Group" ${canEdit ? "" : "disabled"} />
            </label>
            <label class="squad-tab-field-overview">
              <span>Temporary from</span>
              <input name="temporaryFrom" type="date" value="${escapeHtml(player.temporaryFrom)}" ${canEdit ? "" : "disabled"} />
            </label>
            <label class="squad-tab-field-overview">
              <span>Temporary to</span>
              <input name="temporaryTo" type="date" value="${escapeHtml(player.temporaryTo)}" ${canEdit ? "" : "disabled"} />
            </label>
          `;
    return `
    <aside class="squad-player-workbench" data-active-tab="${escapeHtml(activeTab)}" aria-label="Selected player profile">
      <article class="squad-profile-identity">
        <header>
          ${renderPlayerProfileAvatarUpload(player, canEdit)}
          <div>
            <p>Player Profile</p>
            <h2>${escapeHtml(player.name)}</h2>
            <span>${escapeHtml([player.number ? `#${player.number}` : "", player.position || "Position not set"].filter(Boolean).join(" - "))}</span>
          </div>
          ${renderPlayerProfileStatusChip(effectiveStatus, medicalSnapshot)}
        </header>
      </article>
      ${renderPlayerProfileTabs()}
      <article class="squad-profile-section squad-editor-section">
        <header class="squad-section-head">
          <div>
            <p>${escapeHtml(activeTabTitle)}</p>
            <h2>${escapeHtml(activeTab === "roles" ? "Role Suitability" : activeTab === "idp" ? "Player Development Status" : activeTab === "performance" ? "Performance Record" : activeTab === "notes" ? "Staff Notes" : "Planning Profile")}</h2>
          </div>
        </header>
        <form id="playerProfileEditForm" class="squad-profile-form">
          <input type="hidden" name="playerId" value="${escapeHtml(player.id)}" />
          <div class="squad-form-grid squad-core-grid">
            <label class="squad-tab-field-overview">
              <span>Name</span>
              <input name="name" value="${escapeHtml(player.name)}" ${canEdit ? "required" : "disabled"} />
            </label>
            <label class="squad-tab-field-overview">
              <span>Number</span>
              <input name="number" value="${escapeHtml(player.number)}" ${canEdit ? "" : "disabled"} />
            </label>
            <label class="squad-tab-field-overview">
              <span>Birth date</span>
              <input name="birthDate" type="date" value="${escapeHtml(getPlayerProfileDisplayBirthDateValue(player))}" ${canEdit ? "" : "disabled"} />
            </label>
            <label class="squad-tab-field-overview">
              <span>Position</span>
              <input name="position" value="${escapeHtml(player.position)}" ${canEdit ? "" : "disabled"} />
            </label>
            <label class="squad-tab-field-overview">
              <span>Role group</span>
              <select name="roleGroup" ${canEdit ? "" : "disabled"}>
                ${renderPlayerProfileOptionSet(playerProfileRoleGroupOptions, player.roleGroup)}
              </select>
            </label>
            <label class="squad-tab-field-overview">
              <span>Availability status</span>
              <select name="status" ${canEdit ? "" : "disabled"}>
                ${renderPlayerProfileOptionSet(playerProfileStatusOptions, player.status)}
              </select>
            </label>
            ${rosterTypeField}
            <label class="squad-tab-field-roles">
              <span>Primary role</span>
              <select name="primaryRole" ${canEdit ? "" : "disabled"}>
                ${renderPlayerProfileRoleOptions(player.primaryRole)}
              </select>
            </label>
            <label class="squad-tab-field-roles">
              <span>Secondary roles</span>
              <select name="secondaryRoles" multiple size="5" ${canEdit ? "" : "disabled"}>
                ${renderPlayerProfileSecondaryRoleOptions(player.secondaryRoles)}
              </select>
            </label>
            <label class="squad-tab-field-roles">
              <span>Preferred side</span>
              <select name="preferredSide" ${canEdit ? "" : "disabled"}>
                ${renderPlayerProfileOptionSet(playerProfilePreferredSideOptions, player.preferredSide)}
              </select>
            </label>
            ${temporaryRosterFields}
          </div>
          <section class="squad-idp-editor squad-tab-panel-idp">
            <header class="squad-section-head">
              <div>
                <p>IDP</p>
                <h2>Player Development System</h2>
              </div>
              <select name="idpStatus" ${canEdit ? "" : "disabled"} aria-label="IDP status">
                ${renderPlayerProfileOptionSet(playerProfileIdpStatusOptions, player.idp?.status || "active")}
              </select>
            </header>
            <div class="squad-idp-handoff">
              <div>
                <span>Current focus</span>
                <strong>Managed in Player Development</strong>
                <small>Create, edit and review the player's focus inside the Player Development Profile.</small>
              </div>
              <a class="squad-idp-system-link" href="?workspace=idp">Open Player Development</a>
            </div>
            <div class="squad-idp-status-note">
              Squad Room only controls whether the player's IDP is active or paused. Development focus, observations and reviews are stored centrally in Player Development.
            </div>
          </section>
          <section class="squad-data-editor squad-tab-panel-performance">
            <header class="squad-section-head">
              <div>
                <p>Reports</p>
                <h2>Performance / Scouting Notes</h2>
              </div>
            </header>
            <div class="squad-form-grid">
              <label>
                <span>Performance notes</span>
                <textarea name="performanceNotes" rows="3" ${canEdit ? "" : "disabled"}>${escapeHtml(player.futureData.performanceNotes)}</textarea>
              </label>
              <label>
                <span>Scouting / analysis notes</span>
                <textarea name="scoutingNotes" rows="3" ${canEdit ? "" : "disabled"}>${escapeHtml(player.futureData.scoutingNotes)}</textarea>
              </label>
            </div>
          </section>
          <section class="squad-notes-editor squad-tab-panel-notes">
            <header class="squad-section-head">
              <div>
                <p>Notes</p>
                <h2>Staff Notes</h2>
              </div>
            </header>
            <div class="squad-form-grid">
              <label class="squad-form-wide">
                <span>Coach notes</span>
                <textarea name="coachNotes" rows="4" ${canEdit ? "" : "disabled"}>${escapeHtml(player.coachNotes || "")}</textarea>
              </label>
              <label class="squad-form-wide">
                <span>Analysis notes</span>
                <textarea name="analysisNotes" rows="4" ${canEdit ? "" : "disabled"}>${escapeHtml(player.futureData.analysisNotes || "")}</textarea>
              </label>
            </div>
          </section>
          ${isCurrentPlatformUserAdmin() ? `<div class="squad-form-actions"><button type="button" class="squad-danger-button" data-player-profile-remove="${escapeHtml(player.id)}">Remove</button></div>` : ""}
        </form>
      </article>
      ${activeTab === "medical" ? renderPlayerProfileMedicalPanel(player) : ""}
      ${activeTab === "performance" ? renderPlayerProfileFuturePanel(player) : ""}
      ${activeTab === "history" ? renderPlayerProfileHistoryPanel(player) : ""}
    </aside>
  `;
  };

  const renderModal = (player) => {
    if (!isProfileModalOpen() || !player) {
      return "";
    }
    return `
    <div class="squad-profile-modal-overlay" data-player-profile-modal-overlay>
      <div
        class="squad-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label="${escapeHtml(`${player.name} player profile`)}"
      >
        <button
          type="button"
          class="squad-profile-modal-close"
          data-player-profile-modal-close
          aria-label="Close player profile"
        >
          &times;
        </button>
        <div class="squad-profile-modal-body">${renderSelectedPanel(player)}</div>
      </div>
    </div>
  `;
  };

  return {
    renderSelectedPanel,
    renderModal,
  };
}
