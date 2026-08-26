import {
  adjacentTrackingReviewEvent,
  trackingPointVisibility,
  trackingReviewEvents,
} from "../services/trackingCorrectionService.js";
import { trackingReviewSummary } from "../services/trackingReviewService.js";
import {
  trackingIdentitySwapReadiness,
  trackingSplitReadiness,
} from "../services/trackingStructuralCorrectionService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function currentPlayheadMs(state = {}) {
  return Math.max(0, Math.round(Number(state.timeline?.playheadMs) || 0));
}

function nearestReviewEvent(events = [], atMs = 0) {
  return events.reduce((nearest, entry) => (
    !nearest || Math.abs(entry.atMs - atMs) < Math.abs(nearest.atMs - atMs) ? entry : nearest
  ), null);
}

function renderTrackingProvenance(track = null) {
  if (!track) return "";
  const metadata = track.metadata || {};
  const parts = [metadata.model || track.engine];
  if (metadata.device) parts.push(String(metadata.device).toUpperCase());
  if (Number(metadata.sampleFps) > 0) parts.push(`${Number(metadata.sampleFps).toFixed(1)} fps`);
  const label = parts.filter(Boolean).join(" | ");
  return label ? `<small class="video-analysis-tracking-provenance">${escapeHtml(label)}</small>` : "";
}

export function renderTrackingReviewPanel(state = {}, track = null, tracks = []) {
  if (!track) return "";
  const review = trackingReviewSummary(track);
  const atMs = currentPlayheadMs(state);
  const events = trackingReviewEvents(track);
  const issue = nearestReviewEvent(events, atMs);
  const continuityIssue = nearestReviewEvent(
    events.filter((entry) => entry.type === "continuity-break"),
    atMs,
  );
  const continuityReady = continuityIssue && Math.abs(continuityIssue.atMs - atMs) <= 250;
  const previous = adjacentTrackingReviewEvent(events, atMs, "earlier");
  const next = adjacentTrackingReviewEvent(events, atMs, "later");
  const visibility = trackingPointVisibility(track, atMs);
  const history = state.presentation?.tracking?.reviewHistory || {};
  const historyMatches = history.trackId === track.id;
  const prompt = state.presentation?.tracking?.prompt || {};
  const identityReady = track.entityType === "player" && Boolean(prompt.playerId || prompt.playerLabel);
  const selectedTrackIds = state.presentation?.tracking?.selectedTrackIds || [];
  const selectedTracks = selectedTrackIds
    .map((trackId) => tracks.find((entry) => entry.id === trackId))
    .filter(Boolean);
  const split = trackingSplitReadiness(track, atMs);
  const swap = selectedTracks.length === 2
    ? trackingIdentitySwapReadiness(selectedTracks[0], selectedTracks[1], atMs)
    : { ready: false, error: "Select two identified player tracks." };
  return `
    <section class="video-analysis-tracking-review" aria-label="Track review">
      <header>
        <div>
          <strong>${review.canVerify ? "Ready to verify" : "Review required"}</strong>
          <span>${escapeHtml(events.length ? `${events.length} review event${events.length === 1 ? "" : "s"}` : "Checks passed")}</span>
        </div>
        <em class="is-${review.canVerify ? "ready" : "review"}">${escapeHtml(track.status)}</em>
      </header>
      <div class="video-analysis-tracking-review__navigator">
        <button type="button" data-video-analysis-tracking-action="review-previous" ${previous ? "" : "disabled"}>Previous</button>
        <p>
          <strong>${escapeHtml(issue?.label || "Continuity and identity checks passed")}</strong>
          <span>${escapeHtml(issue ? `${formatVideoTime(issue.atMs)}${issue.count > 1 ? ` | ${issue.count} samples` : ""}` : "No unresolved review events")}</span>
        </p>
        <button type="button" data-video-analysis-tracking-action="review-next" ${next ? "" : "disabled"}>Next</button>
      </div>
      <div class="video-analysis-tracking-review__actions">
        ${track.entityType === "player" ? `<button type="button" data-video-analysis-tracking-action="review-identity" ${identityReady ? "" : "disabled"}>Apply identity</button>` : ""}
        <button type="button" data-video-analysis-tracking-action="review-continuity" ${continuityReady ? "" : "disabled"}>Confirm continuity</button>
        <button type="button" data-video-analysis-tracking-action="review-visibility" ${visibility.available ? "" : "disabled"}>${visibility.occluded ? "Mark visible" : "Mark occluded"}</button>
        <button type="button" data-video-analysis-tracking-action="review-split" title="${escapeHtml(split.error || "Split this trajectory at the playhead")}" ${split.ready ? "" : "disabled"}>Split at playhead</button>
        <button type="button" data-video-analysis-tracking-action="review-identity-swap" title="${escapeHtml(swap.error || "Swap the two selected trajectories after the playhead")}" ${swap.ready ? "" : "disabled"}>Swap after playhead</button>
        <button type="button" data-video-analysis-tracking-action="review-undo" ${historyMatches && history.undoCount ? "" : "disabled"}>Undo</button>
        <button type="button" data-video-analysis-tracking-action="review-redo" ${historyMatches && history.redoCount ? "" : "disabled"}>Redo</button>
      </div>
      <p class="video-analysis-tracking-review__summary">${escapeHtml(review.issues.join(" / ") || "Continuity and identity checks passed.")}</p>
      ${renderTrackingProvenance(track)}
      <button class="video-analysis-tracking-review__verify" type="button" data-video-analysis-tracking-action="verify" ${review.canVerify ? "" : "disabled"}>Verify track</button>
    </section>
  `;
}
