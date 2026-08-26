import {
  finalizeTrackingBenchmarkWorkflow,
  prepareTrackingBenchmarkWorkflow,
  trackingBenchmarkEvidenceSetJson,
  trackingBenchmarkWorkflowSourceSignature,
} from "../services/trackingBenchmarkWorkflowService.js";
import { emptyTrackingBenchmarkEvaluation } from "../services/trackingBenchmarkStateService.js";
import { patchTrackingState } from "./trackingControllerHelpers.js";

const benchmarkActions = new Set([
  "tracking-benchmark-run",
  "tracking-benchmark-cancel",
  "tracking-benchmark-evidence-download",
]);

function boundedRatio(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function benchmarkPassed(report = {}) {
  if (report.benchmarkType?.endsWith?.("-suite")) return report.summary?.passed === true;
  return report.verdict?.passed === true;
}

function publicJob(job = {}) {
  return {
    jobId: String(job.jobId || ""),
    statusUrl: String(job.statusUrl || ""),
  };
}

function downloadJson(win = null, json = "", fileName = "fs-player-tracking-benchmark.json") {
  const anchor = win?.document?.createElement?.("a");
  const BlobConstructor = win?.Blob || globalThis.Blob;
  if (!anchor || !BlobConstructor || !win?.URL?.createObjectURL) return false;
  const objectUrl = win.URL.createObjectURL(new BlobConstructor([json], { type: "application/json" }));
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  win.document.body?.appendChild?.(anchor);
  anchor.click();
  anchor.remove?.();
  win.setTimeout?.(() => win.URL.revokeObjectURL?.(objectUrl), 0);
  return true;
}

function cancelled(error = {}) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function abortError() {
  if (typeof DOMException === "function") return new DOMException("Benchmark was cancelled.", "AbortError");
  return Object.assign(new Error("Benchmark was cancelled."), { name: "AbortError" });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function inputsChangedError(options = {}) {
  const error = new Error("Benchmark inputs changed during evaluation. Run the benchmark again.", options);
  error.code = "TRACKING_BENCHMARK_INPUTS_CHANGED";
  return error;
}

export function createTrackingBenchmarkController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getWindow = options.getWindow || (() => globalThis.window);
  const now = options.now || Date.now;
  let active = null;
  let sequence = 0;

  function patch(patchValue = {}) {
    updateState((state) => patchTrackingState(state, {
      benchmarkEvaluation: {
        ...emptyTrackingBenchmarkEvaluation(),
        ...(state.presentation?.tracking?.benchmarkEvaluation || {}),
        ...patchValue,
      },
    }));
  }

  async function run() {
    if (active || !options.evaluateBenchmark) return false;
    const id = ++sequence;
    const abortController = new AbortController();
    active = { id, abortController, job: null };
    const startedAt = new Date(now()).toISOString();
    const win = getWindow();
    const cryptoApi = options.cryptoApi || win?.crypto || globalThis.crypto;
    patch(emptyTrackingBenchmarkEvaluation({
      status: "preparing",
      stage: "Binding locked evidence",
      progress: 0.03,
      startedAt,
    }));
    try {
      const tracking = getState().presentation?.tracking || {};
      const prepared = await prepareTrackingBenchmarkWorkflow(tracking, { now, cryptoApi });
      if (active?.id !== id) return false;
      throwIfAborted(abortController.signal);
      patch({
        status: "running",
        stage: prepared.referenceRequired ? "Running pinned TrackEval reference" : "Evaluating selected-object tracking",
        progress: 0.08,
        benchmarkType: prepared.benchmarkType,
        referenceRequired: prepared.referenceRequired,
        sourceSignature: prepared.sourceSignature,
        error: "",
      });
      const report = await options.evaluateBenchmark(prepared.assembledBenchmark, {
        win,
        signal: abortController.signal,
        onQueued: (job) => {
          if (active?.id !== id) return;
          active.job = job;
          patch({ job: publicJob(job) });
        },
        onProgress: (progress = {}) => {
          if (active?.id !== id) return;
          patch({
            status: "running",
            stage: String(progress.stage || "Evaluating benchmark").slice(0, 120),
            progress: Math.max(0.1, Math.min(0.94, boundedRatio(progress.ratio))),
          });
        },
      });
      if (active?.id !== id) return false;
      throwIfAborted(abortController.signal);
      patch({ status: "verifying", stage: "Verifying bound evidence", progress: 0.96 });
      const currentTracking = getState().presentation?.tracking || {};
      let currentSignature;
      try {
        currentSignature = await trackingBenchmarkWorkflowSourceSignature(currentTracking, { now, cryptoApi });
      } catch (error) {
        throwIfAborted(abortController.signal);
        throw inputsChangedError({ cause: error });
      }
      throwIfAborted(abortController.signal);
      if (currentSignature !== prepared.sourceSignature) {
        throw inputsChangedError();
      }
      const finalized = await finalizeTrackingBenchmarkWorkflow(prepared, report, { now, cryptoApi });
      if (active?.id !== id) return false;
      throwIfAborted(abortController.signal);
      const passed = benchmarkPassed(finalized.report);
      patch({
        status: passed ? "passed" : "failed",
        stage: passed ? "Provider evidence verified" : "Provider thresholds not met",
        progress: 1,
        report: finalized.report,
        evidenceSet: finalized.evidenceSet,
        reportSha256: finalized.reportSha256,
        completedAt: new Date(now()).toISOString(),
        job: null,
        error: "",
      });
      return true;
    } catch (error) {
      if (active?.id !== id) return false;
      const inputsChanged = active.invalidated === true;
      const wasCancelled = !inputsChanged && (cancelled(error) || abortController.signal.aborted);
      patch({
        status: wasCancelled ? "cancelled" : "error",
        stage: wasCancelled ? "Benchmark cancelled" : "Benchmark needs attention",
        progress: 0,
        report: null,
        evidenceSet: null,
        reportSha256: "",
        completedAt: new Date(now()).toISOString(),
        job: null,
        error: wasCancelled
          ? ""
          : inputsChanged
            ? "Benchmark inputs changed during evaluation. Run the benchmark again."
            : error?.message || "The tracking benchmark could not be completed.",
      });
      return false;
    } finally {
      if (active?.id === id) active = null;
    }
  }

  function cancel() {
    if (!active) return false;
    patch({ status: "cancelling", stage: "Cancelling benchmark" });
    active.abortController.abort();
    if (active.job) void options.cancelBenchmark?.(active.job, getWindow()).catch?.(() => false);
    return true;
  }

  function invalidate() {
    if (!active) {
      patch(emptyTrackingBenchmarkEvaluation());
      return true;
    }
    active.invalidated = true;
    patch({ status: "cancelling", stage: "Inputs changed; cancelling benchmark" });
    active.abortController.abort();
    if (active.job) void options.cancelBenchmark?.(active.job, getWindow()).catch?.(() => false);
    return true;
  }

  function downloadEvidence() {
    const evaluation = getState().presentation?.tracking?.benchmarkEvaluation || {};
    if (!evaluation.evidenceSet) return false;
    const suiteId = String(evaluation.evidenceSet.inputs?.groundTruthSuite?.id || "real-match")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 100);
    return downloadJson(
      getWindow(),
      trackingBenchmarkEvidenceSetJson(evaluation.evidenceSet),
      `fs-player-${suiteId}-benchmark-evidence.json`,
    );
  }

  function handleAction(action = "") {
    if (!benchmarkActions.has(action)) return false;
    if (action === "tracking-benchmark-run") {
      void run();
      return true;
    }
    if (action === "tracking-benchmark-cancel") return cancel();
    return downloadEvidence();
  }

  return { cancel, downloadEvidence, handleAction, invalidate, run };
}
