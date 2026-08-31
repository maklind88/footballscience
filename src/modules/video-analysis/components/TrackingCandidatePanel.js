import {
  TRACKING_CANDIDATE_BENCHMARK_STAGES,
  trackingCandidateBenchmarkProviders,
} from "../services/trackingBenchmarkProviderService.js";
import { trackingCandidatePipelineReadiness } from "../services/trackingCandidateSelectionService.js";
import { trackingCandidateSemanticAnchors } from "../services/trackingCandidateAnchorService.js";
import { trackingGroundTruthSuiteEntry } from "../services/trackingGroundTruthSuiteService.js";
import { TRACKING_BENCHMARK_TYPE_MULTI_OBJECT } from "../services/trackingGroundTruthService.js";
import { escapeHtml } from "./renderHelpers.js";

const stageLabels = Object.freeze({
  detection: "Detection",
  association: "Association",
  reidentification: "Re-ID",
  classification: "Classification",
});

const statusLabels = Object.freeze({
  "waiting-item": "Waiting for clip",
  loading: "Restoring evidence",
  ready: "Ready",
  restored: "Evidence restored",
  running: "Pipeline running",
  cancelling: "Cancelling",
  cancelled: "Cancelled",
  "loading-run": "Restoring run",
  review: "Review required",
  error: "Needs attention",
});

function shortHash(value = "") {
  const hash = String(value || "");
  return /^[a-f0-9]{64}$/i.test(hash) ? `${hash.slice(0, 7)}...${hash.slice(-5)}` : "Unknown";
}

function evidenceSize(value = 0) {
  const bytes = Math.max(0, Number(value) || 0);
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createdAt(value = "") {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16).replace("T", " ") : "Unknown time";
}

function providerLabel(provider = {}) {
  return provider?.id ? `${provider.id}${provider.version ? ` ${provider.version}` : ""}` : "Missing";
}

function renderStage(stage = {}) {
  return `
    <li class="${stage.ready ? "is-ready" : "is-missing"}">
      <span aria-hidden="true"></span>
      <div><strong>${escapeHtml(stageLabels[stage.id] || stage.label)}</strong><small>${escapeHtml(providerLabel(stage.provider))}</small></div>
      <em>${stage.ready ? "Ready" : "Missing"}</em>
    </li>
  `;
}

function renderBenchmarkSelector(tracking = {}) {
  const providers = trackingCandidateBenchmarkProviders(tracking);
  if (!Object.keys(providers).length) return "";
  const selectedStage = String(tracking.candidateBenchmarkProvider?.stage || "");
  return `
    <div class="video-analysis-candidate__benchmark">
      <div><span>Benchmark provider</span><strong>${escapeHtml(providerLabel(providers[selectedStage]))}</strong></div>
      <div role="group" aria-label="Candidate benchmark provider">
        ${TRACKING_CANDIDATE_BENCHMARK_STAGES.map((stage) => `
          <button type="button" class="${selectedStage === stage ? "is-selected" : ""}"
            data-video-analysis-tracking-action="candidate-benchmark-provider"
            data-video-analysis-tracking-candidate-stage="${stage}"
            aria-pressed="${selectedStage === stage}" ${providers[stage] ? "" : "disabled"}>${escapeHtml(stageLabels[stage])}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderReview(summary = null) {
  if (!summary) return "";
  return `
    <dl class="video-analysis-candidate__review">
      <div><dt>Tracks</dt><dd>${Number(summary.trackCount) || 0}</dd></div>
      <div><dt>Identity review</dt><dd>${Number(summary.playerIdentityReviewCount) || 0}</dd></div>
      <div><dt>Low confidence</dt><dd>${Number(summary.lowConfidenceTrackCount) || 0}</dd></div>
      <div><dt>Re-ID merges</dt><dd>${Number(summary.reidentificationMergeCount) || 0}</dd></div>
      <div><dt>Class conflicts</dt><dd>${Number(summary.classificationConflictCount) || 0}</dd></div>
      <div><dt>Unassigned</dt><dd>${Number(summary.unassignedObservationCount) || 0}</dd></div>
    </dl>
  `;
}

function renderRoleCalibration(anchors = {}, roleAware = false) {
  if (!roleAware) return "";
  const total = (Number(anchors.playerCount) || 0) + (Number(anchors.refereeCount) || 0);
  return `
    <div class="video-analysis-candidate__calibration ${total ? "is-calibrated" : ""}">
      <div><span>Role calibration</span><strong>${total ? `${total} anchored` : "Unanchored"}</strong></div>
      <small>${Number(anchors.playerCount) || 0} player | ${Number(anchors.refereeCount) || 0} referee | ${Number(anchors.homeCount) || 0}/${Number(anchors.awayCount) || 0} team</small>
    </div>
  `;
}

function renderEvidenceRun(run = {}, activeRunId = "") {
  const id = escapeHtml(run.id || "");
  return `
    <li class="${run.id === activeRunId ? "is-active" : ""}">
      <div>
        <strong>${escapeHtml(createdAt(run.createdAt))}</strong>
        <span>${escapeHtml(`${evidenceSize(run.serializedBytes)} | ${shortHash(run.sourceFingerprint)}`)}</span>
      </div>
      <div>
        <button type="button" data-video-analysis-tracking-action="candidate-pipeline-restore" data-video-analysis-tracking-candidate-run-id="${id}">Restore</button>
        <button type="button" data-video-analysis-tracking-action="candidate-pipeline-export" data-video-analysis-tracking-candidate-run-id="${id}">Export</button>
        <button type="button" data-video-analysis-tracking-action="candidate-pipeline-remove" data-video-analysis-tracking-candidate-run-id="${id}">Remove</button>
      </div>
    </li>
  `;
}

export function renderTrackingCandidatePanel(state = {}, item = null) {
  const tracking = state.presentation?.tracking || {};
  const candidate = tracking.candidatePipeline || {};
  const readiness = trackingCandidatePipelineReadiness(tracking);
  const suite = trackingGroundTruthSuiteEntry(tracking.groundTruth || {});
  const fullScene = suite.benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT;
  const active = ["running", "cancelling"].includes(candidate.status);
  const progress = Math.max(0, Math.min(1, Number(candidate.progress) || 0));
  const runs = Array.isArray(candidate.runs) ? candidate.runs : [];
  const activeRun = runs.find((run) => run.id === candidate.activeRunId) || runs[0] || null;
  const roleAware = readiness.providers?.classification?.capabilities?.includes("classify:role") === true;
  const semanticAnchors = trackingCandidateSemanticAnchors(item?.objectTracks || [], {
    pipelineFingerprintSha256: activeRun?.pipelineFingerprintSha256,
    sourceFingerprintSha256: activeRun?.sourceFingerprint,
  });
  const canRun = Boolean(item) && readiness.ready && fullScene && !active;
  const gate = !item
    ? "Select a presentation clip."
    : !fullScene
      ? "Choose Full scene for candidate evidence."
      : readiness.issues[0] || "";
  return `
    <section class="video-analysis-candidate" aria-label="Tracking candidate pipeline">
      <header>
        <div><span>Tracking Intelligence v2</span><strong>${escapeHtml(statusLabels[candidate.status] || "Candidate pipeline")}</strong></div>
        <em class="${readiness.ready ? "is-ready" : ""}">${readiness.stages.filter((stage) => stage.ready).length}/4</em>
      </header>
      <ol class="video-analysis-candidate__stages">${readiness.stages.map(renderStage).join("")}</ol>
      ${active ? `
        <div class="video-analysis-candidate__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}">
          <span style="width:${Math.round(progress * 100)}%"></span>
          <div><strong>${escapeHtml(candidate.stage || "Running candidate pipeline")}</strong><small>${Math.round(progress * 100)}%</small></div>
        </div>
      ` : ""}
      ${renderReview(activeRun?.review)}
      ${renderRoleCalibration(semanticAnchors, roleAware)}
      ${renderBenchmarkSelector(tracking)}
      ${candidate.error ? `<p class="video-analysis-candidate__error">${escapeHtml(candidate.error)}</p>` : ""}
      ${gate && !active ? `<p class="video-analysis-candidate__gate">${escapeHtml(gate)}</p>` : ""}
      <div class="video-analysis-candidate__commands">
        ${active
          ? `<button type="button" data-video-analysis-tracking-action="candidate-pipeline-cancel" ${candidate.status === "cancelling" ? "disabled" : ""}>Cancel pipeline</button>`
          : `<button type="button" data-video-analysis-tracking-action="candidate-pipeline-run" ${canRun ? "" : "disabled"}>${semanticAnchors.roleAnchors.length || semanticAnchors.teamAnchors.length ? "Re-run with anchors" : "Run full scene"}</button>`}
        <span>${escapeHtml(`${runs.length} device run${runs.length === 1 ? "" : "s"}`)}</span>
      </div>
      <ol class="video-analysis-candidate__runs">
        ${runs.length ? runs.map((run) => renderEvidenceRun(run, candidate.activeRunId)).join("") : `<li class="is-empty">No device evidence</li>`}
      </ol>
    </section>
  `;
}
