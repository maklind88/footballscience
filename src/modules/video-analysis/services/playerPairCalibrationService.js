const SEATTLE_SOURCE = "58f51dda5c540feaa75bf09004149eee3e95e1eda04b083998289e19e2b30be6";
const PROFILE_URL = new URL("../calibration/seattle-177515-192515.json", import.meta.url);
let pendingProfile = null;

export function validPairCalibration(profile, sourceSha256) {
  if (profile?.schema !== "fs-player-pair-calibration/1" || profile.status !== "image-checked-estimate"
    || profile.sourceSha256 !== sourceSha256 || !/^[a-f0-9]{64}$/.test(sourceSha256 || "")
    || profile.independentMetricValidation !== false || profile.imageWidth !== 1920 || profile.imageHeight !== 1080
    || profile.fps !== 30 || profile.pitchLengthM !== 109.728 || profile.pitchWidthM !== 68.58
    || !Number.isFinite(profile.validFromMs) || !Number.isFinite(profile.validToMs)
    || profile.validToMs <= profile.validFromMs || profile.validToMs - profile.validFromMs > 30_000
    || profile.validation?.failed !== 0 || profile.validation?.negativeControlsAccepted !== 0
    || !Array.isArray(profile.frames) || profile.frames.length < 2 || profile.frames.length > 1000
    || profile.validation.frames !== profile.frames.length) return false;
  return profile.frames.every((frame, index) => frame.accepted === true && Number.isFinite(frame.atMs)
    && (!index || Math.abs(frame.atMs - profile.frames[index - 1].atMs - 1000 / profile.fps) < .01)
    && Array.isArray(frame.matrix) && frame.matrix.length === 9 && frame.matrix.every(Number.isFinite)
    && Array.isArray(frame.paintChecks) && frame.paintChecks.length === 4
    && frame.paintChecks.every(check => check.length === 3 && check.every(Number.isFinite)
      && check[0] >= 40 && check[1] >= .75 && check[1] <= 1 && check[2] >= 0)
    && Array.isArray(frame.support) && frame.support.length >= 3 && frame.support.length <= 500
    && frame.support.every(point => Array.isArray(point) && point.length === 2
      && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1)));
}

// Prepared geometry is opt-in by exact source bytes, never by filename or match title.
export async function loadPairCalibration(sourceSha256, win = window) {
  if (sourceSha256 !== SEATTLE_SOURCE) return null;
  if (!pendingProfile) pendingProfile = (async () => {
    const response = await win.fetch(PROFILE_URL, { signal: win.AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Calibration unavailable");
    const profile = await response.json();
    if (!validPairCalibration(profile, sourceSha256)) throw new Error("Calibration rejected");
    return profile;
  })().catch(() => { pendingProfile = null; return null; });
  return pendingProfile;
}

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point.y) !== (b[1] > point.y)
      && point.x < (b[0] - a[0]) * (point.y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

export function estimatedPairDistance(points, profile, { sourceSha256, sourceAtMs, width, height } = {}) {
  if (points?.length !== 2 || profile?.sourceSha256 !== sourceSha256
    || profile?.status !== "image-checked-estimate" || !Number.isFinite(sourceAtMs)
    || sourceAtMs < profile.validFromMs || sourceAtMs > profile.validToMs
    || width !== profile.imageWidth || height !== profile.imageHeight) return null;
  const index = Math.floor((sourceAtMs - profile.frames[0].atMs) * profile.fps / 1000 + 1e-7);
  const frame = profile.frames[index];
  if (!frame?.accepted || sourceAtMs < frame.atMs - .01 || sourceAtMs - frame.atMs > 1000 / profile.fps + .01) return null;
  const grounds = points.map(point => point.groundPoint);
  if (!grounds.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && inside(point, frame.support))) return null;
  const m = frame.matrix;
  const pitch = grounds.map(point => {
    const x = point.x * width, y = point.y * height, scale = m[6] * x + m[7] * y + m[8];
    return { x: (m[0] * x + m[1] * y + m[2]) / scale, y: (m[3] * x + m[4] * y + m[5]) / scale };
  });
  if (!pitch.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)
    && Math.abs(point.x) <= profile.pitchLengthM / 2 && Math.abs(point.y) <= profile.pitchWidthM / 2)) return null;
  return Math.hypot(pitch[1].x - pitch[0].x, pitch[1].y - pitch[0].y);
}

export function pairDistanceLabel(distance, estimated = false) {
  if (!Number.isFinite(distance) || distance < 0) return "";
  return estimated ? `\u2248${Math.round(distance)} m` : `${distance.toFixed(1)} m`;
}
