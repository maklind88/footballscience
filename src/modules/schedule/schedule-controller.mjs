import {
  createScheduleDayClipboard,
  createScheduleEventClipboard,
  getScheduleNavigationStepForState,
  moveScheduleEventToDate,
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
  let plannerNoteDate = "";
  let plannerNoteAnchor = null;
  let draggedPlannerEventId = "";
  let plannerPointerDrag = null;
  let plannerDragGhost = null;
  let suppressPlannerClick = false;
  let plannerResizeTimer = 0;
  let plannerLayoutSyncFrame = 0;
  let plannerLayoutSyncTimer = 0;
  let plannerClickTimer = 0;
  let dateGridClickTimer = 0;
  let pendingDateGridClick = null;
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

  function getPlannerWindowSnapshot(state) {
    return state?.viewMode === "planner"
      ? {
          selectedYear: state.selectedYear,
          selectedMonthIndex: state.selectedMonthIndex,
        }
      : null;
  }

  function restorePlannerWindow(state, snapshot) {
    if (!state || !snapshot) {
      return;
    }
    state.selectedYear = snapshot.selectedYear;
    state.selectedMonthIndex = snapshot.selectedMonthIndex;
  }

  function getPlannerVisibleMonthCount() {
    const monthCount = Number(ui.schedulePlannerGrid?.dataset?.months);
    return [2, 3, 4].includes(monthCount) ? monthCount : 3;
  }

  function clearPlannerLayoutSync() {
    if (plannerLayoutSyncFrame) {
      win.cancelAnimationFrame?.(plannerLayoutSyncFrame);
      plannerLayoutSyncFrame = 0;
    }
    if (plannerLayoutSyncTimer) {
      win.clearTimeout?.(plannerLayoutSyncTimer);
      plannerLayoutSyncTimer = 0;
    }
  }

  function getPlannerLayoutWidth() {
    const grid = ui.schedulePlannerGrid;
    return (
      Number(grid?.clientWidth) ||
      Number(grid?.parentElement?.clientWidth) ||
      Number(ui.scheduleWorkspace?.clientWidth) ||
      0
    );
  }

  function getExpectedPlannerVisibleMonthCount() {
    const layoutWidth = getPlannerLayoutWidth();
    if (!layoutWidth || typeof renderer.getPlannerMonthCountForWidth !== "function") {
      return getPlannerVisibleMonthCount();
    }
    return renderer.getPlannerMonthCountForWidth(layoutWidth);
  }

  function runPlannerLayoutSync() {
    plannerLayoutSyncFrame = 0;
    plannerLayoutSyncTimer = 0;
    const state = getState();
    if (!isActive() || state?.viewMode !== "planner") {
      return;
    }
    if (getExpectedPlannerVisibleMonthCount() !== getPlannerVisibleMonthCount()) {
      render();
    }
  }

  function schedulePlannerLayoutSync() {
    clearPlannerLayoutSync();
    const state = getState();
    if (!isActive() || state?.viewMode !== "planner") {
      return;
    }
    if (typeof win.requestAnimationFrame === "function") {
      plannerLayoutSyncFrame = win.requestAnimationFrame(() => {
        plannerLayoutSyncFrame = 0;
        plannerLayoutSyncFrame =
          typeof win.requestAnimationFrame === "function"
            ? win.requestAnimationFrame(runPlannerLayoutSync)
            : 0;
        if (!plannerLayoutSyncFrame) {
          runPlannerLayoutSync();
        }
      });
      return;
    }
    plannerLayoutSyncTimer = win.setTimeout?.(runPlannerLayoutSync, 0) || 0;
    if (!plannerLayoutSyncTimer) {
      runPlannerLayoutSync();
    }
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
      plannerNoteDate,
      plannerNoteAnchor,
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
    schedulePlannerLayoutSync();
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
      plannerNoteDate = "";
      draggedPlannerEventId = "";
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
    plannerNoteDate = "";
    draggedPlannerEventId = "";
    selectScheduleStateDate(state, dateValue, selectOptions);
    writeState({ syncCentral: false });
    render();
    if (selectOptions.scrollIntoView) {
      scrollDateIntoView(state.selectedDate);
    }
  }

  function clearPendingDateGridClick() {
    if (dateGridClickTimer) {
      win.clearTimeout?.(dateGridClickTimer);
      dateGridClickTimer = 0;
    }
    pendingDateGridClick = null;
  }

  function rememberDateGridClick(dateValue) {
    clearPendingDateGridClick();
    pendingDateGridClick = {
      dateValue,
      clickedAt: Date.now(),
    };
    dateGridClickTimer =
      win.setTimeout?.(() => {
        dateGridClickTimer = 0;
        pendingDateGridClick = null;
      }, 420) || 0;
  }

  function consumeDateGridDoubleClick(dateValue) {
    if (!pendingDateGridClick || pendingDateGridClick.dateValue !== dateValue) {
      return false;
    }
    if (Date.now() - pendingDateGridClick.clickedAt > 420) {
      clearPendingDateGridClick();
      return false;
    }
    clearPendingDateGridClick();
    return true;
  }

  function focusDayEditor() {
    const run = () => {
      ui.scheduleEventTitle?.focus?.();
      ui.scheduleEventTitle?.select?.();
    };
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(run);
      return;
    }
    run();
  }

  function openDayEditorForDate(dateValue) {
    const state = ensureState();
    if (!state || !dateValue) {
      return;
    }
    if (!canEdit()) {
      selectDate(dateValue);
      return;
    }
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    plannerNoteDate = "";
    draggedPlannerEventId = "";
    selectScheduleStateDate(state, dateValue);
    const dayEvents = getEventsForDate(state.selectedDate);
    editingEventId = dayEvents.length === 1 ? dayEvents[0].id : "";
    dayPanelMode = "edit";
    writeState({ syncCentral: false });
    render();
    focusDayEditor();
  }

  function jumpToToday() {
    selectDate(formatScheduleDateValue(new Date()), {
      keepOverviewWindow: false,
      keepPlannerWindow: false,
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
    plannerNoteDate = "";
    dayPanelMode = "edit";
    writeState({ syncCentral: false });
    render();
  }

  function clearEventEditor({ returnToView = false } = {}) {
    editingEventId = "";
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    plannerNoteDate = "";
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
    plannerNoteDate = "";
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
    plannerNoteDate = "";
    dayPanelMode = "view";
    state.selectedDate = event.date;
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
    plannerNoteDate = "";
    dayPanelMode = "view";
    state.selectedDate = dateValue;
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
    const plannerWindow = getPlannerWindowSnapshot(state);
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
    restorePlannerWindow(state, plannerWindow);
    plannerEditingEventId = "";
    plannerEditingDate = "";
    editingEventId = "";
    selectedPlannerEventId = event.id;
    plannerNoteDate = "";
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
    const plannerWindow = getPlannerWindowSnapshot(state);
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
    restorePlannerWindow(state, plannerWindow);
    dayPanelMode = "view";
    editingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    plannerNoteDate = "";
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
    plannerNoteDate = "";
    dayPanelMode = "view";
    state.selectedDate = event.date;
    writeState({ syncCentral: false });
    render();
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

  function focusPlannerNoteEditor(dateValue) {
    const run = () => {
      const input = ui.schedulePlannerGrid?.querySelector?.(`[data-schedule-day-note="${dateValue}"]`);
      input?.focus?.();
      input?.select?.();
    };
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(run);
      return;
    }
    run();
  }

  function getPlannerGridElement() {
    if (!ui.schedulePlannerGrid?.isConnected) {
      ui.schedulePlannerGrid = doc?.getElementById?.("schedulePlannerGrid") || ui.schedulePlannerGrid || null;
    }
    return ui.schedulePlannerGrid || doc?.getElementById?.("schedulePlannerGrid") || null;
  }

  function getPlannerNoteAnchor(point = null) {
    if (!point) {
      return null;
    }

    const rawX = Number(point.x ?? point.clientX);
    const rawY = Number(point.y ?? point.clientY);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return null;
    }

    const viewportWidth = Number(win.innerWidth) || 0;
    const viewportHeight = Number(win.innerHeight) || 0;
    if (!viewportWidth || !viewportHeight) {
      return {
        x: Math.max(12, Math.round(rawX - 12)),
        y: Math.max(72, Math.round(rawY - 12)),
      };
    }

    const margin = 16;
    const overlayWidth = Math.min(344, Math.max(288, viewportWidth - margin * 2));
    const overlayHeight = Math.min(280, Math.max(252, viewportHeight - margin * 2));
    const minLeft = margin;
    const minTop = Math.min(72, Math.max(margin, viewportHeight - overlayHeight - margin));
    const maxLeft = Math.max(minLeft, viewportWidth - overlayWidth - margin);
    const maxTop = Math.max(minTop, viewportHeight - overlayHeight - margin);
    const opensLeft = rawX > viewportWidth - overlayWidth - margin;
    const opensUp = rawY > viewportHeight - overlayHeight - margin;
    const preferredLeft = opensLeft ? rawX - overlayWidth + 18 : rawX + 12;
    const preferredTop = opensUp ? rawY - overlayHeight + 28 : rawY - 16;
    const left = Math.min(Math.max(minLeft, preferredLeft), maxLeft);
    const top = Math.min(Math.max(minTop, preferredTop), maxTop);
    const arrowX = Math.min(Math.max(18, rawX - left), overlayWidth - 22);
    const frame = getPlannerGridElement()?.closest?.(".schedule-board-card")?.getBoundingClientRect?.();
    const frameLeft = Number.isFinite(frame?.left) ? frame.left : 0;
    const frameTop = Number.isFinite(frame?.top) ? frame.top : 0;

    return {
      arrowX: Math.round(arrowX),
      x: Math.round(Math.max(0, left - frameLeft)),
      y: Math.round(Math.max(0, top - frameTop)),
    };
  }

  function openPlannerNote(dateValue, anchor = null) {
    const state = getState();
    if (!state || !dateValue) {
      return;
    }
    clearPlannerClickTimer();
    editingEventId = "";
    plannerEditingEventId = "";
    plannerEditingDate = "";
    selectedPlannerEventId = "";
    plannerNoteDate = dateValue;
    plannerNoteAnchor = getPlannerNoteAnchor(anchor);
    dayPanelMode = "view";
    state.selectedDate = dateValue;
    writeState({ syncCentral: false });
    render();
    focusPlannerNoteEditor(dateValue);
  }

  function closePlannerNote() {
    if (!plannerNoteDate) {
      return;
    }
    plannerNoteDate = "";
    plannerNoteAnchor = null;
    render();
  }

  function savePlannerNote(dateValue, note) {
    const state = getState();
    if (!state || !canEdit() || !dateValue) {
      return false;
    }
    const changed = setScheduleDayNote(state, dateValue, note);
    plannerNoteDate = "";
    plannerNoteAnchor = null;
    if (changed) {
      writeState();
    }
    render();
    return changed;
  }

  function clearPlannerNote(dateValue) {
    return savePlannerNote(dateValue, "");
  }

  function movePlannerEventToDate(eventId, dateValue) {
    const state = getState();
    if (!state || !canEdit() || !eventId || !dateValue) {
      return;
    }
    const result = moveScheduleEventToDate(state, eventId, dateValue);
    editingEventId = "";
    plannerEditingEventId = "";
    plannerEditingDate = "";
    plannerNoteDate = "";
    selectedPlannerEventId = result.eventId || eventId;
    dayPanelMode = "view";
    if (result.changed) {
      writeState();
    } else {
      writeState({ syncCentral: false });
    }
    render();
  }

  function clearPlannerDropTargets() {
    ui.schedulePlannerGrid?.querySelectorAll?.(".is-drop-target, .is-drop-blocked")?.forEach?.((element) => {
      element.classList.remove("is-drop-target", "is-drop-blocked");
    });
  }

  function startPlannerEventDragVisual(eventId, chip = null) {
    if (!eventId) {
      return;
    }
    clearPlannerClickTimer();
    plannerNoteDate = "";
    draggedPlannerEventId = eventId;
    selectedPlannerEventId = eventId;
    chip?.classList?.add("is-dragging");
    ui.scheduleWorkspace?.classList.add("is-dragging-planner-event");
  }

  function removePlannerDragGhost() {
    plannerDragGhost?.remove?.();
    plannerDragGhost = null;
  }

  function updatePlannerDragGhost(event) {
    if (!plannerDragGhost || typeof event.clientX !== "number" || typeof event.clientY !== "number") {
      return;
    }
    plannerDragGhost.style.transform = `translate3d(${Math.round(event.clientX + 10)}px, ${Math.round(event.clientY + 10)}px, 0)`;
  }

  function createPlannerDragGhost(chip, event) {
    removePlannerDragGhost();
    if (!doc?.createElement || !chip) {
      return;
    }
    const ghost = doc.createElement("div");
    ghost.className = `schedule-planner-drag-ghost ${Array.from(chip.classList || [])
      .filter((className) => className.startsWith("is-"))
      .join(" ")}`;
    ghost.textContent = chip.textContent?.trim() || "Plan";
    doc.body?.append?.(ghost);
    plannerDragGhost = ghost;
    updatePlannerDragGhost(event);
  }

  function stopPlannerEventDragVisual() {
    draggedPlannerEventId = "";
    plannerPointerDrag = null;
    removePlannerDragGhost();
    clearPlannerDropTargets();
    ui.scheduleWorkspace?.classList.remove("is-dragging-planner-event");
    ui.schedulePlannerGrid?.querySelectorAll?.(".schedule-planner-event-chip.is-dragging")?.forEach?.((chip) => {
      chip.classList.remove("is-dragging");
    });
  }

  function getPlannerDropDayFromPoint(event) {
    const element = doc?.elementFromPoint?.(event.clientX, event.clientY);
    return getClosest(element, ".schedule-planner-day[data-schedule-date]");
  }

  function markPlannerDropTarget(day) {
    clearPlannerDropTargets();
    day?.classList?.add("is-drop-target");
  }

  function suppressNextPlannerClick() {
    suppressPlannerClick = true;
    win.setTimeout?.(() => {
      suppressPlannerClick = false;
    }, 0);
  }

  function handlePlannerContextMenu(event) {
    if (!isActive() || getClosest(event.target, ".schedule-planner-note-overlay, .schedule-planner-add, .schedule-planner-edit, [data-planner-event-id]")) {
      return;
    }
    const day = getClosest(event.target, ".schedule-planner-day[data-schedule-date]");
    if (!day) {
      return;
    }
    event.preventDefault?.();
    openPlannerNote(day.dataset.scheduleDate, { x: event.clientX, y: event.clientY });
  }

  function handlePlannerDragStart(event) {
    event.preventDefault?.();
  }

  function handlePlannerDragOver(event) {
    if (!draggedPlannerEventId) {
      return;
    }
    const day = getClosest(event.target, ".schedule-planner-day[data-schedule-date]");
    if (!day) {
      return;
    }
    event.preventDefault?.();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    markPlannerDropTarget(day);
  }

  function handlePlannerDragLeave(event) {
    const day = getClosest(event.target, ".schedule-planner-day[data-schedule-date]");
    if (day && !day.contains?.(event.relatedTarget)) {
      day.classList.remove("is-drop-target", "is-drop-blocked");
    }
  }

  function handlePlannerDrop(event) {
    const day = getClosest(event.target, ".schedule-planner-day[data-schedule-date]");
    if (!day) {
      return;
    }
    event.preventDefault?.();
    const eventId = event.dataTransfer?.getData?.("text/plain") || draggedPlannerEventId;
    const dateValue = day.dataset.scheduleDate;
    stopPlannerEventDragVisual();
    movePlannerEventToDate(eventId, dateValue);
  }

  function handlePlannerDragEnd() {
    stopPlannerEventDragVisual();
  }

  function handlePlannerPointerDown(event) {
    const chip = getClosest(event.target, "[data-planner-event-id]");
    if (!chip || !canEdit() || event.button !== 0 || getClosest(event.target, ".schedule-planner-edit, .schedule-planner-add")) {
      return;
    }
    plannerPointerDrag = {
      eventId: chip.dataset.plannerEventId || "",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      chip,
      dragging: false,
    };
    chip.setPointerCapture?.(event.pointerId);
  }

  function handlePlannerPointerMove(event) {
    if (!plannerPointerDrag?.eventId) {
      return;
    }
    const deltaX = Math.abs(event.clientX - plannerPointerDrag.startX);
    const deltaY = Math.abs(event.clientY - plannerPointerDrag.startY);
    if (!plannerPointerDrag.dragging && Math.hypot(deltaX, deltaY) < 6) {
      return;
    }
    if (!plannerPointerDrag.dragging) {
      plannerPointerDrag.dragging = true;
      startPlannerEventDragVisual(plannerPointerDrag.eventId, plannerPointerDrag.chip);
      createPlannerDragGhost(plannerPointerDrag.chip, event);
    }
    event.preventDefault?.();
    updatePlannerDragGhost(event);
    markPlannerDropTarget(getPlannerDropDayFromPoint(event));
  }

  function handlePlannerPointerUp(event) {
    if (!plannerPointerDrag?.eventId) {
      return;
    }
    const dragState = plannerPointerDrag;
    dragState.chip?.releasePointerCapture?.(dragState.pointerId);
    const targetDay = dragState.dragging ? getPlannerDropDayFromPoint(event) : null;
    stopPlannerEventDragVisual();
    if (!dragState.dragging || !targetDay) {
      return;
    }
    event.preventDefault?.();
    suppressNextPlannerClick();
    movePlannerEventToDate(dragState.eventId, targetDay.dataset.scheduleDate);
  }

  function handlePlannerPointerCancel() {
    stopPlannerEventDragVisual();
  }

  function handleScheduleResize() {
    const state = getState();
    if (!isActive() || state?.viewMode !== "planner") {
      return;
    }
    if (plannerResizeTimer) {
      win.clearTimeout?.(plannerResizeTimer);
    }
    plannerResizeTimer = win.setTimeout?.(() => {
      plannerResizeTimer = 0;
      render();
    }, 120) || 0;
    if (!plannerResizeTimer) {
      render();
    }
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
    const dateValue = dateTrigger.dataset.scheduleDate;
    if (consumeDateGridDoubleClick(dateValue)) {
      event.preventDefault?.();
      openDayEditorForDate(dateValue);
      return;
    }
    rememberDateGridClick(dateValue);
    selectDate(dateValue);
  }

  function handleDateGridDoubleClick(event) {
    const dateTrigger = getClosest(event.target, "[data-schedule-date]");
    if (!dateTrigger) {
      return;
    }
    event.preventDefault?.();
    clearPendingDateGridClick();
    openDayEditorForDate(dateTrigger.dataset.scheduleDate);
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
    if (suppressPlannerClick) {
      event.preventDefault?.();
      suppressPlannerClick = false;
      return;
    }

    const closeNoteTrigger = getClosest(event.target, "[data-close-schedule-day-note]");
    if (closeNoteTrigger) {
      event.preventDefault?.();
      closePlannerNote();
      return;
    }

    const clearNoteTrigger = getClosest(event.target, "[data-clear-schedule-day-note]");
    if (clearNoteTrigger) {
      event.preventDefault?.();
      clearPlannerNote(clearNoteTrigger.dataset.clearScheduleDayNote);
      return;
    }

    const openNoteTrigger = getClosest(event.target, "[data-open-schedule-day-note]");
    if (openNoteTrigger) {
      event.preventDefault?.();
      const rect = openNoteTrigger.getBoundingClientRect?.();
      openPlannerNote(
        openNoteTrigger.dataset.openScheduleDayNote,
        rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
      );
      return;
    }

    if (getClosest(event.target, ".schedule-planner-note-overlay")) {
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

    if (getClosest(event.target, ".schedule-planner-add, .schedule-planner-edit")) {
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
      schedulePlannerSingleClick(() =>
        selectDate(dateValue, {
          plannerWindowMonths: getPlannerVisibleMonthCount(),
        })
      );
    }
  }

  function handlePlannerDblClick(event) {
    clearPlannerClickTimer();
    if (
      getClosest(
        event.target,
        ".schedule-planner-add, .schedule-planner-edit, .schedule-planner-note-overlay, .schedule-planner-note-backdrop, [data-open-schedule-day-note]"
      )
    ) {
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
    const noteForm = getClosest(event.target, "[data-schedule-day-note-form]");
    if (noteForm) {
      event.preventDefault?.();
      const input = noteForm.querySelector?.("[name='dayNote']");
      savePlannerNote(noteForm.dataset.scheduleDayNoteForm, input?.value);
      return;
    }

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
    const noteInput = getClosest(event.target, "[data-schedule-day-note]");
    if (noteInput) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault?.();
        savePlannerNote(noteInput.dataset.scheduleDayNote, noteInput.value);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault?.();
        closePlannerNote();
      }
      return;
    }

    if (event.key === "Escape" && plannerNoteDate) {
      event.preventDefault?.();
      closePlannerNote();
      return;
    }

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

  function handleDocumentKeydown(event) {
    const key = String(event.key || "").toLowerCase();
    const isCopyShortcut = (event.metaKey || event.ctrlKey) && key === "c";
    const isPasteShortcut = (event.metaKey || event.ctrlKey) && key === "v";
    const isQuickCopy = key === "c" && !event.metaKey && !event.ctrlKey && !event.altKey;
    const isQuickPaste = key === "v" && !event.metaKey && !event.ctrlKey && !event.altKey;
    const isPlannerDelete = (key === "delete" || key === "backspace") && !event.metaKey && !event.ctrlKey && !event.altKey;

    if (!isActive() || !canEdit() || isEditableKeyboardTarget(event.target)) {
      return false;
    }
    if (isPlannerDelete) {
      const state = getState();
      if (state?.viewMode === "planner" && selectedPlannerEventId) {
        event.preventDefault?.();
        removePlannerEvent(selectedPlannerEventId);
        return true;
      }
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
    ui.scheduleCalendarGrid?.addEventListener?.("dblclick", handleDateGridDoubleClick);
    ui.scheduleOverviewGrid?.addEventListener?.("click", handleDateGridClick);
    ui.scheduleOverviewGrid?.addEventListener?.("dblclick", handleDateGridDoubleClick);
    ui.scheduleWeekGrid?.addEventListener?.("click", handleDateGridClick);
    ui.scheduleWeekGrid?.addEventListener?.("dblclick", handleDateGridDoubleClick);
    ui.schedulePlannerGrid?.addEventListener?.("click", handlePlannerClick);
    ui.schedulePlannerGrid?.addEventListener?.("dblclick", handlePlannerDblClick);
    ui.schedulePlannerGrid?.addEventListener?.("submit", handlePlannerSubmit);
    ui.schedulePlannerGrid?.addEventListener?.("keydown", handlePlannerKeydown);
    ui.schedulePlannerGrid?.addEventListener?.("contextmenu", handlePlannerContextMenu);
    ui.schedulePlannerGrid?.addEventListener?.("dragstart", handlePlannerDragStart);
    ui.schedulePlannerGrid?.addEventListener?.("dragover", handlePlannerDragOver);
    ui.schedulePlannerGrid?.addEventListener?.("dragleave", handlePlannerDragLeave);
    ui.schedulePlannerGrid?.addEventListener?.("drop", handlePlannerDrop);
    ui.schedulePlannerGrid?.addEventListener?.("dragend", handlePlannerDragEnd);
    ui.schedulePlannerGrid?.addEventListener?.("pointerdown", handlePlannerPointerDown);
    ui.schedulePlannerGrid?.addEventListener?.("pointermove", handlePlannerPointerMove);
    ui.schedulePlannerGrid?.addEventListener?.("pointerup", handlePlannerPointerUp);
    ui.schedulePlannerGrid?.addEventListener?.("pointercancel", handlePlannerPointerCancel);
    ui.scheduleDayCard?.addEventListener?.("click", handleDayCardClick);
    ui.scheduleEventList?.addEventListener?.("click", handleEventListClick);
    ui.scheduleCopyDayButton?.addEventListener?.("click", copySelectedDay);
    ui.schedulePasteDayButton?.addEventListener?.("click", pasteClipboardToSelectedDay);
    ui.scheduleEventCancelButton?.addEventListener?.("click", () => clearEventEditor({ returnToView: true }));
    ui.scheduleEventForm?.addEventListener?.("submit", submitEventForm);
    doc?.addEventListener?.("keydown", handleDocumentKeydown);
    doc?.addEventListener?.("copy", handleDocumentCopy);
    doc?.addEventListener?.("paste", handleDocumentPaste);
    win?.addEventListener?.("resize", handleScheduleResize);
  }

  return Object.freeze({
    bind,
    clearEventEditor,
    copyEvent,
    copySelectedDay,
    getUiState: () => ({
      clipboard,
      editingEventId,
      plannerNoteDate,
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
