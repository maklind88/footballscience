import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { getLocalVideoFile } from "./localVideoBridgeService.js";
import { localVideoBridgeBaseUrl, openLocalBridgeSession } from "./localPlaybackTranscodeService.js";

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
    const available = (payload.capabilities || []).includes("track-object") && provider.available !== false;
    const benchmark = payload.trackingBenchmark && typeof payload.trackingBenchmark === "object"
      ? payload.trackingBenchmark
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
      maxDurationMs: Math.max(1000, Math.min(20 * 60 * 1000, Number(payload.limits?.maxTrackingDurationMs) || 120_000)),
      maxObjectsPerJob: Math.max(1, Math.min(8, Number(payload.limits?.maxTrackingObjectsPerJob) || 1)),
      benchmarkAvailable: (payload.capabilities || []).includes("evaluate-tracking-benchmark"),
      trackEvalAvailable: (payload.capabilities || []).includes("tracking-reference:trackeval"),
      referenceEvaluator: String(benchmark.evaluator || ""),
      referenceEvaluatorVersion: String(benchmark.evaluatorVersion || ""),
      referenceEvaluatorCommit: String(benchmark.sourceCommit || ""),
      referenceSourceSha256: String(benchmark.sourceSha256 || ""),
      error: "",
    };
  } catch (error) {
    return {
      status: "offline",
      available: false,
      batchAvailable: false,
      benchmarkAvailable: false,
      trackEvalAvailable: false,
      name: "Local tracking companion",
      version: "",
      source: "none",
      error: error?.message || "The local tracking companion is offline.",
    };
  }
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
