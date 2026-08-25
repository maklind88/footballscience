import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import { normalizeClipAnalysisFact } from "./clipAnalysisFactService.js";

const stopWords = new Set([
  "alla", "and", "av", "clips", "de", "den", "det", "ett", "find", "for", "fran", "from", "har", "i", "in",
  "klipp", "med", "och", "of", "om", "on", "som", "the", "to", "under", "visa", "where", "with",
]);

const aliases = Object.freeze({
  phase: {
    "in possession": ["i bollinnehav", "med boll"],
    "out of possession": ["utan boll", "forsvarsspel"],
    "offensive transition": ["offensiv omstallning", "positiv omstallning"],
    "defensive transition": ["defensiv omstallning", "negativ omstallning"],
    "set pieces": ["fasta situationer", "fast situation"],
  },
  subPhase: {
    "build with gk": ["spela ut med malvakt", "uppspel med malvakt"],
    "build up": ["uppbyggnad", "uppspelsfas"],
    "creating phase": ["chansskapande", "skapa chanser"],
    "finishing phase": ["avslutsfas", "avslut"],
    "high press vs gk": ["hog press mot malvakt"],
    "high press": ["hog press"],
    "block defending": ["blockforsvar", "forsvara block"],
    "box defending": ["boxforsvar", "forsvara box"],
    "defensive set pieces": ["defensiva fasta"],
    "offensive set pieces": ["offensiva fasta"],
    "throw-ins": ["inkast"],
  },
  outcome: {
    positive: ["positiv", "positiva", "lyckad", "lyckade", "successful", "success"],
    development: ["development", "utveckling", "utvecklingsbar", "misslyckad", "misslyckade"],
    neutral: ["neutral", "neutrala"],
  },
});

function fold(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sv-SE")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function emptyFilters() {
  return {
    phases: [],
    subPhases: [],
    outcomes: [],
    playerIds: [],
    playerLabels: [],
    miniGamePrincipleIds: [],
    miniGamePrincipleLabels: [],
    units: [],
    eventTypes: [],
    periods: [],
    matchTitles: [],
    searchTerms: [],
    dateFrom: "",
    dateTo: "",
    minDurationMs: null,
    maxDurationMs: null,
    latestMatches: null,
  };
}

export function createEmptyClipQuery() {
  return { version: 1, operator: "and", filters: emptyFilters(), sort: "newest" };
}

function phraseEntries(values = [], category = "", aliasGroup = {}) {
  return values.flatMap((value) => {
    const normalized = fold(value.label || value.name || value);
    const aliasesForValue = aliasGroup[normalized] || [];
    return [normalized, fold(value.id), ...aliasesForValue.map(fold)]
      .filter((phrase) => phrase.length >= 2)
      .map((phrase) => ({ phrase, category, value }));
  });
}

function contextEntries(context = {}) {
  const players = Array.isArray(context.players) ? context.players : [];
  const facts = Array.isArray(context.clips) ? context.clips.map(normalizeClipAnalysisFact) : [];
  const units = unique(facts.flatMap((clip) => clip.units));
  const matches = unique(facts.map((clip) => clip.matchTitle).filter((title) => title !== "Source not linked"));
  return [
    ...phraseEntries(videoAnalysisPhases, "phase", aliases.phase),
    ...phraseEntries(videoAnalysisSubPhases, "subPhase", aliases.subPhase),
    ...phraseEntries(videoAnalysisOutcomes, "outcome", aliases.outcome),
    ...phraseEntries(miniGamePrinciples, "principle"),
    ...phraseEntries(players.map((player) => ({ id: player.id, label: player.name })), "player"),
    ...phraseEntries(units, "unit"),
    ...phraseEntries(matches, "match"),
  ].sort((a, b) => b.phrase.length - a.phrase.length);
}

function containsPhrase(haystack = "", phrase = "") {
  return (` ${haystack} `).includes(` ${phrase} `);
}

function removePhrase(haystack = "", phrase = "") {
  return (` ${haystack} `).replace(` ${phrase} `, " ").replace(/\s+/g, " ").trim();
}

function addEntity(filters, entry = {}) {
  const value = entry.value || {};
  if (entry.category === "phase") filters.phases.push(String(value));
  else if (entry.category === "subPhase") filters.subPhases.push(String(value));
  else if (entry.category === "outcome") filters.outcomes.push(String(value));
  else if (entry.category === "principle") {
    filters.miniGamePrincipleIds.push(String(value.id || ""));
    filters.miniGamePrincipleLabels.push(String(value.label || ""));
  } else if (entry.category === "player") {
    filters.playerIds.push(String(value.id || ""));
    filters.playerLabels.push(String(value.label || ""));
  } else if (entry.category === "unit") filters.units.push(String(value));
  else if (entry.category === "match") filters.matchTitles.push(String(value));
}

function parseStructuredPhrases(source = "", filters = {}) {
  let remaining = source;
  const duration = remaining.match(/(?:langre an|over|more than|minst)\s+(\d+(?:[.,]\d+)?)\s*(?:sekunder|seconds?|sek|s)\b/);
  if (duration) {
    filters.minDurationMs = Math.round(Number(duration[1].replace(",", ".")) * 1000);
    remaining = removePhrase(remaining, duration[0]);
  }
  const maxDuration = remaining.match(/(?:kortare an|under|less than|hogst)\s+(\d+(?:[.,]\d+)?)\s*(?:sekunder|seconds?|sek|s)\b/);
  if (maxDuration) {
    filters.maxDurationMs = Math.round(Number(maxDuration[1].replace(",", ".")) * 1000);
    remaining = removePhrase(remaining, maxDuration[0]);
  }
  const latest = remaining.match(/(?:senaste|last)\s+(\d+)\s+(?:matcher|matches)/);
  if (latest) {
    filters.latestMatches = Math.min(100, Math.max(1, Number(latest[1])));
    remaining = removePhrase(remaining, latest[0]);
  }
  const dates = [...remaining.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (dates.length) {
    filters.dateFrom = dates[0];
    filters.dateTo = dates[1] || "";
    for (const date of dates) remaining = removePhrase(remaining, date);
  }
  const typeAliases = [
    { type: "training", phrases: ["traning", "traningar", "training", "trainings"] },
    { type: "match", phrases: ["match", "matcher", "matches"] },
  ];
  for (const entry of typeAliases) {
    for (const phrase of entry.phrases) {
      if (!containsPhrase(remaining, phrase)) continue;
      filters.eventTypes.push(entry.type);
      remaining = removePhrase(remaining, phrase);
      break;
    }
  }
  const periods = [
    { value: "1", phrases: ["forsta halvlek", "first half", "period 1"] },
    { value: "2", phrases: ["andra halvlek", "second half", "period 2"] },
  ];
  for (const entry of periods) {
    for (const phrase of entry.phrases) {
      if (!containsPhrase(remaining, phrase)) continue;
      filters.periods.push(entry.value);
      remaining = removePhrase(remaining, phrase);
      break;
    }
  }
  return remaining;
}

function dedupeFilters(filters = {}) {
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) filters[key] = unique(value);
  }
  return filters;
}

function interpretedChips(filters = {}) {
  const chips = [];
  const append = (type, values) => values.forEach((label) => chips.push({ type, label }));
  append("Phase", filters.phases);
  append("Sub-phase", filters.subPhases);
  append("Outcome", filters.outcomes);
  append("Player", filters.playerLabels);
  append("Principle", filters.miniGamePrincipleLabels);
  append("Unit", filters.units);
  append("Source", filters.eventTypes.map((value) => value === "training" ? "Training" : "Match"));
  append("Match", filters.matchTitles);
  append("Text", filters.searchTerms);
  if (filters.dateFrom) chips.push({ type: "From", label: filters.dateFrom });
  if (filters.dateTo) chips.push({ type: "To", label: filters.dateTo });
  if (filters.minDurationMs != null) chips.push({ type: "Duration", label: `>= ${filters.minDurationMs / 1000}s` });
  if (filters.maxDurationMs != null) chips.push({ type: "Duration", label: `<= ${filters.maxDurationMs / 1000}s` });
  if (filters.latestMatches) chips.push({ type: "Scope", label: `Last ${filters.latestMatches} matches` });
  return chips;
}

export function parseClipQuery(text = "", context = {}) {
  const source = fold(text);
  const query = createEmptyClipQuery();
  let remaining = parseStructuredPhrases(source, query.filters);
  for (const entry of contextEntries(context)) {
    if (!containsPhrase(remaining, entry.phrase)) continue;
    addEntity(query.filters, entry);
    remaining = removePhrase(remaining, entry.phrase);
  }
  query.filters.searchTerms = remaining.split(" ")
    .filter((word) => word.length > 1 && !stopWords.has(word));
  dedupeFilters(query.filters);
  const chips = interpretedChips(query.filters);
  return {
    mode: "filter",
    text: String(text || "").trim(),
    query,
    chips,
    recognized: chips.length > 0,
  };
}

export function parseClipQueryRequest(text = "", context = {}) {
  const source = String(text || "").trim();
  const folded = fold(source);
  const comparisonPrefix = /^(?:jamfor|compare)\s+/.exec(folded);
  if (!comparisonPrefix) return parseClipQuery(source, context);
  const body = folded.slice(comparisonPrefix[0].length);
  const delimiter = /\s+(?:mot|med|versus|with)\s+/.exec(body);
  if (!delimiter) return parseClipQuery(source, context);
  const left = body.slice(0, delimiter.index).trim();
  const right = body.slice(delimiter.index + delimiter[0].length).trim();
  if (!left || !right) return parseClipQuery(source, context);
  return {
    mode: "comparison",
    text: source,
    cohortA: parseClipQuery(left, context),
    cohortB: parseClipQuery(right, context),
  };
}
