import { escapeHtml } from "./renderHelpers.js";
import {
  TRACKING_PREANNOTATION_REVIEW_BATCH_SIZES,
  TRACKING_PREANNOTATION_REVIEW_SCOPES,
} from "../services/trackingPreannotationReviewPriorityService.js";

const labels = Object.freeze({
  idle: "Not opened",
  loading: "Opening workspace",
  review: "Review in progress",
  saving: "Saving accepted tracks",
  complete: "Queue complete",
  "batch-complete": "Batch complete",
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

function selected(value, expected) {
  return String(value) === String(expected) ? " selected" : "";
}

function campaignStatus(value = {}) {
  const labels = {
    ready: "Protected on this device",
    saving: "Saving campaign progress",
    "session-only": "Campaign progress lasts for this session",
    error: "Campaign progress needs attention",
  };
  return labels[value.status] || "Campaign progress";
}

function renderCampaign(value = null) {
  if (!value?.caseCount) return "";
  return `
    <section class="video-analysis-preannotation__campaign" aria-label="Annotation campaign progress">
      <header>
        <div><span>Annotation campaign</span><strong>${count(value.decisionCount)}/${count(value.totalSuggestionCount)} decisions</strong><span>${count(value.reviewActionCount)} review actions | ${count(value.reviewActionsPer100Suggestions)}/100 suggestions</span></div>
        <em>${count(value.completeCaseCount)}/${count(value.caseCount)} decision queues</em>
      </header>
      <ol>
        ${value.cases.map((entry) => `
          <li class="${entry.active ? "is-active" : ""}${entry.complete ? " is-complete" : ""}" ${entry.active ? 'aria-current="step"' : ""}>
            <div><strong>${escapeHtml(entry.caseId)}</strong><span>${count(entry.decisionCount)}/${count(entry.totalSuggestionCount)} decisions | ${count(entry.resolvedCount)} resolved</span><span>${count(entry.reviewActionCount)} actions | ${count(entry.undoActionCount)} undo | ${count(entry.correctionHandoffCount)} correct</span></div>
            ${(entry.missingSuggestedEntityTypes || []).length ? `<em>Find ${escapeHtml(entry.missingSuggestedEntityTypes.join(", "))}</em>` : entry.complete ? "<em>Decisions complete</em>" : "<em>Pending decisions</em>"}
          </li>
        `).join("")}
      </ol>
      <p class="${value.status === "error" ? "is-error" : ""}">${escapeHtml(campaignStatus(value))}<span>${value.reviewEffortCoverage === "partial" ? "Effort capture partial" : "Effort captured"}</span>${value.error ? `<span>${escapeHtml(value.error)}</span>` : ""}</p>
    </section>
  `;
}

export function renderTrackingPreannotationReviewPanel(state = {}, item = null) {
  const review = state.presentation?.tracking?.preannotationReview || {};
  const active = ["loading", "saving"].includes(review.status);
  const hasWorkspace = Boolean(review.workspaceSha256);
  const current = review.current || null;
  const pendingSuggestion = current && !current.savedForCorrection;
  const canSave = Number(review.acceptedCount) > 0 && !active;
  const canOpenNextBatch = hasWorkspace && !current && Number(review.scopePendingCount) > 0 && !active;
  const activeCampaignCase = review.campaign?.cases?.find((entry) => entry.caseId === review.caseId);
  const unresolvedRoleCount = (item?.objectTracks || []).filter((track) => (
    track.status !== "archived"
    && track.metadata?.preannotationReviewState === "saved-review"
    && track.metadata?.preannotationWorkspaceSha256 === review.workspaceSha256
    && track.metadata?.preannotationCaseId === review.caseId
    && ["person", "unknown"].includes(track.entityType)
  )).length;
  const canPrepareGroundTruth = activeCampaignCase?.complete
    && activeCampaignCase.reviewEffortCoverage === "complete"
    && Number(activeCampaignCase.savedCount) > 0 && unresolvedRoleCount === 0 && !active;
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
          <div><dt>Roles unresolved</dt><dd>${count(unresolvedRoleCount)}</dd></div>
        </dl>
        ${renderCampaign(review.campaign)}
        <div class="video-analysis-preannotation__batchbar">
          <label>
            <span>Focus</span>
            <select aria-label="Review focus" data-video-analysis-tracking-field="preannotation-scope">
              ${TRACKING_PREANNOTATION_REVIEW_SCOPES.map((entry) => `<option value="${entry.value}"${selected(review.reviewScope || "all", entry.value)}>${escapeHtml(entry.label)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Batch</span>
            <select aria-label="Review batch size" data-video-analysis-tracking-field="preannotation-batch-size">
              ${TRACKING_PREANNOTATION_REVIEW_BATCH_SIZES.map((size) => `<option value="${size}"${selected(review.batchSize || 25, size)}>${size}</option>`).join("")}
            </select>
          </label>
          <p><span>Scope</span><strong>${count(review.scopePendingCount)}</strong><span>Batch</span><strong>${count(review.batchPendingCount)}/${count(review.batchTotalCount)}</strong></p>
        </div>
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
        <button type="button" data-video-analysis-tracking-action="preannotation-accept" aria-keyshortcuts="A" title="Accept suggestion (A)" ${!pendingSuggestion || active ? "disabled" : ""}>Accept</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-reject" aria-keyshortcuts="R" title="Reject suggestion (R)" ${!pendingSuggestion || active ? "disabled" : ""}>Reject</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-next" aria-keyshortcuts="N" title="Next suggestion (N)" ${(!pendingSuggestion && review.status !== "correcting") || active ? "disabled" : ""}>${review.status === "correcting" ? "Continue" : "Next"}</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-next-batch" ${canOpenNextBatch ? "" : "disabled"}>Next batch</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-undo" aria-keyshortcuts="U" title="Undo decision (U)" ${!hasWorkspace || active ? "disabled" : ""}>Undo</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-save-current" aria-keyshortcuts="C" title="Save and correct suggestion (C)" ${!pendingSuggestion || active ? "disabled" : ""}>Save &amp; correct</button>
        <button type="button" data-video-analysis-tracking-action="preannotation-save" aria-keyshortcuts="S" title="Save accepted suggestions (S)" ${canSave ? "" : "disabled"}>Save accepted</button>
        <button type="button" data-video-analysis-tracking-action="ground-truth-use-preannotation-case" ${canPrepareGroundTruth ? "" : "disabled"}>Use in ground truth</button>
      </div>
    </section>
  `;
}
