import { applyHomography } from "./spatialAnalysisService.js";

export const pitchLandmarks = Object.freeze([
  { id: "corner-home-left", label: "Home left corner", xM: 0, yM: 0 },
  { id: "corner-home-right", label: "Home right corner", xM: 0, yM: 68 },
  { id: "corner-away-left", label: "Away left corner", xM: 105, yM: 0 },
  { id: "corner-away-right", label: "Away right corner", xM: 105, yM: 68 },
  { id: "halfway-left", label: "Halfway left touchline", xM: 52.5, yM: 0 },
  { id: "halfway-right", label: "Halfway right touchline", xM: 52.5, yM: 68 },
  { id: "centre-spot", label: "Centre spot", xM: 52.5, yM: 34 },
  { id: "home-penalty-spot", label: "Home penalty spot", xM: 11, yM: 34 },
  { id: "away-penalty-spot", label: "Away penalty spot", xM: 94, yM: 34 },
  { id: "home-box-left", label: "Home penalty box left", xM: 16.5, yM: 13.84 },
  { id: "home-box-right", label: "Home penalty box right", xM: 16.5, yM: 54.16 },
  { id: "away-box-left", label: "Away penalty box left", xM: 88.5, yM: 13.84 },
  { id: "away-box-right", label: "Away penalty box right", xM: 88.5, yM: 54.16 },
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
}

function normalizedPoint(value = {}, index = 0) {
  return {
    id: String(value.id || `control-${index + 1}`),
    landmarkId: String(value.landmarkId || value.landmark_id || ""),
    label: String(value.label || "Control point"),
    imageX: clamp(value.imageX ?? value.image_x ?? value.x),
    imageY: clamp(value.imageY ?? value.image_y ?? value.y),
    pitchXM: finite(value.pitchXM ?? value.pitch_x_m ?? value.xM, Number.NaN),
    pitchYM: finite(value.pitchYM ?? value.pitch_y_m ?? value.yM, Number.NaN),
  };
}

function solveLinearSystem(matrix = [], values = []) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function leastSquares(rows = [], values = []) {
  const width = rows[0]?.length || 0;
  const normal = Array.from({ length: width }, () => Array(width).fill(0));
  const target = Array(width).fill(0);
  rows.forEach((row, rowIndex) => {
    for (let first = 0; first < width; first += 1) {
      target[first] += row[first] * values[rowIndex];
      for (let second = 0; second < width; second += 1) {
        normal[first][second] += row[first] * row[second];
      }
    }
  });
  return solveLinearSystem(normal, target);
}

function controlPointCoverage(points = []) {
  const xs = points.map((point) => point.imageX);
  const ys = points.map((point) => point.imageY);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  return clamp(xSpan / 0.45) * clamp(ySpan / 0.3);
}

export function solvePitchHomography(values = []) {
  const points = values.map(normalizedPoint).filter((point) => (
    Number.isFinite(point.pitchXM) && Number.isFinite(point.pitchYM)
  ));
  if (points.length < 4) return { ready: false, reason: "Place at least four pitch landmarks.", points };
  const rows = [];
  const targets = [];
  points.forEach((point) => {
    const { imageX: x, imageY: y, pitchXM: xM, pitchYM: yM } = point;
    rows.push([x, y, 1, 0, 0, 0, -xM * x, -xM * y]);
    targets.push(xM);
    rows.push([0, 0, 0, x, y, 1, -yM * x, -yM * y]);
    targets.push(yM);
  });
  const solved = leastSquares(rows, targets);
  if (!solved) return { ready: false, reason: "Control points do not define a stable pitch plane.", points };
  const matrix = [...solved, 1];
  const errors = points.map((point) => {
    const projected = applyHomography({ x: point.imageX, y: point.imageY }, matrix);
    return projected ? Math.hypot(projected.xM - point.pitchXM, projected.yM - point.pitchYM) : Number.POSITIVE_INFINITY;
  });
  const rmsErrorM = Math.sqrt(errors.reduce((sum, error) => sum + (error ** 2), 0) / errors.length);
  const coverage = controlPointCoverage(points);
  const confidence = clamp((1 - (rmsErrorM / 4)) * Math.sqrt(coverage));
  return {
    ready: confidence >= 0.5 && rmsErrorM <= 2,
    reason: confidence < 0.5 ? "Spread landmarks across a larger visible pitch area." : "",
    matrix,
    points,
    rmsErrorM: Math.round(rmsErrorM * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    coverage: Math.round(coverage * 1000) / 1000,
  };
}

export function buildPitchCalibration(values = [], options = {}) {
  const solution = solvePitchHomography(values);
  const atMs = Math.max(0, Math.round(finite(options.atMs)));
  const durationMs = Math.max(1, Math.round(finite(options.durationMs, 1)));
  return {
    id: String(options.id || ""),
    matchId: String(options.matchId || ""),
    videoId: String(options.videoId || ""),
    sourceId: String(options.sourceId || ""),
    pitchLengthM: Math.max(1, finite(options.pitchLengthM, 105)),
    pitchWidthM: Math.max(1, finite(options.pitchWidthM, 68)),
    status: solution.ready ? "calibrated" : "draft",
    source: "manual",
    confidence: solution.confidence || 0,
    frames: solution.matrix ? [{
      id: String(options.frameId || ""),
      atMs,
      validFromMs: Math.max(0, Math.round(finite(options.validFromMs, 0))),
      validToMs: Math.max(atMs, Math.round(finite(options.validToMs, durationMs))),
      inputSpace: "normalized-image",
      imageToPitchMatrix: solution.matrix,
      confidence: solution.confidence,
      rmsErrorM: solution.rmsErrorM,
      controlPointCount: solution.points.length,
      controlPoints: solution.points,
    }] : [],
    metadata: { controlPointCoverage: solution.coverage || 0 },
  };
}
