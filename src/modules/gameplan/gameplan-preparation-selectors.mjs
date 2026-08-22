import {
  periodizationMiniGamePrinciplesBySubPhase,
  periodizationPhaseLibrary,
  periodizationTeamPrinciplesBySubPhase,
} from "../periodization/periodization-state.mjs";

export const gameplanCommandPhases = Object.freeze([
  { key: "inPossession", label: "In Possession" },
  { key: "outOfPossession", label: "Out of Possession" },
  { key: "attackingTransition", label: "Offensive Transition" },
  { key: "defensiveTransition", label: "Defensive Transition" },
]);

const commandPhaseKeySet = new Set(gameplanCommandPhases.map((phase) => phase.key));

function normalizeToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const phaseKeyByLabel = new Map([
  ["in possession", "inPossession"],
  ["inpossession", "inPossession"],
  ["out of possession", "outOfPossession"],
  ["outofpossession", "outOfPossession"],
  ["offensive transition", "attackingTransition"],
  ["attacking transition", "attackingTransition"],
  ["attackingtransition", "attackingTransition"],
  ["defensive transition", "defensiveTransition"],
  ["defensivetransition", "defensiveTransition"],
]);

const phaseKeyBySubPhase = new Map();
Object.entries(periodizationPhaseLibrary).forEach(([phaseLabel, subPhases]) => {
  const phaseKey = phaseKeyByLabel.get(normalizeToken(phaseLabel)) || "";
  if (!phaseKey) return;
  subPhases.forEach((subPhase) => phaseKeyBySubPhase.set(normalizeToken(subPhase), phaseKey));
});

function resolveLibraryGroupPhaseKey(groupLabel = "") {
  const direct = phaseKeyBySubPhase.get(normalizeToken(groupLabel));
  if (direct) return direct;
  const matchingKeys = [...phaseKeyBySubPhase.entries()]
    .filter(([subPhase]) => normalizeToken(groupLabel).includes(subPhase))
    .map(([, phaseKey]) => phaseKey);
  return matchingKeys.length && matchingKeys.every((phaseKey) => phaseKey === matchingKeys[0]) ? matchingKeys[0] : "";
}

function createPrinciplePhaseIndex(library = {}) {
  const index = new Map();
  Object.entries(library).forEach(([groupLabel, principles]) => {
    const phaseKey = resolveLibraryGroupPhaseKey(groupLabel);
    if (!phaseKey) return;
    principles.forEach((principle) => index.set(normalizeToken(principle), phaseKey));
  });
  return index;
}

const teamPrinciplePhaseIndex = createPrinciplePhaseIndex(periodizationTeamPrinciplesBySubPhase);
const miniPrinciplePhaseIndex = createPrinciplePhaseIndex(periodizationMiniGamePrinciplesBySubPhase);

function splitStructuredValues(value = "") {
  const values = Array.isArray(value) ? value : String(value || "").split(/\s*(?:\/|\||;|,|\n)\s*/);
  return values.map((entry) => String(entry || "").trim()).filter(Boolean);
}

export function splitGameplanPrinciples(value = "") {
  return String(value || "")
    .split(/\n|;|\u2022|\|/)
    .map((item) => item.replace(/^[-\d.)\s]+/, "").trim())
    .filter((item) => item.length >= 3);
}

export function resolveGameplanPhaseKeys({ phase = "", subPhase = "" } = {}) {
  const keys = [];
  [...splitStructuredValues(phase), ...splitStructuredValues(subPhase)].forEach((value) => {
    const token = normalizeToken(value);
    const direct = phaseKeyByLabel.get(token) || phaseKeyBySubPhase.get(token) || "";
    if (direct && !keys.includes(direct)) keys.push(direct);
  });
  return keys;
}

function parseDateValue(value = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateValue(date = null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getPreparationDates(matchDateValue = "", lookbackDays = 5) {
  const matchDate = parseDateValue(matchDateValue);
  if (!matchDate) return [];
  return Array.from({ length: lookbackDays }, (_, index) => {
    const date = new Date(matchDate);
    const daysBeforeMatch = lookbackDays - index;
    date.setDate(date.getDate() - daysBeforeMatch);
    return { date: formatDateValue(date), mdLabel: `MD-${daysBeforeMatch}` };
  });
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function createSourceEntry({ date, phaseKey, principle, kind = "team", source, sourceId = "", sourceTitle = "" }) {
  const normalizedPrinciple = String(principle || "").trim();
  if (!normalizedPrinciple || !commandPhaseKeySet.has(phaseKey)) return null;
  return {
    id: `${source}:${date}:${sourceId}:${kind}:${normalizeToken(normalizedPrinciple)}`,
    date,
    phaseKey,
    principle: normalizedPrinciple,
    kind,
    source,
    sourceId,
    sourceTitle,
  };
}

function resolvePrinciplePhaseKey(principle = "", phaseKeys = [], kind = "team") {
  const index = kind === "mini" ? miniPrinciplePhaseIndex : teamPrinciplePhaseIndex;
  return index.get(normalizeToken(principle)) || (phaseKeys.length === 1 ? phaseKeys[0] : "");
}

function collectPeriodizationEntries(date = "", day = {}) {
  const explicitPhaseKeys = resolveGameplanPhaseKeys({ phase: day.matchPhases, subPhase: day.subPhases });
  const entries = [];
  (Array.isArray(day.teamPrinciples) ? day.teamPrinciples : []).forEach((principle) => {
    const phaseKey = resolvePrinciplePhaseKey(principle, explicitPhaseKeys, "team");
    const entry = createSourceEntry({
      date,
      phaseKey,
      principle,
      kind: "team",
      source: "Periodization",
      sourceId: date,
      sourceTitle: day.mainFocus || day.sessionType || "Weekly plan",
    });
    if (entry) entries.push(entry);
  });
  (Array.isArray(day.miniGamePrinciples) ? day.miniGamePrinciples : []).forEach((principle) => {
    const phaseKey = resolvePrinciplePhaseKey(principle, explicitPhaseKeys, "mini");
    const entry = createSourceEntry({
      date,
      phaseKey,
      principle,
      kind: "mini",
      source: "Periodization",
      sourceId: date,
      sourceTitle: day.mainFocus || day.sessionType || "Weekly plan",
    });
    if (entry) entries.push(entry);
  });
  return { entries, phaseKeys: explicitPhaseKeys };
}

function collectSessionEntries(date = "", session = {}) {
  const entries = [];
  const phaseKeys = [];
  (Array.isArray(session.blocks) ? session.blocks : []).forEach((block) => {
    const blockPhaseKeys = resolveGameplanPhaseKeys({ phase: block.phase, subPhase: block.subPhase });
    phaseKeys.push(...blockPhaseKeys);
    splitGameplanPrinciples(block.principles).forEach((principle) => {
      const kind = miniPrinciplePhaseIndex.has(normalizeToken(principle)) ? "mini" : "team";
      const phaseKey = resolvePrinciplePhaseKey(principle, blockPhaseKeys, kind);
      const entry = createSourceEntry({
        date,
        phaseKey,
        principle,
        kind,
        source: "Session Planner",
        sourceId: block.id || "",
        sourceTitle: block.title || session.title || "Training session",
      });
      if (entry) entries.push(entry);
    });
  });
  return { entries, phaseKeys: unique(phaseKeys) };
}

function aggregateCandidates(entries = [], kind = "team") {
  const grouped = new Map();
  entries.filter((entry) => entry.kind === kind).forEach((entry) => {
    const key = `${entry.phaseKey}:${normalizeToken(entry.principle)}`;
    const current = grouped.get(key) || {
      id: key,
      phaseKey: entry.phaseKey,
      principle: entry.principle,
      kind,
      dates: [],
      sources: [],
      sourceRefs: [],
      occurrences: 0,
    };
    current.dates = unique([...current.dates, entry.date]).sort();
    current.sources = unique([...current.sources, entry.source]);
    current.sourceRefs = unique([...current.sourceRefs, entry.id]);
    current.occurrences += 1;
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((first, second) => {
    if (second.occurrences !== first.occurrences) return second.occurrences - first.occurrences;
    const recentOrder = String(second.dates.at(-1) || "").localeCompare(String(first.dates.at(-1) || ""));
    if (recentOrder) return recentOrder;
    return first.principle.localeCompare(second.principle);
  });
}

export function buildGameplanPreparation({ plan = {}, sessionState = {}, periodizationState = {} } = {}) {
  const preparationDates = getPreparationDates(plan.date, 5);
  const entries = [];
  const days = preparationDates.map(({ date, mdLabel }) => {
    const periodizationDay = periodizationState.days?.[date] || {};
    const session = sessionState.sessions?.[date] || {};
    const periodization = collectPeriodizationEntries(date, periodizationDay);
    const plannedSession = collectSessionEntries(date, session);
    const dayEntries = [...periodization.entries, ...plannedSession.entries];
    entries.push(...dayEntries);
    return {
      date,
      mdLabel,
      title: session.title || periodizationDay.sessionType || periodizationDay.daySchedule || "",
      phaseKeys: unique([...periodization.phaseKeys, ...plannedSession.phaseKeys]),
      teamPrinciples: unique(dayEntries.filter((entry) => entry.kind === "team").map((entry) => entry.principle)),
      miniGamePrinciples: unique(dayEntries.filter((entry) => entry.kind === "mini").map((entry) => entry.principle)),
      sources: unique(dayEntries.map((entry) => entry.source)),
    };
  });
  const activeDates = unique(entries.map((entry) => entry.date)).sort();
  return {
    days,
    entries,
    sourceWindow: activeDates.length ? `${activeDates[0]} to ${activeDates.at(-1)}` : "",
    teamCandidates: aggregateCandidates(entries, "team"),
    miniGameCandidates: aggregateCandidates(entries, "mini"),
  };
}

export function getGameplanPhaseLabel(phaseKey = "") {
  return gameplanCommandPhases.find((phase) => phase.key === phaseKey)?.label || "Match focus";
}
