import {
  cloneGameplanState,
  createGameplanFromMatch,
  gameplanActiveTabs,
  gameplanEvidenceConfidenceOptions,
  gameplanObservationStatusOptions,
  gameplanPhaseKeys,
  gameplanPhaseLabels,
  gameplanPlanModes,
  gameplanScenarioStatusOptions,
  gameplanStatusOptions,
  getActiveGameplan,
  getGameplanMatchLabel,
} from "./gameplan-state.js";
import { confirmPlatformAction } from "./src/core/platform-confirm-dialog.mjs";

const gameplanStorageKey = "football-gameplan-v1";
const scheduleStorageKey = "football-schedule-v1";
const playerProfilesStorageKey = "football-player-profiles-v1";
const sessionPlannerStorageKey = "football-session-planner-v3";
const periodizationStorageKey = "football-periodization-v2";
const scoutingStorageKey = "football-scouting-v1";
const scoutingImportedDatabaseStorageKey = "football-scouting-imported-database-v1";
const scoutingImportLastUploadStorageKey = "football-scouting-last-import-summary-v1";
const scoutingDurableStateStorageKey = "football-scouting-durable-state-v1";
const analysisEvidenceStorageKeys = Object.freeze(["football-analysis-room-v1", "football-analysis-v1", "football-match-analysis-v1"]);
let activeContext = null;
let gameplanState = null;
let signedPlayerBriefState = { token: "", status: "idle", payload: null, reason: "" };
let signedPlayerBriefPromise = null;
const gameplanEditableFields = new Set([
  "status",
  "summary.objective",
  "summary.matchStory",
  "summary.nonNegotiables",
  "tactical.inPossession",
  "tactical.outOfPossession",
  "tactical.attackingTransition",
  "tactical.defensiveTransition",
  "tactical.setPieces",
  "opponentPlan.shape",
  "opponentPlan.threats",
  "opponentPlan.weakZones",
  "opponentPlan.keyPlayers",
  "opponentPlan.pressingCues",
  "opponentPlan.setPieces",
  "playerBrief.headline",
  "playerBrief.message",
  "playerBrief.focus",
  "playerBrief.positionGroupFocus",
  "playerBrief.individualFocus",
  "playerBrief.phases.inPossession",
  "playerBrief.phases.outOfPossession",
  "playerBrief.phases.attackingTransition",
  "playerBrief.phases.defensiveTransition",
  "playerBrief.phases.setPieces",
  "meeting.agenda",
  "meeting.decisions",
  "live.halftime.keyMessage",
  "live.halftime.adjustments",
  "live.halftime.risks",
  "review.outcome",
  "review.planWorked",
  "review.lessons",
  "review.trainingCarryover",
  "review.scoutingCarryover",
  "lineup.formation",
  "matchFocus.phasePrinciples.inPossession",
  "matchFocus.phasePrinciples.outOfPossession",
  "matchFocus.phasePrinciples.attackingTransition",
  "matchFocus.phasePrinciples.defensiveTransition",
  "matchFocus.phasePrinciples.setPieces",
]);
const gameplanEditableFieldPrefixes = ["playerBrief.individualNotes."];

function setContext(context = {}) {
  activeContext = context;
  gameplanState = cloneGameplanState(readGameplanState(), { currentUser: activeContext.currentUser || {} });
}

function rerenderGameplan() {
  render(activeContext || {});
}

function escapeHtml(value) {
  if (typeof activeContext?.escapeHtml === "function") {
    return activeContext.escapeHtml(value);
  }
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getState() {
  if (!gameplanState) {
    gameplanState = cloneGameplanState(readGameplanState(), { currentUser: activeContext?.currentUser || {} });
  }
  return gameplanState;
}

function readStorageJson(key = "") {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function getScheduleMatches() {
  const events = (activeContext?.getScheduleState?.() || readStorageJson(scheduleStorageKey)).events || [];
  const seen = new Set();
  const unique = [];
  for (const event of events) {
    const key = event?.id || `${event?.date || ""}:${event?.time || ""}:${event?.title || ""}`;
    if (!event || seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return unique
    .filter((event) => event.type === "match")
    .sort((a, b) => {
      const futureA = a.date >= todayValue ? 0 : 1;
      const futureB = b.date >= todayValue ? 0 : 1;
      if (futureA !== futureB) return futureA - futureB;
      return `${a.date || ""} ${a.time || ""} ${a.title || ""}`.localeCompare(`${b.date || ""} ${b.time || ""} ${b.title || ""}`);
    })
    .map((event) => ({
      id: event.id,
      title: event.title || "Match",
      opponent: event.title || "Match",
      date: event.date,
      time: event.time,
      venue: event.location || event.venue || "",
      competition: event.competition || "",
    }));
}

function getSquadPlayers() {
  const players = (activeContext?.getPlayerProfilesState?.() || readStorageJson(playerProfilesStorageKey)).players || [];
  return players
    .filter((player) => player?.id && player?.name && player.countsInSquad !== false)
    .map((player) => ({
      id: player.id,
      name: player.name,
      number: player.number || player.jerseyNumber || "",
      position: player.position || player.primaryRole || "",
      roleGroup: player.roleGroup || "",
    }));
}

function parseGameplanDate(value = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatGameplanDateValue(date = null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addGameplanDays(date = null, days = 0) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getGameplanPreparationDates(plan = {}, lookbackDays = 6) {
  const matchDate = parseGameplanDate(plan.date);
  if (!matchDate) return [];
  return Array.from({ length: lookbackDays }, (_, index) => formatGameplanDateValue(addGameplanDays(matchDate, index - lookbackDays))).filter(Boolean);
}

function splitPrincipleText(value = "") {
  return String(value || "")
    .split(/\n|;|,|\u2022|\|/)
    .map((item) => item.replace(/^[-\d.)\s]+/, "").trim())
    .filter((item) => item.length >= 3);
}

function uniqueGameplanTexts(values = [], limit = 8) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || "").trim();
    const key = normalizeSearchText(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function getGameplanPhaseKeyFromText(value = "") {
  const text = normalizeSearchText(value);
  if (text.includes("set piece") || text.includes("corner") || text.includes("throw") || text.includes("goalkick") || text.includes("free kick")) {
    return "setPieces";
  }
  if (
    text.includes("defensive transition") ||
    text.includes("counter press") ||
    text.includes("counter-press") ||
    text.includes("after loss") ||
    text.includes("loss")
  ) {
    return "defensiveTransition";
  }
  if (
    text.includes("attacking transition") ||
    text.includes("counter attack") ||
    text.includes("counter-attack") ||
    text.includes("regain") ||
    text.includes("after winning")
  ) {
    return "attackingTransition";
  }
  if (text.includes("out of possession") || text.includes("defend") || text.includes("press") || text.includes("block")) {
    return "outOfPossession";
  }
  if (
    text.includes("in possession") ||
    text.includes("build") ||
    text.includes("final third") ||
    text.includes("attack") ||
    text.includes("possession")
  ) {
    return "inPossession";
  }
  return "";
}

function getPhaseBucketForPrinciple(entry = {}) {
  return getGameplanPhaseKeyFromText([entry.phase, entry.subPhase, entry.principle, entry.focus, entry.title].join(" ")) || "inPossession";
}

function getGameplanWeekFocusSources(plan = {}) {
  const dates = new Set(getGameplanPreparationDates(plan));
  const sessionState = readStorageJson(sessionPlannerStorageKey);
  const periodizationState = readStorageJson(periodizationStorageKey);
  const sources = [];

  Object.entries(sessionState.sessions || {}).forEach(([dateValue, session]) => {
    if (!dates.has(dateValue)) return;
    (Array.isArray(session?.blocks) ? session.blocks : []).forEach((block) => {
      const phase = [block.phase, block.subPhase].filter(Boolean).join(" / ");
      splitPrincipleText(block.principles || block.focus || block.objective).forEach((principle) => {
        sources.push({
          date: dateValue,
          phase,
          subPhase: block.subPhase || "",
          principle,
          focus: block.focus || "",
          title: block.title || "",
          source: "Session Planner",
        });
      });
    });
  });

  Object.entries(periodizationState.days || {}).forEach(([dateValue, day]) => {
    if (!dates.has(dateValue)) return;
    const phase = [...(Array.isArray(day.matchPhases) ? day.matchPhases : []), ...(Array.isArray(day.subPhases) ? day.subPhases : [])].join(" / ");
    (Array.isArray(day.teamPrinciples) ? day.teamPrinciples : []).forEach((principle) => {
      sources.push({ date: dateValue, phase, principle, source: "Periodization" });
    });
    (Array.isArray(day.miniGamePrinciples) ? day.miniGamePrinciples : []).forEach((principle) => {
      sources.push({ date: dateValue, phase, principle, isMiniGame: true, source: "Periodization" });
    });
  });

  return sources;
}

function buildGameplanWeekFocusSuggestion(plan = {}) {
  const sources = getGameplanWeekFocusSources(plan);
  const phasePrinciples = gameplanPhaseKeys.reduce((map, key) => {
    const phaseTexts = sources.filter((entry) => !entry.isMiniGame && getPhaseBucketForPrinciple(entry) === key).map((entry) => entry.principle);
    map[key] = uniqueGameplanTexts(phaseTexts, 5).join("\n");
    return map;
  }, {});
  const unplacedPrinciples = sources.filter((entry) => !entry.isMiniGame && !phasePrinciples[getPhaseBucketForPrinciple(entry)]).map((entry) => entry.principle);
  if (!Object.values(phasePrinciples).some(Boolean) && unplacedPrinciples.length) {
    phasePrinciples.inPossession = uniqueGameplanTexts(unplacedPrinciples, 5).join("\n");
  }
  const miniGamePrinciples = uniqueGameplanTexts(
    [
      ...sources.filter((entry) => entry.isMiniGame).map((entry) => entry.principle),
      ...sources
        .filter((entry) => !entry.isMiniGame && /mini|game|constraint|duel|wave|rondo/i.test([entry.title, entry.focus, entry.subPhase].join(" ")))
        .map((entry) => entry.principle),
    ],
    6
  ).map((principle, index) => ({
    id: createGameplanLocalId("mini"),
    principle,
    phase: sources.find((entry) => entry.principle === principle)?.phase || "",
    playerIds: [],
    source: sources.find((entry) => entry.principle === principle)?.source || "Week focus",
    sortIndex: index,
  }));
  const dates = [...new Set(sources.map((entry) => entry.date).filter(Boolean))].sort();
  return {
    sourceGeneratedAt: new Date().toISOString(),
    sourceWindow: dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : "",
    phasePrinciples,
    miniGamePrinciples,
  };
}

function getGameplanWeekFocus(plan = {}) {
  return {
    sourceGeneratedAt: plan.matchFocus?.sourceGeneratedAt || "",
    sourceWindow: plan.matchFocus?.sourceWindow || "",
    phasePrinciples: gameplanPhaseKeys.reduce((map, key) => {
      map[key] = String(plan.matchFocus?.phasePrinciples?.[key] || plan.tactical?.[key] || "").trim();
      return map;
    }, {}),
    miniGamePrinciples: Array.isArray(plan.matchFocus?.miniGamePrinciples) ? plan.matchFocus.miniGamePrinciples : [],
  };
}

function asGameplanObject(value = null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asGameplanArray(value = null) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function normalizeEvidenceText(value = "", maxLength = 240) {
  if (value === null || value === undefined || typeof value === "object") {
    return "";
  }
  return String(value).trim().slice(0, maxLength);
}

function firstEvidenceText(values = [], maxLength = 240) {
  for (const value of values) {
    const text = normalizeEvidenceText(value, maxLength);
    if (text) return text;
  }
  return "";
}

function getEvidenceUrl(entry = {}) {
  const source = asGameplanObject(entry);
  return firstEvidenceText(
    [
      source.url,
      source.link,
      source.href,
      source.clipUrl,
      source.videoUrl,
      source.imageUrl,
      source.fileUrl,
      source.mediaUrl,
      source.assetUrl,
      source.signedUrl,
      source.downloadUrl,
    ],
    1000
  );
}

function getEvidenceMediaType(entry = {}, fallback = "data") {
  const source = asGameplanObject(entry);
  const explicit = firstEvidenceText([source.mediaType, source.assetType, source.type, source.kind], 80).toLowerCase();
  if (explicit.includes("clip") || explicit.includes("video")) return "clip";
  if (explicit.includes("image") || explicit.includes("photo") || explicit.includes("frame")) return "image";
  if (explicit.includes("report") || explicit.includes("memo")) return "report";
  if (explicit.includes("data") || explicit.includes("metric")) return "data";
  const url = getEvidenceUrl(source).toLowerCase();
  if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(url)) return "clip";
  if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(url)) return "image";
  if (/\.(pdf|docx?|pptx?)(\?|$)/.test(url)) return "report";
  return fallback;
}

function getEvidenceOpenLabel(item = {}) {
  const mediaType = normalizeEvidenceText(item.mediaType, 40).toLowerCase();
  if (mediaType === "clip") return "Open clip";
  if (mediaType === "image") return "Open image";
  if (mediaType === "report") return "Open report";
  return "Open source";
}

function getPlanEvidenceSearchTerms(plan = {}) {
  return [
    plan.matchEventId,
    plan.opponent,
    plan.title,
    plan.date,
    plan.competition,
    plan.venue,
  ]
    .map((value) => normalizeSearchText(value).trim())
    .filter((value) => value.length >= 3);
}

function evidenceTextMatchesPlan(value = "", plan = {}) {
  const text = normalizeSearchText(value);
  return getPlanEvidenceSearchTerms(plan).some((term) => text.includes(term));
}

function createEvidenceCandidate(candidate = {}) {
  const linkedSourceType = normalizeEvidenceText(candidate.linkedSourceType || candidate.sourceType || "manual", 80).toLowerCase();
  const linkedSourceId = normalizeEvidenceText(candidate.linkedSourceId || candidate.sourceId, 220);
  const title = firstEvidenceText([candidate.title, candidate.name, candidate.label, candidate.source], 180);
  const source = firstEvidenceText([candidate.source, candidate.sourceLabel, candidate.linkedSourceLabel], 120);
  const note = firstEvidenceText([candidate.note, candidate.summary, candidate.description], 700);
  const url = normalizeEvidenceText(candidate.url, 1000);
  const sourceRef = normalizeEvidenceText(candidate.sourceRef, 260);
  if (!title && !note && !url && !linkedSourceId && !sourceRef) {
    return null;
  }
  const id = normalizeEvidenceText(
    candidate.id || `${linkedSourceType}:${linkedSourceId || sourceRef || url || title || source}`,
    260
  );
  return {
    id,
    title: title || source || "Evidence",
    source: source || "Evidence source",
    phase: normalizeEvidenceText(candidate.phase, 80),
    url,
    note,
    confidence: normalizeEvidenceConfidence(candidate.confidence),
    linkedSourceType,
    linkedSourceId,
    linkedSourceLabel: normalizeEvidenceText(candidate.linkedSourceLabel || source || linkedSourceType, 180),
    linkedWorkspace: normalizeEvidenceText(candidate.linkedWorkspace || candidate.workspaceId, 80),
    mediaType: normalizeEvidenceText(candidate.mediaType || "data", 80).toLowerCase(),
    matchEventId: normalizeEvidenceText(candidate.matchEventId, 180),
    sourceRef,
    meta: normalizeEvidenceText(candidate.meta, 220),
  };
}

function normalizeEvidenceConfidence(value = "") {
  const normalized = normalizeEvidenceText(value, 40).toLowerCase();
  if (["low", "medium", "high"].includes(normalized)) return normalized;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 4) return "high";
    if (numeric <= 2) return "low";
  }
  return "medium";
}

function getEvidenceCandidateKey(candidate = {}) {
  const type = normalizeEvidenceText(candidate.linkedSourceType || candidate.sourceType, 80).toLowerCase();
  const id = normalizeEvidenceText(candidate.linkedSourceId || candidate.sourceId, 220);
  if (type && id) return `${type}:${id}`;
  const sourceRef = normalizeEvidenceText(candidate.sourceRef, 260);
  if (sourceRef) return sourceRef;
  const url = normalizeEvidenceText(candidate.url, 1000);
  if (url) return `url:${url}`;
  return normalizeSearchText([candidate.title, candidate.source, candidate.note].join(":"));
}

function dedupeEvidenceCandidates(candidates = []) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates.filter(Boolean)) {
    const key = getEvidenceCandidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function isEvidenceCandidateLinked(plan = {}, candidate = {}) {
  const candidateKey = getEvidenceCandidateKey(candidate);
  return (plan.evidence || []).some((item) => {
    if (candidateKey && getEvidenceCandidateKey(item) === candidateKey) return true;
    return Boolean(candidate.url && item.url && item.url === candidate.url);
  });
}

function buildEvidenceCandidateFromObject(entry = {}, defaults = {}, index = 0) {
  const source = typeof entry === "string" ? { url: entry } : asGameplanObject(entry);
  const title = firstEvidenceText(
    [source.title, source.name, source.label, source.fileName, source.filename, source.player, source.playerName, defaults.title],
    180
  );
  const note = firstEvidenceText([source.note, source.notes, source.summary, source.description, source.memo, source.analysis, defaults.note], 700);
  const linkedSourceId = firstEvidenceText(
    [
      source.id,
      source.clipId,
      source.assetId,
      source.reportId,
      source.recordId,
      source.sourceId,
      source.key,
      defaults.linkedSourceId,
      defaults.sourceId,
      index,
    ],
    220
  );
  const url = getEvidenceUrl(source);
  if (!title && !note && !url) {
    return null;
  }
  const mediaType = getEvidenceMediaType(source, defaults.mediaType || "data");
  return createEvidenceCandidate({
    id: `${defaults.linkedSourceType || "source"}:${linkedSourceId || url || index}`,
    title,
    source: defaults.source,
    note,
    url,
    confidence: source.confidence || defaults.confidence,
    phase: source.phase || source.phaseLabel || defaults.phase,
    linkedSourceType: defaults.linkedSourceType,
    linkedSourceId,
    linkedSourceLabel: defaults.linkedSourceLabel || defaults.source,
    linkedWorkspace: defaults.linkedWorkspace,
    mediaType,
    matchEventId: source.matchEventId || source.eventId || defaults.matchEventId,
    sourceRef: defaults.sourceRef ? `${defaults.sourceRef}#${linkedSourceId || index}` : "",
    meta: defaults.meta,
  });
}

function getScheduleEventForPlan(plan = {}) {
  const events = (activeContext?.getScheduleState?.() || readStorageJson(scheduleStorageKey)).events || [];
  const eventId = normalizeEvidenceText(plan.matchEventId, 180);
  if (eventId) {
    const match = events.find((event) => event?.id === eventId);
    if (match) return match;
  }
  return events.find((event) => event?.type === "match" && event?.date === plan.date && evidenceTextMatchesPlan(event?.title, plan)) || null;
}

function getMatchMediaEvidenceCandidates(plan = {}) {
  const event = getScheduleEventForPlan(plan);
  if (!event) return [];
  const directMedia = ["url", "clipUrl", "videoUrl", "imageUrl", "fileUrl", "mediaUrl", "analysisUrl"].some((key) => event[key])
    ? [event]
    : [];
  const entries = [
    ...directMedia,
    ...asGameplanArray(event.clips),
    ...asGameplanArray(event.media),
    ...asGameplanArray(event.attachments),
    ...asGameplanArray(event.images),
    ...asGameplanArray(event.matchImages),
    ...asGameplanArray(event.matchFrames),
    ...asGameplanArray(event.analysisAssets),
  ];
  return entries
    .map((entry, index) =>
      buildEvidenceCandidateFromObject(entry, {
        source: "Match media",
        title: event.title || plan.title || "Match media",
        note: event.description || event.notes || "",
        linkedSourceType: "match-media",
        linkedWorkspace: "schedule",
        mediaType: "clip",
        matchEventId: event.id || plan.matchEventId,
        sourceRef: `${scheduleStorageKey}:${event.id || plan.matchEventId || "match"}`,
      }, index)
    )
    .filter(Boolean);
}

function getAnalysisEvidenceCandidates(plan = {}) {
  const candidates = [];
  const buckets = ["evidence", "clips", "clipLibrary", "videos", "images", "matchImages", "frames", "reports", "analysis", "assets"];
  for (const key of analysisEvidenceStorageKeys) {
    const state = readStorageJson(key);
    for (const bucket of buckets) {
      asGameplanArray(state?.[bucket]).forEach((entry, index) => {
        const candidate = buildEvidenceCandidateFromObject(entry, {
          source: "Analysis Room",
          linkedSourceType: "analysis",
          linkedWorkspace: "analysis-room",
          mediaType: bucket.includes("image") || bucket.includes("frame") ? "image" : bucket.includes("report") ? "report" : "clip",
          matchEventId: plan.matchEventId,
          sourceRef: `${key}:${bucket}`,
        }, index);
        if (!candidate) return;
        const matchText = [candidate.title, candidate.note, candidate.meta, candidate.matchEventId].join(" ");
        if (!candidate.matchEventId || candidate.matchEventId === plan.matchEventId || evidenceTextMatchesPlan(matchText, plan)) {
          candidates.push(candidate);
        }
      });
    }
  }
  asGameplanArray(window.__footballScienceGameplanEvidenceSources).forEach((entry, index) => {
    const candidate = buildEvidenceCandidateFromObject(entry, {
      source: "Analysis Room",
      linkedSourceType: "analysis",
      linkedWorkspace: "analysis-room",
      mediaType: "clip",
      matchEventId: plan.matchEventId,
      sourceRef: "window:__footballScienceGameplanEvidenceSources",
    }, index);
    if (candidate) candidates.push(candidate);
  });
  return candidates;
}

function getScoutingRecordField(record = {}, key = "") {
  if (Array.isArray(record)) {
    const indexes = {
      id: 0,
      player: 1,
      team: 2,
      league: 4,
      season: 5,
      position: 6,
      age: 7,
      matches: 8,
      minutes: 9,
      sourceSystem: 15,
      imageUrl: 18,
    };
    return record[indexes[key]];
  }
  return record?.[key] || record?.[key === "player" ? "name" : key] || "";
}

function createScoutingRecordCandidate(record = {}, plan = {}, index = 0) {
  const id = firstEvidenceText([getScoutingRecordField(record, "id"), `record-${index}`], 160);
  const player = firstEvidenceText([getScoutingRecordField(record, "player")], 160);
  const team = firstEvidenceText([getScoutingRecordField(record, "team")], 120);
  const position = firstEvidenceText([getScoutingRecordField(record, "position")], 80);
  const season = firstEvidenceText([getScoutingRecordField(record, "season")], 80);
  const minutes = firstEvidenceText([getScoutingRecordField(record, "minutes")], 40);
  const imageUrl = firstEvidenceText([getScoutingRecordField(record, "imageUrl")], 1000);
  return createEvidenceCandidate({
    id: `scouting-data:${id}`,
    title: [player, position].filter(Boolean).join(" · ") || team || "Scouting data",
    source: "Scouting data",
    note: [team, season, minutes ? `${minutes} minutes` : ""].filter(Boolean).join(" · "),
    url: imageUrl,
    confidence: "medium",
    linkedSourceType: "scouting",
    linkedSourceId: id,
    linkedSourceLabel: "Scouting data",
    linkedWorkspace: "scouting",
    mediaType: imageUrl ? "image" : "data",
    matchEventId: plan.matchEventId,
    sourceRef: `${scoutingImportedDatabaseStorageKey}#${id}`,
  });
}

function getScoutingEvidenceCandidates(plan = {}) {
  const state = readStorageJson(scoutingStorageKey);
  const durable = readStorageJson(scoutingDurableStateStorageKey);
  const importSummary = readStorageJson(scoutingImportLastUploadStorageKey);
  const importedDatabase = readStorageJson(scoutingImportedDatabaseStorageKey);
  const candidates = [];

  asGameplanArray(state.reports).forEach((report, index) => {
    const reportText = [report.title, report.summary, report.type].join(" ");
    const isOpposition = normalizeSearchText(report.type).includes("opposition");
    if (!isOpposition && !evidenceTextMatchesPlan(reportText, plan) && index > 5) return;
    candidates.push(
      createEvidenceCandidate({
        id: `scouting-report:${report.id || index}`,
        title: report.title || "Scouting report",
        source: report.type === "opposition" ? "Opposition report" : "Scouting report",
        note: report.summary || report.recommendation || "",
        confidence: report.confidence,
        linkedSourceType: "scouting",
        linkedSourceId: report.id || `report-${index}`,
        linkedSourceLabel: report.type === "opposition" ? "Opposition report" : "Scouting report",
        linkedWorkspace: "scouting",
        mediaType: "report",
        matchEventId: plan.matchEventId,
        sourceRef: `${scoutingStorageKey}:reports#${report.id || index}`,
      })
    );
  });

  asGameplanArray(state.targets).forEach((target, index) => {
    candidates.push(
      createEvidenceCandidate({
        id: `scouting-target:${target.id || index}`,
        title: [target.name, target.position].filter(Boolean).join(" · ") || "Scouting target",
        source: "Scouting target",
        note: target.notes || target.nextAction || target.fit || "",
        confidence: target.priority === "urgent" || target.priority === "high" ? "high" : "medium",
        linkedSourceType: "scouting",
        linkedSourceId: target.id || target.recordId || `target-${index}`,
        linkedSourceLabel: "Scouting target",
        linkedWorkspace: "scouting",
        mediaType: "data",
        matchEventId: plan.matchEventId,
        sourceRef: `${scoutingStorageKey}:targets#${target.id || index}`,
      })
    );
  });

  [...asGameplanArray(state.savedViews), ...asGameplanArray(durable.savedViews)].forEach((view, index) => {
    if (!evidenceTextMatchesPlan([view.name, view.description, view.query].join(" "), plan) && index > 3) return;
    candidates.push(
      createEvidenceCandidate({
        id: `scouting-view:${view.id || index}`,
        title: view.name || "Scouting view",
        source: "Scouting view",
        note: view.description || view.query || "",
        confidence: "medium",
        linkedSourceType: "scouting",
        linkedSourceId: view.id || `view-${index}`,
        linkedSourceLabel: "Scouting view",
        linkedWorkspace: "scouting",
        mediaType: "data",
        matchEventId: plan.matchEventId,
        sourceRef: `${scoutingStorageKey}:savedViews#${view.id || index}`,
      })
    );
  });

  const records = asGameplanArray(importedDatabase.records);
  const matchedRecords = [];
  for (const record of records) {
    const recordText = [
      getScoutingRecordField(record, "player"),
      getScoutingRecordField(record, "team"),
      getScoutingRecordField(record, "league"),
      getScoutingRecordField(record, "season"),
      getScoutingRecordField(record, "position"),
    ].join(" ");
    if (evidenceTextMatchesPlan(recordText, plan)) {
      matchedRecords.push(record);
    }
    if (matchedRecords.length >= 3) break;
  }
  matchedRecords.forEach((record, index) => {
    candidates.push(createScoutingRecordCandidate(record, plan, index));
  });

  if (importSummary?.status === "published" && !matchedRecords.length && candidates.length < 3) {
    candidates.push(
      createEvidenceCandidate({
        id: `scouting-import:${importSummary.updatedAt || importSummary.startedAt || "latest"}`,
        title: importSummary.fileName || "Scouting database import",
        source: "Scouting data",
        note: `${importSummary.rowCount || 0} rows · ${importSummary.metricCount || 0} metrics`,
        confidence: "medium",
        linkedSourceType: "scouting",
        linkedSourceId: importSummary.updatedAt || importSummary.startedAt || "latest-import",
        linkedSourceLabel: "Scouting data",
        linkedWorkspace: "scouting",
        mediaType: "data",
        matchEventId: plan.matchEventId,
        sourceRef: scoutingImportLastUploadStorageKey,
      })
    );
  }

  return candidates;
}

function getGameplanEvidenceSourceCandidates(plan = {}) {
  return dedupeEvidenceCandidates([
    ...getMatchMediaEvidenceCandidates(plan),
    ...getAnalysisEvidenceCandidates(plan),
    ...getScoutingEvidenceCandidates(plan),
  ]).slice(0, 12);
}

function getPlan() {
  return getActiveGameplan(getState());
}

function ensureSeedGameplan() {
  const state = getState();
  state.gameplans = Array.isArray(state.gameplans) ? state.gameplans : [];
  if (state.gameplans.length) return;
  const match = getScheduleMatches()[0];
  if (!match) return;
  const plan = createGameplanFromMatch(match, { currentUser: activeContext?.currentUser || null });
  const suggestion = buildGameplanWeekFocusSuggestion(plan);
  plan.matchFocus = {
    ...(plan.matchFocus || {}),
    ...suggestion,
    miniGamePrinciples: assignMiniGamePrinciplesToPlayers(suggestion.miniGamePrinciples || [], plan),
  };
  state.gameplans.push(plan);
  state.activeGameplanId = plan.id;
  state.activeTab = "plan";
  state.planMode = "briefing";
  writeGameplanState({ syncCentral: false });
}

function getPlanById(planId = "") {
  const plans = Array.isArray(getState().gameplans) ? getState().gameplans : [];
  return plans.find((plan) => plan.id === planId && !plan.archivedAt) || null;
}

function getPlayerById(playerId = "") {
  return getSquadPlayers().find((player) => player.id === playerId) || null;
}

function canEditPlan(plan = getPlan()) {
  return activeContext?.canEdit?.() === true && plan?.status !== "locked";
}

function canEditWorkspace() {
  return activeContext?.canEdit?.() === true;
}

function canDeleteGameplan() {
  return activeContext?.canDelete?.() === true;
}

function formatDate(value = "") {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatTimestamp(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isLocalRuntime() {
  const host = window.location?.hostname || "";
  return (
    window.location?.protocol === "file:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

function getPlayerBriefUrl(planId = "", playerId = "") {
  if (typeof activeContext?.getPlayerBriefUrl === "function") {
    return activeContext.getPlayerBriefUrl(planId, playerId);
  }
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("workspace", "gameplan");
    url.searchParams.set("playerBrief", "1");
    url.searchParams.set("gameplan", String(planId || ""));
    url.searchParams.set("player", String(playerId || ""));
    return url.toString();
  } catch {
    return `?workspace=gameplan&playerBrief=1&gameplan=${encodeURIComponent(String(planId || ""))}&player=${encodeURIComponent(String(playerId || ""))}`;
  }
}

function getPlayerBriefRoute() {
  try {
    const params = new URLSearchParams(window.location.search);
    const isPlayerBriefRoute = params.get("workspace") === "player-brief" || params.get("playerBrief") === "1";
    if (!isPlayerBriefRoute) return null;
    return {
      active: true,
      token: String(params.get("token") || params.get("briefToken") || "").trim(),
      planId: String(params.get("gameplan") || params.get("plan") || "").trim(),
      playerId: String(params.get("player") || "").trim(),
    };
  } catch {
    return null;
  }
}

function requiresSignedPlayerBriefLinks() {
  if (typeof activeContext?.requiresSignedPlayerBriefLinks === "function") {
    return activeContext.requiresSignedPlayerBriefLinks() === true;
  }
  return !isLocalRuntime();
}

async function parsePlayerBriefApiResponse(response) {
  const responseText = await response.text();
  let payload = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { reason: responseText.slice(0, 240) };
    }
  }
  if (!response.ok || payload?.ok === false) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.reason || payload?.message || `Player Brief API failed (${response.status}).`,
    };
  }
  return { ok: true, status: response.status, payload };
}

async function requestSignedPlayerBrief(token, payload = null) {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) {
    return { ok: false, reason: "Missing secure Player Brief token." };
  }
  try {
    const response = await fetch(
      `/api/gameplan-player-brief?token=${encodeURIComponent(playerBriefToken)}`,
      payload
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, token: playerBriefToken }),
            cache: "no-store",
          }
        : { cache: "no-store" }
    );
    return parsePlayerBriefApiResponse(response);
  } catch (error) {
    return { ok: false, reason: error?.message || "Could not open secure Player Brief." };
  }
}

async function createSignedPlayerBriefLink(planId = "", playerId = "") {
  const fallbackUrl = getPlayerBriefUrl(planId, playerId);
  if (!requiresSignedPlayerBriefLinks()) {
    return { ok: true, signed: false, url: fallbackUrl };
  }
  const token = await activeContext?.getAuthToken?.();
  if (!token) {
    return { ok: false, reason: "Sign in again before creating a secure Player Brief link." };
  }
  try {
    const response = await fetch("/api/gameplan-player-brief", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "sign",
        planId,
        playerId,
      }),
      cache: "no-store",
    });
    const result = await parsePlayerBriefApiResponse(response);
    if (!result.ok) return result;
    return {
      ok: true,
      signed: true,
      url: result.payload.url || "",
      expiresAt: result.payload.expiresAt || "",
    };
  } catch (error) {
    return { ok: false, reason: error?.message || "Could not create secure Player Brief link." };
  }
}

function resetSignedPlayerBriefState(token = "") {
  signedPlayerBriefState = { token: String(token || ""), status: token ? "idle" : "empty", payload: null, reason: "" };
  signedPlayerBriefPromise = null;
}

function shouldRerenderSignedPlayerBrief(token = "") {
  const route = getPlayerBriefRoute();
  return route?.active === true && route.token === token;
}

async function loadSignedPlayerBrief(token = "") {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) return;
  if (signedPlayerBriefPromise) return signedPlayerBriefPromise;

  signedPlayerBriefState = { token: playerBriefToken, status: "loading", payload: null, reason: "" };
  signedPlayerBriefPromise = requestSignedPlayerBrief(playerBriefToken)
    .then((result) => {
      if (result.ok) {
        signedPlayerBriefState = { token: playerBriefToken, status: "ready", payload: result.payload, reason: "" };
      } else {
        signedPlayerBriefState = {
          token: playerBriefToken,
          status: "error",
          payload: null,
          reason: result.reason || "This secure brief could not be opened.",
        };
      }
    })
    .finally(() => {
      signedPlayerBriefPromise = null;
      if (shouldRerenderSignedPlayerBrief(playerBriefToken)) {
        rerenderGameplan();
      }
    });
  return signedPlayerBriefPromise;
}

function getSignedPlayerBriefState(route = {}) {
  const token = String(route.token || "");
  if (signedPlayerBriefState.token !== token) {
    resetSignedPlayerBriefState(token);
  }
  if (token && signedPlayerBriefState.status === "idle") {
    loadSignedPlayerBrief(token);
  }
  return signedPlayerBriefState;
}

function updateSignedPlayerBriefPayload(token = "", payload = null) {
  const playerBriefToken = String(token || "");
  signedPlayerBriefState = { token: playerBriefToken, status: "ready", payload, reason: "" };
  if (shouldRerenderSignedPlayerBrief(playerBriefToken)) {
    rerenderGameplan();
  }
}

async function recordSignedPlayerBriefOpened(token = "") {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) return false;
  const receiptKey = `football-gameplan-player-brief-opened:${playerBriefToken}`;
  try {
    if (window.sessionStorage.getItem(receiptKey)) {
      return false;
    }
  } catch {}
  const result = await requestSignedPlayerBrief(playerBriefToken, { action: "opened" });
  if (result.ok) {
    try {
      window.sessionStorage.setItem(receiptKey, "1");
    } catch {}
    updateSignedPlayerBriefPayload(playerBriefToken, result.payload);
    return true;
  }
  return false;
}

async function acknowledgeSignedPlayerBrief(token = "") {
  const playerBriefToken = String(token || "");
  if (!playerBriefToken) return false;
  const result = await requestSignedPlayerBrief(playerBriefToken, { action: "acknowledge" });
  if (result.ok) {
    updateSignedPlayerBriefPayload(playerBriefToken, result.payload);
    return true;
  }
  return false;
}

function getBriefReceipt(plan = {}, playerId = "") {
  const receipts = plan.playerBrief?.readReceipts || {};
  return receipts[playerId] || null;
}

function getPlayerMiniGamePrinciples(plan = {}, playerId = "") {
  const normalizedPlayerId = String(playerId || "");
  if (!normalizedPlayerId) return [];
  return (Array.isArray(plan.matchFocus?.miniGamePrinciples) ? plan.matchFocus.miniGamePrinciples : [])
    .filter((item) => Array.isArray(item.playerIds) && item.playerIds.includes(normalizedPlayerId))
    .map((item) => ({
      principle: String(item.principle || "").trim().slice(0, 180),
      phase: String(item.phase || "").trim().slice(0, 80),
    }))
    .filter((item) => item.principle);
}

function getPlayerSpecificBrief(plan = {}, playerId = "") {
  const brief = plan.playerBrief || {};
  const individualNotes = brief.individualNotes && typeof brief.individualNotes === "object" ? brief.individualNotes : {};
  return {
    ...brief,
    individualFocus: individualNotes[playerId] || brief.individualFocus || "",
    miniGamePrinciples: getPlayerMiniGamePrinciples(plan, playerId),
  };
}

function readGameplanState() {
  try {
    return JSON.parse(window.localStorage.getItem(gameplanStorageKey) || "{}");
  } catch {
    return {};
  }
}

function writeGameplanState(options = {}) {
  if (!gameplanState) return;
  const shouldSyncCentral = options.syncCentral !== false;
  if (!shouldSyncCentral) activeContext?.suppressCentralWrites?.(gameplanStorageKey);
  gameplanState.updatedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(gameplanStorageKey, JSON.stringify(gameplanState));
  } finally {
    if (!shouldSyncCentral) activeContext?.unsuppressCentralWrites?.(gameplanStorageKey);
  }
}

function createGameplanLocalId(prefix = "gameplan") {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mutateActiveGameplan(mutator, options = {}) {
  const state = getState();
  const plan = getActiveGameplan(state);
  if (!plan || typeof mutator !== "function") return null;
  mutator(plan);
  plan.updatedAt = new Date().toISOString();
  writeGameplanState(options);
  return plan;
}

function setGameplanNestedField(plan = {}, path = "", value = "") {
  const isEditable =
    gameplanEditableFields.has(path) || gameplanEditableFieldPrefixes.some((prefix) => path.startsWith(prefix) && path.length > prefix.length);
  if (!isEditable) return false;
  if (path === "status") {
    const allowedStatuses = new Set(["draft", "staff-review", "player-brief-ready", "locked"]);
    const nextStatus = String(value || "").trim().toLowerCase();
    plan.status = allowedStatuses.has(nextStatus) ? nextStatus : "draft";
    return true;
  }
  const parts = path.split(".");
  let target = plan;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
      target[key] = {};
    }
    target = target[key];
  }
  target[parts[parts.length - 1]] = String(value ?? "").slice(0, 1200);
  return true;
}

function updateGameplanField(path = "", value = "") {
  mutateActiveGameplan((plan) => setGameplanNestedField(plan, path, value));
}

function normalizeLineupSelection(lineup = {}) {
  const startingPlayerIds = Array.from(new Set(Array.isArray(lineup.startingPlayerIds) ? lineup.startingPlayerIds : [])).slice(0, 11);
  const startingSet = new Set(startingPlayerIds);
  return {
    formation: String(lineup.formation || "").trim().slice(0, 40),
    startingPlayerIds,
    benchPlayerIds: Array.from(new Set(Array.isArray(lineup.benchPlayerIds) ? lineup.benchPlayerIds : [])).filter((id) => !startingSet.has(id)),
  };
}

function getLineupSelectedPlayerIds(plan = {}) {
  const lineup = normalizeLineupSelection(plan.lineup || {});
  return [...lineup.startingPlayerIds, ...lineup.benchPlayerIds];
}

function assignMiniGamePrinciplesToPlayers(miniGamePrinciples = [], plan = {}) {
  const selectedPlayerIds = getLineupSelectedPlayerIds(plan);
  if (!selectedPlayerIds.length) return miniGamePrinciples;
  return miniGamePrinciples.map((item, index) => ({
    ...item,
    playerIds: item.playerIds?.length ? item.playerIds : [selectedPlayerIds[index % selectedPlayerIds.length]],
  }));
}

function syncGameplanWeekFocus() {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    const suggestion = buildGameplanWeekFocusSuggestion(plan);
    const current = getGameplanWeekFocus(plan);
    const phasePrinciples = { ...current.phasePrinciples };
    gameplanPhaseKeys.forEach((key) => {
      if (!phasePrinciples[key] && suggestion.phasePrinciples[key]) {
        phasePrinciples[key] = suggestion.phasePrinciples[key];
      }
    });
    const existingKeys = new Set((current.miniGamePrinciples || []).map((item) => normalizeSearchText(item.principle)));
    const suggestedMinis = (suggestion.miniGamePrinciples || []).filter((item) => item.principle && !existingKeys.has(normalizeSearchText(item.principle)));
    plan.matchFocus = {
      ...(plan.matchFocus || {}),
      sourceGeneratedAt: suggestion.sourceGeneratedAt,
      sourceWindow: suggestion.sourceWindow,
      phasePrinciples,
      miniGamePrinciples: assignMiniGamePrinciplesToPlayers([...(current.miniGamePrinciples || []), ...suggestedMinis], plan),
    };
  });
}

function toggleGameplanLineupPlayer(playerId = "", group = "", isSelected = false) {
  if (!canEditPlan() || !playerId) return;
  mutateActiveGameplan((plan) => {
    const lineup = normalizeLineupSelection(plan.lineup || {});
    const starters = new Set(lineup.startingPlayerIds);
    const bench = new Set(lineup.benchPlayerIds);
    if (group === "starting") {
      if (isSelected && starters.size < 11) {
        starters.add(playerId);
        bench.delete(playerId);
      } else if (!isSelected) {
        starters.delete(playerId);
      }
    }
    if (group === "bench") {
      if (isSelected) {
        bench.add(playerId);
        starters.delete(playerId);
      } else {
        bench.delete(playerId);
      }
    }
    plan.lineup = normalizeLineupSelection({
      ...lineup,
      startingPlayerIds: Array.from(starters),
      benchPlayerIds: Array.from(bench),
    });
    if (Array.isArray(plan.matchFocus?.miniGamePrinciples)) {
      plan.matchFocus.miniGamePrinciples = assignMiniGamePrinciplesToPlayers(plan.matchFocus.miniGamePrinciples, plan);
    }
  });
}

function addGameplanMiniPrinciple() {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    const focus = plan.matchFocus || {};
    focus.miniGamePrinciples = Array.isArray(focus.miniGamePrinciples) ? focus.miniGamePrinciples : [];
    focus.miniGamePrinciples.push({
      id: createGameplanLocalId("mini"),
      principle: "New mini-game principle",
      phase: "",
      playerIds: [],
      source: "Manual",
    });
    plan.matchFocus = focus;
  });
}

function updateGameplanMiniPrinciple(itemId = "", patch = {}) {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    const focus = plan.matchFocus || {};
    focus.miniGamePrinciples = (focus.miniGamePrinciples || []).map((entry) =>
      entry.id === itemId
        ? {
            ...entry,
            ...patch,
            principle: patch.principle !== undefined ? String(patch.principle || "").slice(0, 180) : entry.principle,
            phase: patch.phase !== undefined ? String(patch.phase || "").slice(0, 80) : entry.phase,
            playerIds:
              patch.playerId !== undefined
                ? patch.playerId
                  ? [String(patch.playerId)]
                  : []
                : Array.isArray(patch.playerIds)
                  ? patch.playerIds
                  : entry.playerIds || [],
          }
        : entry
    );
    plan.matchFocus = focus;
  });
}

function removeGameplanMiniPrinciple(itemId = "") {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    const focus = plan.matchFocus || {};
    focus.miniGamePrinciples = (focus.miniGamePrinciples || []).filter((entry) => entry.id !== itemId);
    plan.matchFocus = focus;
  });
}

function archiveGameplan(gameplanId = "") {
  if (!canDeleteGameplan() || !gameplanId) return null;
  const state = getState();
  const previousState = cloneGameplanState(state, { currentUser: activeContext?.currentUser || {} });
  const visiblePlans = (Array.isArray(state.gameplans) ? state.gameplans : []).filter((plan) => !plan.archivedAt);
  const planIndex = visiblePlans.findIndex((plan) => plan.id === gameplanId);
  const plan = visiblePlans[planIndex] || null;
  if (!plan) return null;

  const archivedAt = new Date().toISOString();
  plan.archivedAt = archivedAt;
  plan.archivedBy = String(activeContext?.currentUser?.id || "");
  plan.updatedAt = archivedAt;

  if (state.activeGameplanId === gameplanId) {
    const remainingPlans = visiblePlans.filter((candidate) => candidate.id !== gameplanId);
    state.activeGameplanId = remainingPlans[Math.min(planIndex, remainingPlans.length - 1)]?.id || "";
    state.activeTab = "plan";
    state.planMode = "briefing";
  }

  try {
    writeGameplanState();
  } catch (error) {
    gameplanState = previousState;
    throw error;
  }
  return plan;
}

function confirmGameplanArchive(plan = {}) {
  const title = plan.title || plan.opponent || "Match Plan";
  return confirmPlatformAction({
    eyebrow: "Gameplan",
    title: `Delete "${title}"?`,
    message:
      "This removes the match plan from Gameplan, including its lineup, staff assignments, evidence and Player Brief. Shared Player Brief links will stop working. The plan remains in protected history for recovery.",
    confirmLabel: "Delete gameplan",
    tone: "danger",
    win: activeContext?.win || globalThis.window,
  });
}

function setActiveGameplan(gameplanId = "") {
  const state = getState();
  if (!state.gameplans?.some((plan) => plan.id === gameplanId)) return;
  state.activeGameplanId = gameplanId;
  state.planMode = "briefing";
  writeGameplanState({ syncCentral: false });
}

function setGameplanActiveTab(tabId = "") {
  const state = getState();
  if (gameplanActiveTabs.includes(tabId)) {
    state.activeTab = tabId;
  } else if (tabId === "scenarios" || tabId === "evidence") {
    state.activeTab = "plan";
  } else if (tabId === "live" || tabId === "review" || tabId === "checklist") {
    state.activeTab = "matchday";
  } else {
    state.activeTab = "plan";
  }
  writeGameplanState({ syncCentral: false });
}

function setGameplanPlanMode(mode = "") {
  if (mode === "edit" && !canEditPlan()) return;
  const state = getState();
  state.planMode = gameplanPlanModes.includes(mode) ? mode : "briefing";
  writeGameplanState({ syncCentral: false });
}

function createGameplanFromScheduleMatch(matchId = "") {
  if (!canEditWorkspace()) return;
  const match = getScheduleMatches().find((candidate) => candidate.id === matchId);
  if (!match) return;
  const state = getState();
  const existing = state.gameplans?.find((plan) => plan.matchEventId === match.id && !plan.archivedAt);
  if (existing) {
    state.activeGameplanId = existing.id;
    state.activeTab = "plan";
    state.planMode = "briefing";
    writeGameplanState({ syncCentral: false });
    return;
  }
  const plan = createGameplanFromMatch(match, { currentUser: activeContext?.currentUser || null });
  const suggestion = buildGameplanWeekFocusSuggestion(plan);
  plan.matchFocus = {
    ...(plan.matchFocus || {}),
    ...suggestion,
    miniGamePrinciples: assignMiniGamePrinciplesToPlayers(suggestion.miniGamePrinciples || [], plan),
  };
  state.gameplans = Array.isArray(state.gameplans) ? state.gameplans : [];
  state.gameplans.push(plan);
  state.activeGameplanId = plan.id;
  state.activeTab = "plan";
  state.planMode = "briefing";
  writeGameplanState();
}

function addGameplanStaffResponsibility() {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.staffResponsibilities = Array.isArray(plan.staffResponsibilities) ? plan.staffResponsibilities : [];
    plan.staffResponsibilities.push({
      id: createGameplanLocalId("staff"),
      userId: "",
      role: "Staff role",
      ownerName: "",
      area: "",
      watchFor: "",
      reportAtHalftime: "",
      decisionTrigger: "",
      status: "open",
    });
  });
}

function updateGameplanStaffResponsibility(staffId = "", patch = {}) {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.staffResponsibilities = (plan.staffResponsibilities || []).map((entry) =>
      entry.id === staffId ? { ...entry, ...patch } : entry
    );
  });
}

function removeGameplanStaffResponsibility(staffId = "") {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.staffResponsibilities = (plan.staffResponsibilities || []).filter((entry) => entry.id !== staffId);
  });
}

function setGameplanAudience(mode = "") {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    const brief = plan.playerBrief || {};
    const players = getSquadPlayers();
    brief.audiencePlayerIds = mode === "all" ? players.map((player) => player.id) : [];
    plan.playerBrief = brief;
  });
}

function toggleGameplanAudiencePlayer(playerId = "", isSelected = false) {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    const brief = plan.playerBrief || {};
    const selected = new Set(Array.isArray(brief.audiencePlayerIds) ? brief.audiencePlayerIds : []);
    if (isSelected) selected.add(playerId);
    else selected.delete(playerId);
    brief.audiencePlayerIds = Array.from(selected);
    plan.playerBrief = brief;
  });
}

function publishGameplanPlayerBrief() {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.playerBrief = {
      ...(plan.playerBrief || {}),
      publishedAt: new Date().toISOString(),
    };
    if (plan.status === "draft" || plan.status === "staff-review") {
      plan.status = "player-brief-ready";
    }
  });
}

function addGameplanChecklistItem() {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.checklist = Array.isArray(plan.checklist) ? plan.checklist : [];
    plan.checklist.push({
      id: createGameplanLocalId("check"),
      stage: "MD",
      title: "",
      ownerUserId: "",
      due: "",
      done: false,
    });
  });
}

function updateGameplanChecklistItem(itemId = "", patch = {}) {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.checklist = (plan.checklist || []).map((entry) => (entry.id === itemId ? { ...entry, ...patch } : entry));
  });
}

function removeGameplanChecklistItem(itemId = "") {
  if (!canEditWorkspace()) return;
  mutateActiveGameplan((plan) => {
    plan.checklist = (plan.checklist || []).filter((entry) => entry.id !== itemId);
  });
}

function addGameplanScenarioCard() {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    plan.scenarioCards = Array.isArray(plan.scenarioCards) ? plan.scenarioCards : [];
    plan.scenarioCards.push({
      id: createGameplanLocalId("scenario"),
      title: "New scenario",
      trigger: "",
      staffAction: "",
      playerMessage: "",
      ownerUserId: "",
      status: "open",
    });
  });
}

function updateGameplanScenarioCard(cardId = "", patch = {}) {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    plan.scenarioCards = (plan.scenarioCards || []).map((entry) => (entry.id === cardId ? { ...entry, ...patch } : entry));
  });
}

function removeGameplanScenarioCard(cardId = "") {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    plan.scenarioCards = (plan.scenarioCards || []).filter((entry) => entry.id !== cardId);
  });
}

function addGameplanEvidenceItem() {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    plan.evidence = Array.isArray(plan.evidence) ? plan.evidence : [];
    plan.evidence.push({
      id: createGameplanLocalId("evidence"),
      title: "New evidence",
      source: "Manual",
      linkedSourceType: "manual",
      linkedSourceId: "",
      linkedSourceLabel: "Manual evidence",
      linkedWorkspace: "",
      mediaType: "link",
      matchEventId: plan.matchEventId || "",
      sourceRef: "",
      phase: "",
      url: "",
      note: "",
      ownerUserId: "",
      confidence: "medium",
    });
  });
}

function updateGameplanEvidenceItem(itemId = "", patch = {}) {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    plan.evidence = (plan.evidence || []).map((entry) => (entry.id === itemId ? { ...entry, ...patch } : entry));
  });
}

function removeGameplanEvidenceItem(itemId = "") {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    plan.evidence = (plan.evidence || []).filter((entry) => entry.id !== itemId);
  });
}

function linkGameplanEvidenceCandidate(candidateId = "") {
  if (!canEditPlan()) return;
  const plan = getPlan();
  const candidate = getGameplanEvidenceSourceCandidates(plan).find((entry) => entry.id === candidateId);
  if (!candidate) return;
  mutateActiveGameplan((activePlan) => {
    activePlan.evidence = Array.isArray(activePlan.evidence) ? activePlan.evidence : [];
    const nextItem = {
      id: createGameplanLocalId("evidence"),
      title: candidate.title,
      source: candidate.source,
      linkedSourceType: candidate.linkedSourceType,
      linkedSourceId: candidate.linkedSourceId,
      linkedSourceLabel: candidate.linkedSourceLabel,
      linkedWorkspace: candidate.linkedWorkspace,
      mediaType: candidate.mediaType,
      matchEventId: candidate.matchEventId || activePlan.matchEventId || "",
      sourceRef: candidate.sourceRef,
      phase: candidate.phase || "",
      url: candidate.url || "",
      note: candidate.note || "",
      ownerUserId: activeContext?.currentUser?.id || "",
      confidence: candidate.confidence || "medium",
    };
    const existingIndex = activePlan.evidence.findIndex((item) => getEvidenceCandidateKey(item) === getEvidenceCandidateKey(candidate));
    if (existingIndex >= 0) {
      activePlan.evidence[existingIndex] = {
        ...activePlan.evidence[existingIndex],
        ...nextItem,
        id: activePlan.evidence[existingIndex].id,
      };
      return;
    }
    activePlan.evidence.unshift(nextItem);
  });
}

function approveGameplanMeeting() {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    plan.meeting = {
      ...(plan.meeting || {}),
      approvedByUserId: activeContext?.currentUser?.id || "staff",
      approvedAt: new Date().toISOString(),
    };
    if (plan.status === "draft") {
      plan.status = "staff-review";
    }
  });
}

function addGameplanObservation() {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    const live = plan.live || {};
    live.observations = Array.isArray(live.observations) ? live.observations : [];
    live.observations.unshift({
      id: createGameplanLocalId("obs"),
      minute: "",
      phase: "",
      ownerUserId: "",
      observation: "",
      action: "",
      status: "watching",
      createdAt: new Date().toISOString(),
    });
    plan.live = live;
  });
}

function updateGameplanObservation(observationId = "", patch = {}) {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    const live = plan.live || {};
    live.observations = (live.observations || []).map((entry) => (entry.id === observationId ? { ...entry, ...patch } : entry));
    plan.live = live;
  });
}

function removeGameplanObservation(observationId = "") {
  if (!canEditPlan()) return;
  mutateActiveGameplan((plan) => {
    const live = plan.live || {};
    live.observations = (live.observations || []).filter((entry) => entry.id !== observationId);
    plan.live = live;
  });
}

function getLocalPlayerBriefAccess(planId = "", playerId = "") {
  const plan = getPlanById(planId);
  const brief = plan?.playerBrief || {};
  const selected = new Set(Array.isArray(brief.audiencePlayerIds) ? brief.audiencePlayerIds : []);
  const player = getPlayerById(playerId);
  if (!plan) {
    return { ok: false, reason: "Brief not found.", plan: null, player };
  }
  if (!brief.publishedAt) {
    return { ok: false, reason: "This player brief has not been published yet.", plan, player };
  }
  if (!playerId || !selected.has(playerId)) {
    return { ok: false, reason: "This brief is not assigned to this player.", plan, player };
  }
  return { ok: true, reason: "", plan, player };
}

function upsertLocalPlayerBriefReceipt(planId = "", playerId = "", options = {}) {
  const access = getLocalPlayerBriefAccess(planId, playerId);
  if (!access.ok || !access.plan) return false;
  const now = new Date().toISOString();
  const brief = access.plan.playerBrief || {};
  const receipts = { ...(brief.readReceipts || {}) };
  const previous = receipts[playerId] || {};
  const shouldCountOpen = options.countOpen !== false;
  const previousOpenCount = Number.parseInt(previous.openCount, 10) || 0;
  receipts[playerId] = {
    playerId,
    firstOpenedAt: previous.firstOpenedAt || now,
    lastOpenedAt: now,
    acknowledgedAt: options.acknowledge ? previous.acknowledgedAt || now : previous.acknowledgedAt || "",
    openCount: shouldCountOpen || previousOpenCount === 0 ? Math.min(9999, previousOpenCount + 1) : previousOpenCount,
  };
  access.plan.playerBrief = { ...brief, readReceipts: receipts };
  access.plan.updatedAt = now;
  writeGameplanState();
  return true;
}

function recordLocalPlayerBriefOpened(planId = "", playerId = "") {
  const receiptKey = `football-gameplan-player-brief-opened:${planId}:${playerId}`;
  try {
    if (window.sessionStorage.getItem(receiptKey)) return false;
  } catch {}
  const didRecord = upsertLocalPlayerBriefReceipt(planId, playerId, { countOpen: true });
  if (didRecord) {
    try {
      window.sessionStorage.setItem(receiptKey, "1");
    } catch {}
  }
  return didRecord;
}

function acknowledgeLocalPlayerBrief(planId = "", playerId = "") {
  return upsertLocalPlayerBriefReceipt(planId, playerId, { acknowledge: true, countOpen: false });
}

function getSelectedBriefPlayers(plan = {}) {
  const selected = new Set(plan.playerBrief?.audiencePlayerIds || []);
  return getSquadPlayers().filter((player) => selected.has(player.id));
}

function getReceiptLabel(receipt = null) {
  if (receipt?.acknowledgedAt) return `Acknowledged ${formatTimestamp(receipt.acknowledgedAt)}`;
  if (receipt?.lastOpenedAt) return `Opened ${formatTimestamp(receipt.lastOpenedAt)}`;
  return "Not opened";
}

function getPersonLabel(user = {}) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || user.email || "";
}

function getUserName(userId = "") {
  const user = (activeContext?.users || []).find((candidate) => candidate.id === userId);
  return user ? getPersonLabel(user) : "";
}

function getCurrentUser() {
  return activeContext?.currentUser || {};
}

function normalizeSearchText(value = "") {
  return String(value || "").toLowerCase();
}

function staffResponsibilityText(item = {}) {
  return normalizeSearchText([item.role, item.area, item.ownerName, item.watchFor, item.reportAtHalftime, item.decisionTrigger].join(" "));
}

function textMatchesAny(text = "", keywords = []) {
  const normalized = normalizeSearchText(text);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function getCurrentUserRoleKeywords() {
  const role = normalizeSearchText(getCurrentUser().role || getCurrentUser().jobTitle || getCurrentUser().position || "");
  if (role.includes("analyst") || role.includes("scout")) return ["analyst", "analysis", "opponent", "trend", "evidence", "scout"];
  if (role.includes("medical")) return ["medical", "availability", "injury"];
  if (role.includes("performance")) return ["performance", "load", "readiness"];
  if (role.includes("keeper") || role.includes("goalkeeper") || role === "gk") return ["goalkeeper", "keeper", "gk", "box"];
  if (role.includes("assistant")) return ["assistant", "out of possession", "press", "transition"];
  if (role.includes("coach") || role.includes("admin")) return ["head coach", "assistant", "match direction"];
  return [];
}

function getRoleResponsibilities(plan = {}, keywords = []) {
  return (plan.staffResponsibilities || []).filter((item) => textMatchesAny(staffResponsibilityText(item), keywords));
}

function getCurrentUserResponsibilities(plan = {}) {
  const currentUserId = getCurrentUser().id || "";
  const assigned = currentUserId ? (plan.staffResponsibilities || []).filter((item) => item.userId === currentUserId) : [];
  if (assigned.length) return assigned;
  const roleMatches = getRoleResponsibilities(plan, getCurrentUserRoleKeywords());
  return roleMatches.slice(0, 3);
}

function renderUserOptions(selectedUserId = "") {
  const users = activeContext?.users || [];
  return [`<option value="">Unassigned</option>`]
    .concat(
      users.map((user) => {
        const label = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || user.email || "Staff";
        return `<option value="${escapeHtml(user.id)}" ${user.id === selectedUserId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
    )
    .join("");
}

function renderStatusOptions(selectedStatus = "draft") {
  return gameplanStatusOptions
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}" ${option.value === selectedStatus ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}

function renderOptions(options = [], selectedValue = "") {
  return options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}

function renderField(path, label, value = "", options = {}) {
  const disabled = options.disabled || !canEditPlan();
  const rows = options.rows || 3;
  return `
    <label class="gameplan-field ${options.wide ? "is-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <textarea
        rows="${rows}"
        data-gameplan-field="${escapeHtml(path)}"
        ${disabled ? "disabled" : ""}
      >${escapeHtml(value)}</textarea>
    </label>
  `;
}

function getOptionLabel(options = [], value = "") {
  return options.find((option) => option.value === value)?.label || value || "";
}

function renderBriefingText(value = "", fallback = "Not set") {
  const text = String(value || "").trim();
  if (!text) {
    return `<span class="gameplan-brief-empty">${escapeHtml(fallback)}</span>`;
  }
  return escapeHtml(text).replaceAll("\n", "<br>");
}

function getGameplanPlanMode(plan = getPlan()) {
  return getState().planMode === "edit" && canEditPlan(plan) ? "edit" : "briefing";
}

function renderPlanModeSwitch(plan = getPlan()) {
  const activeMode = getGameplanPlanMode(plan);
  return `
    <div class="gameplan-mode-switch" aria-label="Plan mode">
      <button type="button" class="${activeMode === "briefing" ? "is-active" : ""}" data-gameplan-plan-mode="briefing">Briefing</button>
      <button type="button" class="${activeMode === "edit" ? "is-active" : ""}" data-gameplan-plan-mode="edit" ${!canEditPlan(plan) ? "disabled" : ""}>Edit</button>
    </div>
  `;
}

function renderBriefingMetric(label = "", value = "", fallback = "Not set") {
  return `
    <article class="gameplan-brief-metric">
      <span>${escapeHtml(label)}</span>
      <p>${renderBriefingText(value, fallback)}</p>
    </article>
  `;
}

function renderBriefingTrigger(item = {}, index = 0) {
  const statusLabel = getOptionLabel(gameplanScenarioStatusOptions, item.status || "open");
  return `
    <article class="gameplan-brief-trigger">
      <header>
        <strong>${index + 1}</strong>
        <div>
          <h3>${escapeHtml(item.title || `Decision trigger ${index + 1}`)}</h3>
          <span>${escapeHtml(statusLabel)}</span>
        </div>
      </header>
      <div class="gameplan-brief-trigger-grid">
        <section>
          <span>If</span>
          <p>${renderBriefingText(item.trigger, "Trigger not set")}</p>
        </section>
        <section>
          <span>Then</span>
          <p>${renderBriefingText(item.staffAction, "Staff action not set")}</p>
        </section>
      </div>
    </article>
  `;
}

function renderBriefingPhase(key = "", value = "") {
  return `
    <article class="gameplan-brief-phase">
      <span>${escapeHtml(gameplanPhaseLabels[key] || key)}</span>
      <p>${renderBriefingText(value, "Phase note not set")}</p>
    </article>
  `;
}

function renderPlanList() {
  const state = getState();
  const plans = Array.isArray(state.gameplans) ? state.gameplans.filter((plan) => !plan.archivedAt) : [];
  const matches = getScheduleMatches();
  const activeId = state.activeGameplanId;
  return `
    <aside class="gameplan-sidebar">
      <div class="gameplan-sidebar-head">
        <span>Gameplans</span>
        <strong>${plans.length}</strong>
      </div>
      <div class="gameplan-plan-list">
        ${
          plans.length
            ? plans
                .map(
                  (plan) => `
                    <button type="button" class="gameplan-plan-card ${plan.id === activeId ? "is-active" : ""}" data-gameplan-open="${escapeHtml(plan.id)}">
                      <span>${escapeHtml(formatDate(plan.date))}</span>
                      <strong>${escapeHtml(plan.title || plan.opponent || "Match Plan")}</strong>
                      <small>${escapeHtml(plan.status.replaceAll("-", " "))}</small>
                    </button>
                  `
                )
                .join("")
            : `<div class="gameplan-empty-small">No gameplan yet.</div>`
        }
      </div>
      <div class="gameplan-create-panel">
        <span>Create from Schedule</span>
        <div class="gameplan-match-list">
          ${
            matches.length
              ? matches
                  .slice(0, 8)
                  .map(
                    (match) => `
                      <button type="button" data-gameplan-create-match="${escapeHtml(match.id)}" ${!activeContext?.canEdit?.() ? "disabled" : ""}>
                        ${escapeHtml(getGameplanMatchLabel(match))}
                      </button>
                    `
                  )
                  .join("")
              : `<small>No scheduled matches found.</small>`
          }
        </div>
      </div>
    </aside>
  `;
}

function renderHero(plan) {
  const audienceCount = plan.playerBrief?.audiencePlayerIds?.length || 0;
  const checklist = plan.checklist || [];
  const doneCount = checklist.filter((item) => item.done).length;
  const scenarios = plan.scenarioCards || [];
  const readyScenarioCount = scenarios.filter((item) => item.status === "ready" || item.status === "used").length;
  return `
    <header class="gameplan-hero">
      <div class="gameplan-hero-main">
        <p>Gameplan</p>
        <h1>${escapeHtml(plan.title || plan.opponent || "Match Plan")}</h1>
        <div class="gameplan-meta-row">
          <span>${escapeHtml(formatDate(plan.date))}</span>
          ${plan.kickoff ? `<span>${escapeHtml(plan.kickoff)}</span>` : ""}
          ${plan.venue ? `<span>${escapeHtml(plan.venue)}</span>` : ""}
          ${plan.competition ? `<span>${escapeHtml(plan.competition)}</span>` : ""}
          ${
            canDeleteGameplan()
              ? `<button type="button" class="gameplan-delete-plan" data-gameplan-delete="${escapeHtml(plan.id)}" aria-label="Delete ${escapeHtml(
                  plan.title || plan.opponent || "gameplan"
                )}">Delete gameplan</button>`
              : ""
          }
        </div>
      </div>
      <div class="gameplan-status-board">
        <label>
          <span>Status</span>
          <select data-gameplan-field="status" ${!activeContext?.canEdit?.() ? "disabled" : ""}>
            ${renderStatusOptions(plan.status)}
          </select>
        </label>
        <div>
          <strong>${audienceCount}</strong>
          <span>Player brief audience</span>
        </div>
        <div>
          <strong>${readyScenarioCount}/${scenarios.length}</strong>
          <span>Decision cards</span>
        </div>
        <div>
          <strong>${doneCount}/${checklist.length}</strong>
          <span>Checklist</span>
        </div>
      </div>
    </header>
  `;
}

function renderTabs() {
  const activeTab = getState().activeTab || "plan";
  const tabs = [
    ["plan", "Plan"],
    ["staff", "Staff"],
    ["player-brief", "Player Brief"],
    ["matchday", "Matchday"],
  ];
  return `
    <nav class="gameplan-tabs" aria-label="Gameplan sections">
      ${tabs
        .map(
          ([tab, label]) =>
            `<button type="button" class="${activeTab === tab ? "is-active" : ""}" data-gameplan-tab="${escapeHtml(tab)}">${escapeHtml(label)}</button>`
        )
        .join("")}
    </nav>
  `;
}

function getEvidenceMetaLabel(item = {}) {
  const sourceLabel = item.linkedSourceLabel || item.source || "";
  const mediaType = item.mediaType ? item.mediaType.replace("-", " ") : "";
  return [sourceLabel, mediaType, item.confidence ? `${item.confidence} confidence` : ""].filter(Boolean).join(" · ");
}

function renderEvidenceChips(plan) {
  const evidence = plan.evidence || [];
  return `
    <div class="gameplan-evidence-chips">
      ${
        evidence.length
          ? evidence
              .slice(0, 4)
              .map((item) => {
                const label = item.title || item.source || "Evidence";
                const meta = getEvidenceMetaLabel(item);
                const content = `
                  <strong>${escapeHtml(label)}</strong>
                  ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
                `;
                return item.url
                  ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="gameplan-evidence-chip">${content}</a>`
                  : `<span class="gameplan-evidence-chip">${content}</span>`;
              })
              .join("")
          : `<span class="gameplan-evidence-chip is-empty">No evidence linked</span>`
      }
    </div>
  `;
}

function renderEvidenceQuickEditor(plan) {
  const evidence = plan.evidence || [];
  const disabled = !canEditPlan();
  if (!evidence.length) {
    return "";
  }
  return `
    <div class="gameplan-evidence-quick-list">
      ${evidence
        .slice(0, 4)
        .map(
          (item) => `
            <article class="gameplan-evidence-quick-row">
              <input value="${escapeHtml(item.title)}" data-gameplan-evidence="${escapeHtml(item.id)}" data-gameplan-evidence-field="title" ${disabled ? "disabled" : ""} aria-label="Evidence title">
              <input value="${escapeHtml(item.url)}" data-gameplan-evidence="${escapeHtml(item.id)}" data-gameplan-evidence-field="url" ${disabled ? "disabled" : ""} aria-label="Evidence URL">
              <select data-gameplan-evidence="${escapeHtml(item.id)}" data-gameplan-evidence-field="confidence" ${disabled ? "disabled" : ""} aria-label="Evidence confidence">
                ${renderOptions(gameplanEvidenceConfidenceOptions, item.confidence || "medium")}
              </select>
              <button type="button" data-gameplan-remove-evidence="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>Remove</button>
              <small>${escapeHtml(getEvidenceMetaLabel(item) || "Manual evidence")}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEvidenceSourceCandidate(plan = {}, candidate = {}) {
  const linked = isEvidenceCandidateLinked(plan, candidate);
  const meta = [candidate.source, candidate.mediaType, candidate.meta].filter(Boolean).join(" · ");
  return `
    <article class="gameplan-evidence-source-row${linked ? " is-linked" : ""}">
      <div>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
        <strong>${escapeHtml(candidate.title || "Evidence source")}</strong>
        ${candidate.note ? `<p>${escapeHtml(candidate.note)}</p>` : ""}
      </div>
      <button type="button" data-gameplan-link-evidence="${escapeHtml(candidate.id)}" ${linked || !canEditPlan() ? "disabled" : ""}>
        ${linked ? "Linked" : "Link"}
      </button>
    </article>
  `;
}

function renderEvidenceSourcePanel(plan) {
  const candidates = getGameplanEvidenceSourceCandidates(plan);
  const sourceCounts = candidates.reduce((counts, candidate) => {
    const key = candidate.linkedSourceType || "source";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return `
    <section class="gameplan-evidence-source-panel" aria-label="Linked evidence sources">
      <header>
        <div>
          <span>Evidence Sources</span>
          <strong>${candidates.length ? `${candidates.length} available` : "No sources found"}</strong>
        </div>
        <div class="gameplan-evidence-source-counts" aria-label="Evidence source counts">
          <span>Analysis ${sourceCounts.analysis || 0}</span>
          <span>Scouting ${sourceCounts.scouting || 0}</span>
          <span>Media ${sourceCounts["match-media"] || 0}</span>
        </div>
      </header>
      <div class="gameplan-evidence-source-list">
        ${
          candidates.length
            ? candidates.slice(0, 8).map((candidate) => renderEvidenceSourceCandidate(plan, candidate)).join("")
            : `<div class="gameplan-empty-small">No analysis, scouting or match media found yet.</div>`
        }
      </div>
    </section>
  `;
}

function renderPlayerLabel(player = null) {
  if (!player) return "Unknown player";
  return [player.number ? `#${player.number}` : "", player.name, player.position].filter(Boolean).join(" · ");
}

function renderPlayerSelectOptions(selectedPlayerId = "") {
  return [
    `<option value="">Unassigned</option>`,
    ...getSquadPlayers().map(
      (player) =>
        `<option value="${escapeHtml(player.id)}" ${player.id === selectedPlayerId ? "selected" : ""}>${escapeHtml(renderPlayerLabel(player))}</option>`
    ),
  ].join("");
}

function renderLineupPlayerChip(playerId = "", index = 0) {
  const player = getPlayerById(playerId);
  return `
    <article class="gameplan-lineup-chip">
      <strong>${escapeHtml(String(index + 1).padStart(2, "0"))}</strong>
      <div>
        <span>${escapeHtml(player?.position || "Player")}</span>
        <p>${escapeHtml(player?.name || "Unknown player")}</p>
      </div>
    </article>
  `;
}

function renderLineupOverview(plan) {
  const lineup = normalizeLineupSelection(plan.lineup || {});
  return `
    <section class="gameplan-card gameplan-card-span gameplan-lineup-overview">
      <header>
        <span>Starting XI</span>
        <strong>${escapeHtml(lineup.formation || `${lineup.startingPlayerIds.length}/11`)}</strong>
      </header>
      <div class="gameplan-lineup-grid">
        <section>
          <div class="gameplan-lineup-section-head">
            <span>On pitch</span>
            <strong>${lineup.startingPlayerIds.length}/11</strong>
          </div>
          <div class="gameplan-lineup-chip-list">
            ${
              lineup.startingPlayerIds.length
                ? lineup.startingPlayerIds.map(renderLineupPlayerChip).join("")
                : `<div class="gameplan-empty-small">No starting eleven selected.</div>`
            }
          </div>
        </section>
        <section>
          <div class="gameplan-lineup-section-head">
            <span>Bench</span>
            <strong>${lineup.benchPlayerIds.length}</strong>
          </div>
          <div class="gameplan-lineup-chip-list is-bench">
            ${
              lineup.benchPlayerIds.length
                ? lineup.benchPlayerIds.map((playerId, index) => renderLineupPlayerChip(playerId, index)).join("")
                : `<div class="gameplan-empty-small">No bench selected.</div>`
            }
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderLineupEditor(plan) {
  const disabled = !canEditPlan();
  const lineup = normalizeLineupSelection(plan.lineup || {});
  const startingSet = new Set(lineup.startingPlayerIds);
  const benchSet = new Set(lineup.benchPlayerIds);
  const players = getSquadPlayers();
  return `
    <section class="gameplan-card gameplan-card-span gameplan-lineup-editor">
      <header>
        <span>Starting XI / Bench</span>
        <strong>${lineup.startingPlayerIds.length}/11 + ${lineup.benchPlayerIds.length}</strong>
      </header>
      <div class="gameplan-lineup-editor-top">
        ${renderField("lineup.formation", "Formation", lineup.formation, { rows: 1 })}
      </div>
      <div class="gameplan-lineup-player-list">
        ${
          players.length
            ? players
                .map((player) => {
                  const isStarting = startingSet.has(player.id);
                  const isBench = benchSet.has(player.id);
                  const startDisabled = disabled || (!isStarting && lineup.startingPlayerIds.length >= 11);
                  return `
                    <article class="gameplan-lineup-player-row">
                      <div>
                        <strong>${escapeHtml(player.name)}</strong>
                        <span>${escapeHtml([player.number ? `#${player.number}` : "", player.position].filter(Boolean).join(" · ") || "Squad")}</span>
                      </div>
                      <label>
                        <input type="checkbox" data-gameplan-lineup-player="${escapeHtml(player.id)}" data-gameplan-lineup-group="starting" ${isStarting ? "checked" : ""} ${startDisabled ? "disabled" : ""}>
                        XI
                      </label>
                      <label>
                        <input type="checkbox" data-gameplan-lineup-player="${escapeHtml(player.id)}" data-gameplan-lineup-group="bench" ${isBench ? "checked" : ""} ${disabled ? "disabled" : ""}>
                        Bench
                      </label>
                    </article>
                  `;
                })
                .join("")
            : `<div class="gameplan-empty-small">Add squad players before setting the lineup.</div>`
        }
      </div>
    </section>
  `;
}

function getPhasePrincipleText(plan = {}, phaseKey = "") {
  return plan.matchFocus?.phasePrinciples?.[phaseKey] || plan.tactical?.[phaseKey] || "";
}

function renderWeekFocusOverview(plan) {
  const focus = getGameplanWeekFocus(plan);
  const populatedPhases = gameplanPhaseKeys.filter((key) => getPhasePrincipleText(plan, key));
  return `
    <section class="gameplan-card gameplan-card-span gameplan-week-focus-card">
      <header>
        <span>Week Focus</span>
        <strong>${escapeHtml(focus.sourceWindow || "Editable")}</strong>
      </header>
      <div class="gameplan-week-focus-grid">
        ${
          populatedPhases.length
            ? populatedPhases
                .map(
                  (key) => `
                    <article>
                      <span>${escapeHtml(gameplanPhaseLabels[key] || key)}</span>
                      <p>${escapeHtml(getPhasePrincipleText(plan, key))}</p>
                    </article>
                  `
                )
                .join("")
            : `<div class="gameplan-empty-small">No week principles synced yet.</div>`
        }
      </div>
      <div class="gameplan-mini-principle-list">
        ${
          focus.miniGamePrinciples.length
            ? focus.miniGamePrinciples
                .slice(0, 6)
                .map((item) => {
                  const player = getPlayerById(item.playerIds?.[0] || "");
                  return `
                    <article class="gameplan-mini-principle-pill">
                      <strong>${escapeHtml(item.principle || "Mini-game principle")}</strong>
                      <span>${escapeHtml(player ? renderPlayerLabel(player) : "Unassigned")}</span>
                    </article>
                  `;
                })
                .join("")
            : ""
        }
      </div>
    </section>
  `;
}

function renderWeekFocusEditor(plan) {
  const focus = getGameplanWeekFocus(plan);
  const disabled = !canEditPlan();
  return `
    <section class="gameplan-card gameplan-card-span gameplan-week-focus-card">
      <header>
        <span>Week Focus</span>
        <div class="gameplan-card-actions">
          <strong>${escapeHtml(focus.sourceWindow || "Manual")}</strong>
          <button type="button" data-gameplan-sync-week-focus ${disabled ? "disabled" : ""}>Sync week focus</button>
          <button type="button" data-gameplan-add-mini-principle ${disabled ? "disabled" : ""}>Add mini</button>
        </div>
      </header>
      <div class="gameplan-phase-grid gameplan-phase-grid-compact">
        ${gameplanPhaseKeys
          .map((key) => renderField(`matchFocus.phasePrinciples.${key}`, gameplanPhaseLabels[key], focus.phasePrinciples[key], { rows: 3 }))
          .join("")}
      </div>
      <div class="gameplan-mini-editor-list">
        ${
          focus.miniGamePrinciples.length
            ? focus.miniGamePrinciples
                .map(
                  (item) => `
                    <article class="gameplan-mini-editor-row">
                      <input value="${escapeHtml(item.principle)}" data-gameplan-mini-principle="${escapeHtml(item.id)}" data-gameplan-mini-field="principle" ${disabled ? "disabled" : ""} aria-label="Mini-game principle">
                      <input value="${escapeHtml(item.phase || "")}" data-gameplan-mini-principle="${escapeHtml(item.id)}" data-gameplan-mini-field="phase" ${disabled ? "disabled" : ""} aria-label="Mini-game principle phase">
                      <select data-gameplan-mini-principle="${escapeHtml(item.id)}" data-gameplan-mini-field="playerId" ${disabled ? "disabled" : ""} aria-label="Mini-game principle player">
                        ${renderPlayerSelectOptions(item.playerIds?.[0] || "")}
                      </select>
                      <button type="button" data-gameplan-remove-mini-principle="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>Remove</button>
                    </article>
                  `
                )
                .join("")
            : `<div class="gameplan-empty-small">Sync week focus or add a mini-game principle manually.</div>`
        }
      </div>
    </section>
  `;
}

function renderCommandScenarioCard(item, index) {
  const disabled = !canEditPlan();
  return `
    <article class="gameplan-command-trigger">
      <div class="gameplan-command-trigger-head">
        <strong>${index + 1}</strong>
        <input value="${escapeHtml(item.title)}" data-gameplan-scenario="${escapeHtml(item.id)}" data-gameplan-scenario-field="title" ${disabled ? "disabled" : ""} aria-label="Decision trigger title">
        <select data-gameplan-scenario="${escapeHtml(item.id)}" data-gameplan-scenario-field="status" ${disabled ? "disabled" : ""} aria-label="Decision trigger status">
          ${renderOptions(gameplanScenarioStatusOptions, item.status || "open")}
        </select>
      </div>
      <div class="gameplan-command-trigger-body">
        <label>
          <span>If</span>
          <textarea rows="2" data-gameplan-scenario="${escapeHtml(item.id)}" data-gameplan-scenario-field="trigger" ${disabled ? "disabled" : ""}>${escapeHtml(item.trigger)}</textarea>
        </label>
        <label>
          <span>Then</span>
          <textarea rows="2" data-gameplan-scenario="${escapeHtml(item.id)}" data-gameplan-scenario-field="staffAction" ${disabled ? "disabled" : ""}>${escapeHtml(item.staffAction)}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderPlanBriefingTab(plan) {
  const scenarioCards = (plan.scenarioCards || []).slice(0, 3);
  const evidenceCount = (plan.evidence || []).length;
  return `
    <section class="gameplan-panel gameplan-briefing-layout">
      <section class="gameplan-card gameplan-card-span gameplan-briefing-command-card">
        <header class="gameplan-briefing-header">
          <div>
            <span>Match Command</span>
          </div>
          ${renderPlanModeSwitch(plan)}
        </header>
        <div class="gameplan-briefing-command">
          <div class="gameplan-briefing-lead">
            <span>Match objective</span>
            <p>${renderBriefingText(plan.summary?.objective, "Match objective not set")}</p>
          </div>
          <div class="gameplan-briefing-metrics">
            ${renderBriefingMetric("3 non-negotiables", plan.summary?.nonNegotiables, "Non-negotiables not set")}
            ${renderBriefingMetric("Key opponent threat", plan.opponentPlan?.threats, "Opponent threat not set")}
            ${renderBriefingMetric("Our main advantage", plan.opponentPlan?.weakZones, "Main advantage not set")}
          </div>
        </div>
        <div class="gameplan-briefing-evidence">
          <div>
            <span>Evidence</span>
            <strong>${evidenceCount}</strong>
          </div>
          ${renderEvidenceChips(plan)}
        </div>
      </section>
      ${renderLineupOverview(plan)}
      ${renderWeekFocusOverview(plan)}
      <section class="gameplan-card gameplan-card-span">
        <header><span>Top 3 Decision Triggers</span></header>
        <div class="gameplan-brief-trigger-list">
          ${
            scenarioCards.length
              ? scenarioCards.map(renderBriefingTrigger).join("")
              : `<div class="gameplan-empty-small">No decision triggers yet.</div>`
          }
        </div>
      </section>
    </section>
  `;
}

function renderPlanEditTab(plan) {
  const scenarioCards = (plan.scenarioCards || []).slice(0, 3);
  const canAddTrigger = canEditPlan() && (plan.scenarioCards || []).length < 3;
  return `
    <section class="gameplan-panel gameplan-command-grid">
      <section class="gameplan-card gameplan-card-span gameplan-command-card">
        <header>
          <span>Match Command</span>
          <div class="gameplan-card-actions">
            ${renderPlanModeSwitch(plan)}
            <button type="button" data-gameplan-add-evidence ${!canEditPlan() ? "disabled" : ""}>Add evidence</button>
          </div>
        </header>
        <div class="gameplan-command-summary">
          ${renderField("summary.objective", "Match objective", plan.summary?.objective, { rows: 2 })}
          ${renderField("summary.nonNegotiables", "3 non-negotiables", plan.summary?.nonNegotiables, { rows: 2 })}
          ${renderField("opponentPlan.threats", "Key opponent threat", plan.opponentPlan?.threats, { rows: 2 })}
          ${renderField("opponentPlan.weakZones", "Our main advantage", plan.opponentPlan?.weakZones, { rows: 2 })}
        </div>
        ${renderEvidenceChips(plan)}
        ${renderEvidenceQuickEditor(plan)}
        ${renderEvidenceSourcePanel(plan)}
      </section>
      ${renderLineupEditor(plan)}
      ${renderWeekFocusEditor(plan)}
      <section class="gameplan-card gameplan-card-span">
        <header>
          <span>Top 3 Decision Triggers</span>
          <button type="button" data-gameplan-add-scenario ${!canAddTrigger ? "disabled" : ""}>Add trigger</button>
        </header>
        <div class="gameplan-command-triggers">
          ${
            scenarioCards.length
              ? scenarioCards.map(renderCommandScenarioCard).join("")
              : `<div class="gameplan-empty-small">No decision triggers yet.</div>`
          }
        </div>
      </section>
    </section>
  `;
}

function renderPlanTab(plan) {
  return getGameplanPlanMode(plan) === "edit" ? renderPlanEditTab(plan) : renderPlanBriefingTab(plan);
}

function renderRoleResponsibilityItem(item = {}) {
  const owner = item.userId ? getUserName(item.userId) : item.ownerName || "Unassigned";
  return `
    <article class="gameplan-role-item">
      <div>
        <strong>${escapeHtml(item.area || item.role || "Responsibility")}</strong>
        <span>${escapeHtml([item.role, owner].filter(Boolean).join(" · "))}</span>
      </div>
      ${item.watchFor ? `<p>${escapeHtml(item.watchFor)}</p>` : ""}
      ${item.decisionTrigger ? `<small>${escapeHtml(item.decisionTrigger)}</small>` : ""}
    </article>
  `;
}

function renderRoleEvidenceItem(item = {}) {
  const meta = [getEvidenceMetaLabel(item), item.phase].filter(Boolean).join(" · ");
  const title = item.title || item.source || "Evidence";
  return `
    <article class="gameplan-role-item">
      <div>
        <strong>${escapeHtml(title)}</strong>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      </div>
      ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
      ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(getEvidenceOpenLabel(item))}</a>` : ""}
    </article>
  `;
}

function renderRoleLens(plan) {
  const currentUser = getCurrentUser();
  const currentUserName = getPersonLabel(currentUser) || "Current staff";
  const myResponsibilities = getCurrentUserResponsibilities(plan);
  const analystResponsibilities = getRoleResponsibilities(plan, ["analyst", "analysis", "opponent", "trend", "evidence", "scout"]);
  const keeperResponsibilities = getRoleResponsibilities(plan, ["goalkeeper", "keeper", "gk", "box"]);
  const evidence = plan.evidence || [];
  const keepers = getSquadPlayers().filter((player) => textMatchesAny(`${player.position} ${player.roleGroup}`, ["goalkeeper", "keeper", "gk"]));
  const selectedPlayerIds = new Set(plan.playerBrief?.audiencePlayerIds || []);
  const selectedKeepers = keepers.filter((player) => selectedPlayerIds.has(player.id));
  const keeperNotes = selectedKeepers
    .map((player) => ({
      player,
      note: plan.playerBrief?.individualNotes?.[player.id] || plan.playerBrief?.individualFocus || "",
    }))
    .filter((entry) => entry.note);
  const selectedPlayers = getSelectedBriefPlayers(plan);
  const individualNoteCount = Object.values(plan.playerBrief?.individualNotes || {}).filter(Boolean).length;
  return `
    <section class="gameplan-role-lens" aria-label="Role-specific Gameplan views">
      <article class="gameplan-role-card">
        <header>
          <span>My Responsibilities</span>
          <strong>${escapeHtml(currentUserName)}</strong>
        </header>
        <div class="gameplan-role-list">
          ${
            myResponsibilities.length
              ? myResponsibilities.map(renderRoleResponsibilityItem).join("")
              : `<div class="gameplan-empty-small">No role assigned yet.</div>`
          }
        </div>
      </article>
      <article class="gameplan-role-card">
        <header>
          <span>Analyst Evidence</span>
          <strong>${evidence.length} item${evidence.length === 1 ? "" : "s"}</strong>
        </header>
        <div class="gameplan-role-list">
          ${evidence.length ? evidence.slice(0, 4).map(renderRoleEvidenceItem).join("") : `<div class="gameplan-empty-small">No evidence linked.</div>`}
          ${
            !evidence.length && analystResponsibilities.length
              ? analystResponsibilities.slice(0, 2).map(renderRoleResponsibilityItem).join("")
              : ""
          }
        </div>
      </article>
      <article class="gameplan-role-card">
        <header>
          <span>Keeper Brief</span>
          <strong>${selectedKeepers.length}/${keepers.length}</strong>
        </header>
        <div class="gameplan-role-list">
          ${keeperResponsibilities.length ? keeperResponsibilities.slice(0, 2).map(renderRoleResponsibilityItem).join("") : ""}
          ${
            keeperNotes.length
              ? keeperNotes
                  .map(
                    ({ player, note }) => `
                      <article class="gameplan-role-item">
                        <div>
                          <strong>${escapeHtml(player.name || "Goalkeeper")}</strong>
                          <span>${escapeHtml(player.position || player.roleGroup || "Goalkeeper")}</span>
                        </div>
                        <p>${escapeHtml(note)}</p>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="gameplan-empty-small">No keeper-specific note yet.</div>`
          }
        </div>
      </article>
      <article class="gameplan-role-card">
        <header>
          <span>Player-Safe View</span>
          <strong>${selectedPlayers.length}</strong>
        </header>
        <div class="gameplan-role-list">
          <article class="gameplan-role-item">
            <div>
              <strong>${plan.playerBrief?.publishedAt ? "Published" : "Not published"}</strong>
              <span>${plan.playerBrief?.publishedAt ? escapeHtml(formatTimestamp(plan.playerBrief.publishedAt)) : "Player Brief"}</span>
            </div>
            <p>${escapeHtml(`${selectedPlayers.length} selected player${selectedPlayers.length === 1 ? "" : "s"} · ${individualNoteCount} individual note${individualNoteCount === 1 ? "" : "s"}`)}</p>
          </article>
        </div>
      </article>
    </section>
  `;
}

function renderStaffResponsibilityCard(item) {
  const disabled = !canEditPlan();
  return `
    <article class="gameplan-staff-card" data-gameplan-staff-card="${escapeHtml(item.id)}">
      <div class="gameplan-staff-top">
        <label>
          <span>Owner</span>
          <select data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="userId" ${disabled ? "disabled" : ""}>
            ${renderUserOptions(item.userId)}
          </select>
        </label>
        <label>
          <span>Role</span>
          <input value="${escapeHtml(item.role)}" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="role" ${disabled ? "disabled" : ""}>
        </label>
        <button type="button" data-gameplan-remove-staff="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>Remove</button>
      </div>
      <label>
        <span>Area</span>
        <input value="${escapeHtml(item.area)}" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="area" ${disabled ? "disabled" : ""}>
      </label>
      <div class="gameplan-staff-fields">
        <label>
          <span>Watch for</span>
          <textarea rows="3" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="watchFor" ${disabled ? "disabled" : ""}>${escapeHtml(item.watchFor)}</textarea>
        </label>
        <label>
          <span>Halftime report</span>
          <textarea rows="3" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="reportAtHalftime" ${disabled ? "disabled" : ""}>${escapeHtml(item.reportAtHalftime)}</textarea>
        </label>
        <label>
          <span>Decision trigger</span>
          <textarea rows="3" data-gameplan-staff="${escapeHtml(item.id)}" data-gameplan-staff-field="decisionTrigger" ${disabled ? "disabled" : ""}>${escapeHtml(item.decisionTrigger)}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderStaffTab(plan) {
  return `
    <section class="gameplan-panel">
      ${renderRoleLens(plan)}
      ${renderMeetingPanel(plan)}
      <section class="gameplan-card">
        <header>
          <span>Staff Responsibilities</span>
          <button type="button" data-gameplan-add-staff ${!canEditPlan() ? "disabled" : ""}>Add role</button>
        </header>
        <div class="gameplan-staff-list">
          ${(plan.staffResponsibilities || []).map(renderStaffResponsibilityCard).join("")}
        </div>
      </section>
    </section>
  `;
}

function renderMeetingPanel(plan) {
  const meeting = plan.meeting || {};
  return `
    <section class="gameplan-card">
      <header>
        <span>Staff Meeting</span>
        <button type="button" data-gameplan-approve-meeting ${!canEditPlan() ? "disabled" : ""}>Approve plan</button>
      </header>
      <div class="gameplan-form-grid">
        ${renderField("meeting.agenda", "Agenda", meeting.agenda, { rows: 5 })}
        ${renderField("meeting.decisions", "Decisions locked", meeting.decisions, { rows: 5 })}
      </div>
      <div class="gameplan-inline-status">
        <strong>${meeting.approvedAt ? "Approved" : "Not approved"}</strong>
        <span>${meeting.approvedAt ? escapeHtml(formatTimestamp(meeting.approvedAt)) : "Head Coach sign-off needed before sharing final brief."}</span>
      </div>
    </section>
  `;
}

function renderPlayerAudience(plan) {
  const selected = new Set(plan.playerBrief?.audiencePlayerIds || []);
  const players = getSquadPlayers();
  return `
    <section class="gameplan-player-audience">
      <header>
        <span>Audience</span>
        <div>
          <button type="button" data-gameplan-audience="all" ${!canEditPlan() ? "disabled" : ""}>All</button>
          <button type="button" data-gameplan-audience="none" ${!canEditPlan() ? "disabled" : ""}>None</button>
        </div>
      </header>
      <div class="gameplan-player-list">
        ${
          players.length
            ? players
                .map(
                  (player) => `
                    <label class="gameplan-player-pill">
                      <input type="checkbox" data-gameplan-player-audience="${escapeHtml(player.id)}" ${selected.has(player.id) ? "checked" : ""} ${!canEditPlan() ? "disabled" : ""}>
                      <span>${escapeHtml(player.number ? `#${player.number}` : "")}</span>
                      <strong>${escapeHtml(player.name || "Player")}</strong>
                      <small>${escapeHtml(player.position || player.roleGroup || "")}</small>
                    </label>
                  `
                )
                .join("")
            : `<div class="gameplan-empty-small">No squad players found.</div>`
        }
      </div>
    </section>
  `;
}

function renderPlayerBriefPreview(plan) {
  const brief = plan.playerBrief || {};
  const selected = new Set(brief.audiencePlayerIds || []);
  const players = getSquadPlayers().filter((player) => selected.has(player.id));
  const individualNoteCount = Object.values(brief.individualNotes || {}).filter(Boolean).length;
  return `
    <section class="gameplan-player-preview">
      <div class="gameplan-player-preview-card">
        <p>${escapeHtml(plan.opponent || plan.title || "Match")}</p>
        <h2>${escapeHtml(brief.headline || "Player Brief")}</h2>
        ${brief.message ? `<strong>${escapeHtml(brief.message)}</strong>` : ""}
        ${brief.focus ? `<section><span>Team focus</span><p>${escapeHtml(brief.focus)}</p></section>` : ""}
        ${brief.positionGroupFocus ? `<section><span>Position group focus</span><p>${escapeHtml(brief.positionGroupFocus)}</p></section>` : ""}
        <div class="gameplan-player-preview-phases">
          ${gameplanPhaseKeys
            .map((key) =>
              brief.phases?.[key]
                ? `<section><span>${escapeHtml(gameplanPhaseLabels[key])}</span><p>${escapeHtml(brief.phases[key])}</p></section>`
                : ""
            )
            .join("")}
        </div>
        ${brief.individualFocus ? `<section><span>Individual focus</span><p>${escapeHtml(brief.individualFocus)}</p></section>` : ""}
        <footer>
          <span>${players.length} selected player${players.length === 1 ? "" : "s"}</span>
          <span>${individualNoteCount} individual note${individualNoteCount === 1 ? "" : "s"}</span>
          ${brief.publishedAt ? `<span>Published ${escapeHtml(formatTimestamp(brief.publishedAt))}</span>` : `<span>Not published</span>`}
        </footer>
      </div>
    </section>
  `;
}

function renderBriefMiniGamePrinciples(brief = {}) {
  const items = Array.isArray(brief.miniGamePrinciples) ? brief.miniGamePrinciples : [];
  if (!items.length) return "";
  const text = items
    .map((item) => [item.phase, item.principle].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");
  return text ? `<section><span>Mini-game focus</span><p>${escapeHtml(text)}</p></section>` : "";
}

function renderPlayerBriefDelivery(plan) {
  const players = getSelectedBriefPlayers(plan);
  const acknowledgedCount = players.filter((player) => getBriefReceipt(plan, player.id)?.acknowledgedAt).length;
  const openedCount = players.filter((player) => getBriefReceipt(plan, player.id)?.lastOpenedAt).length;
  const isPublished = Boolean(plan.playerBrief?.publishedAt);
  const secureLinksRequired = requiresSignedPlayerBriefLinks();
  return `
    <section class="gameplan-delivery-panel">
      <header>
        <div>
          <span>Player Portal</span>
          <strong>${acknowledgedCount}/${players.length} acknowledged</strong>
        </div>
        <small>${openedCount} opened${isPublished ? "" : " · publish before sharing"}</small>
      </header>
      <div class="gameplan-delivery-list">
        ${
          players.length
            ? players
                .map((player) => {
                  const receipt = getBriefReceipt(plan, player.id);
                  const fallbackUrl = getPlayerBriefUrl(plan.id, player.id);
                  const url = secureLinksRequired ? "" : fallbackUrl;
                  return `
                    <article class="gameplan-delivery-row">
                      <div>
                        <strong>${escapeHtml(player.name || "Player")}</strong>
                        <span>${escapeHtml(getReceiptLabel(receipt))}</span>
                      </div>
                      <input data-gameplan-player-brief-link readonly value="${escapeHtml(url)}" placeholder="${secureLinksRequired ? "Generate secure link" : ""}" aria-label="${escapeHtml(`${player.name || "Player"} brief link`)}">
                      <button type="button" data-gameplan-sign-brief-link data-gameplan-sign-plan="${escapeHtml(plan.id)}" data-gameplan-sign-player="${escapeHtml(player.id)}" ${!isPublished || !canEditPlan(plan) ? "disabled" : ""}>Secure</button>
                      <button type="button" data-gameplan-copy-brief-link="${escapeHtml(url)}" ${!url ? "disabled" : ""}>Copy</button>
                      <a href="${escapeHtml(url || "#")}" target="_blank" rel="noopener" class="${url ? "" : "is-disabled"}" ${url ? "" : "aria-disabled=\"true\""}>Open</a>
                    </article>
                  `;
                })
                .join("")
            : `<div class="gameplan-empty-small">Select players to generate individual brief links.</div>`
        }
      </div>
    </section>
  `;
}

function renderIndividualBriefNotes(plan) {
  const players = getSelectedBriefPlayers(plan);
  const notes = plan.playerBrief?.individualNotes || {};
  const disabled = !canEditPlan();
  return `
    <section class="gameplan-card gameplan-individual-notes">
      <header><span>Individual Player Notes</span></header>
      <div class="gameplan-individual-note-list">
        ${
          players.length
            ? players
                .map(
                  (player) => `
                    <label class="gameplan-field">
                      <span>${escapeHtml(player.name || "Player")}</span>
                      <textarea rows="3" data-gameplan-field="playerBrief.individualNotes.${escapeHtml(player.id)}" ${disabled ? "disabled" : ""}>${escapeHtml(notes[player.id] || "")}</textarea>
                    </label>
                  `
                )
                .join("")
            : `<div class="gameplan-empty-small">Select players to add individual instructions.</div>`
        }
      </div>
    </section>
  `;
}

function renderPlayerBriefTab(plan) {
  const brief = plan.playerBrief || {};
  return `
    <section class="gameplan-panel gameplan-player-layout">
      <section class="gameplan-card">
        <header>
          <span>Player Brief Builder</span>
          <button type="button" data-gameplan-publish-player-brief ${!canEditPlan() ? "disabled" : ""}>Publish brief</button>
        </header>
        <div class="gameplan-form-grid">
          ${renderField("playerBrief.headline", "Headline", brief.headline, { rows: 2 })}
          ${renderField("playerBrief.message", "Message", brief.message, { rows: 3 })}
          ${renderField("playerBrief.focus", "Team focus", brief.focus, { rows: 3, wide: true })}
          ${renderField("playerBrief.positionGroupFocus", "Position group focus", brief.positionGroupFocus, { rows: 3, wide: true })}
        </div>
        <div class="gameplan-phase-grid">
          ${gameplanPhaseKeys
            .map((key) => renderField(`playerBrief.phases.${key}`, gameplanPhaseLabels[key], brief.phases?.[key], { rows: 3 }))
            .join("")}
        </div>
        ${renderField("playerBrief.individualFocus", "Individual focus", brief.individualFocus, { rows: 3, wide: true })}
      </section>
      ${renderPlayerAudience(plan)}
      ${renderIndividualBriefNotes(plan)}
      ${renderPlayerBriefDelivery(plan)}
      ${renderPlayerBriefPreview(plan)}
    </section>
  `;
}

function renderPlayerBriefUnavailable(reason = "Brief unavailable.") {
  return `
    <section class="gameplan-player-portal">
      <main class="gameplan-player-portal-card is-empty">
        <p>Player Brief</p>
        <h1>Brief unavailable</h1>
        <span>${escapeHtml(reason)}</span>
      </main>
    </section>
  `;
}

function renderPlayerBriefLoading() {
  return `
    <section class="gameplan-player-portal">
      <main class="gameplan-player-portal-card is-empty">
        <p>Player Brief</p>
        <h1>Loading brief</h1>
        <span>Opening secure match brief.</span>
      </main>
    </section>
  `;
}

function renderPlayerBriefPortalCard({ plan = {}, player = {}, brief = {}, receipt = {}, acknowledgeMarkup = "" }) {
  const playerName = player?.name || "Player";
  const acknowledged = Boolean(receipt?.acknowledgedAt);
  return `
    <section class="gameplan-player-portal">
      <main class="gameplan-player-portal-card">
        <header>
          <p>${escapeHtml(playerName)}</p>
          <span>${escapeHtml(formatDate(plan.date))}${plan.kickoff ? ` · ${escapeHtml(plan.kickoff)}` : ""}</span>
        </header>
        <h1>${escapeHtml(brief.headline || "Player Brief")}</h1>
        ${brief.message ? `<strong>${escapeHtml(brief.message)}</strong>` : ""}
        <div class="gameplan-player-portal-meta">
          <span>${escapeHtml(plan.opponent || plan.title || "Match")}</span>
          ${plan.venue ? `<span>${escapeHtml(plan.venue)}</span>` : ""}
          ${brief.publishedAt ? `<span>Published ${escapeHtml(formatTimestamp(brief.publishedAt))}</span>` : ""}
        </div>
        ${brief.focus ? `<section><span>Team focus</span><p>${escapeHtml(brief.focus)}</p></section>` : ""}
        ${brief.positionGroupFocus ? `<section><span>Position group focus</span><p>${escapeHtml(brief.positionGroupFocus)}</p></section>` : ""}
        <div class="gameplan-player-portal-phases">
          ${gameplanPhaseKeys
            .map((key) =>
              brief.phases?.[key]
                ? `<section><span>${escapeHtml(gameplanPhaseLabels[key])}</span><p>${escapeHtml(brief.phases[key])}</p></section>`
                : ""
            )
            .join("")}
        </div>
        ${renderBriefMiniGamePrinciples(brief)}
        ${brief.individualFocus ? `<section><span>Individual focus</span><p>${escapeHtml(brief.individualFocus)}</p></section>` : ""}
        <footer>
          <span>${receipt?.lastOpenedAt ? `Opened ${escapeHtml(formatTimestamp(receipt.lastOpenedAt))}` : "Opened now"}</span>
          ${acknowledgeMarkup || `<button type="button" disabled>${acknowledged ? "Marked as read" : "Mark as read"}</button>`}
        </footer>
      </main>
    </section>
  `;
}

function renderSignedPlayerBriefPortal(route = {}) {
  const signedState = getSignedPlayerBriefState(route);
  if (!signedState.token || signedState.status === "idle" || signedState.status === "loading") {
    return renderPlayerBriefLoading();
  }
  if (signedState.status === "error") {
    return renderPlayerBriefUnavailable(signedState.reason || "This secure brief could not be opened.");
  }
  const payload = signedState.payload || {};
  if (!payload.ok && payload.reason) {
    return renderPlayerBriefUnavailable(payload.reason);
  }
  recordSignedPlayerBriefOpened(route.token);
  const acknowledged = Boolean(payload.receipt?.acknowledgedAt);
  return renderPlayerBriefPortalCard({
    plan: payload.plan,
    player: payload.player,
    brief: payload.brief,
    receipt: payload.receipt,
    acknowledgeMarkup: `<button type="button" data-gameplan-ack-player-brief-token="${escapeHtml(route.token)}" ${acknowledged ? "disabled" : ""}>
      ${acknowledged ? "Marked as read" : "Mark as read"}
    </button>`,
  });
}

function renderPlayerBriefPortal(route = {}) {
  if (route.token) {
    return renderSignedPlayerBriefPortal(route);
  }

  const plan = getPlanById(route.planId);
  const player = getPlayerById(route.playerId);
  const brief = plan?.playerBrief || {};
  const selected = new Set(brief.audiencePlayerIds || []);
  const receipt = plan ? getBriefReceipt(plan, route.playerId) : null;
  let reason = "";
  if (!plan) {
    reason = "Brief not found.";
  } else if (!brief.publishedAt) {
    reason = "This player brief has not been published yet.";
  } else if (!route.playerId || !selected.has(route.playerId)) {
    reason = "This brief is not assigned to this player.";
  }

  if (reason) {
    return renderPlayerBriefUnavailable(reason);
  }

  recordLocalPlayerBriefOpened(plan.id, route.playerId);
  const acknowledged = Boolean(receipt?.acknowledgedAt);
  return renderPlayerBriefPortalCard({
    plan,
    player,
    brief: getPlayerSpecificBrief(plan, route.playerId),
    receipt,
    acknowledgeMarkup: `<button type="button" data-gameplan-ack-player-brief="${escapeHtml(plan.id)}" data-gameplan-ack-player="${escapeHtml(route.playerId)}" ${acknowledged ? "disabled" : ""}>
      ${acknowledged ? "Marked as read" : "Mark as read"}
    </button>`,
  });
}

function renderObservationCard(item) {
  const disabled = !canEditPlan();
  return `
    <article class="gameplan-observation-card">
      <div class="gameplan-observation-top">
        <label>
          <span>Minute</span>
          <input value="${escapeHtml(item.minute)}" data-gameplan-observation="${escapeHtml(item.id)}" data-gameplan-observation-field="minute" ${disabled ? "disabled" : ""}>
        </label>
        <label>
          <span>Phase</span>
          <input value="${escapeHtml(item.phase)}" data-gameplan-observation="${escapeHtml(item.id)}" data-gameplan-observation-field="phase" ${disabled ? "disabled" : ""}>
        </label>
        <label>
          <span>Owner</span>
          <select data-gameplan-observation="${escapeHtml(item.id)}" data-gameplan-observation-field="ownerUserId" ${disabled ? "disabled" : ""}>
            ${renderUserOptions(item.ownerUserId)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select data-gameplan-observation="${escapeHtml(item.id)}" data-gameplan-observation-field="status" ${disabled ? "disabled" : ""}>
            ${renderOptions(gameplanObservationStatusOptions, item.status || "watching")}
          </select>
        </label>
        <button type="button" data-gameplan-remove-observation="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>Remove</button>
      </div>
      <div class="gameplan-form-grid">
        <label class="gameplan-field">
          <span>Observation</span>
          <textarea rows="3" data-gameplan-observation="${escapeHtml(item.id)}" data-gameplan-observation-field="observation" ${disabled ? "disabled" : ""}>${escapeHtml(item.observation)}</textarea>
        </label>
        <label class="gameplan-field">
          <span>Action / message</span>
          <textarea rows="3" data-gameplan-observation="${escapeHtml(item.id)}" data-gameplan-observation-field="action" ${disabled ? "disabled" : ""}>${escapeHtml(item.action)}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderMatchdayTab(plan) {
  const live = plan.live || {};
  const halftime = live.halftime || {};
  const observations = live.observations || [];
  const review = plan.review || {};
  const disabled = !canEditPlan();
  return `
    <section class="gameplan-panel gameplan-matchday-grid">
      <section class="gameplan-card">
        <header><span>Coach Mode</span></header>
        <div class="gameplan-form-grid">
          ${renderField("live.halftime.keyMessage", "Halftime message", halftime.keyMessage, { rows: 2 })}
          ${renderField("live.halftime.adjustments", "Adjustments", halftime.adjustments, { rows: 2 })}
          ${renderField("live.halftime.risks", "Risks", halftime.risks, { rows: 2, wide: true })}
        </div>
      </section>
      <section class="gameplan-card">
        <header>
          <span>Observations</span>
          <button type="button" data-gameplan-add-observation ${disabled ? "disabled" : ""}>Add observation</button>
        </header>
        <div class="gameplan-observation-list">
          ${
            observations.length
              ? observations.map(renderObservationCard).join("")
              : `<div class="gameplan-empty-small">No matchday observations yet.</div>`
          }
        </div>
      </section>
      <section class="gameplan-card">
        <header>
          <span>Matchday Checklist</span>
          <button type="button" data-gameplan-add-check ${disabled ? "disabled" : ""}>Add item</button>
        </header>
        <div class="gameplan-check-list">
          ${(plan.checklist || [])
            .map(
              (item) => `
                <article class="gameplan-check-item ${item.done ? "is-done" : ""}">
                  <input type="checkbox" data-gameplan-check-toggle="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} ${disabled ? "disabled" : ""}>
                  <input class="gameplan-check-stage" value="${escapeHtml(item.stage)}" data-gameplan-check="${escapeHtml(item.id)}" data-gameplan-check-field="stage" ${disabled ? "disabled" : ""}>
                  <input value="${escapeHtml(item.title)}" data-gameplan-check="${escapeHtml(item.id)}" data-gameplan-check-field="title" ${disabled ? "disabled" : ""}>
                  <select data-gameplan-check="${escapeHtml(item.id)}" data-gameplan-check-field="ownerUserId" ${disabled ? "disabled" : ""}>
                    ${renderUserOptions(item.ownerUserId)}
                  </select>
                  <button type="button" data-gameplan-remove-check="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>Remove</button>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
      <section class="gameplan-card">
        <header><span>After Action</span></header>
        <div class="gameplan-form-grid">
          ${renderField("review.outcome", "Outcome", review.outcome, { rows: 2 })}
          ${renderField("review.lessons", "Lessons", review.lessons, { rows: 2 })}
          ${renderField("review.trainingCarryover", "Training carryover", review.trainingCarryover, { rows: 2, wide: true })}
        </div>
      </section>
    </section>
  `;
}

function renderActiveTab(plan) {
  const tab = getState().activeTab || "plan";
  if (tab === "staff") return renderStaffTab(plan);
  if (tab === "player-brief") return renderPlayerBriefTab(plan);
  if (tab === "matchday") return renderMatchdayTab(plan);
  return renderPlanTab(plan);
}

export function render(context = {}) {
  setContext(context);
  const root = context.root || context.ui?.gameplanWorkspace || document.getElementById("gameplanWorkspace");
  if (!root) return;
  const playerBriefRoute = getPlayerBriefRoute();
  if (playerBriefRoute?.active) {
    root.innerHTML = renderPlayerBriefPortal(playerBriefRoute);
    return;
  }
  ensureSeedGameplan();
  const plan = getPlan();
  if (!plan) {
    root.innerHTML = `
      <section class="gameplan-shell">
        ${renderPlanList()}
        <main class="gameplan-main">
          <section class="gameplan-empty">
            <h2>No gameplan selected.</h2>
            <p>Create one from Schedule when the next match is ready.</p>
          </section>
        </main>
      </section>
    `;
    return;
  }
  root.innerHTML = `
    <section class="gameplan-shell">
      ${renderPlanList()}
      <main class="gameplan-main">
        ${renderHero(plan)}
        ${renderTabs()}
        ${renderActiveTab(plan)}
      </main>
    </section>
  `;
}

export async function handleClick(event, context = activeContext) {
  setContext(context);
  const acknowledgeTrigger = event.target.closest("[data-gameplan-ack-player-brief][data-gameplan-ack-player]");
  if (acknowledgeTrigger) {
    acknowledgeLocalPlayerBrief(acknowledgeTrigger.dataset.gameplanAckPlayerBrief, acknowledgeTrigger.dataset.gameplanAckPlayer);
    rerenderGameplan();
    return;
  }
  const signedAcknowledgeTrigger = event.target.closest("[data-gameplan-ack-player-brief-token]");
  if (signedAcknowledgeTrigger) {
    signedAcknowledgeTrigger.disabled = true;
    const didAcknowledge = await acknowledgeSignedPlayerBrief(signedAcknowledgeTrigger.dataset.gameplanAckPlayerBriefToken);
    if (!didAcknowledge) {
      signedAcknowledgeTrigger.disabled = false;
    }
    return;
  }
  const signBriefTrigger = event.target.closest("[data-gameplan-sign-brief-link]");
  if (signBriefTrigger) {
    const row = signBriefTrigger.closest(".gameplan-delivery-row");
    const planId = signBriefTrigger.dataset.gameplanSignPlan || "";
    const playerId = signBriefTrigger.dataset.gameplanSignPlayer || "";
    signBriefTrigger.disabled = true;
    signBriefTrigger.textContent = "Signing";
    const result = await createSignedPlayerBriefLink(planId, playerId);
    if (result?.ok && result.url) {
      row?.removeAttribute("data-gameplan-link-error");
      const input = row?.querySelector("[data-gameplan-player-brief-link]");
      const copyButton = row?.querySelector("[data-gameplan-copy-brief-link]");
      const openLink = row?.querySelector("a");
      if (input) {
        input.value = result.url;
      }
      if (copyButton) {
        copyButton.dataset.gameplanCopyBriefLink = result.url;
        copyButton.disabled = false;
      }
      if (openLink) {
        openLink.href = result.url;
        openLink.classList.remove("is-disabled");
        openLink.removeAttribute("aria-disabled");
      }
      signBriefTrigger.textContent = result.signed ? "Signed" : "Ready";
    } else {
      signBriefTrigger.textContent = "Retry";
      signBriefTrigger.disabled = false;
      row?.setAttribute("data-gameplan-link-error", result?.reason || "Could not sign link");
    }
    return;
  }
  const copyBriefTrigger = event.target.closest("[data-gameplan-copy-brief-link]");
  if (copyBriefTrigger) {
    const url = copyBriefTrigger.dataset.gameplanCopyBriefLink || "";
    navigator.clipboard?.writeText(url)?.catch?.(() => {});
    return;
  }
  const deleteTrigger = event.target.closest("[data-gameplan-delete]");
  if (deleteTrigger) {
    const plan = getPlanById(deleteTrigger.dataset.gameplanDelete);
    if (plan && canDeleteGameplan() && (await confirmGameplanArchive(plan))) {
      try {
        archiveGameplan(plan.id);
        rerenderGameplan();
      } catch {
        await confirmPlatformAction({
          eyebrow: "Gameplan",
          title: "Gameplan was not deleted",
          message: "The central save did not complete. No plan was removed. Please try again.",
          cancelLabel: "Close",
          confirmLabel: "Close",
          tone: "warning",
          win: activeContext?.win || globalThis.window,
        });
      }
    }
    return;
  }
  const openTrigger = event.target.closest("[data-gameplan-open]");
  if (openTrigger) {
    setActiveGameplan(openTrigger.dataset.gameplanOpen);
    rerenderGameplan();
    return;
  }
  const createTrigger = event.target.closest("[data-gameplan-create-match]");
  if (createTrigger) {
    createGameplanFromScheduleMatch(createTrigger.dataset.gameplanCreateMatch);
    rerenderGameplan();
    return;
  }
  const tabTrigger = event.target.closest("[data-gameplan-tab]");
  if (tabTrigger) {
    setGameplanActiveTab(tabTrigger.dataset.gameplanTab);
    rerenderGameplan();
    return;
  }
  const planModeTrigger = event.target.closest("[data-gameplan-plan-mode]");
  if (planModeTrigger) {
    setGameplanPlanMode(planModeTrigger.dataset.gameplanPlanMode);
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-staff]")) {
    addGameplanStaffResponsibility();
    rerenderGameplan();
    return;
  }
  const removeStaffTrigger = event.target.closest("[data-gameplan-remove-staff]");
  if (removeStaffTrigger) {
    removeGameplanStaffResponsibility(removeStaffTrigger.dataset.gameplanRemoveStaff);
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-scenario]")) {
    addGameplanScenarioCard();
    rerenderGameplan();
    return;
  }
  const removeScenarioTrigger = event.target.closest("[data-gameplan-remove-scenario]");
  if (removeScenarioTrigger) {
    removeGameplanScenarioCard(removeScenarioTrigger.dataset.gameplanRemoveScenario);
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-evidence]")) {
    addGameplanEvidenceItem();
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-sync-week-focus]")) {
    syncGameplanWeekFocus();
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-mini-principle]")) {
    addGameplanMiniPrinciple();
    rerenderGameplan();
    return;
  }
  const removeMiniTrigger = event.target.closest("[data-gameplan-remove-mini-principle]");
  if (removeMiniTrigger) {
    removeGameplanMiniPrinciple(removeMiniTrigger.dataset.gameplanRemoveMiniPrinciple);
    rerenderGameplan();
    return;
  }
  const linkEvidenceTrigger = event.target.closest("[data-gameplan-link-evidence]");
  if (linkEvidenceTrigger) {
    linkGameplanEvidenceCandidate(linkEvidenceTrigger.dataset.gameplanLinkEvidence);
    rerenderGameplan();
    return;
  }
  const removeEvidenceTrigger = event.target.closest("[data-gameplan-remove-evidence]");
  if (removeEvidenceTrigger) {
    removeGameplanEvidenceItem(removeEvidenceTrigger.dataset.gameplanRemoveEvidence);
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-approve-meeting]")) {
    approveGameplanMeeting();
    rerenderGameplan();
    return;
  }
  const audienceTrigger = event.target.closest("[data-gameplan-audience]");
  if (audienceTrigger) {
    setGameplanAudience(audienceTrigger.dataset.gameplanAudience);
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-publish-player-brief]")) {
    publishGameplanPlayerBrief();
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-check]")) {
    addGameplanChecklistItem();
    rerenderGameplan();
    return;
  }
  if (event.target.closest("[data-gameplan-add-observation]")) {
    addGameplanObservation();
    rerenderGameplan();
    return;
  }
  const removeObservationTrigger = event.target.closest("[data-gameplan-remove-observation]");
  if (removeObservationTrigger) {
    removeGameplanObservation(removeObservationTrigger.dataset.gameplanRemoveObservation);
    rerenderGameplan();
    return;
  }
  const removeCheckTrigger = event.target.closest("[data-gameplan-remove-check]");
  if (removeCheckTrigger) {
    removeGameplanChecklistItem(removeCheckTrigger.dataset.gameplanRemoveCheck);
    rerenderGameplan();
  }
}

export function handleInput(event, context = activeContext) {
  setContext(context);
  const field = event.target.closest("[data-gameplan-field]");
  if (field) {
    updateGameplanField(field.dataset.gameplanField, field.value);
    return;
  }
  const staffField = event.target.closest("[data-gameplan-staff][data-gameplan-staff-field]");
  if (staffField) {
    updateGameplanStaffResponsibility(staffField.dataset.gameplanStaff, {
      [staffField.dataset.gameplanStaffField]: staffField.value,
    });
    return;
  }
  const scenarioField = event.target.closest("[data-gameplan-scenario][data-gameplan-scenario-field]");
  if (scenarioField) {
    updateGameplanScenarioCard(scenarioField.dataset.gameplanScenario, {
      [scenarioField.dataset.gameplanScenarioField]: scenarioField.value,
    });
    return;
  }
  const evidenceField = event.target.closest("[data-gameplan-evidence][data-gameplan-evidence-field]");
  if (evidenceField) {
    updateGameplanEvidenceItem(evidenceField.dataset.gameplanEvidence, {
      [evidenceField.dataset.gameplanEvidenceField]: evidenceField.value,
    });
    return;
  }
  const miniField = event.target.closest("[data-gameplan-mini-principle][data-gameplan-mini-field]");
  if (miniField) {
    updateGameplanMiniPrinciple(miniField.dataset.gameplanMiniPrinciple, {
      [miniField.dataset.gameplanMiniField]: miniField.value,
    });
    return;
  }
  const observationField = event.target.closest("[data-gameplan-observation][data-gameplan-observation-field]");
  if (observationField) {
    updateGameplanObservation(observationField.dataset.gameplanObservation, {
      [observationField.dataset.gameplanObservationField]: observationField.value,
    });
    return;
  }
  const checkField = event.target.closest("[data-gameplan-check][data-gameplan-check-field]");
  if (checkField) {
    updateGameplanChecklistItem(checkField.dataset.gameplanCheck, {
      [checkField.dataset.gameplanCheckField]: checkField.value,
    });
  }
}

export function handleChange(event, context = activeContext) {
  setContext(context);
  const lineupField = event.target.closest("[data-gameplan-lineup-player][data-gameplan-lineup-group]");
  if (lineupField) {
    toggleGameplanLineupPlayer(
      lineupField.dataset.gameplanLineupPlayer,
      lineupField.dataset.gameplanLineupGroup,
      lineupField.checked
    );
    rerenderGameplan();
    return;
  }
  const field = event.target.closest("[data-gameplan-field]");
  if (field) {
    updateGameplanField(field.dataset.gameplanField, field.value);
    if (field.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const audiencePlayer = event.target.closest("[data-gameplan-player-audience]");
  if (audiencePlayer) {
    toggleGameplanAudiencePlayer(audiencePlayer.dataset.gameplanPlayerAudience, audiencePlayer.checked);
    rerenderGameplan();
    return;
  }
  const checkToggle = event.target.closest("[data-gameplan-check-toggle]");
  if (checkToggle) {
    updateGameplanChecklistItem(checkToggle.dataset.gameplanCheckToggle, { done: checkToggle.checked });
    rerenderGameplan();
    return;
  }
  const staffField = event.target.closest("[data-gameplan-staff][data-gameplan-staff-field]");
  if (staffField) {
    updateGameplanStaffResponsibility(staffField.dataset.gameplanStaff, {
      [staffField.dataset.gameplanStaffField]: staffField.value,
    });
    if (staffField.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const scenarioField = event.target.closest("[data-gameplan-scenario][data-gameplan-scenario-field]");
  if (scenarioField) {
    updateGameplanScenarioCard(scenarioField.dataset.gameplanScenario, {
      [scenarioField.dataset.gameplanScenarioField]: scenarioField.value,
    });
    if (scenarioField.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const evidenceField = event.target.closest("[data-gameplan-evidence][data-gameplan-evidence-field]");
  if (evidenceField) {
    updateGameplanEvidenceItem(evidenceField.dataset.gameplanEvidence, {
      [evidenceField.dataset.gameplanEvidenceField]: evidenceField.value,
    });
    if (evidenceField.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const miniField = event.target.closest("[data-gameplan-mini-principle][data-gameplan-mini-field]");
  if (miniField) {
    updateGameplanMiniPrinciple(miniField.dataset.gameplanMiniPrinciple, {
      [miniField.dataset.gameplanMiniField]: miniField.value,
    });
    if (miniField.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const observationField = event.target.closest("[data-gameplan-observation][data-gameplan-observation-field]");
  if (observationField) {
    updateGameplanObservation(observationField.dataset.gameplanObservation, {
      [observationField.dataset.gameplanObservationField]: observationField.value,
    });
    if (observationField.matches("select")) {
      rerenderGameplan();
    }
    return;
  }
  const checkField = event.target.closest("[data-gameplan-check][data-gameplan-check-field]");
  if (checkField) {
    updateGameplanChecklistItem(checkField.dataset.gameplanCheck, {
      [checkField.dataset.gameplanCheckField]: checkField.value,
    });
    if (checkField.matches("select")) {
      rerenderGameplan();
    }
  }
}

export function handleSubmit(event) {
  event.preventDefault();
}
