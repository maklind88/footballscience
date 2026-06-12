import {
  createScheduleDayClipboard,
  createScheduleEventClipboard,
  getScheduleNavigationStepForState,
  pasteScheduleClipboard,
  removeScheduleEventById,
  selectScheduleStateDate,
  setScheduleDayNote,
  setScheduleStateOverviewSpan,
  setScheduleStateViewMode,
  shiftScheduleStateWindow,
  startScheduleEventEdit,
  upsertScheduleEventFromValues,
} from "./schedule-actions.mjs";
import { createScheduleWorkspaceRenderer } from "./schedule-renderer.mjs";
import { formatScheduleDateValue } from "./schedule-state.mjs";

function defaultIsEditableKeyboardTarget(target) {
  const element = typeof Element !== "undefined" && target instanceof Element ? target : null;
  if (!element) {
    return false;
  }
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

function noop() {}

function getClosest(target, selector) {
  return target?.closest?.(selector) || null;
}

function inferScheduleTypeFromPlannerTitle(title = "", fallbackType = "training") {
  const text = String(title).trim().toLowerCase();
  if (!text) {
    return fallbackType;
  }
  if (/\b(training|train|lift|gym|idp)\b/.test(text)) {
    return "training";
  }
  if (/\b(match|game|fixture|vs|v)\b/.test(text) || /\s-\s/.test(text)) {
    return "match";
  }
  if (/\b(travel|departure|depart|flight|bus|hotel|resa|resor)\b/.test(text)) {
    return "travel";
  }
  if (/\b(recovery|recover|regen)\b/.test(text)) {
    return "recovery";
  }
  if (/\b(meeting|meet|video|analysis)\b/.test(text)) {
    return "meeting";
  }
  if (/\b(off|ledig)\b/.test(text)) {
    return "off";
  }
  return fallbackType;
}

export function createScheduleWorkspaceController(options = {}) {
  const ui = { ...(options.ui || {}) };
  const win = options.window || globalThis.window || {};
  const doc = options.document || globalThis.document || null;
  ui.schedulePlannerViewButton = ui.schedulePlannerViewButton || doc?.getElementById?.("schedulePlannerViewButton") || null;
  ui.schedulePlannerGrid = ui.schedulePlannerGrid || doc?.getElementById?.("schedulePlannerGrid") || null;
  const renderer = options.renderer || createScheduleWorkspaceRenderer(options.rendererOptions);
  const isEditableKeyboardTarget =
    typeof options.isEditableKeyboardTarget === "function"
      ? options.isEditableKeyboardTarget
      : defaultIsEditableKeyboardTarget;

  let clipboard = null;
  let editingEventId = "";
  let plannerEditingEventId = "";
  let plannerEditingDate = "";
  let selectedPlannerEventId = "";
  let dayNoteSyncTimer = 0;
  let plannerClickTimer = 0;
  let dayPanelMode = "view";
  let isBound = false;

  function getState() {
    return typeof options.getState === "function" ? options.getState() : null;
  }

  function ensureState() {
    return typeof options.ensureState === "function" ? options.ensureState() : getState();
  }

  function writeState(writeOptions = {}) {
    if (typeof options.writeState === "function") {
      options.writeState(writeOptions);
    }
  }

  function canEdit() {
    return Boolean(options.canEdit?.());
  }

  function isActive() {
    return Boolean(options.isActive?.());
  }

  function getEventsForDate(dateValue) {
    return typeof options.getEventsForDate === "function" ? options.getEventsForDate(dateValue) : [];
  }

  function render() {
    const state = ensureState();
    const canEditWorkspace = canEdit();

    if (typeof options.prepareRender === "function") {
      options.prepareRender();
    }
    if (!canEditWorkspace) {
      editingEventId = "";
      dayPanelMode = "view";
    }

    renderer.renderWorkspace({
      ui,
      state,
      clipboard,
      editingEventId,
      plannerEditingEventId,
      plannerEditingDate,
      selectedPlannerEventId,
      dayPanelMode,
      canEdit: canEditWorkspace,
      canCreateSession: Boolean(options.canCreateSession?.()),
      formatBlockSummary: options.formatBlockSummary,
      getEventsForDate,
      getSelectedDayContext: options.getSelectedDayContext,
      getSessionForDate: options.getSessionForDate,
      getVisibleEvents: options.getVisibleEvents,
      getVisibleMonthEvents: options.getVisibleMonthEvents,
      isSessionEvent: options.isSessionEvent,
    });
  }

  function scrollDateIntoView(dateValue) {
    const state = getState();
    const root =
      state?.viewMode === "overview"
        ? ui.scheduleOverviewGrid
        : state?.viewMode === "week"
          ? ui.scheduleWeekGrid
          : state?.viewMode === "planner"
            ? ui.schedulePlannerGrid
            : ui.scheduleCalendarGrid;
    if (!root || !dateValue) {
      return;
    }
    const prefersReducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const run = () => {
      root.querySelector?.(`[data-schedule-date="${dateValue}"]`)?.scrollIntoView?.({
        block: "center",
        inline: "nearest",
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    };

    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(run);
      return;
    }
    run();
  }

  function shiftWindow(delta) {
    const state = ensureState();
    if (!state) {
      return;
    }
    shiftScheduleStateWindow(state, delta);
    writeState({ syncCentral: false });
    render();
  }

  function setViewMode(viewMode) {
    const state = ensureState();
    if (!state) {
      return;
    }
    setScheduleStateViewMode(state, viewMode);
    if (state.viewMode !== "planner") {
      selectedPlannerEventId = "";
      plannerEditingEventId = "";
      plannerEditingDate = "";
    }
    writeState({ syncCentral: false });
    render();
  }

  function setOverviewSpan(span) {
    const state = ensureState();
    if (!state) {
      return;
    }
    setScheduleStateOverviewSpan(state, span);
    writeState({ syncCentral: false });
    render();
  }

  function selectDate(dateValue, selectOptions = {}) {
    const state = ensureState();
    if (!state) {
      return;
    }
    dayPanelMode = "view";
    editingEventId = "";
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    selectScheduleStateDate(state, dateValue, selectOptions);
    writeState({ syncCentral: false });
    render();
    if (selectOptions.scrollIntoView) {
      scrollDateIntoView(state.selectedDate);
    }
  }

  function jumpToToday() {
    selectDate(formatScheduleDateValue(new Date()), {
      keepOverviewWindow: false,
      scrollIntoView: true,
    });
  }

  function copyEvent(eventId) {
    const state = getState();
    if (!state || !canEdit()) {
      return;
    }
    const event = state.events.find((item) => item.id === eventId);
    if (!event) {
      return;
    }
    clipboard = createScheduleEventClipboard(event);
    render();
  }

  function copySelectedDay() {
    const state = getState();
    if (!state || !canEdit()) {
      return;
    }
    const events = getEventsForDate(state.selectedDate);
    if (!events.length) {
      return;
    }
    clipboard = createScheduleDayClipboard(events);
    render();
  }

  function copySelectedPlannerEvent() {
    const state = getState();
    if (!state || state.viewMode !== "planner" || !selectedPlannerEventId) {
      return false;
    }
    const event = state.events.find((item) => item.id === selectedPlannerEventId);
    if (!event) {
      selectedPlannerEventId = "";
      return false;
    }
    clipboard = createScheduleEventClipboard(event);
    render();
    return true;
  }

  function pasteClipboardToSelectedDay() {
    const state = getState();
    if (!state || !canEdit() || !clipboard?.events?.length) {
      return;
    }
    pasteScheduleClipboard(state, clipboard);
    writeState();
    render();
  }

  function startEditingEvent(eventId) {
    const state = getState();
    if (!state || !canEdit()) {
      return;
    }
    const event = startScheduleEventEdit(state, eventId);
    if (!event) {
      return;
    }
    editingEventId = event.id;
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    dayPanelMode = "edit";
    writeState({ syncCentral: false });
    render();
  }

  function clearEventEditor({ returnToView = false } = {}) {
    editingEventId = "";
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    if (returnToView) {
      dayPanelMode = "view";
    }
    ui.scheduleEventForm?.reset?.();
    render();
  }

  function isDayEditing() {
    return dayPanelMode === "edit" && canEdit();
  }

  function toggleDayEditMode() {
    if (!canEdit()) {
      return;
    }
    dayPanelMode = dayPanelMode === "edit" ? "view" : "edit";
    if (dayPanelMode === "view") {
      editingEventId = "";
    }
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    render();
  }

  function removeEvent(eventId) {
    const state = getState();
    if (!state || !isDayEditing()) {
      return;
    }
    removeScheduleEventById(state, eventId);
    if (editingEventId === eventId) {
      editingEventId = "";
    }
    if (plannerEditingEventId === eventId) {
      plannerEditingEventId = "";
    }
    if (selectedPlannerEventId === eventId) {
      selectedPlannerEventId = "";
    }
    plannerEditingDate = "";
    writeState();
    render();
  }

  function removePlannerEvent(eventId) {
    const state = getState();
    if (!state || !canEdit()) {
      return;
    }
    removeScheduleEventById(state, eventId);
    if (editingEventId === eventId) {
      editingEventId = "";
      dayPanelMode = "view";
    }
    if (plannerEditingEventId === eventId) {
      plannerEditingEventId = "";
    }
    if (selectedPlannerEventId === eventId) {
      selectedPlannerEventId = "";
    }
    plannerEditingDate = "";
    writeState();
    render();
  }

  function focusPlannerEditor(eventId) {
    const run = () => {
      const input = ui.schedulePlannerGrid?.querySelector?.(`[data-schedule-planner-edit-event="${eventId}"] input`);
      input?.focus?.();
      input?.select?.();
    };
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(run);
      return;
    }
    run();
  }

  function startPlannerInlineEdit(eventId) {
    const state = getState();
    if (!state || !canEdit() || !eventId) {
      return;
    }
    const event = state.events.find((item) => item.id === eventId);
    if (!event) {
      return;
    }
    editingEventId = "";
    plannerEditingEventId = event.id;
    plannerEditingDate = "";
    selectedPlannerEventId = event.id;
    dayPanelMode = "view";
    selectScheduleStateDate(state, event.date, { keepOverviewWindow: true });
    writeState({ syncCentral: false });
    render();
    focusPlannerEditor(event.id);
  }

  function focusPlannerDateEditor(dateValue) {
    const run = () => {
      const input = ui.schedulePlannerGrid?.querySelector?.(`[data-schedule-planner-add-date="${dateValue}"] input`);
      input?.focus?.();
    };
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(run);
      return;
    }
    run();
  }

  function startPlannerDateInlineAdd(dateValue) {
    const state = getState();
    if (!state || !canEdit() || !dateValue) {
      return;
    }
    editingEventId = "";
    plannerEditingEventId = "";
    plannerEditingDate = dateValue;
    selectedPlannerEventId = "";
    dayPanelMode = "view";
    selectScheduleStateDate(state, dateValue, { keepOverviewWindow: true });
    writeState({ syncCentral: false });
    render();
    focusPlannerDateEditor(dateValue);
  }

  function savePlannerEvent(eventId, title) {
    const state = getState();
    const event = state?.events?.find?.((item) => item.id === eventId);
    const cleanTitle = String(title || "").trim();
    if (!state || !event || !canEdit() || !cleanTitle) {
      return false;
    }
    const result = upsertScheduleEventFromValues(
      state,
      {
        date: event.date,
        time: event.time,
        type: inferScheduleTypeFromPlannerTitle(cleanTitle, event.type),
        title: cleanTitle,
        note: event.note,
      },
      event.id
    );
    if (!result.changed) {
      return false;
    }
    plannerEditingEventId = "";
    plannerEditingDate = "";
    editingEventId = "";
    selectedPlannerEventId = event.id;
    dayPanelMode = "view";
    writeState();
    render();
    return true;
  }

  function addPlannerEvent(dateValue, title) {
    const state = getState();
    const cleanTitle = String(title || "").trim();
    if (!state || !canEdit() || !dateValue || !cleanTitle) {
      return false;
    }
    const result = upsertScheduleEventFromValues(
      state,
      {
        date: dateValue,
        time: "",
        type: inferScheduleTypeFromPlannerTitle(cleanTitle, "training"),
        title: cleanTitle,
        note: "",
      },
      ""
    );
    if (!result.changed) {
      return false;
    }
    dayPanelMode = "view";
    editingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    writeState();
    render();
    return true;
  }

  function selectPlannerEvent(eventId) {
    const state = getState();
    if (!state || !eventId) {
      return;
    }
    const event = state.events.find((item) => item.id === eventId);
    if (!event) {
      return;
    }
    editingEventId = "";
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = event.id;
    dayPanelMode = "view";
    selectScheduleStateDate(state, event.date, { keepOverviewWindow: true });
    writeState({ syncCentral: false });
    render();
  }

  function flushDayNoteSync() {
    if (dayNoteSyncTimer) {
      win.clearTimeout?.(dayNoteSyncTimer);
      dayNoteSyncTimer = 0;
    }
    writeState();
  }

  function queueDayNoteSync() {
    writeState({ syncCentral: false });
    if (dayNoteSyncTimer) {
      win.clearTimeout?.(dayNoteSyncTimer);
    }
    dayNoteSyncTimer = win.setTimeout?.(() => {
      dayNoteSyncTimer = 0;
      writeState();
    }, 550) || 0;
  }

  function clearPlannerClickTimer() {
    if (plannerClickTimer) {
      win.clearTimeout?.(plannerClickTimer);
      plannerClickTimer = 0;
    }
  }

  function schedulePlannerSingleClick(action) {
    clearPlannerClickTimer();
    plannerClickTimer = win.setTimeout?.(() => {
      plannerClickTimer = 0;
      action();
    }, 180) || 0;
    if (!plannerClickTimer) {
      action();
    }
  }

  function updatePlannerDayNote(dateValue, note, options = {}) {
    const state = getState();
    if (!state || !canEdit() || !dateValue) {
      return;
    }
    setScheduleDayNote(state, dateValue, note);
    if (options.flush) {
      flushDayNoteSync();
      return;
    }
    queueDayNoteSync();
  }

  function submitEventForm(event) {
    event.preventDefault?.();
    const state = getState();
    if (!state || !isDayEditing()) {
      return;
    }
    const values = options.getFormValues?.(event.currentTarget) || {};
    if (!values.date || !values.title) {
      return;
    }
    const result = upsertScheduleEventFromValues(state, values, editingEventId);
    if (!result.changed) {
      return;
    }
    editingEventId = result.editingEventId;
    writeState();
    event.currentTarget?.reset?.();
    dayPanelMode = "view";
    render();
  }

  function handleDateGridClick(event) {
    const dateTrigger = getClosest(event.target, "[data-schedule-date]");
    if (!dateTrigger) {
      return;
    }
    selectDate(dateTrigger.dataset.scheduleDate);
  }

  function handleDayCardClick(event) {
    const sessionTrigger = getClosest(event.target, "[data-schedule-open-session-date]");
    if (sessionTrigger) {
      const dateValue = sessionTrigger.dataset.scheduleOpenSessionDate;
      if (dateValue) {
        options.onOpenSessionDate?.(dateValue, {
          createSession: sessionTrigger.dataset.scheduleCreateSession === "true",
        });
      }
      return;
    }

    const periodizationTrigger = getClosest(event.target, "[data-schedule-open-periodization-date]");
    if (periodizationTrigger) {
      const dateValue = periodizationTrigger.dataset.scheduleOpenPeriodizationDate;
      if (dateValue) {
        options.onOpenPeriodizationDate?.(dateValue);
      }
      return;
    }

    const editDayTrigger = getClosest(event.target, "[data-schedule-edit-day]");
    if (!editDayTrigger) {
      return;
    }
    toggleDayEditMode();
  }

  function handleEventListClick(event) {
    const editTrigger = getClosest(event.target, "[data-edit-schedule-event]");
    if (editTrigger) {
      startEditingEvent(editTrigger.dataset.editScheduleEvent);
      return;
    }

    const removeTrigger = getClosest(event.target, "[data-remove-schedule-event]");
    if (!removeTrigger) {
      return;
    }
    removeEvent(removeTrigger.dataset.removeScheduleEvent);
  }

  function handlePlannerClick(event) {
    const clearNoteTrigger = getClosest(event.target, "[data-clear-schedule-day-note]");
    if (clearNoteTrigger) {
      event.preventDefault?.();
      updatePlannerDayNote(clearNoteTrigger.dataset.clearScheduleDayNote, "", { flush: true });
      render();
      return;
    }

    const removeTrigger = getClosest(event.target, "[data-planner-remove-schedule-event]");
    if (removeTrigger) {
      event.preventDefault?.();
      removePlannerEvent(removeTrigger.dataset.plannerRemoveScheduleEvent);
      return;
    }

    const editTrigger = getClosest(event.target, "[data-planner-edit-schedule-event]");
    if (editTrigger) {
      event.preventDefault?.();
      startPlannerInlineEdit(editTrigger.dataset.plannerEditScheduleEvent);
      return;
    }

    if (getClosest(event.target, ".schedule-planner-add")) {
      return;
    }

    const chip = getClosest(event.target, "[data-planner-event-id]");
    if (chip) {
      event.preventDefault?.();
      const eventId = chip.dataset.plannerEventId;
      schedulePlannerSingleClick(() => selectPlannerEvent(eventId));
      return;
    }

    const dateTrigger = getClosest(event.target, "[data-schedule-date]");
    if (dateTrigger) {
      const dateValue = dateTrigger.dataset.scheduleDate;
      schedulePlannerSingleClick(() => selectDate(dateValue));
    }
  }

  function handlePlannerDblClick(event) {
    clearPlannerClickTimer();
    if (getClosest(event.target, ".schedule-planner-add, .schedule-planner-edit, .schedule-planner-notes")) {
      return;
    }
    const chip = getClosest(event.target, "[data-planner-event-id]");
    if (chip) {
      event.preventDefault?.();
      startPlannerInlineEdit(chip.dataset.plannerEventId);
      return;
    }

    const day = getClosest(event.target, "[data-schedule-date]");
    if (!day) {
      return;
    }
    event.preventDefault?.();
    const dateValue = day.dataset.scheduleDate;
    const events = getEventsForDate(dateValue);
    if (events.length) {
      startPlannerInlineEdit(events[0].id);
      return;
    }
    startPlannerDateInlineAdd(dateValue);
  }

  function handlePlannerSubmit(event) {
    const editForm = getClosest(event.target, "[data-schedule-planner-edit-event]");
    if (editForm) {
      event.preventDefault?.();
      const input = editForm.querySelector?.("[name='plannerTitle']");
      savePlannerEvent(editForm.dataset.schedulePlannerEditEvent, input?.value);
      return;
    }

    const form = getClosest(event.target, "[data-schedule-planner-add-date]");
    if (!form) {
      return;
    }
    event.preventDefault?.();
    const input = form.querySelector?.("[name='plannerTitle']");
    addPlannerEvent(form.dataset.schedulePlannerAddDate, input?.value);
  }

  function handlePlannerKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }
    const editInput = getClosest(event.target, ".schedule-planner-edit input");
    if (editInput) {
      plannerEditingEventId = "";
      plannerEditingDate = "";
      render();
      return;
    }
    const input = getClosest(event.target, ".schedule-planner-add input");
    if (!input) {
      return;
    }
    input.value = "";
    plannerEditingDate = "";
    input.blur?.();
    render();
  }

  function handlePlannerInput(event) {
    const noteInput = getClosest(event.target, "[data-schedule-day-note]");
    if (!noteInput) {
      return;
    }
    updatePlannerDayNote(noteInput.dataset.scheduleDayNote, noteInput.value);
  }

  function handlePlannerChange(event) {
    const noteInput = getClosest(event.target, "[data-schedule-day-note]");
    if (!noteInput) {
      return;
    }
    updatePlannerDayNote(noteInput.dataset.scheduleDayNote, noteInput.value, { flush: true });
  }

  function handleDocumentKeydown(event) {
    const key = String(event.key || "").toLowerCase();
    const isCopyShortcut = (event.metaKey || event.ctrlKey) && key === "c";
    const isPasteShortcut = (event.metaKey || event.ctrlKey) && key === "v";
    const isQuickCopy = key === "c" && !event.metaKey && !event.ctrlKey && !event.altKey;
    const isQuickPaste = key === "v" && !event.metaKey && !event.ctrlKey && !event.altKey;

    if (!isActive() || !canEdit() || isEditableKeyboardTarget(event.target)) {
      return false;
    }
    if (!isCopyShortcut && !isPasteShortcut && !isQuickCopy && !isQuickPaste) {
      return false;
    }

    event.preventDefault?.();
    if (isCopyShortcut || isQuickCopy) {
      if (!copySelectedPlannerEvent()) {
        copySelectedDay();
      }
    } else {
      pasteClipboardToSelectedDay();
    }
    return true;
  }

  function handleDocumentCopy(event) {
    const state = getState();
    if (!isActive() || !canEdit() || isEditableKeyboardTarget(event.target)) {
      return;
    }
    const selectedPlannerEvent =
      state?.viewMode === "planner" ? state.events?.find?.((item) => item.id === selectedPlannerEventId) : null;
    if (selectedPlannerEvent) {
      event.preventDefault?.();
      copySelectedPlannerEvent();
      event.clipboardData?.setData?.(
        "text/plain",
        [selectedPlannerEvent.time, selectedPlannerEvent.title, selectedPlannerEvent.note].filter(Boolean).join(" - ")
      );
      return;
    }
    const events = getEventsForDate(state?.selectedDate);
    if (!events.length) {
      return;
    }
    event.preventDefault?.();
    copySelectedDay();
    event.clipboardData?.setData?.(
      "text/plain",
      events.map((item) => [item.time, item.title, item.note].filter(Boolean).join(" - ")).join("\n")
    );
  }

  function handleDocumentPaste(event) {
    if (!isActive() || !canEdit() || isEditableKeyboardTarget(event.target) || !clipboard?.events?.length) {
      return;
    }
    event.preventDefault?.();
    pasteClipboardToSelectedDay();
  }

  function bind() {
    if (isBound) {
      return;
    }
    isBound = true;

    ui.schedulePrevMonthButton?.addEventListener?.("click", () => {
      shiftWindow(-getScheduleNavigationStepForState(getState()));
    });
    ui.scheduleNextMonthButton?.addEventListener?.("click", () => {
      shiftWindow(getScheduleNavigationStepForState(getState()));
    });
    ui.scheduleTodayButton?.addEventListener?.("click", jumpToToday);
    ui.scheduleMonthViewButton?.addEventListener?.("click", () => setViewMode("month"));
    ui.scheduleWeekViewButton?.addEventListener?.("click", () => setViewMode("week"));
    ui.scheduleOverviewViewButton?.addEventListener?.("click", () => setViewMode("overview"));
    ui.schedulePlannerViewButton?.addEventListener?.("click", () => setViewMode("planner"));
    ui.scheduleOverviewSpanButtons?.forEach?.((button) => {
      button.addEventListener?.("click", () => setOverviewSpan(button.dataset.scheduleSpan));
    });
    ui.scheduleCalendarGrid?.addEventListener?.("click", handleDateGridClick);
    ui.scheduleOverviewGrid?.addEventListener?.("click", handleDateGridClick);
    ui.scheduleWeekGrid?.addEventListener?.("click", handleDateGridClick);
    ui.schedulePlannerGrid?.addEventListener?.("click", handlePlannerClick);
    ui.schedulePlannerGrid?.addEventListener?.("dblclick", handlePlannerDblClick);
    ui.schedulePlannerGrid?.addEventListener?.("submit", handlePlannerSubmit);
    ui.schedulePlannerGrid?.addEventListener?.("keydown", handlePlannerKeydown);
    ui.schedulePlannerGrid?.addEventListener?.("input", handlePlannerInput);
    ui.schedulePlannerGrid?.addEventListener?.("change", handlePlannerChange);
    ui.scheduleDayCard?.addEventListener?.("click", handleDayCardClick);
    ui.scheduleEventList?.addEventListener?.("click", handleEventListClick);
    ui.scheduleCopyDayButton?.addEventListener?.("click", copySelectedDay);
    ui.schedulePasteDayButton?.addEventListener?.("click", pasteClipboardToSelectedDay);
    ui.scheduleEventCancelButton?.addEventListener?.("click", () => clearEventEditor({ returnToView: true }));
    ui.scheduleEventForm?.addEventListener?.("submit", submitEventForm);
    doc?.addEventListener?.("keydown", handleDocumentKeydown);
    doc?.addEventListener?.("copy", handleDocumentCopy);
    doc?.addEventListener?.("paste", handleDocumentPaste);
  }

  return Object.freeze({
    bind,
    clearEventEditor,
    copyEvent,
    copySelectedDay,
    getUiState: () => ({
      clipboard,
      editingEventId,
      dayPanelMode,
    }),
    handleDocumentKeydown,
    isDayEditing,
    pasteClipboardToSelectedDay,
    render,
    selectDate,
    startEditingEvent,
  });
}
