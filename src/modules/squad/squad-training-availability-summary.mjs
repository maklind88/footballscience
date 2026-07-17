const dayMs = 24 * 60 * 60 * 1000;

function defaultFormatDateValue(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function isDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function parseDateValue(value) {
  if (!isDateValue(value)) {
    return null;
  }
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeParticipation(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function getRecordActualParticipation(record = {}, actualFallback = "not-logged") {
  const hasActual = Object.prototype.hasOwnProperty.call(record, "actualParticipation");
  if (hasActual && record.actualParticipation === actualFallback) {
    return null;
  }
  return normalizeParticipation(hasActual ? record.actualParticipation : record.participation);
}

function getRecordTimestamp(record = {}) {
  const value = record.updatedAt || record.createdAt || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isArchivedRecord(record = {}) {
  return Boolean(record.archivedAt || record.deletedAt || record.archiveReason || record.deletedBy);
}

function getActivityType(record = {}, getActivityContext = () => null) {
  const explicitType = String(record.activityType || record.eventType || record.sessionType || "").trim().toLowerCase();
  if (explicitType.includes("match")) {
    return "match";
  }
  if (explicitType.includes("training")) {
    return "training";
  }
  const context = getActivityContext(record.date) || {};
  const contextType = String(context.type || context.rawType || "").trim().toLowerCase();
  if (contextType === "match" || contextType === "training") {
    return contextType;
  }
  return "training";
}

function getLatestRecordMapByDate(records = []) {
  const latestByDate = new Map();
  records.forEach((record) => {
    const existing = latestByDate.get(record.date);
    if (!existing || getRecordTimestamp(record) >= getRecordTimestamp(existing)) {
      latestByDate.set(record.date, record);
    }
  });
  return latestByDate;
}

function getLatestRecordPerDate(records = []) {
  return Array.from(getLatestRecordMapByDate(records).values());
}

function buildWindow(items, predicate) {
  const windowRecords = items.filter((record) => predicate(record.dateValue));
  return {
    average: windowRecords.length
      ? Math.round(windowRecords.reduce((sum, record) => sum + record.participation, 0) / windowRecords.length)
      : null,
    count: windowRecords.length,
  };
}

const excusedClubAbsenceStatusKeys = new Set(["national-team"]);
const injuryAbsenceStatusKeys = new Set(["injured", "rehab"]);

function isExcusedClubAbsenceStatus(value = "") {
  const status = String(value || "").trim().toLowerCase();
  return excusedClubAbsenceStatusKeys.has(status);
}

function isInjuryAbsenceStatus(value = "") {
  const status = String(value || "").trim().toLowerCase();
  return injuryAbsenceStatusKeys.has(status);
}

function normalizeDateValue(value = "") {
  return isDateValue(value) ? String(value).slice(0, 10) : "";
}

function getExplicitOrContextActivityType(record = {}, getActivityContext = () => null) {
  const explicitType = String(record.activityType || record.eventType || record.sessionType || "").trim().toLowerCase();
  if (explicitType.includes("match")) {
    return "match";
  }
  if (explicitType.includes("training")) {
    return "training";
  }
  const context = getActivityContext(record.date) || {};
  const contextType = String(context.type || context.rawType || "").trim().toLowerCase();
  if (contextType === "match" || contextType === "training") {
    return contextType;
  }
  return "";
}

function getTrainingDateValueFromRecord(record = {}, getActivityContext = () => null) {
  if (!isDateValue(record?.date) || getExplicitOrContextActivityType(record, getActivityContext) !== "training") {
    return "";
  }
  return record.date;
}

function getFallbackTeamTrainingDateValues(records = [], getActivityContext = () => null) {
  return Array.from(
    new Set(
      records
        .filter((record) => !isArchivedRecord(record))
        .map((record) => getTrainingDateValueFromRecord(record, getActivityContext))
        .filter(Boolean)
    )
  ).sort((first, second) => first.localeCompare(second));
}

function getTeamTrainingDateValuesForSummary({
  records = [],
  getActivityContext = () => null,
  getTeamTrainingDateValues = () => [],
} = {}) {
  const rawScheduledDates = getTeamTrainingDateValues();
  const scheduledDates = Array.isArray(rawScheduledDates) ? rawScheduledDates.map(normalizeDateValue).filter(Boolean) : [];
  const fallbackDates = getFallbackTeamTrainingDateValues(records, getActivityContext);
  return Array.from(new Set([...scheduledDates, ...fallbackDates])).sort((first, second) => first.localeCompare(second));
}

export function getSquadTrainingAvailabilitySummary({
  playerId = "",
  records = [],
  referenceDateValue = defaultFormatDateValue(new Date()),
  medicalActualParticipationFallback = "not-logged",
  getActivityContext = () => null,
  getActiveMedicalInjuryPlan = () => null,
  getPlayerAvailabilityStatusForDate = () => "",
  getTeamTrainingDateValues = () => [],
} = {}) {
  const cleanPlayerId = String(playerId || "").trim();
  const referenceDate = parseDateValue(referenceDateValue) || parseDateValue(defaultFormatDateValue(new Date()));
  if (!cleanPlayerId || !referenceDate) {
    return {
      hasData: false,
      loggedCount: 0,
      week: { average: null, count: 0 },
      month: { average: null, count: 0 },
      season: { average: null, count: 0 },
      lastTwoWeeks: { average: null, count: 0 },
      lastFive: { average: null, count: 0 },
    };
  }

  const completedRecords = getLatestRecordPerDate(
    records
      .filter((record) => String(record?.playerId || "").trim() === cleanPlayerId)
      .filter((record) => !isArchivedRecord(record))
      .filter((record) => isDateValue(record?.date))
      .filter((record) => getActivityType(record, getActivityContext) === "training")
      .map((record) => ({
        ...record,
        participation: normalizeParticipation(record.participation),
        actualParticipationValue: getRecordActualParticipation(record, medicalActualParticipationFallback),
        dateValue: parseDateValue(record.date),
      }))
      .filter((record) => record.participation !== null && record.dateValue && record.dateValue <= referenceDate)
  ).sort((first, second) => first.date.localeCompare(second.date));

  const referenceYear = referenceDate.getUTCFullYear();
  const getAgeDays = (recordDate) => Math.floor((referenceDate - recordDate) / dayMs);
  const playerRecordByDate = getLatestRecordMapByDate(completedRecords);
  const trainingDateValues = getTeamTrainingDateValuesForSummary({
    records,
    getActivityContext,
    getTeamTrainingDateValues,
  });
  const trainingOpportunities = trainingDateValues
    .map((date) => {
      const dateValue = parseDateValue(date);
      if (!dateValue || dateValue > referenceDate) {
        return null;
      }
      const playerRecord = playerRecordByDate.get(date);
      if (!playerRecord) {
        const status = getPlayerAvailabilityStatusForDate(cleanPlayerId, date, null);
        if (isExcusedClubAbsenceStatus(status)) {
          return null;
        }
        const activePlan = getActiveMedicalInjuryPlan(cleanPlayerId, date);
        const planParticipation = normalizeParticipation(activePlan?.participation);
        if (planParticipation !== null) {
          return {
            date,
            dateValue,
            participation: planParticipation,
          };
        }
        if (isInjuryAbsenceStatus(status)) {
          return {
            date,
            dateValue,
            participation: 0,
          };
        }
        return null;
      }
      const status = getPlayerAvailabilityStatusForDate(cleanPlayerId, date, playerRecord);
      if (isExcusedClubAbsenceStatus(status)) {
        return null;
      }
      if (playerRecord.actualParticipationValue === null) {
        return null;
      }
      return {
        date,
        dateValue,
        participation: playerRecord.actualParticipationValue,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.date.localeCompare(second.date));
  const seasonRecords = trainingOpportunities.filter((record) => record.dateValue.getUTCFullYear() === referenceYear);
  const lastTwoWeekRecords = trainingOpportunities.filter((record) => {
    const ageDays = getAgeDays(record.dateValue);
    return ageDays >= 0 && ageDays <= 13;
  });
  const lastTwoWeeks = buildWindow(lastTwoWeekRecords, () => true);

  return {
    hasData: trainingOpportunities.length > 0,
    loggedCount: trainingOpportunities.length,
    latestDate: trainingOpportunities.at(-1)?.date || "",
    week: buildWindow(trainingOpportunities, (recordDate) => {
      const ageDays = getAgeDays(recordDate);
      return ageDays >= 0 && ageDays <= 6;
    }),
    month: buildWindow(trainingOpportunities, (recordDate) => {
      const ageDays = getAgeDays(recordDate);
      return ageDays >= 0 && ageDays <= 29;
    }),
    season: buildWindow(seasonRecords, () => true),
    lastTwoWeeks,
    lastFive: lastTwoWeeks,
  };
}

export { isExcusedClubAbsenceStatus as isSquadTrainingAvailabilityExcusedStatus };
