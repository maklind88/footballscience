export const TRACKING_REAL_MATCH_REVIEW_PROTOCOL = "football-ground-truth-review-v1";

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
    && report.evidence?.attested === true);
  return {
    realMatchCaseCount: realMatchCases.length,
    realMatchDurationMs: realMatchCases.reduce(
      (total, report) => total + Math.max(0, Number(report.evidence?.durationMs) || 0),
      0,
    ),
  };
}
