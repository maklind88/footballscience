const { createHash } = require("node:crypto");

const SOURCE_KEY = "nc-courage-sop-v1";
const SOURCE_URL = "https://nc-courage-sop-performance.thomasharris4.chatgpt.site/api/dashboard-data";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_EVENTS = 50000;
const STAFF_ROLES = ["admin", "club-admin", "team-admin", "coach", "analyst"];
const CATEGORIES = ["Zone 2", "Zone 3", "Zone 3.5", "Passing Zone", "Shooting Zone"];

function fail(reason, status = 422) {
  throw Object.assign(new Error(reason), { status });
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`Invalid ${label}.`);
  return value;
}
function text(value, label, max = 160, optional = false) {
  if (optional && value == null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008]/.test(value)) fail(`Invalid ${label}.`);
  if (/^(?:data:|blob:|file:|\/(?:Users|home|private|tmp)\/|[A-Z]:\\)/i.test(value)) fail(`Unsupported ${label}.`);
  return value.trim();
}
function number(value, label, max = 1000000, integer = true) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) fail(`Invalid ${label}.`);
  return value;
}
function list(value, label, max) {
  if (!Array.isArray(value) || value.length > max) fail(`Invalid ${label}.`);
  return value;
}
function choice(value, values, label) {
  if (!values.includes(value)) fail(`Unsupported ${label}. Review the source format before importing.`);
  return value;
}
function names(value, label, max = 30) {
  const result = list(value, label, max).map((name) => text(name, label));
  if (new Set(result).size !== result.length) fail(`Duplicate ${label}.`);
  return result.sort();
}
function matchReference(row, matches) {
  const match = matches.get(row.matchNumber);
  if (!match || row.opponent !== match.opponent || row.homeAway !== match.homeAway) fail("Inconsistent match identity.");
  return match;
}
function normalizeMatches(rows) {
  return list(rows, "matches", 300).map((row) => {
    object(row, "match");
    const result = {
      matchNumber: number(row.matchNumber, "match number", 100000),
      opponent: text(row.opponent, "opponent"),
      homeAway: choice(row.homeAway, ["Home", "Away"], "venue"),
      sourceRows: number(row.sourceRows, "source row count"),
      cleanEvents: number(row.cleanEvents, "event count"),
      excludedRows: number(row.excludedRows, "excluded row count"),
    };
    if (!result.matchNumber || result.cleanEvents + result.excludedRows !== result.sourceRows) fail("Inconsistent match row counts.");
    return result;
  }).sort((a, b) => a.matchNumber - b.matchNumber);
}
function normalizeEvent(row, matches) {
  object(row, "event");
  const match = matchReference(row, matches);
  if (typeof row.hasNoClearTarget !== "boolean") fail("Invalid target attribution.");
  return {
    id: text(row.id, "event ID", 120), matchNumber: match.matchNumber,
    opponent: match.opponent, homeAway: match.homeAway,
    eventCategory: choice(row.eventCategory, CATEGORIES, "event category"),
    outcome: choice(row.outcome, ["Attempted", "Completed"], "outcome"),
    ballCarrierEntryMethod: row.ballCarrierEntryMethod == null ? null : choice(row.ballCarrierEntryMethod, ["Pass", "Carry", "Regain"], "entry method"),
    ballCarriers: names(row.ballCarriers, "ball carriers"),
    receivingPlayers: names(row.receivingPlayers, "receiving players"),
    hasNoClearTarget: row.hasNoClearTarget,
    gameMinute: row.gameMinute == null ? null : number(row.gameMinute, "game minute", 200, false),
    period: choice(row.period, ["1st Half", "2nd Half"], "period"),
    periodThird: text(row.periodThird, "period third", 40, true),
    passFromZoneTags: names(row.passFromZoneTags, "zone tags", 20),
    progressFromCorridor: text(row.progressFromCorridor, "from corridor", 80, true),
    progressIntoCorridor: text(row.progressIntoCorridor, "into corridor", 80, true),
    timeBasis: text(row.timeBasis, "time basis", 100),
    playerAttributionStatus: text(row.playerAttributionStatus, "attribution status", 80),
    playerAttributionNote: text(row.playerAttributionNote, "attribution note", 2000, true),
  };
}
function normalizeMinutes(value, matches) {
  object(value, "player minutes");
  const rows = list(value.matches, "minute matches", 300).map((row) => {
    if (!matches.has(row.matchNumber)) fail("Unknown playing-time match.");
    if (!/^[a-f0-9]{64}$/.test(row.sourceSha256)) fail("Invalid minutes provenance.");
    return {
      matchNumber: row.matchNumber,
      statsbombMatchId: number(row.statsbombMatchId, "StatsBomb match ID", Number.MAX_SAFE_INTEGER),
      sourceFile: text(row.sourceFile, "source filename", 240), sourceSha256: row.sourceSha256,
      intervals: list(row.intervals, "playing intervals", 500).map((item) => {
        const start = number(item.start, "interval start", 200, false);
        const end = number(item.end, "interval end", 200, false);
        if (end < start) fail("Invalid playing interval.");
        return { playerId: text(String(item.playerId), "provider player ID", 80), name: text(item.name, "player name"),
          period: choice(item.period, ["1st Half", "2nd Half"], "playing period"), start, end };
      }).sort((a, b) => a.playerId.localeCompare(b.playerId) || a.period.localeCompare(b.period) || a.start - b.start),
    };
  }).sort((a, b) => a.matchNumber - b.matchNumber);
  if (new Set(rows.map((row) => row.matchNumber)).size !== rows.length) fail("Duplicate playing-time matches.");
  return { rule: text(value.rule, "playing time rule", 1000), matches: rows };
}

function normalizeDataset(payload) {
  const data = object(object(payload, "payload").dashboardData, "dashboard data");
  const matches = normalizeMatches(data.matches);
  if (!matches.length) fail("Empty datasets cannot replace saved statistics.");
  const byMatch = new Map(matches.map((row) => [row.matchNumber, row]));
  if (byMatch.size !== matches.length) fail("Duplicate match numbers.");
  const events = list(data.events, "events", MAX_EVENTS).map((row) => normalizeEvent(row, byMatch)).sort((a, b) => a.id.localeCompare(b.id));
  if (!events.length || new Set(events.map((row) => row.id)).size !== events.length) fail("Empty or duplicate events.");
  const counts = new Map();
  for (const row of events) counts.set(row.matchNumber, (counts.get(row.matchNumber) || 0) + 1);
  if (matches.some((row) => row.cleanEvents !== (counts.get(row.matchNumber) || 0))) fail("Event counts do not match the match manifest.");
  const gameStates = list(data.gameStates, "game states", 5000).map((row) => {
    const match = matchReference(row, byMatch);
    return { matchNumber: match.matchNumber, opponent: match.opponent, homeAway: match.homeAway,
      startMinute: number(row.startMinute, "score time", 200, false), ncScore: number(row.ncScore, "team score", 50),
      opponentScore: number(row.opponentScore, "opponent score", 50), note: text(row.note, "score note", 1000, true) };
  }).sort((a, b) => a.matchNumber - b.matchNumber || a.startMinute - b.startMinute);
  const stateKeys = gameStates.map((row) => `${row.matchNumber}:${row.startMinute}`);
  if (new Set(stateKeys).size !== stateKeys.length) fail("Ambiguous score timeline.");
  const playerOptions = [...new Set(events.flatMap((row) => [...row.ballCarriers, ...row.receivingPlayers]))].sort();
  if (playerOptions.length > 500) fail("Too many distinct players for this team dataset.");
  const manifest = { schemaVersion: 1, sourceKey: SOURCE_KEY, matches, gameStates, playerOptions, playerMinutes: normalizeMinutes(payload.playerMinutes, byMatch) };
  const hash = createHash("sha256").update(JSON.stringify({ manifest, events })).digest("hex");
  const generated = text(data.generatedAt, "source generation time", 60);
  if (!Number.isFinite(Date.parse(generated))) fail("Invalid source generation time.");
  return { manifest, events, hash, generatedAt: new Date(generated).toISOString(),
    summary: { matchCount: matches.length, eventCount: events.length, completed: events.filter((row) => row.outcome === "Completed").length } };
}

async function fetchDataset(fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(SOURCE_URL, { redirect: "error", signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) fail("Statistics source is unavailable or changed format.", 502);
    if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) fail("Statistics source exceeds the import limit.", 413);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_SOURCE_BYTES) { controller.abort(); fail("Statistics source exceeds the import limit.", 413); }
      chunks.push(Buffer.from(chunk));
    }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { fail("Statistics source returned invalid JSON.", 502); }
    return normalizeDataset(payload);
  } catch (error) {
    if (error.status) throw error;
    fail("Could not read the statistics source. Saved data has not changed.", 502);
  } finally { clearTimeout(timer); }
}

module.exports = { SOURCE_KEY, SOURCE_URL, MAX_SOURCE_BYTES, MAX_EVENTS, STAFF_ROLES, CATEGORIES, fail, normalizeDataset, fetchDataset };
