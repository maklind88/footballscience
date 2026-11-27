import { actionSubPhases } from "./action-catalog.mjs";
import { actionPositions, suggestedGameModelPosition } from "./action-selection.mjs";

function escape(value = "") {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderLinkedGameModelAction(action) {
  if (!action) return "";
  return `<div class="idp-gm-summary">
    <p>${escape(action.subPhase)} · ${escape(action.positionLabel)}</p>
    <dl>
      <div><dt>When</dt><dd>${escape(action.when)}</dd></div>
      <div><dt>Action</dt><dd>${escape(action.title)}</dd></div>
      <div><dt>Detail</dt><dd>${escape(action.detail)}</dd></div>
    </dl>
  </div>`;
}

function renderSelector(label, selector, options, selectedId, disabled = false) {
  return `<label><span>${label}</span>
    <select ${selector} ${disabled ? "disabled" : ""}>
      <option value="">Choose ${label.toLowerCase()}</option>
      ${options.map((item) => `<option value="${escape(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escape(item.label)}</option>`).join("")}
    </select>
  </label>`;
}

export function renderGameModelField(focus, profile = {}) {
  const action = focus?.gameModelAction;
  const suggestedPosition = action?.positionId || suggestedGameModelPosition(profile);
  const savedPreview = renderLinkedGameModelAction(action);
  return `<section class="idp-form-wide idp-gm-field" data-idp-game-model
      data-saved-action="${escape(action?.actionId)}" data-saved-position="${escape(action?.positionId)}"
      data-saved-copy="${escape(JSON.stringify([action?.title, action?.when, action?.detail]))}"
      data-edit-focus="${Boolean(focus?.id && !String(focus.id).startsWith("legacy-focus-"))}">
    <div data-idp-gm-preview aria-live="polite">${savedPreview}</div>
    <template data-idp-gm-saved-preview>${savedPreview}</template>
    <input type="hidden" name="gameModelActionId" disabled>
    <input type="hidden" name="gameModelPositionId" disabled>
    <input type="hidden" name="gameModelTeamId" disabled>
    <input type="hidden" name="gameModelItemRevision" disabled>
    <details data-idp-gm-picker>
      <summary>${action ? "Change Game Model action" : focus?.id ? "Link Game Model action" : "Use Game Model action"}</summary>
      <div class="idp-gm-selectors">
        ${renderSelector("Sub-Phase", "data-idp-gm-subphase", actionSubPhases)}
        ${renderSelector("Position", "data-idp-gm-position", actionPositions, suggestedPosition, true)}
      </div>
      <div data-idp-gm-actions aria-live="polite"></div>
    </details>
    <button type="button" class="idp-secondary-action" data-idp-gm-remove ${action ? "" : "hidden"}>Remove action</button>
  </section>`;
}

export function renderGameModelChoices(actions, editing) {
  if (!actions.length) return "";
  return `<div class="idp-gm-choices" aria-label="Individual Actions">
    <strong>Individual Actions</strong>
    ${actions.map((action) => `<div class="idp-gm-choice">
      <p>${escape(action.when)}</p>
      <strong>${escape(action.title)}</strong>
      <p>${escape(action.detail)}</p>
      <button type="button" data-idp-gm-choose="${escape(action.id)}" aria-label="${editing ? "Link" : "Use"} action: ${escape(action.title)}">${editing ? "Link action" : "Use action"}</button>
    </div>`).join("")}
  </div>`;
}
