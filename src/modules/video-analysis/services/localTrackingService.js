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
    options.onProgress?.({ stage: job.stage || job.status || "tracking", ratio: job.progress || 0 });
    if (job.status === "succeeded") return job.result || {};
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

export async function trackLocalObject(options = {}) {
  const win = options.win || window;
  const fetcher = win.fetch?.bind(win) || fetch;
  const file = getLocalVideoFile(options.videoRef);
  if (!file) throw new Error("Reconnect the original local video before tracking a player.");
  const baseUrl = localVideoBridgeBaseUrl(win);
  const session = await openLocalBridgeSession(baseUrl);
  const capabilityResponse = await fetcher(`${baseUrl}/capabilities`, {
    headers: { "x-football-science-session": session.sessionToken },
    signal: options.signal,
  });
  const capabilityPayload = await responseJson(capabilityResponse);
  if (!capabilityResponse.ok) throw new Error(capabilityPayload.error || "The local processing service is not ready.");
  if (!(capabilityPayload.capabilities || []).includes("track-object")) {
    throw new Error("No approved local tracking provider is installed. Use manual keyframes or install the tracking engine.");
  }
  const prompt = {
    ...(options.prompt || {}),
    clipId: options.clipId,
    videoId: options.videoId,
  };
  const response = await fetcher(`${baseUrl}/jobs/track-object`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-football-science-file-name": encodeURIComponent(file.name || options.videoRef?.displayName || "match-video"),
      "x-football-science-session": session.sessionToken,
      "x-football-science-tracking-prompt": encodePrompt(prompt, win),
    },
    body: file,
    signal: options.signal,
  });
  const queued = await responseJson(response);
  if (!response.ok || !queued.statusUrl) throw new Error(queued.error || "The local tracking job could not be started.");
  const queuedJob = { statusUrl: queued.statusUrl, sessionToken: session.sessionToken };
  options.onQueued?.(queuedJob);
  try {
    const result = await pollTrackingJob(queued.statusUrl, session.sessionToken, { ...options, win });
    const artifactResponse = await fetcher(result.trackingUrl, { signal: options.signal });
    const artifact = await responseJson(artifactResponse);
    if (!artifactResponse.ok) throw new Error(artifact.error || "The local tracking artifact could not be opened.");
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
      },
    });
  } catch (error) {
    if (options.signal?.aborted) await cancelLocalTrackingJob(queuedJob, win).catch(() => false);
    throw error;
  }
}
