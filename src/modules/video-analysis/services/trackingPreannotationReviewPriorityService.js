function pointCount(track = {}) {
  return (track.segments || []).reduce((total, segment) => total + (segment.points || []).length, 0);
}

function reviewPriority(entry = {}) {
  const track = entry.track || {};
  const entityType = String(track.entityType || "");
  const associationStatus = String(entry.associationStatus || "");
  const points = pointCount(track);
  const durationMs = Math.max(0, Number(track.endMs) - Number(track.startMs));
  const confidence = Math.max(0, Math.min(1, Number(track.confidence) || 0));
  if (["ball", "referee"].includes(entityType)) {
    return { rank: 0, code: "critical-entity", label: "Ball/referee requires manual confirmation" };
  }
  if (associationStatus === "associated" && points <= 1) {
    return { rank: 1, code: "single-sample", label: "Single-sample associated fragment" };
  }
  if (associationStatus === "associated" && (points <= 5 || durationMs <= 500)) {
    return { rank: 2, code: "short-fragment", label: "Short associated fragment" };
  }
  if (associationStatus === "associated" && confidence < 0.5) {
    return { rank: 3, code: "low-confidence", label: "Low-confidence associated trajectory" };
  }
  if (associationStatus === "associated") {
    return { rank: 4, code: "stable-associated", label: "Longer associated trajectory" };
  }
  if (confidence >= 0.6) {
    return { rank: 5, code: "unassociated-high-confidence", label: "High-confidence unassociated detection" };
  }
  return { rank: 6, code: "unassociated", label: "Unassociated detection" };
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
    criticalEntityCount: entries.filter((entry) => entry.priority?.code === "critical-entity").length,
    fragmentCount: entries.filter((entry) => (
      ["single-sample", "short-fragment"].includes(entry.priority?.code)
    )).length,
    lowConfidenceCount: entries.filter((entry) => Number(entry.track?.confidence) < 0.5).length,
  };
}
