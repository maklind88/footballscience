import { actionSubPhases } from "./action-catalog.mjs";
import { actionPositions, actionsForPosition, selectedIndividualAction } from "./action-selection.mjs";
import { availableFocusLevels, focusLevels } from "../domain/idp-focus-selection.mjs";

const escape = (value = "") => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function renderSelector(label, field, options, value, disabled = false) {
  return `<label><span>${label}</span><select data-idp-action-select="${field}" ${disabled ? "disabled" : ""}>
    <option value="" disabled ${value ? "" : "selected"}>Choose ${label.toLowerCase()}</option>
    ${options.map((item) => `<option value="${escape(item.id)}" ${item.id === value ? "selected" : ""}>${escape(item.label)}</option>`).join("")}
  </select></label>`;
}

function renderActions(selection) {
  const actions = actionsForPosition(selection.subPhaseId, selection.positionId);
  if (!selection.subPhaseId || !selection.positionId) return '<p class="idp-gm-empty">Choose a sub-phase and position to see individual actions.</p>';
  const subPhase = actionSubPhases.find((item) => item.id === selection.subPhaseId);
  return `<section aria-label="Individual Actions" class="idp-gm-actions"><h3>Individual Actions</h3>
    ${subPhase?.phase === "Set Pieces" ? '<p class="idp-gm-note">Use the action that matches the player’s assigned restart responsibility.</p>' : ""}
    ${actions.map((action) => `<article class="idp-gm-card">
      <p><span>When</span>${escape(action.when)}</p>
      <h4>${escape(action.title)}</h4><p>${escape(action.detail)}</p>
      <button type="button" data-idp-use-action="${escape(action.id)}">Use action<span class="idp-gm-sr">: ${escape(action.title)}</span></button>
    </article>`).join("")}
  </section>`;
}

function renderPlayerFocus(selection, detail) {
  const action = selectedIndividualAction(selection);
  if (!action || !selection.draft) return "";
  const draft = selection.draft;
  const levels = availableFocusLevels(detail);
  const busy = Boolean(selection.saving);
  const selectedLevel = levels.includes(draft.focusLevel) ? draft.focusLevel : levels[0];
  return `<form class="idp-gm-focus" data-idp-game-model-save>
    <h3 tabindex="-1" data-idp-gm-focus-heading>Player Focus</h3>
    <p class="idp-gm-note">${escape(action.subPhase)} · ${escape(actionPositions.find((item) => item.id === selection.positionId)?.label)}</p>
    <fieldset ${busy ? "disabled" : ""}>
      <label><span>Focus</span><input name="title" maxlength="180" required value="${escape(draft.title)}"></label>
      <label><span>When, action and detail</span><textarea name="description" rows="5" maxlength="800" required>${escape(draft.description)}</textarea></label>
      <div class="idp-gm-selectors">
        <label><span>Priority</span><select name="focusLevel" required ${levels.length ? "" : "disabled"}>
          ${levels.length ? levels.map((level) => `<option value="${level}" ${level === selectedLevel ? "selected" : ""}>${focusLevels[level]}</option>`).join("") : '<option value="">No available priority</option>'}
        </select></label>
        <label><span>Review date (optional)</span><input type="date" name="reviewDate" value="${escape(draft.reviewDate || "")}"></label>
      </div>
      ${!levels.length ? '<p role="status">All three focus priorities are in use. Review or archive an existing focus before adding another.</p>' : ""}
      ${selection.error ? `<p class="idp-gm-error" role="alert">${escape(selection.error)}</p>` : ""}
      <div class="idp-gm-footer">
        <button type="button" class="idp-secondary-action" data-idp-action-back>Back to actions</button>
        <button type="submit" ${!levels.length ? "disabled" : ""}>${busy ? "Saving…" : "Save Player Focus"}</button>
      </div>
    </fieldset>
  </form>`;
}

export function renderGameModelActions(state = {}) {
  const selection = state.ui?.gameModelSelection || {};
  const detail = state.playerDetail || {};
  const selected = Boolean(selectedIndividualAction(selection));
  const step = selected ? 3 : selection.subPhaseId && selection.positionId ? 2 : selection.subPhaseId ? 1 : 0;
  return `<div class="idp-game-model" aria-busy="${Boolean(selection.saving)}">
    <ol class="idp-gm-steps" aria-label="Player focus steps">${["Sub-Phase", "Position", "Individual Actions", "Player Focus"].map((label, index) => `<li ${index === step ? 'aria-current="step"' : ""}><span>${index + 1}</span>${label}</li>`).join("")}</ol>
    ${selected ? renderPlayerFocus(selection, detail) : `<div class="idp-gm-selectors">
      ${renderSelector("Sub-Phase", "subPhaseId", actionSubPhases, selection.subPhaseId)}
      ${renderSelector("Position", "positionId", actionPositions, selection.positionId, !selection.subPhaseId)}
    </div>${renderActions(selection)}`}
  </div>`;
}
