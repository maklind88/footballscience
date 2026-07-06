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

function getLatestRecordPerDate(records = []) {
  const latestByDate = new Map();
  records.forEach((record) => {
    const existing = latestByDate.get(record.date);
    if (!existing || getRecordTimestamp(record) >= getRecordTimestamp(existing)) {
      latestByDate.set(record.date, record);
    }
  });
  return Array.from(latestByDate.values());
}

function buildWindow(records, predicate) {
  const windowRecords = records.filter((record) => predicate(record.dateValue));
  return {
    average: windowRecords.length
      ? Math.round(windowRecords.reduce((sum, record) => sum + record.participation, 0) / windowRecords.length)
      : null,
    count: windowRecords.length,
  };
}

const excusedClubAbsenceStatusKeys = new Set(["national-team"]);

function isExcusedClubAbsenceStatus(value = "") {
  const status = String(value || "").trim().toLowerCase();
  return excusedClubAbsenceStatusKeys.has(status);
}

export function getSquadTrainingAvailabilitySummary({
  playerId = "",
  records = [],
  referenceDateValue = defaultFormatDateValue(new Date()),
  getActivityContext = () => null,
  getPlayerAvailabilityStatusForDate = () => "",
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
      lastFive: { average: null, count: 0 },
    };
  }

  const completedRecords = getLatestRecordPerDate(
    records
      .filter((record) => String(record?.playerId || "").trim() === cleanPlayerId)
      .filter((record) => !isArchivedRecord(record))
      .filter((record) => isDateValue(record?.date))
      .filter((record) => getActivityType(record, getActivityContext) === "training")
      .filter((record) => !isExcusedClubAbsenceStatus(getPlayerAvailabilityStatusForDate(cleanPlayerId, record.date, record)))
      .map((record) => ({
        ...record,
        participation: normalizeParticipation(record.participation),
        dateValue: parseDateValue(record.date),
      }))
      .filter((record) => record.participation !== null && record.dateValue && record.dateValue <= referenceDate)
  ).sort((first, second) => first.date.localeCompare(second.date));

  const referenceYear = referenceDate.getUTCFullYear();
  const getAgeDays = (recordDate) => Math.floor((referenceDate - recordDate) / dayMs);
  const seasonRecords = completedRecords.filter((record) => record.dateValue.getUTCFullYear() === referenceYear);
  const lastFiveRecords = completedRecords.slice(-5);

  return {
    hasData: completedRecords.length > 0,
    loggedCount: completedRecords.length,
    latestDate: completedRecords.at(-1)?.date || "",
    week: buildWindow(completedRecords, (recordDate) => {
      const ageDays = getAgeDays(recordDate);
      return ageDays >= 0 && ageDays <= 6;
    }),
    month: buildWindow(completedRecords, (recordDate) => {
      const ageDays = getAgeDays(recordDate);
      return ageDays >= 0 && ageDays <= 29;
    }),
    season: buildWindow(seasonRecords, () => true),
    lastFive: buildWindow(lastFiveRecords, () => true),
  };
}

export { isExcusedClubAbsenceStatus as isSquadTrainingAvailabilityExcusedStatus };
