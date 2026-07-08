import { unitTagOptionsForState } from "../services/unitTagService.js";
import { escapeHtml } from "./renderHelpers.js";

function selectedUnitLabel(state = {}) {
  return String(state.codingSession?.lastUnitTag || state.draft?.unit || "").trim();
}

function unitEditorDraftOptions(state = {}) {
  if (Array.isArray(state.codingSession?.unitEditorDraft)) {
    return state.codingSession.unitEditorDraft.map((option) => String(option ?? ""));
  }
  return unitTagOptionsForState(state);
}

export function renderUnitLauncher(state = {}) {
  const activeUnit = selectedUnitLabel(state);
  return `
    <section class="video-analysis-code-group video-analysis-unit-launcher">
      <div class="video-analysis-code-group__header">
        <span>Unit</span>
      </div>
      <button
        type="button"
        class="video-analysis-code-button video-analysis-unit-picker-button${activeUnit ? " is-active" : ""}"
        data-video-analysis-unit-open
        style="--video-analysis-button-color: #0f766e"
        aria-haspopup="dialog"
      >
        <span class="video-analysis-code-button__label">${escapeHtml(activeUnit || "Unit")}</span>
      </button>
    </section>
  `;
}

export function renderOutcomeTagLauncher(state = {}) {
  const active = state.codingSession?.lastOutcomeTag === "Development";
  return `
    <section class="video-analysis-code-group video-analysis-outcome-launcher">
      <div class="video-analysis-code-group__header">
        <span>Outcome</span>
      </div>
      <button
        type="button"
        class="video-analysis-code-button video-analysis-outcome-tag-button${active ? " is-active" : ""}"
        data-video-analysis-outcome-tag="Development"
        style="--video-analysis-button-color: #dc2626"
        aria-label="Tag Development outcome at the current timestamp"
      >
        <span class="video-analysis-code-button__label">Development</span>
      </button>
    </section>
  `;
}

function renderUnitEditor(state = {}) {
  if (!state.codingSession?.unitEditorOpen) return "";
  const draftOptions = unitEditorDraftOptions(state);
  const hasSavableOption = draftOptions.some((option) => String(option || "").trim());
  return `
    <div class="video-analysis-unit-editor-overlay" role="dialog" aria-modal="true" aria-labelledby="video-analysis-unit-editor-title">
      <button type="button" class="video-analysis-unit-editor-backdrop" data-video-analysis-unit-editor-close aria-label="Close unit editor"></button>
      <section class="video-analysis-unit-editor-panel">
        <header class="video-analysis-unit-editor-header">
          <div>
            <p class="video-analysis-kicker">Units</p>
            <h4 id="video-analysis-unit-editor-title">Edit unit buttons</h4>
          </div>
          <button type="button" class="video-analysis-mg-picker-close" data-video-analysis-unit-editor-close aria-label="Close"></button>
        </header>
        <div class="video-analysis-unit-editor-list">
          ${draftOptions.map((unit, index) => `
            <label class="video-analysis-unit-editor-row">
              <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
              <input
                type="text"
                value="${escapeHtml(unit)}"
                data-video-analysis-unit-editor-name="${escapeHtml(index)}"
                aria-label="Unit name ${escapeHtml(index + 1)}"
              >
              <button
                type="button"
                data-video-analysis-unit-editor-remove="${escapeHtml(index)}"
                aria-label="Remove ${escapeHtml(unit || `unit ${index + 1}`)}"
              >Remove</button>
            </label>
          `).join("")}
        </div>
        <footer class="video-analysis-unit-editor-footer">
          <button type="button" class="video-analysis-unit-editor-add" data-video-analysis-unit-editor-add>Add unit</button>
          <div>
            <button type="button" class="video-analysis-unit-editor-cancel" data-video-analysis-unit-editor-close>Cancel</button>
            <button type="button" class="video-analysis-unit-editor-save" data-video-analysis-unit-editor-save ${hasSavableOption ? "" : "disabled"}>Save units</button>
          </div>
        </footer>
      </section>
    </div>
  `;
}

export function renderUnitPicker(state = {}) {
  if (!state.codingSession?.unitPickerOpen) return "";
  const selected = selectedUnitLabel(state);
  const unitOptions = unitTagOptionsForState(state);
  return `
    <div class="video-analysis-mg-picker-overlay video-analysis-unit-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="video-analysis-unit-picker-title">
      <button type="button" class="video-analysis-mg-picker-backdrop" data-video-analysis-unit-close aria-label="Close unit picker"></button>
      <section class="video-analysis-mg-picker-panel video-analysis-unit-picker-panel">
        <header class="video-analysis-mg-picker-header">
          <div class="video-analysis-mg-picker-titlebar">
            <h3 id="video-analysis-unit-picker-title">Unit</h3>
          </div>
          <div class="video-analysis-mg-picker-header-actions">
            <button type="button" class="video-analysis-unit-picker-edit" data-video-analysis-unit-edit-open>Edit</button>
            <button type="button" class="video-analysis-mg-picker-close" data-video-analysis-unit-close aria-label="Close"></button>
          </div>
        </header>
        <div class="video-analysis-mg-picker-body">
          <section class="video-analysis-unit-picker-group">
            <div class="video-analysis-unit-picker-grid">
              ${unitOptions.map((unit) => `
                <button
                  type="button"
                  class="video-analysis-mg-principle-chip video-analysis-unit-chip${selected === unit ? " is-active" : ""}"
                  data-video-analysis-unit-tag="${escapeHtml(unit)}"
                  aria-pressed="${selected === unit ? "true" : "false"}"
                >
                  <span>${escapeHtml(unit)}</span>
                </button>
              `).join("")}
            </div>
          </section>
        </div>
      </section>
      ${renderUnitEditor(state)}
    </div>
  `;
}
