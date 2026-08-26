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
  const tracks = (item?.objectTracks || []).map(normalizeObjectTrack);
  const primaryTrackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
  const referenceIds = truth.selectedTrackIds || [];
  const primaryIncluded = referenceIds.includes(primaryTrackId);
  const primaryTrack = tracks.find((track) => track.id === primaryTrackId);
  const primaryIsPlayer = primaryTrack?.entityType === "player";
  const primaryCanBeTarget = primaryIncluded && primaryTrack?.entityType === "player";
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
  });
  const issues = readiness.issues.slice(0, 3);
  const fingerprint = locked ? truth.lockedArtifact.sourceFingerprint : truth.sourceFingerprint;
  const frame = locked ? truth.lockedArtifact.frame : truth.frame;
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
      </dl>
      ${locked ? `
        <p class="video-analysis-ground-truth__status is-ready" aria-live="polite">Real-match reference locked ${escapeHtml(truth.lockedAt || "")}</p>
      ` : `
        <div class="video-analysis-ground-truth__actions">
          <button type="button" data-video-analysis-tracking-action="ground-truth-toggle" ${primaryTrackId && (!selectedObject || primaryIsPlayer) ? "" : "disabled"}>${selectedObject ? primaryIncluded ? "Remove target" : "Use selected player" : primaryIncluded ? "Remove selected" : "Add selected"}</button>
          ${selectedObject ? "" : `<button type="button" data-video-analysis-tracking-action="ground-truth-target" ${primaryCanBeTarget ? "" : "disabled"}>${truth.benchmarkTargetTrackId === primaryTrackId ? "Benchmark target" : "Set target"}</button>`}
          <button type="button" data-video-analysis-tracking-action="ground-truth-refresh">Refresh evidence</button>
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
            <input type="checkbox" data-video-analysis-tracking-field="groundTruthSceneComplete" ${truth.exhaustiveSceneAttested ? "checked" : ""}>
            <span>All visible players, ball and referees included</span>
          </label>
        `}
        <label class="video-analysis-ground-truth__attestation">
          <input type="checkbox" data-video-analysis-tracking-field="groundTruthAttested" ${truth.attested ? "checked" : ""}>
          <span>${selectedObject ? "Target player reviewed frame by frame" : "Frame-by-frame review complete"}</span>
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
