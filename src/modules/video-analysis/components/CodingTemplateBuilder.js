import { descriptorGroups } from "../constants/descriptors.js";
import { escapeHtml, optionList } from "./renderHelpers.js";

function renderButton(item = {}, state = {}) {
  const active = state.codingSession?.activeButtonId === item.id || state.draft?.[item.type] === item.value;
  return `
    <button type="button" class="video-analysis-code-button${active ? " is-active" : ""}"
      data-video-analysis-code-button="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.label)}</span>
      ${item.hotkey ? `<kbd>${escapeHtml(item.hotkey)}</kbd>` : ""}
    </button>
  `;
}

function renderButtonGroup(group = "", buttons = [], state = {}) {
  return `
    <section class="video-analysis-code-group">
      <div class="video-analysis-code-group__header">${escapeHtml(group)}</div>
      <div class="video-analysis-code-grid">
        ${buttons.map((item) => renderButton(item, state)).join("")}
      </div>
    </section>
  `;
}

function renderDescriptor(group = {}, draft = {}) {
  return `
    <label>
      <span>${escapeHtml(group.label)}</span>
      <select data-video-analysis-draft="${escapeHtml(group.id)}">
        <option value="">Any</option>${optionList(group.options, draft[group.id])}
      </select>
    </label>
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
          <p class="video-analysis-kicker">Coding Template</p>
          <h3>${escapeHtml(template.title || "Football Science Coding")}</h3>
        </div>
        <div class="video-analysis-mode-toggle" role="group" aria-label="Coding mode">
          <button type="button" class="${state.codingSession?.mode === "manual" ? "is-active" : ""}" data-video-analysis-mode="manual">Manual</button>
          <button type="button" class="${state.codingSession?.mode === "instant" ? "is-active" : ""}" data-video-analysis-mode="instant">Instant</button>
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
