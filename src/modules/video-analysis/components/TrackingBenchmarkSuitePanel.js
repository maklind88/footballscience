import {
  TRACKING_BENCHMARK_SCENARIOS,
  TRACKING_GROUND_TRUTH_SUITE_MIN_DURATION_MS,
  groundTruthSuiteReadiness,
  trackingGroundTruthSuiteEntry,
} from "../services/trackingGroundTruthSuiteService.js";
import {
  trackingProviderRunWorkspaceEntry,
  trackingProviderRunsForProvider,
} from "../services/trackingProviderRunService.js";
import {
  TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
  TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
} from "../services/trackingGroundTruthService.js";
import { trackingBenchmarkWorkflowReadiness } from "../services/trackingBenchmarkWorkflowService.js";
import { escapeHtml } from "./renderHelpers.js";

function minutes(value = 0) {
  return `${(Math.max(0, Number(value) || 0) / 60_000).toFixed(1)} min`;
}

function shortFingerprint(value = "") {
  const fingerprint = String(value || "");
  return /^[a-f0-9]{64}$/i.test(fingerprint) ? `${fingerprint.slice(0, 6)}...${fingerprint.slice(-4)}` : "Unknown";
}

function caseLabel(artifact = {}) {
  const range = artifact.range || {};
  const durationMs = Math.max(0, Number(range.endMs) - Number(range.startMs));
  return `${minutes(durationMs)} | ${shortFingerprint(artifact.sourceFingerprint)}`;
}

function benchmarkStorageLabel(value = {}) {
  const labels = {
    loading: "Restoring on-device workspace",
    ready: "On-device workspace ready",
    restored: "Restored from this device",
    saving: "Saving on this device",
    saved: "Protected on this device",
    error: "On-device protection needs attention",
  };
  return labels[value.status] || "Connect a match source for on-device protection";
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "--";
}

function evaluationLabel(value = {}) {
  const labels = {
    preparing: "Binding evidence",
    running: "Evaluation in progress",
    verifying: "Verifying evidence",
    cancelling: "Cancelling evaluation",
    cancelled: "Evaluation cancelled",
    passed: "Provider benchmark passed",
    failed: "Provider below approval threshold",
    error: "Evaluation needs attention",
  };
  return labels[value.status] || "Provider evidence not evaluated";
}

function evaluationMetrics(value = {}) {
  const report = value.report || {};
  if (!report.summary) return "";
  const multiObject = report.benchmarkType === "multi-object-suite";
  const reference = report.referenceValidation?.metrics || {};
  const metrics = multiObject ? [
    ["HOTA", percent(reference.HOTA)],
    ["IDF1", percent(reference.IDF1)],
    ["MOTA", percent(reference.MOTA)],
  ] : [
    ["Mean IoU", percent(report.summary.weightedMeanIou)],
    ["Coverage", percent(report.summary.weightedVisibleCoverage)],
    ["Cases", `${report.summary.passedCaseCount}/${report.summary.caseCount}`],
  ];
  return `<dl class="video-analysis-benchmark-suite__metrics">${metrics.map(([label, metric]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(metric)}</dd></div>
  `).join("")}</dl>`;
}

function renderEvaluation(tracking = {}, workflow = {}) {
  const evaluation = tracking.benchmarkEvaluation || {};
  const active = ["preparing", "running", "verifying", "cancelling"].includes(evaluation.status);
  const complete = ["passed", "failed"].includes(evaluation.status) && evaluation.evidenceSet;
  const benchmarkType = evaluation.benchmarkType || workflow.benchmarkType;
  const typeLabel = benchmarkType === "multi-object" ? "Multi-object" : benchmarkType ? "Selected object" : "Pending";
  const issueText = workflow.issues[0]?.message || "Lock the required real-match evidence.";
  return `
    <div class="video-analysis-benchmark-suite__evaluation is-${escapeHtml(evaluation.status || "idle")}" aria-live="polite">
      <div class="video-analysis-benchmark-suite__evaluation-head">
        <div><span>Evidence benchmark</span><strong>${escapeHtml(evaluationLabel(evaluation))}</strong></div>
        <em>${escapeHtml(typeLabel)}</em>
      </div>
      ${active ? `
        <div class="video-analysis-benchmark-suite__evaluation-progress">
          <progress max="1" value="${boundedProgress(evaluation.progress)}"></progress>
          <span>${escapeHtml(evaluation.stage || "Evaluating benchmark")}</span>
        </div>
      ` : ""}
      ${evaluationMetrics(evaluation)}
      ${benchmarkType === "multi-object" ? `
        <p class="video-analysis-benchmark-suite__reference ${tracking.provider?.trackEvalAvailable ? "is-ready" : ""}">
          <span>TrackEval reference</span>
          <strong>${escapeHtml(tracking.provider?.trackEvalAvailable ? "Pinned and available" : "Not installed")}</strong>
        </p>
      ` : ""}
      ${evaluation.reportSha256 ? `<p class="video-analysis-benchmark-suite__checksum"><span>Report SHA-256</span><code>${escapeHtml(shortFingerprint(evaluation.reportSha256))}</code></p>` : ""}
      ${evaluation.error ? `<p class="video-analysis-benchmark-suite__error">${escapeHtml(evaluation.error)}</p>` : ""}
      ${!workflow.ready && !active && !complete ? `<p class="video-analysis-benchmark-suite__notice">${escapeHtml(issueText)}</p>` : ""}
      <div class="video-analysis-benchmark-suite__evaluation-actions">
        ${active
          ? `<button type="button" data-video-analysis-tracking-action="tracking-benchmark-cancel">Cancel</button>`
          : `<button type="button" data-video-analysis-tracking-action="tracking-benchmark-run" ${workflow.ready ? "" : "disabled"}>${complete ? "Run again" : "Run benchmark"}</button>`}
        <button type="button" data-video-analysis-tracking-action="tracking-benchmark-evidence-download" ${complete ? "" : "disabled"}>Export evidence</button>
      </div>
    </div>
  `;
}

function boundedProgress(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function renderTrackingBenchmarkSuitePanel(state = {}) {
  const tracking = state.presentation?.tracking || {};
  const workspace = tracking.groundTruth || {};
  const suite = trackingGroundTruthSuiteEntry(workspace);
  const readiness = groundTruthSuiteReadiness(suite);
  const workflow = trackingBenchmarkWorkflowReadiness(tracking);
  const covered = new Set(readiness.scenarioIds);
  const cases = suite.cases.slice().reverse().slice(0, 5);
  const providerRuns = trackingProviderRunWorkspaceEntry(tracking.providerRuns);
  const benchmarkStorage = tracking.benchmarkStorage || {};
  const modeLocked = suite.cases.length > 0
    || Object.values(providerRuns.byItemId || {}).some((runs) => runs.length > 0);
  let providerRunCount = 0;
  let providerRunError = "";
  try {
    providerRunCount = trackingProviderRunsForProvider(
      providerRuns,
      tracking.provider,
    ).length;
  } catch (error) {
    providerRunError = error?.message || "Raw provider run evidence is invalid.";
  }
  return `
    <section class="video-analysis-benchmark-suite" aria-label="Real-match benchmark suite">
      <header>
        <div>
          <span>Real-match suite</span>
          <strong>${readiness.ready ? "Ready for provider benchmark" : `${readiness.caseCount} locked cases`}</strong>
        </div>
        <em class="${readiness.ready ? "is-ready" : ""}">${escapeHtml(minutes(readiness.uniqueDurationMs))}</em>
      </header>
      <div class="video-analysis-benchmark-suite__mode" role="group" aria-label="Benchmark evidence profile">
        <button type="button" class="${suite.benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT ? "is-selected" : ""}" data-video-analysis-tracking-action="ground-truth-suite-mode" data-video-analysis-ground-truth-benchmark-type="${TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT}" aria-pressed="${suite.benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT}" ${modeLocked ? "disabled" : ""}>Selected object</button>
        <button type="button" class="${suite.benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT ? "is-selected" : ""}" data-video-analysis-tracking-action="ground-truth-suite-mode" data-video-analysis-ground-truth-benchmark-type="${TRACKING_BENCHMARK_TYPE_MULTI_OBJECT}" aria-pressed="${suite.benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT}" ${modeLocked ? "disabled" : ""}>Full scene</button>
      </div>
      <div class="video-analysis-benchmark-suite__progress">
        <progress max="${TRACKING_GROUND_TRUTH_SUITE_MIN_DURATION_MS}" value="${Math.min(readiness.uniqueDurationMs, TRACKING_GROUND_TRUTH_SUITE_MIN_DURATION_MS)}"></progress>
        <span>${escapeHtml(`${minutes(readiness.uniqueDurationMs)} unique / 10.0 min`)}</span>
      </div>
      <div class="video-analysis-benchmark-suite__scenarios" aria-label="Scenario coverage">
        ${TRACKING_BENCHMARK_SCENARIOS.map((scenario) => `<span class="${covered.has(scenario.id) ? "is-covered" : ""}" title="${escapeHtml(scenario.label)}">${escapeHtml(scenario.label)}</span>`).join("")}
      </div>
      ${readiness.overlapDurationMs > 0 ? `<p class="video-analysis-benchmark-suite__notice">${escapeHtml(`${minutes(readiness.overlapDurationMs)} overlap excluded`)}</p>` : ""}
      ${readiness.recommendedMaximumExceeded ? `<p class="video-analysis-benchmark-suite__notice">Pilot exceeds the recommended 20 minutes.</p>` : ""}
      <ol class="video-analysis-benchmark-suite__cases">
        ${cases.length ? cases.map((artifact) => `
          <li>
            <div><strong>${escapeHtml(artifact.id)}</strong><span>${escapeHtml(caseLabel(artifact))}</span></div>
            <button type="button" data-video-analysis-tracking-action="ground-truth-suite-remove" data-video-analysis-ground-truth-case-id="${escapeHtml(artifact.id)}" aria-label="Remove ${escapeHtml(artifact.id)} from suite">Remove</button>
          </li>
        `).join("") : `<li class="is-empty">No locked real-match cases</li>`}
      </ol>
      ${suite.cases.length > cases.length ? `<small>${escapeHtml(`${suite.cases.length - cases.length} earlier cases`)}</small>` : ""}
      <div class="video-analysis-benchmark-suite__provider-runs">
        <span><strong>${providerRunCount}</strong> raw provider run${providerRunCount === 1 ? "" : "s"}${workflow.matchedCaseCount ? ` | ${workflow.matchedCaseCount}/${readiness.caseCount} cases matched` : ""}</span>
        <button type="button" data-video-analysis-tracking-action="ground-truth-runs-download" ${providerRunCount ? "" : "disabled"}>Export runs</button>
      </div>
      ${renderEvaluation(tracking, workflow)}
      <div class="video-analysis-benchmark-suite__storage ${benchmarkStorage.status === "error" ? "is-error" : ""}" aria-live="polite">
        <span>${escapeHtml(benchmarkStorageLabel(benchmarkStorage))}</span>
        ${benchmarkStorage.status === "error" ? `<button type="button" data-video-analysis-tracking-action="retry-benchmark-storage">Retry</button>` : ""}
      </div>
      ${benchmarkStorage.error ? `<p class="video-analysis-benchmark-suite__error">${escapeHtml(benchmarkStorage.error)}</p>` : ""}
      ${providerRuns.error || providerRunError ? `<p class="video-analysis-benchmark-suite__error" aria-live="polite">${escapeHtml(providerRuns.error || providerRunError)}</p>` : ""}
      ${suite.error ? `<p class="video-analysis-benchmark-suite__error" aria-live="polite">${escapeHtml(suite.error)}</p>` : ""}
      <footer>
        <span>${escapeHtml(readiness.ready ? `${readiness.sourceCount} source${readiness.sourceCount === 1 ? "" : "s"} | all required scenarios` : readiness.issues[0]?.message || "Suite not ready")}</span>
        <button type="button" data-video-analysis-tracking-action="ground-truth-suite-download" ${readiness.ready ? "" : "disabled"}>Export suite</button>
      </footer>
    </section>
  `;
}
