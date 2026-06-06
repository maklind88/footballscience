import {
  createScheduleDayClipboard,
  createScheduleEventClipboard,
  getScheduleNavigationStepForState,
  pasteScheduleClipboard,
  removeScheduleEventById,
  selectScheduleStateDate,
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

export function createScheduleWorkspaceController(options = {}) {
  const ui = options.ui || {};
  const win = options.window || globalThis.window || {};
  const doc = options.document || globalThis.document || null;
  const renderer = options.renderer || createScheduleWorkspaceRenderer(options.rendererOptions);
  const isEditableKeyboardTarget =
    typeof options.isEditableKeyboardTarget === "function"
      ? options.isEditableKeyboardTarget
      : defaultIsEditableKeyboardTarget;

  let clipboard = null;
  let editingEventId = "";
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
    dayPanelMode = "edit";
    writeState({ syncCentral: false });
    render();
  }

  function clearEventEditor({ returnToView = false } = {}) {
    editingEventId = "";
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
    writeState();
    render();
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
      copySelectedDay();
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
    ui.scheduleOverviewSpanButtons?.forEach?.((button) => {
      button.addEventListener?.("click", () => setOverviewSpan(button.dataset.scheduleSpan));
    });
    ui.scheduleCalendarGrid?.addEventListener?.("click", handleDateGridClick);
    ui.scheduleOverviewGrid?.addEventListener?.("click", handleDateGridClick);
    ui.scheduleWeekGrid?.addEventListener?.("click", handleDateGridClick);
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
