const { randomUUID } = require("node:crypto");
const {
  asLimit,
  actorScope,
  buildTeamParams,
  dbRequest,
  normalizeText,
  normalizeUuid,
  rejectForbiddenPayload,
  selectRows,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-elite-v1";
const TIMELINE_ROW_KINDS = new Set([
  "phase",
  "sub_phase",
  "player",
  "unit",
  "outcome",
  "descriptor",
  "custom",
  "coding",
  "query",
  "graphic",
  "manual",
]);

function rowList(result = {}) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function isMissingSchema(result = {}) {
  const reason = String(result.reason || result.payload?.message || result.payload?.hint || "");
  return result.status === 404 || /video_timelines|video_timeline_lane_clips|schema cache|does not exist/i.test(reason);
}

function normalizeColor(value = "") {
  const color = normalizeText(value, 20);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

function normalizeRowKind(value = "") {
  const kind = normalizeText(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  return TIMELINE_ROW_KINDS.has(kind) ? kind : "manual";
}

function normalizeSortOrder(value, fallback = 0) {
  const order = Math.round(Number(value));
  return Number.isFinite(order) && order >= 0 ? order : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTimelineRowPayload(value = {}, index = 0) {
  const label = normalizeText(value.label || value.title || `Row ${index + 1}`, 120);
  const clientId = normalizeText(value.id || value.laneKey || value.lane_key || label, 120);
  return {
    id: normalizeUuid(value.databaseId || value.database_id || value.id) || clientId,
    label,
    kind: normalizeRowKind(value.kind || value.sourceType || value.source_type),
    color: normalizeColor(value.color),
    sortOrder: normalizeSortOrder(value.sortOrder ?? value.sort_order, index),
    hidden: Boolean(value.hidden),
    locked: Boolean(value.locked),
    query: safeObject(value.query || value.queryJson || value.query_json),
    clipIds: [...new Set((value.clipIds || value.clip_ids || []).map(normalizeUuid).filter(Boolean))].slice(0, 1000),
  };
}

function normalizeTimelinePayload(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const matchId = normalizeUuid(payload.matchId || payload.match_id);
  const title = normalizeText(payload.title || "Match timeline", 180);
  if (!matchId || !title) {
    const error = new Error("A match and timeline title are required.");
    error.status = 400;
    throw error;
  }
  const revision = Math.max(0, Math.round(Number(payload.revision || payload.expectedRevision || 0)) || 0);
  return {
    ...scope,
    id: normalizeUuid(payload.databaseId || payload.database_id || payload.id) || normalizeText(payload.id, 120),
    matchId,
    title,
    description: normalizeText(payload.description, 1000),
    isDefault: Boolean(payload.isDefault ?? payload.is_default),
    expectedRevision: revision || null,
    settings: safeObject(payload.settings),
    rows: (payload.rows || []).map(normalizeTimelineRowPayload).slice(0, 200),
    collaborationSessionId: normalizeUuid(payload.collaborationSessionId || payload.collaboration_session_id) || null,
    clientId: normalizeText(payload.clientId || payload.client_id, 160) || null,
    idempotencyKey: normalizeText(payload.idempotencyKey || payload.idempotency_key, 180)
      || `timeline-save:${randomUUID()}`,
  };
}

function mapTimelineRows(timelines = [], lanes = [], memberships = []) {
  const clipIdsByLane = new Map();
  for (const membership of memberships) {
    const clipIds = clipIdsByLane.get(membership.lane_id) || [];
    clipIds.push(membership.clip_instance_id);
    clipIdsByLane.set(membership.lane_id, clipIds);
  }
  const rowsByTimeline = new Map();
  for (const lane of lanes) {
    const rows = rowsByTimeline.get(lane.timeline_id) || [];
    rows.push({
      id: lane.id,
      label: lane.label,
      kind: lane.source_type,
      color: lane.color || "#2f855a",
      sortOrder: lane.sort_order || 0,
      hidden: lane.hidden === true,
      locked: lane.locked === true,
      query: lane.query_json || {},
      clipIds: clipIdsByLane.get(lane.id) || [],
      revision: lane.revision || 1,
    });
    rowsByTimeline.set(lane.timeline_id, rows);
  }
  return timelines.map((timeline) => ({
    id: timeline.id,
    matchId: timeline.match_id,
    title: timeline.title,
    description: timeline.description || "",
    isDefault: timeline.is_default === true,
    revision: timeline.revision || 1,
    status: timeline.status,
    settings: timeline.settings || {},
    createdBy: timeline.created_by || "",
    updatedAt: timeline.updated_at,
    rows: (rowsByTimeline.get(timeline.id) || []).sort((first, second) => first.sortOrder - second.sortOrder),
  }));
}

async function listTimelines(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  const matchId = normalizeUuid(query.matchId || query.match_id);
  if (matchId) params.set("match_id", `eq.${matchId}`);
  params.set("order", "is_default.desc,updated_at.desc");
  params.set("limit", String(asLimit(query.limit, 40)));
  const timelinesResult = await selectRows("video_timelines", params);
  if (!timelinesResult.ok) {
    if (isMissingSchema(timelinesResult)) {
      return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, timelines: [] } };
    }
    return timelinesResult;
  }
  const timelines = rowList(timelinesResult);
  if (!timelines.length) return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, timelines: [] } };
  const timelineIds = timelines.map((timeline) => timeline.id);
  const laneParams = buildTeamParams(scope);
  laneParams.set("select", "*");
  laneParams.set("timeline_id", `in.(${timelineIds.join(",")})`);
  laneParams.set("status", "eq.active");
  laneParams.set("order", "sort_order.asc,id.asc");
  laneParams.set("limit", "1000");
  const lanesResult = await selectRows("video_timeline_lanes", laneParams);
  if (!lanesResult.ok) return lanesResult;
  const lanes = rowList(lanesResult);
  const membershipParams = buildTeamParams(scope);
  membershipParams.set("select", "*");
  membershipParams.set("timeline_id", `in.(${timelineIds.join(",")})`);
  membershipParams.set("status", "eq.active");
  membershipParams.set("order", "sort_order.asc,id.asc");
  membershipParams.set("limit", "5000");
  const membershipsResult = await selectRows("video_timeline_lane_clips", membershipParams);
  if (!membershipsResult.ok) return membershipsResult;
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      timelines: mapTimelineRows(timelines, lanes, rowList(membershipsResult)),
    },
  };
}

async function saveTimeline(payload = {}, actor = {}) {
  const timeline = normalizeTimelinePayload(payload, actor);
  const result = await dbRequest("/rpc/video_analysis_save_timeline", {
    method: "POST",
    body: {
      p_organization_id: timeline.organizationId,
      p_team_id: timeline.teamId,
      p_actor_id: timeline.actorId,
      p_timeline: {
        id: timeline.id,
        matchId: timeline.matchId,
        title: timeline.title,
        description: timeline.description,
        isDefault: timeline.isDefault,
        expectedRevision: timeline.expectedRevision,
        settings: timeline.settings,
        collaborationSessionId: timeline.collaborationSessionId,
        clientId: timeline.clientId,
        rows: timeline.rows,
      },
      p_idempotency_key: timeline.idempotencyKey,
    },
  });
  if (!result.ok) {
    const reason = String(result.reason || "");
    if (/revision conflict|40001/i.test(reason)) return { ...result, status: 409 };
    return result;
  }
  return {
    ok: true,
    payload: { schema: VIDEO_ANALYSIS_SCHEMA, timeline: result.payload || null },
  };
}

async function listTimelineOperations(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  const timelineId = normalizeUuid(query.timelineId || query.timeline_id);
  const matchId = normalizeUuid(query.matchId || query.match_id);
  if (timelineId) params.set("timeline_id", `eq.${timelineId}`);
  if (matchId) params.set("match_id", `eq.${matchId}`);
  params.set("order", "created_at.asc,id.asc");
  params.set("limit", String(asLimit(query.limit, 200)));
  const result = await selectRows("video_analysis_operations", params);
  if (!result.ok && isMissingSchema(result)) {
    return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, operations: [] } };
  }
  return result.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, operations: rowList(result) } }
    : result;
}

module.exports = {
  listTimelineOperations,
  listTimelines,
  normalizeTimelinePayload,
  saveTimeline,
};
