function getClosest(target, selector) {
  return target?.closest?.(selector) || null;
}

function noop() {}

export function createPeriodizationWorkspaceController(options = {}) {
  const ui = options.ui || {};
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
      field.tagName === "SELECT" ||
      field.matches?.("[data-periodization-multi-option]")
    ) {
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
    if (options.isMultiField?.(fieldKey)) {
      options.refreshDependentFields?.(fieldKey);
    }
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
  }

  return Object.freeze({
    bind,
    closeOverlay,
    handleBoardChange,
    handleBoardClick,
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
