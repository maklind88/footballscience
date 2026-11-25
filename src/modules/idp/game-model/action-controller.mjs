import { actionFocusDraft, changeActionSelection, initialActionSelection, selectedIndividualAction } from "./action-selection.mjs";
import { availableFocusLevels } from "../domain/idp-focus-selection.mjs";

function canUse(runtime) {
  return Boolean(runtime?.context?.canEdit?.()) && runtime.store.getState().playerDetail?.profile?.status !== "none";
}

function update(runtime, selection) {
  runtime.store.setState({ ui: { gameModelSelection: selection } });
}

function focusControl(runtime, selector) {
  runtime.context.ui?.idpWorkspace?.querySelector(selector)?.focus();
}

export function handleGameModelChange(event, runtime) {
  const field = event.target?.dataset?.idpActionSelect;
  if (!field) return false;
  if (!canUse(runtime)) return true;
  const selection = runtime.store.getState().ui.gameModelSelection || {};
  if (selection.saving) return true;
  update(runtime, changeActionSelection(selection, field, event.target.value));
  focusControl(runtime, `[data-idp-action-select="${field}"]`);
  return true;
}

export function handleGameModelClick(event, runtime) {
  const state = runtime?.store.getState();
  if (state?.ui.actionMode === "game-model" && state.ui.gameModelSelection?.saving) {
    event.preventDefault();
    return true;
  }
  const target = event.target?.closest?.('[data-idp-action="game-model"], [data-idp-use-action], [data-idp-action-back]');
  if (!target) return false;
  event.preventDefault();
  if (!canUse(runtime)) return true;
  if (target.dataset.idpAction === "game-model") {
    runtime.store.setState({ ui: {
      actionMode: "game-model", error: "", message: "",
      gameModelSelection: initialActionSelection(state.playerDetail?.profile),
    } });
    focusControl(runtime, '[data-idp-action-select="subPhaseId"]');
  } else if (target.hasAttribute("data-idp-action-back")) {
    update(runtime, { ...state.ui.gameModelSelection, actionId: "", draft: null, error: "" });
    focusControl(runtime, "[data-idp-use-action]");
  } else {
    update(runtime, changeActionSelection(state.ui.gameModelSelection, "actionId", target.dataset.idpUseAction));
    focusControl(runtime, "[data-idp-gm-focus-heading]");
  }
  return true;
}

export function handleGameModelSubmit(event, runtime) {
  if (!event.target?.matches?.("[data-idp-game-model-save]")) return false;
  event.preventDefault();
  const state = runtime?.store.getState();
  const selection = state?.ui.gameModelSelection;
  if (!canUse(runtime) || state.ui.actionMode !== "game-model" || selection?.saving || !selectedIndividualAction(selection)) return true;
  const form = event.target;
  if (!form.reportValidity()) return true;
  const draft = { ...actionFocusDraft(selection), ...Object.fromEntries(new FormData(form).entries()) };
  if (!draft.title.trim() || !draft.description.trim()) {
    update(runtime, { ...selection, draft, error: "Enter a focus and its coaching details." });
    return true;
  }
  if (!availableFocusLevels(state.playerDetail).includes(draft.focusLevel)) {
    update(runtime, { ...selection, draft, error: "This priority is already in use. Choose an available priority." });
    return true;
  }
  update(runtime, { ...selection, draft, saving: true, error: "" });
  const payload = new FormData();
  for (const [key, value] of Object.entries(draft)) payload.set(key, value);
  // Existing IDP action owns the API write and refresh. No focus id is supplied:
  // this flow always adds a focus and never replaces an existing one.
  runtime.actions.createFocus(payload).catch((error) => {
    update(runtime, { ...selection, draft, saving: false, error: error?.message || "Focus could not be saved. Please try again." });
    focusControl(runtime, '[data-idp-game-model-save] [name="title"]');
  });
  return true;
}

export function bindGameModelKeyboard(runtime, root) {
  if (!root?.addEventListener || root.__idpGameModelKeyboardBound) return;
  root.__idpGameModelKeyboardBound = true;
  root.addEventListener("keydown", (event) => {
    const state = runtime.store.getState();
    if (state.ui.actionMode !== "game-model") return;
    const dialog = root.querySelector('[role="dialog"]');
    if (!dialog) return;
    if (event.key === "Escape" && !state.ui.gameModelSelection?.saving) {
      event.preventDefault();
      runtime.store.setState({ ui: { actionMode: "" } });
      focusControl(runtime, '[data-idp-action="game-model"]');
    } else if (event.key === "Tab") {
      const controls = [...dialog.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
      const first = controls[0];
      const last = controls.at(-1);
      const active = root.ownerDocument.activeElement;
      if (event.shiftKey && (active === first || !controls.includes(active))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (active === last || !controls.includes(active))) {
        event.preventDefault(); first?.focus();
      }
    }
  });
}
