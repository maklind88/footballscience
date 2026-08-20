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

export function createScheduleHomeMonthRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const getNow = typeof options.getNow === "function" ? options.getNow : () => new Date();

  function renderDay(date, monthIndex, todayValue, eventsByDate) {
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
        class="dashboard-schedule-day${dateValue === todayValue ? " is-today" : ""}${tone ? ` has-event is-${escapeHtml(tone)}` : ""}"
        data-dashboard-open-schedule-date="${escapeHtml(dateValue)}"
        aria-label="${escapeHtml(accessibleLabel)}"
        title="${escapeHtml(accessibleLabel)}"
      >${date.getDate()}</button>
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
    const year = today.getFullYear();
    const monthIndex = today.getMonth();
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
    const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(today);

    return `
      <article class="dashboard-schedule-month-card">
        <header>
          <div>
            <p>Schedule</p>
            <h2>${escapeHtml(monthLabel)}</h2>
          </div>
        </header>
        <div class="dashboard-schedule-weekdays" aria-hidden="true">
          <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
        </div>
        <div class="dashboard-schedule-days">
          ${getMonthGridDates(year, monthIndex)
            .map((date) => renderDay(date, monthIndex, todayValue, eventsByDate))
            .join("")}
        </div>
        ${renderLegend(monthEvents)}
      </article>
    `;
  }

  return Object.freeze({ render });
}
