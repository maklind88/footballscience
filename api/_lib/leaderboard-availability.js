const { readAppStateRecord } = require("./app-state-records-database.js");

const PLAYER_PROFILES_KEY = "football-player-profiles-v1";
const MEDICAL_TEAM_KEY = "football-medical-team-v1";
const LEGACY_APP_STATE_ORGANIZATION_ID = "global";
const SQUAD_BLOCK_STATUSES = new Set([
  "injured",
  "rehab",
  "unavailable",
  "national-team",
  "vacation",
  "personal",
  "suspended",
  "loan",
]);
const LIMITED_MEDICAL_STATUSES = new Set(["modified", "controlled", "rehab"]);

function normalizeText(value, maxLength = 180) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeDate(value = "") {
  const clean = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(clean)) return "";
  const [year, month, day] = clean.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? clean
    : "";
}

function parseState(value = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isArchived(item = {}) {
  return Boolean(item.archivedAt || item.archived_at || item.deletedAt || item.deleted_at);
}

function timestamp(item = {}) {
  return Math.max(
    ...[item.updatedAt, item.updated_at, item.createdAt, item.created_at]
      .map((value) => Date.parse(String(value || "")))
      .filter(Number.isFinite),
    0,
  );
}

function normalizeParticipation(value, fallback = 100) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function getMonthDates(month = "") {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function getAvailabilityChanges(playerProfilesState = {}, playerId = "") {
  return (Array.isArray(playerProfilesState.changeLog) ? playerProfilesState.changeLog : [])
    .filter((entry) => normalizeText(entry?.playerId) === playerId)
    .flatMap((entry) => (Array.isArray(entry?.changes) ? entry.changes : [])
      .filter((change) => normalizeText(change?.field).toLowerCase() === "availability status")
      .map((change) => ({
        date: normalizeDate(String(entry?.createdAt || "").slice(0, 10)),
        timestamp: Date.parse(String(entry?.createdAt || "")) || 0,
        from: normalizeText(change?.from, 40).toLowerCase(),
        to: normalizeText(change?.to, 40).toLowerCase(),
      })))
    .filter((entry) => entry.date && (entry.from || entry.to))
    .sort((left, right) => left.timestamp - right.timestamp || left.date.localeCompare(right.date));
}

function createAvailabilityIndex(playerProfilesState = {}, medicalState = {}) {
  const changesByPlayer = new Map();
  for (const entry of Array.isArray(playerProfilesState.changeLog) ? playerProfilesState.changeLog : []) {
    const playerId = normalizeText(entry?.playerId);
    if (!playerId) continue;
    const changes = changesByPlayer.get(playerId) || [];
    changes.push(...getAvailabilityChanges({ changeLog: [entry] }, playerId));
    changesByPlayer.set(playerId, changes);
  }
  changesByPlayer.forEach((changes) => changes.sort((left, right) => left.timestamp - right.timestamp || left.date.localeCompare(right.date)));

  const manualByPlayerDate = new Map();
  for (const record of Array.isArray(medicalState.records) ? medicalState.records : []) {
    const playerId = normalizeText(record?.playerId);
    const date = normalizeDate(record?.date);
    if (!playerId || !date || isArchived(record)) continue;
    const key = `${playerId}:${date}`;
    const current = manualByPlayerDate.get(key);
    if (!current || timestamp(record) > timestamp(current)) manualByPlayerDate.set(key, record);
  }

  const plansByPlayer = new Map();
  for (const plan of Array.isArray(medicalState.injuryPlans) ? medicalState.injuryPlans : []) {
    const playerId = normalizeText(plan?.playerId);
    const startDate = normalizeDate(plan?.startDate);
    const endDate = normalizeDate(plan?.endDate);
    if (!playerId || !startDate || !endDate || isArchived(plan)) continue;
    const plans = plansByPlayer.get(playerId) || [];
    plans.push({ plan, startDate, endDate });
    plansByPlayer.set(playerId, plans);
  }
  plansByPlayer.forEach((plans) => plans.sort((left, right) => timestamp(right.plan) - timestamp(left.plan)));
  return { changesByPlayer, manualByPlayerDate, plansByPlayer };
}

function getSquadStatusForDate(player = {}, date = "", playerProfilesState = {}, index = null) {
  const currentStatus = normalizeText(player.availabilityStatus || player.status || "available", 40).toLowerCase() || "available";
  const playerId = normalizeText(player.playerId || player.id);
  const changes = index?.changesByPlayer?.get(playerId) || getAvailabilityChanges(playerProfilesState, playerId);
  if (!changes.length) {
    const updatedDate = normalizeDate(String(player.updatedAt || player.updated_at || "").slice(0, 10));
    return updatedDate && updatedDate > date && SQUAD_BLOCK_STATUSES.has(currentStatus) ? "available" : currentStatus;
  }
  const first = changes[0];
  let status = first.from || (first.date > date && SQUAD_BLOCK_STATUSES.has(currentStatus) ? "available" : currentStatus);
  changes.forEach((change) => {
    if (change.date <= date && change.to) status = change.to;
  });
  return status || currentStatus;
}

function getLatestManualRecord(medicalState = {}, playerId = "", date = "", index = null) {
  if (index?.manualByPlayerDate) return index.manualByPlayerDate.get(`${playerId}:${date}`) || null;
  return (Array.isArray(medicalState.records) ? medicalState.records : [])
    .filter((record) => !isArchived(record) && normalizeText(record.playerId) === playerId && normalizeDate(record.date) === date)
    .sort((left, right) => timestamp(right) - timestamp(left))[0] || null;
}

function getActivePlan(medicalState = {}, playerId = "", date = "", index = null) {
  if (index?.plansByPlayer) {
    return (index.plansByPlayer.get(playerId) || [])
      .find((candidate) => candidate.startDate <= date && candidate.endDate >= date)?.plan || null;
  }
  return (Array.isArray(medicalState.injuryPlans) ? medicalState.injuryPlans : [])
    .filter((plan) => !isArchived(plan)
      && normalizeText(plan.playerId) === playerId
      && normalizeDate(plan.startDate) <= date
      && normalizeDate(plan.endDate) >= date)
    .sort((left, right) => timestamp(right) - timestamp(left))[0] || null;
}

function classifyAvailability(status = "", participation = 100, source = "squad") {
  const safeStatus = normalizeText(status, 40).toLowerCase() || "unknown";
  const safeParticipation = normalizeParticipation(participation, safeStatus === "unavailable" ? 0 : 100);
  const eligibility = safeParticipation <= 0 || safeStatus === "unavailable"
    ? "unavailable"
    : safeParticipation < 100 || LIMITED_MEDICAL_STATUSES.has(safeStatus)
      ? "limited"
      : safeStatus === "unknown"
        ? "unknown"
        : "available";
  return Object.freeze({ status: safeStatus, participation: safeParticipation, eligibility, source });
}

function getPlayerAvailabilityForDate(player = {}, date = "", sources = {}) {
  const playerId = normalizeText(player.playerId || player.id);
  const index = sources.index || null;
  const squadStatus = getSquadStatusForDate(player, date, sources.playerProfilesState, index);
  if (SQUAD_BLOCK_STATUSES.has(squadStatus)) return classifyAvailability("unavailable", 0, "squad");

  const manualRecord = getLatestManualRecord(sources.medicalState, playerId, date, index);
  const activePlan = getActivePlan(sources.medicalState, playerId, date, index);
  const medicalRecord = manualRecord && activePlan
    ? (timestamp(manualRecord) >= timestamp(activePlan) ? manualRecord : activePlan)
    : manualRecord || activePlan;
  if (medicalRecord) {
    return classifyAvailability(
      medicalRecord.status || (Number(medicalRecord.participation) === 0 ? "unavailable" : "full"),
      medicalRecord.participation,
      manualRecord === medicalRecord ? "medical-recommendation" : "medical-plan",
    );
  }
  if (squadStatus === "managed") return classifyAvailability("modified", 75, "squad");
  if (squadStatus === "unknown") return classifyAvailability("unknown", 100, "squad");
  return classifyAvailability("full", 100, "squad");
}

function buildAvailabilityByPlayer({ month = "", roster = [], playerProfilesState = {}, medicalState = {} } = {}) {
  const dates = getMonthDates(month);
  const index = createAvailabilityIndex(playerProfilesState, medicalState);
  return Object.fromEntries(roster.map((player) => [
    normalizeText(player.playerId || player.id),
    Object.fromEntries(dates.map((date) => [date, getPlayerAvailabilityForDate(player, date, { playerProfilesState, medicalState, index })])),
  ]).filter(([playerId]) => playerId));
}

function findUnavailableAwardPlayerIds(awards = [], occurredOn = "", availabilityByPlayer = {}) {
  return awards
    .map((award) => normalizeText(award?.playerId))
    .filter((playerId) => playerId && availabilityByPlayer[playerId]?.[occurredOn]?.eligibility === "unavailable");
}

async function readLeaderboardAvailabilitySources(options = {}) {
  const reader = options.readAppStateRecord || readAppStateRecord;
  const organizationId = options.organizationId || LEGACY_APP_STATE_ORGANIZATION_ID;
  let profiles;
  let medical;
  try {
    [profiles, medical] = await Promise.all([
      options.playerProfilesState
        ? Promise.resolve(null)
        : reader(PLAYER_PROFILES_KEY, organizationId),
      reader(MEDICAL_TEAM_KEY, organizationId),
    ]);
  } catch {
    return { ok: false, status: 503, reason: "Player availability could not be verified." };
  }
  if ((!options.playerProfilesState && (!profiles?.ok || !profiles.entry || profiles.entry.removed))
    || !medical?.ok || !medical.entry || medical.entry.removed) {
    return { ok: false, status: 503, reason: "Player availability could not be verified." };
  }
  return {
    ok: true,
    playerProfilesState: options.playerProfilesState || parseState(profiles?.entry?.value),
    medicalState: parseState(medical?.entry?.value),
  };
}

module.exports = {
  buildAvailabilityByPlayer,
  classifyAvailability,
  createAvailabilityIndex,
  findUnavailableAwardPlayerIds,
  getPlayerAvailabilityForDate,
  readLeaderboardAvailabilitySources,
};
