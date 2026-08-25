function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}

function timeValue(value, fallback = 0) {
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedText(value = "", maximum = 120) {
  return String(value || "").trim().slice(0, maximum);
}

function optionalCount(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

export function normalizeTrackingJobProgress(value = {}, previous = {}, options = {}) {
  const nowMs = Math.max(0, finiteNumber(options.nowMs, Date.now()));
  const previousProgress = clamp(previous.progress);
  const progress = Math.max(previousProgress, clamp(value.ratio ?? value.progress));
  const suppliedStart = timeValue(value.startedAt ?? value.startedAtMs);
  const startedAtMs = timeValue(previous.startedAtMs, suppliedStart || nowMs);
  const elapsedMs = Math.max(
    Math.max(0, finiteNumber(previous.elapsedMs)),
    Math.max(0, nowMs - startedAtMs),
  );
  const stage = boundedText(value.stage || previous.stage || "Tracking player");
  const isCancelling = /cancel/i.test(stage);
  let estimatedRemainingMs = null;
  if (!isCancelling && progress >= 0.15 && progress < 0.98 && elapsedMs > 0) {
    estimatedRemainingMs = Math.min(
      2 * 60 * 60 * 1000,
      Math.max(0, Math.round(elapsedMs * (1 - progress) / progress)),
    );
  } else if (progress >= 0.98) {
    estimatedRemainingMs = 0;
  }
  return {
    stage,
    progress,
    startedAtMs,
    elapsedMs,
    estimatedRemainingMs,
    processedFrames: optionalCount(value.processedFrames, previous.processedFrames ?? null),
    totalFrames: optionalCount(value.totalFrames, previous.totalFrames ?? null),
    device: boundedText(value.device || previous.device, 24),
    sampleFps: Math.max(0, finiteNumber(value.sampleFps, previous.sampleFps || 0)),
  };
}

export function formatTrackingDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(finiteNumber(milliseconds) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
