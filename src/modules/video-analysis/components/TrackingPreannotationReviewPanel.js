import { escapeHtml } from "./renderHelpers.js";

const labels = Object.freeze({
  idle: "Not opened",
  loading: "Opening workspace",
  review: "Review in progress",
  saving: "Saving accepted tracks",
  complete: "Queue complete",
  error: "Needs attention",
});

function count(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("en-US");
}

function confidence(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

function currentLabel(current = null) {
  if (!current) return "No pending suggestion";
  const association = current.associationStatus === "associated" ? "Associated" : "Unassociated";
  return `${association} ${current.entityType || "object"}`;
}

export function renderTrackingPreannotationReviewPanel(state = {}, item = null) {
  const review = state.presentation?.tracking?.preannotationReview || {};
  const active = ["loading", "saving"].includes(review.status);
  const hasWorkspace = Boolean(review.workspaceSha256);
  const current = review.current || null;
  const canSave = Number(review.acceptedCount) > 0 && !active;
  return `
    <section class="video-analysis-preannotation" aria-label="Preannotation review queue">
      <header>
        <div><span>Verified preannotation</span><strong>${escapeHtml(labels[review.status] || labels.idle)}</strong></div>
        <em>${escapeHtml(review.caseId || "No case")}</em>
      </header>
      ${hasWorkspace ? `
        <dl class="video-analysis-preannotation__counts">
          <div><dt>Associated</dt><dd>${count(review.associatedTrackCount)}</dd></div>
          <div><dt>Unassociated</dt><dd>${count(review.unassociatedObservationCount)}</dd></div>
          <div><dt>Pending</dt><dd>${count(review.pendingCount)}</dd></div>
          <div><dt>Accepted</dt><dd>${count(review.acceptedCount)}</dd></div>
          <div><dt>Rejected</dt><dd>${count(review.rejectedCount)}</dd></div>
          <div><dt>Saved</dt><dd>${count(review.savedCount)}</dd></div>
        </dl>
        <div class="video-analysis-preannotation__current ${current ? "" : "is-empty"}">
          <div><strong>${escapeHtml(currentLabel(current))}</strong><span>${current ? `${count(current.pointCount)} samples | ${confidence(current.confidence)}` : "Queue reviewed"}</span></div>
          <time>${current ? `${(Number(current.atMs) / 1000).toFixed(2)}s` : ""}</time>
        </div>
      ` : ""}
      ${review.error ? `<p class="video-analysis-preannotation__error">${escapeHtml(review.error)}</p>` : ""}
      <div class="video-analysis-preannotation__commands">
        <button type="button" data-video-analysis-tracking-action="preannotation-open" ${!item || active ? "disabled" : ""}>Open workspace</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-accept" ${!current || active ? "disabled" : ""}>Accept</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-reject" ${!current || active ? "disabled" : ""}>Reject</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-next" ${!current || active ? "disabled" : ""}>Next</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-undo" ${!hasWorkspace || active ? "disabled" : ""}>Undo</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-save" ${canSave ? "" : "disabled"}>Save accepted</button>
      </div>
    </section>
  `;
}
