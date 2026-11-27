import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";
import { gameModelPositions, gameModelSubPhases } from "./catalog.mjs";
import { renderGameModelWorkspace, sections } from "./workspace-renderer.mjs";

function initialState() {
  return {
    subPhaseId: gameModelSubPhases[0]?.id || "",
    kind: "team-principle",
    positionId: "",
    showArchived: false,
    catalog: null,
    items: [],
    draft: null,
    loading: false,
    saving: false,
    conflict: null,
    draftError: "",
    error: "",
    status: "",
    catalogError: "",
    reloadAfterError: false,
  };
}

function requireResult(result, key, fallback) {
  if (result?.ok === true && result[key]) return result[key];
  const error = new Error(result?.reason || fallback);
  error.status = result?.status;
  throw error;
}

const isConflict = (error) => Number(error?.status) === 409;

function writeErrorMessage(error, fallback) {
  return [400, 403, 422].includes(Number(error?.status)) && error.message ? error.message : fallback;
}

export function createGameModelWorkspace({ root, getCatalog, saveItem, canEdit = () => false }) {
  let model = initialState();
  let generation = 0;
  let paintedEditable = false;

  function canWrite() {
    return model.catalog?.canEdit === true && Boolean(canEdit());
  }

  function focus(selector) {
    root.querySelector(selector)?.focus({ preventScroll: true });
  }

  function focusItem(itemId, action) {
    const item = Array.from(root.querySelectorAll("[data-gm-item-id]")).find((row) => row.dataset.gmItemId === itemId);
    const control = item?.querySelector(action) || root.querySelector("[data-gm-add]");
    control?.focus({ preventScroll: true });
  }

  function paint(focusSelector) {
    paintedEditable = canWrite();
    root.innerHTML = renderGameModelWorkspace({ ...model, editable: paintedEditable });
    if (focusSelector) focus(focusSelector);
  }

  function resolveConflict() {
    if (!model.draft || model.conflict?.mode !== "reload") return;
    const latest = model.items.find((item) => item.id === model.draft.id);
    if (!latest && model.draft.isNew) {
      model.conflict = null;
      model.draftError = "";
    } else if (!latest || latest.archived) {
      model.conflict = { mode: "unavailable" };
      model.draftError = "This item is no longer available. Copy any edits you want to keep before closing the form.";
    } else {
      model.conflict = { mode: "compare", latest };
      model.draftError = "This item changed while you were editing. Review the saved version before applying your edits.";
    }
  }

  async function load({ moveFocus = false } = {}) {
    if (model.loading) return;
    const current = generation;
    model.loading = true;
    model.catalogError = "";
    model.error = "";
    model.status = "";
    paint();
    try {
      const response = await getCatalog();
      if (current !== generation) return;
      const items = requireResult(response, "items", "Game Model could not load.");
      if (!response.teamId || !Array.isArray(items)) throw new Error("Invalid Game Model response.");
      model.catalog = response;
      model.items = items;
      model.reloadAfterError = false;
      resolveConflict();
    } catch {
      if (current !== generation) return;
      if (model.draft) {
        model.draftError = "The latest saved version could not load. Try again.";
      } else if (model.catalog) {
        model.error = "Game Model could not refresh. Try again.";
        model.reloadAfterError = true;
      } else {
        model.catalogError = "Game Model could not load. Try again.";
      }
    } finally {
      if (current === generation) {
        model.loading = false;
        paint(moveFocus ? (model.draft ? "[data-gm-draft-feedback]" : model.catalog ? "[data-gm-heading]" : "[data-gm-reload]") : "");
      }
    }
  }

  function render() {
    if (!model.catalog && !model.loading && !model.catalogError) {
      void load();
    } else if (!root.firstElementChild || canWrite() !== paintedEditable) {
      paint();
    }
  }

  function reset() {
    generation += 1;
    model = initialState();
    root.replaceChildren();
  }

  function startDraft(item) {
    if (!canWrite() || model.draft || model.saving || model.loading) return;
    if (item) {
      model.draft = { ...item, positionIds: [...(item.positionIds || [])], isNew: false };
    } else {
      const crypto = root.ownerDocument.defaultView?.crypto;
      if (!crypto?.randomUUID) {
        model.error = "Game Model cannot create an item in this browser.";
        paint();
        return;
      }
      model.draft = {
        id: crypto.randomUUID(),
        kind: model.kind,
        subPhaseId: model.subPhaseId,
        title: "",
        when: "",
        detail: "",
        positionIds: model.kind === "individual-action" && model.positionId ? [model.positionId] : [],
        archived: false,
        revision: 0,
        isNew: true,
      };
    }
    model.draftError = "";
    model.conflict = null;
    model.status = "";
    model.error = "";
    paint('[name="title"]');
  }

  function closeDraft() {
    const item = model.draft;
    if (!item || model.saving) return;
    model.draft = null;
    model.draftError = "";
    model.conflict = null;
    paint();
    if (item.isNew) focus("[data-gm-add]");
    else focusItem(item.id, "[data-gm-edit]");
  }

  function saveFormFields(form) {
    const fields = new FormData(form);
    model.draft = {
      ...model.draft,
      title: String(fields.get("title") ?? ""),
      when: String(fields.get("when") ?? ""),
      detail: String(fields.get("detail") ?? ""),
      positionIds: fields.getAll("positionIds"),
    };
  }

  async function persist(item, operation) {
    if (!canWrite() || model.saving || model.loading) return;
    const teamId = model.catalog.teamId;
    const current = generation;
    model.saving = true;
    model.reloadAfterError = false;
    model.error = "";
    model.draftError = "";
    model.status = "";
    paint();
    let succeeded = false;
    try {
      const response = await saveItem(item, teamId);
      if (current !== generation) return;
      const saved = requireResult(response, "item", "Game Model could not save this item.");
      if (saved.id !== item.id) throw new Error("Game Model returned a different item.");
      const exists = model.items.some((entry) => entry.id === saved.id);
      model.items = exists ? model.items.map((entry) => entry.id === saved.id ? saved : entry) : [...model.items, saved];
      model.draft = null;
      model.conflict = null;
      if (model.positionId && saved.kind === "individual-action" && !saved.positionIds?.includes(model.positionId)) {
        model.positionId = "";
      }
      const noun = item.kind === "individual-action" ? "Action" : "Principle";
      model.status = `${noun} ${operation === "archive" ? "archived" : operation === "restore" ? "restored" : "saved"}.`;
      succeeded = true;
    } catch (error) {
      if (current !== generation) return;
      if (model.draft && isConflict(error)) {
        model.conflict = { mode: "reload" };
        model.draftError = "This item changed while you were editing. Reload the latest version to compare it with your edits.";
      } else if (model.draft) {
        model.draftError = writeErrorMessage(error, "Your changes could not be saved. Try again.");
      } else {
        model.reloadAfterError = isConflict(error);
        model.error = model.reloadAfterError
          ? "This item changed. Reload the latest version and try again."
          : writeErrorMessage(error, "The item could not be updated. Try again.");
      }
    } finally {
      if (current === generation) {
        model.saving = false;
        paint();
        if (succeeded && item.archived) focus("[data-gm-toggle-archived]");
        else if (succeeded) focusItem(item.id, "[data-gm-edit]");
        else if (model.draft) focus("[data-gm-draft-feedback]");
        else if (model.reloadAfterError) focus("[data-gm-reload]");
        else focusItem(item.id, "[data-gm-archive]");
      }
    }
  }

  function submitDraft(event) {
    if (!event.target.matches("[data-gm-editor]")) return;
    event.preventDefault();
    if (!model.draft || !canWrite() || model.saving || model.loading || model.conflict) return;
    saveFormFields(event.target);
    const { id, kind, subPhaseId, title, when, detail, positionIds, archived, revision } = model.draft;
    let validationError = "";
    if (!title.trim()) validationError = "Enter a title.";
    else if (kind === "individual-action") {
      if (!positionIds.length) validationError = "Choose at least one position.";
      else if (!when.trim()) validationError = "Enter when the action applies.";
      else if (!detail.trim()) validationError = "Enter the coaching detail.";
    }
    if (validationError) {
      model.draftError = validationError;
      paint("[data-gm-draft-feedback]");
      return;
    }
    void persist({ id, kind, subPhaseId, title: title.trim(), when: when.trim(), detail: detail.trim(), positionIds, archived, revision }, "save");
  }

  async function setArchive(item) {
    if (!canWrite() || model.draft || model.saving || model.loading) return;
    const current = generation;
    if (!item.archived) {
      const confirmed = await confirmPlatformAction({
        title: "Archive this item?",
        message: "This item will be hidden from new selections. Existing player focuses keep the linked action.",
        confirmLabel: "Archive",
        win: root.ownerDocument.defaultView,
      });
      if (!confirmed || current !== generation || model.draft) return;
    }
    await persist({ ...item, archived: !item.archived }, item.archived ? "restore" : "archive");
  }

  function selectSubPhase(id, mobile = false) {
    if (!gameModelSubPhases.some((entry) => entry.id === id) || model.draft || model.saving || model.loading) return;
    model.subPhaseId = id;
    model.showArchived = false;
    model.status = "";
    paint(mobile ? "[data-gm-subphase-select]" : "[data-gm-subphase][aria-current]");
  }

  root.addEventListener("click", (event) => {
    const control = event.target.closest?.("button");
    if (!control || !root.contains(control) || model.saving) return;
    if (control.hasAttribute("data-gm-reload")) {
      void load({ moveFocus: true });
      return;
    }
    if (control.hasAttribute("data-gm-cancel")) {
      closeDraft();
      return;
    }
    if (control.hasAttribute("data-gm-accept-latest") && canWrite() && model.conflict?.latest && model.draft) {
      model.draft.revision = model.conflict.latest.revision;
      model.draft.isNew = false;
      model.conflict = null;
      model.draftError = "";
      paint('[name="title"]');
      return;
    }
    if (model.draft || model.loading) return;
    const row = control.closest("[data-gm-item-id]");
    const item = row && model.items.find((entry) => entry.id === row.dataset.gmItemId);
    if (control.dataset.gmSubphase) selectSubPhase(control.dataset.gmSubphase);
    else if (sections.some((section) => section.id === control.dataset.gmSection)) {
      model.kind = control.dataset.gmSection;
      model.showArchived = false;
      model.status = "";
      paint('[data-gm-section][aria-pressed="true"]');
    } else if (control.hasAttribute("data-gm-add")) startDraft();
    else if (item && !item.archived && control.hasAttribute("data-gm-edit")) startDraft(item);
    else if (item && control.hasAttribute("data-gm-archive")) void setArchive(item);
    else if (control.hasAttribute("data-gm-toggle-archived")) {
      model.showArchived = !model.showArchived;
      paint("[data-gm-toggle-archived]");
    }
  });

  root.addEventListener("input", (event) => {
    const form = event.target.closest?.("[data-gm-editor]");
    if (form && model.draft && !model.saving) saveFormFields(form);
  });

  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-gm-subphase-select]")) {
      selectSubPhase(event.target.value, true);
    } else if (event.target.matches("[data-gm-position-filter]") && !model.draft && !model.saving && !model.loading) {
      const id = event.target.value;
      model.positionId = gameModelPositions.some((entry) => entry.id === id) ? id : "";
      model.showArchived = false;
      paint("[data-gm-position-filter]");
    }
  });

  root.addEventListener("submit", submitDraft);
  return { render, reset };
}
