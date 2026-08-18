import {
  setPieceContextOptions,
  setPieceLayerOptions,
  setPieceMomentOptions,
  setPiecePitchViewOptions,
  setPieceRestartOptions,
  setPieceSubPhaseOptions,
  setPieceToolOptions,
} from "./constants.mjs";
import {
  getSetPieceAssignedSlot,
  getSetPieceAssignment,
  getSetPieceRoleCode,
  resolveSetPiecePhaseAssignments,
} from "./assignments.mjs";
import { escapeSetPieceHtml, renderSetPieceBoard, renderSetPiecePhaseThumbnail } from "./board-renderer.mjs";
import { createSetPiecePlayerLabelMap } from "./player-labels.mjs";
import { getSetPieceDrawingActorLabel, getSetPieceDrawingActors } from "./drawing-actors.mjs";
import { formatSetPieceSeconds, renderSetPiecePlayback } from "./playback-renderer.mjs";
import { renderSetPiecesPresentationWorkspace } from "./presentation-workspace-renderer.mjs";
import { getActiveSetPiece, getActiveSetPiecePhase, getActiveSetPieceVariant } from "./state.mjs";
import { renderSetPieceToolIcon } from "./tool-icons.mjs";
import { renderSetPieceLibraryLayer } from "./library-renderer.mjs";

function optionsMarkup(options = [], value = "") {
  return options.map((option) => `<option value="${escapeSetPieceHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeSetPieceHtml(option.label)}</option>`).join("");
}

function teamInitials(teamName = "Team") {
  return String(teamName || "Team")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "TM";
}

function renderTeamIdentity(team = {}) {
  const teamName = String(team.name || "Team").trim() || "Team";
  const mark = team.logoMarkup || `<span class="spr-team-mark-fallback" aria-label="${escapeSetPieceHtml(`${teamName} logo`)}">${escapeSetPieceHtml(teamInitials(teamName))}</span>`;
  return `<div class="spr-header-identity">
    <span class="spr-header-team-mark">${mark}</span>
    <div class="spr-header-titles"><p class="spr-header-team-name">${escapeSetPieceHtml(teamName)}</p><h1>Set Pieces Room</h1></div>
  </div>`;
}

function renderWorkspaceModeSwitch(ui = {}, hasPlay = false) {
  return `<div class="spr-mode-switch" role="group" aria-label="Set Pieces mode">
    <button type="button" data-set-piece-action="edit-mode" class="${ui.presentationMode ? "" : "is-active"}" aria-pressed="${!ui.presentationMode}">Edit</button>
    <button type="button" data-set-piece-action="present-mode" class="${ui.presentationMode ? "is-active" : ""}" aria-pressed="${Boolean(ui.presentationMode)}" ${hasPlay ? "" : "disabled"}>Present</button>
  </div>`;
}

function renderOnboarding(ui = {}) {
  if (!ui.onboardingOpen) return "";
  return `<div class="spr-onboarding-layer" data-set-piece-onboarding>
    <section class="spr-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="setPieceOnboardingTitle" aria-describedby="setPieceOnboardingDescription">
      <button type="button" class="spr-onboarding-close" data-set-piece-action="dismiss-onboarding" aria-label="Close introduction" title="Close introduction">×</button>
      <div class="spr-onboarding-heading">
        <span class="spr-onboarding-symbol">${renderSetPieceToolIcon("select")}</span>
        <div><p>Quick start</p><h2 id="setPieceOnboardingTitle">Build directly on the pitch</h2></div>
      </div>
      <p class="spr-onboarding-intro" id="setPieceOnboardingDescription">Create each phase visually, then play the full routine back for the team.</p>
      <ol class="spr-onboarding-steps">
        <li><span>${renderSetPieceToolIcon("home-player")}</span><div><strong>Place the actors</strong><small>Add squad players, opponents and the ball from the tools.</small></div></li>
        <li><span>${renderSetPieceToolIcon("run")}</span><div><strong>Shape the movement</strong><small>Select and drag players, or draw runs, passes and responses.</small></div></li>
        <li><span>${renderSetPieceToolIcon("step-back")}</span><div><strong>Compare the phases</strong><small>Turn on Previous when you need the last positions as a reference.</small></div></li>
      </ol>
      <button type="button" class="spr-onboarding-primary" data-set-piece-action="dismiss-onboarding">Start creating</button>
    </section>
  </div>`;
}

function renderToolRail(ui = {}, roster = []) {
  const groups = [
    { label: "Edit", tools: ["select"] },
    { label: "Players", tools: ["home-player", "opponent", "ball"] },
    { label: "Ball & movement", tools: ["run", "pass", "dribble"] },
    { label: "Opponent & response", tools: ["block", "press", "mark", "zone"] },
  ];
  return `<div class="spr-tool-rail" role="toolbar" aria-label="Tactical tools">
    ${groups.map((group) => `<div class="spr-tool-group">
      <span class="spr-tool-group-label">${escapeSetPieceHtml(group.label)}</span>
      <div class="spr-tool-group-buttons">
        ${group.tools.map((toolValue) => {
          const tool = setPieceToolOptions.find((option) => option.value === toolValue);
          const tooltip = `${tool.label}: ${tool.hint} (${tool.shortcut})`;
          return `<button type="button" class="spr-tool-button ${ui.activeTool === tool.value ? "is-active" : ""}" data-set-piece-tool="${tool.value}" data-set-piece-tool-tip="${escapeSetPieceHtml(tooltip)}" aria-label="${escapeSetPieceHtml(tool.label)}" aria-pressed="${ui.activeTool === tool.value}" title="${escapeSetPieceHtml(tooltip)}" ${tool.value === "home-player" && !roster.length ? "disabled" : ""}><span class="spr-tool-icon">${renderSetPieceToolIcon(tool.value)}</span><span class="spr-tool-name">${escapeSetPieceHtml(tool.label)}</span></button>`;
        }).join("")}
      </div>
    </div>`).join("")}
  </div>`;
}

function renderPlayerPicker(roster = [], phase = {}, canEdit = false) {
  const labels = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player));
  const placedIds = new Set((phase.elements || [])
    .filter((element) => element.kind === "home-player")
    .map((element) => element.profileId));
  const placedCount = roster.filter((entry) => placedIds.has(entry.id)).length;
  return `<details class="spr-player-picker" data-set-piece-player-picker>
    <summary class="spr-player-picker-trigger" aria-label="Add own players">
      <span class="spr-player-picker-plus" aria-hidden="true">＋</span>
      <span>Add players</span>
      <small>${placedCount}/${roster.length}</small>
    </summary>
    <div class="spr-player-menu" role="menu" aria-label="Own players">
      <div class="spr-player-menu-heading"><strong>Your squad</strong><span>${placedCount} placed</span></div>
      <label class="spr-player-menu-search"><span class="sr-only">Search squad</span><input type="search" placeholder="Search squad" data-set-piece-player-search></label>
      <div class="spr-player-menu-list">
        ${roster.map((entry) => {
          const placed = placedIds.has(entry.id);
          const action = placed ? "Select" : "Add";
          return `<button type="button" class="spr-player-option ${placed ? "is-placed" : ""}" data-set-piece-roster-add="${escapeSetPieceHtml(entry.id)}" role="menuitem" aria-label="${action} ${escapeSetPieceHtml(entry.name)}" ${canEdit ? "" : "disabled"}>
            <span class="spr-player-option-mark">${escapeSetPieceHtml(labels.get(entry.id) || "P")}</span>
            <span class="spr-player-option-copy"><strong>${escapeSetPieceHtml(entry.name)}</strong><small>${escapeSetPieceHtml(entry.position || "Squad player")}</small></span>
            <span class="spr-player-option-state" aria-hidden="true">${placed ? "✓" : "＋"}</span>
          </button>`;
        }).join("") || '<div class="spr-player-menu-empty">No squad profiles</div>'}
      </div>
    </div>
  </details>`;
}

function renderAssignmentScope(ui = {}) {
  return `<div class="spr-assignment-scope" role="group" aria-label="Player change scope">
    <button type="button" data-set-piece-assignment-scope="play" class="${ui.assignmentScope !== "variant" ? "is-active" : ""}" aria-pressed="${ui.assignmentScope !== "variant"}">All variants</button>
    <button type="button" data-set-piece-assignment-scope="variant" class="${ui.assignmentScope === "variant" ? "is-active" : ""}" aria-pressed="${ui.assignmentScope === "variant"}">This variant</button>
  </div>`;
}

function renderInspectorCloseButton() {
  return '<button type="button" class="spr-icon-button spr-inspector-close" data-set-piece-action="close-inspector" aria-label="Close details" title="Close details">×</button>';
}

function renderAssignmentPicker(slotId, play, variant, roster, ui, canEdit) {
  const assignment = getSetPieceAssignment(play, variant, slotId);
  const labels = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player));
  const currentPlayer = roster.find((entry) => entry.id === assignment.profileId);
  const currentMark = currentPlayer ? labels.get(currentPlayer.id) : getSetPieceRoleCode(assignment.role);
  return `<div class="spr-assignment-control">
    <div class="spr-assignment-control-heading"><span>Assigned player</span>${assignment.isVariantOverride ? "<small>Variant override</small>" : "<small>Routine default</small>"}</div>
    ${renderAssignmentScope(ui)}
    <details class="spr-assignment-picker" ${ui.assignmentPickerSlotId === slotId ? "open" : ""}>
      <summary aria-label="Change assigned player">
        <span class="spr-player-option-mark">${escapeSetPieceHtml(currentMark || "R")}</span>
        <span class="spr-player-option-copy"><strong>${escapeSetPieceHtml(currentPlayer?.name || "Unassigned")}</strong><small>${escapeSetPieceHtml(assignment.role)}</small></span>
        <span class="spr-assignment-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="spr-assignment-menu" role="menu" aria-label="Choose player for role">
        <button type="button" class="spr-player-option ${!assignment.profileId ? "is-placed" : ""}" data-set-piece-assign-player="" data-set-piece-slot-id="${escapeSetPieceHtml(slotId)}" role="menuitem" ${canEdit ? "" : "disabled"}>
          <span class="spr-player-option-mark is-unassigned">—</span>
          <span class="spr-player-option-copy"><strong>Unassigned</strong><small>Keep the tactical role open</small></span>
          <span class="spr-player-option-state" aria-hidden="true">${!assignment.profileId ? "✓" : ""}</span>
        </button>
        ${roster.map((entry) => {
          const selected = entry.id === assignment.profileId;
          const occupied = getSetPieceAssignedSlot(play, variant, entry.id, slotId);
          return `<button type="button" class="spr-player-option ${selected ? "is-placed" : ""}" data-set-piece-assign-player="${escapeSetPieceHtml(entry.id)}" data-set-piece-slot-id="${escapeSetPieceHtml(slotId)}" role="menuitem" aria-label="Assign ${escapeSetPieceHtml(entry.name)} to ${escapeSetPieceHtml(assignment.role)}" ${canEdit ? "" : "disabled"}>
            <span class="spr-player-option-mark">${escapeSetPieceHtml(labels.get(entry.id) || "P")}</span>
            <span class="spr-player-option-copy"><strong>${escapeSetPieceHtml(entry.name)}</strong><small>${escapeSetPieceHtml(occupied ? `Swap with ${occupied.role}` : entry.position || "Squad player")}</small></span>
            <span class="spr-player-option-state" aria-hidden="true">${selected ? "✓" : occupied ? "⇄" : "＋"}</span>
          </button>`;
        }).join("")}
      </div>
    </details>
  </div>`;
}

function renderAssignmentsOverview(play, variant, roster, canEdit) {
  const labels = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player));
  return `<div class="spr-inspector-section spr-assignments-overview">
    <div class="spr-inspector-title"><div><p>Routine</p><strong>Assignments</strong></div><div class="spr-inline-actions"><button type="button" class="spr-icon-button" data-set-piece-action="show-plan" aria-label="Back to plan" title="Back to plan">←</button>${renderInspectorCloseButton()}</div></div>
    <p class="spr-assignment-intro">Roles stay fixed. Players can change without changing positions, runs or timing.</p>
    <div class="spr-assignment-list">
      ${(play.assignments || []).map((slot) => {
        const assignment = getSetPieceAssignment(play, variant, slot.slotId);
        const player = roster.find((entry) => entry.id === assignment.profileId);
        return `<button type="button" class="spr-assignment-row" data-set-piece-select-slot="${escapeSetPieceHtml(slot.slotId)}">
          <span class="spr-player-option-mark">${escapeSetPieceHtml(player ? labels.get(player.id) : getSetPieceRoleCode(slot.role))}</span>
          <span class="spr-player-option-copy"><strong>${escapeSetPieceHtml(slot.role)}</strong><small>${escapeSetPieceHtml(player?.name || "Unassigned")}${assignment.isVariantOverride ? " · This variant" : ""}</small></span>
          <span aria-hidden="true">›</span>
        </button>`;
      }).join("") || '<div class="spr-player-menu-empty">Add own players to create tactical roles.</div>'}
    </div>
  </div>`;
}

function renderHeaderActions(state = {}, ui = {}, saveStateClass = "spr-save-state is-saved sr-only", saveMessage = "Saved") {
  const planCount = state.plays?.length || 0;
  return `<div class="spr-header-actions">
    <div class="${saveStateClass}" role="status" aria-live="polite">${escapeSetPieceHtml(saveMessage)}</div>
    <button type="button" class="spr-library-trigger ${ui.libraryOpen ? "is-active" : ""}" data-set-piece-action="toggle-library" aria-controls="setPieceLibraryPanel" aria-expanded="${Boolean(ui.libraryOpen)}">
      <span class="spr-library-trigger-icon">${renderSetPieceToolIcon("library")}</span>
      <span>Library</span>
      <small>${planCount}</small>
    </button>
  </div>`;
}

function renderVariantBar(play = null, variant = null, ui = {}, canEdit = false) {
  if (!play) return "";
  return `<div class="spr-variant-bar" aria-label="Variants">
    ${ui.presentationMode
      ? `<div class="spr-present-title"><span>${escapeSetPieceHtml(play.restart.replaceAll("-", " "))}</span><strong>${escapeSetPieceHtml(play.title)}</strong></div>`
      : `<label class="spr-plan-title"><span>Set piece</span><input type="text" value="${escapeSetPieceHtml(play.title)}" placeholder="Name this set piece" data-set-piece-play-field="title" ${canEdit ? "" : "disabled"}></label>`}
    <div class="spr-variant-tabs" role="tablist">
      ${(play.variants || []).map((item) => `<button type="button" role="tab" aria-selected="${item.id === variant?.id}" class="${item.id === variant?.id ? "is-active" : ""}" data-set-piece-variant-id="${escapeSetPieceHtml(item.id)}">${escapeSetPieceHtml(item.title)}</button>`).join("")}
    </div>
    ${ui.presentationMode && ui.canAddToTeamMeeting
      ? '<button type="button" class="spr-team-meeting-action" data-set-piece-action="add-to-team-meeting"><span aria-hidden="true">＋</span> Team Meeting</button>'
      : `<button type="button" class="spr-icon-button" data-set-piece-action="add-variant" title="Create variant" aria-label="Create variant" ${canEdit ? "" : "disabled"}>＋</button>`}
  </div>`;
}

function renderBoardWorkspace(play, variant, phase, roster, ui, canEdit) {
  if (!play || !variant || !phase) {
    return `<main class="spr-canvas-empty"><button type="button" class="spr-primary-empty-action" data-set-piece-action="new-play">Create set piece</button></main>`;
  }
  const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
  const previousPhase = phaseIndex > 0 ? variant.phases[phaseIndex - 1] : null;
  const resolvedPhase = resolveSetPiecePhaseAssignments(phase, play, variant, roster);
  const resolvedPreviousPhase = previousPhase ? resolveSetPiecePhaseAssignments(previousPhase, play, variant, roster) : null;
  return `<main class="spr-editor">
    <div class="spr-editor-command-bar">
      ${renderVariantBar(play, variant, ui, canEdit)}
      ${ui.presentationMode ? "" : `<div class="spr-editor-toolbar">
        ${renderPlayerPicker(roster, phase, canEdit)}
        <button type="button" class="spr-assignment-command ${ui.showAssignments ? "is-active" : ""}" data-set-piece-action="show-assignments"><span aria-hidden="true">⇄</span><span>Assignments</span></button>
        <label><span>Pitch</span><select data-set-piece-play-field="pitchView" ${canEdit ? "" : "disabled"}>${optionsMarkup(setPiecePitchViewOptions, play.pitchView)}</select></label>
        <label class="spr-board-toggle"><input type="checkbox" data-set-piece-ghost ${ui.showGhost ? "checked" : ""}><span>Previous</span></label>
        <div class="spr-history-actions">
          <button type="button" class="spr-icon-button" data-set-piece-action="undo" title="Undo" aria-label="Undo" ${ui.canUndo ? "" : "disabled"}>↶</button>
          <button type="button" class="spr-icon-button" data-set-piece-action="redo" title="Redo" aria-label="Redo" ${ui.canRedo ? "" : "disabled"}>↷</button>
          <button type="button" class="spr-icon-button ${!ui.inspectorCollapsed ? "is-active" : ""}" data-set-piece-action="toggle-inspector" title="Toggle details" aria-label="Toggle details" aria-pressed="${Boolean(!ui.inspectorCollapsed)}">≡</button>
        </div>
      </div>`}
    </div>
    <div class="spr-board-row ${play.pitchView === "full" ? "is-full-pitch" : "is-half-pitch"}">
      ${ui.presentationMode ? "" : renderToolRail(ui, roster)}
      <div class="spr-board-stage" data-set-piece-board-stage>
        ${renderSetPieceBoard({
          phase: resolvedPhase,
          previousPhase: ui.showGhost ? resolvedPreviousPhase : null,
          pitchView: play.pitchView,
          layers: ui.layers,
          selectedElementIds: ui.selectedElementIds,
          selectedDrawingId: ui.selectedDrawingId,
          previewDrawing: ui.previewDrawing,
          selectionRect: ui.selectionRect,
          interactive: canEdit && !ui.presentationMode,
        })}
      </div>
    </div>
    <div class="spr-timeline" aria-label="Phase timeline">
      <div class="spr-phase-strip">
        ${variant.phases.map((item, index) => `<button type="button" class="spr-phase-card ${item.id === phase.id ? "is-active" : ""}" data-set-piece-phase-id="${escapeSetPieceHtml(item.id)}" aria-label="Phase ${index + 1}, ${escapeSetPieceHtml(item.title)}, ${formatSetPieceSeconds(item.durationMs)}${item.cue ? `, ${escapeSetPieceHtml(item.cue)}` : ""}">
          ${renderSetPiecePhaseThumbnail(resolveSetPiecePhaseAssignments(item, play, variant, roster), play.pitchView)}
          <span><b>${String(index + 1).padStart(2, "0")}</b><i data-set-piece-phase-title="${escapeSetPieceHtml(item.id)}">${escapeSetPieceHtml(item.title)}</i><small>${formatSetPieceSeconds(item.durationMs)}</small></span>
          ${item.cue ? `<em>${escapeSetPieceHtml(item.cue)}</em>` : ""}
        </button>`).join("")}
        ${ui.presentationMode ? "" : `<button type="button" class="spr-add-phase" data-set-piece-action="add-phase" title="Duplicate current phase" aria-label="Duplicate current phase" ${canEdit ? "" : "disabled"}>＋</button>`}
      </div>
    </div>
    ${renderSetPiecePlayback(variant, phase, ui)}
  </main>`;
}

function renderField(label, field, value, options = {}) {
  const disabled = options.disabled ? "disabled" : "";
  if (options.type === "textarea") {
    return `<label class="spr-field"><span>${label}</span><textarea data-${options.scope || "set-piece-play"}-field="${field}" ${disabled}>${escapeSetPieceHtml(value)}</textarea></label>`;
  }
  if (options.type === "select") {
    return `<label class="spr-field"><span>${label}</span><select data-${options.scope || "set-piece-play"}-field="${field}" ${disabled}>${optionsMarkup(options.options, value)}</select></label>`;
  }
  return `<label class="spr-field"><span>${label}</span><input type="${options.type || "text"}" value="${escapeSetPieceHtml(value)}" data-${options.scope || "set-piece-play"}-field="${field}" ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${options.step !== undefined ? `step="${options.step}"` : ""} ${disabled}></label>`;
}

function renderSubPhaseField(play = {}, canEdit = false) {
  const selected = new Set(play.subPhases || []);
  const onlySelectedValue = selected.size === 1 ? [...selected][0] : "";
  return `<fieldset class="spr-sub-phase-field">
    <legend>Sub-phases</legend>
    <div class="spr-sub-phase-options">
      ${setPieceSubPhaseOptions.map((option) => `<label class="${selected.has(option.value) ? "is-selected" : ""}">
        <input type="checkbox" data-set-piece-sub-phase="${escapeSetPieceHtml(option.value)}" ${selected.has(option.value) ? "checked" : ""} ${canEdit && option.value !== onlySelectedValue ? "" : "disabled"}>
        <span>${escapeSetPieceHtml(option.label)}</span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

function renderElementInspector(element, play, variant, roster, ui, canEdit, canDelete) {
  const isHome = element.kind === "home-player";
  const isOpponent = element.kind === "opponent";
  const assignment = isHome ? getSetPieceAssignment(play, variant, element.id) : null;
  return `<div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>${isHome ? "Selected role" : "Selected object"}</p><strong>${escapeSetPieceHtml(isHome ? assignment.role : element.kind === "opponent" ? `Opponent ${element.label}` : "Ball")}</strong></div><div class="spr-inline-actions"><button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-selection" title="Delete" aria-label="Delete" ${canDelete ? "" : "disabled"}>⌫</button>${renderInspectorCloseButton()}</div></div>
    ${isHome ? renderAssignmentPicker(element.id, play, variant, roster, ui, canEdit) : ""}
    ${isHome ? renderField("Tactical role", "role", assignment.role, { scope: "set-piece-element", disabled: !canEdit }) : ""}
    ${isOpponent ? renderField("Number", "label", element.label || "1", { type: "number", min: 1, max: 99, scope: "set-piece-element", disabled: !canEdit }) : ""}
    ${isOpponent ? `<label class="spr-toggle-field"><span><strong>Show number</strong><small>Turn off for color only</small></span><input type="checkbox" data-set-piece-element-field="showNumber" aria-label="Show number on board" ${element.showNumber !== false ? "checked" : ""} ${canEdit ? "" : "disabled"}></label>` : ""}
    ${renderField("Instruction", "instruction", element.instruction, { type: "textarea", scope: "set-piece-element", disabled: !canEdit })}
    <div class="spr-timing-summary" aria-label="Action timing"><span><small>Starts</small><strong>${formatSetPieceSeconds(element.delayMs)}</strong></span><span><small>Moves</small><strong>${formatSetPieceSeconds(element.durationMs)}</strong></span></div>
    <div class="spr-field-grid">
      ${renderField("Delay (ms)", "delayMs", element.delayMs, { type: "number", min: 0, max: 10000, step: 100, scope: "set-piece-element", disabled: !canEdit })}
      ${renderField("Movement (ms)", "durationMs", element.durationMs, { type: "number", min: 100, max: 10000, step: 100, scope: "set-piece-element", disabled: !canEdit })}
    </div>
  </div>`;
}

function renderDrawingInspector(drawing, phase, canEdit, canDelete) {
  const actors = getSetPieceDrawingActors(phase, drawing.type);
  const actorField = actors.length ? `<label class="spr-field"><span>Linked actor</span><select data-set-piece-drawing-field="actorId" ${canEdit ? "" : "disabled"}>
    <option value="">Unlinked</option>
    ${actors.map((actor) => `<option value="${escapeSetPieceHtml(actor.id)}" ${actor.id === drawing.actorId ? "selected" : ""}>${escapeSetPieceHtml(getSetPieceDrawingActorLabel(actor))}</option>`).join("")}
  </select><small>The route follows this player or the ball during playback.</small></label>` : "";
  return `<div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Movement</p><strong>${escapeSetPieceHtml(drawing.type)}</strong></div><div class="spr-inline-actions"><button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-selection" title="Delete" aria-label="Delete" ${canDelete ? "" : "disabled"}>⌫</button>${renderInspectorCloseButton()}</div></div>
    ${actorField}
    ${renderField("Label", "label", drawing.label, { scope: "set-piece-drawing", disabled: !canEdit })}
    ${drawing.type !== "zone" ? renderField("Curve", "curve", drawing.curve, { type: "range", min: -36, max: 36, scope: "set-piece-drawing", disabled: !canEdit }) : ""}
  </div>`;
}

function renderPlanInspector(play, variant, phase, ui, canEdit, canDelete) {
  return `<div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Plan</p><strong data-set-piece-live-text="play-title">${escapeSetPieceHtml(play.title)}</strong></div><div class="spr-inline-actions"><button type="button" class="spr-icon-button" data-set-piece-action="duplicate-play" title="Duplicate plan" aria-label="Duplicate plan" ${canEdit ? "" : "disabled"}>⧉</button>${renderInspectorCloseButton()}</div></div>
    ${renderField("Title", "title", play.title, { disabled: !canEdit })}
    <div class="spr-field-grid">
      ${renderField("Restart", "restart", play.restart, { type: "select", options: setPieceRestartOptions, disabled: !canEdit })}
      ${renderField("Moment", "moment", play.moment, { type: "select", options: setPieceMomentOptions, disabled: !canEdit })}
    </div>
    ${renderSubPhaseField(play, canEdit)}
    ${renderField("Context", "context", play.context, { type: "select", options: setPieceContextOptions, disabled: !canEdit })}
    <div class="spr-field-grid">
      ${renderField("Date", "scheduledFor", play.scheduledFor, { type: "date", disabled: !canEdit })}
      ${renderField("Opponent", "opponent", play.opponent, { disabled: !canEdit })}
    </div>
    ${renderField("Objective", "objective", play.objective, { type: "textarea", disabled: !canEdit })}
  </div>
  <div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Variant</p><strong data-set-piece-live-text="variant-title">${escapeSetPieceHtml(variant.title)}</strong></div>${play.variants.length > 1 ? `<button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-variant" title="Delete variant" aria-label="Delete variant" ${canDelete ? "" : "disabled"}>⌫</button>` : ""}</div>
    ${renderField("Variant name", "title", variant.title, { scope: "set-piece-variant", disabled: !canEdit })}
    ${renderField("Opponent trigger", "trigger", variant.trigger, { type: "textarea", scope: "set-piece-variant", disabled: !canEdit })}
  </div>
  <div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Phase</p><strong data-set-piece-live-text="phase-title">${escapeSetPieceHtml(phase.title)}</strong></div><div class="spr-inline-actions"><button type="button" class="spr-icon-button" data-set-piece-action="move-phase-left" title="Move phase left" aria-label="Move phase left" ${canEdit ? "" : "disabled"}>←</button><button type="button" class="spr-icon-button" data-set-piece-action="move-phase-right" title="Move phase right" aria-label="Move phase right" ${canEdit ? "" : "disabled"}>→</button>${variant.phases.length > 1 ? `<button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-phase" title="Delete phase" aria-label="Delete phase" ${canDelete ? "" : "disabled"}>⌫</button>` : ""}</div></div>
    ${renderField("Phase name", "title", phase.title, { scope: "set-piece-phase", disabled: !canEdit })}
    ${renderField("Cue", "cue", phase.cue, { type: "textarea", scope: "set-piece-phase", disabled: !canEdit })}
    <div class="spr-field-grid">
      ${renderField("Transition ms", "durationMs", phase.durationMs, { type: "number", min: 250, max: 10000, scope: "set-piece-phase", disabled: !canEdit })}
      ${renderField("Hold ms", "holdMs", phase.holdMs, { type: "number", min: 0, max: 5000, scope: "set-piece-phase", disabled: !canEdit })}
    </div>
  </div>
  <div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>View</p><strong>Layers</strong></div><label class="spr-ghost-toggle"><input type="checkbox" data-set-piece-ghost ${ui.showGhost ? "checked" : ""}> Ghost</label></div>
    <div class="spr-layer-list">${setPieceLayerOptions.map((layer) => `<label><input type="checkbox" data-set-piece-layer="${layer.value}" ${ui.layers.has(layer.value) ? "checked" : ""}><span>${layer.label}</span></label>`).join("")}</div>
  </div>
  <button type="button" class="spr-delete-plan" data-set-piece-action="delete-play" ${canDelete ? "" : "disabled"}>Delete set piece</button>`;
}

function renderInspector(play, variant, phase, roster, ui, canEdit, canDelete) {
  if (!play || !variant || !phase) return '<aside class="spr-inspector"></aside>';
  const selectedElement = phase.elements.find((element) => ui.selectedElementIds.has(element.id));
  const selectedDrawing = phase.drawings.find((drawing) => drawing.id === ui.selectedDrawingId);
  const content = ui.showAssignments
    ? renderAssignmentsOverview(play, variant, roster, canEdit)
    : selectedElement
    ? renderElementInspector(selectedElement, play, variant, roster, ui, canEdit, canDelete)
    : selectedDrawing
      ? renderDrawingInspector(selectedDrawing, phase, canEdit, canDelete)
      : renderPlanInspector(play, variant, phase, ui, canEdit, canDelete);
  return `<aside class="spr-inspector" aria-label="Set piece inspector">${content}</aside>`;
}

export function renderSetPiecesWorkspace(options = {}) {
  const state = options.state || { plays: [] };
  const ui = options.ui || {};
  const roster = options.roster || [];
  const team = options.team || {};
  const play = getActiveSetPiece(state);
  const variant = getActiveSetPieceVariant(play || {});
  const phase = getActiveSetPiecePhase(variant || {});
  const canEdit = options.canEdit !== false;
  const canDelete = options.canDelete !== false;
  const saveState = ui.saveState || "saved";
  const saveStateClass = `spr-save-state is-${escapeSetPieceHtml(saveState)}${saveState === "saved" ? " sr-only" : ""}`;
  const saveMessage = ui.saveMessage || (canEdit ? "Saved to team" : "View only");
  if (ui.presentationMode && play && variant && phase) {
    return `<section class="spr-shell is-presenting ${ui.nativeFullscreen ? "is-native-fullscreen" : ""}" data-set-pieces-room>
      ${renderSetPiecesPresentationWorkspace({
        play,
        variant,
        phase,
        roster,
        ui,
        teamIdentityMarkup: renderTeamIdentity(team),
      })}
    </section>`;
  }
  return `<section class="spr-shell ${ui.presentationMode ? "is-presenting" : "is-editing"} ${ui.inspectorCollapsed ? "is-inspector-collapsed" : ""}" data-set-pieces-room>
    <header class="spr-header">
      ${renderTeamIdentity(team)}
      <div class="spr-header-mode">${renderWorkspaceModeSwitch(ui, Boolean(play))}</div>
      ${renderHeaderActions(state, ui, saveStateClass, saveMessage)}
    </header>
    ${renderSetPieceLibraryLayer(state, ui)}
    ${ui.notice ? `<div class="spr-notice is-${escapeSetPieceHtml(ui.notice.tone || "warning")}" role="status"><span>${escapeSetPieceHtml(ui.notice.message)}</span><button type="button" data-set-piece-action="dismiss-notice" aria-label="Dismiss message" title="Dismiss">×</button></div>` : ""}
    ${renderOnboarding(ui)}
    <div class="spr-layout">
      ${renderBoardWorkspace(play, variant, phase, roster, ui, canEdit)}
      ${renderInspector(play, variant, phase, roster, ui, canEdit, canDelete)}
    </div>
  </section>`;
}
