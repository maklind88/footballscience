import { actionsForPosition, resolveGameModelAction } from "./action-selection.mjs";
import { renderGameModelChoices, renderLinkedGameModelAction } from "./action-renderer.mjs";

export function handleGameModelChange(event) {
  const target = event.target;
  if (!target?.matches?.("[data-idp-gm-subphase], [data-idp-gm-position]")) return false;
  const field = target.closest("[data-idp-game-model]");
  const subPhase = field.querySelector("[data-idp-gm-subphase]").value;
  const position = field.querySelector("[data-idp-gm-position]");
  position.disabled = !subPhase;
  field.querySelector("[data-idp-gm-actions]").innerHTML = renderGameModelChoices(
    actionsForPosition(subPhase, position.value),
    field.dataset.editFocus === "true",
  );
  return true;
}

function setLink(field, action) {
  const actionInput = field.querySelector('[name="gameModelActionId"]');
  const positionInput = field.querySelector('[name="gameModelPositionId"]');
  actionInput.value = action?.actionId || "";
  positionInput.value = action?.positionId || "";
  const unchanged = actionInput.value === field.dataset.savedAction && positionInput.value === field.dataset.savedPosition;
  actionInput.disabled = unchanged;
  positionInput.disabled = unchanged;
  // Preserve the saved wording when reselecting the same action and position.
  field.querySelector("[data-idp-gm-preview]").innerHTML = unchanged
    ? field.querySelector("[data-idp-gm-saved-preview]").innerHTML
    : renderLinkedGameModelAction(action);
  field.querySelector("[data-idp-gm-remove]").hidden = !action;
  const picker = field.querySelector("[data-idp-gm-picker]");
  const summary = picker.querySelector("summary");
  summary.textContent = action ? "Change Game Model action" : field.dataset.editFocus === "true" ? "Link Game Model action" : "Use Game Model action";
  picker.open = false;
  summary.focus();
}

function useSuggestedTitle(field, action) {
  if (field.dataset.editFocus === "true") return;
  const title = field.closest("form").elements.namedItem("title");
  if (title.value.trim() && title.value !== field.dataset.suggestedTitle) return;
  title.value = action?.title || "";
  field.dataset.suggestedTitle = title.value;
}

export function handleGameModelClick(event) {
  const button = event.target?.closest?.("[data-idp-gm-choose], [data-idp-gm-remove]");
  if (!button) return false;
  const field = button.closest("[data-idp-game-model]");
  if (button.hasAttribute("data-idp-gm-remove")) {
    setLink(field, null);
    useSuggestedTitle(field, null);
    return true;
  }
  const position = field.querySelector("[data-idp-gm-position]").value;
  const action = resolveGameModelAction(button.dataset.idpGmChoose, position);
  if (!action) return true;
  setLink(field, action);
  useSuggestedTitle(field, action);
  return true;
}
