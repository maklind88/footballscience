import { gameModelActionForFocus } from "../../game-model/catalog.mjs";
import { actionsForPosition, resolveGameModelAction } from "./action-selection.mjs";
import { renderGameModelChoices, renderLinkedGameModelAction } from "./action-renderer.mjs";

function catalogActions(catalog, subPhaseId, positionId) {
  if (!catalog) return actionsForPosition(subPhaseId, positionId);
  return catalog.items.filter((item) => item.kind === "individual-action" && item.subPhaseId === subPhaseId
    && !item.archived && item.positionIds.includes(positionId));
}

export function handleGameModelChange(event, catalog = null) {
  const target = event.target;
  if (!target?.matches?.("[data-idp-gm-subphase], [data-idp-gm-position]")) return false;
  const field = target.closest("[data-idp-game-model]");
  const subPhase = field.querySelector("[data-idp-gm-subphase]").value;
  const position = field.querySelector("[data-idp-gm-position]");
  position.disabled = !subPhase;
  field.querySelector("[data-idp-gm-actions]").innerHTML = renderGameModelChoices(
    catalogActions(catalog, subPhase, position.value),
    field.dataset.editFocus === "true",
  );
  return true;
}

function setLink(field, action, catalogueChoice = null) {
  const actionInput = field.querySelector('[name="gameModelActionId"]');
  const positionInput = field.querySelector('[name="gameModelPositionId"]');
  actionInput.value = action?.actionId || "";
  positionInput.value = action?.positionId || "";
  const sameSelection = actionInput.value === field.dataset.savedAction && positionInput.value === field.dataset.savedPosition;
  const sameCopy = JSON.stringify([action?.title, action?.when, action?.detail]) === field.dataset.savedCopy;
  const unchanged = sameSelection && (!catalogueChoice || sameCopy);
  actionInput.disabled = unchanged;
  positionInput.disabled = unchanged;
  const teamInput = field.querySelector('[name="gameModelTeamId"]');
  const revisionInput = field.querySelector('[name="gameModelItemRevision"]');
  teamInput.disabled = revisionInput.disabled = unchanged || !catalogueChoice;
  teamInput.value = catalogueChoice?.teamId || "";
  revisionInput.value = catalogueChoice?.revision ?? "";
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

export function handleGameModelClick(event, catalog = null) {
  const button = event.target?.closest?.("[data-idp-gm-choose], [data-idp-gm-remove]");
  if (!button) return false;
  const field = button.closest("[data-idp-game-model]");
  if (button.hasAttribute("data-idp-gm-remove")) {
    setLink(field, null);
    useSuggestedTitle(field, null);
    return true;
  }
  const position = field.querySelector("[data-idp-gm-position]").value;
  const actionId = button.dataset.idpGmChoose;
  const entry = catalog?.items.find((item) => item.id === actionId);
  const action = catalog
    ? gameModelActionForFocus(catalog.items, actionId, position)
    : resolveGameModelAction(actionId, position);
  if (!action) return true;
  setLink(field, action, entry && { teamId: catalog.teamId, revision: entry.revision });
  useSuggestedTitle(field, action);
  return true;
}
