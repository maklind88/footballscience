const {
  actorScope,
  asMs,
  normalizeText,
  normalizeUuid,
  rejectForbiddenPayload,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-elite-v1";
const CALIBRATION_SOURCES = new Set(["manual", "automatic", "hybrid"]);
const CALIBRATION_STATUSES = new Set(["draft", "calibrated", "verified", "archived"]);

function rowList(result = {}) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(value, minimum = 0, maximum = 1) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : minimum));
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

function expectedRevision(value = {}) {
  return Math.max(0, Math.round(Number(value.expectedRevision ?? value.expected_revision) || 0)) || null;
}

function matrixValue(value) {
  const matrix = Array.isArray(value) ? value.flat(Infinity).map(Number) : [];
  return matrix.length === 9 && matrix.every(Number.isFinite) ? matrix : null;
}

function rounded(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function calibrationQuality(matrix, points = []) {
  const errors = points.map((point) => {
    const denominator = (matrix[6] * point.imageX) + (matrix[7] * point.imageY) + matrix[8];
    if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) return Number.POSITIVE_INFINITY;
    const xM = ((matrix[0] * point.imageX) + (matrix[1] * point.imageY) + matrix[2]) / denominator;
    const yM = ((matrix[3] * point.imageX) + (matrix[4] * point.imageY) + matrix[5]) / denominator;
    return Math.hypot(xM - point.pitchXM, yM - point.pitchYM);
  });
  const rmsErrorM = Math.sqrt(errors.reduce((sum, error) => sum + (error ** 2), 0) / Math.max(1, errors.length));
  const xValues = points.map((point) => point.imageX);
  const yValues = points.map((point) => point.imageY);
  const coverage = clamp(
    ((Math.max(...xValues) - Math.min(...xValues)) / 0.45),
  ) * clamp(
    ((Math.max(...yValues) - Math.min(...yValues)) / 0.3),
  );
  const confidence = Number.isFinite(rmsErrorM)
    ? clamp((1 - (rmsErrorM / 4)) * Math.sqrt(coverage))
    : 0;
  return {
    confidence: rounded(confidence),
    coverage: rounded(coverage),
    rmsErrorM: Number.isFinite(rmsErrorM) ? rounded(rmsErrorM) : 100,
  };
}

function controlPoints(value) {
  return (Array.isArray(value) ? value : []).slice(0, 40).map((point = {}, index) => ({
    id: normalizeText(point.id || `control-${index + 1}`, 120),
    landmarkId: normalizeText(point.landmarkId || point.landmark_id, 120),
    label: normalizeText(point.label, 180),
    imageX: clamp(point.imageX ?? point.image_x ?? point.x),
    imageY: clamp(point.imageY ?? point.image_y ?? point.y),
    pitchXM: boundedNumber(point.pitchXM ?? point.pitch_x_m ?? point.xM, 0, -20, 140),
    pitchYM: boundedNumber(point.pitchYM ?? point.pitch_y_m ?? point.yM, 0, -20, 110),
  }));
}

function normalizeCalibrationFrame(value = {}, scope = {}) {
  const matrix = matrixValue(value.imageToPitchMatrix || value.image_to_pitch_matrix || value.homography || value.matrix);
  const points = controlPoints(value.controlPoints || value.control_points || value.control_points_json);
  if (!matrix || points.length < 4) {
    const error = new Error("Calibration frames require a 3x3 matrix and at least four control points.");
    error.status = 400;
    throw error;
  }
  const quality = calibrationQuality(matrix, points);
  const atMs = asMs(value.atMs ?? value.at_ms, 0);
  const validFromMs = asMs(value.validFromMs ?? value.valid_from_ms, atMs);
  const validToMs = Math.max(validFromMs, asMs(value.validToMs ?? value.valid_to_ms, atMs));
  return {
    ...scope,
    id: normalizeUuid(value.id),
    expectedRevision: expectedRevision(value),
    atMs,
    validFromMs,
    validToMs,
    imageWidth: Math.round(boundedNumber(value.imageWidth ?? value.image_width, 0, 0, 32768)),
    imageHeight: Math.round(boundedNumber(value.imageHeight ?? value.image_height, 0, 0, 32768)),
    inputSpace: value.inputSpace === "image-pixels" || value.input_space === "image-pixels" ? "image-pixels" : "normalized-image",
    matrix,
    controlPoints: points,
    confidence: quality.confidence,
    rmsErrorM: quality.rmsErrorM,
    metadata: { ...safeObject(value.metadata), controlPointCoverage: quality.coverage },
  };
}

function normalizeCalibrationPayload(value = {}, actor = {}) {
  rejectForbiddenPayload(value);
  const scope = actorScope(actor);
  const frames = (Array.isArray(value.frames) ? value.frames : []).slice(0, 500)
    .map((frame) => normalizeCalibrationFrame(frame, scope));
  const requestedStatus = normalizeText(value.status || "draft", 40).toLowerCase();
  const usable = frames.filter((frame) => frame.controlPoints.length >= 4 && frame.confidence >= 0.5 && frame.rmsErrorM <= 2);
  const status = requestedStatus === "verified" && usable.length === frames.length && frames.length
    ? "verified"
    : usable.length ? "calibrated" : "draft";
  const source = normalizeText(value.source || value.calibrationSource || value.calibration_source || "manual", 40).toLowerCase();
  return {
    ...scope,
    id: normalizeUuid(value.id),
    expectedRevision: expectedRevision(value),
    matchId: normalizeUuid(value.matchId || value.match_id),
    videoId: normalizeUuid(value.videoId || value.video_id),
    sourceId: normalizeUuid(value.sourceId || value.source_id),
    pitchLengthM: boundedNumber(value.pitchLengthM ?? value.pitch_length_m, 105, 90, 120),
    pitchWidthM: boundedNumber(value.pitchWidthM ?? value.pitch_width_m, 68, 45, 90),
    source: CALIBRATION_SOURCES.has(source) ? source : "manual",
    status: CALIBRATION_STATUSES.has(status) ? status : "draft",
    confidence: frames.length ? Math.min(...frames.map((frame) => frame.confidence)) : 0,
    frames,
    metadata: safeObject(value.metadata),
  };
}

function mapCalibrationFrame(row = {}) {
  return {
    id: row.id,
    atMs: row.at_ms,
    validFromMs: row.valid_from_ms,
    validToMs: row.valid_to_ms,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    inputSpace: row.input_space,
    imageToPitchMatrix: row.image_to_pitch_matrix || [],
    controlPoints: row.control_points_json || [],
    confidence: Number(row.confidence || 0),
    rmsErrorM: Number(row.rms_error_m || 0),
    revision: row.revision || 1,
    metadata: row.metadata || {},
  };
}

function mapCalibration(row = {}, frames = []) {
  return {
    id: row.id,
    matchId: row.match_id,
    videoId: row.video_id,
    sourceId: row.source_id || "",
    pitchLengthM: Number(row.pitch_length_m || 105),
    pitchWidthM: Number(row.pitch_width_m || 68),
    source: row.calibration_source,
    status: row.status,
    confidence: Number(row.confidence || 0),
    revision: row.revision || 1,
    verifiedBy: row.verified_by || "",
    verifiedAt: row.verified_at || "",
    frames,
    metadata: row.metadata || {},
  };
}

module.exports = {
  VIDEO_ANALYSIS_SCHEMA,
  mapCalibration,
  mapCalibrationFrame,
  normalizeCalibrationPayload,
  rowList,
};
