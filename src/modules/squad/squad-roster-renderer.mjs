const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createSquadRosterRenderer({
  escapeHtml = defaultEscapeHtml,
  getAllPlayerProfiles = () => [],
  getAllTemporaryPlayerProfiles,
  getPlayerProfileCompleteness,
  getPlayerProfileDisplayAgeValue,
  getPlayerProfileEffectiveStatusFromSnapshot,
  getPlayerProfileIdpFollowUpLabel,
  getPlayerProfileMedicalSnapshot,
  getPlayerProfileOption,
  getPlayerProfileRosterLabel,
  getPlayerProfileRosterSummary,
  getPlayerProfileRosterTypeOption,
  getPlayerProfileTemporaryWindowLabel,
  getSelectedPlayerId,
  getTemporarySectionCollapsed = () => true,
  isTemporaryPlayerProfile,
  playerProfileCountsInSquad,
  playerProfileIdpStatusOptions = [],
  playerProfileStatusOptions = [],
  renderPlayerProfileAvatar,
} = {}) {
  const renderStatusChip = (statusKey, medicalSnapshot = null) => {
    const option = getPlayerProfileOption(playerProfileStatusOptions, statusKey, playerProfileStatusOptions[0]);
    const returnLabel = statusKey === "injured" ? String(medicalSnapshot?.returnLabel || "").trim() : "";
    const statusPill = `<span class="squad-status-pill is-${escapeHtml(option.tone)}">${escapeHtml(option.label)}</span>`;
    if (!returnLabel) {
      return statusPill;
    }
    return `
    <span class="squad-status-stack" title="${escapeHtml(`${option.label} - ${returnLabel}`)}">
      ${statusPill}
      <small class="squad-return-date">${escapeHtml(returnLabel)}</small>
    </span>
  `;
  };

  const renderRoleStack = (player) => {
    const roles = [player.primaryRole, ...player.secondaryRoles].filter(Boolean);
    return `
    <div class="squad-role-stack">
      ${roles.slice(0, 4).map((role, index) => `<span class="${index === 0 ? "is-primary" : ""}">${escapeHtml(role)}</span>`).join("")}
    </div>
  `;
  };

  const renderRosterMeta = (player) => {
    if (!isTemporaryPlayerProfile(player)) {
      return "";
    }
    const rosterLabel =
      String(
        getPlayerProfileRosterLabel(player) ||
          getPlayerProfileRosterTypeOption(player.rosterType).label ||
          getPlayerProfileRosterTypeOption(player.rosterType).shortLabel ||
          "Temporary",
      ).trim() ||
      "Temporary";
    const windowLabel = getPlayerProfileTemporaryWindowLabel(player);
    return `
    <small class="squad-player-temporary-meta">
      ${escapeHtml(rosterLabel)}
      ${windowLabel ? ` / ${escapeHtml(windowLabel)}` : ""}
    </small>
  `;
  };

  const renderRoleCell = (player) => `<div class="squad-role-cell">${renderRoleStack(player)}</div>`;

  const renderAgeCell = (player) => {
    const age = getPlayerProfileDisplayAgeValue(player);
    return `<span class="squad-age-cell">${escapeHtml(age || "-")}</span>`;
  };

  const renderIdpCell = (player) => {
    const statusOption = getPlayerProfileOption(playerProfileIdpStatusOptions, player.idp?.status || "none", playerProfileIdpStatusOptions[0]);
    const detail = getPlayerProfileIdpFollowUpLabel(player, statusOption);
    return `
    <div class="squad-idp-cell">
      <span class="squad-option-pill is-idp-${escapeHtml(statusOption.key)}">${escapeHtml(statusOption.label)}</span>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
  };

  const renderProfileProgressCell = (completeness) =>
    `<div class="squad-profile-progress-cell"><span class="squad-completion"><span style="width: ${completeness}%"></span></span><small class="squad-completion-label">${completeness}% complete</small></div>`;

  const renderPlayerRow = (player) => {
    const medicalSnapshot = getPlayerProfileMedicalSnapshot(player.id);
    const effectiveStatus = getPlayerProfileEffectiveStatusFromSnapshot(player, medicalSnapshot);
    const isSelected = player.id === getSelectedPlayerId();
    const completeness = getPlayerProfileCompleteness(player);
    return `
    <tr
      class="squad-player-row${isSelected ? " is-selected" : ""}${isTemporaryPlayerProfile(player) ? " is-temporary" : ""}"
      data-player-profile-select="${escapeHtml(player.id)}"
      tabindex="0"
    >
      <td>
        <div class="squad-player-cell">
          ${renderPlayerProfileAvatar(player, "squad-player-avatar")}
          <div>
            <strong>${escapeHtml(player.name)}</strong>
            <small>${escapeHtml([player.number ? `#${player.number}` : "", player.position || "Position not set"].filter(Boolean).join(" - "))}</small>
            ${renderRosterMeta(player)}
          </div>
        </div>
      </td>
      <td>${renderAgeCell(player)}</td>
      <td>${renderRoleCell(player)}</td>
      <td>${renderStatusChip(effectiveStatus, medicalSnapshot)}</td>
      <td>${renderIdpCell(player)}</td>
      <td>${renderProfileProgressCell(completeness)}</td>
    </tr>
  `;
  };

  const renderPlayerTable = (players = [], emptyText = "No players found. Adjust search or role group filter.") => `
    <div class="squad-table-wrap">
      <table class="squad-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Age</th>
            <th>Roles</th>
            <th>Status</th>
            <th>IDP</th>
            <th>Profile</th>
          </tr>
        </thead>
        <tbody>
          ${
            players.length
              ? players.map(renderPlayerRow).join("")
              : `<tr><td colspan="6"><div class="squad-empty-row">${escapeHtml(emptyText)}</div></td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  const renderRosterSection = (section = {}) => {
    const players = Array.isArray(section.players) ? section.players : [];
    const key = section.key || "squad";
    const isCollapsed = Boolean(section.collapsed);
    const toggleLabel = isCollapsed ? `Show ${players.length}` : "Hide";
    return `
    <section class="squad-roster-section is-${escapeHtml(key)}${isCollapsed ? " is-collapsed" : ""}" data-squad-roster-section="${escapeHtml(key)}">
      <header class="squad-roster-section-head">
        <div>
          <h2>${escapeHtml(section.title || "Squad")}</h2>
          <span>${escapeHtml(section.subtitle || `${players.length} visible`)}</span>
        </div>
        ${
          section.collapsible
            ? `<button type="button" class="squad-roster-pill is-temporary squad-roster-section-toggle" style="margin-left:auto;border:0;cursor:pointer;" data-squad-temporary-toggle aria-expanded="${isCollapsed ? "false" : "true"}">${escapeHtml(toggleLabel)}</button>`
            : ""
        }
      </header>
      ${isCollapsed ? "" : renderPlayerTable(players, section.emptyText)}
    </section>
  `;
  };

  const getRosterListSummary = (visibleSummary = {}, rosterSummary = {}) => {
    return `${visibleSummary.squadCount || 0}/${rosterSummary.squadCount || 0} squad`;
  };

  const renderRosterSections = (visiblePlayers = [], summaries = {}) => {
    const rosterSummary = summaries.rosterSummary || getPlayerProfileRosterSummary(getAllPlayerProfiles());
    const visibleSummary = summaries.visibleSummary || getPlayerProfileRosterSummary(visiblePlayers);
    const listSummary = getRosterListSummary(visibleSummary, rosterSummary);
    const squadPlayers = visiblePlayers.filter(playerProfileCountsInSquad);
    const temporaryPlayers = getAllTemporaryPlayerProfiles();
    if (!squadPlayers.length && !temporaryPlayers.length) {
      return renderRosterSection({
        key: "empty",
        title: "Squad List",
        subtitle: listSummary,
        players: [],
        emptyText: "No players found. Adjust search or role group filter.",
      });
    }
    return [
      squadPlayers.length
        ? renderRosterSection({
            key: "squad",
            title: "Squad List",
            subtitle: listSummary,
            players: squadPlayers,
          })
        : "",
      temporaryPlayers.length
        ? renderRosterSection({
            key: "temporary",
            title: "Training guests",
            subtitle: `${temporaryPlayers.length} not counted in squad total`,
            players: temporaryPlayers,
            collapsible: true,
            collapsed: getTemporarySectionCollapsed(),
          })
        : "",
    ].join("");
  };

  return {
    renderStatusChip,
    renderRoleStack,
    renderRosterMeta,
    renderRoleCell,
    renderAgeCell,
    renderIdpCell,
    renderProfileProgressCell,
    renderPlayerRow,
    renderPlayerTable,
    renderRosterSection,
    getRosterListSummary,
    renderRosterSections,
  };
}
