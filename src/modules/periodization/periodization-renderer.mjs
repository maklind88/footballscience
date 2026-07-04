import {
  normalizePeriodizationMultiValue,
  periodizationMiniGamePrinciplesBySubPhase,
  periodizationMonthNames,
  periodizationOptionLibrary,
  periodizationPhaseLibrary,
  periodizationTeamPrinciplesBySubPhase,
} from "./periodization-state.mjs";

function defaultEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function addCalendarDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getFirstWeekMondayForMonth(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  return addCalendarDays(firstDay, -offset);
}

function getLastSundayForMonth(year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0);
  const offset = (7 - lastDay.getDay()) % 7;
  return addCalendarDays(lastDay, offset);
}

function getIsoWeekNumber(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
}

export function createPeriodizationRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const formatDateValue = typeof options.formatDateValue === "function" ? options.formatDateValue : () => "";
  const parseDateValue = typeof options.parseDateValue === "function" ? options.parseDateValue : (dateValue) => new Date(dateValue);
  const getState = typeof options.getState === "function" ? options.getState : () => null;
  const getDay = typeof options.getDay === "function" ? options.getDay : () => ({});
  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const isOffDay = typeof options.isOffDay === "function" ? options.isOffDay : () => false;
  const getScheduleEventsForDate =
    typeof options.getScheduleEventsForDate === "function" ? options.getScheduleEventsForDate : () => [];
  const getSessionPlannerState =
    typeof options.getSessionPlannerState === "function" ? options.getSessionPlannerState : () => null;
  const getMultiSelectOpenField =
    typeof options.getMultiSelectOpenField === "function" ? options.getMultiSelectOpenField : () => "";
  const renderActionIcon = typeof options.renderActionIcon === "function" ? options.renderActionIcon : () => "";

  function getWeeksForMonth(year, monthIndex) {
    const startDate = getFirstWeekMondayForMonth(year, monthIndex);
    const endDate = getLastSundayForMonth(year, monthIndex);
    const weeks = [];
    let cursor = new Date(startDate);
    while (cursor <= endDate) {
      weeks.push(Array.from({ length: 7 }, (_, index) => addCalendarDays(cursor, index)));
      cursor = addCalendarDays(cursor, 7);
    }
    return weeks;
  }

  function getWeekDatesForDate(date) {
    const dayOffset = (date.getDay() + 6) % 7;
    const weekStart = addCalendarDays(date, -dayOffset);
    return Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  }

  function getLoadTone(value) {
    const key = String(value || "").toLowerCase();
    if (key.includes("match")) return "match";
    if (key.includes("hard")) return "hard";
    if (key.includes("moderate")) return "moderate";
    if (key.includes("low")) return "low";
    if (key.includes("off")) return "off";
    return "neutral";
  }

  function getDayScheduleLabel(day) {
    if (isOffDay(day)) {
      return "OFF";
    }
    return day.daySchedule || "";
  }

  function getMatchDayLabel(value) {
    const label = String(value || "").trim();
    return label.toUpperCase() === "N/A" ? "" : label;
  }

  function getScheduledMatchTitle(dateValue) {
    const matchEvent = getScheduleEventsForDate(dateValue).find((event) => event?.type === "match");
    return String(matchEvent?.title || "").trim();
  }

  function getMatchDayDisplayLabel(dateValue, day) {
    const matchTitle = getScheduledMatchTitle(dateValue);
    if (matchTitle) {
      return matchTitle;
    }
    return getMatchDayLabel(day.matchDay);
  }

  function getPitchTone(pitchSize) {
    const key = String(pitchSize || "").toLowerCase();
    if (!key) return "empty";
    if (key.includes("gym") || key.includes("recovery")) return "gym-recovery";
    if (key === "ssg" || key.includes("small")) return "ssg";
    if (key === "msg" || key.includes("9")) return "msg";
    if (key === "bsg" || key.includes("full")) return "bsg";
    if (key === "lsg" || key.includes("large")) return "lsg";
    if (key.includes("half")) return "half-pitch";
    if (key.includes("final")) return "final-third";
    return key.replace(/[^a-z0-9]+/g, "-");
  }

  function getPitchLabel(pitchSize) {
    const tone = getPitchTone(pitchSize);
    if (tone === "bsg") return "BSG";
    if (tone === "msg") return "MSG";
    if (tone === "ssg") return "SSG";
    return pitchSize || "";
  }

  function getDayTone(day) {
    const schedule = String(day.daySchedule || "").toLowerCase();
    if (isOffDay(day)) return "off";
    if (schedule.includes("match")) return "match";
    if (schedule.includes("travel")) return "travel";
    if (schedule.includes("recovery")) return "recovery";
    return getLoadTone(day.physicalLoad);
  }

  function renderOptions(values = [], selectedValue = "", includeBlank = true) {
    const selected = String(selectedValue ?? "");
    const blank = includeBlank ? `<option value=""></option>` : "";
    return `${blank}${values
      .map((option) => {
        const value = String(option);
        return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
      })
      .join("")}`;
  }

  function renderMultiOptions(values = [], selectedValues = []) {
    const selectedSet = new Set(normalizePeriodizationMultiValue(selectedValues));
    return values
      .map((option) => {
        const value = String(option);
        return `<option value="${escapeHtml(value)}"${selectedSet.has(value) ? " selected" : ""}>${escapeHtml(value)}</option>`;
      })
      .join("");
  }

  function renderStaticDatalist(id, values = []) {
    if (!id || !values?.length) {
      return "";
    }
    return `
    <datalist id="${escapeHtml(id)}">
      ${values.map((option) => `<option value="${escapeHtml(String(option))}"></option>`).join("")}
    </datalist>
  `;
  }

  function getCustomValues(values = [], staticOptions = []) {
    const optionSet = new Set(staticOptions.map((option) => String(option)));
    return normalizePeriodizationMultiValue(values).filter((value) => value && !optionSet.has(value));
  }

  function parseCustomValues(value = "") {
    return String(value ?? "")
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getPrincipleSourceKeys(subPhases = []) {
    const keys = new Set(normalizePeriodizationMultiValue(subPhases));
    if (keys.has("High Press") || keys.has("High Press vs GK")) {
      keys.add("High Press vs GK & High Press");
    }
    if (keys.has("Throw Ins (Off)") || keys.has("Throw Ins (Def)")) {
      keys.add("Throw Ins (Off & Def)");
    }
    return [...keys];
  }

  function getSubPhaseOptions(day) {
    const phases = normalizePeriodizationMultiValue(day.matchPhases);
    if (!phases.length) {
      return periodizationOptionLibrary.subPhases;
    }
    return [...new Set(phases.flatMap((phase) => periodizationPhaseLibrary[phase] ?? []))];
  }

  function getPrincipleOptions(day, source) {
    const keys = getPrincipleSourceKeys(day.subPhases);
    if (!keys.length) {
      return Object.values(source).flat();
    }
    const values = keys.flatMap((key) => source[key] ?? []);
    return values.length ? [...new Set(values)] : Object.values(source).flat();
  }

  function getMultiFieldOptions(key, dateValue) {
    const day = getDay(dateValue);
    if (key === "matchPhases") {
      return periodizationOptionLibrary.matchPhases;
    }
    if (key === "subPhases") {
      return getSubPhaseOptions(day);
    }
    if (key === "teamPrinciples") {
      return getPrincipleOptions(day, periodizationTeamPrinciplesBySubPhase);
    }
    if (key === "miniGamePrinciples") {
      return getPrincipleOptions(day, periodizationMiniGamePrinciplesBySubPhase);
    }
    return [];
  }

  function getMultiFieldValue(field, dateValue) {
    const key = field.dataset.periodizationField;
    const fieldContainer = field.closest(".periodization-field");
    const checkboxOptions = Array.from(
      fieldContainer?.querySelectorAll(`[data-periodization-multi-option="${key}"]`) ?? []
    );
    const staticOptions = checkboxOptions.length
      ? checkboxOptions.map((option) => option.value).filter(Boolean)
      : getMultiFieldOptions(key, dateValue);
    const staticOptionSet = new Set(staticOptions);
    const currentValues = normalizePeriodizationMultiValue(getDay(dateValue)?.[key]);
    const selectedStaticValues = checkboxOptions.length
      ? checkboxOptions.filter((option) => option.checked).map((option) => option.value)
      : currentValues.filter((value) => staticOptionSet.has(value));
    const customInput = fieldContainer?.querySelector("[data-periodization-custom-field]");
    const customValues = customInput
      ? parseCustomValues(customInput.value)
      : currentValues.filter((value) => !staticOptionSet.has(value));
    return [...new Set([...selectedStaticValues, ...customValues.filter((value) => !staticOptionSet.has(value))])];
  }

  function getCustomFieldValue(field, dateValue) {
    const key = field.dataset.periodizationCustomField;
    const fieldContainer = field.closest(".periodization-field");
    const checkboxOptions = Array.from(
      fieldContainer?.querySelectorAll(`[data-periodization-multi-option="${key}"]`) ?? []
    );
    const select = fieldContainer?.querySelector("select[data-periodization-field][multiple]");
    const staticOptions = checkboxOptions.length
      ? checkboxOptions.map((option) => option.value).filter(Boolean)
      : select
        ? Array.from(select.options)
            .map((option) => option.value)
            .filter(Boolean)
        : getMultiFieldOptions(key, dateValue);
    const staticOptionSet = new Set(staticOptions);
    const selectedStaticValues = checkboxOptions.length
      ? checkboxOptions.filter((option) => option.checked).map((option) => option.value)
      : select
        ? Array.from(select.selectedOptions).map((option) => option.value)
        : normalizePeriodizationMultiValue(getDay(dateValue)?.[key]).filter((value) => staticOptionSet.has(value));
    const customValues = parseCustomValues(field.value).filter((value) => !staticOptionSet.has(value));
    return [...new Set([...selectedStaticValues, ...customValues])];
  }

  function renderSelectField(label, key, value, values, className = "") {
    const listId = `periodization-${key}-options`;
    return `
    <label class="periodization-field ${className}">
      <span>${escapeHtml(label)}</span>
      <input
        data-periodization-field="${escapeHtml(key)}"
        value="${escapeHtml(value ?? "")}"
        list="${escapeHtml(listId)}"
      />
      ${renderStaticDatalist(listId, values)}
    </label>
  `;
  }

  function renderMultiField(label, key, value, values, className = "") {
    const customValues = getCustomValues(value, values);
    const selectedValues = normalizePeriodizationMultiValue(value);
    const selectedSet = new Set(selectedValues);
    const isOpen = getMultiSelectOpenField() === key;
    return `
    <section
      class="periodization-field periodization-field-multi ${className}"
      data-periodization-multi-field="${escapeHtml(key)}"
    >
      <span>${escapeHtml(label)}</span>
      <button
        type="button"
        class="periodization-multi-trigger${selectedValues.length ? " has-value" : ""}"
        data-periodization-multi-toggle="${escapeHtml(key)}"
        aria-expanded="${isOpen ? "true" : "false"}"
      >
        <span class="periodization-multi-value-list">
          ${
            selectedValues.length
              ? selectedValues.map((item) => `<i>${escapeHtml(item)}</i>`).join("")
              : `<em>Select ${escapeHtml(label)}</em>`
          }
        </span>
        <span class="periodization-multi-caret">⌄</span>
      </button>
      ${
        isOpen
          ? `
<div class="periodization-choice-menu" role="group" aria-label="${escapeHtml(label)}">
${values
  .map((option) => {
    const optionValue = String(option);
    return `
                    <label class="periodization-choice-option">
                      <input
                        type="checkbox"
                        data-periodization-field="${escapeHtml(key)}"
                        data-periodization-multi-option="${escapeHtml(key)}"
                        value="${escapeHtml(optionValue)}"
                        ${selectedSet.has(optionValue) ? "checked" : ""}
                      />
                      <span>${escapeHtml(optionValue)}</span>
                    </label>
                  `;
  })
  .join("")}
</div>
`
          : ""
      }
      <input
        class="periodization-custom-list-input"
        data-periodization-custom-field="${escapeHtml(key)}"
        value="${escapeHtml(customValues.join(", "))}"
        placeholder="Own text"
      />
    </section>
  `;
  }

  function renderTextField(label, key, value, optionsId = "", className = "") {
    return `
    <label class="periodization-field ${className}">
      <span>${escapeHtml(label)}</span>
      <input
        data-periodization-field="${escapeHtml(key)}"
        value="${escapeHtml(value ?? "")}"
        ${optionsId ? `list="${escapeHtml(optionsId)}"` : ""}
      />
    </label>
  `;
  }

  function renderTextAreaField(label, key, value, className = "") {
    return `
    <label class="periodization-field periodization-field-textarea ${className}">
      <span>${escapeHtml(label)}</span>
      <textarea data-periodization-field="${escapeHtml(key)}" rows="4">${escapeHtml(value ?? "")}</textarea>
    </label>
  `;
  }

  function renderChip(value, tone = "neutral") {
    if (!value) {
      return "";
    }
    return `<span class="periodization-chip is-${escapeHtml(tone)}">${escapeHtml(value)}</span>`;
  }

  function getLoadMeterModel(value) {
    const label = String(value || "").trim();
    if (!label) {
      return null;
    }
    const key = label.toLowerCase();
    if (key.includes("off")) {
      return null;
    }
    if (key.includes("hard") || key.includes("medium-high") || key.includes("medium high")) {
      return { label, level: 4, color: "#f57c2b", angle: 34 };
    }
    if (key.includes("match") || key.includes("high")) {
      return { label, level: 5, color: "#d92d3f", angle: 68 };
    }
    if (key.includes("moderate") || key === "medium") {
      return { label, level: 3, color: "#d9a514", angle: 0 };
    }
    if (key.includes("low")) {
      return { label, level: 2, color: "#1f9d61", angle: -34 };
    }
    if (key.includes("recovery") || key.includes("light")) {
      return { label, level: 1, color: "#74c69d", angle: -68 };
    }
    return { label, level: 3, color: "#d9a514", angle: 0 };
  }

  function renderLoadMeter(value, className = "") {
    const model = getLoadMeterModel(value);
    if (!model) {
      return "";
    }
    return `
    <span
      class="periodization-load-meter is-level-${model.level} ${className}"
      style="--load-angle: ${model.angle}deg; --load-color: ${model.color};"
      aria-label="Physical load: ${escapeHtml(model.label)}"
    >
      <span class="periodization-load-gauge" aria-hidden="true">
        <span class="periodization-load-needle"></span>
        <span class="periodization-load-pin"></span>
      </span>
      <span class="periodization-load-label">${escapeHtml(model.label)}</span>
    </span>
  `;
  }

  function formatCardList(values, fallback = "") {
    const list = normalizePeriodizationMultiValue(values).filter(Boolean);
    if (!list.length) {
      return fallback;
    }
    const visible = list.slice(0, 2).join(", ");
    return list.length > 2 ? `${visible} +${list.length - 2}` : visible;
  }

  function renderCardDetail(label, value, className = "") {
    const cleanValue = typeof value === "string" ? value.trim() : value;
    const emptyClass = cleanValue ? "" : " is-empty";
    return `
    <span class="periodization-day-detail ${className}${emptyClass}">
      ${cleanValue ? `<small>${escapeHtml(label)}</small><strong>${cleanValue}</strong>` : ""}
    </span>
  `;
  }

  function renderPitchIcon(pitchSize) {
    const tone = getPitchTone(pitchSize);
    return `
    <span class="periodization-pitch-icon is-${escapeHtml(tone)}" aria-hidden="true">
      <span class="periodization-pitch-lines"></span>
      <span class="periodization-pitch-highlight"></span>
    </span>
  `;
  }

  function getLoadScore(value) {
    const key = String(value || "").toLowerCase();
    if (!key || key.includes("off")) return 0;
    if (key.includes("hard") || key.includes("medium-high") || key.includes("medium high")) return 4;
    if (key.includes("match") || key.includes("high")) return 5;
    if (key.includes("moderate") || key === "medium") return 3;
    if (key.includes("low")) return 2;
    if (key.includes("recovery") || key.includes("light")) return 1;
    return 3;
  }

  function getLoadScoreLabel(score) {
    if (score >= 5) return "Peak";
    if (score >= 4) return "High";
    if (score >= 3) return "Mod";
    if (score >= 2) return "Low";
    if (score >= 1) return "Rec";
    return "Off";
  }

  function getMostCommonValues(values = [], limit = 2) {
    const counts = new Map();
    values
      .flatMap((value) => normalizePeriodizationMultiValue(value))
      .filter(Boolean)
      .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([value]) => value);
  }

  function getMicrocycleModel(weekDates = []) {
    const days = weekDates.map((date) => {
      const dateValue = formatDateValue(date);
      const day = getDay(dateValue);
      const loadScore = getLoadScore(day.physicalLoad);
      const matchDayLabel = getMatchDayLabel(day.matchDay);
      return {
        date,
        dateValue,
        day,
        loadScore,
        matchDayLabel,
        isMatchDay:
          matchDayLabel === "MD" ||
          String(day.daySchedule || "").toLowerCase().includes("match") ||
          String(day.sessionType || "").toLowerCase().includes("match"),
        isOffDay: isOffDay(day),
      };
    });
    const activeDays = days.filter((item) => !item.isOffDay);
    const totalLoad = days.reduce((sum, item) => sum + item.loadScore, 0);
    const peakLoad = days.reduce((peak, item) => Math.max(peak, item.loadScore), 0);
    const highLoadCount = days.filter((item) => item.loadScore >= 4).length;
    const matchDays = days.filter((item) => item.isMatchDay);
    const focusValues = getMostCommonValues(days.map((item) => item.day.matchPhases), 2);
    const subFocusValues = getMostCommonValues(days.map((item) => item.day.subPhases), 2);
    const pitchValues = [...new Set(days.map((item) => getPitchLabel(item.day.pitchSize)).filter(Boolean))];
    const rangeLabel = days.length
      ? `${days[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${days[
          days.length - 1
        ].date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "";
    return {
      days,
      activeDays,
      totalLoad,
      averageLoad: activeDays.length ? totalLoad / activeDays.length : 0,
      peakLoad,
      highLoadCount,
      matchDays,
      focusLabel: focusValues.length ? focusValues.join(" / ") : "",
      subFocusLabel: subFocusValues.length ? subFocusValues.join(" / ") : "",
      pitchLabel: pitchValues.slice(0, 3).join(" / "),
      rangeLabel,
    };
  }

  function renderMicrocycleMetric(label, value, tone = "") {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) {
      return "";
    }
    return `
    <span class="periodization-microcycle-metric${tone ? ` is-${escapeHtml(tone)}` : ""}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(cleanValue)}</strong>
    </span>
  `;
  }

  function renderMicrocycleLoadRail(model) {
    return `
    <div class="periodization-microcycle-load-rail" aria-label="Microcycle load rhythm">
      ${model.days
        .map((item) => {
          const score = item.loadScore;
          const height = score ? 16 + score * 14 : 8;
          const label = getLoadScoreLabel(score);
          return `
<span
class="periodization-microcycle-load-day is-score-${score}${item.isMatchDay ? " is-match" : ""}${
            item.isOffDay ? " is-off" : ""
          }"
style="--periodization-load-height: ${height}%;"
title="${escapeHtml(`${item.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}: ${label}`)}"
>
<i aria-hidden="true"></i>
<small>${escapeHtml(item.date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2))}</small>
</span>
`;
        })
        .join("")}
    </div>
  `;
  }

  function renderDayCard(date, monthIndex) {
    const dateValue = formatDateValue(date);
    const day = getDay(dateValue);
    const state = getState();
    const isSelected = state?.selectedDate === dateValue;
    const isOutsideMonth = date.getMonth() !== monthIndex;
    const dayTone = getDayTone(day);
    const loadTone = getLoadTone(day.physicalLoad);
    const offDay = isOffDay(day);
    const dayScheduleLabel = getDayScheduleLabel(day);
    const matchDayLabel = getMatchDayDisplayLabel(dateValue, day);
    const loadLabel = offDay && loadTone === "off" ? "" : day.physicalLoad;
    const pitchLabel = getPitchLabel(day.pitchSize);
    const preTrainingVideoLabel = day.preTrainingVideo || "";
    const phaseParts = [formatCardList(day.matchPhases), formatCardList(day.subPhases)].filter(Boolean);
    const phaseLabel = phaseParts.join(" · ");
    const pitchValue = pitchLabel ? `${renderPitchIcon(day.pitchSize)}${escapeHtml(pitchLabel)}` : "";
    return `
    <article
      class="periodization-day-card is-${escapeHtml(dayTone)}${isSelected ? " is-selected" : ""}${
        isOutsideMonth ? " is-outside-month" : ""
      }"
      ${matchDayLabel ? `style="grid-template-rows:auto minmax(2.35rem,auto) auto 1fr"` : ""}
      data-periodization-date="${escapeHtml(dateValue)}"
      role="button"
      tabindex="0"
    >
      ${
        canEdit()
          ? `
<button
type="button"
class="periodization-day-edit"
data-periodization-edit-date="${escapeHtml(dateValue)}"
aria-label="Edit ${escapeHtml(date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}"
>
${renderActionIcon("pencil")}
</button>
`
          : ""
      }
      <span class="periodization-day-topline">
        <strong>${escapeHtml(date.toLocaleDateString("en-US", { weekday: "short" }))}</strong>
        <span>${date.getDate()}</span>
      </span>
      <span class="periodization-day-main${dayScheduleLabel ? "" : " is-empty"}">
        ${escapeHtml(dayScheduleLabel)}
      </span>
      ${matchDayLabel ? `<span><i class="periodization-day-md">${escapeHtml(matchDayLabel)}</i></span>` : ""}
      <span class="periodization-day-details">
        ${renderCardDetail("Video", escapeHtml(preTrainingVideoLabel))}
        ${renderCardDetail("Phase", escapeHtml(phaseLabel))}
        ${renderCardDetail("Load", renderLoadMeter(loadLabel), "is-load")}
        ${renderCardDetail("Pitch", pitchValue, "is-pitch")}
      </span>
    </article>
  `;
  }

  function renderSessionSummary(dateValue) {
    const date = parseDateValue(dateValue);
    const day = getDay(dateValue);
    const dayTone = getDayTone(day);
    const offDay = isOffDay(day);
    const loadTone = getLoadTone(day.physicalLoad);
    const loadLabel = offDay && loadTone === "off" ? "" : day.physicalLoad;
    const pitchLabel = getPitchLabel(day.pitchSize);
    const preTrainingVideoLabel = day.preTrainingVideo || "";
    const phaseParts = [formatCardList(day.matchPhases), formatCardList(day.subPhases)].filter(Boolean);
    const phaseLabel = phaseParts.join(" · ");
    const pitchValue = pitchLabel ? `${renderPitchIcon(day.pitchSize)}${escapeHtml(pitchLabel)}` : "";
    return `
    <button
      type="button"
      class="session-periodization-card periodization-day-card is-${escapeHtml(dayTone)}"
      data-session-periodization-date="${escapeHtml(dateValue)}"
      aria-label="Open periodization for ${escapeHtml(date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}"
    >
      <span class="periodization-day-details">
        ${renderCardDetail("Video", escapeHtml(preTrainingVideoLabel))}
        ${renderCardDetail("Phase", escapeHtml(phaseLabel))}
        ${renderCardDetail("Load", renderLoadMeter(loadLabel), "is-load")}
        ${renderCardDetail("Pitch", pitchValue, "is-pitch")}
      </span>
    </button>
  `;
  }

  function renderMultiFieldForDate(key, dateValue) {
    const day = getDay(dateValue);
    const fieldConfigs = {
      matchPhases: {
        label: "Match Phase(s)",
        value: day.matchPhases,
        values: getMultiFieldOptions("matchPhases", dateValue),
        className: "",
      },
      subPhases: {
        label: "Sub Phase(s)",
        value: day.subPhases,
        values: getMultiFieldOptions("subPhases", dateValue),
        className: "",
      },
      teamPrinciples: {
        label: "Team Principles",
        value: day.teamPrinciples,
        values: getMultiFieldOptions("teamPrinciples", dateValue),
        className: "periodization-field-wide",
      },
      miniGamePrinciples: {
        label: "Mini-Game Principles",
        value: day.miniGamePrinciples,
        values: getMultiFieldOptions("miniGamePrinciples", dateValue),
        className: "periodization-field-wide",
      },
    };
    const config = fieldConfigs[key];
    return config ? renderMultiField(config.label, key, config.value, config.values, config.className) : "";
  }

  function renderWeek(weekDates, monthIndex) {
    const weekNumber = getIsoWeekNumber(weekDates[0]);
    const model = getMicrocycleModel(weekDates);
    return `
    <section class="periodization-microcycle-card" data-periodization-week-start="${escapeHtml(formatDateValue(weekDates[0]))}">
      <header class="periodization-microcycle-head">
        <div>
          <span>Microcycle</span>
          <strong>Week ${weekNumber}</strong>
        </div>
        <p>${escapeHtml(model.rangeLabel)}</p>
        ${renderMicrocycleLoadRail(model)}
      </header>
      <div class="periodization-week-grid">
        ${weekDates.map((date) => renderDayCard(date, monthIndex)).join("")}
      </div>
    </section>
  `;
  }

  function renderDatalists(day) {
    const teamPrinciples = getPrincipleOptions(day, periodizationTeamPrinciplesBySubPhase);
    return `
    <datalist id="periodizationMainFocusOptions">
      ${teamPrinciples.map((option) => `<option value="${escapeHtml(option)}"></option>`).join("")}
    </datalist>
    <datalist id="periodizationBlockOptions">
      ${periodizationOptionLibrary.block.map((option) => `<option value="${escapeHtml(option)}"></option>`).join("")}
    </datalist>
  `;
  }

  function renderViewValue(value, fallback = "Not set") {
    if (Array.isArray(value)) {
      return value.length ? value.map(escapeHtml).join(", ") : fallback;
    }
    const text = String(value ?? "").trim();
    return text ? escapeHtml(text) : fallback;
  }

  function renderViewItem(label, value, className = "") {
    return `
    <div class="periodization-view-item ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
  }

  function hasViewValue(value) {
    if (Array.isArray(value)) {
      return value.some((item) => String(item ?? "").trim());
    }
    return Boolean(String(value ?? "").trim());
  }

  function renderViewItemIfSet(label, value, className = "") {
    return hasViewValue(value) ? renderViewItem(label, renderViewValue(value), className) : "";
  }

  function renderViewTextWithBreaks(value) {
    return escapeHtml(String(value ?? "").trim()).replaceAll("\n", "<br>");
  }

  function isUnsetTrainingBlockValue(value) {
    const text = String(value ?? "").trim().toLowerCase();
    return !text || text === "not set";
  }

  function isPlannedExerciseTitle(value) {
    const text = String(value ?? "").trim().toLowerCase();
    return Boolean(text && text !== "new exercise" && text !== "empty block");
  }

  function getSessionPlannerBlockForPeriodizationLabel(dateValue, label) {
    const blocks = getSessionPlannerState()?.sessions?.[dateValue]?.blocks;
    if (!Array.isArray(blocks) || !blocks.length) {
      return null;
    }
    const normalizedLabel = String(label || "").trim().toLowerCase();
    if (normalizedLabel === "warm up") {
      return blocks.find((block) => String(block?.label || "").trim().toLowerCase() === "warm up") || blocks[0] || null;
    }
    const blockMatch = normalizedLabel.match(/^block\s+(\d+)$/);
    if (!blockMatch) {
      return null;
    }
    const blockNumber = Number(blockMatch[1]);
    const exactLabel = `block ${blockNumber}`;
    const labeledBlock = blocks.find((block) => String(block?.label || "").trim().toLowerCase() === exactLabel);
    if (labeledBlock) {
      return labeledBlock;
    }
    const exerciseBlocks = blocks.filter((block) => /^block\s+\d+$/i.test(String(block?.label || "").trim()));
    const plannedBlocks = blocks.filter((block) => String(block?.label || "").trim().toLowerCase() !== "warm up");
    return exerciseBlocks[blockNumber - 1] || plannedBlocks[blockNumber - 1] || blocks[blockNumber] || null;
  }

  function getTrainingBlockViewValue(dateValue, label, periodizationValue) {
    if (!isUnsetTrainingBlockValue(periodizationValue)) {
      return periodizationValue;
    }
    const sessionPlannerTitle = getSessionPlannerBlockForPeriodizationLabel(dateValue, label)?.title;
    return isPlannedExerciseTitle(sessionPlannerTitle) ? String(sessionPlannerTitle).trim() : "";
  }

  function getSessionPlannerReflectionLabel(block = {}) {
    const label = String(block.label || "").trim();
    const title = String(block.title || "").trim();
    if (label && title && isPlannedExerciseTitle(title)) {
      return `${label} - ${title}`;
    }
    return label || (isPlannedExerciseTitle(title) ? title : "Session block");
  }

  function renderSessionPlannerReflectionItems(dateValue) {
    const blocks = getSessionPlannerState()?.sessions?.[dateValue]?.blocks;
    if (!Array.isArray(blocks) || !blocks.length) {
      return [];
    }
    return blocks
      .map((block) => ({
        label: getSessionPlannerReflectionLabel(block),
        note: String(block?.postSessionNotes || "").trim(),
      }))
      .filter((item) => item.note)
      .map((item) => renderViewItem(item.label, renderViewTextWithBreaks(item.note), "periodization-session-note-item"));
  }

  function renderViewSection(title, items) {
    const renderedItems = items.filter(Boolean);
    if (!renderedItems.length) {
      return "";
    }
    return `
    <section class="periodization-view-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="periodization-view-list">
        ${renderedItems.join("")}
      </div>
    </section>
  `;
  }

  function renderDayViewPanel(dateValue, { isOverlay = false } = {}) {
    const date = parseDateValue(dateValue);
    const day = getDay(dateValue);
    const matchDayLabel = getMatchDayDisplayLabel(dateValue, day) || "Not match day";
    const pitchLabel = getPitchLabel(day.pitchSize);
    const microcycleModel = getMicrocycleModel(getWeekDatesForDate(date));
    const trainingBlocks = [
      ["Warm Up", day.warmUp],
      ["Block 1", day.block1],
      ["Block 2", day.block2],
      ["Block 3", day.block3],
      ["Block 4", day.block4],
    ];
    return `
    <aside class="periodization-day-panel periodization-day-view-panel${isOverlay ? " is-overlay" : ""}" aria-label="Selected training day">
      <header class="periodization-day-panel-head">
        <div>
          <span>Training Day</span>
          <h2>${escapeHtml(date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</h2>
        </div>
        <div class="periodization-overlay-actions">
          ${canEdit() ? `<button type="button" class="periodization-overlay-action" data-periodization-edit-selected aria-label="Edit training day">Edit</button>` : ""}
          ${isOverlay ? `<button type="button" class="periodization-overlay-close" data-periodization-close aria-label="Close training day">&times;</button>` : ""}
        </div>
      </header>
      <div class="periodization-day-view-hero">
        <div>
          <span>Day schedule</span>
          <strong>${escapeHtml(getDayScheduleLabel(day))}</strong>
        </div>
        <div class="periodization-view-load">
          <span>Physical load</span>
          ${renderLoadMeter(day.physicalLoad, "is-large")}
        </div>
        <div class="periodization-view-pitch">
          <span>Pitch size</span>
          <strong>${pitchLabel ? `${renderPitchIcon(day.pitchSize)}${escapeHtml(pitchLabel)}` : "Not set"}</strong>
        </div>
        <div class="periodization-view-microcycle">
          <span>Microcycle</span>
          <strong>${escapeHtml(microcycleModel.rangeLabel)}</strong>
          ${renderMicrocycleLoadRail(microcycleModel)}
        </div>
      </div>
      <div class="periodization-day-view-grid">
        ${renderViewSection("Day Setup", [
          renderViewItem("Season Phase", renderViewValue(day.seasonPhase)),
          renderViewItem("Session Type", renderViewValue(day.sessionType)),
          renderViewItem("Match Day", escapeHtml(matchDayLabel)),
        ])}
        ${renderViewSection("Preparation", [
          renderViewItem("Pre-Training Video", renderViewValue(day.preTrainingVideo)),
          renderViewItem("Psychological Focus", renderViewValue(day.psychologicalFocus)),
          renderViewItem("Video Notes", renderViewValue(day.preTrainingNotes)),
          renderViewItem("Psychological Notes", renderViewValue(day.psychologicalNotes)),
        ])}
        ${renderViewSection("Tactical Focus", [
          renderViewItem("Match Phase(s)", renderViewValue(normalizePeriodizationMultiValue(day.matchPhases))),
          renderViewItem("Sub Phase(s)", renderViewValue(normalizePeriodizationMultiValue(day.subPhases))),
          renderViewItem("GK Focus", renderViewValue(day.gkFocus)),
          renderViewItem("Team Principles", renderViewValue(normalizePeriodizationMultiValue(day.teamPrinciples))),
          renderViewItem("Mini-Game Principles", renderViewValue(normalizePeriodizationMultiValue(day.miniGamePrinciples))),
        ])}
        ${renderViewSection("Training Blocks", [
          ...trainingBlocks.map(([label, value]) =>
            renderViewItemIfSet(label, getTrainingBlockViewValue(dateValue, label, value))
          ),
          renderViewItemIfSet("Session Notes", day.sessionNotes),
        ])}
        ${renderViewSection("Session Notes", renderSessionPlannerReflectionItems(dateValue))}
      </div>
    </aside>
  `;
  }

  function renderDayPanel(dateValue, { isOverlay = false, mode = "edit" } = {}) {
    if (mode === "view" || !canEdit()) {
      return renderDayViewPanel(dateValue, { isOverlay });
    }
    const date = parseDateValue(dateValue);
    const day = getDay(dateValue);
    const microcycleModel = getMicrocycleModel(getWeekDatesForDate(date));
    const subPhaseOptions = getSubPhaseOptions(day);
    const teamPrincipleOptions = getPrincipleOptions(day, periodizationTeamPrinciplesBySubPhase);
    const miniGamePrincipleOptions = getPrincipleOptions(day, periodizationMiniGamePrinciplesBySubPhase);
    return `
    <aside class="periodization-day-panel${isOverlay ? " is-overlay" : ""}" aria-label="Selected training day">
      ${renderDatalists(day)}
      <header class="periodization-day-panel-head">
        <div>
          <span>Training Day</span>
          <h2>${escapeHtml(date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</h2>
        </div>
        <div class="periodization-overlay-actions">
          <button type="button" class="periodization-overlay-action" data-periodization-view-selected aria-label="View training day">View</button>
          ${isOverlay ? `<button type="button" class="periodization-overlay-close" data-periodization-close aria-label="Close training day">&times;</button>` : ""}
        </div>
      </header>
      <div class="periodization-edit-context">
        ${renderMicrocycleMetric("Week", microcycleModel.rangeLabel)}
        ${renderMicrocycleMetric("Load", microcycleModel.activeDays.length ? `${microcycleModel.totalLoad} load` : "Recovery")}
        ${renderMicrocycleMetric("Peak", microcycleModel.peakLoad ? getLoadScoreLabel(microcycleModel.peakLoad) : "")}
        ${renderMicrocycleMetric("Focus", microcycleModel.focusLabel || microcycleModel.subFocusLabel)}
        ${renderMicrocycleLoadRail(microcycleModel)}
      </div>
      <div class="periodization-form-grid">
        <section class="periodization-form-section">
          <h3>Day Setup</h3>
          <div class="periodization-field-grid">
            ${renderSelectField("Season Phase", "seasonPhase", day.seasonPhase, periodizationOptionLibrary.seasonPhase)}
            ${renderSelectField("Day Schedule", "daySchedule", day.daySchedule, periodizationOptionLibrary.daySchedule)}
            ${renderSelectField("Match Day", "matchDay", day.matchDay, periodizationOptionLibrary.matchDay)}
            ${renderSelectField("Session Type", "sessionType", day.sessionType, periodizationOptionLibrary.sessionType)}
            ${renderSelectField("Physical Load", "physicalLoad", day.physicalLoad, periodizationOptionLibrary.physicalLoad, `is-load-${getLoadTone(day.physicalLoad)}`)}
            ${renderSelectField("Pitch Size", "pitchSize", day.pitchSize, periodizationOptionLibrary.pitchSize)}
          </div>
        </section>
        <section class="periodization-form-section">
          <h3>Preparation</h3>
          <div class="periodization-field-grid">
            ${renderSelectField("Pre-Training Video", "preTrainingVideo", day.preTrainingVideo, periodizationOptionLibrary.preTrainingVideo)}
            ${renderTextField("Psychological Focus", "psychologicalFocus", day.psychologicalFocus, "", "")}
            ${renderTextAreaField("Video Notes", "preTrainingNotes", day.preTrainingNotes)}
            ${renderTextAreaField("Psychological Notes", "psychologicalNotes", day.psychologicalNotes)}
          </div>
        </section>
        <section class="periodization-form-section">
          <h3>Tactical Focus</h3>
          <div class="periodization-field-grid">
            ${renderMultiField("Match Phase(s)", "matchPhases", day.matchPhases, periodizationOptionLibrary.matchPhases)}
            ${renderMultiField("Sub Phase(s)", "subPhases", day.subPhases, subPhaseOptions)}
            ${renderTextField("GK Focus", "gkFocus", day.gkFocus, "", "")}
            ${renderMultiField("Team Principles", "teamPrinciples", day.teamPrinciples, teamPrincipleOptions, "periodization-field-wide")}
            ${renderMultiField("Mini-Game Principles", "miniGamePrinciples", day.miniGamePrinciples, miniGamePrincipleOptions, "periodization-field-wide")}
          </div>
        </section>
        <section class="periodization-form-section">
          <h3>Training Blocks</h3>
          <div class="periodization-field-grid periodization-block-grid">
            ${renderTextField("Warm Up", "warmUp", day.warmUp, "periodizationBlockOptions")}
            ${renderTextField("Block 1", "block1", day.block1, "periodizationBlockOptions")}
            ${renderTextField("Block 2", "block2", day.block2, "periodizationBlockOptions")}
            ${renderTextField("Block 3", "block3", day.block3, "periodizationBlockOptions")}
            ${renderTextField("Block 4", "block4", day.block4, "periodizationBlockOptions")}
            ${renderTextAreaField("Session Notes", "sessionNotes", day.sessionNotes, "periodization-field-wide")}
          </div>
        </section>
        <section class="periodization-form-section">
          <h3>Links</h3>
          <div class="periodization-field-grid">
            ${renderTextField("Session Plan Link", "sessionPlanLink", day.sessionPlanLink)}
            ${renderTextField("Session Video Link", "sessionVideoLink", day.sessionVideoLink)}
            ${renderTextField("Session GPS Report Link", "sessionGpsReportLink", day.sessionGpsReportLink)}
          </div>
        </section>
      </div>
    </aside>
  `;
  }

  function renderDayOverlay(dateValue, mode) {
    return `
    <div class="periodization-day-overlay" data-periodization-overlay>
      ${renderDayPanel(dateValue, { isOverlay: true, mode })}
    </div>
  `;
  }

  function renderWorkspace(state, options = {}) {
    const selectedMonthName = periodizationMonthNames[state.selectedMonthIndex];
    const selectedYear = state.selectedYear;
    const weeks = getWeeksForMonth(selectedYear, state.selectedMonthIndex);
    return {
      selectedMonthName,
      selectedYear,
      selectedMonthIndex: state.selectedMonthIndex,
      prevDisabled: state.selectedMonthIndex === 0,
      nextDisabled: state.selectedMonthIndex === 11,
      bodyHtml: `
    <div class="periodization-board-grid">
      <main class="periodization-week-stack">
        ${weeks.map((week) => renderWeek(week, state.selectedMonthIndex)).join("")}
      </main>
    </div>
    ${options.overlayOpen ? renderDayOverlay(state.selectedDate, options.overlayMode) : ""}
  `,
    };
  }

  return Object.freeze({
    formatCardList,
    getCustomFieldValue,
    getDayScheduleLabel,
    getDayTone,
    getLoadMeterModel,
    getLoadScore,
    getLoadScoreLabel,
    getLoadTone,
    getMatchDayLabel,
    getMatchDayDisplayLabel,
    getScheduledMatchTitle,
    getMicrocycleModel,
    getMultiFieldOptions,
    getMultiFieldValue,
    getPitchLabel,
    getPitchTone,
    getPrincipleOptions,
    getSubPhaseOptions,
    getWeekDatesForDate,
    getWeeksForMonth,
    parseCustomValues,
    renderCardDetail,
    renderChip,
    renderDayCard,
    renderDayOverlay,
    renderDayPanel,
    renderDayViewPanel,
    renderLoadMeter,
    renderMicrocycleLoadRail,
    renderMultiField,
    renderMultiFieldForDate,
    renderMultiOptions,
    renderOptions,
    renderPitchIcon,
    renderSessionSummary,
    renderTextAreaField,
    renderTextField,
    renderWorkspace,
  });
}
