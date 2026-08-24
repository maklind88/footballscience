import { calibrationFrameAt, applyHomography } from "./spatialAnalysisService.js";

function invertMatrix(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length !== 9) return null;
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * ((e * i) - (f * h)) - b * ((d * i) - (f * g)) + c * ((d * h) - (e * g));
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return null;
  return [
    ((e * i) - (f * h)) / determinant,
    ((c * h) - (b * i)) / determinant,
    ((b * f) - (c * e)) / determinant,
    ((f * g) - (d * i)) / determinant,
    ((a * i) - (c * g)) / determinant,
    ((c * d) - (a * f)) / determinant,
    ((d * h) - (e * g)) / determinant,
    ((b * g) - (a * h)) / determinant,
    ((a * e) - (b * d)) / determinant,
  ];
}

function pitchLines(lengthM = 105, widthM = 68) {
  const centreX = lengthM / 2;
  const boxY = (widthM - 40.32) / 2;
  const goalY = (widthM - 18.32) / 2;
  return [
    [[0, 0], [lengthM, 0], [lengthM, widthM], [0, widthM], [0, 0]],
    [[centreX, 0], [centreX, widthM]],
    [[0, boxY], [16.5, boxY], [16.5, boxY + 40.32], [0, boxY + 40.32]],
    [[lengthM, boxY], [lengthM - 16.5, boxY], [lengthM - 16.5, boxY + 40.32], [lengthM, boxY + 40.32]],
    [[0, goalY], [5.5, goalY], [5.5, goalY + 18.32], [0, goalY + 18.32]],
    [[lengthM, goalY], [lengthM - 5.5, goalY], [lengthM - 5.5, goalY + 18.32], [lengthM, goalY + 18.32]],
  ];
}

function projectLine(points = [], inverse = []) {
  return points.map(([xM, yM]) => applyHomography({ x: xM, y: yM }, inverse))
    .filter(Boolean)
    .map((point) => ({ x: point.xM, y: point.yM }));
}

export function pitchOverlayGeometry(calibration = {}, atMs = 0) {
  const frame = calibrationFrameAt(calibration, atMs);
  const inverse = invertMatrix(frame?.imageToPitchMatrix);
  if (!inverse) return { available: false, lines: [] };
  const lines = pitchLines(calibration.pitchLengthM || 105, calibration.pitchWidthM || 68)
    .map((line) => projectLine(line, inverse))
    .filter((line) => line.length > 1);
  return { available: lines.length > 0, frameId: frame.id, lines };
}
