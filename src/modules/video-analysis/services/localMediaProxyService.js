import { getLocalVideoFile } from "./localVideoBridgeService.js";
import { localVideoBridgeBaseUrl, openLocalBridgeSession } from "./localPlaybackTranscodeService.js";

function encodeSpecification(value = {}, win = window) {
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

function wait(milliseconds, win = window) {
  return new Promise((resolve) => (win.setTimeout || setTimeout)(resolve, milliseconds));
}

async function localCapabilities(baseUrl, sessionToken, options = {}) {
  const response = await options.fetcher(`${baseUrl}/capabilities`, {
    headers: { "x-football-science-session": sessionToken },
    signal: options.signal,
  });
  const payload = await responseJson(response);
  if (!response.ok) throw new Error(payload.error || "The local media service is not ready.");
  return payload.capabilities || [];
}

async function pollJob(statusUrl, sessionToken, options = {}) {
  const deadline = Date.now() + Math.max(60_000, Number(options.timeoutMs) || 3 * 60 * 60 * 1000);
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException("Local media processing was cancelled.", "AbortError");
    const response = await options.fetcher(statusUrl, {
      headers: { "x-football-science-session": sessionToken },
      signal: options.signal,
    });
    const payload = await responseJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not read the local media job.");
    const job = payload.job || {};
    options.onProgress?.({
      stage: job.stage || job.status || "processing",
      ratio: Math.max(0, Math.min(1, Number(job.progress?.ratio) || 0)),
    });
    if (job.status === "succeeded") return job.result || {};
    if (["failed", "cancelled"].includes(job.status)) throw new Error(job.error || "Local media processing did not complete.");
    await wait(450, options.win);
  }
  throw new Error("Local media processing timed out.");
}

async function localContext(options = {}, capability = "") {
  const win = options.win || window;
  const fetcher = options.fetcher || win.fetch?.bind(win) || fetch;
  const baseUrl = localVideoBridgeBaseUrl(win);
  const session = await openLocalBridgeSession(baseUrl, { fetcher });
  const capabilities = await localCapabilities(baseUrl, session.sessionToken, { fetcher, signal: options.signal });
  if (!capabilities.includes(capability)) {
    throw new Error("Update the Football Science local video app before using proxy and replay tools.");
  }
  return { baseUrl, fetcher, session, win };
}

export async function createLocalMediaProxy(options = {}) {
  const file = getLocalVideoFile(options.videoRef);
  if (!file) throw new Error("Reconnect this angle's original local video before creating a proxy.");
  const context = await localContext(options, "create-proxy");
  const response = await context.fetcher(`${context.baseUrl}/jobs/create-proxy`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-football-science-file-name": encodeURIComponent(file.name || options.videoRef?.displayName || "match-video"),
      "x-football-science-proxy-spec": encodeSpecification({
        preset: options.preset,
        sourceIdentifier: options.videoRef?.localVideoIdentifier,
        angleId: options.angleId,
      }, context.win),
      "x-football-science-session": context.session.sessionToken,
    },
    body: file,
    signal: options.signal,
  });
  const queued = await responseJson(response);
  if (!response.ok || !queued.statusUrl) throw new Error(queued.error || "The local proxy job could not be started.");
  options.onQueued?.({
    jobId: queued.job?.id || "",
    statusUrl: queued.statusUrl,
    sessionToken: context.session.sessionToken,
  });
  return pollJob(queued.statusUrl, context.session.sessionToken, { ...options, ...context });
}

export async function createLocalReplayBuffer(options = {}) {
  const context = await localContext(options, "replay-buffer");
  const proxy = options.proxy || {};
  const response = await context.fetcher(`${context.baseUrl}/jobs/create-replay-buffer`, {
    method: "POST",
    headers: {
      "x-football-science-replay-spec": encodeSpecification({
        proxyId: proxy.artifactId,
        proxyAccessToken: proxy.artifactAccessToken,
        startMs: options.startMs,
        endMs: options.endMs,
        matchStartMs: options.matchStartMs,
        matchEndMs: options.matchEndMs,
        angleId: options.angleId,
      }, context.win),
      "x-football-science-session": context.session.sessionToken,
    },
    signal: options.signal,
  });
  const queued = await responseJson(response);
  if (!response.ok || !queued.statusUrl) throw new Error(queued.error || "The local replay buffer could not be started.");
  options.onQueued?.({
    jobId: queued.job?.id || "",
    statusUrl: queued.statusUrl,
    sessionToken: context.session.sessionToken,
  });
  return pollJob(queued.statusUrl, context.session.sessionToken, { ...options, ...context });
}

export async function cancelLocalMediaJob(job = {}, win = window) {
  if (!job.statusUrl || !job.sessionToken) return false;
  const fetcher = win.fetch?.bind(win) || fetch;
  const response = await fetcher(job.statusUrl, {
    method: "DELETE",
    headers: { "x-football-science-session": job.sessionToken },
  });
  return response.ok;
}
