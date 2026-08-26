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

export function renderTrackingBenchmarkSuitePanel(state = {}) {
  const workspace = state.presentation?.tracking?.groundTruth || {};
  const suite = trackingGroundTruthSuiteEntry(workspace);
  const readiness = groundTruthSuiteReadiness(suite);
  const covered = new Set(readiness.scenarioIds);
  const cases = suite.cases.slice().reverse().slice(0, 5);
  const providerRuns = trackingProviderRunWorkspaceEntry(state.presentation?.tracking?.providerRuns);
  let providerRunCount = 0;
  let providerRunError = "";
  try {
    providerRunCount = trackingProviderRunsForProvider(
      providerRuns,
      state.presentation?.tracking?.provider,
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
        <span><strong>${providerRunCount}</strong> raw provider run${providerRunCount === 1 ? "" : "s"}</span>
        <button type="button" data-video-analysis-tracking-action="ground-truth-runs-download" ${providerRunCount ? "" : "disabled"}>Export runs</button>
      </div>
      ${providerRuns.error || providerRunError ? `<p class="video-analysis-benchmark-suite__error" aria-live="polite">${escapeHtml(providerRuns.error || providerRunError)}</p>` : ""}
      ${suite.error ? `<p class="video-analysis-benchmark-suite__error" aria-live="polite">${escapeHtml(suite.error)}</p>` : ""}
      <footer>
        <span>${escapeHtml(readiness.ready ? `${readiness.sourceCount} source${readiness.sourceCount === 1 ? "" : "s"} | all required scenarios` : readiness.issues[0]?.message || "Suite not ready")}</span>
        <button type="button" data-video-analysis-tracking-action="ground-truth-suite-download" ${readiness.ready ? "" : "disabled"}>Export suite</button>
      </footer>
    </section>
  `;
}
