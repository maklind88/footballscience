import {
  formatScheduleDateValue,
  parseScheduleDateValue,
  scheduleEventTypes,
  scheduleMainEventPriority,
} from "./schedule-state.mjs";

function defaultEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function addCalendarDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatScheduleMonthLabel(date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
  }).format(date);
}

function formatSchedulePlannerWeekday(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
  }).format(date);
}

function getScheduleDateLabel(dateValue) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseScheduleDateValue(dateValue));
}

function getScheduleMonthGridDates(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function getScheduleWeekDates(dateValue) {
  const selectedDate = parseScheduleDateValue(dateValue);
  const mondayOffset = (selectedDate.getDay() + 6) % 7;
  const weekStart = addCalendarDays(selectedDate, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
}

function getScheduleLegendTypes(events = []) {
  return Array.from(new Set(events.map((event) => event.type)))
    .filter((type) => scheduleEventTypes[type])
    .sort((typeA, typeB) => (scheduleMainEventPriority[typeA] ?? 99) - (scheduleMainEventPriority[typeB] ?? 99));
}

function defaultSelectedDayContext() {
  return {
    sessionSnapshot: { hasSession: false, blocks: [], minutes: 0 },
    periodizationLabel: "",
    matchDayLabel: "",
    phaseSummary: "",
  };
}

function defaultFormatBlockSummary(blockCount, minutes = 0) {
  const blockLabel = `${blockCount} block${blockCount === 1 ? "" : "s"}`;
  return minutes ? `${blockLabel} / ${minutes} min` : blockLabel;
}

function defaultIsSessionEvent(event = {}) {
  const title = String(event.title || "").toLowerCase();
  return event.type === "training" || title.includes("training");
}

export function createScheduleWorkspaceRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getPeriodizationDay =
    typeof options.getPeriodizationDay === "function" ? options.getPeriodizationDay : () => ({});
  const getPeriodizationDayScheduleLabel =
    typeof options.getPeriodizationDayScheduleLabel === "function"
      ? options.getPeriodizationDayScheduleLabel
      : () => "";
  const getNow = typeof options.getNow === "function" ? options.getNow : () => new Date();

  function renderEventPill(event) {
    const eventType = scheduleEventTypes[event.type] ?? scheduleEventTypes.training;
    return `
    <span class="schedule-event-pill is-${escapeHtml(eventType.tone)}">
      ${event.time ? `<small>${escapeHtml(event.time)}</small>` : ""}
      ${escapeHtml(event.title)}
    </span>
  `;
  }

  function renderOverviewLegend(events = []) {
    const types = getScheduleLegendTypes(events);
    if (!types.length) {
      return "";
    }
    return `
    <div class="schedule-overview-legend" aria-label="Calendar colour legend">
      ${types
        .map((type) => {
          const eventType = scheduleEventTypes[type];
          return `
<span class="schedule-overview-legend-item is-main-${escapeHtml(eventType.tone)}">
<i aria-hidden="true"></i>
${escapeHtml(eventType.label)}
</span>
`;
        })
        .join("")}
    </div>
  `;
  }

  function renderMonthDay(context, date, isCompact = false, visibleMonthIndex = context.state?.selectedMonthIndex) {
    const { state, getEventsForDate, getVisibleEvents = (events) => events } = context;
    if (!state) {
      return "";
    }
    const dateValue = formatScheduleDateValue(date);
    const selectedDateValue = state.selectedDate;
    const todayValue = formatScheduleDateValue(getNow());
    const isCurrentMonth = date.getMonth() === visibleMonthIndex;
    const canHighlight = !isCompact || isCurrentMonth;
    const isSelected = canHighlight && dateValue === selectedDateValue;
    const isToday = canHighlight && dateValue === todayValue;
    const allEvents = getEventsForDate(dateValue);
    const events = getVisibleEvents(allEvents);
    const mainEvent = getMainEvent(events);
    const mainTone = mainEvent ? scheduleEventTypes[mainEvent.type]?.tone || "training" : "";
    const eventToneClass = mainTone ? ` is-main-${mainTone}` : "";
    const ariaLabel = getScheduleDateLabel(dateValue);

    if (isCompact) {
      if (!isCurrentMonth) {
        return `<span class="schedule-overview-day-spacer" aria-hidden="true"></span>`;
      }
      return `
      <button
        type="button"
        class="schedule-overview-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${events.length ? ` has-events${eventToneClass}` : ""}"
        data-schedule-date="${escapeHtml(dateValue)}"
        aria-label="${escapeHtml(ariaLabel)}"
      >
        <span>${date.getDate()}</span>
      </button>
    `;
    }

    const visibleEvents = mainEvent ? renderEventPill(mainEvent) : "";
    const overflow = events.length > 1 ? `<span class="schedule-more-pill">+${events.length - 1}</span>` : "";
    return `
    <button
      type="button"
      class="schedule-day-button${isCurrentMonth ? "" : " is-muted"}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${events.length ? ` has-events${eventToneClass}` : ""}"
      data-schedule-date="${escapeHtml(dateValue)}"
      aria-label="${escapeHtml(ariaLabel)}"
    >
      <span class="schedule-day-number">${date.getDate()}</span>
      <span class="schedule-day-events">${visibleEvents}${overflow}</span>
    </button>
  `;
  }

  function getMainEvent(events = []) {
    return [...events].sort((a, b) => {
      const priorityA = scheduleMainEventPriority[a.type] ?? 99;
      const priorityB = scheduleMainEventPriority[b.type] ?? 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return `${a.time || "99:99"} ${a.title}`.localeCompare(`${b.time || "99:99"} ${b.title}`);
    })[0];
  }

  function renderOverviewMonth(context, monthDate) {
    const monthLabel = formatScheduleMonthLabel(monthDate);
    const dates = getScheduleMonthGridDates(monthDate.getFullYear(), monthDate.getMonth());
    const monthEvents = context.getVisibleMonthEvents(monthDate.getFullYear(), monthDate.getMonth());
    return `
    <article class="schedule-overview-month">
      <header>
        <h3>${escapeHtml(monthLabel)}</h3>
      </header>
      <div class="schedule-overview-weekdays" aria-hidden="true">
        <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
      </div>
      <div class="schedule-overview-days">
        ${dates.map((date) => renderMonthDay(context, date, true, monthDate.getMonth())).join("")}
      </div>
      ${renderOverviewLegend(monthEvents)}
    </article>
  `;
  }

  function getScheduleMonthDates(year, monthIndex) {
    const monthLength = new Date(year, monthIndex + 1, 0).getDate();
    return Array.from({ length: monthLength }, (_, index) => new Date(year, monthIndex, index + 1));
  }

  function inferPlannerTone(events = []) {
    const mainEvent = getMainEvent(events);
    return mainEvent ? scheduleEventTypes[mainEvent.type]?.tone || "training" : "";
  }

  function renderPlannerEventChip(event, canEdit, isPlannerEditing = false) {
    const eventType = scheduleEventTypes[event.type] ?? scheduleEventTypes.training;
    const eventMeta = [event.time, event.note].filter(Boolean).join(" · ");
    if (isPlannerEditing && canEdit) {
      return `
        <form class="schedule-planner-edit" data-schedule-planner-edit-event="${escapeHtml(event.id)}">
          <input name="plannerTitle" type="text" autocomplete="off" value="${escapeHtml(event.title)}" aria-label="Edit ${escapeHtml(event.title)}" />
        </form>
      `;
    }
    const controls = canEdit
      ? `
        <span class="schedule-planner-event-actions">
          <button type="button" data-planner-edit-schedule-event="${escapeHtml(event.id)}" aria-label="Edit ${escapeHtml(event.title)}">Edit</button>
          <button type="button" data-planner-remove-schedule-event="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">×</button>
        </span>
      `
      : "";
    return `
      <span class="schedule-planner-event-chip is-${escapeHtml(eventType.tone)}" data-planner-event-id="${escapeHtml(event.id)}">
        <span>
          <strong>${escapeHtml(event.title)}</strong>
          ${eventMeta ? `<small>${escapeHtml(eventMeta)}</small>` : ""}
        </span>
        ${controls}
      </span>
    `;
  }

  function renderPlannerDay(context, date) {
    const { state, getEventsForDate, getVisibleEvents = (events) => events, canEdit } = context;
    const dateValue = formatScheduleDateValue(date);
    const selectedDateValue = state?.selectedDate || "";
    const todayValue = formatScheduleDateValue(getNow());
    const allEvents = getEventsForDate(dateValue);
    const events = getVisibleEvents(allEvents);
    const plannerEditingEventId = context.plannerEditingEventId || "";
    const mainTone = inferPlannerTone(events);
    const eventToneClass = mainTone ? ` is-main-${mainTone}` : "";
    const isSelected = dateValue === selectedDateValue;
    const isToday = dateValue === todayValue;
    const weekdayLabel = formatSchedulePlannerWeekday(date);
    const eventMarkup = events.length
      ? events.map((event) => renderPlannerEventChip(event, canEdit, event.id === plannerEditingEventId)).join("")
      : `<span class="schedule-planner-empty">No plan</span>`;
    const addForm = canEdit
      ? `
        <form class="schedule-planner-add" data-schedule-planner-add-date="${escapeHtml(dateValue)}">
          <input name="plannerTitle" type="text" autocomplete="off" placeholder="Add plan..." aria-label="Add plan for ${escapeHtml(getScheduleDateLabel(dateValue))}" />
        </form>
      `
      : "";
    return `
      <article class="schedule-planner-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${events.length ? ` has-events${eventToneClass}` : ""}" data-schedule-date="${escapeHtml(dateValue)}">
        <button type="button" class="schedule-planner-date" data-schedule-date="${escapeHtml(dateValue)}" aria-label="${escapeHtml(getScheduleDateLabel(dateValue))}">
          <span>${escapeHtml(weekdayLabel)}</span>
          <strong>${date.getDate()}</strong>
        </button>
        <div class="schedule-planner-events">
          ${eventMarkup}
          ${addForm}
        </div>
      </article>
    `;
  }

  function renderPlannerMonth(context, monthDate) {
    const monthLabel = formatScheduleMonthLabel(monthDate);
    const dates = getScheduleMonthDates(monthDate.getFullYear(), monthDate.getMonth());
    const monthEvents = context.getVisibleMonthEvents(monthDate.getFullYear(), monthDate.getMonth());
    return `
      <article class="schedule-planner-month">
        <header>
          <h3>${escapeHtml(monthLabel)}</h3>
          ${renderOverviewLegend(monthEvents)}
        </header>
        <div class="schedule-planner-days">
          ${dates.map((date) => renderPlannerDay(context, date)).join("")}
        </div>
      </article>
    `;
  }

  function renderWeekDay(context, date) {
    const { state, getEventsForDate, getVisibleEvents = (events) => events, getSessionForDate = () => null } = context;
    const dateValue = formatScheduleDateValue(date);
    const selectedDateValue = state?.selectedDate || "";
    const todayValue = formatScheduleDateValue(getNow());
    const allEvents = getEventsForDate(dateValue);
    const events = getVisibleEvents(allEvents);
    const mainEvent = getMainEvent(events);
    const mainTone = mainEvent ? scheduleEventTypes[mainEvent.type]?.tone || "training" : "";
    const eventToneClass = mainTone ? ` is-main-${mainTone}` : "";
    const periodizationDay = getPeriodizationDay(dateValue);
    const periodizationLabel = getPeriodizationDayScheduleLabel(periodizationDay);
    const session = getSessionForDate(dateValue);
    const sessionBlockCount = Array.isArray(session?.blocks) ? session.blocks.length : 0;
    const weekdayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
    const eventSummary = events.length
      ? `<span class="schedule-week-event-summary">${events.length} plan${events.length === 1 ? "" : "s"}</span>`
      : `<span class="schedule-week-empty"></span>`;
    return `
    <article class="schedule-week-day${dateValue === selectedDateValue ? " is-selected" : ""}${dateValue === todayValue ? " is-today" : ""}${events.length ? ` has-events${eventToneClass}` : ""}" data-schedule-date="${escapeHtml(dateValue)}">
      <button type="button" class="schedule-week-day-head" data-schedule-date="${escapeHtml(dateValue)}">
        <span>${escapeHtml(weekdayLabel)}</span>
        <strong>${date.getDate()}</strong>
      </button>
      <div class="schedule-week-day-meta">
        ${periodizationLabel ? `<span>${escapeHtml(periodizationLabel)}</span>` : ""}
        ${sessionBlockCount ? `<span>${sessionBlockCount} blocks</span>` : ""}
      </div>
      <div class="schedule-week-event-stack">
        ${eventSummary}
      </div>
    </article>
  `;
  }

  function renderEventCard(context, event, isAdmin, dayContext = null) {
    const eventType = scheduleEventTypes[event.type] ?? scheduleEventTypes.training;
    const isSessionEvent =
      typeof context.isSessionEvent === "function" ? context.isSessionEvent : defaultIsSessionEvent;
    const formatBlockSummary =
      typeof context.formatBlockSummary === "function" ? context.formatBlockSummary : defaultFormatBlockSummary;
    const safeDayContext = dayContext || defaultSelectedDayContext();
    const isLinkedSession = Boolean(safeDayContext.sessionSnapshot?.hasSession && isSessionEvent(event));
    const sessionSummary = isLinkedSession
      ? formatBlockSummary(safeDayContext.sessionSnapshot.blocks.length, safeDayContext.sessionSnapshot.minutes)
      : "";
    const titleBase = String(event.title || eventType.label);
    const eventTitle =
      isLinkedSession && !titleBase.includes(`(${sessionSummary})`) ? `${titleBase} (${sessionSummary})` : titleBase;
    const eventMeta = isLinkedSession
      ? [event.time, safeDayContext.matchDayLabel || safeDayContext.periodizationLabel].filter(Boolean).join(" · ")
      : [event.time, eventType.label].filter(Boolean).join(" · ");
    const eventDetails = [event.note, isLinkedSession ? safeDayContext.phaseSummary : ""].filter(Boolean).join(" · ");
    const controls = isAdmin
      ? `
      <div class="schedule-event-actions">
        <button type="button" data-edit-schedule-event="${escapeHtml(event.id)}" aria-label="Edit ${escapeHtml(event.title)}">Edit</button>
        <button type="button" data-remove-schedule-event="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">×</button>
      </div>
    `
      : "";
    return `
    <article class="schedule-event-card is-${escapeHtml(eventType.tone)}">
      <div>
        <strong>${escapeHtml(eventTitle)}</strong>
        ${eventMeta ? `<span>${escapeHtml(eventMeta)}</span>` : ""}
        ${eventDetails ? `<p>${escapeHtml(eventDetails)}</p>` : ""}
      </div>
      ${controls}
    </article>
  `;
  }

  function renderDayInsights(context, dateValue, selectedEvents = []) {
    const dayContext = context.getSelectedDayContext?.(dateValue) || defaultSelectedDayContext();
    const canCreateSession = Boolean(context.canCreateSession);
    const sessionAction = dayContext.sessionSnapshot.hasSession ? "Open Session" : canCreateSession ? "Create Session" : "Open Sessions";
    return `
    <section class="schedule-day-ops${selectedEvents.length ? " is-compact" : ""}">
      <div class="schedule-day-link-actions">
        <button type="button" data-schedule-open-session-date="${escapeHtml(dateValue)}" data-schedule-create-session="${dayContext.sessionSnapshot.hasSession ? "false" : "true"}">${escapeHtml(sessionAction)}</button>
        <button type="button" data-schedule-open-periodization-date="${escapeHtml(dateValue)}">Open Periodization</button>
      </div>
    </section>
  `;
  }

  function getOverviewLabel(state) {
    if (!state) {
      return "Season Overview";
    }
    const startDate = new Date(state.selectedYear, state.selectedMonthIndex, 1);
    const endDate = new Date(state.selectedYear, state.selectedMonthIndex + state.overviewSpan - 1, 1);
    return `${formatScheduleMonthLabel(startDate)} - ${formatScheduleMonthLabel(endDate)}`;
  }

  function getPlannerLabel(state) {
    if (!state) {
      return "Planner";
    }
    const startDate = new Date(state.selectedYear, state.selectedMonthIndex, 1);
    const endDate = new Date(state.selectedYear, state.selectedMonthIndex + 1, 1);
    return `${formatScheduleMonthLabel(startDate)} - ${formatScheduleMonthLabel(endDate)}`;
  }

  function getWeekLabel(state) {
    const weekDates = getScheduleWeekDates(state?.selectedDate);
    const startDate = weekDates[0];
    const endDate = weekDates[6];
    const weekLabelFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
    return `${weekLabelFormatter.format(startDate)} - ${weekLabelFormatter.format(endDate)}`;
  }

  function renderWorkspace(context) {
    const { ui, state, clipboard, editingEventId, dayPanelMode, canEdit } = context;
    if (!state || !ui?.scheduleWorkspace || !ui.scheduleMonthTitle || !ui.scheduleCalendarGrid || !ui.scheduleSelectedDateLabel || !ui.scheduleEventList) {
      return;
    }

    const selectedMonthDate = new Date(state.selectedYear, state.selectedMonthIndex, 1);
    const selectedMonthLabel = formatScheduleMonthLabel(selectedMonthDate);
    const selectedDateValue = state.selectedDate;
    const isOverview = state.viewMode === "overview";
    const isWeek = state.viewMode === "week";
    const isPlanner = state.viewMode === "planner";
    const isEditingDay = dayPanelMode === "edit" && canEdit;
    const editingEvent = state.events.find((event) => event.id === editingEventId) ?? null;

    ui.scheduleMonthTitle.textContent = isOverview
      ? getOverviewLabel(state)
      : isWeek
        ? getWeekLabel(state)
        : isPlanner
          ? getPlannerLabel(state)
          : selectedMonthLabel;
    ui.scheduleMonthTitle.hidden = false;
    ui.scheduleMonthViewButton?.classList.toggle("is-active", state.viewMode === "month");
    ui.scheduleWeekViewButton?.classList.toggle("is-active", isWeek);
    ui.scheduleOverviewViewButton?.classList.toggle("is-active", isOverview);
    ui.schedulePlannerViewButton?.classList.toggle("is-active", isPlanner);
    ui.scheduleMonthViewButton?.setAttribute("aria-pressed", String(state.viewMode === "month"));
    ui.scheduleWeekViewButton?.setAttribute("aria-pressed", String(isWeek));
    ui.scheduleOverviewViewButton?.setAttribute("aria-pressed", String(isOverview));
    ui.schedulePlannerViewButton?.setAttribute("aria-pressed", String(isPlanner));

    if (ui.scheduleOverviewSpanControl) {
      ui.scheduleOverviewSpanControl.hidden = !isOverview;
    }
    ui.scheduleOverviewSpanButtons?.forEach((button) => {
      const isActiveSpan = Number(button.dataset.scheduleSpan) === state.overviewSpan;
      button.classList.toggle("is-active", isActiveSpan);
      button.setAttribute("aria-pressed", String(isActiveSpan));
      button.tabIndex = isOverview ? 0 : -1;
    });
    if (ui.scheduleWeekdays) {
      ui.scheduleWeekdays.hidden = isOverview || isWeek || isPlanner;
    }
    if (ui.scheduleCalendarGrid) {
      ui.scheduleCalendarGrid.hidden = isOverview || isWeek || isPlanner;
    }
    if (ui.scheduleWeekGrid) {
      ui.scheduleWeekGrid.hidden = !isWeek;
    }
    if (ui.scheduleOverviewGrid) {
      ui.scheduleOverviewGrid.hidden = !isOverview;
      ui.scheduleOverviewGrid.dataset.months = String(state.overviewSpan);
    }
    if (ui.schedulePlannerGrid) {
      ui.schedulePlannerGrid.hidden = !isPlanner;
    }

    if (ui.scheduleEventDate) {
      ui.scheduleEventDate.value = editingEvent?.date ?? selectedDateValue;
    }
    if (ui.scheduleEventTime) {
      ui.scheduleEventTime.value = editingEvent?.time ?? "";
    }
    if (ui.scheduleEventType) {
      ui.scheduleEventType.value = editingEvent?.type ?? "training";
    }
    if (ui.scheduleEventTitle) {
      ui.scheduleEventTitle.value = editingEvent?.title ?? "";
    }
    if (ui.scheduleEventNote) {
      ui.scheduleEventNote.value = editingEvent?.note ?? "";
    }
    if (ui.scheduleEventSubmitButton) {
      ui.scheduleEventSubmitButton.textContent = editingEvent ? "Save Plan" : "Add Plan";
    }
    if (ui.scheduleEventCancelButton) {
      ui.scheduleEventCancelButton.hidden = !editingEvent;
    }
    if (ui.scheduleSelectedDateLabel) {
      ui.scheduleSelectedDateLabel.textContent = getScheduleDateLabel(selectedDateValue);
    }
    if (ui.scheduleDayCard) {
      ui.scheduleDayCard.classList.toggle("is-admin-view", canEdit);
      ui.scheduleDayCard.classList.toggle("is-editing-view", isEditingDay);
      ui.scheduleDayCard.classList.toggle("is-readonly-view", !isEditingDay);
    }
    if (ui.scheduleDayEyebrow) {
      ui.scheduleDayEyebrow.textContent = isEditingDay ? "Edit Day" : "Selected Day";
    }
    if (ui.scheduleEditDayButton) {
      ui.scheduleEditDayButton.hidden = !canEdit;
      ui.scheduleEditDayButton.setAttribute("aria-pressed", String(isEditingDay));
      ui.scheduleEditDayButton.setAttribute("aria-label", isEditingDay ? "Close edit mode" : "Edit selected day");
    }
    if (ui.scheduleAdminActions) {
      ui.scheduleAdminActions.hidden = !isEditingDay;
    }
    if (ui.scheduleEventForm) {
      ui.scheduleEventForm.hidden = !isEditingDay;
      ui.scheduleEventForm.setAttribute("aria-hidden", String(!isEditingDay));
    }
    if (ui.schedulePasteDayButton) {
      ui.schedulePasteDayButton.disabled = !clipboard?.events?.length;
    }
    if (ui.scheduleCopyDayButton) {
      ui.scheduleCopyDayButton.disabled = !context.getEventsForDate(selectedDateValue).length;
    }

    if (isOverview && ui.scheduleOverviewGrid) {
      ui.scheduleOverviewGrid.innerHTML = Array.from({ length: state.overviewSpan }, (_, index) =>
        renderOverviewMonth(context, new Date(state.selectedYear, state.selectedMonthIndex + index, 1))
      ).join("");
    } else if (isPlanner && ui.schedulePlannerGrid) {
      ui.schedulePlannerGrid.innerHTML = Array.from({ length: 2 }, (_, index) =>
        renderPlannerMonth(context, new Date(state.selectedYear, state.selectedMonthIndex + index, 1))
      ).join("");
    } else if (isWeek && ui.scheduleWeekGrid) {
      ui.scheduleWeekGrid.innerHTML = getScheduleWeekDates(state.selectedDate).map((date) => renderWeekDay(context, date)).join("");
    } else {
      const days = getScheduleMonthGridDates(state.selectedYear, state.selectedMonthIndex);
      ui.scheduleCalendarGrid.innerHTML = days.map((date) => renderMonthDay(context, date)).join("");
    }

    const selectedEvents = context.getEventsForDate(selectedDateValue);
    const selectedDayContext = context.getSelectedDayContext?.(selectedDateValue) || defaultSelectedDayContext();
    ui.scheduleEventList.innerHTML = selectedEvents.length
      ? selectedEvents.map((event) => renderEventCard(context, event, isEditingDay, selectedDayContext)).join("")
      : `<p class="schedule-empty-state">No plans on this day yet.</p>`;
    if (ui.scheduleDayInsights) {
      ui.scheduleDayInsights.innerHTML = renderDayInsights(context, selectedDateValue, selectedEvents);
    }
  }

  return Object.freeze({
    getMonthGridDates: getScheduleMonthGridDates,
    getOverviewLabel,
    getPlannerLabel,
    getWeekDates: getScheduleWeekDates,
    getWeekLabel,
    renderDayInsights,
    renderEventCard,
    renderEventPill,
    renderMonthDay,
    renderOverviewLegend,
    renderOverviewMonth,
    renderPlannerDay,
    renderPlannerMonth,
    renderWeekDay,
    renderWorkspace,
  });
}
