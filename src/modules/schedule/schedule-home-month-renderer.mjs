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

function getMonthGridDates(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function getMainEvent(events = []) {
  return [...events].sort((first, second) => {
    const priorityDelta =
      (scheduleMainEventPriority[first.type] ?? 99) - (scheduleMainEventPriority[second.type] ?? 99);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return `${first.time || "99:99"} ${first.title || ""}`.localeCompare(
      `${second.time || "99:99"} ${second.title || ""}`
    );
  })[0];
}

function getMonthAnchor(value, fallbackDate) {
  const parsed = parseScheduleDateValue(value, fallbackDate);
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function shiftMonthValue(value, delta, fallbackDate = new Date()) {
  const anchor = getMonthAnchor(value, fallbackDate);
  return formatScheduleDateValue(new Date(anchor.getFullYear(), anchor.getMonth() + Number(delta || 0), 1));
}

export function createScheduleHomeMonthRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getNow = typeof options.getNow === "function" ? options.getNow : () => new Date();

  function renderDay(date, monthIndex, todayValue, selectedDate, eventsByDate) {
    if (date.getMonth() !== monthIndex) {
      return '<span class="dashboard-schedule-day-spacer" aria-hidden="true"></span>';
    }

    const dateValue = formatScheduleDateValue(date);
    const events = eventsByDate.get(dateValue) || [];
    const mainEvent = getMainEvent(events);
    const tone = scheduleEventTypes[mainEvent?.type]?.tone || "";
    const dateLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
    const eventLabel = mainEvent?.title || scheduleEventTypes[mainEvent?.type]?.label || "";
    const accessibleLabel = eventLabel ? `${dateLabel}. ${eventLabel}` : dateLabel;

    return `
      <button
        type="button"
        class="dashboard-schedule-day${dateValue === todayValue ? " is-today" : ""}${dateValue === selectedDate ? " is-selected" : ""}${tone ? ` has-event is-${escapeHtml(tone)}` : ""}"
        data-dashboard-select-schedule-date="${escapeHtml(dateValue)}"
        aria-label="${escapeHtml(accessibleLabel)}"
        aria-pressed="${dateValue === selectedDate ? "true" : "false"}"
        title="${escapeHtml(accessibleLabel)}"
      >${date.getDate()}</button>
    `;
  }

  function renderSelectedDay(selectedDate, eventsByDate) {
    if (!selectedDate) {
      return "";
    }
    const date = parseScheduleDateValue(selectedDate, getNow());
    const dateLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date);
    const events = [...(eventsByDate.get(selectedDate) || [])].sort((first, second) =>
      `${first.time || "99:99"} ${first.title || ""}`.localeCompare(
        `${second.time || "99:99"} ${second.title || ""}`
      )
    );

    return `
      <section class="dashboard-schedule-day-panel" aria-labelledby="dashboardScheduleDayTitle">
        <header>
          <div>
            <p>Selected day</p>
            <h3 id="dashboardScheduleDayTitle">${escapeHtml(dateLabel)}</h3>
          </div>
          <button type="button" class="dashboard-schedule-panel-close" data-dashboard-close-schedule-day aria-label="Close day details">&times;</button>
        </header>
        <div class="dashboard-schedule-day-events">
          ${events.length
            ? events
                .map((event) => {
                  const eventType = scheduleEventTypes[event.type];
                  const typeLabel = eventType?.label || "Plan";
                  const tone = eventType?.tone || "off";
                  return `
                    <article class="dashboard-schedule-day-event is-${escapeHtml(tone)}">
                      <div class="dashboard-schedule-day-event-meta">
                        <span>${escapeHtml(typeLabel)}</span>
                        ${event.time ? `<time>${escapeHtml(event.time)}</time>` : ""}
                      </div>
                      <h4>${escapeHtml(event.title || typeLabel)}</h4>
                      ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
                    </article>
                  `;
                })
                .join("")
            : '<div class="dashboard-schedule-day-empty"><strong>No plans</strong><span>This day is clear.</span></div>'}
        </div>
        <button type="button" class="dashboard-schedule-open-button" data-dashboard-open-schedule-date="${escapeHtml(selectedDate)}">Open Schedule</button>
      </section>
    `;
  }

  function renderLegend(monthEvents = []) {
    const types = Array.from(new Set(monthEvents.map((event) => event.type)))
      .filter((type) => scheduleEventTypes[type])
      .sort((first, second) => (scheduleMainEventPriority[first] ?? 99) - (scheduleMainEventPriority[second] ?? 99));
    if (!types.length) {
      return "";
    }
    return `
      <div class="dashboard-schedule-legend" aria-label="Calendar colour legend">
        ${types
          .map((type) => {
            const eventType = scheduleEventTypes[type];
            return `<span class="is-${escapeHtml(eventType.tone)}"><i aria-hidden="true"></i>${escapeHtml(eventType.label)}</span>`;
          })
          .join("")}
      </div>
    `;
  }

  function render(context = {}) {
    const today = parseScheduleDateValue(context.todayValue, getNow());
    const todayValue = formatScheduleDateValue(today);
    const displayedMonth = getMonthAnchor(context.monthValue, today);
    const displayedMonthValue = formatScheduleDateValue(displayedMonth);
    const year = displayedMonth.getFullYear();
    const monthIndex = displayedMonth.getMonth();
    const selectedDate = String(context.selectedDate || "").startsWith(
      `${year}-${String(monthIndex + 1).padStart(2, "0")}-`
    )
      ? String(context.selectedDate)
      : "";
    const visibleTypes = new Set(
      Array.isArray(context.state?.visibleEventTypes)
        ? context.state.visibleEventTypes
        : Object.keys(scheduleEventTypes)
    );
    const monthEvents = (Array.isArray(context.state?.events) ? context.state.events : []).filter(
      (event) => event?.date?.startsWith(`${year}-${String(monthIndex + 1).padStart(2, "0")}-`) && visibleTypes.has(event.type)
    );
    const eventsByDate = new Map();
    monthEvents.forEach((event) => {
      const events = eventsByDate.get(event.date) || [];
      events.push(event);
      eventsByDate.set(event.date, events);
    });
    const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(displayedMonth);

    return `
      <article class="dashboard-schedule-month-card">
        <header>
          <div>
            <p>Schedule</p>
            <h2>${escapeHtml(monthLabel)}</h2>
          </div>
          <div class="dashboard-schedule-controls" aria-label="Calendar month navigation">
            <button type="button" data-dashboard-schedule-prev data-dashboard-schedule-month="${escapeHtml(displayedMonthValue)}" aria-label="Previous month">&larr;</button>
            <button type="button" class="dashboard-schedule-today-button" data-dashboard-schedule-today aria-label="Go to today">Today</button>
            <button type="button" data-dashboard-schedule-next data-dashboard-schedule-month="${escapeHtml(displayedMonthValue)}" aria-label="Next month">&rarr;</button>
          </div>
        </header>
        <div class="dashboard-schedule-weekdays" aria-hidden="true">
          <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
        </div>
        <div class="dashboard-schedule-days">
          ${getMonthGridDates(year, monthIndex)
            .map((date) => renderDay(date, monthIndex, todayValue, selectedDate, eventsByDate))
            .join("")}
        </div>
        ${renderLegend(monthEvents)}
        ${renderSelectedDay(selectedDate, eventsByDate)}
      </article>
    `;
  }

  return Object.freeze({ render, shiftMonthValue });
}
