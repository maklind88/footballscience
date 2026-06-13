export const defaultScoutingRecordIndex = Object.freeze({
  id: 0,
  player: 1,
  team: 2,
  teamWithinTimeframe: 3,
  league: 4,
  season: 5,
  position: 6,
  age: 7,
  matches: 8,
  minutes: 9,
  birthCountry: 10,
  passportCountry: 11,
  height: 12,
  weight: 13,
  metrics: 14,
  sourceSystem: 15,
  playerSourceId: 16,
  sourceRecordId: 17,
  imageUrl: 18,
  playerIdentityId: 19,
  sourceTrace: 20,
  metricQuality: 21,
  dateOfBirth: 22,
});

function normalizeAdapterText(value = "", maxLength = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, maxLength);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeAdapterDateValue(value = "", normalizeDateValue = null) {
  if (typeof normalizeDateValue === "function") {
    return normalizeDateValue(value);
  }
  const text = normalizeAdapterText(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getNowDate(now = null) {
  const value = typeof now === "function" ? now() : null;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getNowTimestamp(now = null) {
  const value = typeof now === "function" ? now() : null;
  if (value instanceof Date) {
    return value.getTime();
  }
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

export function mapScoutingPositionToFootballScienceDbGroup(position = "", options = {}) {
  const normalized = normalizeAdapterText(position, 40, options.normalizeText).toUpperCase();
  if (!normalized || normalized === "ALL") return "";
  if (["GK", "G"].includes(normalized)) return "GK";
  if (["CB", "RCB", "LCB", "RB", "LB", "RWB", "LWB", "FB", "DEF"].includes(normalized)) return "DEF";
  if (["DM", "DMF", "CM", "CMF", "AM", "AMF", "MID", "MF"].includes(normalized)) return "MID";
  if (["RW", "LW", "WF", "WING"].includes(normalized)) return "WING";
  if (["CF", "ST", "FW", "F"].includes(normalized)) return "FW";
  return normalized;
}

export function calculateFootballScienceDbPlayerAge(dateOfBirth = "", birthYear = null, options = {}) {
  const iso = normalizeAdapterDateValue(dateOfBirth, options.normalizeDateValue);
  const now = getNowDate(options.now);
  if (iso) {
    const born = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(born.getTime())) {
      let age = now.getUTCFullYear() - born.getUTCFullYear();
      const monthDelta = now.getUTCMonth() - born.getUTCMonth();
      if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) {
        age -= 1;
      }
      return age >= 0 && age <= 90 ? age : "";
    }
  }
  const year = Number(birthYear);
  return Number.isFinite(year) && year > 1900 ? now.getUTCFullYear() - year : "";
}

export function getFootballScienceDbReadiness(player = {}, options = {}) {
  const readiness = player?.dataReadiness && typeof player.dataReadiness === "object" && !Array.isArray(player.dataReadiness)
    ? player.dataReadiness
    : {};
  const normalizeText = options.normalizeText;
  return {
    tier: normalizeAdapterText(readiness.tier, 40, normalizeText) || "identity_only",
    label: normalizeAdapterText(readiness.label, 80, normalizeText) || "Identity only",
    spiderReady: Boolean(readiness.spiderReady),
    statsReady: Boolean(readiness.statsReady),
    rosterReady: Boolean(readiness.rosterReady),
    missing: Array.isArray(readiness.missing)
      ? readiness.missing.map((item) => normalizeAdapterText(item, 80, normalizeText)).filter(Boolean)
      : [],
  };
}

export function footballSciencePlayerToScoutingRecord(player = {}, options = {}) {
  const normalizeText = options.normalizeText;
  const normalizeDateValue = options.normalizeDateValue;
  const recordIndex = options.recordIndex || defaultScoutingRecordIndex;
  const fsdbId = normalizeAdapterText(player.fsdbId || player.id, 160, normalizeText);
  const name = normalizeAdapterText(player.fullName || player.name || player.displayName, 180, normalizeText) || "Unknown player";
  const readiness = getFootballScienceDbReadiness(player, { normalizeText });
  const record = [];

  record[recordIndex.id] = fsdbId ? `fsdb:${fsdbId}` : `fsdb:${getNowTimestamp(options.now)}`;
  record[recordIndex.player] = name;
  record[recordIndex.team] = normalizeAdapterText(player.currentTeam, 180, normalizeText);
  record[recordIndex.teamWithinTimeframe] = normalizeAdapterText(player.currentTeam, 180, normalizeText);
  record[recordIndex.league] = normalizeAdapterText(player.currentCompetition, 180, normalizeText);
  record[recordIndex.season] = "";
  record[recordIndex.position] = normalizeAdapterText(player.primaryPosition || player.positionGroup, 120, normalizeText);
  record[recordIndex.age] = calculateFootballScienceDbPlayerAge(player.dateOfBirth, player.birthYear, {
    normalizeDateValue,
    now: options.now,
  });
  record[recordIndex.matches] = "";
  record[recordIndex.minutes] = 0;
  record[recordIndex.birthCountry] = normalizeAdapterText(player.birthCountry, 120, normalizeText);
  record[recordIndex.passportCountry] = normalizeAdapterText(player.nationality, 120, normalizeText);
  record[recordIndex.height] = Number.isFinite(Number(player.heightCm)) ? Number(player.heightCm) : "";
  record[recordIndex.weight] = Number.isFinite(Number(player.weightKg)) ? Number(player.weightKg) : "";
  record[recordIndex.metrics] = {};
  record[recordIndex.sourceSystem] = "football-science-db";
  record[recordIndex.playerSourceId] = fsdbId;
  record[recordIndex.sourceRecordId] = normalizeAdapterText(player.id, 160, normalizeText) || fsdbId;
  record[recordIndex.imageUrl] = "";
  record[recordIndex.playerIdentityId] = fsdbId;
  record[recordIndex.sourceTrace] = {
    identitySource: "football-science-db",
    footballScienceDb: {
      id: normalizeAdapterText(player.id, 160, normalizeText),
      fsdbId,
      nameQuality: normalizeAdapterText(player.nameQuality, 40, normalizeText),
      identityStatus: normalizeAdapterText(player.identityStatus, 40, normalizeText),
      sourcePriority: normalizeAdapterText(player.sourcePriority, 80, normalizeText),
      sourceConfidence: Number(player.sourceConfidence) || 0,
      dataReadiness: readiness,
      sourceLinkCount: Number(player.sourceLinkCount) || 0,
      rosterEntryCount: Number(player.rosterEntryCount) || 0,
      seasonStatCount: Number(player.seasonStatCount) || 0,
      metricCount: Number(player.metricCount) || 0,
      dedupeKeyPresent: Boolean(player.dedupeKeyPresent),
    },
  };
  record[recordIndex.metricQuality] = {};
  record[recordIndex.dateOfBirth] = normalizeAdapterDateValue(player.dateOfBirth, normalizeDateValue);
  return record;
}

export function createFootballScienceDbScoutingAdapter(options = {}) {
  return {
    calculateAgeFromBirthDate(dateOfBirth = "", birthYear = null) {
      return calculateFootballScienceDbPlayerAge(dateOfBirth, birthYear, options);
    },
    getReadiness(player = {}) {
      return getFootballScienceDbReadiness(player, options);
    },
    mapPositionToGroup(position = "") {
      return mapScoutingPositionToFootballScienceDbGroup(position, options);
    },
    playerToScoutingRecord(player = {}) {
      return footballSciencePlayerToScoutingRecord(player, options);
    },
  };
}
