function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultNoop() {
  return "";
}

function defaultPlayerBoardState() {
  return {
    playerBoardOpen: false,
    selectedPlayerIds: [],
    formationInput: "",
    teamCount: 2,
    autoMode: "balanced",
    assistantOpen: false,
    customPersonEditor: null,
    selectedDate: "",
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createOptionArrayGetter(value, fallback = []) {
  if (typeof value === "function") {
    return () => normalizeArray(value());
  }
  return () => normalizeArray(value).length ? normalizeArray(value) : fallback;
}

export function createSessionPlannerPlayerBoardRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getState = typeof options.getState === "function" ? options.getState : defaultPlayerBoardState;
  const getPlayerProfileRoleOptions = createOptionArrayGetter(options.playerProfileRoleOptions, []);
  const getPositionGroups = createOptionArrayGetter(options.positionGroups, []);
  const getColorOptions = createOptionArrayGetter(options.colorOptions, []);
  const getAutoModeOptions = createOptionArrayGetter(options.autoModeOptions, []);
  const getMaxTeamCount = typeof options.maxTeamCount === "function"
    ? () => Number(options.maxTeamCount()) || Math.max(1, getColorOptions().length)
    : () => Number(options.maxTeamCount) || Math.max(1, getColorOptions().length);
  const getBridgeSummary = typeof options.getBridgeSummary === "function" ? options.getBridgeSummary : () => ({ linkedCount: 0, totalCount: 0, temporaryCount: 0, roleDnaCount: 0, roleSummary: "", linkedItems: [] });
  const getBridgeBestMatches = typeof options.getBridgeBestMatches === "function" ? options.getBridgeBestMatches : () => [];
  const getBridgeContract = typeof options.getBridgeContract === "function" ? options.getBridgeContract : () => null;
  const getBridgeRoleLabel = typeof options.getBridgeRoleLabel === "function" ? options.getBridgeRoleLabel : () => "";
  const buildSelectionAssistant = typeof options.buildSelectionAssistant === "function" ? options.buildSelectionAssistant : () => ({ profile: { label: "Selection Assistant", detail: "", roles: [] }, suggestions: [], selectedRoleCoverage: [], missingRoles: [] });
  const getPlayerBoardWarnings = typeof options.getPlayerBoardWarnings === "function" ? options.getPlayerBoardWarnings : () => ({ rule: { label: "Availability", valueLabel: "available" }, available: [], belowLimit: [], unavailable: [], unconfirmed: [], hasWarnings: false });
  const formatPlayerWarningNames = typeof options.formatPlayerWarningNames === "function" ? options.formatPlayerWarningNames : () => "No players";
  const getSelectedColorIds = typeof options.getSelectedColorIds === "function" ? options.getSelectedColorIds : () => [];
  const getSelectedBlock = typeof options.getSelectedBlock === "function" ? options.getSelectedBlock : () => null;
  const getPlayerBoardPlayers = typeof options.getPlayerBoardPlayers === "function" ? options.getPlayerBoardPlayers : () => [];
  const normalizeTeamCount = typeof options.normalizeTeamCount === "function" ? options.normalizeTeamCount : (value) => Number(value) || 1;
  const normalizeAutoMode = typeof options.normalizeAutoMode === "function" ? options.normalizeAutoMode : (value) => String(value || "balanced");
  const getPlayerBoardTextColor = typeof options.getPlayerBoardTextColor === "function" ? options.getPlayerBoardTextColor : () => "#1d1d1f";
  const getPlayerBoardSummary = typeof options.getPlayerBoardSummary === "function" ? options.getPlayerBoardSummary : () => ({ boardPlayers: [], rule: { label: "Availability", valueLabel: "available" }, temporaryBoardCount: 0, belowLimitCount: 0, hiddenZeroCount: 0, unconfirmedCount: 0 });
  const getInitialLabelMap = typeof options.getInitialLabelMap === "function" ? options.getInitialLabelMap : () => new Map();
  const getReadablePlayerBoardPositions = typeof options.getReadablePlayerBoardPositions === "function" ? options.getReadablePlayerBoardPositions : () => new Map();
  const getReadableSpacing = typeof options.getReadableSpacing === "function" ? options.getReadableSpacing : () => ({});
  const getPlayerBoardPosition = typeof options.getPlayerBoardPosition === "function" ? options.getPlayerBoardPosition : () => ({ x: 50, y: 50 });
  const getPlayerBoardTone = typeof options.getPlayerBoardTone === "function" ? options.getPlayerBoardTone : () => "full";
  const getPlayerBoardCustomColor = typeof options.getPlayerBoardCustomColor === "function" ? options.getPlayerBoardCustomColor : () => "";
  const getPlayerBoardColorStyle = typeof options.getPlayerBoardColorStyle === "function" ? options.getPlayerBoardColorStyle : () => "";
  const isTemporaryPlayer = typeof options.isTemporaryPlayer === "function" ? options.isTemporaryPlayer : () => false;
  const getRosterLabel = typeof options.getRosterLabel === "function" ? options.getRosterLabel : () => "Squad player";
  const getPlayerInitials = typeof options.getPlayerInitials === "function" ? options.getPlayerInitials : () => "?";
  const getPlayerBoardCustomPerson = typeof options.getPlayerBoardCustomPerson === "function" ? options.getPlayerBoardCustomPerson : () => null;
  const getSourceBlocks = typeof options.getSourceBlocks === "function" ? options.getSourceBlocks : () => [];
  const getSourceLabel = typeof options.getSourceLabel === "function" ? options.getSourceLabel : () => "Block";
  const getDataObject = typeof options.getDataObject === "function" ? options.getDataObject : (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const syncSelection = typeof options.syncSelection === "function" ? options.syncSelection : () => null;
  const normalizeActualParticipation = typeof options.normalizeActualParticipation === "function" ? options.normalizeActualParticipation : (value) => value;
  const medicalActualParticipationFallback = options.medicalActualParticipationFallback ?? "not-logged";
  const getRtpPhaseOption = typeof options.getRtpPhaseOption === "function" ? options.getRtpPhaseOption : () => ({ label: "Not set" });
  const getCoachComment = typeof options.getCoachComment === "function" ? options.getCoachComment : () => "";
  const formatDateLabel = typeof options.formatDateLabel === "function" ? options.formatDateLabel : (value) => String(value || "");
  const renderPlayerAvatar = typeof options.renderPlayerAvatar === "function" ? options.renderPlayerAvatar : defaultNoop;

function renderSessionPlannerSquadBridgeStrip(boardPlayers = []) {
const summary = getBridgeSummary(boardPlayers);
if (!summary.totalCount) {
return "";
}
return `
    <div class="session-squad-bridge-strip">
      <span>Squad Bridge</span>
      <strong>${summary.linkedCount}/${summary.totalCount} linked</strong>
      <small>${escapeHtml(`${summary.roleSummary || "No Squad role data yet"}${summary.temporaryCount ? ` / ${summary.temporaryCount} temporary` : ""}`)}</small>
    </div>
  `;
}
function renderSessionPlannerSquadBridgePanel(boardPlayers = []) {
const summary = getBridgeSummary(boardPlayers);
const topMatches = summary.linkedItems
.map((item) => ({
item,
matches: getBridgeBestMatches(item.player, 2),
}))
.filter((entry) => entry.matches.length)
.slice(0, 6);
return `
    <section class="session-squad-bridge-panel" aria-label="Squad Bridge">
      <header>
        <div>
          <span>Squad Bridge</span>
          <strong>Read-only Player Profiles</strong>
        </div>
        <small>${summary.linkedCount}/${summary.totalCount} linked from Squad</small>
      </header>
      <div class="session-squad-bridge-metrics">
        <span><strong>${summary.linkedCount}</strong><small>Linked</small></span>
        <span><strong>${summary.roleDnaCount}</strong><small>Role DNA</small></span>
        <span><strong>${summary.temporaryCount}</strong><small>Temporary</small></span>
        <span><strong>${summary.totalCount - summary.linkedCount}</strong><small>Fallback</small></span>
      </div>
      <div class="session-squad-bridge-role-list">
        ${
          topMatches.length
            ? topMatches
                .map(({ item, matches }) => `
<button type="button" data-session-squad-bridge-player="${escapeHtml(item.player.id)}">
<strong>${escapeHtml(item.player.name)}</strong>
<span>${matches.map((match) => `${match.role} ${match.score}%`).join(" / ")}</span>
</button>
`)
                .join("")
            : `<span class="session-squad-bridge-empty">Squad profiles will appear here when players are linked.</span>`
        }
      </div>
    </section>
  `;
}
function renderSessionPlannerPlayerBoardSquadProfile(contract) {
if (!contract) {
return `
      <div class="session-player-board-profile-squad is-empty">
        <span>Squad Bridge</span>
        <p>No linked Squad profile yet. Session Planner is using the existing medical/player fallback.</p>
      </div>
    `;
}
const bestMatches = Object.entries(contract.roleFit || {})
.filter(([role, score]) => getPlayerProfileRoleOptions().includes(role) && Number.isFinite(Number(score)))
.sort((first, second) => Number(second[1]) - Number(first[1]))
.slice(0, 4);
const secondaryRoles = Array.isArray(contract.secondaryRoles) ? contract.secondaryRoles : [];
return `
    <div class="session-player-board-profile-squad">
      <span>Squad Bridge</span>
      <div class="session-player-board-squad-roles">
        <strong>${escapeHtml(contract.primaryRole || "No primary role")}</strong>
        <small>${escapeHtml(secondaryRoles.length ? secondaryRoles.join(" / ") : "No secondary roles")}</small>
      </div>
      <div class="session-player-board-squad-fit">
        ${bestMatches
          .map(([role, score]) => `
<span>
<strong>${escapeHtml(role)}</strong>
<small>${Math.round(Number(score))}%</small>
</span>
`)
          .join("")}
      </div>
      <p>${escapeHtml(contract.idp?.primaryFocus || "No IDP focus set for this player.")}</p>
    </div>
  `;
}
function renderSessionPlannerSelectionAssistantPanel(block, boardPlayers = [], options = {}) {
const assistant = buildSelectionAssistant(block, boardPlayers);
if (!boardPlayers.length) {
return "";
}
const withCloseButton = Boolean(options.withCloseButton);
return `
    <section class="session-selection-assistant-panel" aria-label="Selection Assistant">
      <header>
        <div>
          <span>Selection Assistant</span>
          <strong>${escapeHtml(assistant.profile.label)}</strong>
          <small>${escapeHtml(assistant.profile.detail)}</small>
        </div>
        <div class="session-selection-assistant-actions">
          <button
            type="button"
            data-session-selection-assistant-apply
            ${assistant.suggestions.length ? "" : "disabled"}
          >Select ${assistant.suggestions.length}</button>
          ${
            withCloseButton
              ? `<button type="button" class="session-selection-assistant-close" data-session-selection-assistant-close>Close</button>`
              : ""
          }
        </div>
      </header>
      <div class="session-selection-assistant-coverage">
        ${assistant.selectedRoleCoverage
          .map((entry) => `
<span class="${entry.covered ? "is-covered" : "is-missing"}">
<strong>${escapeHtml(entry.role)}</strong>
<small>${entry.covered ? `${entry.score}%` : "gap"}</small>
</span>
`)
          .join("")}
      </div>
      <div class="session-selection-assistant-list">
        ${assistant.suggestions
          .slice(0, 8)
          .map((suggestion, index) => `
<button
type="button"
data-session-squad-bridge-player="${escapeHtml(suggestion.item.player.id)}"
>
<b>${index + 1}</b>
<span>
<strong>${escapeHtml(suggestion.item.player.name)}</strong>
<small>${escapeHtml(suggestion.reason)}</small>
</span>
<em>${suggestion.score}%</em>
</button>
`)
          .join("")}
      </div>
      ${
        assistant.missingRoles.length
          ? `<p class="session-selection-assistant-note">Coverage gaps: ${escapeHtml(assistant.missingRoles.map((entry) => entry.role).join(", "))}</p>`
          : `<p class="session-selection-assistant-note is-clear">Role coverage looks balanced for this block.</p>`
      }
    </section>
  `;
}
function renderSessionPlannerSelectionAssistantOverlay(block, boardPlayers = []) {
if (!getState().assistantOpen || !boardPlayers.length) {
return "";
}
return `
    <div class="session-selection-assistant-overlay" data-session-selection-assistant-overlay>
      <section class="session-selection-assistant-dialog" role="dialog" aria-modal="true" aria-label="Selection Assistant">
        ${renderSessionPlannerSquadBridgePanel(boardPlayers)}
        ${renderSessionPlannerSelectionAssistantPanel(block, boardPlayers, { withCloseButton: true })}
      </section>
    </div>
  `;
}
function renderSessionPlannerPlayerBoardWarnings(block, options = {}) {
const warnings = getPlayerBoardWarnings(block, getState().selectedDate);
if (!warnings.hasWarnings && options.compact) {
return "";
}
const rows = [
{
key: "below",
label: `Below ${warnings.rule.valueLabel}`,
count: warnings.belowLimit.length,
detail: formatPlayerWarningNames(warnings.belowLimit),
},
{
key: "out",
label: "0% unavailable",
count: warnings.unavailable.length,
detail: formatPlayerWarningNames(warnings.unavailable),
},
{
key: "unset",
label: "Not set",
count: warnings.unconfirmed.length,
detail: formatPlayerWarningNames(warnings.unconfirmed),
},
].filter((row) => row.count > 0);
if (!rows.length) {
return `
      <div class="session-player-board-warnings is-clear">
        <strong>${escapeHtml(warnings.available.length)} match block rule</strong>
        <span>${escapeHtml(warnings.rule.label)} / ${escapeHtml(warnings.rule.valueLabel)}</span>
      </div>
    `;
}
return `
    <div class="session-player-board-warnings${options.compact ? " is-compact" : ""}">
      ${rows
        .map(
          (row) => `
<div class="session-player-board-warning-row is-${escapeHtml(row.key)}">
<strong>${row.count}</strong>
<span>${escapeHtml(row.label)}</span>
<small>${escapeHtml(row.detail)}</small>
</div>
`
        )
        .join("")}
    </div>
  `;
}
function renderSessionPlannerPlayerBoardLines() {
return `
    <div class="session-player-board-lines" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
}
function renderSessionPlannerPlayerBoardPositionLabels() {
return `
    <div class="session-player-board-position-labels" aria-hidden="true">
      ${getPositionGroups()
        .map(
          (group) => `
<span style="left: ${group.x}%;">
<strong>${escapeHtml(group.shortLabel)}</strong>
<small>${escapeHtml(group.label)}</small>
</span>
`
        )
        .join("")}
    </div>
  `;
}
function renderSessionPlannerPlayerBoardToken(item, index, block, total, labelMap, selectedPlayerIds = new Set(), boardPlayers = []) {
const position = getPlayerBoardPosition(block, item, index, boardPlayers);
const tone = getPlayerBoardTone(item.participation);
const label = labelMap.get(item.player.id) ?? getPlayerInitials(item.player);
const customColor = getPlayerBoardCustomColor(block, item.player.id);
const colorStyle = getPlayerBoardColorStyle(customColor);
const bridgeRole = getBridgeRoleLabel(item.player);
const customRole = item.player.playerBoardCustom ? item.player.playerBoardRoleLabel || item.player.position || "" : "";
const secondaryRole = bridgeRole || customRole;
const bridgeTitle = bridgeRole ? ` · Squad role ${bridgeRole}` : "";
const customTitle = item.player.playerBoardCustom ? " · Manual board person" : "";
const temporaryTitle = isTemporaryPlayer(item.player) ? ` · ${getRosterLabel(item.player)}` : "";
return `
    <button
      type="button"
      class="session-player-board-token is-${escapeHtml(tone)}${customColor ? " has-custom-color" : ""}${selectedPlayerIds.has(item.player.id) ? " is-selected" : ""}${isTemporaryPlayer(item.player) ? " is-temporary" : ""}${item.player.playerBoardCustom ? " is-custom-person" : ""}"
      data-session-player-board-token="${escapeHtml(item.player.id)}"
      data-session-player-board-token-kind="${item.player.playerBoardCustom ? "custom" : "roster"}"
      style="left: ${position.x}%; top: ${position.y}%; ${colorStyle}"
      title="${escapeHtml(`${item.player.name} · ${item.participation}%${bridgeTitle}${temporaryTitle}${customTitle}`)}"
      aria-label="${escapeHtml(`${item.player.name}, ${item.participation}% available${bridgeTitle}${temporaryTitle}${customTitle}`)}"
    >
      <strong>${escapeHtml(label)}</strong>
      ${secondaryRole ? `<span>${escapeHtml(secondaryRole)}</span>` : ""}
    </button>
  `;
}
function renderSessionPlannerPlayerBoardProfile(item, block, rule, totalPlayers) {
if (!item) {
return `
      <aside class="session-player-board-profile">
        <div class="session-player-board-profile-empty">
          <strong>No players for this block</strong>
          <span>Add medical availability for this date to place players on the board.</span>
        </div>
      </aside>
    `;
}
const { player, record, status, participation } = item;
const actualParticipation = normalizeActualParticipation(record?.actualParticipation ?? medicalActualParticipationFallback);
const actualLabel = actualParticipation === medicalActualParticipationFallback ? "Not logged" : `${actualParticipation}%`;
const rtpPhase = record?.rtpPhase ? getRtpPhaseOption(record.rtpPhase).label : "Not set";
const coachNote = getCoachComment(record);
const sourceLabel = player.playerBoardCustom
? "Manual board person"
: item.planningOnly
? "Planning guest"
: record?.source === "injury-plan"
? "Availability plan"
: "Daily medical log";
const dateLabel = formatDateLabel(getState().selectedDate, "long");
const squadContract = getBridgeContract(player);
const squadPrimaryRole = squadContract?.primaryRole || getBridgeRoleLabel(player) || "Not linked";
const squadBestMatch = squadContract
? Object.entries(squadContract.roleFit || {})
.filter(([role, score]) => getPlayerProfileRoleOptions().includes(role) && Number.isFinite(Number(score)))
.sort((first, second) => Number(second[1]) - Number(first[1]))[0]
: null;
return `
    <aside class="session-player-board-profile">
      <header class="session-player-board-profile-head">
        ${renderPlayerAvatar(player, "session-player-board-profile-avatar")}
        <div>
          <span>${escapeHtml(sourceLabel)}</span>
          <strong>${escapeHtml(player.name)}</strong>
          <small>${player.number ? `#${escapeHtml(player.number)} / ` : ""}${escapeHtml(player.position || "Position")}</small>
        </div>
      </header>
      <div class="session-player-board-profile-kpis">
        <span>
          <strong>${participation}%</strong>
          <small>Planned today</small>
        </span>
        <span>
          <strong>${escapeHtml(actualLabel)}</strong>
          <small>Actual</small>
        </span>
        <span>
          <strong>${escapeHtml(squadPrimaryRole)}</strong>
          <small>Squad role</small>
        </span>
        <span>
          <strong>${squadBestMatch ? `${Math.round(Number(squadBestMatch[1]))}%` : "Fallback"}</strong>
          <small>Role DNA</small>
        </span>
      </div>
      <dl class="session-player-board-profile-list">
        <div>
          <dt>Status</dt>
          <dd>${escapeHtml(status?.label ?? "Not set")}</dd>
        </div>
        <div>
          <dt>RTP phase</dt>
          <dd>${escapeHtml(rtpPhase)}</dd>
        </div>
        <div>
          <dt>Training date</dt>
          <dd>${escapeHtml(dateLabel)}</dd>
        </div>
        <div>
          <dt>Roster type</dt>
          <dd>${escapeHtml(isTemporaryPlayer(player) ? getRosterLabel(player) : "Squad player")}</dd>
        </div>
        <div>
          <dt>Board rule</dt>
          <dd>${escapeHtml(rule.label)} shows ${escapeHtml(rule.valueLabel)}</dd>
        </div>
        <div>
          <dt>Squad roles</dt>
          <dd>${escapeHtml(
            squadContract
              ? [
                  squadContract.primaryRole,
                  ...(Array.isArray(squadContract.secondaryRoles) ? squadContract.secondaryRoles : []),
                ].filter(Boolean).join(" / ") || "No roles set"
              : "No Squad profile linked"
          )}</dd>
        </div>
        <div>
          <dt>Preferred side</dt>
          <dd>${escapeHtml(squadContract?.preferredSide || "Not set")}</dd>
        </div>
      </dl>
      ${renderSessionPlannerPlayerBoardSquadProfile(squadContract)}
      <div class="session-player-board-profile-note">
        <span>Coach note</span>
        <p>${escapeHtml(coachNote || "No coach note shared.")}</p>
      </div>
      <p class="session-player-board-profile-foot">
        ${escapeHtml(player.name)} is one of ${totalPlayers} player${totalPlayers === 1 ? "" : "s"} visible for this block.
      </p>
    </aside>
  `;
}
function renderSessionPlannerPlayerBoardProfileOverlay(selectedItem, block, rule, totalPlayers) {
if (!selectedItem) {
return "";
}
return `
    <div class="session-player-board-profile-overlay" data-session-player-board-profile-overlay>
      <section class="session-player-board-profile-dialog" role="dialog" aria-modal="true" aria-label="Player availability profile">
        <header class="session-player-board-profile-dialog-head">
          <div>
            <span>Player profile</span>
            <strong>${escapeHtml(selectedItem.player.name)}</strong>
          </div>
          <button type="button" class="session-library-close-button" data-session-close-player-board-profile aria-label="Close player profile">Close</button>
        </header>
        ${renderSessionPlannerPlayerBoardProfile(selectedItem, block, rule, totalPlayers)}
      </section>
    </div>
  `;
}
function renderSessionPlannerPlayerBoardCopyTools(block) {
const sourceBlocks = getSourceBlocks(block);
const selectedCount = getSelectedColorIds().length;
const sourceOptions = sourceBlocks
.map(({ block: sourceBlock, index }) => {
const colors = Object.keys(getDataObject(sourceBlock.playerBoardColors)).length;
const positions = Object.keys(getDataObject(sourceBlock.playerBoardPositions)).length;
const detail = [colors ? `${colors} colours` : "", positions ? `${positions} positions` : ""].filter(Boolean).join(", ");
return `<option value="${escapeHtml(sourceBlock.id)}">${escapeHtml(`${getSourceLabel(sourceBlock, index)}${detail ? ` (${detail})` : ""}`)}</option>`;
})
.join("");
return `
      <form class="session-player-board-copy-tools" data-session-player-board-copy-form>
        <label>
          <span>Copy teams</span>
          <select data-session-player-board-copy-source aria-label="Copy teams from block" ${sourceBlocks.length ? "" : "disabled"}>
            ${sourceBlocks.length ? sourceOptions : `<option value="">No team setup yet</option>`}
          </select>
        </label>
        <button type="submit" class="session-player-board-tool-button is-copy" data-session-player-board-copy-teams ${sourceBlocks.length ? "" : "disabled"}>Copy</button>
	      </form>
        <button
          type="button"
          class="session-player-board-tool-button is-tidy"
          data-session-player-board-tidy-selected
          ${selectedCount > 1 ? "" : "disabled"}
        >
          Tidy selected
        </button>
	  `;
}
function renderSessionPlannerPlayerBoardTools() {
const selectedCount = getSelectedColorIds().length;
const block = getSelectedBlock();
const boardPlayers = getPlayerBoardPlayers(block);
const autoTargetCount = selectedCount || boardPlayers.length;
const teamCount = normalizeTeamCount(getState().teamCount);
const autoMode = normalizeAutoMode(getState().autoMode);
const selectedDisabled = selectedCount ? "" : "disabled";
const playersDisabled = boardPlayers.length ? "" : "disabled";
const teamOptions = Array.from({ length: getMaxTeamCount() }, (_, index) => index + 1)
.map((count) => `<option value="${count}"${count === teamCount ? " selected" : ""}>${count}</option>`)
.join("");
const autoModeOptions = getAutoModeOptions()
.map(
(option) =>
`<option value="${escapeHtml(option.key)}"${option.key === autoMode ? " selected" : ""}>${escapeHtml(option.label)}</option>`
)
.join("");
const colorButtons = getColorOptions()
.map((option) => {
const value = escapeHtml(option.value);
const text = escapeHtml(getPlayerBoardTextColor(option.value));
const label = escapeHtml(option.label);
return `<button type="button" class="session-player-board-color-button" data-session-player-board-color="${value}" style="--session-player-board-color: ${value}; --session-player-board-text: ${text};" title="${label}" aria-label="${escapeHtml(`Set selected players ${option.label}`)}" ${selectedDisabled}></button>`;
})
.join("");
return `
    <div class="session-player-board-tools" data-session-player-board-tools>
	      <form class="session-player-board-team-tools" data-session-player-board-auto-form>
	        <label><span>Teams</span><select data-session-player-board-team-count aria-label="Number of teams">${teamOptions}</select></label>
	        <label><span>Auto</span><select data-session-player-board-auto-mode aria-label="Auto select mode">${autoModeOptions}</select></label>
	        <button type="submit" class="session-player-board-tool-button is-auto" data-session-player-board-auto-select ${autoTargetCount ? "" : "disabled"}>Auto Select</button>
	      </form>
	      <button type="button" class="session-player-board-tool-button is-assistant" data-session-selection-assistant-open ${playersDisabled}>Assistant</button>
	      <form class="session-player-board-formation-tools" data-session-player-board-formation-form>
	        <label class="session-player-board-formation-field">
          <span class="session-player-board-formation-label">Formation</span>
          <small data-session-player-board-selected-count>${selectedCount} selected</small>
          <input type="text" inputmode="numeric" autocomplete="off" value="${escapeHtml(getState().formationInput)}" placeholder="Set formation" aria-label="Set formation, for example 3-3-1" data-session-player-board-formation-input />
        </label>
        <button type="submit" class="session-player-board-tool-button" data-session-player-board-apply-formation ${selectedDisabled}>Place</button>
        <button type="button" class="session-player-board-tool-button is-priority" data-session-player-board-prioritize ${selectedDisabled}>Prioritize</button>
      </form>
      <button type="button" class="session-player-board-tool-button" data-session-player-board-reset-positions ${playersDisabled}>Reset</button>
      <button type="button" class="session-player-board-tool-button" data-session-undo-board="player" ${playersDisabled}>Undo</button>
      <button type="button" class="session-player-board-tool-button" data-session-redo-board="player" ${playersDisabled}>Redo</button>
      <div class="session-player-board-color-tools" aria-label="Player board colours">
        <span>Colour</span>
        ${colorButtons}
        <button type="button" class="session-player-board-tool-button" data-session-player-board-clear-colors ${selectedDisabled}>Clear</button>
      </div>
    </div>
  `;
}
function renderSessionPlannerPlayerBoard(block) {
const { boardPlayers, rule, temporaryBoardCount, belowLimitCount, hiddenZeroCount, unconfirmedCount } = getPlayerBoardSummary(block);
const labelMap = getInitialLabelMap(boardPlayers);
const previewDensityClass =
boardPlayers.length > 28 ? " is-ultra-dense" : boardPlayers.length > 18 ? " is-dense" : "";
const previewPositions = getReadablePlayerBoardPositions(
block,
boardPlayers,
getReadableSpacing(boardPlayers.length, "preview")
);
return `
    <section class="session-tool-panel session-player-board-panel">
      <div class="session-tool-panel-head">
        <span>Players</span>
        <strong>Player Board</strong>
      </div>
      <div class="session-player-board-meta">
        <span>${escapeHtml(rule.label)}</span>
        <strong>${escapeHtml(rule.valueLabel)}</strong>
        <small>
          ${boardPlayers.length} available${temporaryBoardCount ? ` · ${temporaryBoardCount} temporary` : ""}${belowLimitCount ? ` · ${belowLimitCount} below` : ""}${hiddenZeroCount ? ` · ${hiddenZeroCount} out` : ""}${unconfirmedCount ? ` · ${unconfirmedCount} not set` : ""}
        </small>
      </div>
      ${renderSessionPlannerPlayerBoardWarnings(block, { compact: true })}
      ${renderSessionPlannerSquadBridgeStrip(boardPlayers)}
      <button type="button" class="session-player-board-launch" data-session-open-player-board aria-label="Open Player Board">
        <span class="session-player-board-preview${previewDensityClass}" aria-hidden="true">
          ${renderSessionPlannerPlayerBoardLines()}
          ${renderSessionPlannerPlayerBoardPositionLabels()}
          ${
            boardPlayers.length
              ? boardPlayers
                  .map((item, index) => {
                    const position =
                      previewPositions.get(item.player.id) ??
                      getPlayerBoardPosition(block, item, index, boardPlayers);
                    const tone = getPlayerBoardTone(item.participation);
                    const customColor = getPlayerBoardCustomColor(block, item.player.id);
                    const colorStyle = getPlayerBoardColorStyle(customColor);
                    return `
<span
class="session-player-board-preview-token is-${escapeHtml(tone)}${customColor ? " has-custom-color" : ""}${isTemporaryPlayer(item.player) ? " is-temporary" : ""}${item.player.playerBoardCustom ? " is-custom-person" : ""}"
style="left: ${position.x}%; top: ${position.y}%; ${colorStyle}"
>${escapeHtml(labelMap.get(item.player.id) ?? getPlayerInitials(item.player))}</span>
`;
                  })
                  .join("")
              : `<span class="session-player-board-preview-empty">No players</span>`
          }
        </span>
      </button>
    </section>
  `;
}
function renderSessionPlannerPlayerBoardCustomPersonEditor(block) {
const editor = getState().customPersonEditor;
if (!editor) {
return "";
}
const person = editor.personId ? getPlayerBoardCustomPerson(block, editor.personId) : null;
const isEdit = Boolean(person);
const title = isEdit ? "Edit manual person" : "Add player or staff";
const name = person?.name || "";
const role = person?.role || "";
const kind = person?.kind === "staff" ? "staff" : "player";
return `
      <form
        class="session-player-board-person-editor"
        data-session-player-board-person-editor
        data-session-player-board-person-form
        style="position:absolute;right:.9rem;top:.9rem;z-index:16;width:min(18rem,calc(100% - 1.8rem));display:grid;gap:.48rem;padding:.72rem;border-radius:16px;background:rgba(255,255,255,.96);border:1px solid rgba(29,29,31,.16);box-shadow:0 18px 44px rgba(0,0,0,.16);"
      >
        <header style="display:flex;align-items:center;justify-content:space-between;gap:.55rem;">
          <strong style="font-size:.86rem;line-height:1.05;">${escapeHtml(title)}</strong>
          <button type="button" class="session-player-board-tool-button" data-session-player-board-person-cancel style="min-height:1.85rem;padding:0 .6rem;">Close</button>
        </header>
        <label style="display:grid;gap:.18rem;color:#6e6e73;font-size:.62rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;">
          Name
          <input name="name" value="${escapeHtml(name)}" autocomplete="off" placeholder="Name" style="min-height:2.15rem;border:1px solid rgba(29,29,31,.18);border-radius:10px;padding:0 .62rem;color:#1d1d1f;background:#fff;font:inherit;font-size:.82rem;font-weight:800;text-transform:none;letter-spacing:0;" />
        </label>
        <label style="display:grid;gap:.18rem;color:#6e6e73;font-size:.62rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;">
          Role / note
          <input name="role" value="${escapeHtml(role)}" autocomplete="off" placeholder="Coach, Staff, GK, CB..." style="min-height:2.15rem;border:1px solid rgba(29,29,31,.18);border-radius:10px;padding:0 .62rem;color:#1d1d1f;background:#fff;font:inherit;font-size:.82rem;font-weight:800;text-transform:none;letter-spacing:0;" />
        </label>
        <label style="display:grid;gap:.18rem;color:#6e6e73;font-size:.62rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;">
          Type
          <select name="kind" style="min-height:2.15rem;border:1px solid rgba(29,29,31,.18);border-radius:10px;padding:0 .62rem;color:#1d1d1f;background:#fff;font:inherit;font-size:.82rem;font-weight:800;text-transform:none;letter-spacing:0;">
            <option value="player"${kind === "player" ? " selected" : ""}>Player</option>
            <option value="staff"${kind === "staff" ? " selected" : ""}>Staff / leader</option>
          </select>
        </label>
        <div style="display:flex;align-items:center;gap:.4rem;">
          <button type="submit" class="session-player-board-tool-button is-copy" style="flex:1 1 auto;min-height:2.15rem;">${isEdit ? "Save" : "Add"}</button>
          ${
            isEdit
              ? `<button type="button" class="session-player-board-tool-button" data-session-player-board-person-remove="${escapeHtml(person.id)}" style="min-height:2.15rem;color:#d92d20;background:#fde7e7;">Remove</button>`
              : ""
          }
        </div>
      </form>
  `;
}
function renderSessionPlannerPlayerBoardOverlay(block) {
if (!getState().playerBoardOpen || !block) {
return "";
}
const { boardPlayers, rule, belowLimitCount, hiddenZeroCount, unconfirmedCount } = getPlayerBoardSummary(block);
const warnings = getPlayerBoardWarnings(block, getState().selectedDate);
const selectedItem = syncSelection(block);
const labelMap = getInitialLabelMap(boardPlayers);
const selectedIds = new Set(getState().selectedPlayerIds);
return `
    <div class="session-library-overlay session-player-board-overlay" data-session-player-board-overlay>
      <section class="session-library-modal session-player-board-modal" role="dialog" aria-modal="true" aria-label="Player Board">
        <header class="session-library-modal-head">
          <div class="session-player-board-modal-title">
            <span>Player Board</span>
            <h2>${escapeHtml(block.title || block.label || "Exercise players")}</h2>
            <small class="session-player-board-modal-count">
              ${escapeHtml(rule.label)} · ${escapeHtml(rule.valueLabel)} · ${boardPlayers.length} available${belowLimitCount ? ` · ${belowLimitCount} below` : ""}${hiddenZeroCount ? ` · ${hiddenZeroCount} out` : ""}${unconfirmedCount ? ` · ${unconfirmedCount} not set` : ""}
            </small>
          </div>
          <div class="session-player-board-modal-actions">
            ${renderSessionPlannerPlayerBoardTools()}
            <button type="button" class="session-library-close-button" data-session-close-player-board aria-label="Close Player Board">Close</button>
          </div>
	        </header>
	        <div class="session-player-board-modal-layout">
	          <div class="session-player-board-stage${warnings.hasWarnings ? " has-warnings" : ""}">
	            <div class="session-player-board-boardbar${warnings.hasWarnings ? " has-warnings" : ""}">
	              <div class="session-player-board-boardbar-warning">
	                ${warnings.hasWarnings ? renderSessionPlannerPlayerBoardWarnings(block) : ""}
	              </div>
	              <div class="session-player-board-boardbar-actions">
	                ${renderSessionPlannerPlayerBoardCopyTools(block)}
	              </div>
	            </div>
	            <div class="session-player-board" data-session-player-board>
	              ${renderSessionPlannerPlayerBoardLines()}
              ${renderSessionPlannerPlayerBoardPositionLabels()}
              <div class="session-player-board-selection-box" data-session-player-board-selection-box></div>
              ${
                boardPlayers.length
                  ? boardPlayers
                      .map((item, index) =>
                        renderSessionPlannerPlayerBoardToken(
                          item,
                          index,
                          block,
                          boardPlayers.length,
                          labelMap,
                          selectedIds,
                          boardPlayers
                        )
                      )
                      .join("")
                  : `<p class="session-player-board-empty">No medically available players logged for this block.</p>`
              }
              ${renderSessionPlannerPlayerBoardCustomPersonEditor(block)}
            </div>
          </div>
        </div>
        ${renderSessionPlannerSelectionAssistantOverlay(block, boardPlayers)}
        ${renderSessionPlannerPlayerBoardProfileOverlay(selectedItem, block, rule, boardPlayers.length)}
      </section>
    </div>
  `;
}

  return {
    renderSquadBridgeStrip: renderSessionPlannerSquadBridgeStrip,
    renderSquadBridgePanel: renderSessionPlannerSquadBridgePanel,
    renderPlayerBoardSquadProfile: renderSessionPlannerPlayerBoardSquadProfile,
    renderSelectionAssistantPanel: renderSessionPlannerSelectionAssistantPanel,
    renderSelectionAssistantOverlay: renderSessionPlannerSelectionAssistantOverlay,
    renderPlayerBoardWarnings: renderSessionPlannerPlayerBoardWarnings,
    renderPlayerBoardLines: renderSessionPlannerPlayerBoardLines,
    renderPlayerBoardPositionLabels: renderSessionPlannerPlayerBoardPositionLabels,
    renderPlayerBoardToken: renderSessionPlannerPlayerBoardToken,
    renderPlayerBoardProfile: renderSessionPlannerPlayerBoardProfile,
    renderPlayerBoardProfileOverlay: renderSessionPlannerPlayerBoardProfileOverlay,
    renderPlayerBoardCopyTools: renderSessionPlannerPlayerBoardCopyTools,
    renderPlayerBoardTools: renderSessionPlannerPlayerBoardTools,
    renderPlayerBoard: renderSessionPlannerPlayerBoard,
    renderPlayerBoardCustomPersonEditor: renderSessionPlannerPlayerBoardCustomPersonEditor,
    renderPlayerBoardOverlay: renderSessionPlannerPlayerBoardOverlay,
  };
}
