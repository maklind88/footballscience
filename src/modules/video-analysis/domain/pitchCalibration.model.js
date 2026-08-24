const calibrationStatuses = new Set(["uncalibrated", "draft", "calibrated", "verified", "archived"]);
const calibrationSources = new Set(["manual", "automatic", "hybrid"]);
const matrixInputSpaces = new Set(["normalized-image", "image-pixels"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}

function stringValue(value = "") {
  return String(value || "").trim();
}

export function normalizeHomography(value) {
  const source = Array.isArray(value) ? value.flat(Infinity) : [];
  if (source.length !== 9) return null;
  const matrix = source.map((entry) => Number(entry));
  return matrix.every(Number.isFinite) ? matrix : null;
}

export function normalizeCalibrationFrame(value = {}, fallbackIndex = 0) {
  const atMs = Math.max(0, Math.round(finiteNumber(value.atMs ?? value.at_ms, 0)));
  const validFromMs = Math.max(0, Math.round(finiteNumber(value.validFromMs ?? value.valid_from_ms, atMs)));
  const validToMs = Math.max(
    validFromMs,
    Math.round(finiteNumber(value.validToMs ?? value.valid_to_ms, atMs)),
  );
  const inputSpace = stringValue(value.inputSpace || value.input_space).toLowerCase();
  return {
    id: stringValue(value.id || `calibration-frame-${fallbackIndex + 1}`),
    atMs,
    validFromMs,
    validToMs,
    imageWidth: Math.max(0, Math.round(finiteNumber(value.imageWidth ?? value.image_width, 0))),
    imageHeight: Math.max(0, Math.round(finiteNumber(value.imageHeight ?? value.image_height, 0))),
    inputSpace: matrixInputSpaces.has(inputSpace) ? inputSpace : "normalized-image",
    imageToPitchMatrix: normalizeHomography(
      value.imageToPitchMatrix || value.image_to_pitch_matrix || value.homography,
    ),
    confidence: clamp(value.confidence ?? 0),
    rmsErrorM: Math.max(0, finiteNumber(value.rmsErrorM ?? value.rms_error_m, 0)),
    controlPointCount: Math.max(0, Math.round(finiteNumber(
      value.controlPointCount ?? value.control_point_count,
      0,
    ))),
  };
}

export function normalizePitchCalibration(value = {}) {
  const status = stringValue(value.status).toLowerCase();
  const source = stringValue(value.source).toLowerCase();
  const frames = (value.frames || value.keyframes || [])
    .map(normalizeCalibrationFrame)
    .filter((frame) => frame.imageToPitchMatrix)
    .sort((first, second) => first.atMs - second.atMs);
  return {
    id: stringValue(value.id),
    matchId: stringValue(value.matchId || value.match_id),
    videoId: stringValue(value.videoId || value.video_id),
    pitchLengthM: positiveNumber(value.pitchLengthM ?? value.pitch_length_m, 105),
    pitchWidthM: positiveNumber(value.pitchWidthM ?? value.pitch_width_m, 68),
    status: calibrationStatuses.has(status) ? status : "uncalibrated",
    source: calibrationSources.has(source) ? source : "manual",
    confidence: clamp(value.confidence ?? 0),
    frames,
    verifiedBy: stringValue(value.verifiedBy || value.verified_by),
    verifiedAt: stringValue(value.verifiedAt || value.verified_at),
    metadata: value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? value.metadata
      : {},
  };
}

export function calibrationReadiness(value = {}) {
  const calibration = normalizePitchCalibration(value);
  const usableFrames = calibration.frames.filter((frame) => (
    frame.controlPointCount >= 4
    && frame.confidence >= 0.5
    && frame.rmsErrorM <= 2
  ));
  return {
    ready: usableFrames.length > 0 && ["calibrated", "verified"].includes(calibration.status),
    frameCount: calibration.frames.length,
    usableFrameCount: usableFrames.length,
    confidence: calibration.confidence,
  };
}

