export const TRACKING_GROUND_TRUTH_SCENE_REVIEW_PROTOCOL =
  "football-science-ground-truth-scene-review-v1";
export const TRACKING_GROUND_TRUTH_SCENE_REVIEW_STEP_MS = 500;

const maximumReviewSamples = 500;
const fingerprintPattern = /^[a-f0-9]{64}$/i;

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function normalizedContext(value = {}) {
  const startMs = Math.max(0, integer(value.range?.startMs));
  const endMs = Math.max(startMs + 1, integer(value.range?.endMs, startMs + 1));
  return {
    sourceFingerprint: fingerprintPattern.test(String(value.sourceFingerprint || ""))
      ? String(value.sourceFingerprint).toLowerCase()
      : "",
    angleId: String(value.angleId || "").trim().slice(0, 160),
    range: { startMs, endMs },
  };
}

export function trackingGroundTruthSceneReviewTimes(contextValue = {}) {
  const { range } = normalizedContext(contextValue);
  const values = [];
  for (let atMs = range.startMs; atMs <= range.endMs; atMs += TRACKING_GROUND_TRUTH_SCENE_REVIEW_STEP_MS) {
    values.push(atMs);
    if (values.length > maximumReviewSamples) throw new Error("Scene review exceeds the supported sample limit.");
  }
  if (values.at(-1) !== range.endMs) values.push(range.endMs);
  return values;
}

export function createTrackingGroundTruthSceneReview(contextValue = {}) {
  const context = normalizedContext(contextValue);
  return {
    protocol: TRACKING_GROUND_TRUTH_SCENE_REVIEW_PROTOCOL,
    sourceFingerprint: context.sourceFingerprint,
    angleId: context.angleId,
    range: context.range,
    stepMs: TRACKING_GROUND_TRUTH_SCENE_REVIEW_STEP_MS,
    reviewedAtMs: [],
  };
}

function contextMatches(review = {}, context = {}) {
  return review.protocol === TRACKING_GROUND_TRUTH_SCENE_REVIEW_PROTOCOL
    && review.sourceFingerprint === context.sourceFingerprint
    && review.angleId === context.angleId
    && Number(review.range?.startMs) === context.range.startMs
    && Number(review.range?.endMs) === context.range.endMs
    && Number(review.stepMs) === TRACKING_GROUND_TRUTH_SCENE_REVIEW_STEP_MS;
}

export function normalizeTrackingGroundTruthSceneReview(value = {}, contextValue = {}) {
  const context = normalizedContext(contextValue);
  if (!contextMatches(value, context)) return createTrackingGroundTruthSceneReview(context);
  const expected = new Set(trackingGroundTruthSceneReviewTimes(context));
  const reviewedAtMs = [...new Set((Array.isArray(value.reviewedAtMs) ? value.reviewedAtMs : [])
    .map((entry) => integer(entry, -1))
    .filter((entry) => expected.has(entry)))]
    .sort((first, second) => first - second);
  return { ...createTrackingGroundTruthSceneReview(context), reviewedAtMs };
}

export function trackingGroundTruthSceneReviewProgress(value = {}, contextValue = {}) {
  const context = normalizedContext(contextValue);
  const review = normalizeTrackingGroundTruthSceneReview(value, context);
  const expectedAtMs = trackingGroundTruthSceneReviewTimes(context);
  const reviewed = new Set(review.reviewedAtMs);
  const nextAtMs = expectedAtMs.find((entry) => !reviewed.has(entry));
  const expectedSampleCount = expectedAtMs.length;
  const reviewedSampleCount = review.reviewedAtMs.length;
  return {
    review,
    expectedAtMs,
    expectedSampleCount,
    reviewedSampleCount,
    coverageRatio: expectedSampleCount ? reviewedSampleCount / expectedSampleCount : 0,
    complete: expectedSampleCount > 0 && reviewedSampleCount === expectedSampleCount,
    nextAtMs: Number.isFinite(nextAtMs) ? nextAtMs : null,
  };
}

export function trackingGroundTruthSceneReviewCheckpointAt(contextValue = {}, requestedAtMs = 0) {
  const expectedAtMs = trackingGroundTruthSceneReviewTimes(contextValue);
  const requested = integer(requestedAtMs, expectedAtMs[0]);
  return expectedAtMs.reduce((nearest, candidate) => (
    Math.abs(candidate - requested) < Math.abs(nearest - requested) ? candidate : nearest
  ), expectedAtMs[0]);
}

export function reviewTrackingGroundTruthSceneFrame(value = {}, contextValue = {}, requestedAtMs = 0) {
  const progress = trackingGroundTruthSceneReviewProgress(value, contextValue);
  const atMs = trackingGroundTruthSceneReviewCheckpointAt(contextValue, requestedAtMs);
  return normalizeTrackingGroundTruthSceneReview({
    ...progress.review,
    reviewedAtMs: [...progress.review.reviewedAtMs, atMs],
  }, contextValue);
}

export function trackingGroundTruthSceneReviewEvidence(value = {}, contextValue = {}) {
  const progress = trackingGroundTruthSceneReviewProgress(value, contextValue);
  if (!progress.complete) throw new Error("Every scene review checkpoint must be completed before locking.");
  return {
    protocol: TRACKING_GROUND_TRUTH_SCENE_REVIEW_PROTOCOL,
    stepMs: TRACKING_GROUND_TRUTH_SCENE_REVIEW_STEP_MS,
    reviewedSampleCount: progress.reviewedSampleCount,
    expectedSampleCount: progress.expectedSampleCount,
    coverageRatio: 1,
  };
}

export function validateTrackingGroundTruthSceneReviewEvidence(value = {}, contextValue = {}) {
  const expected = trackingGroundTruthSceneReviewTimes(contextValue).length;
  const allowedKeys = [
    "coverageRatio",
    "expectedSampleCount",
    "protocol",
    "reviewedSampleCount",
    "stepMs",
  ];
  const keys = Object.keys(value).sort();
  if (keys.length !== allowedKeys.length
    || keys.some((key, index) => key !== allowedKeys[index])
    || value.protocol !== TRACKING_GROUND_TRUTH_SCENE_REVIEW_PROTOCOL
    || Number(value.stepMs) !== TRACKING_GROUND_TRUTH_SCENE_REVIEW_STEP_MS
    || Number(value.reviewedSampleCount) !== expected
    || Number(value.expectedSampleCount) !== expected
    || Number(value.coverageRatio) !== 1) {
    throw new Error("Locked scene-review evidence is incomplete or invalid.");
  }
  return {
    protocol: TRACKING_GROUND_TRUTH_SCENE_REVIEW_PROTOCOL,
    stepMs: TRACKING_GROUND_TRUTH_SCENE_REVIEW_STEP_MS,
    reviewedSampleCount: expected,
    expectedSampleCount: expected,
    coverageRatio: 1,
  };
}
