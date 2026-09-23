function pointCount(track = {}) {
  return (track.segments || []).reduce((total, segment) => total + (segment.points || []).length, 0);
}

export const TRACKING_PREANNOTATION_REVIEW_SCOPES = Object.freeze([
  Object.freeze({ value: "all", label: "All pending" }),
  Object.freeze({ value: "critical", label: "Roles, ball & referee" }),
  Object.freeze({ value: "fragments", label: "Fragments" }),
  Object.freeze({ value: "low-confidence", label: "Low confidence" }),
  Object.freeze({ value: "associated", label: "Associated" }),
  Object.freeze({ value: "unassociated", label: "Unassociated" }),
]);

export const TRACKING_PREANNOTATION_REVIEW_BATCH_SIZES = Object.freeze([25, 50, 100]);

export function normalizeTrackingPreannotationReviewScope(value = "all") {
  const scope = String(value || "all");
  return TRACKING_PREANNOTATION_REVIEW_SCOPES.some((entry) => entry.value === scope) ? scope : "all";
}

export function normalizeTrackingPreannotationReviewBatchSize(value = 25) {
  const size = Number(value);
  return TRACKING_PREANNOTATION_REVIEW_BATCH_SIZES.includes(size) ? size : 25;
}

function reviewPriority(entry = {}) {
  const track = entry.track || {};
  const entityType = String(track.entityType || "");
  const associationStatus = String(entry.associationStatus || "");
  const points = pointCount(track);
  const durationMs = Math.max(0, Number(track.endMs) - Number(track.startMs));
  const confidence = Math.max(0, Math.min(1, Number(track.confidence) || 0));
  if (entityType === "person") {
    return { rank: 0, code: "unresolved-role", label: "Person needs player/referee classification" };
  }
  if (["ball", "referee"].includes(entityType)) {
    return { rank: 1, code: "critical-entity", label: "Ball/referee requires manual confirmation" };
  }
  if (associationStatus === "associated" && points <= 1) {
    return { rank: 2, code: "single-sample", label: "Single-sample associated fragment" };
  }
  if (associationStatus === "associated" && (points <= 5 || durationMs <= 500)) {
    return { rank: 3, code: "short-fragment", label: "Short associated fragment" };
  }
  if (associationStatus === "associated" && confidence < 0.5) {
    return { rank: 4, code: "low-confidence", label: "Low-confidence associated trajectory" };
  }
  if (associationStatus === "associated") {
    return { rank: 5, code: "stable-associated", label: "Longer associated trajectory" };
  }
  if (confidence >= 0.6) {
    return { rank: 6, code: "unassociated-high-confidence", label: "High-confidence unassociated detection" };
  }
  return { rank: 7, code: "unassociated", label: "Unassociated detection" };
}

export function prioritizeTrackingPreannotationReviewEntries(entries = []) {
  return entries.map((entry) => ({ ...entry, priority: reviewPriority(entry) }))
    .sort((first, second) => (
      first.priority.rank - second.priority.rank
      || Number(first.track.confidence) - Number(second.track.confidence)
      || pointCount(first.track) - pointCount(second.track)
      || first.track.startMs - second.track.startMs
      || first.track.id.localeCompare(second.track.id)
    ));
}

export function summarizeTrackingPreannotationReviewPriorities(entries = []) {
  return {
    criticalEntityCount: entries.filter((entry) => (
      ["critical-entity", "unresolved-role"].includes(entry.priority?.code)
    )).length,
    fragmentCount: entries.filter((entry) => (
      ["single-sample", "short-fragment"].includes(entry.priority?.code)
    )).length,
    lowConfidenceCount: entries.filter((entry) => Number(entry.track?.confidence) < 0.5).length,
  };
}

export function matchesTrackingPreannotationReviewScope(entry = {}, scope = "all") {
  const normalizedScope = normalizeTrackingPreannotationReviewScope(scope);
  if (normalizedScope === "critical") {
    return ["critical-entity", "unresolved-role"].includes(entry.priority?.code);
  }
  if (normalizedScope === "fragments") {
    return ["single-sample", "short-fragment"].includes(entry.priority?.code);
  }
  if (normalizedScope === "low-confidence") return Number(entry.track?.confidence) < 0.5;
  if (normalizedScope === "associated") return entry.associationStatus === "associated";
  if (normalizedScope === "unassociated") return entry.associationStatus === "unassociated";
  return true;
}

export function createTrackingPreannotationReviewBatch(
  entries = [],
  decisions = new Map(),
  options = {},
) {
  const reviewScope = normalizeTrackingPreannotationReviewScope(options.reviewScope);
  const batchSize = normalizeTrackingPreannotationReviewBatchSize(options.batchSize);
  const pending = entries.filter((entry) => (
    !decisions.has(entry.track.id) && matchesTrackingPreannotationReviewScope(entry, reviewScope)
  ));
  return {
    reviewScope,
    batchSize,
    batchIds: pending.slice(0, batchSize).map((entry) => entry.track.id),
  };
}

export function summarizeTrackingPreannotationReviewBatch(session = {}) {
  const decisions = session.decisions || new Map();
  const batchIds = new Set(session.batchIds || []);
  const scopePendingCount = (session.entries || []).filter((entry) => (
    !decisions.has(entry.track.id)
    && matchesTrackingPreannotationReviewScope(entry, session.reviewScope)
  )).length;
  return {
    reviewScope: normalizeTrackingPreannotationReviewScope(session.reviewScope),
    scopePendingCount,
    batchSize: normalizeTrackingPreannotationReviewBatchSize(session.batchSize),
    batchPendingCount: [...batchIds].filter((id) => !decisions.has(id)).length,
    batchTotalCount: batchIds.size,
  };
}

export function findTrackingPreannotationReviewBatchIndex(session = {}, start = 0, direction = 1) {
  const entries = session.entries || [];
  const batchIds = new Set(session.batchIds || []);
  if (!entries.length || !batchIds.size) return -1;
  const step = Number(direction) < 0 ? -1 : 1;
  const firstIndex = ((Number(start) || 0) % entries.length + entries.length) % entries.length;
  for (let offset = 0; offset < entries.length; offset += 1) {
    const index = (firstIndex + (offset * step) + entries.length) % entries.length;
    const id = entries[index].track.id;
    if (batchIds.has(id) && !session.decisions.has(id)) return index;
  }
  return -1;
}
