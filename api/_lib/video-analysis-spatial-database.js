const {
  actorScope,
  buildTeamParams,
  insertRow,
  normalizeUuid,
  patchRows,
  selectRows,
} = require("./video-analysis-database-core.js");
const {
  VIDEO_ANALYSIS_SCHEMA,
  mapCalibration,
  mapCalibrationFrame,
  normalizeCalibrationPayload,
  rowList,
} = require("./video-analysis-spatial-contracts.js");
const { recordAnalysisOperation } = require("./video-analysis-collaboration-database.js");

async function scopedRow(table, scope = {}, id = "") {
  const rowId = normalizeUuid(id);
  if (!rowId) return null;
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${rowId}`);
  params.set("limit", "1");
  const result = await selectRows(table, params);
  return result.ok ? rowList(result)[0] || null : null;
}

async function calibrationFrames(scope = {}, calibrationId = "") {
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("calibration_id", `eq.${calibrationId}`);
  params.set("status", "eq.active");
  params.set("order", "at_ms.asc,id.asc");
  params.set("limit", "500");
  const result = await selectRows("video_pitch_calibration_frames", params);
  return result.ok ? { ok: true, frames: rowList(result).map(mapCalibrationFrame) } : result;
}

async function listPitchCalibration(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const videoId = normalizeUuid(query.videoId || query.video_id);
  const sourceId = normalizeUuid(query.sourceId || query.source_id);
  if (!videoId) return { ok: false, status: 400, reason: "video id is required." };
  const video = await scopedRow("video_videos", scope, videoId);
  if (!video) return { ok: false, status: 404, reason: "Video could not be found." };
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("video_id", `eq.${videoId}`);
  if (sourceId) params.set("source_id", `eq.${sourceId}`);
  params.set("status", "neq.archived");
  params.set("order", "updated_at.desc,id.asc");
  params.set("limit", "1");
  const result = await selectRows("video_pitch_calibrations", params);
  if (!result.ok) return result;
  const calibration = rowList(result)[0] || null;
  if (!calibration) return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, calibration: null } };
  const frameResult = await calibrationFrames(scope, calibration.id);
  return frameResult.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, calibration: mapCalibration(calibration, frameResult.frames) } }
    : frameResult;
}

async function saveFrame(frame = {}, calibration = {}, actor = {}) {
  const existing = frame.id ? await scopedRow("video_pitch_calibration_frames", calibration, frame.id) : null;
  if (frame.id && (!existing || existing.calibration_id !== calibration.id)) {
    return { ok: false, status: 404, reason: "Calibration frame could not be found." };
  }
  if (existing && frame.expectedRevision && Number(existing.revision || 1) !== frame.expectedRevision) {
    return { ok: false, status: 409, reason: "Calibration frame revision conflict." };
  }
  const row = {
    organization_id: calibration.organizationId,
    team_id: calibration.teamId,
    calibration_id: calibration.id,
    at_ms: frame.atMs,
    valid_from_ms: frame.validFromMs,
    valid_to_ms: frame.validToMs,
    image_width: frame.imageWidth,
    image_height: frame.imageHeight,
    input_space: frame.inputSpace,
    image_to_pitch_matrix: frame.matrix,
    control_points_json: frame.controlPoints,
    confidence: frame.confidence,
    rms_error_m: frame.rmsErrorM,
    created_by: existing?.created_by || calibration.actorId,
    metadata: frame.metadata,
  };
  let result;
  if (existing) {
    const params = buildTeamParams(calibration);
    params.set("id", `eq.${existing.id}`);
    if (frame.expectedRevision) params.set("revision", `eq.${frame.expectedRevision}`);
    result = await patchRows("video_pitch_calibration_frames", params, row);
  } else result = await insertRow("video_pitch_calibration_frames", row);
  const saved = rowList(result)[0] || null;
  return result.ok && saved
    ? { ok: true, frame: mapCalibrationFrame(saved) }
    : { ok: false, status: frame.expectedRevision ? 409 : result.status || 500, reason: result.reason || "Calibration frame could not be saved." };
}

async function savePitchCalibration(value = {}, actor = {}) {
  let calibration;
  try { calibration = normalizeCalibrationPayload(value, actor); } catch (error) {
    return { ok: false, status: error.status || 400, reason: error.message };
  }
  if (!calibration.videoId || !calibration.frames.length) {
    return { ok: false, status: 400, reason: "Video and calibration frames are required." };
  }
  const video = await scopedRow("video_videos", calibration, calibration.videoId);
  if (!video) return { ok: false, status: 404, reason: "Video could not be found." };
  if (calibration.sourceId) {
    const source = await scopedRow("video_sources", calibration, calibration.sourceId);
    if (!source || source.video_id !== video.id) return { ok: false, status: 400, reason: "Calibration source must belong to this video." };
  }
  const existing = calibration.id ? await scopedRow("video_pitch_calibrations", calibration, calibration.id) : null;
  if (calibration.id && !existing) return { ok: false, status: 404, reason: "Pitch calibration could not be found." };
  if (existing && calibration.expectedRevision && Number(existing.revision || 1) !== calibration.expectedRevision) {
    return { ok: false, status: 409, reason: "Calibration revision conflict. Reload before saving." };
  }
  const row = {
    organization_id: calibration.organizationId,
    team_id: calibration.teamId,
    match_id: video.match_id,
    video_id: video.id,
    source_id: calibration.sourceId || null,
    pitch_length_m: calibration.pitchLengthM,
    pitch_width_m: calibration.pitchWidthM,
    calibration_source: calibration.source,
    status: calibration.status,
    confidence: calibration.confidence,
    frame_count: calibration.frames.length,
    verified_by: calibration.status === "verified" ? calibration.actorId : existing?.verified_by || null,
    verified_at: calibration.status === "verified" ? new Date().toISOString() : existing?.verified_at || null,
    created_by: existing?.created_by || calibration.actorId,
    metadata: calibration.metadata,
  };
  let result;
  if (existing) {
    const params = buildTeamParams(calibration);
    params.set("id", `eq.${existing.id}`);
    if (calibration.expectedRevision) params.set("revision", `eq.${calibration.expectedRevision}`);
    result = await patchRows("video_pitch_calibrations", params, row);
  } else result = await insertRow("video_pitch_calibrations", row);
  const saved = rowList(result)[0] || null;
  if (!result.ok || !saved) return { ok: false, status: calibration.expectedRevision ? 409 : result.status || 500, reason: result.reason || "Pitch calibration could not be saved." };
  const savedFrames = [];
  for (const frame of calibration.frames) {
    const frameResult = await saveFrame(frame, { ...calibration, id: saved.id }, actor);
    if (!frameResult.ok) return frameResult;
    savedFrames.push(frameResult.frame);
  }
  await recordAnalysisOperation({
    matchId: video.match_id,
    videoId: video.id,
    entityType: "pitch-calibration",
    entityId: saved.id,
    operationType: existing ? "calibration.update" : "calibration.create",
    expectedRevision: calibration.expectedRevision,
    resultingRevision: saved.revision,
    payload: { status: saved.status, confidence: saved.confidence, frameCount: savedFrames.length },
  }, actor);
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, calibration: mapCalibration(saved, savedFrames) } };
}

module.exports = { listPitchCalibration, savePitchCalibration };
