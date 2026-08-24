const { randomUUID } = require("node:crypto");
const {
  asLimit,
  actorScope,
  buildTeamParams,
  dbRequest,
  insertRow,
  normalizeText,
  normalizeUuid,
  patchRows,
  rejectForbiddenPayload,
  selectRows,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-elite-v1";

function rowList(result = {}) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isMissingSchema(result = {}) {
  const reason = String(result.reason || result.payload?.message || result.payload?.hint || "");
  return result.status === 404 || /video_analysis_(?:collaboration|operations)|schema cache|does not exist/i.test(reason);
}

function parseOperationCursor(value = "") {
  const [createdAtValue = "", idValue = ""] = normalizeText(value, 80).split("|");
  const timestamp = Date.parse(createdAtValue);
  return {
    createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
    id: normalizeUuid(idValue),
  };
}

async function scopedCollaborationSession(sessionId = "", actor = {}) {
  const scope = actorScope(actor);
  const id = normalizeUuid(sessionId);
  if (!id) return { ok: false, status: 400, reason: "A collaboration session is required." };
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${id}`);
  params.set("status", "eq.active");
  params.set("limit", "1");
  const result = await selectRows("video_analysis_collaboration_sessions", params);
  if (!result.ok) return result;
  const session = rowList(result)[0] || null;
  return session
    ? { ok: true, payload: session }
    : { ok: false, status: 404, reason: "The collaboration session is not active." };
}

function collaborationParticipantPayload(payload = {}, actor = {}, session = {}) {
  const scope = actorScope(actor);
  const clientId = normalizeText(payload.clientId || payload.client_id, 160);
  if (!scope.actorId || clientId.length < 8) {
    const error = new Error("An authenticated analyst and client id are required.");
    error.status = 400;
    throw error;
  }
  return {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    collaboration_session_id: session.id,
    actor_id: scope.actorId,
    actor_name: normalizeText(payload.actorName || payload.actor_name || actor.name || actor.displayName, 180) || null,
    client_id: clientId,
    status: "active",
    last_seen_at: new Date().toISOString(),
    left_at: null,
    metadata: safeObject(payload.metadata),
  };
}

async function joinCollaborationSession(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const sessionResult = await scopedCollaborationSession(
    payload.sessionId || payload.session_id || payload.collaborationSessionId || payload.collaboration_session_id,
    actor,
  );
  if (!sessionResult.ok) return sessionResult;
  let participant;
  try {
    participant = collaborationParticipantPayload(payload, actor, sessionResult.payload);
  } catch (error) {
    return { ok: false, status: error.status || 400, reason: error.message };
  }
  const result = await dbRequest("/video_analysis_collaboration_participants?on_conflict=collaboration_session_id,actor_id,client_id", {
    method: "POST",
    body: participant,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return result.ok
    ? {
      ok: true,
      payload: {
        schema: VIDEO_ANALYSIS_SCHEMA,
        collaborationSession: sessionResult.payload,
        participant: rowList(result)[0] || null,
      },
    }
    : result;
}

async function leaveCollaborationSession(payload = {}, actor = {}) {
  const scope = actorScope(actor);
  const sessionId = normalizeUuid(payload.sessionId || payload.session_id || payload.collaborationSessionId || payload.collaboration_session_id);
  const clientId = normalizeText(payload.clientId || payload.client_id, 160);
  if (!sessionId || !clientId || !scope.actorId) {
    return { ok: false, status: 400, reason: "A collaboration session and client id are required." };
  }
  const params = buildTeamParams(scope);
  params.set("collaboration_session_id", `eq.${sessionId}`);
  params.set("actor_id", `eq.${scope.actorId}`);
  params.set("client_id", `eq.${clientId}`);
  const result = await patchRows("video_analysis_collaboration_participants", params, {
    status: "left",
    left_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  });
  return result.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, left: true } }
    : result;
}

async function getCollaborationState(query = {}, actor = {}) {
  const sessionResult = await scopedCollaborationSession(
    query.sessionId || query.session_id || query.collaborationSessionId || query.collaboration_session_id,
    actor,
  );
  if (!sessionResult.ok) return sessionResult;
  const scope = actorScope(actor);
  const participantParams = buildTeamParams(scope);
  participantParams.set("select", "*");
  participantParams.set("collaboration_session_id", `eq.${sessionResult.payload.id}`);
  participantParams.set("status", "eq.active");
  participantParams.set("last_seen_at", `gte.${new Date(Date.now() - 45_000).toISOString()}`);
  participantParams.set("order", "last_seen_at.desc");
  participantParams.set("limit", "100");
  const participantsResult = await selectRows("video_analysis_collaboration_participants", participantParams);
  if (!participantsResult.ok) return participantsResult;

  const operationParams = buildTeamParams(scope);
  operationParams.set("select", "*");
  operationParams.set("match_id", `eq.${sessionResult.payload.match_id}`);
  operationParams.set("collaboration_session_id", `eq.${sessionResult.payload.id}`);
  const after = parseOperationCursor(query.after);
  if (after.createdAt && after.id) {
    operationParams.set(
      "or",
      `(created_at.gt.${after.createdAt},and(created_at.eq.${after.createdAt},id.gt.${after.id}))`,
    );
  } else if (after.createdAt) {
    operationParams.set("created_at", `gt.${after.createdAt}`);
  }
  operationParams.set("order", "created_at.asc,id.asc");
  operationParams.set("limit", String(asLimit(query.limit, 200)));
  const operationsResult = await selectRows("video_analysis_operations", operationParams);
  if (!operationsResult.ok) return operationsResult;
  const operations = rowList(operationsResult);
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      collaborationSession: sessionResult.payload,
      participants: rowList(participantsResult),
      operations,
      nextCursor: operations.length
        ? `${operations.at(-1).created_at}|${operations.at(-1).id}`
        : normalizeText(query.after, 80) || new Date().toISOString(),
    },
  };
}

async function recordAnalysisOperation(value = {}, actor = {}) {
  rejectForbiddenPayload(value.payload || {});
  rejectForbiddenPayload(value.inversePayload || value.inverse_payload || {});
  const scope = actorScope(actor);
  const requestedSessionId = normalizeUuid(value.collaborationSessionId || value.collaboration_session_id) || null;
  const sessionResult = requestedSessionId ? await scopedCollaborationSession(requestedSessionId, actor) : null;
  const collaborationSessionId = sessionResult?.ok ? requestedSessionId : null;
  const entityType = normalizeText(value.entityType || value.entity_type, 80);
  const operationType = normalizeText(value.operationType || value.operation_type, 120);
  if (!entityType || !operationType) {
    return { ok: false, status: 400, reason: "An operation type and entity type are required." };
  }
  const result = await insertRow("video_analysis_operations", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    match_id: normalizeUuid(value.matchId || value.match_id) || null,
    video_id: normalizeUuid(value.videoId || value.video_id) || null,
    timeline_id: normalizeUuid(value.timelineId || value.timeline_id) || null,
    collaboration_session_id: collaborationSessionId,
    idempotency_key: normalizeText(value.idempotencyKey || value.idempotency_key, 180) || `operation:${randomUUID()}`,
    entity_type: entityType,
    entity_id: normalizeUuid(value.entityId || value.entity_id) || null,
    operation_type: operationType,
    expected_revision: Math.max(0, Math.round(Number(value.expectedRevision || value.expected_revision) || 0)) || null,
    resulting_revision: Math.max(0, Math.round(Number(value.resultingRevision || value.resulting_revision) || 0)) || null,
    payload: safeObject(value.payload),
    inverse_payload: safeObject(value.inversePayload || value.inverse_payload),
    actor_id: scope.actorId || null,
    actor_name: normalizeText(value.actorName || value.actor_name || actor.name || actor.displayName, 180) || null,
    client_id: normalizeText(value.clientId || value.client_id, 160) || null,
    applied_at: new Date().toISOString(),
  });
  if (!result.ok && isMissingSchema(result)) return { ok: true, payload: null };
  return result;
}

async function recordClipAnalysisOperation(clip = {}, existing = null, saved = {}, actor = {}) {
  return recordAnalysisOperation({
    matchId: clip.matchId,
    videoId: clip.videoId,
    collaborationSessionId: clip.collaborationSessionId,
    clientId: clip.clientId,
    entityType: "clip",
    entityId: saved.id,
    operationType: existing ? "clip.update" : "clip.create",
    expectedRevision: clip.expectedRevision,
    resultingRevision: saved.revision || 1,
    payload: { startMs: clip.startMs, endMs: clip.endMs, phase: clip.phase, subPhase: clip.subPhase, outcome: clip.outcome },
    inversePayload: existing ? {
      startMs: existing.start_ms,
      endMs: existing.end_ms,
      phase: existing.phase,
      subPhase: existing.sub_phase,
      outcome: existing.outcome,
    } : {},
  }, actor);
}

async function recordClipLifecycleOperation(operationType = "clip.update", payload = {}, existing = {}, saved = {}, actor = {}) {
  return recordAnalysisOperation({
    matchId: existing.match_id || saved.match_id,
    videoId: existing.video_id || saved.video_id,
    collaborationSessionId: payload.collaborationSessionId || payload.collaboration_session_id,
    clientId: payload.clientId || payload.client_id,
    entityType: "clip",
    entityId: saved.id || existing.id,
    operationType,
    expectedRevision: payload.expectedRevision || payload.expected_revision,
    resultingRevision: saved.revision || existing.revision || 1,
    payload: {
      startMs: saved.start_ms,
      endMs: saved.end_ms,
      status: saved.status,
      visibility: saved.metadata?.visibility,
    },
    inversePayload: {
      startMs: existing.start_ms,
      endMs: existing.end_ms,
      status: existing.status,
      visibility: existing.metadata?.visibility,
    },
  }, actor);
}

async function recordClipBatchOperation(operationType = "clip.batch", payload = {}, clips = [], actor = {}) {
  const groups = new Map();
  for (const clip of clips) {
    const key = `${clip.match_id || ""}:${clip.video_id || ""}`;
    const group = groups.get(key) || { matchId: clip.match_id, videoId: clip.video_id, clipIds: [] };
    if (clip.id) group.clipIds.push(clip.id);
    groups.set(key, group);
  }
  const results = await Promise.all([...groups.values()].map((group) => recordAnalysisOperation({
    matchId: group.matchId,
    videoId: group.videoId,
    collaborationSessionId: payload.collaborationSessionId || payload.collaboration_session_id,
    clientId: payload.clientId || payload.client_id,
    entityType: "clip-batch",
    operationType,
    payload: { clipIds: group.clipIds },
    inversePayload: { clipIds: group.clipIds },
  }, actor)));
  return { ok: results.every((result) => result.ok), results };
}

async function startCollaborationSession(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const matchId = normalizeUuid(payload.matchId || payload.match_id);
  if (!matchId) return { ok: false, status: 400, reason: "A match is required." };
  const timelineId = normalizeUuid(payload.timelineId || payload.timeline_id) || null;
  const activeParams = buildTeamParams(scope);
  activeParams.set("select", "*");
  activeParams.set("match_id", `eq.${matchId}`);
  activeParams.set("timeline_id", timelineId ? `eq.${timelineId}` : "is.null");
  activeParams.set("status", "eq.active");
  activeParams.set("order", "created_at.desc");
  activeParams.set("limit", "1");
  const activeResult = await selectRows("video_analysis_collaboration_sessions", activeParams);
  if (activeResult.ok && rowList(activeResult)[0]) {
    return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, collaborationSession: rowList(activeResult)[0] } };
  }
  if (!activeResult.ok && !isMissingSchema(activeResult)) return activeResult;
  const result = await insertRow("video_analysis_collaboration_sessions", {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    match_id: matchId,
    timeline_id: timelineId,
    title: normalizeText(payload.title || "Live analysis", 180),
    created_by: scope.actorId,
    metadata: safeObject(payload.metadata),
  });
  if (!result.ok && result.status === 409) {
    const racedResult = await selectRows("video_analysis_collaboration_sessions", activeParams);
    if (racedResult.ok && rowList(racedResult)[0]) {
      return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, collaborationSession: rowList(racedResult)[0] } };
    }
  }
  return result.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, collaborationSession: rowList(result)[0] || null } }
    : result;
}

module.exports = {
  getCollaborationState,
  joinCollaborationSession,
  leaveCollaborationSession,
  recordAnalysisOperation,
  recordClipAnalysisOperation,
  recordClipBatchOperation,
  recordClipLifecycleOperation,
  startCollaborationSession,
};
