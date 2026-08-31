import { escapeHtml } from "./renderHelpers.js";

const labels = Object.freeze({
  idle: "Not opened",
  loading: "Opening workspace",
  review: "Review in progress",
  saving: "Saving accepted tracks",
  complete: "Queue complete",
  correcting: "Correct saved track",
  error: "Needs attention",
});

const draftLabels = Object.freeze({
  ready: "Progress saved on this device",
  restored: "Device progress restored",
  saving: "Saving progress on this device",
  "session-only": "Progress lasts for this browser session",
  error: "Device progress needs attention",
});

function count(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("en-US");
}

function confidence(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

function currentLabel(current = null) {
  if (!current) return "No pending suggestion";
  if (current.savedForCorrection) return `Saved ${current.entityType || "object"}`;
  const association = current.associationStatus === "associated" ? "Associated" : "Unassociated";
  return `${association} ${current.entityType || "object"}`;
}

export function renderTrackingPreannotationReviewPanel(state = {}, item = null) {
  const review = state.presentation?.tracking?.preannotationReview || {};
  const active = ["loading", "saving"].includes(review.status);
  const hasWorkspace = Boolean(review.workspaceSha256);
  const current = review.current || null;
  const pendingSuggestion = current && !current.savedForCorrection;
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
          <div><dt>Critical objects</dt><dd>${count(review.criticalEntityCount)}</dd></div>
          <div><dt>Fragments</dt><dd>${count(review.fragmentCount)}</dd></div>
          <div><dt>Low confidence</dt><dd>${count(review.lowConfidenceCount)}</dd></div>
          <div><dt>Pending</dt><dd>${count(review.pendingCount)}</dd></div>
          <div><dt>Accepted</dt><dd>${count(review.acceptedCount)}</dd></div>
          <div><dt>Rejected</dt><dd>${count(review.rejectedCount)}</dd></div>
          <div><dt>Saved</dt><dd>${count(review.savedCount)}</dd></div>
        </dl>
        <div class="video-analysis-preannotation__current ${current ? "" : "is-empty"}">
          <div><strong>${escapeHtml(currentLabel(current))}</strong><span>${current ? `${count(current.pointCount)} samples | ${confidence(current.confidence)}${current.priorityLabel ? ` | ${escapeHtml(current.priorityLabel)}` : ""}` : "Queue reviewed"}</span></div>
          <time>${current ? `${(Number(current.atMs) / 1000).toFixed(2)}s` : ""}</time>
        </div>
      ` : ""}
      ${review.error ? `<p class="video-analysis-preannotation__error">${escapeHtml(review.error)}</p>` : ""}
      ${hasWorkspace && draftLabels[review.draftStatus] ? `
        <p class="video-analysis-preannotation__draft ${review.draftStatus === "error" ? "is-error" : ""}">
          ${escapeHtml(draftLabels[review.draftStatus])}${review.draftStatus === "restored" && review.restoredDecisionCount ? ` | ${count(review.restoredDecisionCount)} decisions` : ""}
          ${review.draftError ? `<span>${escapeHtml(review.draftError)}</span>` : ""}
        </p>
      ` : ""}
      <div class="video-analysis-preannotation__commands">
        <button type="button" data-video-analysis-tracking-action="preannotation-open" ${!item || active ? "disabled" : ""}>Open workspace</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-accept" ${!pendingSuggestion || active ? "disabled" : ""}>Accept</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-reject" ${!pendingSuggestion || active ? "disabled" : ""}>Reject</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-next" ${(!pendingSuggestion && review.status !== "correcting") || active ? "disabled" : ""}>${review.status === "correcting" ? "Continue" : "Next"}</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-undo" ${!hasWorkspace || active ? "disabled" : ""}>Undo</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-save-current" ${!pendingSuggestion || active ? "disabled" : ""}>Save &amp; correct</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-save" ${canSave ? "" : "disabled"}>Save accepted</button>
      </div>
    </section>
  `;
}
