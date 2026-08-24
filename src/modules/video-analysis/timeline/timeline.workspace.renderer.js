import { activeAnalysisTimeline, normalizeTimelineWorkspace } from "../domain/timelineWorkspace.model.js";
import { escapeHtml } from "../components/renderHelpers.js";

function renderTimelineTabs(workspace = {}) {
  return `
    <div class="video-analysis-workspace-tabs" role="tablist" aria-label="Analysis timelines">
      ${workspace.timelines.map((timeline) => `
        <button
          type="button"
          role="tab"
          class="${timeline.id === workspace.activeTimelineId ? "is-active" : ""}${workspace.dirtyTimelineIds.includes(timeline.id) ? " is-dirty" : ""}"
          data-video-analysis-workspace-timeline="${escapeHtml(timeline.id)}"
          aria-selected="${timeline.id === workspace.activeTimelineId ? "true" : "false"}"
          aria-label="${escapeHtml(`${timeline.title}${workspace.dirtyTimelineIds.includes(timeline.id) ? ", unsaved changes" : ""}`)}"
        >${escapeHtml(timeline.title)}</button>
      `).join("")}
    </div>
  `;
}

function renderSaveControl(workspace = {}, canEdit = false) {
  const dirty = workspace.dirtyTimelineIds.includes(workspace.activeTimelineId);
  const saving = workspace.saveStatus === "saving";
  const label = saving ? "Saving..." : dirty ? "Save" : "Saved";
  return `
    <button type="button" data-video-analysis-workspace-save ${canEdit && dirty && !saving ? "" : "disabled"}>${label}</button>
  `;
}

function renderCollaborationControl(workspace = {}, canEdit = false) {
  const collaboration = workspace.collaboration || {};
  const connected = collaboration.status === "connected";
  const connecting = collaboration.status === "connecting";
  const participantCount = collaboration.participants?.length || 0;
  const label = connecting ? "Connecting..." : connected ? `Live (${participantCount})` : "Go live";
  return `
    <button
      type="button"
      class="video-analysis-workspace-collaboration${connected ? " is-live" : ""}"
      data-video-analysis-workspace-collaboration
      aria-pressed="${connected ? "true" : "false"}"
      title="${escapeHtml(collaboration.error || (connected ? "Leave live collaboration" : "Start live collaboration"))}"
      ${canEdit && !connecting ? "" : "disabled"}
    >${escapeHtml(label)}</button>
  `;
}

function renderRowMoveButton(row = {}, direction = 0, disabled = false) {
  const label = direction < 0 ? "Move row up" : "Move row down";
  return `
    <button
      type="button"
      class="video-analysis-workspace-icon-button"
      data-video-analysis-workspace-row-move="${escapeHtml(`${row.id}:${direction}`)}"
      aria-label="${label}"
      title="${label}"
      ${disabled ? "disabled" : ""}
    >${direction < 0 ? "^" : "v"}</button>
  `;
}

function renderTimelineRow(row = {}, index = 0, rows = [], selectedIds = new Set(), selectedClipCount = 0) {
  return `
    <div class="video-analysis-workspace-row${selectedIds.has(row.id) ? " is-selected" : ""}${row.locked ? " is-locked" : ""}">
      <input
        type="checkbox"
        data-video-analysis-workspace-row-select="${escapeHtml(row.id)}"
        aria-label="Select ${escapeHtml(row.label)}"
        ${selectedIds.has(row.id) ? "checked" : ""}
      >
      <input
        type="color"
        data-video-analysis-workspace-row-color="${escapeHtml(row.id)}"
        value="${escapeHtml(row.color)}"
        aria-label="Color for ${escapeHtml(row.label)}"
        title="Row color"
        ${row.locked ? "disabled" : ""}
      >
      <input
        type="text"
        data-video-analysis-workspace-row-label="${escapeHtml(row.id)}"
        value="${escapeHtml(row.label)}"
        maxlength="120"
        aria-label="Row name"
        ${row.locked ? "disabled" : ""}
      >
      <span>${escapeHtml(`${row.clipIds.length} clips`)}</span>
      <div class="video-analysis-workspace-row-actions">
        ${renderRowMoveButton(row, -1, index === 0 || row.locked)}
        ${renderRowMoveButton(row, 1, index === rows.length - 1 || row.locked)}
        <button type="button" data-video-analysis-workspace-clips-place="${escapeHtml(`${row.id}:move`)}" title="Move selected clips to this row" ${selectedClipCount && !row.locked ? "" : "disabled"}>Move</button>
        <button type="button" data-video-analysis-workspace-clips-place="${escapeHtml(`${row.id}:duplicate`)}" title="Duplicate selected clips to this row" ${selectedClipCount && !row.locked ? "" : "disabled"}>Copy</button>
      </div>
      <label class="video-analysis-workspace-toggle" title="Hide row">
        <input type="checkbox" data-video-analysis-workspace-row-hidden="${escapeHtml(row.id)}" ${row.hidden ? "checked" : ""} ${row.locked ? "disabled" : ""}>
        <span>Hide</span>
      </label>
      <label class="video-analysis-workspace-toggle" title="Lock row">
        <input type="checkbox" data-video-analysis-workspace-row-locked="${escapeHtml(row.id)}" ${row.locked ? "checked" : ""}>
        <span>Lock</span>
      </label>
    </div>
  `;
}

function renderTimelineEditor(workspace = {}, canEdit = false, selectedClipCount = 0) {
  if (!workspace.editorOpen) return "";
  const timeline = activeAnalysisTimeline(workspace);
  if (!timeline) return "";
  const selectedIds = new Set(workspace.selectedRowIds);
  const selectedCount = selectedIds.size;
  return `
    <div class="video-analysis-workspace-editor" data-video-analysis-workspace-editor>
      <button type="button" class="video-analysis-workspace-editor__backdrop" data-video-analysis-workspace-editor-close aria-label="Close timeline editor"></button>
      <section class="video-analysis-workspace-editor__panel${workspace.error ? " has-error" : ""}" role="dialog" aria-modal="true" aria-label="Timeline rows">
        <header>
          <input type="text" data-video-analysis-workspace-timeline-title value="${escapeHtml(timeline.title)}" maxlength="180" aria-label="Timeline name">
          <button type="button" class="video-analysis-workspace-icon-button" data-video-analysis-workspace-editor-close aria-label="Close timeline editor" title="Close">x</button>
        </header>
        <div class="video-analysis-workspace-batch-actions">
          ${renderSaveControl(workspace, canEdit)}
          <span>${escapeHtml(`${selectedClipCount} selected clips`)}</span>
          <button type="button" data-video-analysis-workspace-row-add>+ Row</button>
          <button type="button" data-video-analysis-workspace-rows-duplicate ${selectedCount ? "" : "disabled"}>Duplicate</button>
          <button type="button" data-video-analysis-workspace-rows-hide ${selectedCount ? "" : "disabled"}>Hide/show</button>
          <button type="button" data-video-analysis-workspace-rows-remove ${selectedCount ? "" : "disabled"}>Archive</button>
          <button type="button" data-video-analysis-workspace-undo ${workspace.history.length ? "" : "disabled"}>Undo${workspace.history.length ? ` (${workspace.history.length})` : ""}</button>
        </div>
        ${workspace.error ? `<div class="video-analysis-workspace-status is-error" role="alert">${escapeHtml(workspace.error)}</div>` : ""}
        <div class="video-analysis-workspace-row-list">
          ${timeline.rows.length
            ? timeline.rows.map((row, index) => renderTimelineRow(row, index, timeline.rows, selectedIds, selectedClipCount)).join("")
            : '<div class="video-analysis-workspace-row-empty">No rows</div>'}
        </div>
      </section>
    </div>
  `;
}

export function renderTimelineWorkspaceControls(workspaceValue = {}, canEdit = false, selectedClipCount = 0) {
  const workspace = normalizeTimelineWorkspace(workspaceValue);
  return `
    <div class="video-analysis-workspace-bar">
      ${renderTimelineTabs(workspace)}
      <div class="video-analysis-workspace-bar__actions">
        ${renderCollaborationControl(workspace, canEdit)}
        ${renderSaveControl(workspace, canEdit)}
        <button type="button" class="video-analysis-workspace-icon-button" data-video-analysis-workspace-timeline-add aria-label="Add timeline" title="Add timeline" ${canEdit ? "" : "disabled"}>+</button>
        <button type="button" data-video-analysis-workspace-editor-open ${canEdit ? "" : "disabled"}>Rows</button>
      </div>
    </div>
    ${renderTimelineEditor(workspace, canEdit, selectedClipCount)}
  `;
}
