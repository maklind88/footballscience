import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  groundTruthReadiness,
  trackingGroundTruthEntry,
} from "../services/trackingGroundTruthService.js";
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
  const truth = groundTruthState(state, item?.id);
  const locked = truth.status === "locked" && Boolean(truth.lockedArtifact);
  const tracks = (item?.objectTracks || []).map(normalizeObjectTrack);
  const primaryTrackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
  const referenceIds = truth.selectedTrackIds || [];
  const primaryIncluded = referenceIds.includes(primaryTrackId);
  const readiness = locked ? lockedReadiness(truth) : groundTruthReadiness({
    tracks,
    selectedTrackIds: referenceIds,
    sourceFingerprint: truth.sourceFingerprint,
    angleId: truth.angleId,
    frame: truth.frame,
    range: truth.range,
    reviewedBy: "local-analyst",
    attested: truth.attested === true,
  });
  const issues = readiness.issues.slice(0, 3);
  const fingerprint = locked ? truth.lockedArtifact.sourceFingerprint : truth.sourceFingerprint;
  const frame = locked ? truth.lockedArtifact.frame : truth.frame;
  return `
    <section class="video-analysis-ground-truth${locked ? " is-locked" : ""}" aria-label="Benchmark reference">
      <header>
        <div>
          <span>Benchmark reference</span>
          <strong>${locked ? "Locked reference" : "Review draft"}</strong>
        </div>
        <em>${escapeHtml(locked ? `r${truth.revision || 1}` : `${readiness.verifiedTrackCount}/${readiness.selectedTrackCount} verified`)}</em>
      </header>
      <div class="video-analysis-ground-truth__entities" aria-label="Reference object counts">
        ${entityStat("Players", readiness.entityCounts.player)}
        ${entityStat("Ball", readiness.entityCounts.ball)}
        ${entityStat("Referee", readiness.entityCounts.referee)}
      </div>
      <dl class="video-analysis-ground-truth__evidence">
        <div><dt>Source SHA-256</dt><dd class="${readiness.sourceFingerprintReady ? "is-ready" : "is-missing"}">${escapeHtml(shortFingerprint(fingerprint))}</dd></div>
        <div><dt>Frame</dt><dd class="${readiness.frameReady ? "is-ready" : "is-missing"}">${escapeHtml(frame?.width && frame?.height ? `${frame.width} x ${frame.height}` : "Missing")}</dd></div>
      </dl>
      ${locked ? `
        <p class="video-analysis-ground-truth__status is-ready" aria-live="polite">Real-match reference locked ${escapeHtml(truth.lockedAt || "")}</p>
      ` : `
        <div class="video-analysis-ground-truth__actions">
          <button type="button" data-video-analysis-tracking-action="ground-truth-toggle" ${primaryTrackId ? "" : "disabled"}>${primaryIncluded ? "Remove selected" : "Add selected"}</button>
          <button type="button" data-video-analysis-tracking-action="ground-truth-refresh">Refresh evidence</button>
        </div>
        <label class="video-analysis-ground-truth__attestation">
          <input type="checkbox" data-video-analysis-tracking-field="groundTruthAttested" ${truth.attested ? "checked" : ""}>
          <span>Frame-by-frame review complete</span>
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
