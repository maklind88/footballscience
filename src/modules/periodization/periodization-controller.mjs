import { createScopedTextDraftStore } from "../../core/scoped-text-draft-store.mjs";

function getClosest(target, selector) {
  return target?.closest?.(selector) || null;
}

function noop() {}

function isTextEditingField(field) {
  if (!field) return false;
  if (field.tagName === "TEXTAREA") return true;
  if (field.tagName !== "INPUT") return false;
  return !new Set(["checkbox", "color", "date", "file", "number", "radio", "range", "time"]).has(
    String(field.type || "text").toLowerCase()
  );
}

export function createPeriodizationWorkspaceController(options = {}) {
  const ui = options.ui || {};
  const textDraftStore = options.textDraftStore || createScopedTextDraftStore({
    storage: options.win?.sessionStorage,
    storageKey: options.textDraftStorageKey,
    getScope: options.getDraftScope,
    setTimeout: options.win?.setTimeout?.bind(options.win),
    clearTimeout: options.win?.clearTimeout?.bind(options.win),
  });
  let isBound = false;

  function canEdit() {
    return Boolean(options.canEdit?.());
  }

  function getState() {
    return typeof options.getState === "function" ? options.getState() : null;
  }

  function render() {
    if (typeof options.render === "function") {
      options.render();
    }
  }

  function setOverlayState(open, mode = "view") {
    options.setOverlayState?.({ open: Boolean(open), mode });
  }

  function closeOverlay() {
    setOverlayState(false, "view");
    options.setMultiSelectOpenField?.("");
    render();
  }

  function setSelectedOverlayMode(mode) {
    if (mode === "edit" && !canEdit()) {
      return;
    }
    setOverlayState(true, mode === "edit" ? "edit" : "view");
    options.setMultiSelectOpenField?.("");
    render();
  }

  function toggleMultiField(field) {
    if (!field || !canEdit()) {
      return;
    }
    const previousOpenField = options.getMultiSelectOpenField?.() || "";
    options.setMultiSelectOpenField?.(previousOpenField === field ? "" : field);
    options.refreshMultiFields?.([previousOpenField, field]);
  }

  function selectedDate() {
    return getState()?.selectedDate || "";
  }

  function writeSelectedDay(patch, shouldRender = false) {
    const dateValue = selectedDate();
    if (!dateValue || !canEdit()) {
      return;
    }
    options.writeDay?.(dateValue, patch, shouldRender);
  }

  function getTextDraftContext(field) {
    const dateValue = selectedDate();
    const fieldKey = field?.dataset?.periodizationField;
    if (!dateValue || !fieldKey) return null;
    return { field: fieldKey, recordId: dateValue };
  }

  function restoreTextDraft(field) {
    const context = getTextDraftContext(field);
    if (!context) return false;
    const result = textDraftStore.restore(context, field.value);
    if (result.status === "restore") field.value = result.value;
    field.dataset.periodizationDraftBaseValue = field.value;
    field.toggleAttribute?.("data-periodization-draft-conflict", result.status === "conflict");
    return result.status === "restore";
  }

  function recordTextDraft(field) {
    const context = getTextDraftContext(field);
    if (!context) return false;
    return textDraftStore.record(context, field.value, field.dataset.periodizationDraftBaseValue ?? field.value);
  }

  function clearTextDraft(field) {
    const context = getTextDraftContext(field);
    if (context) textDraftStore.clear(context);
  }

  function handleTodayClick() {
    options.jumpToToday?.();
  }

  function handlePreviousMonthClick() {
    options.shiftMonth?.(-1);
  }

  function handleNextMonthClick() {
    options.shiftMonth?.(1);
  }

  function handleMonthSelectChange(event) {
    options.setMonth?.(Number(event.target?.value));
  }

  function handlePickerClick(event) {
    const monthTrigger = getClosest(event.target, "[data-periodization-month]");
    if (!monthTrigger) {
      return;
    }
    options.setMonth?.(Number(monthTrigger.dataset.periodizationMonth));
  }

  function handleBoardClick(event) {
    if (getClosest(event.target, "[data-periodization-close]") || event.target?.matches?.("[data-periodization-overlay]")) {
      closeOverlay();
      return;
    }

    if (getClosest(event.target, "[data-periodization-edit-selected]")) {
      setSelectedOverlayMode("edit");
      return;
    }

    if (getClosest(event.target, "[data-periodization-view-selected]")) {
      setSelectedOverlayMode("view");
      return;
    }

    const multiToggle = getClosest(event.target, "[data-periodization-multi-toggle]");
    if (multiToggle) {
      toggleMultiField(multiToggle.dataset.periodizationMultiToggle);
      return;
    }

    const editDateTrigger = getClosest(event.target, "[data-periodization-edit-date]");
    if (editDateTrigger) {
      if (!canEdit()) {
        return;
      }
      options.setMultiSelectOpenField?.("");
      options.selectDate?.(editDateTrigger.dataset.periodizationEditDate, true, "edit");
      return;
    }

    const dayTrigger = getClosest(event.target, "[data-periodization-date]");
    if (!dayTrigger) {
      return;
    }
    options.setMultiSelectOpenField?.("");
    options.selectDate?.(dayTrigger.dataset.periodizationDate, true, "view");
  }

  function handleBoardKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const dayTrigger = getClosest(event.target, "[data-periodization-date]");
    if (!dayTrigger || getClosest(event.target, "[data-periodization-edit-date]")) {
      return;
    }
    event.preventDefault?.();
    options.selectDate?.(dayTrigger.dataset.periodizationDate, true, "view");
  }

  function handleBoardInput(event) {
    const customField = getClosest(event.target, "[data-periodization-custom-field]");
    if (customField) {
      const dateValue = selectedDate();
      if (!dateValue || !canEdit()) {
        return;
      }
      writeSelectedDay(
        {
          [customField.dataset.periodizationCustomField]: options.getCustomFieldValue?.(customField, dateValue),
        },
        false
      );
      return;
    }

    const field = getClosest(event.target, "[data-periodization-field]");
    if (
      !field ||
      !selectedDate() ||
      !canEdit() ||
      isTextEditingField(field) ||
      field.tagName === "SELECT" ||
      field.matches?.("[data-periodization-multi-option]")
    ) {
      if (isTextEditingField(field)) recordTextDraft(field);
      return;
    }
    writeSelectedDay({ [field.dataset.periodizationField]: field.value }, false);
  }

  function handleBoardChange(event) {
    const customField = getClosest(event.target, "[data-periodization-custom-field]");
    if (customField) {
      const dateValue = selectedDate();
      if (!dateValue || !canEdit()) {
        return;
      }
      const fieldKey = customField.dataset.periodizationCustomField;
      writeSelectedDay(
        {
          [fieldKey]: options.getCustomFieldValue?.(customField, dateValue),
        },
        false
      );
      options.refreshDependentFields?.(fieldKey);
      return;
    }

    const field = getClosest(event.target, "[data-periodization-field]");
    const dateValue = selectedDate();
    if (!field || !dateValue || !canEdit()) {
      return;
    }
    const fieldKey = field.dataset.periodizationField;
    const value = options.isMultiField?.(fieldKey) ? options.getMultiFieldValue?.(field, dateValue) : field.value;
    writeSelectedDay({ [fieldKey]: value }, false);
    if (isTextEditingField(field)) clearTextDraft(field);
    if (options.isMultiField?.(fieldKey)) {
      options.refreshDependentFields?.(fieldKey);
    }
  }

  function handleBoardFocusin(event) {
    const field = getClosest(event.target, "[data-periodization-field]");
    if (isTextEditingField(field)) restoreTextDraft(field);
  }

  function handleBoardFocusout(event) {
    const field = getClosest(event.target, "[data-periodization-field]");
    if (isTextEditingField(field)) textDraftStore.flush();
  }

  function bind() {
    if (isBound) {
      return;
    }
    isBound = true;

    ui.periodizationTodayButton?.addEventListener?.("click", handleTodayClick);
    ui.periodizationPrevMonthButton?.addEventListener?.("click", handlePreviousMonthClick);
    ui.periodizationNextMonthButton?.addEventListener?.("click", handleNextMonthClick);
    ui.periodizationMonthSelect?.addEventListener?.("change", handleMonthSelectChange);
    ui.periodizationPickerGrid?.addEventListener?.("click", handlePickerClick);
    ui.periodizationBoard?.addEventListener?.("click", handleBoardClick);
    ui.periodizationBoard?.addEventListener?.("keydown", handleBoardKeydown);
    ui.periodizationBoard?.addEventListener?.("input", handleBoardInput);
    ui.periodizationBoard?.addEventListener?.("change", handleBoardChange);
    ui.periodizationBoard?.addEventListener?.("focusin", handleBoardFocusin);
    ui.periodizationBoard?.addEventListener?.("focusout", handleBoardFocusout);
    options.win?.addEventListener?.("pagehide", () => textDraftStore.flush());
  }

  return Object.freeze({
    bind,
    closeOverlay,
    handleBoardChange,
    handleBoardClick,
    handleBoardFocusin,
    handleBoardFocusout,
    handleBoardInput,
    handleBoardKeydown,
    handleMonthSelectChange,
    handleNextMonthClick,
    handlePickerClick,
    handlePreviousMonthClick,
    handleTodayClick,
    render: options.render || noop,
  });
}
