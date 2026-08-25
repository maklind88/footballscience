import {
  addClipsToPresentation,
  createDefaultPresentation,
  updatePresentationSection,
} from "./presentationService.js";
import {
  buildCohortComparison,
  buildCohortMetrics,
  buildMatrixDrilldown,
  filterClipsByAnalysisQuery,
} from "./clipAnalyticsService.js";

const MAX_REPORT_CLIPS = 80;
const MAX_DISTRIBUTION_ITEMS = 8;

function rounded(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function compactDistribution(values = []) {
  return values.slice(0, MAX_DISTRIBUTION_ITEMS).map((entry) => ({
    label: String(entry.label || ""),
    count: Number(entry.count || 0),
    rate: rounded(entry.rate),
  }));
}

function compactMetrics(metrics = {}) {
  return {
    clipCount: Number(metrics.clipCount || 0),
    durationMs: Math.round(Number(metrics.durationMs || 0)),
    averageDurationMs: Math.round(Number(metrics.averageDurationMs || 0)),
    matchCount: Number(metrics.matchCount || 0),
    positiveRate: rounded(metrics.positiveRate),
    developmentRate: rounded(metrics.developmentRate),
    neutralRate: rounded(metrics.neutralRate),
    outcomes: { ...(metrics.outcomes || {}) },
    distributions: Object.fromEntries(Object.entries(metrics.distributions || {}).map(([key, values]) => (
      [key, compactDistribution(values)]
    ))),
  };
}

function compactComparison(comparison = null) {
  if (!comparison) return null;
  return {
    a: { label: comparison.a.label, ...compactMetrics(comparison.a) },
    b: { label: comparison.b.label, ...compactMetrics(comparison.b) },
    deltas: Object.fromEntries(Object.entries(comparison.deltas || {}).map(([key, value]) => [key, rounded(value)])),
  };
}

function safeQuery(query = {}) {
  const filters = query?.filters || {};
  return {
    version: 1,
    operator: "and",
    sort: query.sort || "newest",
    filters: Object.fromEntries(Object.entries(filters).map(([key, value]) => (
      [key, Array.isArray(value) ? value.slice(0, 40).map((entry) => String(entry || "").slice(0, 180)) : value]
    ))),
  };
}

function reportTitle(intelligence = {}) {
  const query = String(intelligence.queryText || "").trim();
  return query ? `FS Player Analysis: ${query.slice(0, 120)}` : "FS Player Analysis Report";
}

function reportFinding(metrics = {}, comparison = null) {
  if (comparison) {
    if (comparison.deltas.positiveRate === 0) {
      return `${comparison.b.label} has the same positive rate as ${comparison.a.label}.`;
    }
    const direction = comparison.deltas.positiveRate > 0 ? "higher" : "lower";
    return `${comparison.b.label} has a ${direction} positive rate than ${comparison.a.label}.`;
  }
  if (!metrics.clipCount) return "No clips matched the analysis definition.";
  return `${metrics.clipCount} clips across ${metrics.matchCount} sources, with ${Math.round(metrics.positiveRate * 100)}% positive outcomes.`;
}

export function buildAnalysisReportSnapshot(state = {}, clips = []) {
  const intelligence = state.intelligence || {};
  const matrix = state.matrix || {};
  const queryClips = filterClipsByAnalysisQuery(clips, intelligence.querySpec || {});
  const metrics = buildCohortMetrics(queryClips);
  const comparison = buildCohortComparison(clips, intelligence.cohortA, intelligence.cohortB);
  const drilldown = buildMatrixDrilldown(queryClips, matrix);
  return {
    schema: "football-science-analysis-report-v1",
    generatedAt: new Date().toISOString(),
    queryText: String(intelligence.queryText || "").trim(),
    query: safeQuery(intelligence.querySpec || {}),
    interpretation: (intelligence.interpretation?.chips || []).slice(0, 30),
    source: {
      scope: intelligence.sourceScope || "workspace",
      loadedClips: Number(intelligence.corpusCount || clips.length),
      truncated: intelligence.corpusTruncated === true,
    },
    matrix: {
      rowAxis: matrix.rowAxis || "phase",
      columnAxis: matrix.columnAxis || "outcome",
      metric: matrix.metric || "count",
      selectedRow: matrix.selectedRow || "",
      selectedColumn: matrix.selectedColumn || "",
      drilldown: compactMetrics(drilldown),
    },
    summary: compactMetrics(metrics),
    comparison: compactComparison(comparison),
    finding: reportFinding(metrics, comparison),
  };
}

function reportEvidenceClips(state = {}, clips = []) {
  const selected = new Set((state.clipLibrary?.selectedClipIds || []).map(String));
  const intelligence = state.intelligence || {};
  const comparison = buildCohortComparison(clips, intelligence.cohortA, intelligence.cohortB);
  if (selected.size) return clips.filter((clip) => selected.has(String(clip.id || ""))).slice(0, MAX_REPORT_CLIPS);
  if (comparison) {
    const ids = new Set([...comparison.a.clipIds, ...comparison.b.clipIds]);
    return clips.filter((clip) => ids.has(String(clip.id || ""))).slice(0, MAX_REPORT_CLIPS);
  }
  return filterClipsByAnalysisQuery(clips, intelligence.querySpec || {}).slice(0, MAX_REPORT_CLIPS);
}

export function createAnalysisReportPresentation(state = {}, clips = []) {
  const evidence = reportEvidenceClips(state, clips);
  const snapshot = buildAnalysisReportSnapshot(state, clips);
  let current = {
    ...createDefaultPresentation(),
    title: reportTitle(state.intelligence),
    purpose: "analysis",
    notes: snapshot.finding,
    metadata: {
      source: "fs-player-clip-intelligence",
      analysisReport: snapshot,
    },
  };
  current = updatePresentationSection(current, "opening", {
    title: "Executive summary",
    coachNote: snapshot.finding,
    metadata: { reportSection: "summary" },
  });
  current = updatePresentationSection(current, "team-focus", {
    title: snapshot.comparison?.a?.label || "Team evidence",
    metadata: { reportSection: snapshot.comparison ? "cohort-a" : "evidence" },
  });
  current = updatePresentationSection(current, "player-focus", {
    title: snapshot.comparison?.b?.label || "Player evidence",
    metadata: { reportSection: snapshot.comparison ? "cohort-b" : "player-evidence" },
  });
  if (snapshot.comparison) {
    const comparison = buildCohortComparison(clips, state.intelligence?.cohortA, state.intelligence?.cohortB);
    const aIds = new Set(comparison.a.clipIds);
    const bIds = new Set(comparison.b.clipIds);
    current = addClipsToPresentation(current, "team-focus", evidence.filter((clip) => aIds.has(clip.id)).slice(0, 40));
    current = addClipsToPresentation(current, "player-focus", evidence.filter((clip) => bIds.has(clip.id)).slice(0, 40));
  } else {
    const playerEvidence = evidence.filter((clip) => Array.isArray(clip.players) && clip.players.length);
    const teamEvidence = evidence.filter((clip) => !Array.isArray(clip.players) || !clip.players.length);
    current = addClipsToPresentation(current, "team-focus", teamEvidence);
    current = addClipsToPresentation(current, "player-focus", playerEvidence);
  }
  return {
    current,
    activeSectionId: snapshot.comparison ? "team-focus" : "opening",
    clips: evidence,
    snapshot,
  };
}
