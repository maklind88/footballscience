const {
  actorScope,
  buildTeamParams,
  normalizeText,
  normalizeUuid,
  selectRows,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-v2";
const DEFAULT_FACT_LIMIT = 500;
const MAX_FACT_LIMIT = 500;
const MAX_FACT_OFFSET = 100000;

function boundedInteger(value, fallback, maximum) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.min(numeric, maximum);
}

function isoDate(value = "") {
  const date = normalizeText(value, 20);
  return /^20\d{2}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function buildFactParams(query = {}, scope = {}) {
  const limit = Math.max(1, boundedInteger(query.limit, DEFAULT_FACT_LIMIT, MAX_FACT_LIMIT));
  const offset = boundedInteger(query.offset, 0, MAX_FACT_OFFSET);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  const matchId = normalizeUuid(query.matchId || query.match_id);
  const videoId = normalizeUuid(query.videoId || query.video_id);
  const phase = normalizeText(query.phase, 80);
  const subPhase = normalizeText(query.subPhase || query.sub_phase, 80);
  const outcome = normalizeText(query.outcome, 40);
  const eventType = normalizeText(query.eventType || query.event_type, 40).toLowerCase();
  if (matchId) params.set("match_id", `eq.${matchId}`);
  if (videoId) params.set("video_id", `eq.${videoId}`);
  if (phase) params.set("phase", `eq.${phase}`);
  if (subPhase) params.set("sub_phase", `eq.${subPhase}`);
  if (outcome) params.set("outcome", `eq.${outcome}`);
  if (["match", "training"].includes(eventType)) params.set("event_type", `eq.${eventType}`);
  const dateFrom = isoDate(query.dateFrom || query.date_from);
  const dateTo = isoDate(query.dateTo || query.date_to);
  if (dateFrom) params.append("match_date", `gte.${dateFrom}`);
  if (dateTo) params.append("match_date", `lte.${dateTo}`);
  params.set("order", "match_date.desc.nullslast,match_title.asc,start_ms.asc,id.asc");
  params.set("limit", String(limit + 1));
  params.set("offset", String(offset));
  return { limit, offset, params };
}

async function listAnalysisFacts(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const { limit, offset, params } = buildFactParams(query, scope);
  const result = await selectRows("video_clip_analysis_facts", params);
  if (!result.ok) return result;
  const rows = Array.isArray(result.payload) ? result.payload : [];
  const hasMore = rows.length > limit;
  const facts = rows.slice(0, limit);
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      facts,
      pageSize: facts.length,
      offset,
      nextOffset: hasMore ? offset + facts.length : null,
      hasMore,
    },
  };
}

module.exports = {
  buildFactParams,
  listAnalysisFacts,
};
