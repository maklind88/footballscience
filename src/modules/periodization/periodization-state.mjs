export const periodizationMonthNames = Object.freeze([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);

export const periodizationYear = 2026;
export const periodizationFieldUpdatedAtKey = "fieldUpdatedAt";
export const periodizationScalarFields = Object.freeze(
  "seasonPhase|daySchedule|matchDay|sessionType|physicalLoad|pitchSize|preTrainingVideo|preTrainingNotes|psychologicalFocus|psychologicalNotes|mainFocus|gkFocus|warmUp|block1|block2|block3|block4|sessionNotes|sessionPlanLink|sessionVideoLink|sessionGpsReportLink".split(
    "|"
  )
);
export const periodizationMultiFields = Object.freeze(new Set("matchPhases|subPhases|teamPrinciples|miniGamePrinciples".split("|")));
export const periodizationTrackedFields = Object.freeze(new Set([...periodizationScalarFields, ...periodizationMultiFields]));

export const periodizationPhaseLibrary = Object.freeze({
  "In Possession": Object.freeze(["Build with GK", "Build Up", "Creating Phase", "Finishing Phase"]),
  "Out of Possession": Object.freeze(["High Press vs GK", "High Press", "Block Defending", "Box Defending"]),
  "Offensive Transition": Object.freeze(["Offensive Transition"]),
  "Defensive Transition": Object.freeze(["Defensive Transition"]),
  "Set Pieces": Object.freeze([
    "Goalkicks (Off)",
    "Goalkicks (Def)",
    "Offensive Set Pieces",
    "Defensive Set Pieces",
    "Throw Ins (Off)",
    "Throw Ins (Def)",
  ]),
});

export const periodizationTeamPrinciplesBySubPhase = Object.freeze({
  "Build with GK": Object.freeze([
    "Create time and space with positioning",
    "Break the first line of pressure with control & escape high pressure together",
    'Create numbers around the ball; "lock" the opponent to open space',
  ]),
  "Build Up": Object.freeze([
    "Exploit the space created by the opponent's press",
    "Break pressure with control to progress play",
    "Progress quickly once pressure is broken",
  ]),
  "Creating Phase": Object.freeze([
    "Disorganise the opponent to open spaces",
    "Create and exploit advantage before the final action",
    '"Lock" defenders with positioning to free a teammate / open space',
  ]),
  "Finishing Phase": Object.freeze([
    "Attack the box with purpose and timing",
    "Create number and attack the box",
    "Balance the attack to sustain pressure (rest-defence)",
  ]),
  "Offensive Set Pieces": Object.freeze([
    "Create a clear scoring threat from set pieces",
    "Attack key zones with timing and purpose",
    "Balance for second balls to win ball",
  ]),
  "Defensive Set Pieces": Object.freeze([
    "Protect goal by prioritize highest-threat zones first",
    "Win the first duell and secure second balls",
    "Clear with control to planned spaces.",
  ]),
  "Throw Ins (Off & Def)": Object.freeze([
    "Create a clean first action (keep/advance)",
    "Exploit overloads and third-player options",
    "Be ready for transition (Balans behind attack).",
  ]),
  "High Press vs GK & High Press": Object.freeze([
    "Control the opponent's direction of play & force predictable areas",
    "Protect the centre first and then win the ball",
    "Defend collectively and stay compact",
  ]),
  "Block Defending": Object.freeze([
    "Protect lines and defend together",
    "Control the opponent around the ball",
    "Win ball and transition",
  ]),
  "Box Defending": Object.freeze([
    "Protect the goal",
    "Control central and high-value spaces in the box",
    "Defend the ball aggressively and with determination",
  ]),
  "Offensive Transition": Object.freeze([
    "Attack immediately after regaining the ball",
    "Progress forward with speed and purpose",
    "Exploit numerical advantage and weak-side space",
  ]),
  "Defensive Transition": Object.freeze([
    "Regain control: win it back or force predictable play",
    "Delay the opponent to allow recovery",
    "Protect the goal/centre immediately after losing the ball",
  ]),
});

export const periodizationMiniGamePrinciplesBySubPhase = Object.freeze({
  "Build with GK": Object.freeze([
    "Drive past press",
    "1v1 (Weak side)",
    "Follow pressure",
    "Press-radius (Green, yellow, red)",
    "Counter movement (in Width)",
    "BUP + 3 passing lines",
    "Exit: Highest point",
    "Change corridor",
    "Pass N Move",
  ]),
  "Build Up": Object.freeze([
    "LRT (Left, Right, Through)",
    "Drive past press",
    "Numerical advantage (direct opponent)",
    "Provoke press",
    "1v1 (Away from toes)",
    "Change corridor",
    "FT3 (Find the Third)",
    "Close relations (Meters on quality)",
    "Follow pressure",
    "Press-radius",
    "BU Player in 2.5 corridors",
    "Pass N Move",
    "Curled balls into Zone 3",
    "Countermovement (in height / move with ball)",
    "SOP with Missile",
  ]),
  "Creating Phase": Object.freeze([
    "Ask question",
    "Direct opponent",
    "Change corridor",
    "Split / Double",
    "Highest point",
    "Overlap / Underlap",
    "Link player",
    "Air Gate",
    "Countermovement (in diagonals)",
    "SOP with Rytm",
  ]),
  "Finishing Phase": Object.freeze([
    "1v1",
    "Play n Go",
    "Find a Gate (Attack the same gate at the same time)",
    "Find sweet spot",
    "Timead run vs Backline (Cut offside line when ball leaves foot).",
    "Link player",
    "Distance shooting / uncomfortable shots",
    "Early crosses",
    "Passing zone - Cutfront (Angle forward towards second post)",
    "Passing zone - Cutback (Second post or pentalty spot)",
    "Timed runs into shooting zone",
    "Blinside run (Countermovement, away & arrive with ball)",
    "WTBBQ",
    "BBA (Balance Behind Attack) + 1 > Offensive marking",
  ]),
  "High Press vs GK & High Press": Object.freeze([
    "Ballside",
    "Trigger",
    "Press (within press-radius)",
    "1v1 duels > 1 touch smash",
    "Shift",
    "2nd ball positioning",
    "Zero player in +1",
    "Break pass",
  ]),
  "Block Defending": Object.freeze([
    "Prioritised areas (Show outside)",
    "Keep ball in front of lines",
    "Central line (Nearest central player)",
    "Press and smash within red press-radius zone.",
    "Cover lines by pressing in arrows or checkmarks",
    "Left & Right Connector",
    "Pump up the backline",
    "Shift over (Defend in 2,5-3 corridors)",
    "Defend Overlap/Underlap & Play N Go",
  ]),
  "Box Defending": Object.freeze([
    "Cover prioritised spaces",
    "Zonal marking",
    "Open body positioning",
    "Clearance into zones (Attack the ball)",
    "2-ball orientation",
  ]),
  "Offensive Transition": Object.freeze([
    "Direct transition to goal",
    "Run past ball holder",
    "Diagonal from winning area",
    "Change corridor",
    "Max sprint",
    "Numerical advantage ( 2v1, 3v2, 4v3)",
  ]),
  "Defensive Transition": Object.freeze([
    "WTTBQ (Immediate counter-press)",
    "Delay (stop progression)",
    "Protect central",
    "Lock in and squeeze",
    "Win it or force predictable play",
  ]),
  "Offensive Set Pieces": Object.freeze([
    "Delivery quality",
    "Attack zones with timing (arrive when ball arrive)",
    "Betweeen ball and direct opponent",
    "Screens / blocks",
    "Second ball positioning (between duel and direct opponent)",
  ]),
  "Defensive Set Pieces": Object.freeze([
    "Zonal + marking responsibilities",
    "First contact (human shield), then attack the ball.",
    "Second ball positioning (between duel and direct opponent)",
    "Clearance zones",
    "Counter attack on weak side first and then change corridors.",
  ]),
  "Throw Ins (Off)": Object.freeze(["Quick restart", "Create overload", "FT3 (Find the Third)", "Change corridor", "Rest-defence"]),
  "Throw Ins (Def)": Object.freeze([
    "Zonal + man responsibilities ballside",
    "Duels 1v1",
    "Infront/behind targets",
    "Defend in 2,5 corridors.",
  ]),
  "Goalkicks (Off)": Object.freeze([
    "1. Speed (Ready to restart quickly, early positioning and readiness)",
    "2. Short structure (Orginasied Build Up With GK)",
    "3. Long structure (Play into defind area, players around the ball).",
  ]),
});

export const periodizationOptionLibrary = Object.freeze({
  seasonPhase: Object.freeze(["Pre Season", "Competition", "Playoffs", "Transition", "Off Season"]),
  daySchedule: Object.freeze(["Training", "Training + Travel", "Match", "Travel Day", "Recovery", "Meeting", "Off"]),
  matchDay: Object.freeze([
    "Match Day -5",
    "Match Day -4",
    "Match Day -3",
    "Match Day -2",
    "Match Day -1",
    "Match Day",
    "Match Day +1",
    "Match Day +2",
    "Match Day +3",
  ]),
  sessionType: Object.freeze(["Training", "Training + Lift", "Training / IDP", "Match", "Recovery", "Activation", "Unit", "Off"]),
  physicalLoad: Object.freeze(["Off", "Low", "Moderate", "Hard", "Match"]),
  pitchSize: Object.freeze(["SSG", "MSG", "BSG", "LSG", "Half Pitch", "Full Pitch", "Final Third", "Gym / Recovery"]),
  preTrainingVideo: Object.freeze(["None", "Match Review", "Training Prep", "Scout", "Match Review + Scout"]),
  psychologicalFocus: Object.freeze(["Confidence", "Clarity", "Competition", "Connection", "Resilience", "Recovery"]),
  gkFocus: Object.freeze(["Distribution", "Build with GK", "Shot Stopping", "Crosses", "Sweeper Actions", "Set Pieces", "Recovery"]),
  block: Object.freeze([
    "Activators",
    "A - Rondos",
    "G - Regular Games (9v9 to 11v11)",
    "G - Regular Games (6v6 to 8v8)",
    "G - Duel Games (1v1 to 2v2)",
    "G - Constrained/Situational Games",
    "G - Transition Wave Games",
    "RS - 3v3 to 6v6 - Numbers even or mixed",
    "RS - 7v7 to 11v11 - Numbers even or mixed",
  ]),
  matchPhases: Object.freeze(Object.keys(periodizationPhaseLibrary)),
  subPhases: Object.freeze(Object.values(periodizationPhaseLibrary).flat()),
  teamPrinciples: Object.freeze(Object.values(periodizationTeamPrinciplesBySubPhase).flat()),
  miniGamePrinciples: Object.freeze(Object.values(periodizationMiniGamePrinciplesBySubPhase).flat()),
});

function defaultFormatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultParseDateValue(dateValue) {
  const [year, month, day] = String(dateValue || "")
    .split("-")
    .map((part) => Number(part));
  return new Date(year || periodizationYear, (month || 1) - 1, day || 1);
}

export function isPeriodizationDateValueInYear(dateValue, year = periodizationYear, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))) {
    return false;
  }
  const parseDateValue = typeof options.parseDateValue === "function" ? options.parseDateValue : defaultParseDateValue;
  const formatDateValue = typeof options.formatDateValue === "function" ? options.formatDateValue : defaultFormatDateValue;
  const date = parseDateValue(dateValue);
  return date.getFullYear() === year && formatDateValue(date) === dateValue;
}

export function normalizePeriodizationMultiValue(value) {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split("|");
  return [...new Set(rawValues.map((item) => String(item).trim()).filter(Boolean))];
}

export function normalizePeriodizationDay(day = {}) {
  const normalized = {};
  periodizationScalarFields.forEach((key) => {
    const value = String(day[key] ?? "").trim();
    normalized[key] = key === "matchDay" && value.toUpperCase() === "N/A" ? "" : value;
  });
  periodizationMultiFields.forEach((key) => {
    normalized[key] = normalizePeriodizationMultiValue(day[key]);
  });
  const fieldUpdatedAt = {};
  if (day?.[periodizationFieldUpdatedAtKey] && typeof day[periodizationFieldUpdatedAtKey] === "object") {
    Object.entries(day[periodizationFieldUpdatedAtKey]).forEach(([key, value]) => {
      if (!periodizationTrackedFields.has(key)) {
        return;
      }
      const timestamp = new Date(value || 0).getTime();
      if (Number.isFinite(timestamp) && timestamp > 0) {
        fieldUpdatedAt[key] = new Date(timestamp).toISOString();
      }
    });
  }
  if (Object.keys(fieldUpdatedAt).length) {
    normalized[periodizationFieldUpdatedAtKey] = fieldUpdatedAt;
  }
  return normalized;
}

export function getPeriodizationFieldUpdatedAtMs(day = {}, field = "") {
  const timestamp = new Date(day?.[periodizationFieldUpdatedAtKey]?.[field] || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function isEmptyPeriodizationMergeValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return String(value ?? "").trim() === "";
}

export function mergePeriodizationDayPreservingLocalEdits(localDay = {}, centralDay = {}) {
  const local = normalizePeriodizationDay(localDay);
  const central = normalizePeriodizationDay(centralDay);
  const merged = { ...central };
  const mergedMeta = {
    ...(central[periodizationFieldUpdatedAtKey] || {}),
    ...(local[periodizationFieldUpdatedAtKey] || {}),
  };
  periodizationTrackedFields.forEach((field) => {
    const localTimestamp = getPeriodizationFieldUpdatedAtMs(local, field);
    const centralTimestamp = getPeriodizationFieldUpdatedAtMs(central, field);
    if (localTimestamp && (!centralTimestamp || localTimestamp >= centralTimestamp)) {
      merged[field] = Array.isArray(local[field]) ? [...local[field]] : local[field];
      mergedMeta[field] = new Date(localTimestamp).toISOString();
      return;
    }
    if (centralTimestamp && (!localTimestamp || centralTimestamp > localTimestamp)) {
      merged[field] = Array.isArray(central[field]) ? [...central[field]] : central[field];
      mergedMeta[field] = new Date(centralTimestamp).toISOString();
      return;
    }
    if (isEmptyPeriodizationMergeValue(central[field]) && !isEmptyPeriodizationMergeValue(local[field])) {
      merged[field] = Array.isArray(local[field]) ? [...local[field]] : local[field];
    }
  });
  if (Object.keys(mergedMeta).length) {
    merged[periodizationFieldUpdatedAtKey] = mergedMeta;
  }
  return normalizePeriodizationDay(merged);
}

export function mergePeriodizationDayMapPreservingLocalEdits(localDays = {}, centralDays = {}) {
  const mergedDays = {};
  const dateValues = new Set([...Object.keys(centralDays || {}), ...Object.keys(localDays || {})]);
  dateValues.forEach((dateValue) => {
    const centralDay = centralDays?.[dateValue];
    const localDay = localDays?.[dateValue];
    if (centralDay && localDay) {
      mergedDays[dateValue] = mergePeriodizationDayPreservingLocalEdits(localDay, centralDay);
      return;
    }
    if (centralDay) {
      mergedDays[dateValue] = normalizePeriodizationDay(centralDay);
      return;
    }
    if (localDay) {
      mergedDays[dateValue] = normalizePeriodizationDay(localDay);
    }
  });
  return mergedDays;
}

export function createDefaultPeriodizationState(options = {}) {
  const formatDateValue = typeof options.formatDateValue === "function" ? options.formatDateValue : defaultFormatDateValue;
  const today = options.today instanceof Date ? options.today : new Date();
  const importedVersion = String(options.importedVersion || "");
  const importedDays =
    options.importedDays && typeof options.importedDays === "object" ? options.importedDays : {};
  return {
    selectedYear: periodizationYear,
    selectedMonthIndex: today.getMonth(),
    selectedDate: formatDateValue(new Date(periodizationYear, today.getMonth(), 1)),
    importVersion: importedVersion,
    days: importedDays,
  };
}

export function createPeriodizationStateAdapter(options = {}) {
  const formatDateValue = typeof options.formatDateValue === "function" ? options.formatDateValue : defaultFormatDateValue;
  const parseDateValue = typeof options.parseDateValue === "function" ? options.parseDateValue : defaultParseDateValue;
  const importedVersion = String(options.importedVersion || "");
  const importedDays = options.importedDays && typeof options.importedDays === "object" ? options.importedDays : {};
  const defaultPeriodizationState = createDefaultPeriodizationState({
    formatDateValue,
    importedDays,
    importedVersion,
    today: options.today,
  });

  function isDateValueInYear(dateValue, year = periodizationYear) {
    return isPeriodizationDateValueInYear(dateValue, year, { formatDateValue, parseDateValue });
  }

  function getScheduleEventsForDate(dateValue) {
    return typeof options.getScheduleEventsForDate === "function" ? options.getScheduleEventsForDate(dateValue) : [];
  }

  function getAllScheduleEvents() {
    return typeof options.getAllScheduleEvents === "function" ? options.getAllScheduleEvents() : [];
  }

  function getScheduleEventLabel(type) {
    return typeof options.getScheduleEventLabel === "function" ? options.getScheduleEventLabel(type) : "Training";
  }

  function isPeriodizationOffDay(day) {
    const schedule = String(day?.daySchedule || "").toLowerCase();
    const sessionType = String(day?.sessionType || "").toLowerCase();
    const load = String(day?.physicalLoad || "").toLowerCase();
    return schedule.includes("off") || sessionType.includes("off") || load.includes("off");
  }

  function getPeriodizationAutoMd(dateValue) {
    const targetDay = Date.parse(`${dateValue}T00:00:00Z`) / 864e5;
    let best = 9;
    for (const event of getAllScheduleEvents() || []) {
      const offset = event.type === "match" ? targetDay - Date.parse(`${event.date}T00:00:00Z`) / 864e5 : 9;
      if (
        offset >= -5 &&
        offset <= 3 &&
        (Math.abs(offset) < Math.abs(best) || (Math.abs(offset) === Math.abs(best) && offset < best))
      ) {
        best = offset;
      }
    }
    return best === 9 ? "" : `Match Day${best ? ` ${best > 0 ? "+" : ""}${best}` : ""}`;
  }

  function getPeriodizationScheduleDefaults(dateValue) {
    const events = getScheduleEventsForDate(dateValue);
    const mainEvent = events[0] ?? null;
    if (!mainEvent) {
      return {
        daySchedule: "Off",
        sessionType: "Off",
        physicalLoad: "Off",
        pitchSize: "",
      };
    }
    const type = mainEvent.type;
    const label = getScheduleEventLabel(type);
    return {
      daySchedule: type === "travel" ? "Travel Day" : label,
      sessionType:
        type === "training"
          ? "Training"
          : type === "match"
            ? "Match"
            : type === "recovery"
              ? "Recovery"
              : type === "off"
                ? "Off"
                : "",
      physicalLoad:
        type === "match"
          ? "Match"
          : type === "training"
            ? "Moderate"
            : type === "recovery"
              ? "Low"
              : type === "off"
                ? "Off"
                : "",
    };
  }

  function getDefaultPeriodizationDay(dateValue) {
    return normalizePeriodizationDay({
      seasonPhase: "Competition",
      matchDay: "",
      ...getPeriodizationScheduleDefaults(dateValue),
    });
  }

  function getPeriodizationDay(dateValue, state) {
    const savedDay = state?.days?.[dateValue] ?? {};
    const day = normalizePeriodizationDay({
      ...getDefaultPeriodizationDay(dateValue),
      ...savedDay,
    });
    if (getPeriodizationFieldUpdatedAtMs(savedDay, "matchDay")) {
      return day;
    }
    if (isPeriodizationOffDay(day)) {
      return { ...day, matchDay: "" };
    }
    const autoMatchDay = getPeriodizationAutoMd(dateValue);
    return autoMatchDay ? { ...day, matchDay: autoMatchDay } : day;
  }

  function mergePeriodizationImportedDays(days = {}) {
    const mergedDays = {};
    const dateValues = new Set([...Object.keys(importedDays), ...Object.keys(days || {})]);
    dateValues.forEach((dateValue) => {
      if (!isDateValueInYear(dateValue, periodizationYear)) {
        return;
      }
      const importedDay = normalizePeriodizationDay(importedDays[dateValue] || {});
      const savedDay = normalizePeriodizationDay(days?.[dateValue] || {});
      const mergedDay = { ...importedDay };
      Object.entries(savedDay).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length) {
            mergedDay[key] = value;
          }
          return;
        }
        if (String(value ?? "").trim()) {
          mergedDay[key] = value;
        }
      });
      mergedDays[dateValue] = normalizePeriodizationDay(mergedDay);
    });
    return mergedDays;
  }

  function clonePeriodizationState(source = defaultPeriodizationState) {
    const rawMonthIndex = Number(source.selectedMonthIndex);
    const selectedMonthIndex = Number.isFinite(rawMonthIndex)
      ? Math.min(11, Math.max(0, rawMonthIndex))
      : defaultPeriodizationState.selectedMonthIndex;
    const fallbackDate = formatDateValue(new Date(periodizationYear, selectedMonthIndex, 1));
    const selectedDate = isDateValueInYear(source.selectedDate, periodizationYear) ? source.selectedDate : fallbackDate;
    const importVersion = String(source.importVersion || "");
    const days = {};
    if (source.days && typeof source.days === "object") {
      Object.entries(source.days).forEach(([dateValue, day]) => {
        if (isDateValueInYear(dateValue, periodizationYear) && day && typeof day === "object") {
          days[dateValue] = normalizePeriodizationDay(day);
        }
      });
    }
    const mergedDays = importVersion === importedVersion ? days : mergePeriodizationImportedDays(days);
    return {
      selectedYear: periodizationYear,
      selectedMonthIndex,
      selectedDate,
      importVersion: importVersion === importedVersion ? importVersion : importedVersion,
      days: mergedDays,
    };
  }

  function mergePeriodizationStatePreservingLocalUi(localValue, centralValue) {
    let localState = null;
    let centralStateValue = null;
    try {
      localState = localValue ? JSON.parse(localValue) : null;
      centralStateValue = centralValue ? JSON.parse(centralValue) : null;
    } catch {
      return centralValue;
    }
    if (!localState || typeof localState !== "object" || !centralStateValue || typeof centralStateValue !== "object") {
      return centralValue;
    }
    const mergedDays = mergePeriodizationDayMapPreservingLocalEdits(localState.days, centralStateValue.days);
    return JSON.stringify({
      ...centralStateValue,
      days: mergedDays,
      selectedYear: localState.selectedYear ?? centralStateValue.selectedYear,
      selectedMonthIndex: localState.selectedMonthIndex ?? centralStateValue.selectedMonthIndex,
      selectedDate: localState.selectedDate ?? centralStateValue.selectedDate,
    });
  }

  return Object.freeze({
    clonePeriodizationState,
    defaultPeriodizationState,
    getDefaultPeriodizationDay,
    getPeriodizationAutoMd,
    getPeriodizationDay,
    getPeriodizationScheduleDefaults,
    isDateValueInYear,
    isPeriodizationOffDay,
    mergePeriodizationImportedDays,
    mergePeriodizationStatePreservingLocalUi,
    normalizePeriodizationDay,
    normalizePeriodizationMultiValue,
  });
}
