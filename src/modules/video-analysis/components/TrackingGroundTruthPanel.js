import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
  groundTruthReadiness,
  trackingGroundTruthArtifactBenchmarkType,
  trackingGroundTruthEntry,
} from "../services/trackingGroundTruthService.js";
import {
  TRACKING_BENCHMARK_SCENARIOS,
  trackingGroundTruthSuiteEntry,
} from "../services/trackingGroundTruthSuiteService.js";
import { escapeHtml } from "./renderHelpers.js";
import { trackingGroundTruthSceneReviewProgress } from "../services/trackingGroundTruthSceneReviewService.js";
import { trackingGroundTruthCheckpointDiagnostics } from "../services/trackingGroundTruthCheckpointService.js";

function groundTruthState(state = {}, itemId = "") {
  return trackingGroundTruthEntry(state.presentation?.tracking?.groundTruth || {}, itemId);
}

function shortFingerprint(value = "") {
  const fingerprint = String(value || "");
  return /^[a-f0-9]{64}$/i.test(fingerprint) ? `${fingerprint.slice(0, 8)}...${fingerprint.slice(-6)}` : "Missing";
}

function entityStat(label, count) {
  return `<span><strong>${escapeHtml(String(count || 0))}</strong>${escapeHtml(label)}</span>`;
}

function checkpointTime(value = 0) {
  const seconds = Math.max(0, Number(value) || 0) / 1000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

function lockedReadiness(truth = {}) {
  const artifact = truth.lockedArtifact || {};
  const tracks = artifact.groundTruth?.tracks || [];
  const counts = artifact.reviewEvidence?.entityCounts || {};
  return {
    ready: true,
    issues: [],
    benchmarkType: trackingGroundTruthArtifactBenchmarkType(artifact),
    selectedTrackCount: tracks.length,
    verifiedTrackCount: tracks.length,
    entityCounts: {
      player: Number(counts.player) || 0,
      ball: Number(counts.ball) || 0,
      referee: Number(counts.referee) || 0,
    },
    sourceFingerprintReady: Boolean(artifact.sourceFingerprint),
    frameReady: Boolean(artifact.frame?.width && artifact.frame?.height),
  };
}

export function renderTrackingGroundTruthPanel(state = {}, item = null) {
  const workspace = state.presentation?.tracking?.groundTruth || {};
  const truth = groundTruthState(state, item?.id);
  const locked = truth.status === "locked" && Boolean(truth.lockedArtifact);
  const suite = trackingGroundTruthSuiteEntry(workspace);
  const benchmarkType = locked
    ? trackingGroundTruthArtifactBenchmarkType(truth.lockedArtifact)
    : suite.benchmarkType;
  const selectedObject = benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT;
  const tracks = (item?.objectTracks || []).map(normalizeObjectTrack)
    .filter((track) => track.status !== "archived");
  const primaryTrackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
  const referenceIds = truth.selectedTrackIds || [];
  const primaryIncluded = referenceIds.includes(primaryTrackId);
  const primaryTrack = tracks.find((track) => track.id === primaryTrackId);
  const primaryIsPlayer = primaryTrack?.entityType === "player";
  const primaryCanBeTarget = primaryIncluded && primaryTrack?.entityType === "player";
  const sceneReview = trackingGroundTruthSceneReviewProgress(truth.sceneReview, truth);
  const readiness = locked ? lockedReadiness(truth) : groundTruthReadiness({
    tracks,
    selectedTrackIds: referenceIds,
    benchmarkType,
    sourceFingerprint: truth.sourceFingerprint,
    angleId: truth.angleId,
    frame: truth.frame,
    range: truth.range,
    reviewedBy: "local-analyst",
    attested: truth.attested === true,
    exhaustiveSceneAttested: truth.exhaustiveSceneAttested === true,
    benchmarkTargetTrackId: truth.benchmarkTargetTrackId,
    sceneReview: truth.sceneReview,
    requireSceneReview: true,
  });
  const unresolvedCheckpoint = readiness.checkpointAudit?.ready === false
    && Number.isFinite(readiness.checkpointAudit.firstIssueAtMs);
  const checkpoint = trackingGroundTruthCheckpointDiagnostics({
    tracks,
    selectedTrackIds: referenceIds,
    benchmarkType,
    atMs: unresolvedCheckpoint
      ? readiness.checkpointAudit.firstIssueAtMs
      : sceneReview.nextAtMs ?? sceneReview.expectedAtMs.at(-1) ?? truth.range?.startMs,
  });
  const checkpointIssues = checkpoint.issues.slice(0, 4);
  const issues = readiness.issues.slice(0, 3);
  const fingerprint = locked ? truth.lockedArtifact.sourceFingerprint : truth.sourceFingerprint;
  const frame = locked ? truth.lockedArtifact.frame : truth.frame;
  const burden = locked ? truth.lockedArtifact.annotationBurdenEvidence : null;
  const burdenPoints = burden?.pointSummary || {};
  const burdenTracks = burden?.trackSummary || {};
  const burdenCorrections = burden?.correctionSummary || {};
  return `
    <section class="video-analysis-ground-truth${locked ? " is-locked" : ""}" aria-label="Benchmark reference">
      <header>
        <div>
          <span>${selectedObject ? "Selected-object reference" : "Full-scene reference"}</span>
          <strong>${locked ? "Locked reference" : "Review draft"}</strong>
        </div>
        <em>${escapeHtml(locked ? `r${truth.revision || 1}` : `${readiness.verifiedTrackCount}/${readiness.selectedTrackCount} verified`)}</em>
      </header>
      <div class="video-analysis-ground-truth__entities${selectedObject ? " is-selected-object" : ""}" aria-label="Reference object counts">
        ${selectedObject
          ? entityStat("Target player", readiness.entityCounts.player)
          : `${entityStat("Players", readiness.entityCounts.player)}${entityStat("Ball", readiness.entityCounts.ball)}${entityStat("Referee", readiness.entityCounts.referee)}`}
      </div>
      <dl class="video-analysis-ground-truth__evidence">
        <div><dt>Source SHA-256</dt><dd class="${readiness.sourceFingerprintReady ? "is-ready" : "is-missing"}">${escapeHtml(shortFingerprint(fingerprint))}</dd></div>
        <div><dt>Frame</dt><dd class="${readiness.frameReady ? "is-ready" : "is-missing"}">${escapeHtml(frame?.width && frame?.height ? `${frame.width} x ${frame.height}` : "Missing")}</dd></div>
        ${burden ? `<div><dt>Manual samples</dt><dd>${escapeHtml(`${burdenPoints.manualPointCount}/${burdenPoints.pointCount} (${Math.round(Number(burdenPoints.manualPointRatio || 0) * 100)}%)`)}</dd></div>` : ""}
        ${burden ? `<div><dt>Review changes</dt><dd>${escapeHtml(`${burdenTracks.addedOutsidePreannotationCount} added | ${burdenTracks.preannotationExcludedTrackCount} excluded | ${burdenCorrections.correctionOperationCount} corrections`)}</dd></div>` : ""}
      </dl>
      ${locked ? `
        <p class="video-analysis-ground-truth__status is-ready" aria-live="polite">Real-match reference locked ${escapeHtml(truth.lockedAt || "")}</p>
      ` : `
        <div class="video-analysis-ground-truth__actions">
          <button type="button" data-video-analysis-tracking-action="ground-truth-toggle" ${primaryTrackId && (!selectedObject || primaryIsPlayer) ? "" : "disabled"}>${selectedObject ? primaryIncluded ? "Remove target" : "Use selected player" : primaryIncluded ? "Remove selected" : "Add selected"}</button>
          ${selectedObject ? "" : `<button type="button" data-video-analysis-tracking-action="ground-truth-target" ${primaryCanBeTarget ? "" : "disabled"}>${truth.benchmarkTargetTrackId === primaryTrackId ? "Benchmark target" : "Set target"}</button>`}
          <button type="button" data-video-analysis-tracking-action="ground-truth-refresh">Refresh evidence</button>
        </div>
        <div class="video-analysis-ground-truth__scene-review">
          <div class="video-analysis-ground-truth__scene-progress">
            <strong>Scene checkpoints</strong>
            <span>${escapeHtml(`${sceneReview.reviewedSampleCount}/${sceneReview.expectedSampleCount}`)}</span>
          </div>
          <progress max="${sceneReview.expectedSampleCount}" value="${sceneReview.reviewedSampleCount}">${escapeHtml(`${Math.round(sceneReview.coverageRatio * 100)}%`)}</progress>
          <section class="video-analysis-ground-truth__checkpoint" aria-label="Checkpoint diagnostics">
            <header><strong>${unresolvedCheckpoint ? "First unresolved checkpoint" : sceneReview.complete ? "Final checkpoint" : "Next checkpoint"}</strong><time>${escapeHtml(checkpointTime(checkpoint.atMs))}</time></header>
            <dl>
              <div><dt>Selected visible</dt><dd>${checkpoint.selectedVisibleCount}</dd></div>
              <div><dt>Occluded</dt><dd>${checkpoint.occludedCount}</dd></div>
              <div><dt>Sample gaps</dt><dd>${checkpoint.samplingGapCount}</dd></div>
              <div><dt>Outside reference</dt><dd>${checkpoint.unselectedVisibleCount}</dd></div>
            </dl>
            <p>P ${checkpoint.entityCounts.player} | B ${checkpoint.entityCounts.ball} | R ${checkpoint.entityCounts.referee}</p>
            ${checkpointIssues.length ? `
              <ul class="video-analysis-ground-truth__checkpoint-issues">
                ${checkpointIssues.map((entry) => `<li><span>${escapeHtml(entry.label)}</span><button type="button" data-video-analysis-tracking-action="ground-truth-checkpoint-select" data-video-analysis-ground-truth-track-id="${escapeHtml(entry.trackId)}" data-video-analysis-ground-truth-at-ms="${checkpoint.atMs}">Review</button></li>`).join("")}
              </ul>
              ${checkpoint.issues.length > checkpointIssues.length ? `<p>${checkpoint.issues.length - checkpointIssues.length} more checkpoint issues</p>` : ""}
            ` : `<p class="is-ready">Checkpoint tracking ready for source review</p>`}
          </section>
          <div>
            <button type="button" data-video-analysis-tracking-action="ground-truth-scene-review" ${sceneReview.complete ? "disabled" : ""}>Review &amp; next</button>
            <button type="button" data-video-analysis-tracking-action="ground-truth-scene-next" ${sceneReview.complete ? "disabled" : ""}>Next unreviewed</button>
            <button type="button" data-video-analysis-tracking-action="ground-truth-scene-reset" ${sceneReview.reviewedSampleCount ? "" : "disabled"}>Reset</button>
          </div>
        </div>
        <fieldset class="video-analysis-ground-truth__scenarios">
          <legend>Scenario coverage</legend>
          ${TRACKING_BENCHMARK_SCENARIOS.map((scenario) => `
            <label>
              <input type="checkbox" value="${escapeHtml(scenario.id)}" data-video-analysis-tracking-field="groundTruthScenario" ${(truth.scenarioTags || []).includes(scenario.id) ? "checked" : ""}>
              <span>${escapeHtml(scenario.label)}</span>
            </label>
          `).join("")}
        </fieldset>
        ${selectedObject ? "" : `
          <label class="video-analysis-ground-truth__attestation">
            <input type="checkbox" data-video-analysis-tracking-field="groundTruthSceneComplete" ${truth.exhaustiveSceneAttested ? "checked" : ""} ${sceneReview.complete ? "" : "disabled"}>
            <span>All visible players, ball and referees included at every checkpoint</span>
          </label>
        `}
        <label class="video-analysis-ground-truth__attestation">
          <input type="checkbox" data-video-analysis-tracking-field="groundTruthAttested" ${truth.attested ? "checked" : ""} ${sceneReview.complete ? "" : "disabled"}>
          <span>${selectedObject ? "Target player reviewed at every checkpoint" : "Every reference track reviewed at each checkpoint"}</span>
        </label>
        ${issues.length ? `<ul class="video-analysis-ground-truth__issues">${issues.map((entry) => `<li>${escapeHtml(entry.message)}</li>`).join("")}</ul>` : `<p class="video-analysis-ground-truth__status is-ready">Ready to lock</p>`}
      `}
      ${truth.error ? `<p class="video-analysis-ground-truth__status is-error" aria-live="polite">${escapeHtml(truth.error)}</p>` : ""}
      <div class="video-analysis-ground-truth__footer">
        ${locked ? `<button type="button" data-video-analysis-tracking-action="ground-truth-download">Download JSON</button><button type="button" data-video-analysis-tracking-action="ground-truth-new">New draft</button>` : `<button type="button" data-video-analysis-tracking-action="ground-truth-lock" ${readiness.ready ? "" : "disabled"}>Lock reference</button>`}
      </div>
    </section>
  `;
}
