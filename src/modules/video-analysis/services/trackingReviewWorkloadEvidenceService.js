import {
  normalizeTrackingPreannotationReviewEffort,
  summarizeTrackingPreannotationReviewEffort,
} from "./trackingPreannotationReviewEffortService.js";

export const TRACKING_REVIEW_WORKLOAD_EVIDENCE_PROTOCOL =
  "football-science-tracking-review-workload-evidence-v1";
export const TRACKING_REVIEW_WORKLOAD_EVIDENCE_VERSION = 1;

const maximumSuggestions = 25_000;
const maximumRangeMs = 2 * 60 * 1000;
const fingerprintPattern = /^[a-f0-9]{64}$/;
const evidenceFields = Object.freeze([
  "version", "protocol", "kind", "sourceFingerprint", "workspaceSha256", "packId", "caseId",
  "angleId", "range", "outcome", "effort", "metrics",
]);
const rangeFields = Object.freeze(["startMs", "endMs"]);
const outcomeFields = Object.freeze(["totalSuggestionCount", "rejectedCount", "savedCount"]);
const effortFields = Object.freeze([
  "coverage", "openedCount", "acceptActionCount", "rejectActionCount", "undoActionCount",
  "deferActionCount", "correctionHandoffCount", "batchSaveActionCount", "savedTrackActionCount",
  "firstOpenedAt", "lastActionAt",
]);
const metricFields = Object.freeze([
  "decisionActionCount", "reviewActionCount", "reworkActionCount", "reviewActionsPer100Suggestions",
  "undoPer100Decisions", "correctionHandoffsPer100SavedTracks",
]);

export class TrackingReviewWorkloadEvidenceError extends Error {
  constructor(message, code = "TRACKING_REVIEW_WORKLOAD_EVIDENCE_INVALID") {
    super(message);
    this.name = "TrackingReviewWorkloadEvidenceError";
    this.code = code;
  }
}

function invalid(message) {
  throw new TrackingReviewWorkloadEvidenceError(message);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const keys = Object.keys(value);
  const unexpected = keys.find((key) => !allowed.includes(key));
  const missing = allowed.find((key) => !Object.hasOwn(value, key));
  if (unexpected) invalid(`${label} contains unsupported field ${unexpected}.`);
  if (missing) invalid(`${label} is missing ${missing}.`);
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 160 || !/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function fingerprint(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!fingerprintPattern.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function counter(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximumSuggestions) invalid(`Invalid ${label}.`);
  return number;
}

function range(value = {}, requireExactKeys = false) {
  if (requireExactKeys) exactKeys(value, rangeFields, "Workload range");
  const startMs = Number(value.startMs);
  const endMs = Number(value.endMs);
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)
    || startMs < 0 || endMs <= startMs || endMs - startMs > maximumRangeMs) {
    invalid("Invalid workload range.");
  }
  return { startMs, endMs };
}

function sameRange(first = {}, second = {}) {
  return Number(first.startMs) === Number(second.startMs) && Number(first.endMs) === Number(second.endMs);
}

function sameMetrics(value = {}, expected = {}) {
  return metricFields.every((field) => Number(value[field]) === Number(expected[field]));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function canonicalEvidence(value = {}, options = {}, requireEvidenceEnvelope = false) {
  if (requireEvidenceEnvelope) {
    exactKeys(value, evidenceFields, "Review workload evidence");
    if (Number(value.version) !== TRACKING_REVIEW_WORKLOAD_EVIDENCE_VERSION
      || value.protocol !== TRACKING_REVIEW_WORKLOAD_EVIDENCE_PROTOCOL
      || value.kind !== "preannotation-review-workload") {
      invalid("Review workload evidence has an invalid protocol envelope.");
    }
  }
  const sourceFingerprint = fingerprint(value.sourceFingerprint, "workload source fingerprint");
  const workspaceSha256 = fingerprint(value.workspaceSha256, "workload workspace checksum");
  const evidenceRange = range(value.range, requireEvidenceEnvelope);
  const outcomeValue = requireEvidenceEnvelope ? value.outcome : {
    totalSuggestionCount: value.totalSuggestionCount,
    rejectedCount: value.rejectedCount,
    savedCount: value.savedCount,
  };
  if (requireEvidenceEnvelope) exactKeys(outcomeValue, outcomeFields, "Review workload outcome");
  const outcome = {
    totalSuggestionCount: counter(outcomeValue.totalSuggestionCount, "workload suggestion count"),
    rejectedCount: counter(outcomeValue.rejectedCount, "workload rejected count"),
    savedCount: counter(outcomeValue.savedCount, "workload saved count"),
  };
  const effortValue = requireEvidenceEnvelope ? value.effort : value.reviewEffort;
  if (requireEvidenceEnvelope) exactKeys(effortValue, effortFields, "Review workload effort");
  const effort = normalizeTrackingPreannotationReviewEffort(effortValue);
  const summary = summarizeTrackingPreannotationReviewEffort(effort, outcome.totalSuggestionCount);
  if (!outcome.totalSuggestionCount || !outcome.savedCount
    || outcome.rejectedCount + outcome.savedCount !== outcome.totalSuggestionCount) {
    invalid("Review workload outcome does not reconcile with the sealed suggestion count.");
  }
  if (effort.coverage !== "complete") invalid("Review workload coverage must be complete.");
  if (!effort.openedCount || !effort.firstOpenedAt || !effort.lastActionAt
    || Date.parse(effort.lastActionAt) < Date.parse(effort.firstOpenedAt)) {
    invalid("Review workload timestamps do not prove a complete review session.");
  }
  if (effort.savedTrackActionCount !== outcome.savedCount) {
    invalid("Review workload saved-track actions do not match the saved outcome.");
  }
  if (effort.acceptActionCount + effort.rejectActionCount + effort.correctionHandoffCount
    < outcome.totalSuggestionCount) {
    invalid("Review workload actions do not cover every sealed suggestion.");
  }
  if (options.expectedSavedTrackCount !== undefined
    && counter(options.expectedSavedTrackCount, "expected workload track count") !== outcome.savedCount) {
    invalid("Review workload saved outcome does not match the benchmark track selection.");
  }
  if (options.sourceFingerprint
    && fingerprint(options.sourceFingerprint, "expected workload source fingerprint") !== sourceFingerprint) {
    invalid("Review workload evidence belongs to another source.");
  }
  if (options.angleId && identifier(options.angleId, "expected workload angle id") !== identifier(value.angleId, "workload angle id")) {
    invalid("Review workload evidence belongs to another camera angle.");
  }
  if (options.range && !sameRange(range(options.range), evidenceRange)) {
    invalid("Review workload evidence belongs to another benchmark range.");
  }
  const metrics = {
    decisionActionCount: summary.decisionActionCount,
    reviewActionCount: summary.reviewActionCount,
    reworkActionCount: summary.reworkActionCount,
    reviewActionsPer100Suggestions: summary.reviewActionsPer100Suggestions,
    undoPer100Decisions: summary.undoPer100Decisions,
    correctionHandoffsPer100SavedTracks: summary.correctionHandoffsPer100SavedTracks,
  };
  if (requireEvidenceEnvelope) {
    exactKeys(value.metrics, metricFields, "Review workload metrics");
    if (!sameMetrics(value.metrics, metrics)) invalid("Review workload metrics do not match the recorded actions.");
  }
  return deepFreeze({
    version: TRACKING_REVIEW_WORKLOAD_EVIDENCE_VERSION,
    protocol: TRACKING_REVIEW_WORKLOAD_EVIDENCE_PROTOCOL,
    kind: "preannotation-review-workload",
    sourceFingerprint,
    workspaceSha256,
    packId: identifier(value.packId, "workload pack id"),
    caseId: identifier(value.caseId, "workload case id"),
    angleId: identifier(value.angleId, "workload angle id"),
    range: evidenceRange,
    outcome,
    effort,
    metrics,
  });
}

export function createTrackingReviewWorkloadEvidence(value = {}, options = {}) {
  return canonicalEvidence(value, options, false);
}

export function validateTrackingReviewWorkloadEvidence(value = {}, options = {}) {
  return canonicalEvidence(value, options, true);
}
