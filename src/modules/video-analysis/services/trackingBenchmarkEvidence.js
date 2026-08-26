export const TRACKING_REAL_MATCH_REVIEW_PROTOCOL = "football-ground-truth-review-v1";

function mergeIntervals(intervals = []) {
  const sorted = intervals.slice().sort((first, second) => (
    first.startMs - second.startMs || first.endMs - second.endMs
  ));
  let durationMs = 0;
  let current = null;
  for (const interval of sorted) {
    if (!current || interval.startMs > current.endMs) {
      if (current) durationMs += current.endMs - current.startMs;
      current = { ...interval };
    } else current.endMs = Math.max(current.endMs, interval.endMs);
  }
  if (current) durationMs += current.endMs - current.startMs;
  return durationMs;
}

function realMatchInterval(report = {}) {
  const sourceFingerprint = String(report.sourceFingerprint || "").trim().toLowerCase();
  const startMs = Math.round(Number(report.range?.startMs));
  const endMs = Math.round(Number(report.range?.endMs));
  const durationMs = endMs - startMs;
  if (!/^[a-f0-9]{64}$/.test(sourceFingerprint)
    || !Number.isFinite(startMs)
    || !Number.isFinite(endMs)
    || startMs < 0
    || durationMs <= 0
    || Number(report.evidence?.durationMs) !== durationMs) return null;
  return { sourceFingerprint, startMs, endMs, durationMs };
}

export function trackingBenchmarkCaseEvidence(value = {}, range = {}) {
  const review = value.reviewEvidence && typeof value.reviewEvidence === "object"
    ? value.reviewEvidence
    : {};
  const realMatch = review.kind === "real-match"
    && review.protocol === TRACKING_REAL_MATCH_REVIEW_PROTOCOL
    && review.attested === true;
  return {
    kind: realMatch ? "real-match" : "synthetic-or-unattested",
    reviewProtocol: realMatch ? TRACKING_REAL_MATCH_REVIEW_PROTOCOL : "",
    attested: realMatch,
    durationMs: Math.max(1, Math.round(Number(range.durationMs) || 1)),
  };
}

export function trackingBenchmarkSuiteEvidence(reports = []) {
  const realMatchCases = reports.filter((report) => report.evidence?.kind === "real-match"
    && report.evidence?.attested === true
    && report.evidence?.reviewProtocol === TRACKING_REAL_MATCH_REVIEW_PROTOCOL);
  const intervals = realMatchCases.map(realMatchInterval);
  const invalidRealMatchCaseIds = realMatchCases
    .filter((_, index) => !intervals[index])
    .map((report) => String(report.benchmarkId || ""));
  const validIntervals = intervals.filter(Boolean);
  const groups = new Map();
  validIntervals.forEach((interval) => {
    if (!groups.has(interval.sourceFingerprint)) groups.set(interval.sourceFingerprint, []);
    groups.get(interval.sourceFingerprint).push(interval);
  });
  const rawRealMatchDurationMs = validIntervals.reduce((total, interval) => total + interval.durationMs, 0);
  const realMatchDurationMs = [...groups.values()].reduce(
    (total, sourceIntervals) => total + mergeIntervals(sourceIntervals),
    0,
  );
  return {
    realMatchCaseCount: realMatchCases.length,
    realMatchDurationMs,
    rawRealMatchDurationMs,
    overlapRealMatchDurationMs: Math.max(0, rawRealMatchDurationMs - realMatchDurationMs),
    invalidRealMatchCaseIds,
  };
}
