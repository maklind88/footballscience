import { descriptorGroups } from "../constants/descriptors.js";
import { groupCodingTemplateButtons } from "../services/codingTemplateService.js";
import { renderPanelBuilderOverlay } from "./PanelBuilderOverlay.js";
import { escapeHtml } from "./renderHelpers.js";

function secondsFromMs(value = 0, fallback = 15) {
  const seconds = Math.round(Number(value || 0) / 1000);
  return Number.isFinite(seconds) ? seconds : fallback;
}

function behaviorMetaLabel(behavior = "create_tag", durationSeconds = 15) {
  if (behavior === "toggle_duration") return "toggle";
  if (behavior === "label_current") return "label";
  if (behavior === "descriptor") return "descriptor";
  if (behavior === "player_tag") return "player";
  return `${durationSeconds}s`;
}

function renderButton(item = {}, state = {}) {
  const targetField = item.targetField || item.type;
  const active = state.codingSession?.activeButtonId === item.id || state.draft?.[targetField] === item.value;
  const durationSeconds = secondsFromMs(item.defaultDurationMs ?? item.endOffsetMs ?? 15000);
  const behavior = item.buttonBehavior || "create_tag";
  return `
    <button type="button" class="video-analysis-code-button${active ? " is-active" : ""}"
      data-video-analysis-code-button="${escapeHtml(item.id)}"
      style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}"
      aria-label="${escapeHtml(`${item.label} ${behavior === "create_tag" ? `creates ${durationSeconds} second tag` : behavior}`)}">
      <span class="video-analysis-code-button__label">${escapeHtml(item.label)}</span>
      <span class="video-analysis-code-button__meta">
        <small>${escapeHtml(behaviorMetaLabel(behavior, durationSeconds))}</small>
        ${item.hotkey ? `<kbd>${escapeHtml(item.hotkey)}</kbd>` : ""}
      </span>
    </button>
  `;
}

function renderButtonGroup(group = "", buttons = [], state = {}) {
  return `
    <section class="video-analysis-code-group" data-video-analysis-code-group="${escapeHtml(group)}">
      <div class="video-analysis-code-group__header">
        <span>${escapeHtml(group)}</span>
      </div>
      <div class="video-analysis-code-grid">
        ${buttons.map((item) => renderButton(item, state)).join("")}
      </div>
    </section>
  `;
}

function renderDescriptor(group = {}, draft = {}) {
  return `
    <section class="video-analysis-code-group video-analysis-descriptor-group">
      <div class="video-analysis-code-group__header">${escapeHtml(group.label)}</div>
      <div class="video-analysis-code-grid video-analysis-descriptor-button-grid">
        <button type="button" class="video-analysis-code-button${!draft[group.id] ? " is-active" : ""}"
          data-video-analysis-descriptor-button="${escapeHtml(group.id)}:">Any</button>
        ${(group.options || []).map((option) => `
          <button type="button" class="video-analysis-code-button${draft[group.id] === option ? " is-active" : ""}"
            data-video-analysis-descriptor-button="${escapeHtml(group.id)}:${escapeHtml(option)}">
            <span class="video-analysis-code-button__label">${escapeHtml(option)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderCodingTemplateBuilder(state = {}) {
  const template = state.template || {};
  const editing = state.codingSession?.panelMode === "edit";
  const groups = groupCodingTemplateButtons(template);
  const groupEntries = groups.map((group) => [group.label, group.buttons]);
  const codingState = editing
    ? { ...state, codingSession: { ...(state.codingSession || {}), panelMode: "use" } }
    : state;
  return `
    <section class="video-analysis-template-builder is-coding${editing ? " has-edit-overlay" : ""}" data-video-analysis-code-window>
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Code Window</p>
          <h3>${escapeHtml(template.title || "Football Science Coding")}</h3>
        </div>
        <div class="video-analysis-template-actions">
          <div class="video-analysis-mode-toggle" role="group" aria-label="Code window mode">
            <button type="button" class="${!editing ? "is-active" : ""}" data-video-analysis-panel-mode="use">Code</button>
            <button type="button" class="${editing ? "is-active" : ""}" data-video-analysis-panel-mode="edit">Edit</button>
          </div>
        </div>
      </div>
      <div class="video-analysis-template-scroll">
        ${groupEntries.map(([group, buttons]) => renderButtonGroup(group, buttons, codingState)).join("")}
        <section class="video-analysis-descriptor-panel">
          <div class="video-analysis-code-group__header">Descriptors</div>
          <div class="video-analysis-descriptor-grid">
            ${descriptorGroups.map((group) => renderDescriptor(group, state.draft || {})).join("")}
          </div>
        </section>
      </div>
    </section>
    ${editing ? renderPanelBuilderOverlay(state, groups) : ""}
  `;
}
