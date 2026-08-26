import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TrackingBenchmarkError } from "../../../src/modules/video-analysis/services/trackingBenchmarkContract.js";
import {
  readTrackEvalManifest,
  resolveInstalledTrackEval,
} from "../tracking-evaluators/trackeval/evaluator-runtime.mjs";
import {
  buildTrackEvalRequest,
  validateTrackEvalReport,
} from "./tracking-trackeval-request.mjs";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function trackEvalReportSha256(value = {}) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

async function readBoundedJson(filePath, maxBytes) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
    throw new TrackingBenchmarkError("TrackEval output is empty or outside the size limit.");
  }
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function runEvaluator(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref?.();
      finish(reject, new TrackingBenchmarkError("TrackEval evaluation exceeded the local time limit."));
    }, options.timeoutMs);
    timeout.unref?.();
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-64_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-64_000); });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (code === 0) finish(resolve, { stdout, stderr });
      else finish(reject, new TrackingBenchmarkError(stderr.trim() || `TrackEval exited with ${code}.`));
    });
  });
}

export async function evaluateTrackEvalReference(value = {}, options = {}) {
  const manifest = options.manifest || readTrackEvalManifest();
  const request = buildTrackEvalRequest(value, manifest);
  const runtime = options.runtime || resolveInstalledTrackEval({
    ...(options.evaluator || {}),
    manifest,
    env: options.env || process.env,
  });
  if (!runtime) {
    throw new TrackingBenchmarkError(
      "The pinned TrackEval reference evaluator is not installed.",
      "TRACKING_REFERENCE_UNAVAILABLE",
    );
  }
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-trackeval-"));
  const inputPath = path.join(temporaryDir, "request.json");
  const outputPath = path.join(temporaryDir, "report.json");
  try {
    await fs.writeFile(inputPath, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await runEvaluator(runtime.command, [
      ...(runtime.args || []),
      "--input", inputPath,
      "--output", outputPath,
    ], {
      env: { ...process.env, ...(runtime.env || {}) },
      timeoutMs: Number(options.timeoutMs || manifest.runtime.maximumEvaluationMs),
    });
    const raw = await readBoundedJson(outputPath, Number(manifest.runtime.maximumReportBytes));
    const report = validateTrackEvalReport(raw, request, manifest);
    return { ...report, reportSha256: trackEvalReportSha256(report) };
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
}

function crossValidation(internalMetrics = {}, referenceMetrics = {}) {
  const values = {
    MOTA: Math.abs(Number(internalMetrics.mota) - Number(referenceMetrics.MOTA)),
    IDF1: Math.abs(Number(internalMetrics.identityF1) - Number(referenceMetrics.IDF1)),
  };
  const tolerance = 1e-9;
  return { tolerance, deltas: values, passed: Object.values(values).every((value) => value <= tolerance) };
}

function referenceThresholdFailures(metrics = {}, thresholds = {}) {
  const rules = {
    minHota: "HOTA",
    minDetA: "DetA",
    minAssA: "AssA",
    minLocA: "LocA",
    minMota: "MOTA",
    minIdf1: "IDF1",
  };
  return Object.entries(rules).flatMap(([threshold, metric]) => (
    Number(metrics[metric]) >= Number(thresholds[threshold])
      ? []
      : [{ metric, threshold, expected: thresholds[threshold], actual: metrics[metric], reason: "minimum" }]
  ));
}

function referenceEvidence(reference = {}, sequence = null, thresholds = {}, internalMetrics = null) {
  const result = sequence || reference.summary;
  const failures = referenceThresholdFailures(result.metrics, thresholds);
  return {
    evaluator: "TrackEval",
    status: "verified",
    evaluatorCommit: reference.evaluator.commit,
    sourceSha256: reference.evaluator.sourceSha256,
    reportSha256: reference.reportSha256,
    threshold: reference.threshold,
    metrics: result.metrics,
    perEntity: result.perEntity,
    requiredThresholds: thresholds,
    passed: failures.length === 0,
    failureCount: failures.length,
    failures,
    ...(internalMetrics ? { crossValidation: crossValidation(internalMetrics, result.metrics) } : {}),
  };
}

export async function attachTrackEvalReference(value = {}, report = {}, options = {}) {
  const reference = await evaluateTrackEvalReference(value, options);
  if (report.benchmarkType === "multi-object-suite") {
    const byId = new Map(reference.sequences.map((sequence) => [sequence.benchmarkId, sequence]));
    const cases = report.cases.map((entry) => {
      const sequence = byId.get(entry.benchmarkId);
      if (!sequence) throw new TrackingBenchmarkError("TrackEval reference is missing a benchmark case.");
      const evidence = referenceEvidence(
        reference,
        sequence,
        entry.referenceValidation?.requiredThresholds,
        entry.metrics,
      );
      return {
        ...entry,
        referenceValidation: evidence,
        verdict: {
          ...entry.verdict,
          passed: entry.verdict.passed && evidence.passed,
          referencePassed: evidence.passed,
          failureCount: entry.verdict.failureCount + evidence.failureCount,
        },
      };
    });
    const failedCaseIds = cases.filter((entry) => !entry.verdict.passed).map((entry) => entry.benchmarkId);
    const summaryThresholds = report.cases[0]?.referenceValidation?.requiredThresholds || {};
    return {
      ...report,
      summary: {
        ...report.summary,
        passed: failedCaseIds.length === 0,
        passedCaseCount: cases.length - failedCaseIds.length,
        failedCaseIds,
      },
      referenceValidation: referenceEvidence(reference, null, summaryThresholds),
      cases,
    };
  }
  const sequence = reference.sequences[0];
  const evidence = referenceEvidence(
    reference,
    sequence,
    report.referenceValidation?.requiredThresholds,
    report.metrics,
  );
  return {
    ...report,
    referenceValidation: evidence,
    verdict: {
      ...report.verdict,
      passed: report.verdict.passed && evidence.passed,
      referencePassed: evidence.passed,
      failureCount: report.verdict.failureCount + evidence.failureCount,
    },
  };
}
