import {
  setPieceContextOptions,
  setPieceLayerOptions,
  setPieceMomentOptions,
  setPiecePitchViewOptions,
  setPiecePlaybackSpeedOptions,
  setPieceRestartOptions,
  setPieceToolOptions,
} from "./constants.mjs";
import { escapeSetPieceHtml, renderSetPieceBoard, renderSetPiecePhaseThumbnail } from "./board-renderer.mjs";
import { getActiveSetPiece, getActiveSetPiecePhase, getActiveSetPieceVariant } from "./state.mjs";

function optionsMarkup(options = [], value = "") {
  return options.map((option) => `<option value="${escapeSetPieceHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeSetPieceHtml(option.label)}</option>`).join("");
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
          return `<button type="button" class="spr-tool-button ${ui.activeTool === tool.value ? "is-active" : ""}" data-set-piece-tool="${tool.value}" aria-label="${escapeSetPieceHtml(tool.label)}" aria-pressed="${ui.activeTool === tool.value}" title="${escapeSetPieceHtml(`${tool.label} (${tool.shortcut})`)}" ${tool.value === "home-player" && !roster.length ? "disabled" : ""}><span class="spr-tool-symbol" aria-hidden="true">${tool.symbol}</span><span class="spr-tool-name">${escapeSetPieceHtml(tool.label)}</span></button>`;
        }).join("")}
      </div>
    </div>`).join("")}
  </div>`;
}

function renderPlayLibrary(state = {}, ui = {}) {
  const filters = [
    { value: "all", label: "All", accessibleLabel: "All set pieces" },
    { value: "attack", label: "Attack", accessibleLabel: "Attacking set pieces" },
    { value: "defend", label: "Defend", accessibleLabel: "Defending set pieces" },
    { value: "transition", label: "2nd ball", accessibleLabel: "Second ball and transition set pieces" },
  ];
  const query = String(ui.searchQuery || "").trim().toLowerCase();
  const plays = (state.plays || []).filter((play) => {
    if (ui.libraryFilter !== "all" && play.moment !== ui.libraryFilter) return false;
    if (!query) return true;
    return [play.title, play.restart, play.opponent].some((value) => String(value || "").toLowerCase().includes(query));
  });
  return `<aside class="spr-library" aria-label="Set piece library">
    <div class="spr-panel-heading">
      <div><p>Library</p><strong>${state.plays?.length || 0} plans</strong></div>
      <button type="button" class="spr-command-button" data-set-piece-action="new-play"><span aria-hidden="true">＋</span> New</button>
    </div>
    <label class="spr-search-field"><span class="sr-only">Search set pieces</span><input type="search" placeholder="Search" value="${escapeSetPieceHtml(ui.searchQuery)}" data-set-piece-search /></label>
    <div class="spr-segmented" role="group" aria-label="Library filter">
      ${filters.map((option) => `<button type="button" data-set-piece-filter="${option.value}" class="${ui.libraryFilter === option.value ? "is-active" : ""}" aria-label="${option.accessibleLabel}">${option.label}</button>`).join("")}
    </div>
    <div class="spr-play-list">
      ${plays.map((play) => `<button type="button" class="spr-play-item ${play.id === state.activePlayId ? "is-active" : ""}" data-set-piece-play-id="${escapeSetPieceHtml(play.id)}">
        <span class="spr-play-type">${escapeSetPieceHtml(play.restart.replaceAll("-", " "))}</span>
        <strong data-set-piece-play-title="${escapeSetPieceHtml(play.id)}">${escapeSetPieceHtml(play.title)}</strong>
        <small>${escapeSetPieceHtml([play.moment, play.context, play.opponent].filter(Boolean).join(" · "))}</small>
      </button>`).join("") || '<div class="spr-empty-list" aria-label="No set pieces"></div>'}
    </div>
  </aside>`;
}

function renderVariantBar(play = null, variant = null, canEdit = false) {
  if (!play) return "";
  return `<div class="spr-variant-bar" aria-label="Variants">
    <label class="spr-plan-title"><span>Set piece</span><input type="text" value="${escapeSetPieceHtml(play.title)}" placeholder="Name this set piece" data-set-piece-play-field="title" ${canEdit ? "" : "disabled"}></label>
    <div class="spr-variant-tabs" role="tablist">
      ${(play.variants || []).map((item) => `<button type="button" role="tab" aria-selected="${item.id === variant?.id}" class="${item.id === variant?.id ? "is-active" : ""}" data-set-piece-variant-id="${escapeSetPieceHtml(item.id)}">${escapeSetPieceHtml(item.title)}</button>`).join("")}
    </div>
    <button type="button" class="spr-icon-button" data-set-piece-action="add-variant" title="Create variant" aria-label="Create variant" ${canEdit ? "" : "disabled"}>＋</button>
  </div>`;
}

function renderPlayback(variant, phase, ui) {
  const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
  const maxPosition = Math.max(1, variant.phases.length - 1);
  const position = Math.min(maxPosition, Math.max(0, phaseIndex + Number(ui.playbackProgress || 0)));
  return `<div class="spr-playback" aria-label="Playback controls">
    <div class="spr-playback-transport">
      <button type="button" class="spr-icon-button" data-set-piece-action="restart-playback" title="Back to phase 1" aria-label="Back to phase 1">|◀</button>
      <button type="button" class="spr-icon-button" data-set-piece-action="previous-phase" title="Previous phase" aria-label="Previous phase">◀</button>
      <button type="button" class="spr-play-button" data-set-piece-action="toggle-play" aria-label="${ui.isPlaying ? "Pause" : "Play"}"><span aria-hidden="true">${ui.isPlaying ? "Ⅱ" : "▶"}</span></button>
      <button type="button" class="spr-icon-button" data-set-piece-action="next-phase" title="Next phase" aria-label="Next phase">▶</button>
      <button type="button" class="spr-icon-button" data-set-piece-action="stop" title="Stop" aria-label="Stop">■</button>
    </div>
    <label class="spr-playhead"><span class="sr-only">Playback position</span><input type="range" min="0" max="${maxPosition}" step="0.01" value="${position}" data-set-piece-scrubber ${variant.phases.length < 2 ? "disabled" : ""}></label>
    <span class="spr-phase-counter"><b>Phase ${phaseIndex + 1}</b><span>of ${variant.phases.length}</span></span>
    <label class="spr-speed-control"><span class="sr-only">Playback speed</span><select data-set-piece-playback-speed>${setPiecePlaybackSpeedOptions.map((speed) => `<option value="${speed}" ${Number(ui.playbackSpeed) === speed ? "selected" : ""}>${speed}×</option>`).join("")}</select></label>
    <button type="button" class="spr-icon-button spr-loop-button ${ui.loopPlayback ? "is-active" : ""}" data-set-piece-action="toggle-loop" aria-label="Loop playback" aria-pressed="${Boolean(ui.loopPlayback)}" title="Loop playback">↻</button>
  </div>`;
}

function renderBoardWorkspace(play, variant, phase, roster, ui, canEdit) {
  if (!play || !variant || !phase) {
    return `<main class="spr-canvas-empty"><button type="button" class="spr-primary-empty-action" data-set-piece-action="new-play">Create set piece</button></main>`;
  }
  const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
  const previousPhase = phaseIndex > 0 ? variant.phases[phaseIndex - 1] : null;
  return `<main class="spr-editor">
    ${renderVariantBar(play, variant, canEdit)}
    <div class="spr-editor-toolbar">
      <label class="spr-roster-picker"><span>Player to place</span><select data-set-piece-roster-select ${roster.length && canEdit ? "" : "disabled"}>${roster.map((entry) => `<option value="${escapeSetPieceHtml(entry.id)}" ${entry.id === ui.selectedRosterId ? "selected" : ""}>${escapeSetPieceHtml(entry.name)}</option>`).join("") || '<option value="">No squad profiles</option>'}</select></label>
      <label><span>Pitch</span><select data-set-piece-play-field="pitchView" ${canEdit ? "" : "disabled"}>${optionsMarkup(setPiecePitchViewOptions, play.pitchView)}</select></label>
      <label class="spr-board-toggle"><input type="checkbox" data-set-piece-ghost ${ui.showGhost ? "checked" : ""}><span>Previous</span></label>
      <div class="spr-history-actions">
        <button type="button" class="spr-icon-button" data-set-piece-action="undo" title="Undo" aria-label="Undo" ${ui.canUndo ? "" : "disabled"}>↶</button>
        <button type="button" class="spr-icon-button" data-set-piece-action="redo" title="Redo" aria-label="Redo" ${ui.canRedo ? "" : "disabled"}>↷</button>
        <button type="button" class="spr-icon-button ${!ui.inspectorCollapsed ? "is-active" : ""}" data-set-piece-action="toggle-inspector" title="Toggle details" aria-label="Toggle details" aria-pressed="${Boolean(!ui.inspectorCollapsed)}">≡</button>
        <button type="button" class="spr-icon-button" data-set-piece-action="presentation" title="Presentation view" aria-label="Presentation view">⛶</button>
      </div>
    </div>
    ${renderPlayback(variant, phase, ui)}
    <div class="spr-board-row">
      ${renderToolRail(ui, roster)}
      <div class="spr-board-stage" data-set-piece-board-stage>
        ${ui.showGhost && previousPhase ? '<span class="spr-ghost-status">Previous phase shown</span>' : ""}
        ${renderSetPieceBoard({
          phase,
          previousPhase: ui.showGhost ? previousPhase : null,
          pitchView: play.pitchView,
          layers: ui.layers,
          selectedElementIds: ui.selectedElementIds,
          selectedDrawingId: ui.selectedDrawingId,
          previewDrawing: ui.previewDrawing,
          selectionRect: ui.selectionRect,
        })}
      </div>
    </div>
    <div class="spr-timeline" aria-label="Phase timeline">
      <div class="spr-phase-strip">
        ${variant.phases.map((item, index) => `<button type="button" class="spr-phase-card ${item.id === phase.id ? "is-active" : ""}" data-set-piece-phase-id="${escapeSetPieceHtml(item.id)}">
          ${renderSetPiecePhaseThumbnail(item, play.pitchView)}
          <span><b>${String(index + 1).padStart(2, "0")}</b><i data-set-piece-phase-title="${escapeSetPieceHtml(item.id)}">${escapeSetPieceHtml(item.title)}</i></span>
        </button>`).join("")}
        <button type="button" class="spr-add-phase" data-set-piece-action="add-phase" title="Duplicate current phase" aria-label="Duplicate current phase" ${canEdit ? "" : "disabled"}>＋</button>
      </div>
    </div>
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
  return `<label class="spr-field"><span>${label}</span><input type="${options.type || "text"}" value="${escapeSetPieceHtml(value)}" data-${options.scope || "set-piece-play"}-field="${field}" ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${disabled}></label>`;
}

function renderElementInspector(element, roster, canEdit) {
  const isHome = element.kind === "home-player";
  return `<div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>${isHome ? "Selected player" : "Selected object"}</p><strong>${escapeSetPieceHtml(isHome ? element.label : element.kind === "opponent" ? `Opponent ${element.label}` : "Ball")}</strong></div><button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-selection" title="Delete" aria-label="Delete" ${canEdit ? "" : "disabled"}>⌫</button></div>
    ${isHome ? renderField("Player", "profileId", element.profileId, { type: "select", options: roster.map((entry) => ({ value: entry.id, label: entry.name })), scope: "set-piece-element", disabled: !canEdit }) : ""}
    ${isHome ? renderField("Role", "role", element.role, { scope: "set-piece-element", disabled: !canEdit }) : ""}
    ${renderField("Instruction", "instruction", element.instruction, { type: "textarea", scope: "set-piece-element", disabled: !canEdit })}
    <div class="spr-field-grid">
      ${renderField("Delay ms", "delayMs", element.delayMs, { type: "number", min: 0, max: 10000, scope: "set-piece-element", disabled: !canEdit })}
      ${renderField("Duration ms", "durationMs", element.durationMs, { type: "number", min: 100, max: 10000, scope: "set-piece-element", disabled: !canEdit })}
    </div>
    ${element.kind !== "ball" ? renderField("Body angle", "rotation", element.rotation, { type: "range", min: -180, max: 180, scope: "set-piece-element", disabled: !canEdit }) : ""}
  </div>`;
}

function renderDrawingInspector(drawing, canEdit) {
  return `<div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Movement</p><strong>${escapeSetPieceHtml(drawing.type)}</strong></div><button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-selection" title="Delete" aria-label="Delete" ${canEdit ? "" : "disabled"}>⌫</button></div>
    ${renderField("Label", "label", drawing.label, { scope: "set-piece-drawing", disabled: !canEdit })}
    ${drawing.type !== "zone" ? renderField("Curve", "curve", drawing.curve, { type: "range", min: -36, max: 36, scope: "set-piece-drawing", disabled: !canEdit }) : ""}
  </div>`;
}

function renderPlanInspector(play, variant, phase, ui, canEdit) {
  return `<div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Plan</p><strong data-set-piece-live-text="play-title">${escapeSetPieceHtml(play.title)}</strong></div><button type="button" class="spr-icon-button" data-set-piece-action="duplicate-play" title="Duplicate plan" aria-label="Duplicate plan" ${canEdit ? "" : "disabled"}>⧉</button></div>
    ${renderField("Title", "title", play.title, { disabled: !canEdit })}
    <div class="spr-field-grid">
      ${renderField("Restart", "restart", play.restart, { type: "select", options: setPieceRestartOptions, disabled: !canEdit })}
      ${renderField("Moment", "moment", play.moment, { type: "select", options: setPieceMomentOptions, disabled: !canEdit })}
    </div>
    ${renderField("Context", "context", play.context, { type: "select", options: setPieceContextOptions, disabled: !canEdit })}
    <div class="spr-field-grid">
      ${renderField("Date", "scheduledFor", play.scheduledFor, { type: "date", disabled: !canEdit })}
      ${renderField("Opponent", "opponent", play.opponent, { disabled: !canEdit })}
    </div>
    ${renderField("Objective", "objective", play.objective, { type: "textarea", disabled: !canEdit })}
  </div>
  <div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Variant</p><strong data-set-piece-live-text="variant-title">${escapeSetPieceHtml(variant.title)}</strong></div>${play.variants.length > 1 ? `<button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-variant" title="Delete variant" aria-label="Delete variant" ${canEdit ? "" : "disabled"}>⌫</button>` : ""}</div>
    ${renderField("Variant name", "title", variant.title, { scope: "set-piece-variant", disabled: !canEdit })}
    ${renderField("Opponent trigger", "trigger", variant.trigger, { type: "textarea", scope: "set-piece-variant", disabled: !canEdit })}
  </div>
  <div class="spr-inspector-section">
    <div class="spr-inspector-title"><div><p>Phase</p><strong data-set-piece-live-text="phase-title">${escapeSetPieceHtml(phase.title)}</strong></div><div class="spr-inline-actions"><button type="button" class="spr-icon-button" data-set-piece-action="move-phase-left" title="Move phase left" aria-label="Move phase left" ${canEdit ? "" : "disabled"}>←</button><button type="button" class="spr-icon-button" data-set-piece-action="move-phase-right" title="Move phase right" aria-label="Move phase right" ${canEdit ? "" : "disabled"}>→</button>${variant.phases.length > 1 ? `<button type="button" class="spr-icon-button is-danger" data-set-piece-action="delete-phase" title="Delete phase" aria-label="Delete phase" ${canEdit ? "" : "disabled"}>⌫</button>` : ""}</div></div>
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
  <button type="button" class="spr-delete-plan" data-set-piece-action="delete-play" ${canEdit ? "" : "disabled"}>Delete set piece</button>`;
}

function renderInspector(play, variant, phase, roster, ui, canEdit) {
  if (!play || !variant || !phase) return '<aside class="spr-inspector"></aside>';
  const selectedElement = phase.elements.find((element) => ui.selectedElementIds.has(element.id));
  const selectedDrawing = phase.drawings.find((drawing) => drawing.id === ui.selectedDrawingId);
  const content = selectedElement
    ? renderElementInspector(selectedElement, roster, canEdit)
    : selectedDrawing
      ? renderDrawingInspector(selectedDrawing, canEdit)
      : renderPlanInspector(play, variant, phase, ui, canEdit);
  return `<aside class="spr-inspector" aria-label="Set piece inspector">${content}</aside>`;
}

export function renderSetPiecesWorkspace(options = {}) {
  const state = options.state || { plays: [] };
  const ui = options.ui || {};
  const roster = options.roster || [];
  const play = getActiveSetPiece(state);
  const variant = getActiveSetPieceVariant(play || {});
  const phase = getActiveSetPiecePhase(variant || {});
  const canEdit = options.canEdit !== false;
  return `<section class="spr-shell ${ui.presentationMode ? "is-presenting" : ""} ${ui.inspectorCollapsed ? "is-inspector-collapsed" : ""}" data-set-pieces-room>
    <header class="spr-header">
      <div><p>Football Science</p><h1>Set Pieces Room</h1></div>
      <div class="spr-save-state ${ui.saveState === "error" ? "is-error" : ""}" role="status">${escapeSetPieceHtml(ui.saveMessage || (canEdit ? "Saved" : "View only"))}</div>
    </header>
    <div class="spr-layout">
      ${renderPlayLibrary(state, ui)}
      ${renderBoardWorkspace(play, variant, phase, roster, ui, canEdit)}
      ${renderInspector(play, variant, phase, roster, ui, canEdit)}
    </div>
  </section>`;
}
