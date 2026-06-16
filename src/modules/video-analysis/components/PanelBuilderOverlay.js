import { templateHotkeyIssues } from "../services/codingTemplateService.js";
import { escapeHtml } from "./renderHelpers.js";

const behaviorOptions = [
  ["create_tag", "Standard tag"],
  ["toggle_duration", "Duration tag"],
  ["label_current", "Label selected"],
  ["descriptor", "Descriptor label"],
  ["player_tag", "Player label"],
];

const targetFieldOptions = [
  ["tags", "Tag"],
  ["phase", "Phase"],
  ["subPhase", "Sub-phase"],
  ["teamPrincipleId", "Team Principle"],
  ["miniGamePrincipleId", "Mini-game Principle"],
  ["outcome", "Outcome"],
  ["unit", "Unit"],
  ["pitchZone", "Pitch zone"],
  ["pressure", "Pressure"],
  ["decision", "Decision"],
  ["execution", "Execution"],
  ["playerId", "Player"],
];

const colorPresets = [
  ["#1f5eff", "Blue"],
  ["#0f8a63", "Green"],
  ["#d97706", "Amber"],
  ["#7c3aed", "Purple"],
  ["#dc2626", "Red"],
  ["#334155", "Slate"],
];

function secondsFromMs(value = 0, fallback = 15) {
  const seconds = Math.round(Number(value || 0) / 1000);
  return Number.isFinite(seconds) ? seconds : fallback;
}

function leadSecondsFromMs(value = 0) {
  return Math.max(0, -secondsFromMs(value, 0));
}

function behaviorOptionList(selected = "") {
  return behaviorOptions
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function targetFieldOptionList(selected = "") {
  return targetFieldOptions
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function behaviorMetaLabel(behavior = "create_tag", durationSeconds = 15) {
  if (behavior === "toggle_duration") return "toggle";
  if (behavior === "label_current") return "label";
  if (behavior === "descriptor") return "descriptor";
  if (behavior === "player_tag") return "player";
  return `${durationSeconds}s`;
}

function clipSummary(item = {}) {
  const leadSeconds = leadSecondsFromMs(item.startOffsetMs);
  const endAfterClickSeconds = secondsFromMs(item.endOffsetMs, secondsFromMs(item.defaultDurationMs, 15));
  const start = leadSeconds ? `${leadSeconds}s before click` : "at click";
  return `Click creates ${start} to ${endAfterClickSeconds}s after click`;
}

function renderCodeButtonPreview(item = {}, active = false) {
  const durationSeconds = secondsFromMs(item.defaultDurationMs ?? item.endOffsetMs ?? 15000);
  const behavior = item.buttonBehavior || "create_tag";
  return `
    <div
      class="video-analysis-code-button${active ? " is-active" : ""}"
      style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}"
    >
      <span class="video-analysis-code-button__label">${escapeHtml(item.label)}</span>
      <span class="video-analysis-code-button__meta">
        <small>${escapeHtml(behaviorMetaLabel(behavior, durationSeconds))}</small>
        ${item.hotkey ? `<kbd>${escapeHtml(item.hotkey)}</kbd>` : ""}
      </span>
    </div>
  `;
}

function renderGroupReorderList(groups = [], selectedGroup = "", dirty = false, builder = {}) {
  return `
    <section class="video-analysis-panel-builder-column video-analysis-panel-builder-groups">
      <div class="video-analysis-builder-column-head">
        <p class="video-analysis-kicker">Groups</p>
        ${dirty ? `<span data-video-analysis-template-dirty>Unsaved changes</span>` : `<span>Saved</span>`}
      </div>
      <div class="video-analysis-builder-list" data-video-analysis-template-group-list>
        ${groups.map((group, index) => `
          <article
            class="video-analysis-builder-group-card${group.label === selectedGroup ? " is-active" : ""}"
            draggable="true"
            data-video-analysis-template-drag-group="${escapeHtml(group.label)}"
            data-video-analysis-template-drop-group="${escapeHtml(group.label)}"
          >
            <button type="button" data-video-analysis-template-select-group="${escapeHtml(group.label)}">
              <strong>${escapeHtml(group.label)}</strong>
              <span>${escapeHtml(`${group.buttons.length} button${group.buttons.length === 1 ? "" : "s"}`)}</span>
            </button>
            <div class="video-analysis-builder-card-actions">
              <button type="button" data-video-analysis-template-move-group="${escapeHtml(group.label)}:-1" ${index === 0 ? "disabled" : ""}>Up</button>
              <button type="button" data-video-analysis-template-move-group="${escapeHtml(group.label)}:1" ${index === groups.length - 1 ? "disabled" : ""}>Down</button>
            </div>
          </article>
        `).join("")}
      </div>
      <div class="video-analysis-panel-builder">
        <label>
          <span>New group</span>
          <input type="text" data-video-analysis-template-builder-field="newGroupName" value="${escapeHtml(builder.newGroupName || "")}" placeholder="Group name">
        </label>
        <button type="button" data-video-analysis-add-button-group>Add group</button>
      </div>
    </section>
  `;
}

function renderButtonReorderList(group = {}, selectedButtonId = "") {
  return `
    <section class="video-analysis-panel-builder-column video-analysis-panel-builder-buttons">
      <div class="video-analysis-builder-column-head">
        <p class="video-analysis-kicker">Buttons</p>
        <button type="button" data-video-analysis-add-code-button-group="${escapeHtml(group.label || "Custom")}">Add button</button>
      </div>
      <div class="video-analysis-builder-list" data-video-analysis-template-button-list="${escapeHtml(group.label || "Custom")}">
        ${(group.buttons || []).map((item, index) => `
          <article
            class="video-analysis-code-button-editor${item.id === selectedButtonId ? " is-active" : ""}"
            draggable="true"
            data-video-analysis-template-drag-button="${escapeHtml(item.id)}"
            data-video-analysis-template-drop-button="${escapeHtml(group.label || "Custom")}:${escapeHtml(item.id)}"
          >
            <button
              type="button"
              class="video-analysis-builder-button-card${item.id === selectedButtonId ? " is-active" : ""}"
              style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}"
              data-video-analysis-template-select-button="${escapeHtml(item.id)}"
            >
              <span>${escapeHtml(item.label)}</span>
              <small>${escapeHtml(clipSummary(item))}</small>
            </button>
            <div class="video-analysis-code-button-editor__actions">
              <button type="button" data-video-analysis-template-move-button="${escapeHtml(item.id)}:-1" ${index === 0 ? "disabled" : ""}>Up</button>
              <button type="button" data-video-analysis-template-move-button="${escapeHtml(item.id)}:1" ${index === group.buttons.length - 1 ? "disabled" : ""}>Down</button>
              <button type="button" data-video-analysis-duplicate-code-button="${escapeHtml(item.id)}">Duplicate</button>
              <button type="button" data-video-analysis-remove-code-button="${escapeHtml(item.id)}">Archive</button>
            </div>
          </article>
        `).join("")}
        ${group.buttons?.length ? "" : `<div class="video-analysis-muted" data-video-analysis-template-drop-button-empty="${escapeHtml(group.label || "Custom")}">Drop buttons here.</div>`}
      </div>
    </section>
  `;
}

function renderButtonInspector(state = {}, selectedButton = null) {
  if (!selectedButton) {
    return `
      <section class="video-analysis-panel-builder-column video-analysis-panel-builder-inspector">
        <div class="video-analysis-builder-empty">Select a button to edit settings.</div>
      </section>
    `;
  }
  const issues = templateHotkeyIssues(state.template || {}, selectedButton.id);
  const durationSeconds = secondsFromMs(selectedButton.defaultDurationMs, 15);
  const leadSeconds = leadSecondsFromMs(selectedButton.startOffsetMs);
  const endAfterClickSeconds = secondsFromMs(selectedButton.endOffsetMs, durationSeconds);
  return `
    <section class="video-analysis-panel-builder-column video-analysis-panel-builder-inspector">
      <div class="video-analysis-builder-column-head">
        <p class="video-analysis-kicker">Inspector</p>
        <span>${escapeHtml(selectedButton.group || "Custom")}</span>
      </div>
      <div class="video-analysis-builder-preview">
        <p class="video-analysis-kicker">Preview</p>
        ${renderCodeButtonPreview(selectedButton, true)}
      </div>
      <div class="video-analysis-button-editor-grid video-analysis-button-editor-grid--inspector">
        <label>Button name<input type="text" data-video-analysis-button-field="${escapeHtml(selectedButton.id)}:label" value="${escapeHtml(selectedButton.label)}"></label>
        <label>Behavior<select data-video-analysis-button-field="${escapeHtml(selectedButton.id)}:buttonBehavior">${behaviorOptionList(selectedButton.buttonBehavior || "create_tag")}</select></label>
        <label>Applies to<select data-video-analysis-button-field="${escapeHtml(selectedButton.id)}:targetField">${targetFieldOptionList(selectedButton.targetField || selectedButton.type || "tags")}</select></label>
        <label>Hotkey<input type="text" maxlength="12" data-video-analysis-button-field="${escapeHtml(selectedButton.id)}:hotkey" value="${escapeHtml(selectedButton.hotkey || "")}"></label>
      </div>
      ${issues.length ? `<div class="video-analysis-hotkey-warning">${issues.map((issue) => `<span>${escapeHtml(issue.message)}</span>`).join("")}</div>` : ""}
      <div class="video-analysis-color-presets" aria-label="Color presets">
        ${colorPresets.map(([color, label]) => `
          <button
            type="button"
            class="${selectedButton.color === color ? "is-active" : ""}"
            style="--video-analysis-preset-color:${escapeHtml(color)}"
            title="${escapeHtml(label)}"
            data-video-analysis-button-color-preset="${escapeHtml(selectedButton.id)}:${escapeHtml(color)}"
          ></button>
        `).join("")}
      </div>
      <div class="video-analysis-builder-timing">
        <div><strong>${escapeHtml(String(durationSeconds))}s</strong><span>Length</span></div>
        <div><strong>${escapeHtml(String(leadSeconds))}s</strong><span>Lead</span></div>
        <div><strong>${escapeHtml(String(endAfterClickSeconds))}s</strong><span>End after click</span></div>
      </div>
      <p class="video-analysis-builder-summary">${escapeHtml(clipSummary(selectedButton))}</p>
      <div class="video-analysis-button-editor-grid video-analysis-button-editor-grid--timing">
        <label>Length sec<input type="number" min="1" max="900" step="1" data-video-analysis-button-ms-field="${escapeHtml(selectedButton.id)}:defaultDurationMs" value="${escapeHtml(durationSeconds)}"></label>
        <label>Lead sec<input type="number" min="0" max="120" step="1" data-video-analysis-button-ms-field="${escapeHtml(selectedButton.id)}:startOffsetMs:lead" value="${escapeHtml(leadSeconds)}"></label>
        <label>End after click<input type="number" min="1" max="900" step="1" data-video-analysis-button-ms-field="${escapeHtml(selectedButton.id)}:endOffsetMs" value="${escapeHtml(endAfterClickSeconds)}"></label>
      </div>
    </section>
  `;
}

export function renderPanelBuilderOverlay(state = {}, groups = []) {
  const template = state.template || {};
  const builder = state.codingSession?.templateBuilder || {};
  const selectedGroup = groups.some((group) => group.label === builder.selectedGroup)
    ? builder.selectedGroup
    : groups[0]?.label || "Custom";
  const selectedGroupModel = groups.find((group) => group.label === selectedGroup) || groups[0] || { label: "Custom", buttons: [] };
  const selectedButton = (template.buttons || []).find((item) => item.id === builder.selectedButtonId)
    || selectedGroupModel.buttons?.[0]
    || groups.flatMap((group) => group.buttons || [])[0]
    || null;
  const dirty = Boolean(state.codingSession?.templateDirty);
  return `
    <div class="video-analysis-template-overlay" data-video-analysis-template-overlay>
      <button type="button" class="video-analysis-template-overlay__backdrop" data-video-analysis-panel-mode="use" aria-label="Close panel editor"></button>
      <section class="video-analysis-template-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="video-analysis-panel-editor-title">
        <div class="video-analysis-template-overlay__header">
          <div>
            <p class="video-analysis-kicker">Panel Editor</p>
            <label class="video-analysis-template-title-field">
              <span id="video-analysis-panel-editor-title">Panel name</span>
              <input type="text" data-video-analysis-template-field="title" value="${escapeHtml(template.title || "Football Science Tag Panel")}">
            </label>
          </div>
          <div class="video-analysis-template-actions">
            ${dirty ? `<span class="video-analysis-template-dirty-pill">Unsaved changes</span>` : `<span class="video-analysis-template-saved-pill">Saved</span>`}
            <button type="button" class="video-analysis-template-save" data-video-analysis-save-template>Save panel</button>
            <button type="button" class="video-analysis-icon-button" data-video-analysis-panel-mode="use">Close</button>
          </div>
        </div>
        <div class="video-analysis-template-overlay__body">
          ${renderGroupReorderList(groups, selectedGroup, dirty, builder)}
          ${renderButtonReorderList(selectedGroupModel, selectedButton?.id || "")}
          ${renderButtonInspector(state, selectedButton)}
        </div>
      </section>
    </div>
  `;
}
