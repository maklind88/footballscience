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
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
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

function hasLoggedActualParticipation(record = {}, actualFallback = "not-logged") {
  if (!Object.prototype.hasOwnProperty.call(record, "actualParticipation")) {
    return false;
  }
  return record.actualParticipation !== actualFallback && normalizeParticipation(record.actualParticipation) !== null;
}

function getRecordTimestamp(record = {}) {
  const value = record.updatedAt || record.createdAt || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRecordCreatedTimestamp(record = {}) {
  const timestamp = Date.parse(record.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isArchivedRecord(record = {}) {
  return Boolean(record.archivedAt || record.deletedAt || record.archiveReason || record.deletedBy);
}

const squadRemovalArchiveReasonKeys = new Set([
  "player removed from squad room",
  "removed from squad room",
]);

function isSquadRemovalArchivedRecord(record = {}) {
  return isArchivedRecord(record) && squadRemovalArchiveReasonKeys.has(
    String(record.archiveReason || "").trim().toLowerCase()
  );
}

function isAvailabilityEvidenceRecord(record = {}) {
  return !isArchivedRecord(record) || isSquadRemovalArchivedRecord(record);
}

function isPreferredRecord(candidate = {}, existing = {}) {
  const activeComparison = Number(!isArchivedRecord(candidate)) - Number(!isArchivedRecord(existing));
  if (activeComparison !== 0) {
    return activeComparison > 0;
  }
  const updatedComparison = getRecordTimestamp(candidate) - getRecordTimestamp(existing);
  if (updatedComparison !== 0) {
    return updatedComparison > 0;
  }
  const createdComparison = getRecordCreatedTimestamp(candidate) - getRecordCreatedTimestamp(existing);
  if (createdComparison !== 0) {
    return createdComparison > 0;
  }
  return String(candidate.id || "").localeCompare(String(existing.id || "")) >= 0;
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
    if (!existing || isPreferredRecord(record, existing)) {
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
const countedClubAbsenceStatusKeys = new Set([
  "injured",
  "rehab",
  "unavailable",
  "vacation",
  "personal",
  "suspended",
  "loan",
]);

function isExcusedClubAbsenceStatus(value = "") {
  const status = String(value || "").trim().toLowerCase();
  return excusedClubAbsenceStatusKeys.has(status);
}

function isCountedClubAbsenceStatus(value = "") {
  const status = String(value || "").trim().toLowerCase();
  return countedClubAbsenceStatusKeys.has(status);
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
        .filter(isAvailabilityEvidenceRecord)
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

export function createSquadTrainingAvailabilityContext({
  records = [],
  getActivityContext = () => null,
  getTeamTrainingDateValues = () => [],
} = {}) {
  const sourceRecords = Array.isArray(records) ? records : [];
  const recordsByPlayerId = new Map();
  sourceRecords.forEach((record) => {
    const playerId = String(record?.playerId || "").trim();
    if (!playerId) {
      return;
    }
    const playerRecords = recordsByPlayerId.get(playerId) || [];
    playerRecords.push(record);
    recordsByPlayerId.set(playerId, playerRecords);
  });
  return {
    recordsByPlayerId,
    trainingDateValues: getTeamTrainingDateValuesForSummary({
      records: sourceRecords,
      getActivityContext,
      getTeamTrainingDateValues,
    }),
  };
}

export function getSquadTrainingAvailabilitySummary({
  playerId = "",
  records = [],
  referenceDateValue = defaultFormatDateValue(new Date()),
  currentDateValue = defaultFormatDateValue(new Date()),
  medicalActualParticipationFallback = "not-logged",
  getActivityContext = () => null,
  getActiveMedicalInjuryPlan = () => null,
  getPlayerAvailabilityStatusForDate = () => "",
  getTeamTrainingDateValues = () => [],
  summaryContext = null,
} = {}) {
  const cleanPlayerId = String(playerId || "").trim();
  const referenceDate = parseDateValue(referenceDateValue) || parseDateValue(defaultFormatDateValue(new Date()));
  const cleanCurrentDateValue = normalizeDateValue(currentDateValue) || defaultFormatDateValue(new Date());
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

  const hasPlayerRecordIndex = summaryContext?.recordsByPlayerId instanceof Map;
  const contextPlayerRecords = hasPlayerRecordIndex ? summaryContext.recordsByPlayerId.get(cleanPlayerId) : null;
  const playerRecords = hasPlayerRecordIndex
    ? (Array.isArray(contextPlayerRecords) ? contextPlayerRecords : [])
    : records;
  const completedRecords = getLatestRecordPerDate(
    playerRecords
      .filter((record) => String(record?.playerId || "").trim() === cleanPlayerId)
      .filter(isAvailabilityEvidenceRecord)
      .filter((record) => isDateValue(record?.date))
      .filter((record) => getActivityType(record, getActivityContext) === "training")
      .map((record) => ({
        ...record,
        participation: normalizeParticipation(record.participation),
        actualParticipationValue: getRecordActualParticipation(record, medicalActualParticipationFallback),
        hasLoggedActualParticipation: hasLoggedActualParticipation(record, medicalActualParticipationFallback),
        dateValue: parseDateValue(record.date),
      }))
      .filter((record) => record.participation !== null && record.dateValue && record.dateValue <= referenceDate)
  ).sort((first, second) => first.date.localeCompare(second.date));

  const referenceYear = referenceDate.getUTCFullYear();
  const getAgeDays = (recordDate) => Math.floor((referenceDate - recordDate) / dayMs);
  const playerRecordByDate = getLatestRecordMapByDate(completedRecords);
  const trainingDateValues = Array.isArray(summaryContext?.trainingDateValues)
    ? summaryContext.trainingDateValues
    : getTeamTrainingDateValuesForSummary({
        records,
        getActivityContext,
        getTeamTrainingDateValues,
      });
  const trainingDateValuesSorted = [...trainingDateValues].sort((first, second) => first.localeCompare(second));
  const getTrainingOpportunityEvidence = (date) => {
    const playerRecord = playerRecordByDate.get(date);
    if (date === cleanCurrentDateValue && !playerRecord?.hasLoggedActualParticipation) {
      return null;
    }
    const status = getPlayerAvailabilityStatusForDate(cleanPlayerId, date, playerRecord);
    if (isExcusedClubAbsenceStatus(status)) {
      return "excused";
    }

    if (playerRecord) {
      return playerRecord.actualParticipationValue ?? playerRecord.participation;
    }
    const activePlan = getActiveMedicalInjuryPlan(cleanPlayerId, date);
    const planParticipation = normalizeParticipation(activePlan?.participation);
    if (planParticipation !== null) {
      return planParticipation;
    }
    if (isCountedClubAbsenceStatus(status)) {
      return 0;
    }
    return null;
  };

  const firstEvidenceDateValue = (() => {
    for (const date of trainingDateValuesSorted) {
      const dateValue = parseDateValue(date);
      if (!dateValue || dateValue > referenceDate) {
        continue;
      }
      const evidence = getTrainingOpportunityEvidence(date);
      if (Number.isFinite(evidence)) {
        return dateValue;
      }
    }
    return null;
  })();

  const trainingOpportunities = trainingDateValues
    .map((date) => {
      const dateValue = parseDateValue(date);
      if (!dateValue || dateValue > referenceDate) {
        return null;
      }
      if (firstEvidenceDateValue && dateValue < firstEvidenceDateValue) {
        return null;
      }
      const evidence = getTrainingOpportunityEvidence(date);
      if (evidence === "excused" || evidence === null) {
        return null;
      }
      return {
        date,
        dateValue,
        participation: evidence,
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
