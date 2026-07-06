import { descriptorGroups } from "../constants/descriptors.js";
import { escapeHtml } from "./renderHelpers.js";

const unitOptions = Object.freeze(
  descriptorGroups.find((group) => group.id === "unit")?.options || []
);

function selectedUnitLabel(state = {}) {
  return String(state.codingSession?.lastUnitTag || state.draft?.unit || "").trim();
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

export function renderUnitPicker(state = {}) {
  if (!state.codingSession?.unitPickerOpen) return "";
  const selected = selectedUnitLabel(state);
  return `
    <div class="video-analysis-mg-picker-overlay video-analysis-unit-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="video-analysis-unit-picker-title">
      <button type="button" class="video-analysis-mg-picker-backdrop" data-video-analysis-unit-close aria-label="Close unit picker"></button>
      <section class="video-analysis-mg-picker-panel video-analysis-unit-picker-panel">
        <header class="video-analysis-mg-picker-header">
          <div class="video-analysis-mg-picker-titlebar">
            <h3 id="video-analysis-unit-picker-title">Unit</h3>
          </div>
          <button type="button" class="video-analysis-mg-picker-close" data-video-analysis-unit-close aria-label="Close"></button>
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
        <footer class="video-analysis-mg-picker-footer">
          <span>Choose the involved unit for this timestamp.</span>
        </footer>
      </section>
    </div>
  `;
}

export function unitTagOptions() {
  return [...unitOptions];
}
