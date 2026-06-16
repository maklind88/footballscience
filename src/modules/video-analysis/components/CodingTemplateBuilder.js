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
  const behavior = item.buttonBehavior || "create_tag";
  return `
    <button type="button" class="video-analysis-code-button${active ? " is-active" : ""}"
      data-video-analysis-code-button="${escapeHtml(item.id)}"
      style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}"
      aria-label="${escapeHtml(`${item.label} ${behavior === "create_tag" ? `creates ${durationSeconds} second tag` : behavior}`)}">
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
        <div>
          <span style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}"></span>
          <strong>${escapeHtml(item.label)}</strong>
        </div>
        <div class="video-analysis-code-button-editor__actions">
          <button type="button" data-video-analysis-duplicate-code-button="${escapeHtml(item.id)}">Duplicate</button>
          <button type="button" data-video-analysis-remove-code-button="${escapeHtml(item.id)}">Archive</button>
        </div>
      </div>
      <div class="video-analysis-button-editor-grid">
        <label>Button name<input type="text" data-video-analysis-button-field="${escapeHtml(item.id)}:label" value="${escapeHtml(item.label)}"></label>
        <label>Color<input type="color" data-video-analysis-button-field="${escapeHtml(item.id)}:color" value="${escapeHtml(item.color || "#143522")}"></label>
        <label>Hotkey<input type="text" maxlength="12" data-video-analysis-button-field="${escapeHtml(item.id)}:hotkey" value="${escapeHtml(item.hotkey || "")}"></label>
        <label>Clip length<input type="number" min="1" max="900" step="1" data-video-analysis-button-ms-field="${escapeHtml(item.id)}:defaultDurationMs" value="${escapeHtml(secondsFromMs(item.defaultDurationMs, 15))}"></label>
        <label>Lead / start<input type="number" min="-120" max="120" step="1" data-video-analysis-button-ms-field="${escapeHtml(item.id)}:startOffsetMs" value="${escapeHtml(secondsFromMs(item.startOffsetMs, 0))}"></label>
        <label>Lag / end<input type="number" min="1" max="900" step="1" data-video-analysis-button-ms-field="${escapeHtml(item.id)}:endOffsetMs" value="${escapeHtml(secondsFromMs(item.endOffsetMs, 15))}"></label>
        <label>Behavior<select data-video-analysis-button-field="${escapeHtml(item.id)}:buttonBehavior">${behaviorOptionList(item.buttonBehavior || "create_tag")}</select></label>
      </div>
    </article>
  `;
}

function renderButtonGroup(group = "", buttons = [], state = {}) {
  const editing = state.codingSession?.panelMode === "edit";
  return `
    <section class="video-analysis-code-group">
      <div class="video-analysis-code-group__header">
        <span>${escapeHtml(group)}</span>
        ${editing ? `<button type="button" data-video-analysis-add-code-button-group="${escapeHtml(group)}">+ Button</button>` : ""}
      </div>
      <div class="video-analysis-code-grid">
        ${buttons.map((item) => renderButton(item, state)).join("")}
      </div>
      ${editing ? `<div class="video-analysis-code-edit-grid">${buttons.map(renderButtonEditor).join("")}</div>` : ""}
    </section>
  `;
}

function renderPanelBuilderControls(state = {}, groupNames = []) {
  const draft = state.codingSession?.templateBuilder || {};
  const selectedGroup = draft.newButtonGroup || groupNames[0] || "Custom";
  const groupOptions = groupNames.length ? groupNames : ["Custom"];
  return `
    <section class="video-analysis-panel-builder">
      <div class="video-analysis-panel-builder__title">
        <p class="video-analysis-kicker">Panel Builder</p>
        <strong>Tag buttons</strong>
      </div>
      <label>
        <span>New group</span>
        <input type="text" data-video-analysis-template-builder-field="newGroupName" value="${escapeHtml(draft.newGroupName || "")}" placeholder="Group name">
      </label>
      <button type="button" data-video-analysis-add-button-group>Add group</button>
      <label>
        <span>Button group</span>
        <select data-video-analysis-template-builder-field="newButtonGroup">
          ${groupOptions.map((group) => `<option value="${escapeHtml(group)}" ${group === selectedGroup ? "selected" : ""}>${escapeHtml(group)}</option>`).join("")}
        </select>
      </label>
      <button type="button" data-video-analysis-add-code-button>Add button</button>
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
  const groups = new Map();
  for (const item of template.buttons || []) {
    const group = item.group || item.type;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  const groupNames = [...groups.keys()];
  return `
    <section class="video-analysis-template-builder" data-video-analysis-code-window>
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Code Window</p>
          ${editing ? `
            <label class="video-analysis-template-title-field">
              <span>Panel name</span>
              <input type="text" data-video-analysis-template-field="title" value="${escapeHtml(template.title || "Football Science Tag Panel")}">
            </label>
          ` : `<h3>${escapeHtml(template.title || "Football Science Coding")}</h3>`}
        </div>
        <div class="video-analysis-template-actions">
          <div class="video-analysis-mode-toggle" role="group" aria-label="Code window mode">
            <button type="button" class="${!editing ? "is-active" : ""}" data-video-analysis-panel-mode="use">Code</button>
            <button type="button" class="${editing ? "is-active" : ""}" data-video-analysis-panel-mode="edit">Edit</button>
          </div>
          ${editing ? `<button type="button" class="video-analysis-template-save" data-video-analysis-save-template>Save panel</button>` : ""}
        </div>
      </div>
      <div class="video-analysis-template-scroll">
        ${editing ? renderPanelBuilderControls(state, groupNames) : ""}
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
