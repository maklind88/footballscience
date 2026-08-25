import { normalizeMediaAngle, normalizeMediaAngleSet } from "../domain/mediaAngle.model.js";

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function matchTimeToAngleTime(matchTimeMs = 0, angleValue = {}) {
  const angle = normalizeMediaAngle(angleValue);
  const matchMs = Math.max(0, finiteNumber(matchTimeMs));
  const driftScale = 1 + (angle.driftPpm / 1_000_000);
  return Math.max(0, Math.round((matchMs * driftScale) + angle.syncOffsetMs));
}

export function angleTimeToMatchTime(angleTimeMs = 0, angleValue = {}) {
  const angle = normalizeMediaAngle(angleValue);
  const angleMs = Math.max(0, finiteNumber(angleTimeMs));
  const driftScale = 1 + (angle.driftPpm / 1_000_000);
  return Math.max(0, Math.round((angleMs - angle.syncOffsetMs) / driftScale));
}

export function synchronizedAnglePositions(matchTimeMs = 0, angleValues = []) {
  return normalizeMediaAngleSet(angleValues).map((angle) => ({
    angle,
    timeMs: matchTimeToAngleTime(matchTimeMs, angle),
    inRange: angle.durationMs <= 0 || matchTimeToAngleTime(matchTimeMs, angle) <= angle.durationMs,
  }));
}

export function syncErrorMs(referenceMatchTimeMs = 0, angleTimeMs = 0, angleValue = {}) {
  return Math.round(angleTimeToMatchTime(angleTimeMs, angleValue) - finiteNumber(referenceMatchTimeMs));
}

export function correctedAngleSync(angleValue = {}, referenceMatchTimeMs = 0, observedAngleTimeMs = 0) {
  const angle = normalizeMediaAngle(angleValue);
  return {
    ...angle,
    syncOffsetMs: Math.round(finiteNumber(observedAngleTimeMs) - finiteNumber(referenceMatchTimeMs)),
    syncConfidence: Math.max(angle.syncConfidence, 0.8),
  };
}
