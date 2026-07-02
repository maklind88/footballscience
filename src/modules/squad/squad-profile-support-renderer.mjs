import { createSquadPlayerHistoryTimeline } from "./squad-player-history-timeline.mjs";

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
  formatMedicalDateLabel = (value) => String(value || ""),
  getActiveTab,
  getMedicalPlayerInjuryPlans = () => [],
  getMedicalPlayerRecords = () => [],
  getMedicalRecordStatus = () => ({ label: "" }),
  getMedicalRtpPhaseOption = () => ({ label: "" }),
  getPlayerProfileChangeLog,
  getPlayerProfileMedicalSnapshot,
  getRecentPlayerProfileChangeLog,
  isNewPlayerModalOpen,
  canEditPlayerProfiles,
  playerProfileRoleOptions = [],
  playerProfileRosterTypeOptions = [],
  playerProfileTabOptions = [],
  resolvePlayerWorkActorLabel = (_actorId, fallback = "Football Science") => fallback,
} = {}) {
  const formatHistoryTime = (value) =>
    typeof formatPlayerProfileChangeTime === "function" ? formatPlayerProfileChangeTime(value) : String(value || "");

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
    const trainingAvailability = snapshot.trainingAvailability || {};
    const renderAvailabilityValue = (item = {}) => (Number.isFinite(Number(item.average)) ? `${Number(item.average)}%` : "--");
    const trainingAvailabilityMarkup = trainingAvailability.hasData
      ? `<strong>7d ${escapeHtml(renderAvailabilityValue(trainingAvailability.week))} · 30d ${escapeHtml(renderAvailabilityValue(trainingAvailability.month))} · Season ${escapeHtml(renderAvailabilityValue(trainingAvailability.season))}</strong>
          <small>${escapeHtml(trainingAvailability.loggedCount)} logged training decision${trainingAvailability.loggedCount === 1 ? "" : "s"}</small>`
      : `<strong>No training data yet</strong>
          <small>Log Medical recommendations to build 7d, 30d and season trends.</small>`;
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
        <div class="squad-training-availability-card">
          <span>Training availability</span>
          ${trainingAvailabilityMarkup}
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

  const renderHistoryRows = (entries = []) => {
    if (!entries.length) {
      return `<p class="squad-change-empty">No player work has been recorded yet.</p>`;
    }
    return entries
      .map(
        (entry) => `
      <article class="squad-change-row squad-work-history-row">
        <header>
          <div>
            <strong>${escapeHtml(entry.title || "Player work updated")}</strong>
            <span>${escapeHtml(entry.module || "Player")} · ${escapeHtml(entry.actor || "Football Science")} · ${escapeHtml(formatHistoryTime(entry.createdAt))}</span>
          </div>
          <em>${escapeHtml(entry.typeLabel || "update")}</em>
        </header>
        ${
          entry.summary
            ? `<p class="squad-work-history-summary">${escapeHtml(entry.summary)}</p>`
            : ""
        }
        ${
          entry.details.length
            ? `<div class="squad-change-diff">
${entry.details
  .slice(0, 8)
  .map(
    (detail) => `
                    <span>
                      <b>${escapeHtml(detail.label)}</b>
                      <small>${escapeHtml(detail.value)}</small>
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
    const playerEntries = createSquadPlayerHistoryTimeline({
      player,
      profileChanges: getPlayerProfileChangeLog(player.id),
      medicalRecords: getMedicalPlayerRecords(player.id, { includeArchived: true }),
      medicalPlans: getMedicalPlayerInjuryPlans(player.id, { includeArchived: true }),
      getMedicalRecordStatus,
      getMedicalRtpPhaseOption,
      formatMedicalDateLabel,
      resolveActorLabel: resolvePlayerWorkActorLabel,
    });
    return `
    <article class="squad-profile-section squad-change-history">
      <header class="squad-section-head">
        <div>
          <p>Player Timeline</p>
          <h2>Player Work History</h2>
        </div>
      </header>
      <div class="squad-change-history-grid squad-change-history-grid-single">
        <section>
          <h3>${escapeHtml(player.name)}</h3>
          <div class="squad-change-list">
            ${renderHistoryRows(playerEntries)}
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
    renderChangeLogRows: renderHistoryRows,
    renderHistoryRows,
    renderHistoryPanel,
    renderTabs,
    renderNewPlayerCard,
    renderNewPlayerModal,
  };
}
