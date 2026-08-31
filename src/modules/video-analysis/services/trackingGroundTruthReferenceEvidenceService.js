import {
  benchmarkBoundedString,
  normalizeBenchmarkFingerprint,
} from "./trackingBenchmarkContract.js";

export const TRACKING_GROUND_TRUTH_REFERENCE_PROTOCOL =
  "football-science-ground-truth-reference-v1";

const allowedKeys = Object.freeze([
  "protocol",
  "datasetName",
  "datasetVersion",
  "sequenceId",
  "annotationProtocol",
  "annotationSha256",
  "frameRate",
  "sequenceLengthFrames",
  "firstFrameNumber",
  "coordinateOrigin",
  "maximumContinuousGapFrames",
  "videoUseReviewed",
  "annotationUseReviewed",
  "localBenchmarkOnly",
  "reviewedAt",
]);

function invalid(message) {
  const error = new Error(message);
  error.name = "TrackingGroundTruthReferenceError";
  error.code = "TRACKING_GROUND_TRUTH_REFERENCE_INVALID";
  throw error;
}

export function normalizeGroundTruthReferenceEvidence(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Ground-truth reference evidence must be an object.");
  }
  const unsupported = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unsupported.length) invalid(`Unsupported ground-truth reference field: ${unsupported[0]}.`);
  if (value.protocol !== TRACKING_GROUND_TRUTH_REFERENCE_PROTOCOL
    || value.videoUseReviewed !== true
    || value.annotationUseReviewed !== true
    || value.localBenchmarkOnly !== true
    || !Number.isFinite(Date.parse(value.reviewedAt))) {
    invalid("Ground-truth dataset rights and local-use evidence are incomplete.");
  }
  const frameRate = Number(value.frameRate);
  const sequenceLengthFrames = Number(value.sequenceLengthFrames);
  const firstFrameNumber = Number(value.firstFrameNumber);
  const maximumContinuousGapFrames = Number(value.maximumContinuousGapFrames);
  if (!Number.isFinite(frameRate) || frameRate < 1 || frameRate > 240
    || !Number.isSafeInteger(sequenceLengthFrames) || sequenceLengthFrames < 2 || sequenceLengthFrames > 1_000_000
    || !Number.isSafeInteger(firstFrameNumber) || firstFrameNumber < 0 || firstFrameNumber > 1_000_000
    || !["zero-based", "one-based"].includes(value.coordinateOrigin)
    || !Number.isSafeInteger(maximumContinuousGapFrames)
    || maximumContinuousGapFrames < 1
    || maximumContinuousGapFrames > Math.max(1, Math.floor(frameRate / 2))) {
    invalid("Ground-truth annotation conversion evidence is incomplete.");
  }
  return Object.freeze({
    protocol: TRACKING_GROUND_TRUTH_REFERENCE_PROTOCOL,
    datasetName: benchmarkBoundedString(value.datasetName, "ground-truth dataset name", 120),
    datasetVersion: benchmarkBoundedString(value.datasetVersion, "ground-truth dataset version", 80),
    sequenceId: benchmarkBoundedString(value.sequenceId, "ground-truth sequence id", 120),
    annotationProtocol: benchmarkBoundedString(
      value.annotationProtocol,
      "ground-truth annotation protocol",
      80,
    ),
    annotationSha256: normalizeBenchmarkFingerprint(value.annotationSha256),
    frameRate,
    sequenceLengthFrames,
    firstFrameNumber,
    coordinateOrigin: value.coordinateOrigin,
    maximumContinuousGapFrames,
    videoUseReviewed: true,
    annotationUseReviewed: true,
    localBenchmarkOnly: true,
    reviewedAt: new Date(value.reviewedAt).toISOString(),
  });
}
