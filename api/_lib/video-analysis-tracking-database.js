const {
  actorScope,
  asMs,
  buildTeamParams,
  insertRow,
  normalizeText,
  normalizeUuid,
  patchRows,
  rejectForbiddenPayload,
  selectRows,
} = require("./video-analysis-database-core.js");
const { recordAnalysisOperation } = require("./video-analysis-collaboration-database.js");
const {
  VIDEO_ANALYSIS_SCHEMA,
  mapCorrection,
  mapGraphic,
  mapTrack,
  normalizeGraphicPayload,
  normalizeTrackPayload,
  rowList,
  safeObject,
} = require("./video-analysis-tracking-contracts.js");

async function scopedClip(scope = {}, clipId = "") {
  const id = normalizeUuid(clipId);
  if (!id) return null;
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${id}`);
  params.set("limit", "1");
  const result = await selectRows("video_clip_instances", params);
  return result.ok ? rowList(result)[0] || null : null;
}

async function scopedTrack(scope = {}, trackId = "") {
  const result = await scopedTrackResult(scope, trackId);
  return result.ok ? result.row : null;
}

async function scopedTrackResult(scope = {}, trackId = "") {
  const id = normalizeUuid(trackId);
  if (!id) return { ok: true, row: null };
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${id}`);
  params.set("limit", "1");
  const result = await selectRows("video_object_tracks", params);
  return result.ok ? { ok: true, row: rowList(result)[0] || null } : { ...result, row: null };
}

async function correctionByOperationId(scope = {}, operationId = "") {
  if (!operationId) return { ok: true, row: null };
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("operation_id", `eq.${operationId}`);
  params.set("limit", "1");
  const result = await selectRows("video_track_corrections", params);
  return result.ok ? { ok: true, row: rowList(result)[0] || null } : { ...result, row: null };
}

function correctionOperationId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(normalized) ? normalized : "";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function correctionMatches(existing = {}, row = {}) {
  return existing.object_track_id === row.object_track_id
    && Number(existing.at_ms) === Number(row.at_ms)
    && existing.correction_type === row.correction_type
    && (existing.player_id || null) === (row.player_id || null)
    && (existing.player_label || null) === (row.player_label || null)
    && (existing.reason || null) === (row.reason || null)
    && canonicalJson(existing.box_json || {}) === canonicalJson(row.box_json || {})
    && canonicalJson(existing.ground_point_json || {}) === canonicalJson(row.ground_point_json || {})
    && canonicalJson(existing.metadata || {}) === canonicalJson(row.metadata || {});
}

function idempotentCorrectionPayload(existing, track) {
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      correction: mapCorrection(existing),
      objectTrack: mapTrack(track),
      idempotentReplay: true,
    },
  };
}

async function markTrackForCorrection(scope, track) {
  const params = buildTeamParams(scope);
  params.set("id", `eq.${track.id}`);
  const result = await patchRows("video_object_tracks", params, { status: "review" });
  if (!result.ok) return result;
  return {
    ok: true,
    track: rowList(result)[0] || { ...track, status: "review" },
  };
}

async function replayExistingCorrection(scope, correction, track) {
  if (track.status === "review") return idempotentCorrectionPayload(correction, track);
  const marked = await markTrackForCorrection(scope, track);
  return marked.ok ? idempotentCorrectionPayload(correction, marked.track) : marked;
}

async function listTrackingWorkspace(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const clipId = normalizeUuid(query.clipId || query.clip_id || query.clipInstanceId);
  if (!clipId) return { ok: false, status: 400, reason: "clip id is required." };
  const clip = await scopedClip(scope, clipId);
  if (!clip) return { ok: false, status: 404, reason: "Clip could not be found." };
  const trackParams = buildTeamParams(scope);
  trackParams.set("select", "*");
  trackParams.set("clip_instance_id", `eq.${clipId}`);
  trackParams.set("status", "neq.archived");
  trackParams.set("order", "start_ms.asc,id.asc");
  trackParams.set("limit", "200");
  const trackResult = await selectRows("video_object_tracks", trackParams);
  if (!trackResult.ok) return trackResult;
  const tracks = rowList(trackResult);
  const trackIds = tracks.map((track) => track.id);
  const correctionsByTrack = new Map();
  if (trackIds.length) {
    const correctionParams = buildTeamParams(scope);
    correctionParams.set("select", "*");
    correctionParams.set("object_track_id", `in.(${trackIds.join(",")})`);
    correctionParams.set("status", "eq.active");
    correctionParams.set("order", "at_ms.asc,created_at.asc,id.asc");
    correctionParams.set("limit", "2000");
    const correctionResult = await selectRows("video_track_corrections", correctionParams);
    if (!correctionResult.ok) return correctionResult;
    for (const correction of rowList(correctionResult).map(mapCorrection)) {
      const values = correctionsByTrack.get(correction.objectTrackId) || [];
      values.push(correction);
      correctionsByTrack.set(correction.objectTrackId, values);
    }
  }
  const graphicParams = buildTeamParams(scope);
  graphicParams.set("select", "*");
  graphicParams.set("clip_instance_id", `eq.${clipId}`);
  graphicParams.set("status", "eq.active");
  graphicParams.set("order", "start_ms.asc,id.asc");
  graphicParams.set("limit", "500");
  const graphicResult = await selectRows("video_dynamic_graphics", graphicParams);
  if (!graphicResult.ok) return graphicResult;
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      objectTracks: tracks.map((track) => mapTrack(track, correctionsByTrack.get(track.id) || [])),
      dynamicGraphics: rowList(graphicResult).map(mapGraphic),
      samplesStoredLocally: true,
    },
  };
}

async function saveObjectTrack(value = {}, actor = {}) {
  let track;
  try { track = normalizeTrackPayload(value, actor); } catch (error) {
    return { ok: false, status: error.status || 400, reason: error.message };
  }
  const clip = await scopedClip(track, track.clipId);
  if (!clip) return { ok: false, status: 404, reason: "Clip could not be found." };
  const existing = track.id ? await scopedTrack(track, track.id) : null;
  if (track.id && !existing) return { ok: false, status: 404, reason: "Object track could not be found." };
  if (existing && track.expectedRevision && Number(existing.revision || 1) !== track.expectedRevision) {
    return { ok: false, status: 409, reason: "Track revision conflict. Reload before saving." };
  }
  const row = {
    organization_id: track.organizationId,
    team_id: track.teamId,
    match_id: clip.match_id,
    video_id: clip.video_id,
    clip_instance_id: clip.id,
    entity_type: track.entityType,
    player_id: track.playerId,
    player_label: track.playerLabel,
    team_side: track.teamSide,
    shirt_number: track.shirtNumber,
    start_ms: track.startMs,
    end_ms: track.endMs,
    confidence: track.confidence,
    identity_confidence: track.identityConfidence,
    coverage_ratio: track.coverageRatio,
    point_count: track.pointCount,
    segment_count: track.segmentCount,
    engine: track.engine,
    engine_version: track.engineVersion,
    local_artifact_id: track.localArtifactId,
    local_artifact_hash: track.localArtifactHash,
    status: track.status,
    reviewed_by: track.status === "verified" ? track.actorId : existing?.reviewed_by || null,
    reviewed_at: track.status === "verified" ? new Date().toISOString() : existing?.reviewed_at || null,
    created_by: existing?.created_by || track.actorId,
    metadata: track.metadata,
  };
  let result;
  if (existing) {
    const params = buildTeamParams(track);
    params.set("id", `eq.${existing.id}`);
    if (track.expectedRevision) params.set("revision", `eq.${track.expectedRevision}`);
    result = await patchRows("video_object_tracks", params, row);
  } else result = await insertRow("video_object_tracks", row);
  const saved = rowList(result)[0] || null;
  if (!result.ok) return result;
  if (!saved) return { ok: false, status: track.expectedRevision ? 409 : 500, reason: "Object track could not be saved." };
  await recordAnalysisOperation({
    matchId: clip.match_id,
    videoId: clip.video_id,
    entityType: "object-track",
    entityId: saved.id,
    operationType: existing ? "track.update" : "track.create",
    expectedRevision: track.expectedRevision,
    resultingRevision: saved.revision,
    payload: { clipId: clip.id, status: saved.status, playerId: saved.player_id },
  }, actor);
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, objectTrack: mapTrack(saved), samplesStoredLocally: true } };
}

async function saveTrackCorrection(value = {}, actor = {}) {
  rejectForbiddenPayload(value);
  const scope = actorScope(actor);
  const requestedOperationId = value.operationId ?? value.operation_id ?? "";
  const operationId = requestedOperationId ? correctionOperationId(requestedOperationId) : null;
  if (requestedOperationId && !operationId) {
    return { ok: false, status: 400, reason: "Tracking correction operation id is invalid." };
  }
  const trackLookup = await scopedTrackResult(scope, value.objectTrackId || value.object_track_id);
  if (!trackLookup.ok) return trackLookup;
  const track = trackLookup.row;
  if (!track) return { ok: false, status: 404, reason: "Object track could not be found." };
  const correctionType = normalizeText(value.correctionType || value.correction_type || "position", 40).toLowerCase();
  const row = {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    operation_id: operationId,
    object_track_id: track.id,
    at_ms: asMs(value.atMs ?? value.at_ms, 0),
    correction_type: ["position", "identity", "occlusion", "split", "merge", "identity-swap"].includes(correctionType) ? correctionType : "position",
    box_json: safeObject(value.box || value.box_json),
    ground_point_json: safeObject(value.groundPoint || value.ground_point_json),
    player_id: normalizeText(value.playerId || value.player_id, 160) || null,
    player_label: normalizeText(value.playerLabel || value.player_label, 180) || null,
    reason: normalizeText(value.reason, 1000) || null,
    corrected_by: scope.actorId || null,
    metadata: safeObject(value.metadata),
  };
  const existingResult = await correctionByOperationId(scope, operationId);
  if (!existingResult.ok) return existingResult;
  const existing = existingResult.row;
  if (existing) {
    return correctionMatches(existing, row)
      ? replayExistingCorrection(scope, existing, track)
      : { ok: false, status: 409, reason: "Tracking correction operation id was already used for different content." };
  }
  const result = await insertRow("video_track_corrections", row);
  if (!result.ok && operationId && result.status === 409) {
    const winnerResult = await correctionByOperationId(scope, operationId);
    if (!winnerResult.ok) return winnerResult;
    const winner = winnerResult.row;
    if (winner) {
      return correctionMatches(winner, row)
        ? replayExistingCorrection(scope, winner, track)
        : { ok: false, status: 409, reason: "Tracking correction operation id was already used for different content." };
    }
  }
  if (!result.ok) return result;
  const marked = await markTrackForCorrection(scope, track);
  return marked.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, correction: mapCorrection(rowList(result)[0]), objectTrack: mapTrack(marked.track) } }
    : marked;
}

async function saveDynamicGraphic(value = {}, actor = {}) {
  let graphic;
  try { graphic = normalizeGraphicPayload(value, actor); } catch (error) {
    return { ok: false, status: error.status || 400, reason: error.message };
  }
  const clip = await scopedClip(graphic, graphic.clipId);
  if (!clip) return { ok: false, status: 404, reason: "Clip could not be found." };
  if (graphic.source !== "static" && !graphic.bindings.length) {
    return { ok: false, status: 400, reason: "Tracking graphics require object-track bindings." };
  }
  if (graphic.bindings.length) {
    const params = buildTeamParams(graphic);
    params.set("select", "id,clip_instance_id");
    params.set("id", `in.(${graphic.bindings.map((binding) => binding.trackId).join(",")})`);
    const result = await selectRows("video_object_tracks", params);
    const bound = rowList(result);
    if (!result.ok || bound.length !== new Set(graphic.bindings.map((binding) => binding.trackId)).size
      || bound.some((track) => track.clip_instance_id !== clip.id)) {
      return { ok: false, status: 400, reason: "Every graphic binding must belong to this clip." };
    }
  }
  let existing = null;
  if (graphic.id) {
    const params = buildTeamParams(graphic);
    params.set("select", "*");
    params.set("id", `eq.${graphic.id}`);
    params.set("limit", "1");
    existing = rowList(await selectRows("video_dynamic_graphics", params))[0] || null;
    if (!existing) return { ok: false, status: 404, reason: "Dynamic graphic could not be found." };
    if (graphic.expectedRevision && Number(existing.revision || 1) !== graphic.expectedRevision) {
      return { ok: false, status: 409, reason: "Graphic revision conflict. Reload before saving." };
    }
  }
  const row = {
    organization_id: graphic.organizationId,
    team_id: graphic.teamId,
    match_id: clip.match_id,
    video_id: clip.video_id,
    clip_instance_id: clip.id,
    presentation_item_id: graphic.presentationItemId,
    graphic_type: graphic.type,
    source: graphic.source,
    start_ms: graphic.startMs,
    end_ms: graphic.endMs,
    layer_text: graphic.text,
    bindings_json: graphic.bindings,
    static_points_json: graphic.staticPoints,
    style_json: graphic.style,
    trail_duration_ms: graphic.trailDurationMs,
    confidence_threshold: graphic.confidenceThreshold,
    locked: graphic.locked,
    hidden: graphic.hidden,
    created_by: existing?.created_by || graphic.actorId,
    metadata: graphic.metadata,
  };
  let result;
  if (existing) {
    const params = buildTeamParams(graphic);
    params.set("id", `eq.${existing.id}`);
    if (graphic.expectedRevision) params.set("revision", `eq.${graphic.expectedRevision}`);
    result = await patchRows("video_dynamic_graphics", params, row);
  } else result = await insertRow("video_dynamic_graphics", row);
  const saved = rowList(result)[0] || null;
  if (!result.ok) return result;
  if (!saved) return { ok: false, status: graphic.expectedRevision ? 409 : 500, reason: "Dynamic graphic could not be saved." };
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, dynamicGraphic: mapGraphic(saved) } };
}

module.exports = {
  listTrackingWorkspace,
  normalizeGraphicPayload,
  normalizeTrackPayload,
  saveDynamicGraphic,
  saveObjectTrack,
  saveTrackCorrection,
};
