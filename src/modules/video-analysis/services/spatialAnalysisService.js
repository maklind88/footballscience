import { normalizePitchCalibration } from "../domain/pitchCalibration.model.js";
import { trackingAnchorAt } from "./trackingGeometryService.js";

const denominatorEpsilon = 1e-9;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mean(values = []) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function rounded(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(finiteNumber(value) * factor) / factor;
}

export function calibrationFrameAt(calibrationValue = {}, atMs = 0) {
  const calibration = normalizePitchCalibration(calibrationValue);
  const targetMs = Math.max(0, Math.round(finiteNumber(atMs)));
  const validFrames = calibration.frames.filter((frame) => (
    targetMs >= frame.validFromMs && targetMs <= frame.validToMs
  ));
  const candidates = validFrames.length ? validFrames : calibration.frames;
  return candidates.slice().sort((first, second) => (
    Math.abs(first.atMs - targetMs) - Math.abs(second.atMs - targetMs)
  ))[0] || null;
}

export function applyHomography(point = {}, matrix = []) {
  if (!Array.isArray(matrix) || matrix.length !== 9) return null;
  const x = finiteNumber(point.x, Number.NaN);
  const y = finiteNumber(point.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const denominator = (matrix[6] * x) + (matrix[7] * y) + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < denominatorEpsilon) return null;
  const projectedX = ((matrix[0] * x) + (matrix[1] * y) + matrix[2]) / denominator;
  const projectedY = ((matrix[3] * x) + (matrix[4] * y) + matrix[5]) / denominator;
  if (!Number.isFinite(projectedX) || !Number.isFinite(projectedY)) return null;
  return { xM: projectedX, yM: projectedY };
}

export function projectImagePointToPitch(point = {}, calibrationValue = {}, atMs = 0) {
  const calibration = normalizePitchCalibration(calibrationValue);
  const frame = calibrationFrameAt(calibration, atMs);
  if (!frame?.imageToPitchMatrix) return null;
  const input = frame.inputSpace === "image-pixels"
    ? {
      x: finiteNumber(point.x) * frame.imageWidth,
      y: finiteNumber(point.y) * frame.imageHeight,
    }
    : point;
  const projected = applyHomography(input, frame.imageToPitchMatrix);
  if (!projected) return null;
  const toleranceM = 5;
  const inPitchBounds = projected.xM >= -toleranceM
    && projected.xM <= calibration.pitchLengthM + toleranceM
    && projected.yM >= -toleranceM
    && projected.yM <= calibration.pitchWidthM + toleranceM;
  return {
    ...projected,
    atMs: Math.max(0, Math.round(finiteNumber(atMs))),
    inPitchBounds,
    confidence: Math.min(
      finiteNumber(point.confidence, 1),
      finiteNumber(frame.confidence, calibration.confidence),
      finiteNumber(calibration.confidence, 0),
    ),
    calibrationFrameId: frame.id,
    rmsErrorM: frame.rmsErrorM,
  };
}

export function projectTrackToPitch(track = {}, calibration = {}, atMs = 0, options = {}) {
  const anchor = trackingAnchorAt(track, atMs, options.anchor || "ground", options);
  return anchor ? projectImagePointToPitch(anchor, calibration, atMs) : null;
}

export function pitchDistance(first = {}, second = {}) {
  if (![first.xM, first.yM, second.xM, second.yM].every(Number.isFinite)) return null;
  return Math.hypot(first.xM - second.xM, first.yM - second.yM);
}

function pairwiseDistances(points = []) {
  const distances = [];
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      distances.push(pitchDistance(points[firstIndex], points[secondIndex]));
    }
  }
  return distances.filter(Number.isFinite);
}

export function computeUnitMetrics(points = []) {
  const valid = points.filter((point) => Number.isFinite(point.xM) && Number.isFinite(point.yM));
  if (!valid.length) {
    return {
      available: false,
      playerCount: 0,
      centroid: null,
      lengthM: 0,
      widthM: 0,
      meanPairDistanceM: 0,
      minimumPairDistanceM: 0,
      maximumPairDistanceM: 0,
      confidence: 0,
    };
  }
  const xValues = valid.map((point) => point.xM);
  const yValues = valid.map((point) => point.yM);
  const distances = pairwiseDistances(valid);
  return {
    available: true,
    playerCount: valid.length,
    centroid: {
      xM: rounded(mean(xValues)),
      yM: rounded(mean(yValues)),
    },
    lengthM: rounded(Math.max(...xValues) - Math.min(...xValues)),
    widthM: rounded(Math.max(...yValues) - Math.min(...yValues)),
    meanPairDistanceM: rounded(mean(distances)),
    minimumPairDistanceM: rounded(distances.length ? Math.min(...distances) : 0),
    maximumPairDistanceM: rounded(distances.length ? Math.max(...distances) : 0),
    confidence: rounded(Math.min(...valid.map((point) => finiteNumber(point.confidence, 0))), 3),
  };
}

export function unitMetricsAt(tracks = [], calibration = {}, atMs = 0, options = {}) {
  const points = tracks.map((track) => projectTrackToPitch(track, calibration, atMs, options)).filter(Boolean);
  return {
    atMs: Math.max(0, Math.round(finiteNumber(atMs))),
    ...computeUnitMetrics(points),
  };
}

export function buildDistanceSeries(firstTrack = {}, secondTrack = {}, calibration = {}, options = {}) {
  const startMs = Math.max(0, Math.round(finiteNumber(options.startMs)));
  const endMs = Math.max(startMs, Math.round(finiteNumber(options.endMs, startMs)));
  const stepMs = Math.max(40, Math.round(finiteNumber(options.stepMs, 200)));
  const values = [];
  for (let atMs = startMs; atMs <= endMs; atMs += stepMs) {
    const first = projectTrackToPitch(firstTrack, calibration, atMs, options);
    const second = projectTrackToPitch(secondTrack, calibration, atMs, options);
    const distanceM = first && second ? pitchDistance(first, second) : null;
    values.push({
      atMs,
      distanceM: Number.isFinite(distanceM) ? rounded(distanceM) : null,
      confidence: first && second ? rounded(Math.min(first.confidence, second.confidence), 3) : 0,
    });
  }
  return values;
}

export function buildUnitGapSeries(firstUnitTracks = [], secondUnitTracks = [], calibration = {}, options = {}) {
  const startMs = Math.max(0, Math.round(finiteNumber(options.startMs)));
  const endMs = Math.max(startMs, Math.round(finiteNumber(options.endMs, startMs)));
  const stepMs = Math.max(40, Math.round(finiteNumber(options.stepMs, 200)));
  const values = [];
  for (let atMs = startMs; atMs <= endMs; atMs += stepMs) {
    const first = unitMetricsAt(firstUnitTracks, calibration, atMs, options);
    const second = unitMetricsAt(secondUnitTracks, calibration, atMs, options);
    const distanceM = first.centroid && second.centroid ? pitchDistance(first.centroid, second.centroid) : null;
    values.push({
      atMs,
      distanceM: Number.isFinite(distanceM) ? rounded(distanceM) : null,
      firstUnit: first,
      secondUnit: second,
      confidence: first.available && second.available ? rounded(Math.min(first.confidence, second.confidence), 3) : 0,
    });
  }
  return values;
}

export function movementCurve(track = {}, calibration = {}, options = {}) {
  const startMs = Math.max(0, Math.round(finiteNumber(options.startMs)));
  const endMs = Math.max(startMs, Math.round(finiteNumber(options.endMs, startMs)));
  const stepMs = Math.max(40, Math.round(finiteNumber(options.stepMs, 200)));
  const points = [];
  for (let atMs = startMs; atMs <= endMs; atMs += stepMs) {
    const point = projectTrackToPitch(track, calibration, atMs, options);
    if (point) points.push(point);
  }
  let distanceM = 0;
  for (let index = 1; index < points.length; index += 1) {
    distanceM += pitchDistance(points[index - 1], points[index]) || 0;
  }
  return {
    points,
    distanceM: rounded(distanceM),
    sampleCount: points.length,
  };
}
