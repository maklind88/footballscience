import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import {
  clipAnalysisSearchText,
  normalizeClipAnalysisFact,
  normalizeClipAnalysisFacts,
} from "./clipAnalysisFactService.js";

export const clipAnalysisAxes = Object.freeze([
  { id: "phase", label: "Phase" },
  { id: "subPhase", label: "Sub-phase" },
  { id: "outcome", label: "Outcome" },
  { id: "miniGamePrinciple", label: "MG principle" },
  { id: "player", label: "Player" },
  { id: "unit", label: "Unit" },
  { id: "match", label: "Source" },
  { id: "eventType", label: "Match / training" },
  { id: "period", label: "Period" },
]);

export const clipAnalysisMetrics = Object.freeze([
  { id: "count", label: "Clips" },
  { id: "duration", label: "Total duration" },
  { id: "positiveRate", label: "Positive rate" },
  { id: "averageDuration", label: "Average duration" },
]);

export function createInitialClipIntelligenceState() {
  return {
    status: "idle",
    active: false,
    queryText: "",
    querySpec: { version: 1, operator: "and", filters: {}, sort: "newest" },
    interpretation: null,
    resultClipIds: [],
    resultsResolved: false,
    corpus: [],
    corpusCount: 0,
    corpusTruncated: false,
    sourceScope: "workspace",
    cohortA: null,
    cohortB: null,
    error: "",
  };
}

const modeAxes = Object.freeze({
  "phase-outcome": ["phase", "outcome"],
  "mg-principle-player": ["miniGamePrinciple", "player"],
  "mini-game-unit": ["miniGamePrinciple", "unit"],
});

function fold(value = "") {
  return String(value || "").trim().toLocaleLowerCase("sv-SE");
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function intersects(actual = [], expected = []) {
  if (!expected.length) return true;
  const values = new Set(actual.map(fold));
  return expected.some((value) => values.has(fold(value)));
}

function queryFilters(query = {}) {
  return query?.filters && typeof query.filters === "object" ? query.filters : {};
}

function latestMatchSet(clips = [], count = null) {
  if (!count) return null;
  const matches = new Map();
  for (const clip of clips) {
    const fact = normalizeClipAnalysisFact(clip);
    const key = fact.matchId || `${fact.matchDate}:${fact.matchTitle}`;
    const current = matches.get(key);
    if (!current || fact.matchDate > current.date) matches.set(key, { date: fact.matchDate, title: fact.matchTitle });
  }
  return new Set([...matches.entries()]
    .sort((a, b) => `${b[1].date}:${b[1].title}`.localeCompare(`${a[1].date}:${a[1].title}`))
    .slice(0, count)
    .map(([key]) => key));
}

export function clipMatchesAnalysisQuery(clip = {}, query = {}, latestMatches = null) {
  const fact = normalizeClipAnalysisFact(clip);
  const filters = queryFilters(query);
  const matchKey = fact.matchId || `${fact.matchDate}:${fact.matchTitle}`;
  if (latestMatches && !latestMatches.has(matchKey)) return false;
  if (!intersects([fact.phase], filters.phases || [])) return false;
  if (!intersects([fact.subPhase], filters.subPhases || [])) return false;
  if (!intersects([fact.outcome], filters.outcomes || [])) return false;
  if (!intersects(fact.players.map((player) => player.player_id), filters.playerIds || [])) return false;
  if (!intersects(fact.players.map((player) => player.player_label), filters.playerLabels || [])) return false;
  if (!intersects(fact.miniGamePrinciples.map((principle) => principle.id), filters.miniGamePrincipleIds || [])) return false;
  if (!intersects(fact.miniGamePrinciples.map((principle) => principle.label), filters.miniGamePrincipleLabels || [])) return false;
  if (!intersects(fact.units, filters.units || [])) return false;
  if (!intersects([fact.eventType], filters.eventTypes || [])) return false;
  if (!intersects([fact.period], filters.periods || [])) return false;
  if (!intersects([fact.matchTitle], filters.matchTitles || [])) return false;
  if (filters.dateFrom && (!fact.matchDate || fact.matchDate < filters.dateFrom)) return false;
  if (filters.dateTo && (!fact.matchDate || fact.matchDate > filters.dateTo)) return false;
  if (filters.minDurationMs != null && fact.durationMs < Number(filters.minDurationMs)) return false;
  if (filters.maxDurationMs != null && fact.durationMs > Number(filters.maxDurationMs)) return false;
  const haystack = clipAnalysisSearchText(fact);
  if ((filters.searchTerms || []).some((term) => !haystack.includes(fold(term)))) return false;
  return true;
}

export function filterClipsByAnalysisQuery(clips = [], query = {}) {
  const source = normalizeClipAnalysisFacts(clips);
  const latestMatches = latestMatchSet(source, queryFilters(query).latestMatches);
  return source.filter((clip) => clipMatchesAnalysisQuery(clip, query, latestMatches));
}

export function resolveMatrixConfig(value = "phase-outcome") {
  const config = value && typeof value === "object" ? value : { mode: value };
  const axes = modeAxes[config.mode] || [];
  const rowAxis = clipAnalysisAxes.some((axis) => axis.id === config.rowAxis) ? config.rowAxis : axes[0] || "phase";
  let columnAxis = clipAnalysisAxes.some((axis) => axis.id === config.columnAxis) ? config.columnAxis : axes[1] || "outcome";
  if (columnAxis === rowAxis) columnAxis = rowAxis === "outcome" ? "phase" : "outcome";
  const metric = clipAnalysisMetrics.some((entry) => entry.id === config.metric) ? config.metric : "count";
  return { rowAxis, columnAxis, metric };
}

export function clipAxisValues(clip = {}, axis = "") {
  const fact = normalizeClipAnalysisFact(clip);
  if (axis === "player") return unique(fact.players.map((player) => player.player_label || player.player_id)).length
    ? unique(fact.players.map((player) => player.player_label || player.player_id)) : ["No player"];
  if (axis === "unit") return fact.units.length ? unique(fact.units) : ["No unit"];
  if (axis === "miniGamePrinciple") {
    const principles = unique(fact.miniGamePrinciples.map((principle) => principle.label || principle.id));
    return principles.length ? principles : ["No MG principle"];
  }
  if (axis === "match") return [fact.matchTitle || "Source not linked"];
  if (axis === "eventType") return [fact.eventType === "training" ? "Training" : "Match"];
  if (axis === "subPhase") return [fact.subPhase || "Uncoded"];
  return [String(fact[axis] || "Uncoded")];
}

function axisOrder(axis = "") {
  const values = axis === "phase" ? videoAnalysisPhases
    : axis === "subPhase" ? videoAnalysisSubPhases
      : axis === "outcome" ? videoAnalysisOutcomes
        : axis === "eventType" ? ["Match", "Training"]
          : [];
  return new Map(values.map((value, index) => [value, index]));
}

function sortAxisValues(values = [], axis = "") {
  const order = axisOrder(axis);
  return [...values].sort((a, b) => {
    const aOrder = order.has(a) ? order.get(a) : Number.MAX_SAFE_INTEGER;
    const bOrder = order.has(b) ? order.get(b) : Number.MAX_SAFE_INTEGER;
    return aOrder === bOrder ? a.localeCompare(b) : aOrder - bOrder;
  });
}

function createCell() {
  return { count: 0, durationMs: 0, positiveCount: 0, value: 0, intensity: 0 };
}

function metricValue(cell = {}, metric = "count") {
  if (metric === "duration") return cell.durationMs;
  if (metric === "positiveRate") return cell.count ? cell.positiveCount / cell.count : 0;
  if (metric === "averageDuration") return cell.count ? cell.durationMs / cell.count : 0;
  return cell.count;
}

export function buildClipMatrix(clips = [], configValue = "phase-outcome") {
  const config = resolveMatrixConfig(configValue);
  const rows = new Map();
  const columns = new Set();
  for (const clip of normalizeClipAnalysisFacts(clips)) {
    for (const row of clipAxisValues(clip, config.rowAxis)) {
      for (const column of clipAxisValues(clip, config.columnAxis)) {
        columns.add(column);
        if (!rows.has(row)) rows.set(row, new Map());
        const cell = rows.get(row).get(column) || createCell();
        cell.count += 1;
        cell.durationMs += clip.durationMs;
        if (clip.outcome === "Positive") cell.positiveCount += 1;
        rows.get(row).set(column, cell);
      }
    }
  }
  const sortedColumns = sortAxisValues(columns, config.columnAxis);
  const sortedRows = sortAxisValues(rows.keys(), config.rowAxis);
  let maximum = 0;
  for (const cells of rows.values()) {
    for (const cell of cells.values()) {
      cell.value = metricValue(cell, config.metric);
      maximum = Math.max(maximum, cell.value);
    }
  }
  return {
    ...config,
    rowAxis: clipAnalysisAxes.find((axis) => axis.id === config.rowAxis)?.label || config.rowAxis,
    columnAxis: clipAnalysisAxes.find((axis) => axis.id === config.columnAxis)?.label || config.columnAxis,
    rowAxisId: config.rowAxis,
    columnAxisId: config.columnAxis,
    columns: sortedColumns,
    rows: sortedRows.map((label) => {
      const cells = rows.get(label);
      for (const cell of cells.values()) cell.intensity = maximum ? cell.value / maximum : 0;
      return {
        label,
        counts: new Map([...cells].map(([column, cell]) => [column, cell.count])),
        cells,
      };
    }),
    maximum,
  };
}

export function filterClipsForMatrix(clips = [], configValue = "", row = "", column = "") {
  const config = resolveMatrixConfig(configValue);
  return clips.filter((clip) => {
    const rowOk = !row || clipAxisValues(clip, config.rowAxis).includes(row);
    const columnOk = !column || clipAxisValues(clip, config.columnAxis).includes(column);
    return rowOk && columnOk;
  });
}

function distribution(clips = [], axis = "subPhase", limit = 8) {
  const counts = new Map();
  for (const clip of clips) {
    for (const value of clipAxisValues(clip, axis)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, rate: clips.length ? count / clips.length : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function buildCohortMetrics(clips = []) {
  const facts = normalizeClipAnalysisFacts(clips);
  const durationMs = facts.reduce((total, clip) => total + clip.durationMs, 0);
  const outcomes = Object.fromEntries(videoAnalysisOutcomes.map((outcome) => [outcome, facts.filter((clip) => clip.outcome === outcome).length]));
  const matches = unique(facts.map((clip) => clip.matchId || `${clip.matchDate}:${clip.matchTitle}`));
  return {
    clipCount: facts.length,
    durationMs,
    averageDurationMs: facts.length ? durationMs / facts.length : 0,
    matchCount: matches.length,
    positiveRate: facts.length ? outcomes.Positive / facts.length : 0,
    developmentRate: facts.length ? outcomes.Development / facts.length : 0,
    neutralRate: facts.length ? outcomes.Neutral / facts.length : 0,
    outcomes,
    distributions: {
      phases: distribution(facts, "phase"),
      subPhases: distribution(facts, "subPhase"),
      principles: distribution(facts, "miniGamePrinciple"),
      players: distribution(facts, "player"),
      matches: distribution(facts, "match"),
    },
  };
}

export function buildCohortComparison(clips = [], cohortA = null, cohortB = null) {
  if (!cohortA || !cohortB) return null;
  const aClips = filterClipsByAnalysisQuery(clips, cohortA.query || cohortA);
  const bClips = filterClipsByAnalysisQuery(clips, cohortB.query || cohortB);
  const a = buildCohortMetrics(aClips);
  const b = buildCohortMetrics(bClips);
  return {
    a: { ...a, label: cohortA.label || "Cohort A", clipIds: aClips.map((clip) => clip.id) },
    b: { ...b, label: cohortB.label || "Cohort B", clipIds: bClips.map((clip) => clip.id) },
    deltas: {
      clipCount: b.clipCount - a.clipCount,
      durationMs: b.durationMs - a.durationMs,
      averageDurationMs: b.averageDurationMs - a.averageDurationMs,
      matchCount: b.matchCount - a.matchCount,
      positiveRate: b.positiveRate - a.positiveRate,
      developmentRate: b.developmentRate - a.developmentRate,
    },
  };
}

export function buildMatrixDrilldown(clips = [], config = {}) {
  const selected = filterClipsForMatrix(clips, config, config.selectedRow, config.selectedColumn);
  const metrics = buildCohortMetrics(selected);
  return {
    ...metrics,
    title: [config.selectedRow, config.selectedColumn].filter(Boolean).join(" / ") || "All matrix clips",
    clipIds: selected.map((clip) => clip.id),
  };
}

export function clipsForIntelligenceState(state = {}) {
  const intelligence = state.intelligence || {};
  const base = intelligence.active && intelligence.corpus?.length
    ? intelligence.corpus
    : (state.allClips?.length ? state.allClips : state.clips || []);
  if (!intelligence.active) return normalizeClipAnalysisFacts(base);
  if (intelligence.resultsResolved && Array.isArray(intelligence.resultClipIds)) {
    const ids = new Set(intelligence.resultClipIds.map(String));
    return normalizeClipAnalysisFacts(base).filter((clip) => ids.has(String(clip.id)));
  }
  return filterClipsByAnalysisQuery(base, intelligence.querySpec);
}
