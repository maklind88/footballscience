import { eventElement } from "../video-analysis.dom-events.js";
import { normalizeClipAnalysisFacts } from "../services/clipAnalysisFactService.js";
import {
  clipsForIntelligenceState,
  createInitialClipIntelligenceState,
  filterClipsByAnalysisQuery,
  filterClipsForMatrix,
} from "../services/clipAnalyticsService.js";
import { parseClipQuery, parseClipQueryRequest } from "../services/clipQueryLanguageService.js";
import { createAnalysisReportPresentation } from "../services/analysisReportService.js";
import { presentationQueue } from "../services/presentationService.js";

const CORPUS_PAGE_SIZE = 500;
const CORPUS_MAX_CLIPS = 20000;

function currentClips(state = {}) {
  return normalizeClipAnalysisFacts(state.intelligence?.corpus?.length ? state.intelligence.corpus : state.clips || []);
}

function queryContext(state = {}, clips = []) {
  return { players: state.players || [], clips };
}

function queryLabel(request = "", fallback = "Cohort") {
  const chips = request && typeof request === "object" ? request.chips || [] : [];
  const canonical = [...new Set(chips.map((chip) => String(chip.label || "").trim()).filter(Boolean))].join(" / ");
  const label = canonical || String(request?.text || request || "").trim();
  return label ? label.slice(0, 120) : fallback;
}

function resultIds(clips = [], query = {}) {
  return filterClipsByAnalysisQuery(clips, query).map((clip) => clip.id);
}

function unionIds(values = []) {
  return [...new Set(values.flat().map(String).filter(Boolean))];
}

export function createClipIntelligenceController(options = {}) {
  const getRuntime = options.getRuntime || (() => null);
  const getWindow = options.getWindow || (() => globalThis.window);
  const loadPresentationSources = options.loadPresentationSources || (() => {});

  async function loadCorpus({ force = false } = {}) {
    const run = getRuntime();
    if (!run) return [];
    const initial = run.store.getState();
    if (!force && initial.intelligence?.corpus?.length) return initial.intelligence.corpus;
    run.store.update((state) => ({
      ...state,
      intelligence: { ...(state.intelligence || {}), status: "loading", error: "" },
    }));
    const byId = new Map();
    let offset = 0;
    let hasMore = true;
    try {
      while (hasMore && byId.size < CORPUS_MAX_CLIPS) {
        const payload = await run.intelligence.listFacts({ limit: CORPUS_PAGE_SIZE, offset });
        const page = normalizeClipAnalysisFacts(payload.facts || []);
        for (const clip of page) byId.set(clip.id, clip);
        hasMore = payload.hasMore === true;
        const nextOffset = Number(payload.nextOffset);
        if (!page.length || !hasMore || !Number.isFinite(nextOffset) || nextOffset <= offset) break;
        offset = nextOffset;
      }
      const corpus = [...byId.values()].slice(0, CORPUS_MAX_CLIPS);
      run.store.update((state) => ({
        ...state,
        intelligence: {
          ...(state.intelligence || {}),
          status: "ready",
          corpus,
          corpusCount: corpus.length,
          corpusTruncated: hasMore || byId.size > CORPUS_MAX_CLIPS,
          sourceScope: "team-corpus",
          error: "",
        },
        message: `${corpus.length} clips loaded for analysis.`,
      }));
      return corpus;
    } catch (error) {
      const fallback = normalizeClipAnalysisFacts(initial.clips || []);
      run.store.update((state) => ({
        ...state,
        intelligence: {
          ...(state.intelligence || {}),
          status: "fallback",
          corpus: fallback,
          corpusCount: fallback.length,
          corpusTruncated: false,
          sourceScope: "workspace",
          error: error.message || "Team corpus could not be loaded.",
        },
        message: "Using clips from the current workspace.",
      }));
      return fallback;
    }
  }

  async function runQuery() {
    const run = getRuntime();
    if (!run) return;
    const corpus = await loadCorpus();
    const state = run.store.getState();
    const request = parseClipQueryRequest(state.intelligence?.queryText || "", queryContext(state, corpus));
    if (request.mode === "comparison") {
      const cohortA = { label: queryLabel(request.cohortA, "Cohort A"), query: request.cohortA.query };
      const cohortB = { label: queryLabel(request.cohortB, "Cohort B"), query: request.cohortB.query };
      const ids = unionIds([resultIds(corpus, cohortA.query), resultIds(corpus, cohortB.query)]);
      run.store.update((current) => ({
        ...current,
        intelligence: {
          ...(current.intelligence || {}),
          status: "ready",
          active: true,
          querySpec: { version: 1, operator: "and", filters: {}, sort: "newest" },
          interpretation: request,
          resultClipIds: ids,
          resultsResolved: true,
          cohortA,
          cohortB,
          error: "",
        },
        matrix: { ...(current.matrix || {}), selectedRow: "", selectedColumn: "" },
        message: `${ids.length} clips across two cohorts.`,
      }));
      return;
    }
    const ids = resultIds(corpus, request.query);
    run.store.update((current) => ({
      ...current,
      intelligence: {
        ...(current.intelligence || {}),
        status: "ready",
        active: true,
        querySpec: request.query,
        interpretation: request,
        resultClipIds: ids,
        resultsResolved: true,
        error: "",
      },
      matrix: { ...(current.matrix || {}), selectedRow: "", selectedColumn: "" },
      message: `${ids.length} clips match the analysis.`,
    }));
  }

  function clearQuery() {
    const run = getRuntime();
    if (!run) return;
    run.store.update((state) => ({
      ...state,
      intelligence: {
        ...createInitialClipIntelligenceState(),
        status: state.intelligence?.corpus?.length ? "ready" : "idle",
        corpus: state.intelligence?.corpus || [],
        corpusCount: state.intelligence?.corpusCount || 0,
        corpusTruncated: state.intelligence?.corpusTruncated === true,
        sourceScope: state.intelligence?.sourceScope || "workspace",
      },
      matrix: { ...(state.matrix || {}), selectedRow: "", selectedColumn: "" },
      message: "Analysis query cleared.",
    }));
  }

  function setCohort(key = "cohortA") {
    const run = getRuntime();
    if (!run) return;
    const state = run.store.getState();
    const clips = currentClips(state);
    const parsed = parseClipQuery(state.intelligence?.queryText || "", queryContext(state, clips));
    const cohort = {
      label: queryLabel(parsed, key === "cohortA" ? "Cohort A" : "Cohort B"),
      query: parsed.query,
    };
    run.store.update((current) => {
      const intelligence = { ...(current.intelligence || {}), [key]: cohort, active: true };
      const aIds = intelligence.cohortA ? resultIds(clips, intelligence.cohortA.query) : [];
      const bIds = intelligence.cohortB ? resultIds(clips, intelligence.cohortB.query) : [];
      const ids = intelligence.cohortA && intelligence.cohortB ? unionIds([aIds, bIds]) : resultIds(clips, cohort.query);
      return {
        ...current,
        intelligence: { ...intelligence, resultClipIds: ids, resultsResolved: true },
        message: `${key === "cohortA" ? "A" : "B"}: ${cohort.label}`,
      };
    });
  }

  function selectResults() {
    const run = getRuntime();
    if (!run) return;
    run.store.update((state) => {
      const results = filterClipsForMatrix(
        clipsForIntelligenceState(state),
        state.matrix || {},
        state.matrix?.selectedRow,
        state.matrix?.selectedColumn,
      );
      return {
        ...state,
        clipLibrary: { ...(state.clipLibrary || {}), selectedClipIds: results.slice(0, 500).map((clip) => clip.id) },
        message: `${Math.min(results.length, 500)} analysis clips selected.`,
      };
    });
  }

  function buildReport() {
    const run = getRuntime();
    if (!run) return;
    const state = run.store.getState();
    const output = createAnalysisReportPresentation(state, currentClips(state));
    const firstItem = presentationQueue(output.current)[0];
    run.store.update((current) => ({
      ...current,
      activeAnalysisRoomTab: "presentation",
      selectedClipId: firstItem?.clipId || current.selectedClipId || "",
      presentation: {
        ...(current.presentation || {}),
        current: output.current,
        mode: "builder",
        activeSectionId: output.activeSectionId,
        selectedItemId: firstItem?.id || "",
        selectedClipId: firstItem?.clipId || "",
      },
      message: "Analysis report created.",
    }));
    loadPresentationSources(null, { silent: true });
  }

  function printReport() {
    const win = getWindow();
    const body = win?.document?.body;
    if (!body || typeof win.print !== "function") return;
    const cleanup = () => body.classList.remove("is-printing-analysis-report");
    body.classList.add("is-printing-analysis-report");
    win.addEventListener?.("afterprint", cleanup, { once: true });
    win.setTimeout?.(cleanup, 30000);
    win.print();
  }

  function updateMatrix(field = "", value = "") {
    const run = getRuntime();
    if (!run || !["rowAxis", "columnAxis", "metric"].includes(field)) return;
    run.store.update((state) => {
      const matrix = { ...(state.matrix || {}), [field]: value, selectedRow: "", selectedColumn: "" };
      if (matrix.rowAxis === matrix.columnAxis) {
        if (field === "rowAxis") matrix.columnAxis = value === "outcome" ? "phase" : "outcome";
        else matrix.rowAxis = value === "phase" ? "outcome" : "phase";
      }
      matrix.mode = `${matrix.rowAxis}-${matrix.columnAxis}`;
      return { ...state, matrix };
    });
  }

  function handleInput(event) {
    const target = eventElement(event)?.closest?.("[data-video-analysis-intelligence-query]");
    if (!target) return false;
    const run = getRuntime();
    run?.store.update((state) => ({
      ...state,
      intelligence: { ...(state.intelligence || {}), queryText: target.value },
    }));
    return true;
  }

  function handleChange(event) {
    const target = eventElement(event)?.closest?.("[data-video-analysis-matrix-config]");
    if (!target) return false;
    updateMatrix(target.dataset.videoAnalysisMatrixConfig, target.value);
    return true;
  }

  function handleClick(event) {
    const target = eventElement(event);
    if (!target?.closest) return false;
    if (target.closest("[data-video-analysis-report-print]")) {
      printReport();
      return true;
    }
    const actionButton = target.closest("[data-video-analysis-intelligence-action]");
    if (!actionButton) return false;
    const action = actionButton.dataset.videoAnalysisIntelligenceAction;
    if (action === "run") runQuery();
    else if (action === "clear") clearQuery();
    else if (action === "load") loadCorpus({ force: true });
    else if (action === "set-a") setCohort("cohortA");
    else if (action === "set-b") setCohort("cohortB");
    else if (action === "select-results") selectResults();
    else if (action === "report") buildReport();
    return true;
  }

  return { handleChange, handleClick, handleInput, loadCorpus, runQuery };
}
