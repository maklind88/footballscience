import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { getLocalVideoFile } from "./localVideoBridgeService.js";
import { localVideoBridgeBaseUrl, openLocalBridgeSession } from "./localPlaybackTranscodeService.js";
import {
  fetchTrackingCandidateStageEvidence,
  registeredTrackingCandidates,
} from "./trackingCandidateEvidenceService.js";

function encodePrompt(value = {}, win = window) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return win.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function delay(milliseconds, win = window) {
  return new Promise((resolve) => win.setTimeout(resolve, milliseconds));
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function boundedText(value, maximum = 160) {
  return String(value || "").replace(/[\r\n]/g, " ").trim().slice(0, maximum);
}

function validTrackingProviderRegistry(value = {}) {
  return value.protocol === "football-science-tracking-provider-registry-v1"
    && Array.isArray(value.providers)
    && value.providers.length <= 50;
}

function registeredTrackingProviders(value = {}) {
  if (!validTrackingProviderRegistry(value)) return [];
  return value.providers.map((provider) => {
    const status = provider?.status === "ready" && provider.available === true ? "ready" : "blocked";
    const fingerprint = boundedText(provider?.executionFingerprintSha256, 64).toLowerCase();
    return {
      id: boundedText(provider?.id, 100),
      version: boundedText(provider?.version, 100),
      name: boundedText(provider?.name || provider?.id, 160),
      protocol: boundedText(provider?.protocol, 100),
      stage: boundedText(provider?.stage, 40),
      capabilities: Array.isArray(provider?.capabilities)
        ? [...new Set(provider.capabilities.map((entry) => boundedText(entry, 80)).filter(Boolean))].slice(0, 20)
        : [],
      status,
      available: status === "ready",
      executionAvailable: status === "ready" && provider?.executionAvailable === true,
      activationStatus: boundedText(provider?.activationStatus, 40),
      activationProtocol: boundedText(provider?.activationProtocol, 100),
      activationIsolation: boundedText(provider?.activationIsolation, 100),
      activationReasons: Array.isArray(provider?.activationReasons)
        ? provider.activationReasons.map((entry) => boundedText(entry, 100)).filter(Boolean).slice(0, 20)
        : [],
      benchmarkStatus: boundedText(provider?.benchmarkStatus, 40),
      executionFingerprintSha256: /^[a-f0-9]{64}$/.test(fingerprint) ? fingerprint : "",
      source: status === "ready" ? "verified-local-registry" : "local-registry-blocked",
      reasons: Array.isArray(provider?.reasons)
        ? provider.reasons.map((entry) => boundedText(entry, 80)).filter(Boolean).slice(0, 20)
        : [],
    };
  }).filter((provider) => provider.id && provider.version);
}

export function normalizeLocalTrackingJobProgress(job = {}) {
  const source = job.progress && typeof job.progress === "object"
    ? job.progress
    : { ratio: job.progress };
  const ratio = Math.max(0, Math.min(1, optionalNumber(source.ratio) ?? 0));
  const result = {
    stage: String(job.stage || source.stage || job.status || "tracking").slice(0, 120),
    ratio,
    startedAt: String(job.startedAt || ""),
  };
  for (const key of ["processedFrames", "totalFrames", "sampleFps"]) {
    const number = optionalNumber(source[key]);
    if (number !== null) result[key] = number;
  }
  if (source.device) result.device = String(source.device).slice(0, 24);
  return result;
}

async function pollTrackingJob(statusUrl, sessionToken, options = {}) {
  const win = options.win || window;
  const fetcher = win.fetch?.bind(win) || fetch;
  const deadline = Date.now() + Math.max(60_000, Number(options.timeoutMs) || 2 * 60 * 60 * 1000);
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException("Tracking was cancelled.", "AbortError");
    const response = await fetcher(statusUrl, {
      headers: { "x-football-science-session": sessionToken },
      signal: options.signal,
    });
    const payload = await responseJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not read the local tracking job.");
    const job = payload.job || {};
    options.onProgress?.(normalizeLocalTrackingJobProgress(job));
    if (job.status === "succeeded") {
      const startedAt = Date.parse(job.startedAt);
      const completedAt = Date.parse(job.completedAt);
      const processingMs = Number.isFinite(startedAt) && Number.isFinite(completedAt)
        ? Math.max(0, completedAt - startedAt)
        : null;
      return {
        ...(job.result || {}),
        ...(processingMs !== null ? { processingMs } : {}),
      };
    }
    if (["failed", "cancelled"].includes(job.status)) throw new Error(job.error || "Local tracking did not complete.");
    await delay(450, win);
  }
  throw new Error("Local tracking timed out before the provider completed.");
}

export async function cancelLocalTrackingJob(job = {}, win = window) {
  if (!job.statusUrl || !job.sessionToken) return false;
  const fetcher = win.fetch?.bind(win) || fetch;
  const response = await fetcher(job.statusUrl, {
    method: "DELETE",
    headers: { "x-football-science-session": job.sessionToken },
  });
  return response.ok;
}

export async function inspectLocalTrackingProvider(win = window) {
  const fetcher = win.fetch?.bind(win) || fetch;
  const baseUrl = localVideoBridgeBaseUrl(win);
  try {
    const session = await openLocalBridgeSession(baseUrl, { fetcher });
    const response = await fetcher(`${baseUrl}/capabilities`, {
      headers: { "x-football-science-session": session.sessionToken },
    });
    const payload = await responseJson(response);
    if (!response.ok) throw new Error(payload.error || "The local processing service is not ready.");
    const provider = payload.trackingProvider && typeof payload.trackingProvider === "object"
      ? payload.trackingProvider
      : {};
    const runtime = provider.runtime && typeof provider.runtime === "object"
      ? provider.runtime
      : {};
    const available = (payload.capabilities || []).includes("track-object") && provider.available !== false;
    const benchmark = payload.trackingBenchmark && typeof payload.trackingBenchmark === "object"
      ? payload.trackingBenchmark
      : {};
    const providers = registeredTrackingProviders(payload.trackingProviderRegistry);
    const candidates = registeredTrackingCandidates(payload.trackingCandidateRegistry);
    const providerRegistry = validTrackingProviderRegistry(payload.trackingProviderRegistry)
      ? payload.trackingProviderRegistry
      : {};
    return {
      status: available ? "ready" : "not-installed",
      available,
      batchAvailable: available && (payload.capabilities || []).includes("track-objects"),
      id: String(provider.engineName || ""),
      name: String(provider.displayName || provider.engineName || "Football Science SAM 2.1 Object Tracker"),
      version: String(provider.engineVersion || ""),
      protocol: String(provider.providerContractProtocol || "football-science-tracking-stage-v1"),
      stage: "segmentation",
      capabilities: ["segment:selected-object", "propagate:selected-object"],
      executionFingerprintSha256: String(provider.providerExecutionFingerprintSha256 || ""),
      source: String(provider.source || "none"),
      runtimeMode: String(runtime.mode || ""),
      runtimeStatus: String(runtime.status || ""),
      modelResident: runtime.modelResident === true,
      runtimeDevice: String(runtime.device || ""),
      runtimeCpuThreads: Math.max(0, Math.min(64, Number(runtime.cpuThreads) || 0)),
      runtimeSampleFps: Math.max(0, Math.min(25, Number(runtime.sampleFps) || 0)),
      workerColdStartMs: Math.max(0, Number(runtime.coldStartMs) || 0),
      workerCompletedJobs: Math.max(0, Number(runtime.completedJobs) || 0),
      workerReusedJobs: Math.max(0, Number(runtime.reusedJobs) || 0),
      maxDurationMs: Math.max(1000, Math.min(20 * 60 * 1000, Number(payload.limits?.maxTrackingDurationMs) || 120_000)),
      maxObjectsPerJob: Math.max(1, Math.min(8, Number(payload.limits?.maxTrackingObjectsPerJob) || 1)),
      benchmarkAvailable: (payload.capabilities || []).includes("evaluate-tracking-benchmark"),
      stageExecutionAvailable: (payload.capabilities || []).includes("run-tracking-stage"),
      candidateStageExecutionAvailable: (payload.capabilities || []).includes("run-tracking-candidate-stage"),
      trackEvalAvailable: (payload.capabilities || []).includes("tracking-reference:trackeval"),
      referenceEvaluator: String(benchmark.evaluator || ""),
      referenceEvaluatorVersion: String(benchmark.evaluatorVersion || ""),
      referenceEvaluatorCommit: String(benchmark.sourceCommit || ""),
      referenceSourceSha256: String(benchmark.sourceSha256 || ""),
      providers,
      candidates,
      providerRegistryStatus: boundedText(providerRegistry.status, 40),
      providerRegistryBlockedCount: Math.max(
        0,
        Math.min(50, Math.round(Number(providerRegistry.blockedCount) || 0)),
      ),
      error: "",
    };
  } catch (error) {
    return {
      status: "offline",
      available: false,
      batchAvailable: false,
      benchmarkAvailable: false,
      stageExecutionAvailable: false,
      candidateStageExecutionAvailable: false,
      trackEvalAvailable: false,
      name: "Local tracking companion",
      version: "",
      source: "none",
      error: error?.message || "The local tracking companion is offline.",
    };
  }
}

function validStageArtifact(value = {}, provider = {}) {
  return value && typeof value === "object"
    && value.schemaVersion === 1
    && value.protocol === "football-science-tracking-stage-result-v1"
    && value.provider?.id === provider.id
    && value.provider?.version === provider.version
    && typeof value.requestFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(value.requestFingerprint)
    && value.payload && typeof value.payload === "object";
}

async function runLocalTrackingStageRequest(options = {}, benchmarkOnly = false) {
  const win = options.win || window;
  const fetcher = win.fetch?.bind(win) || fetch;
  const baseUrl = localVideoBridgeBaseUrl(win);
  const provider = {
    id: boundedText(options.provider?.id, 100),
    version: boundedText(options.provider?.version, 100),
  };
  if (!provider.id || !provider.version || !options.request || typeof options.request !== "object") {
    throw new Error("Choose one activated local tracking provider and a bounded stage request.");
  }
  const session = await openLocalBridgeSession(baseUrl, { fetcher });
  const file = options.file || (!options.sourceArtifactId && options.videoId
    ? await getLocalVideoFile(options.videoId)
    : null);
  const jsonTransport = Boolean(options.sourceArtifactId || !file);
  const headers = {
    "content-type": jsonTransport ? "application/json" : (file?.type || "application/octet-stream"),
    "x-football-science-session": session.sessionToken,
    "x-football-science-tracking-provider-id": provider.id,
    "x-football-science-tracking-provider-version": provider.version,
  };
  if (options.sourceArtifactId) {
    headers["x-football-science-tracking-source-id"] = boundedText(options.sourceArtifactId, 80);
  }
  if (!jsonTransport) {
    headers["x-football-science-file-name"] = encodeURIComponent(
      file?.name || options.displayName || "match-video",
    );
    headers["x-football-science-tracking-stage-request"] = encodePrompt(options.request, win);
  }
  const endpoint = benchmarkOnly ? "run-tracking-candidate-stage" : "run-tracking-stage";
  const response = await fetcher(`${baseUrl}/jobs/${endpoint}`, {
    method: "POST",
    headers,
    body: jsonTransport ? JSON.stringify(options.request) : file,
    signal: options.signal,
  });
  const payload = await responseJson(response);
  if (!response.ok) throw new Error(payload.error || "Could not start the local tracking stage.");
  const activeJob = {
    id: payload.job?.id,
    statusUrl: payload.statusUrl,
    sessionToken: session.sessionToken,
  };
  options.onJob?.(activeJob);
  const result = await pollTrackingJob(payload.statusUrl, session.sessionToken, {
    win,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    onProgress: options.onProgress,
  });
  if ((result.benchmarkOnly === true) !== benchmarkOnly) {
    throw new Error("The local tracking result crossed its activation boundary.");
  }
  const artifactResponse = await fetcher(result.resultUrl, {
    headers: { "x-football-science-session": session.sessionToken },
    signal: options.signal,
  });
  const artifact = await responseJson(artifactResponse);
  if (!artifactResponse.ok || !validStageArtifact(artifact, provider)) {
    throw new Error("The local tracking provider returned an invalid stage artifact.");
  }
  const evidence = benchmarkOnly ? await fetchTrackingCandidateStageEvidence({
    win,
    fetcher,
    baseUrl,
    evidenceUrl: result.evidenceUrl,
    evidenceSha256: result.evidenceSha256,
    artifactSha256: result.artifactSha256,
    sessionToken: session.sessionToken,
    signal: options.signal,
    provider,
    sourceSha256: result.sourceSha256,
    artifact,
  }) : null;
  return {
    artifact,
    ...(evidence ? {
      evidence,
      evidenceSha256: boundedText(result.evidenceSha256, 64).toLowerCase(),
    } : {}),
    sourceArtifactId: boundedText(result.sourceArtifactId, 80),
    sourceSha256: boundedText(result.sourceSha256, 64).toLowerCase(),
    execution: result.execution && typeof result.execution === "object" ? result.execution : {},
    processingMs: optionalNumber(result.processingMs),
    benchmarkOnly,
  };
}

export async function runLocalTrackingStage(options = {}) {
  return runLocalTrackingStageRequest(options, false);
}

export async function runLocalTrackingCandidateStage(options = {}) {
  return runLocalTrackingStageRequest(options, true);
}

async function queueTrackingJob(options = {}) {
  const batch = Array.isArray(options.prompts);
  const headers = {
    "content-type": options.file?.type || "application/octet-stream",
    "x-football-science-file-name": encodeURIComponent(
      options.file?.name || options.displayName || "match-video",
    ),
    "x-football-science-session": options.sessionToken,
    [batch ? "x-football-science-tracking-prompts" : "x-football-science-tracking-prompt"]: encodePrompt(
      batch ? options.prompts : options.prompt,
      options.win,
    ),
  };
  if (options.sourceArtifactId) {
    headers["x-football-science-tracking-source-id"] = options.sourceArtifactId;
  }
  const request = {
    method: "POST",
    headers,
    signal: options.signal,
  };
  if (!options.sourceArtifactId) request.body = options.file;
  const response = await options.fetcher(`${options.baseUrl}/jobs/${batch ? "track-objects" : "track-object"}`, request);
  return { response, payload: await responseJson(response) };
}

function normalizedLocalTrack(artifact = {}, prompt = {}, result = {}, options = {}, requestedSourceId = "") {
  return normalizeObjectTrack({
    ...artifact,
    clipId: options.clipId,
    videoId: options.videoId,
    engine: result.engine || artifact.engine,
    engineVersion: result.engineVersion || artifact.engineVersion,
    metadata: {
      ...(artifact.metadata || {}),
      localArtifactId: result.artifactId,
      localArtifactExpiresAt: result.expiresAt,
      localSourceArtifactId: result.sourceArtifactId || requestedSourceId,
      localSourceSha256: result.sourceSha256 || "",
      providerProcessingMs: Math.max(0, Number(result.processingMs) || 0),
      providerRuntimeMode: String(result.providerRuntime?.mode || ""),
      providerRuntimeDevice: String(result.providerRuntime?.device || ""),
      providerCpuThreads: Math.max(0, Math.min(64, Number(result.providerRuntime?.cpuThreads) || 0)),
      providerModelResident: result.providerRuntime?.modelResident === true,
      providerWorkerReused: result.providerRuntime?.workerReused === true,
      providerWorkerJobSequence: Math.max(0, Number(result.providerRuntime?.workerJobSequence) || 0),
      providerModelLoadMs: Math.max(0, Number(result.providerRuntime?.modelLoadMs) || 0),
      providerJobProcessingMs: Math.max(0, Number(result.providerRuntime?.jobProcessingMs) || 0),
      providerSamplingMs: Math.max(0, Number(result.providerRuntime?.telemetry?.samplingMs) || 0),
      providerStateInitMs: Math.max(0, Number(result.providerRuntime?.telemetry?.stateInitMs) || 0),
      providerPromptMs: Math.max(0, Number(result.providerRuntime?.telemetry?.promptMs) || 0),
      providerForwardPropagationMs: Math.max(
        0,
        Number(result.providerRuntime?.telemetry?.forwardPropagationMs) || 0,
      ),
      providerReversePropagationMs: Math.max(
        0,
        Number(result.providerRuntime?.telemetry?.reversePropagationMs) || 0,
      ),
      providerSampledFrameCount: Math.max(0, Number(result.providerRuntime?.telemetry?.sampledFrameCount) || 0),
      providerSampleFps: Math.max(0, Number(result.providerRuntime?.telemetry?.sampleFps) || 0),
      angleId: String(prompt.angleId || ""),
    },
  });
}

async function runLocalTrackingJob(options = {}, values = {}) {
  const win = options.win || window;
  const fetcher = win.fetch?.bind(win) || fetch;
  const file = getLocalVideoFile(options.videoRef);
  const requestedSourceId = String(options.sourceArtifactId || "").trim();
  if (!file && !requestedSourceId) throw new Error("Reconnect the original local video before tracking objects.");
  const baseUrl = localVideoBridgeBaseUrl(win);
  const session = await openLocalBridgeSession(baseUrl, { fetcher });
  const capabilityResponse = await fetcher(`${baseUrl}/capabilities`, {
    headers: { "x-football-science-session": session.sessionToken },
    signal: options.signal,
  });
  const capabilityPayload = await responseJson(capabilityResponse);
  if (!capabilityResponse.ok) throw new Error(capabilityPayload.error || "The local processing service is not ready.");
  if (!(capabilityPayload.capabilities || []).includes(values.capability)) {
    throw new Error("No approved local tracking provider is installed. Use manual keyframes or install the tracking engine.");
  }
  const request = {
    baseUrl,
    displayName: options.videoRef?.displayName,
    fetcher,
    file,
    ...(values.prompts ? { prompts: values.prompts } : { prompt: values.prompt }),
    sessionToken: session.sessionToken,
    signal: options.signal,
    sourceArtifactId: requestedSourceId,
    win,
  };
  let { response, payload: queued } = await queueTrackingJob(request);
  if (!response.ok && requestedSourceId && file && [404, 409, 410].includes(response.status)) {
    ({ response, payload: queued } = await queueTrackingJob({ ...request, sourceArtifactId: "" }));
  }
  if (!response.ok || !queued.statusUrl) throw new Error(queued.error || "The local tracking job could not be started.");
  const queuedJob = { statusUrl: queued.statusUrl, sessionToken: session.sessionToken };
  options.onQueued?.(queuedJob);
  try {
    const result = await pollTrackingJob(queued.statusUrl, session.sessionToken, { ...options, win });
    const artifactResponse = await fetcher(result.trackingUrl, { signal: options.signal });
    const artifact = await responseJson(artifactResponse);
    if (!artifactResponse.ok) throw new Error(artifact.error || "The local tracking artifact could not be opened.");
    return { artifact, requestedSourceId, result };
  } catch (error) {
    if (options.signal?.aborted) await cancelLocalTrackingJob(queuedJob, win).catch(() => false);
    throw error;
  }
}

export async function trackLocalObject(options = {}) {
  const prompt = {
    ...(options.prompt || {}),
    clipId: options.clipId,
    videoId: options.videoId,
  };
  const local = await runLocalTrackingJob(options, { capability: "track-object", prompt });
  return normalizedLocalTrack(local.artifact, prompt, local.result, options, local.requestedSourceId);
}

export async function trackLocalObjects(options = {}) {
  if (!Array.isArray(options.prompts) || options.prompts.length < 2 || options.prompts.length > 8) {
    throw new Error("Select 2-8 targets for one local tracking batch.");
  }
  const prompts = options.prompts.map((prompt) => ({
    ...(prompt || {}),
    clipId: options.clipId,
    videoId: options.videoId,
  }));
  const promptIds = prompts.map((prompt) => String(prompt.id || "").trim());
  if (promptIds.some((id) => !id) || new Set(promptIds).size !== promptIds.length) {
    throw new Error("Every tracking target needs a unique id.");
  }
  const local = await runLocalTrackingJob(options, { capability: "track-objects", prompts });
  const rawTracks = Array.isArray(local.artifact?.tracks) ? local.artifact.tracks : [];
  if (rawTracks.length !== prompts.length) throw new Error("The local tracker returned an incomplete target batch.");
  const byPromptId = new Map(rawTracks.map((track) => [String(track?.metadata?.promptId || ""), track]));
  if (byPromptId.size !== prompts.length || promptIds.some((id) => !byPromptId.has(id))) {
    throw new Error("The local tracker returned mismatched target identities.");
  }
  return prompts.map((prompt) => normalizedLocalTrack(
    byPromptId.get(String(prompt.id)),
    prompt,
    local.result,
    options,
    local.requestedSourceId,
  ));
}
