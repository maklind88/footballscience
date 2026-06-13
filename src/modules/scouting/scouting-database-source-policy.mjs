export const SCOUTING_DATABASE_FILTER_SOURCES = Object.freeze({
  scouting: "scouting",
  footballScienceDb: "fsdb",
});

export const SCOUTING_DATABASE_RECORD_SOURCES = Object.freeze({
  api: "api",
  local: "local",
  worker: "worker",
  footballScienceDb: "fsdb",
});

export const SCOUTING_FSDB_GENDER_SEGMENT_OPTIONS = Object.freeze([
  { id: "women", label: "Women's players", shortLabel: "Women's" },
  { id: "men", label: "Men's players", shortLabel: "Men's" },
]);

function normalizePolicyText(value = "", maxLength = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, maxLength);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getSourceValue(sourceOrDatabase = "") {
  return sourceOrDatabase && typeof sourceOrDatabase === "object" && !Array.isArray(sourceOrDatabase)
    ? sourceOrDatabase.source
    : sourceOrDatabase;
}

export function normalizeScoutingDatabaseFilterSource(value = "", options = {}) {
  const normalized = normalizePolicyText(value, 40, options.normalizeText).toLowerCase();
  return options.standaloneFootballScienceDbEnabled && normalized === SCOUTING_DATABASE_FILTER_SOURCES.footballScienceDb
    ? SCOUTING_DATABASE_FILTER_SOURCES.footballScienceDb
    : SCOUTING_DATABASE_FILTER_SOURCES.scouting;
}

export function normalizeScoutingDatabaseRecordSource(sourceOrDatabase = "", options = {}) {
  const normalized = normalizePolicyText(getSourceValue(sourceOrDatabase), 40, options.normalizeText).toLowerCase();
  return Object.values(SCOUTING_DATABASE_RECORD_SOURCES).includes(normalized) ? normalized : "";
}

export function isScoutingApiDatabaseSource(sourceOrDatabase = "", options = {}) {
  return normalizeScoutingDatabaseRecordSource(sourceOrDatabase, options) === SCOUTING_DATABASE_RECORD_SOURCES.api;
}

export function isScoutingWorkerDatabaseSource(sourceOrDatabase = "", options = {}) {
  return normalizeScoutingDatabaseRecordSource(sourceOrDatabase, options) === SCOUTING_DATABASE_RECORD_SOURCES.worker;
}

export function isFootballScienceDbDatabaseSource(sourceOrDatabase = "", options = {}) {
  return normalizeScoutingDatabaseRecordSource(sourceOrDatabase, options) === SCOUTING_DATABASE_RECORD_SOURCES.footballScienceDb;
}

export function isScoutingPagedDatabaseSource(sourceOrDatabase = "", options = {}) {
  const source = normalizeScoutingDatabaseRecordSource(sourceOrDatabase, options);
  return [
    SCOUTING_DATABASE_RECORD_SOURCES.api,
    SCOUTING_DATABASE_RECORD_SOURCES.worker,
    SCOUTING_DATABASE_RECORD_SOURCES.footballScienceDb,
  ].includes(source);
}

export function normalizeFootballScienceDbGenderSegment(value = "", options = {}) {
  const segmentOptions = Array.isArray(options.segmentOptions) && options.segmentOptions.length
    ? options.segmentOptions
    : SCOUTING_FSDB_GENDER_SEGMENT_OPTIONS;
  const normalized = normalizePolicyText(value, 20, options.normalizeText).toLowerCase();
  return segmentOptions.some((option) => option.id === normalized) ? normalized : "";
}

export function getFootballScienceDbGenderSegmentOption(value = "", options = {}) {
  const segmentOptions = Array.isArray(options.segmentOptions) && options.segmentOptions.length
    ? options.segmentOptions
    : SCOUTING_FSDB_GENDER_SEGMENT_OPTIONS;
  const normalized = normalizeFootballScienceDbGenderSegment(value, { ...options, segmentOptions });
  return segmentOptions.find((option) => option.id === normalized) || null;
}

export function getFootballScienceDbGenderSegmentLabel(value = "", options = {}) {
  const segment = getFootballScienceDbGenderSegmentOption(value, options);
  if (!segment) {
    return options.fallback || "selected";
  }
  return options.short ? segment.shortLabel : segment.label;
}

export function createScoutingDatabaseSourcePolicy(options = {}) {
  const normalizeText = options.normalizeText;
  const standaloneFootballScienceDbEnabled = options.standaloneFootballScienceDbEnabled === true;
  const segmentOptions = Array.isArray(options.segmentOptions) && options.segmentOptions.length
    ? options.segmentOptions
    : SCOUTING_FSDB_GENDER_SEGMENT_OPTIONS;
  const policyOptions = { normalizeText, segmentOptions };

  return {
    get standaloneFootballScienceDbEnabled() {
      return standaloneFootballScienceDbEnabled;
    },
    normalizeFilterSource(value = "") {
      return normalizeScoutingDatabaseFilterSource(value, {
        normalizeText,
        standaloneFootballScienceDbEnabled,
      });
    },
    normalizeRecordSource(sourceOrDatabase = "") {
      return normalizeScoutingDatabaseRecordSource(sourceOrDatabase, { normalizeText });
    },
    normalizeFootballScienceDbGenderSegment(value = "") {
      return normalizeFootballScienceDbGenderSegment(value, policyOptions);
    },
    getFootballScienceDbGenderSegmentOption(value = "") {
      return getFootballScienceDbGenderSegmentOption(value, policyOptions);
    },
    getFootballScienceDbGenderSegmentLabel(value = "", labelOptions = {}) {
      return getFootballScienceDbGenderSegmentLabel(value, { ...policyOptions, ...labelOptions });
    },
    isApiDatabase(sourceOrDatabase = "") {
      return isScoutingApiDatabaseSource(sourceOrDatabase, { normalizeText });
    },
    isWorkerDatabase(sourceOrDatabase = "") {
      return isScoutingWorkerDatabaseSource(sourceOrDatabase, { normalizeText });
    },
    isFootballScienceDbDatabase(sourceOrDatabase = "") {
      return isFootballScienceDbDatabaseSource(sourceOrDatabase, { normalizeText });
    },
    isPagedDatabase(sourceOrDatabase = "") {
      return isScoutingPagedDatabaseSource(sourceOrDatabase, { normalizeText });
    },
  };
}
