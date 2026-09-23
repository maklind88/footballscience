import { MAX_TRACKING_BENCHMARK_SUITE_BYTES } from "../services/trackingBenchmarkContract.js";
import {
  trackingGroundTruthSuiteEntry,
  validateGroundTruthSuiteArtifact,
} from "../services/trackingGroundTruthSuiteService.js";
import { trackingProviderRunWorkspaceEntry } from "../services/trackingProviderRunService.js";

function currentEvidence(getState) {
  const tracking = getState().presentation?.tracking || {};
  const suite = trackingGroundTruthSuiteEntry(tracking.groundTruth || {});
  const providerRuns = trackingProviderRunWorkspaceEntry(tracking.providerRuns);
  return {
    suite,
    hasProviderRuns: Object.values(providerRuns.byItemId || {}).some((runs) => runs.length > 0),
  };
}

function importedSuiteEntry(artifact = {}) {
  const revisionMatch = String(artifact.id || "").match(/^(.*)-r([1-9]\d*)$/);
  return {
    id: revisionMatch?.[1] || artifact.id,
    revision: revisionMatch ? Number(revisionMatch[2]) : 1,
    status: "draft",
    benchmarkType: artifact.summary.benchmarkType,
    cases: artifact.cases,
    downloadedAt: "",
    error: "",
  };
}

export function createTrackingGroundTruthSuiteImportController(options = {}) {
  const getState = options.getState || (() => ({}));
  const setSuite = options.setSuite || (() => {});
  const setError = options.setError || (() => {});

  async function importFile(file = null, field = null) {
    try {
      const before = currentEvidence(getState);
      if (!file || typeof file.text !== "function") throw new Error("Choose a ground-truth suite JSON file.");
      if (before.suite.cases.length || before.hasProviderRuns) {
        throw new Error("Remove current cases and provider runs before importing another suite.");
      }
      if (!Number.isSafeInteger(Number(file.size))
        || Number(file.size) <= 0
        || Number(file.size) > MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
        throw new Error("The ground-truth suite file is empty or outside the size limit.");
      }
      const artifact = validateGroundTruthSuiteArtifact(JSON.parse(await file.text()));
      const after = currentEvidence(getState);
      if (after.suite.cases.length || after.hasProviderRuns) {
        throw new Error("The local benchmark evidence changed during import.");
      }
      setSuite(importedSuiteEntry(artifact));
      options.onEvidenceChanged?.();
    } catch (error) {
      setError(error?.message || "The ground-truth suite could not be imported.");
    } finally {
      if (field && "value" in field) field.value = "";
    }
  }

  function chooseFile(element = null) {
    const field = element?.closest?.(".video-analysis-benchmark-suite")?.querySelector?.(
      '[data-video-analysis-tracking-field="groundTruthSuiteImport"]',
    );
    if (!field || field.disabled) return false;
    field.click?.();
    return true;
  }

  return { chooseFile, importFile };
}
