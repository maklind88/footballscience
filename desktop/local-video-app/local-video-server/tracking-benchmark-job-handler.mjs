import {
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  assertBenchmarkEnvelope,
  benchmarkSerializedBytes,
} from "../../../src/modules/video-analysis/services/trackingBenchmarkContract.js";
import { evaluateTrackingBenchmarkSuite } from "../../../src/modules/video-analysis/services/trackingBenchmarkService.js";
import { evaluateMultiObjectTrackingBenchmarkSuite } from "../../../src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js";
import {
  readTrackEvalManifest,
  resolveInstalledTrackEval,
} from "../tracking-evaluators/trackeval/evaluator-runtime.mjs";
import { attachTrackEvalReference } from "./tracking-trackeval-adapter.mjs";

const maximumReportBytes = 16 * 1024 * 1024;

function requestError(message, statusCode = 400, code = "TRACKING_BENCHMARK_REQUEST_INVALID") {
  return Object.assign(new Error(message), { statusCode, code });
}

async function readBoundedJson(request, maximumBytes = MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
  const declaredBytes = Number(request.headers?.["content-length"] || 0);
  if (declaredBytes > maximumBytes) throw requestError("Tracking benchmark input is too large.", 413);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw requestError("Tracking benchmark input is too large.", 413);
    chunks.push(chunk);
  }
  if (!bytes) throw requestError("Tracking benchmark input is empty.");
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw requestError("Tracking benchmark input is not valid JSON.");
  }
  try {
    assertBenchmarkEnvelope(value, {
      label: "Local tracking benchmark suite",
      maxBytes: maximumBytes,
    });
  } catch (error) {
    if (!Number.isInteger(error?.statusCode)) error.statusCode = 400;
    throw error;
  }
  return value;
}

function benchmarkType(value = {}) {
  const first = Array.isArray(value.cases) ? value.cases[0] : null;
  return first?.benchmarkType === "multi-object" ? "multi-object" : "selected-object";
}

function trackEvalInfo(options = {}) {
  const manifest = options.trackEvalManifest || readTrackEvalManifest();
  const runtime = options.trackEvalRuntime || resolveInstalledTrackEval({
    ...(options.trackEval || {}),
    manifest,
  });
  return {
    available: Boolean(options.evaluateBenchmark || runtime),
    evaluator: manifest.evaluatorId,
    version: manifest.evaluatorVersion,
    sourceCommit: manifest.upstream.commit,
    sourceSha256: manifest.upstream.sourceSha256,
    runtime,
    manifest,
  };
}

async function defaultEvaluate(value = {}, options = {}) {
  if (options.signal?.aborted) throw requestError("Tracking benchmark was cancelled.", 499, "ABORT_ERR");
  if (benchmarkType(value) === "selected-object") return evaluateTrackingBenchmarkSuite(value);
  const internal = evaluateMultiObjectTrackingBenchmarkSuite(value);
  const reference = trackEvalInfo(options);
  if (!reference.runtime) {
    throw requestError(
      "The pinned TrackEval reference evaluator is not installed.",
      503,
      "TRACKING_REFERENCE_UNAVAILABLE",
    );
  }
  return attachTrackEvalReference(value, internal, {
    manifest: reference.manifest,
    runtime: reference.runtime,
    signal: options.signal,
  });
}

export function createTrackingBenchmarkJobHandler(options = {}) {
  const evaluator = options.evaluateBenchmark || ((value, jobOptions) => defaultEvaluate(value, {
    ...options,
    ...jobOptions,
  }));

  function info() {
    const reference = trackEvalInfo(options);
    return {
      available: true,
      referenceAvailable: reference.available,
      evaluator: reference.evaluator,
      evaluatorVersion: reference.version,
      sourceCommit: reference.sourceCommit,
      sourceSha256: reference.sourceSha256,
      maxInputBytes: MAX_TRACKING_BENCHMARK_SUITE_BYTES,
      maxReportBytes: maximumReportBytes,
    };
  }

  async function createJob(request, response) {
    const session = options.authorizeSession(request, response);
    if (!session) return null;
    if (options.jobs.stats().queued >= options.config.maxQueuedJobs) {
      options.sendJson(request, response, options.config, 429, {
        ok: false,
        error: "The local processing queue is full. Wait for an active job or cancel one.",
      }, { "retry-after": "5" });
      return null;
    }
    try {
      const suite = await readBoundedJson(request);
      const type = benchmarkType(suite);
      const job = options.jobs.create("evaluate-tracking-benchmark", {
        benchmarkType: type,
        caseCount: Array.isArray(suite.cases) ? suite.cases.length : 0,
      });
      options.jobOwners.set(job.id, session.token);
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        reportProgress({ stage: "validating benchmark", ratio: 0.08 });
        const report = await evaluator(suite, {
          signal,
          onProgress: reportProgress,
        });
        reportProgress({ stage: type === "multi-object" ? "verifying TrackEval evidence" : "finalizing report", ratio: 0.92 });
        if (benchmarkSerializedBytes(report, "Tracking benchmark report") > maximumReportBytes) {
          throw requestError("Tracking benchmark report is too large.", 500);
        }
        return { report };
      });
      return job.id;
    } catch (error) {
      options.sendJson(
        request,
        response,
        options.config,
        options.statusCodeForError(error),
        { ok: false, error: options.publicErrorMessage(error) },
      );
      return null;
    }
  }

  return { createJob, info };
}
