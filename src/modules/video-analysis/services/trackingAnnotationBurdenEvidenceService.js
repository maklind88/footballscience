import { normalizeObjectTrack, trackingPoints } from "../domain/tracking.model.js";

export const TRACKING_ANNOTATION_BURDEN_EVIDENCE_PROTOCOL =
  "football-science-tracking-annotation-burden-evidence-v1";
export const TRACKING_ANNOTATION_BURDEN_EVIDENCE_VERSION = 1;

const fingerprintPattern = /^[a-f0-9]{64}$/;
const maximumCounter = 10_000_000;
const maximumRangeMs = 2 * 60 * 1000;
const correctionTypes = Object.freeze([
  "position", "identity", "entity", "occlusion", "merge", "split", "identitySwap",
  "reject", "restore", "other",
]);
const evidenceFields = Object.freeze([
  "version", "protocol", "kind", "sourceFingerprint", "angleId", "range", "workloadBound",
  "trackSummary", "pointSummary", "correctionSummary", "reviewSummary",
]);
const trackFields = Object.freeze([
  "selectedTrackCount", "preannotationRetainedTrackCount", "nonPreannotationTrackCount",
  "preannotationSavedCount", "preannotationExcludedTrackCount", "addedOutsidePreannotationCount",
]);
const pointFields = Object.freeze([
  "pointCount", "automaticPointCount", "manualPointCount", "interpolatedPointCount", "manualPointRatio",
]);
const correctionFields = Object.freeze(["correctionRecordCount", "correctionOperationCount", "byType"]);
const reviewFields = Object.freeze(["reviewedCheckpointCount"]);

export class TrackingAnnotationBurdenEvidenceError extends Error {
  constructor(message, code = "TRACKING_ANNOTATION_BURDEN_EVIDENCE_INVALID") {
    super(message);
    this.name = "TrackingAnnotationBurdenEvidenceError";
    this.code = code;
  }
}

function invalid(message) {
  throw new TrackingAnnotationBurdenEvidenceError(message);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  const missing = allowed.find((key) => !Object.hasOwn(value, key));
  if (unexpected) invalid(`${label} contains unsupported field ${unexpected}.`);
  if (missing) invalid(`${label} is missing ${missing}.`);
}

function fingerprint(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!fingerprintPattern.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 160 || /[\x00-\x1f\\/]/.test(text)
    || /^(?:file|blob|data|https?):/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function count(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximumCounter) invalid(`Invalid ${label}.`);
  return number;
}

function ratio(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) invalid(`Invalid ${label}.`);
  return number;
}

function normalizeRange(value = {}, exact = false) {
  if (exact) exactKeys(value, ["startMs", "endMs"], "Annotation burden range");
  const startMs = Number(value.startMs);
  const endMs = Number(value.endMs);
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)
    || startMs < 0 || endMs <= startMs || endMs - startMs > maximumRangeMs) {
    invalid("Invalid annotation burden range.");
  }
  return { startMs, endMs };
}

function roundedRatio(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 10_000 : 0;
}

function pointSummary(tracks = []) {
  const points = tracks.flatMap((track) => trackingPoints(track));
  const automaticPointCount = points.filter((point) => point.source === "automatic").length;
  const manualPointCount = points.filter((point) => point.source === "manual").length;
  const interpolatedPointCount = points.filter((point) => point.source === "interpolated").length;
  return {
    pointCount: points.length,
    automaticPointCount,
    manualPointCount,
    interpolatedPointCount,
    manualPointRatio: roundedRatio(manualPointCount, points.length),
  };
}

function correctionBucket(value = "") {
  const type = String(value || "").trim().toLowerCase();
  if (type === "identity-swap") return "identitySwap";
  return correctionTypes.includes(type) ? type : "other";
}

function correctionOperationKey(correction = {}, trackIndex = 0, correctionIndex = 0) {
  const id = String(correction.id || "").trim();
  return id
    ? id.replace(/:(?:prefix|suffix|first|second|retained)$/i, "")
    : `${trackIndex}:${correctionIndex}:${correction.correctionType}:${correction.startMs}`;
}

function correctionSummary(tracks = []) {
  const operations = new Map();
  let correctionRecordCount = 0;
  tracks.forEach((track, trackIndex) => {
    track.corrections.forEach((correction, correctionIndex) => {
      correctionRecordCount += 1;
      const key = correctionOperationKey(correction, trackIndex, correctionIndex);
      const bucket = correctionBucket(correction.correctionType);
      if (operations.has(key) && operations.get(key) !== bucket) {
        invalid("One annotation correction operation has conflicting types.");
      }
      operations.set(key, bucket);
    });
  });
  const byType = Object.fromEntries(correctionTypes.map((type) => [type, 0]));
  operations.forEach((type) => { byType[type] += 1; });
  return { correctionRecordCount, correctionOperationCount: operations.size, byType };
}

function boundPreannotationTrack(track = {}, workloadEvidence = null) {
  const metadata = track.metadata || {};
  if (metadata.preannotationReviewState !== "saved-review") return false;
  if (!workloadEvidence) return true;
  return metadata.localSourceSha256 === workloadEvidence.sourceFingerprint
    && metadata.angleId === workloadEvidence.angleId
    && metadata.preannotationWorkspaceSha256 === workloadEvidence.workspaceSha256
    && metadata.preannotationCaseId === workloadEvidence.caseId;
}

function trackSummary(sourceTracks = [], workloadEvidence = null) {
  const selectedTrackCount = sourceTracks.length;
  const preannotationRetainedTrackCount = sourceTracks.filter((track) => (
    boundPreannotationTrack(track, workloadEvidence)
  )).length;
  const nonPreannotationTrackCount = selectedTrackCount - preannotationRetainedTrackCount;
  const preannotationSavedCount = workloadEvidence ? Number(workloadEvidence.outcome?.savedCount) : 0;
  if (workloadEvidence && preannotationRetainedTrackCount > preannotationSavedCount) {
    invalid("Ground truth retains more preannotation tracks than the sealed review workload saved.");
  }
  return {
    selectedTrackCount,
    preannotationRetainedTrackCount,
    nonPreannotationTrackCount,
    preannotationSavedCount,
    preannotationExcludedTrackCount: workloadEvidence
      ? preannotationSavedCount - preannotationRetainedTrackCount
      : 0,
    addedOutsidePreannotationCount: workloadEvidence ? nonPreannotationTrackCount : 0,
  };
}

function checkpointCount(reviewEvidence = {}) {
  return Math.max(0, Number(reviewEvidence.sceneReview?.reviewedSampleCount) || 0);
}

function sameRange(first = {}, second = {}) {
  return Number(first.startMs) === Number(second.startMs) && Number(first.endMs) === Number(second.endMs);
}

function sameSummary(value = {}, expected = {}, fields = []) {
  return fields.every((field) => Number(value[field]) === Number(expected[field]));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createTrackingAnnotationBurdenEvidence(value = {}) {
  const sourceTracks = (value.sourceTracks || []).map(normalizeObjectTrack);
  const artifactTracks = (value.artifactTracks || []).map(normalizeObjectTrack);
  if (!sourceTracks.length || sourceTracks.length !== artifactTracks.length) {
    invalid("Annotation burden requires the exact source and exported track selection.");
  }
  return deepFreeze({
    version: TRACKING_ANNOTATION_BURDEN_EVIDENCE_VERSION,
    protocol: TRACKING_ANNOTATION_BURDEN_EVIDENCE_PROTOCOL,
    kind: "ground-truth-refinement-burden",
    sourceFingerprint: fingerprint(value.sourceFingerprint, "annotation burden source fingerprint"),
    angleId: identifier(value.angleId, "annotation burden angle id"),
    range: normalizeRange(value.range),
    workloadBound: Boolean(value.workloadEvidence),
    trackSummary: trackSummary(sourceTracks, value.workloadEvidence),
    pointSummary: pointSummary(artifactTracks),
    correctionSummary: correctionSummary(sourceTracks),
    reviewSummary: { reviewedCheckpointCount: checkpointCount(value.reviewEvidence) },
  });
}

export function validateTrackingAnnotationBurdenEvidence(value = {}, context = {}) {
  exactKeys(value, evidenceFields, "Annotation burden evidence");
  if (Number(value.version) !== TRACKING_ANNOTATION_BURDEN_EVIDENCE_VERSION
    || value.protocol !== TRACKING_ANNOTATION_BURDEN_EVIDENCE_PROTOCOL
    || value.kind !== "ground-truth-refinement-burden") {
    invalid("Annotation burden evidence has an invalid protocol envelope.");
  }
  exactKeys(value.trackSummary, trackFields, "Annotation burden track summary");
  exactKeys(value.pointSummary, pointFields, "Annotation burden point summary");
  exactKeys(value.correctionSummary, correctionFields, "Annotation burden correction summary");
  exactKeys(value.correctionSummary.byType, correctionTypes, "Annotation burden correction categories");
  exactKeys(value.reviewSummary, reviewFields, "Annotation burden review summary");
  const sourceFingerprint = fingerprint(value.sourceFingerprint, "annotation burden source fingerprint");
  const angleId = identifier(value.angleId, "annotation burden angle id");
  const range = normalizeRange(value.range, true);
  if (context.sourceFingerprint && fingerprint(context.sourceFingerprint, "expected annotation burden source") !== sourceFingerprint) {
    invalid("Annotation burden evidence belongs to another source.");
  }
  if (context.angleId && identifier(context.angleId, "expected annotation burden angle") !== angleId) {
    invalid("Annotation burden evidence belongs to another camera angle.");
  }
  if (context.range && !sameRange(normalizeRange(context.range), range)) {
    invalid("Annotation burden evidence belongs to another benchmark range.");
  }
  const tracks = (context.tracks || []).map(normalizeObjectTrack);
  const selectedTrackCount = count(value.trackSummary.selectedTrackCount, "annotation selected track count");
  const retained = count(value.trackSummary.preannotationRetainedTrackCount, "retained preannotation track count");
  const nonPreannotation = count(value.trackSummary.nonPreannotationTrackCount, "non-preannotation track count");
  const saved = count(value.trackSummary.preannotationSavedCount, "preannotation saved count");
  const excluded = count(value.trackSummary.preannotationExcludedTrackCount, "excluded preannotation track count");
  const added = count(value.trackSummary.addedOutsidePreannotationCount, "outside-preannotation track count");
  const workloadBound = value.workloadBound === true;
  const expectedSaved = context.workloadEvidence ? Number(context.workloadEvidence.outcome?.savedCount) : 0;
  if (value.workloadBound !== workloadBound || workloadBound !== Boolean(context.workloadEvidence)
    || (tracks.length && selectedTrackCount !== tracks.length)
    || retained + nonPreannotation !== selectedTrackCount
    || saved !== expectedSaved
    || (workloadBound && (retained > saved || excluded !== saved - retained || added !== nonPreannotation))
    || (!workloadBound && (saved !== 0 || excluded !== 0 || added !== 0))) {
    invalid("Annotation burden track summary does not match its ground-truth context.");
  }
  const expectedPoints = pointSummary(tracks);
  pointFields.slice(0, 4).forEach((field) => count(value.pointSummary[field], `annotation ${field}`));
  ratio(value.pointSummary.manualPointRatio, "annotation manual point ratio");
  if (!sameSummary(value.pointSummary, expectedPoints, pointFields)) {
    invalid("Annotation burden point summary does not match the exported trajectories.");
  }
  const correctionRecordCount = count(value.correctionSummary.correctionRecordCount, "correction record count");
  const correctionOperationCount = count(value.correctionSummary.correctionOperationCount, "correction operation count");
  const categoryTotal = correctionTypes.reduce(
    (total, type) => total + count(value.correctionSummary.byType[type], `${type} correction count`),
    0,
  );
  if (correctionOperationCount > correctionRecordCount || categoryTotal !== correctionOperationCount) {
    invalid("Annotation burden correction summary does not reconcile.");
  }
  const reviewedCheckpointCount = count(value.reviewSummary.reviewedCheckpointCount, "reviewed checkpoint count");
  if (reviewedCheckpointCount !== checkpointCount(context.reviewEvidence)) {
    invalid("Annotation burden checkpoint count does not match review evidence.");
  }
  return deepFreeze({
    version: TRACKING_ANNOTATION_BURDEN_EVIDENCE_VERSION,
    protocol: TRACKING_ANNOTATION_BURDEN_EVIDENCE_PROTOCOL,
    kind: "ground-truth-refinement-burden",
    sourceFingerprint,
    angleId,
    range,
    workloadBound,
    trackSummary: {
      selectedTrackCount,
      preannotationRetainedTrackCount: retained,
      nonPreannotationTrackCount: nonPreannotation,
      preannotationSavedCount: saved,
      preannotationExcludedTrackCount: excluded,
      addedOutsidePreannotationCount: added,
    },
    pointSummary: expectedPoints,
    correctionSummary: {
      correctionRecordCount,
      correctionOperationCount,
      byType: Object.fromEntries(correctionTypes.map((type) => [type, Number(value.correctionSummary.byType[type])])),
    },
    reviewSummary: { reviewedCheckpointCount },
  });
}
