import {
  normalizeTrackingStageRequest,
  parseActivatedTrackingStageArtifact,
  parseTrackingStageArtifact,
  trackingStageRequestFingerprint,
} from "./tracking-stage-artifact-validator.mjs";
import { createTrackingCandidateStageRunArtifact } from "./tracking-candidate-stage-run-artifact.mjs";
import { createTrackingStageSandboxExecutor } from "./tracking-stage-sandbox-executor.mjs";

const sourceRequiredStages = new Set([
  "detection",
  "segmentation",
  "reidentification",
  "classification",
]);

export class TrackingStageRunnerError extends Error {
  constructor(message, code = "TRACKING_STAGE_RUNNER_FAILED") {
    super(message);
    this.name = "TrackingStageRunnerError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingStageRunnerError(message, code);
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/i.test(text)) {
    invalid(`Invalid ${label}.`, "TRACKING_STAGE_PROVIDER_INVALID");
  }
  return text;
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`, "TRACKING_STAGE_SOURCE_INVALID");
  return text;
}

function publicTelemetry(value = {}) {
  const bounded = (entry, maximum) => {
    const number = Number(entry);
    return Number.isFinite(number) && number >= 0 ? Math.min(maximum, number) : 0;
  };
  return Object.freeze({
    protocol: String(value.protocol || "").slice(0, 100),
    isolation: String(value.isolation || "").slice(0, 100),
    wallTimeMs: bounded(value.wallTimeMs, 24 * 60 * 60 * 1000),
    outputBytes: bounded(value.outputBytes, 4 * 1024 * 1024 * 1024),
    stdoutBytes: bounded(value.stdoutBytes, 64 * 1024),
    stderrBytes: bounded(value.stderrBytes, 64 * 1024),
    exitCode: bounded(value.exitCode, 255),
  });
}

function sourceForProvider(provider = {}, request = {}, source = {}) {
  const requestSha256 = sha256(request.sourceFingerprint, "Tracking request source fingerprint");
  const hasSource = Boolean(source?.filePath);
  if (sourceRequiredStages.has(provider.stage) && !hasSource) {
    invalid("This tracking stage requires the local match source.", "TRACKING_STAGE_SOURCE_REQUIRED");
  }
  if (!hasSource) return null;
  if (sha256(source.sha256, "Local source fingerprint") !== requestSha256) {
    invalid("Tracking stage source does not match the requested match video.", "TRACKING_STAGE_SOURCE_MISMATCH");
  }
  return {
    filePath: String(source.filePath),
    sha256: requestSha256,
    seal: source.seal,
  };
}

function activationStatus(readiness = {}, benchmarkOnly = false) {
  return {
    executionAvailable: readiness.ready === true,
    benchmarkOnly,
    activationStatus: readiness.ready
      ? (benchmarkOnly ? "benchmark-only" : "sandboxed-local")
      : "blocked",
    activationProtocol: String(readiness.protocol || "").slice(0, 100),
    activationIsolation: String(readiness.isolation || "").slice(0, 100),
    activationReasons: Array.isArray(readiness.reasons)
      ? [...new Set(readiness.reasons.map((entry) => String(entry).slice(0, 100)))].slice(0, 20)
      : [],
  };
}

export function createTrackingStageRunner(options = {}) {
  const registry = options.registry;
  const executor = options.executor || createTrackingStageSandboxExecutor(options.sandbox || {});
  const benchmarkOnly = options.executionMode === "benchmark-candidate";
  const activeByProvider = new Map();
  const registryAvailable = Boolean(registry && typeof registry.resolve === "function");

  async function inspectProvider(provider = {}) {
    if (!registryAvailable) {
      return activationStatus({
        ready: false,
        protocol: executor.info?.().protocol,
        isolation: "unavailable",
        reasons: ["tracking-stage-registry-unavailable"],
      }, benchmarkOnly);
    }
    const expectedStatus = benchmarkOnly ? "candidate-ready" : "ready";
    if (provider.status !== expectedStatus || provider.available === false) {
      return activationStatus({
        ready: false,
        protocol: executor.info?.().protocol,
        isolation: "unavailable",
        reasons: ["provider-installation-not-ready"],
      }, benchmarkOnly);
    }
    try {
      const installation = await registry.resolve(provider.id, provider.version);
      return activationStatus(await executor.inspect(installation), benchmarkOnly);
    } catch (error) {
      return activationStatus({
        ready: false,
        protocol: executor.info?.().protocol,
        isolation: "unavailable",
        reasons: [String(error?.code || "provider-installation-not-ready").toLowerCase().replaceAll("_", "-")],
      }, benchmarkOnly);
    }
  }

  async function decorateRegistry(snapshot = {}) {
    const providers = [];
    for (const provider of Array.isArray(snapshot.providers) ? snapshot.providers : []) {
      providers.push({ ...provider, ...await inspectProvider(provider) });
    }
    return {
      ...snapshot,
      providers,
      executableCount: providers.filter((provider) => provider.executionAvailable).length,
      activationBlockedCount: providers.filter((provider) => (
        provider.status === "ready" && !provider.executionAvailable
      )).length,
    };
  }

  async function run(value = {}, runOptions = {}) {
    if (!registryAvailable) {
      invalid("Tracking stage registry is unavailable.", "TRACKING_STAGE_REGISTRY_UNAVAILABLE");
    }
    const providerId = identifier(value.providerId, "tracking provider id");
    const providerVersion = identifier(value.providerVersion, "tracking provider version");
    const installation = await registry.resolve(providerId, providerVersion);
    const provider = installation.provider;
    const request = normalizeTrackingStageRequest(provider, value.request);
    const source = sourceForProvider(provider, request, value.source);
    const readiness = await executor.inspect(installation);
    if (!readiness.ready) {
      invalid("Tracking provider activation is not ready.", "TRACKING_STAGE_ACTIVATION_BLOCKED");
    }
    const active = activeByProvider.get(providerId) || 0;
    if (active >= provider.runtime.maxConcurrentJobs) {
      invalid("Tracking provider concurrency limit reached.", "TRACKING_STAGE_CONCURRENCY_LIMIT");
    }
    activeByProvider.set(providerId, active + 1);
    try {
      const execution = await executor.execute(
        installation,
        request,
        source,
        {
          signal: runOptions.signal,
          onProgress: runOptions.onProgress,
          requestFingerprint: trackingStageRequestFingerprint(provider, request),
        },
      );
      const artifact = (benchmarkOnly ? parseTrackingStageArtifact : parseActivatedTrackingStageArtifact)(
        execution.output,
        provider,
        request,
        {
          report: installation.report,
          evidence: installation.evidence,
          maxBytes: provider.runtime.maxOutputBytes,
        },
      );
      const telemetry = publicTelemetry(execution.telemetry);
      return Object.freeze({
        artifact,
        evidence: benchmarkOnly ? createTrackingCandidateStageRunArtifact({
          request,
          artifact,
          telemetry,
        }, provider, {
          id: runOptions.evidenceId,
          now: options.now,
        }) : null,
        benchmarkOnly,
        telemetry,
      });
    } finally {
      const remaining = (activeByProvider.get(providerId) || 1) - 1;
      if (remaining > 0) activeByProvider.set(providerId, remaining);
      else activeByProvider.delete(providerId);
    }
  }

  return {
    decorateRegistry,
    inspectProvider,
    run,
    info() {
      return {
        ...executor.info?.(),
        executionMode: benchmarkOnly ? "benchmark-candidate" : "activated",
        activeProviderCount: activeByProvider.size,
        activeJobCount: [...activeByProvider.values()].reduce((sum, count) => sum + count, 0),
      };
    },
  };
}

export const _private = Object.freeze({
  activationStatus,
  publicTelemetry,
  sourceForProvider,
});
