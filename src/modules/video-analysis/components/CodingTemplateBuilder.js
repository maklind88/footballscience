import { descriptorGroups } from "../constants/descriptors.js";
import { escapeHtml } from "./renderHelpers.js";

const behaviorOptions = [
  ["create_tag", "Create tag"],
  ["toggle_duration", "Duration toggle"],
  ["label_current", "Label current"],
  ["descriptor", "Descriptor"],
  ["player_tag", "Player tag"],
];

function secondsFromMs(value = 0, fallback = 15) {
  const seconds = Math.round(Number(value || 0) / 1000);
  return Number.isFinite(seconds) ? seconds : fallback;
}

function behaviorOptionList(selected = "") {
  return behaviorOptions
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderButton(item = {}, state = {}) {
  const targetField = item.targetField || item.type;
  const active = state.codingSession?.activeButtonId === item.id || state.draft?.[targetField] === item.value;
  const durationSeconds = secondsFromMs(item.defaultDurationMs ?? item.endOffsetMs ?? 15000);
  return `
    <button type="button" class="video-analysis-code-button${active ? " is-active" : ""}"
      data-video-analysis-code-button="${escapeHtml(item.id)}"
      style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}">
      <span class="video-analysis-code-button__label">${escapeHtml(item.label)}</span>
      <span class="video-analysis-code-button__meta">
        <small>${escapeHtml(`${durationSeconds}s`)}</small>
        ${item.hotkey ? `<kbd>${escapeHtml(item.hotkey)}</kbd>` : ""}
      </span>
    </button>
  `;
}

function renderButtonEditor(item = {}) {
  return `
    <article class="video-analysis-code-button-editor">
      <div class="video-analysis-code-button-editor__head">
        <span style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}"></span>
        <strong>${escapeHtml(item.label)}</strong>
      </div>
      <div class="video-analysis-button-editor-grid">
        <label>Name<input type="text" data-video-analysis-button-field="${escapeHtml(item.id)}:label" value="${escapeHtml(item.label)}"></label>
        <label>Color<input type="color" data-video-analysis-button-field="${escapeHtml(item.id)}:color" value="${escapeHtml(item.color || "#143522")}"></label>
        <label>Hotkey<input type="text" maxlength="12" data-video-analysis-button-field="${escapeHtml(item.id)}:hotkey" value="${escapeHtml(item.hotkey || "")}"></label>
        <label>Duration s<input type="number" min="1" max="900" step="1" data-video-analysis-button-ms-field="${escapeHtml(item.id)}:defaultDurationMs" value="${escapeHtml(secondsFromMs(item.defaultDurationMs, 15))}"></label>
        <label>Start offset s<input type="number" min="-120" max="120" step="1" data-video-analysis-button-ms-field="${escapeHtml(item.id)}:startOffsetMs" value="${escapeHtml(secondsFromMs(item.startOffsetMs, 0))}"></label>
        <label>End offset s<input type="number" min="1" max="900" step="1" data-video-analysis-button-ms-field="${escapeHtml(item.id)}:endOffsetMs" value="${escapeHtml(secondsFromMs(item.endOffsetMs, 15))}"></label>
        <label>Behavior<select data-video-analysis-button-field="${escapeHtml(item.id)}:buttonBehavior">${behaviorOptionList(item.buttonBehavior || "create_tag")}</select></label>
      </div>
    </article>
  `;
}

function renderButtonGroup(group = "", buttons = [], state = {}) {
  const editing = state.codingSession?.panelMode === "edit";
  return `
    <section class="video-analysis-code-group">
      <div class="video-analysis-code-group__header">${escapeHtml(group)}</div>
      <div class="video-analysis-code-grid">
        ${buttons.map((item) => renderButton(item, state)).join("")}
      </div>
      ${editing ? `<div class="video-analysis-code-edit-grid">${buttons.map(renderButtonEditor).join("")}</div>` : ""}
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
  const groups = new Map();
  for (const item of template.buttons || []) {
    const group = item.group || item.type;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return `
    <section class="video-analysis-template-builder">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Tag Panel</p>
          <h3>${escapeHtml(template.title || "Football Science Coding")}</h3>
        </div>
        <div class="video-analysis-mode-toggle" role="group" aria-label="Tag panel mode">
          <button type="button" class="${state.codingSession?.panelMode !== "edit" ? "is-active" : ""}" data-video-analysis-panel-mode="use">Use</button>
          <button type="button" class="${state.codingSession?.panelMode === "edit" ? "is-active" : ""}" data-video-analysis-panel-mode="edit">Edit</button>
        </div>
      </div>
      <div class="video-analysis-template-scroll">
        ${[...groups.entries()].map(([group, buttons]) => renderButtonGroup(group, buttons, state)).join("")}
        <section class="video-analysis-descriptor-panel">
          <div class="video-analysis-code-group__header">Descriptors</div>
          <div class="video-analysis-descriptor-grid">
            ${descriptorGroups.map((group) => renderDescriptor(group, state.draft || {})).join("")}
          </div>
        </section>
      </div>
    </section>
  `;
}
