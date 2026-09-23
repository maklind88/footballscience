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

function shouldCommitTextFieldOnEnter(event, field) {
  if (event?.key !== "Enter" || !isTextEditingField(field)) return false;
  return field.tagName === "INPUT" || Boolean(event.metaKey || event.ctrlKey);
}

export function createPeriodizationSessionBridge(options = {}) {
  const ui = options.ui || {};
  let overlayDate = null;
  let overlayMode = "view";

  function canEdit() {
    return Boolean(options.canEdit?.());
  }

  function ensurePeriodizationState() {
    return typeof options.ensurePeriodizationState === "function" ? options.ensurePeriodizationState() : null;
  }

  function renderSessionPlanner() {
    options.renderSessionPlanner?.({ preserveDateStripScroll: true });
  }

  function setMultiSelectOpenField(fieldKey = "") {
    options.setMultiSelectOpenField?.(fieldKey);
  }

  function getMultiSelectOpenField() {
    return options.getMultiSelectOpenField?.() || "";
  }

  function isValidDate(dateValue) {
    return Boolean(dateValue && options.isDateValueInYear?.(dateValue));
  }

  function open(dateValue, mode = "view") {
    if (!isValidDate(dateValue)) {
      return false;
    }
    ensurePeriodizationState();
    const date = options.parseDateValue?.(dateValue);
    const safeMode = mode === "edit" && !canEdit() ? "view" : mode;
    options.setPeriodizationSelection?.(dateValue, date?.getMonth?.());
    overlayDate = dateValue;
    overlayMode = safeMode;
    setMultiSelectOpenField("");
    options.writePeriodizationState?.({ syncCentral: false });
    renderSessionPlanner();
    return true;
  }

  function close({ render = true } = {}) {
    overlayDate = null;
    overlayMode = "view";
    setMultiSelectOpenField("");
    if (render) {
      renderSessionPlanner();
    }
  }

  function renderSummary(dateValue) {
    ensurePeriodizationState();
    return options.renderer?.renderSessionSummary?.(dateValue) || "";
  }

  function renderOverlay() {
    if (!overlayDate) {
      return "";
    }
    ensurePeriodizationState();
    if (!canEdit() && overlayMode === "edit") {
      overlayMode = "view";
    }
    return `
    <div class="periodization-day-overlay session-periodization-overlay" data-session-periodization-overlay>
      ${options.renderer?.renderDayPanel?.(overlayDate, {
        isOverlay: true,
        mode: overlayMode,
      }) || ""}
    </div>
  `;
  }

  function refreshSummaryCard(dateValue = overlayDate) {
    if (!dateValue || !ui.sessionPlannerWorkspace) {
      return;
    }
    const summaryCard = ui.sessionPlannerWorkspace.querySelector?.(`[data-session-periodization-date="${dateValue}"]`);
    if (summaryCard) {
      summaryCard.outerHTML = renderSummary(dateValue);
    }
  }

  function refreshMultiField(key) {
    if (!overlayDate || !ui.sessionPlannerWorkspace) {
      return;
    }
    const field = ui.sessionPlannerWorkspace.querySelector?.(`[data-periodization-multi-field="${key}"]`);
    const html = options.renderer?.renderMultiFieldForDate?.(key, overlayDate);
    if (!field || !html) {
      return;
    }
    field.outerHTML = html;
  }

  function refreshMultiFields(keys = []) {
    Array.from(new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))).forEach((key) => {
      refreshMultiField(key);
    });
  }

  function refreshDependentFields(changedKey = "") {
    if (changedKey === "matchPhases") {
      refreshMultiFields(["subPhases", "teamPrinciples", "miniGamePrinciples"]);
      return;
    }
    if (changedKey === "subPhases") {
      refreshMultiFields(["teamPrinciples", "miniGamePrinciples"]);
    }
  }

  function refreshEditSurfaces(changedKey = "") {
    refreshSummaryCard();
    options.refreshMatchDayChip?.();
    refreshDependentFields(changedKey);
  }

  function setOverlayMode(mode) {
    if (mode === "edit" && !canEdit()) {
      return;
    }
    overlayMode = mode === "edit" ? "edit" : "view";
    setMultiSelectOpenField("");
    renderSessionPlanner();
  }

  function toggleMultiField(field) {
    if (!field || !canEdit()) {
      return;
    }
    const previousOpenField = getMultiSelectOpenField();
    setMultiSelectOpenField(previousOpenField === field ? "" : field);
    refreshMultiFields([previousOpenField, field]);
  }

  function handleClick(event) {
    if (getClosest(event.target, "[data-periodization-close]") && overlayDate) {
      close();
      return true;
    }
    if (event.target?.matches?.("[data-session-periodization-overlay]")) {
      close();
      return true;
    }
    if (getClosest(event.target, "[data-periodization-edit-selected]") && overlayDate) {
      setOverlayMode("edit");
      return true;
    }
    if (getClosest(event.target, "[data-periodization-view-selected]") && overlayDate) {
      setOverlayMode("view");
      return true;
    }
    const multiToggle = getClosest(event.target, "[data-periodization-multi-toggle]");
    if (multiToggle && overlayDate) {
      toggleMultiField(multiToggle.dataset.periodizationMultiToggle);
      return true;
    }
    const card = getClosest(event.target, "[data-session-periodization-date]");
    if (!card) {
      return false;
    }
    open(card.dataset.sessionPeriodizationDate, "view");
    return true;
  }

  function handleInput(event) {
    const customField = getClosest(event.target, "[data-periodization-custom-field]");
    if (customField && overlayDate) {
      if (!canEdit()) {
        return true;
      }
      if (isTextEditingField(customField)) {
        return true;
      }
      options.writeDay?.(
        overlayDate,
        {
          [customField.dataset.periodizationCustomField]: options.getCustomFieldValue?.(customField, overlayDate),
        },
        false
      );
      return true;
    }

    const field = getClosest(event.target, "[data-periodization-field]");
    if (!field || !overlayDate) {
      return false;
    }
    if (!canEdit()) {
      return true;
    }
    if (field.tagName === "SELECT" || field.matches?.("[data-periodization-multi-option]") || isTextEditingField(field)) {
      return true;
    }
    options.writeDay?.(overlayDate, { [field.dataset.periodizationField]: field.value }, false);
    return true;
  }

  function handleChange(event) {
    const customField = getClosest(event.target, "[data-periodization-custom-field]");
    if (customField && overlayDate) {
      if (!canEdit()) {
        return true;
      }
      const fieldKey = customField.dataset.periodizationCustomField;
      options.writeDay?.(
        overlayDate,
        {
          [fieldKey]: options.getCustomFieldValue?.(customField, overlayDate),
        },
        false
      );
      refreshEditSurfaces(fieldKey);
      return true;
    }

    const field = getClosest(event.target, "[data-periodization-field]");
    if (!field || !overlayDate) {
      return false;
    }
    if (!canEdit()) {
      return true;
    }
    const fieldKey = field.dataset.periodizationField;
    const value = options.isMultiField?.(fieldKey) ? options.getMultiFieldValue?.(field, overlayDate) : field.value;
    options.writeDay?.(overlayDate, { [fieldKey]: value }, false);
    refreshEditSurfaces(fieldKey);
    return true;
  }

  function handleKeydown(event) {
    const customField = getClosest(event.target, "[data-periodization-custom-field]");
    const field = customField || getClosest(event.target, "[data-periodization-field]");
    if (field && overlayDate && shouldCommitTextFieldOnEnter(event, field)) {
      event.preventDefault?.();
      if (customField) {
        options.writeDay?.(
          overlayDate,
          { [customField.dataset.periodizationCustomField]: options.getCustomFieldValue?.(customField, overlayDate) },
          false
        );
        refreshEditSurfaces(customField.dataset.periodizationCustomField);
      } else {
        const fieldKey = field.dataset.periodizationField;
        const value = options.isMultiField?.(fieldKey) ? options.getMultiFieldValue?.(field, overlayDate) : field.value;
        options.writeDay?.(overlayDate, { [fieldKey]: value }, false);
        refreshEditSurfaces(fieldKey);
      }
      field.blur?.();
      return true;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return false;
    }
    const card = getClosest(event.target, "[data-session-periodization-date]");
    if (!card) {
      return false;
    }
    event.preventDefault?.();
    open(card.dataset.sessionPeriodizationDate, "view");
    return true;
  }

  return Object.freeze({
    close,
    getOverlayState: () => ({ date: overlayDate, mode: overlayMode }),
    handleChange,
    handleClick,
    handleInput,
    handleKeydown,
    open,
    refreshDependentFields,
    refreshEditSurfaces,
    refreshMultiField,
    refreshMultiFields,
    refreshSummaryCard,
    renderOverlay,
    renderSummary,
    reset: close,
    renderSessionPlanner: options.renderSessionPlanner || noop,
  });
}
