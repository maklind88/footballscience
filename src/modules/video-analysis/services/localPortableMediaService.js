import { localVideoBridgeBaseUrl, openLocalBridgeSession } from "./localPlaybackTranscodeService.js";

async function responseJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function wait(milliseconds, win = window) {
  return new Promise((resolve) => win.setTimeout(resolve, milliseconds));
}

async function pollPublishJob(statusUrl, sessionToken, options = {}) {
  const win = options.win || window;
  const fetcher = options.fetcher || win.fetch?.bind(win) || fetch;
  const deadline = Date.now() + Math.max(60_000, Number(options.timeoutMs) || 6 * 60 * 60 * 1000);
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException("Portable review publishing was cancelled.", "AbortError");
    const response = await fetcher(statusUrl, {
      headers: { "x-football-science-session": sessionToken },
      signal: options.signal,
    });
    const payload = await responseJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not read the portable publishing job.");
    const job = payload.job || {};
    options.onProgress?.({
      stage: job.stage || job.status || "publishing",
      ratio: Math.max(0, Math.min(1, Number(job.progress?.ratio) || 0)),
    });
    if (job.status === "succeeded") return job.result || {};
    if (["failed", "cancelled"].includes(job.status)) throw new Error(job.error || "Portable review publishing did not complete.");
    await wait(500, win);
  }
  throw new Error("Portable review publishing timed out.");
}

export async function cancelLocalPortablePublish(job = {}, win = window) {
  if (!job.statusUrl || !job.sessionToken) return false;
  const fetcher = win.fetch?.bind(win) || fetch;
  const response = await fetcher(job.statusUrl, {
    method: "DELETE",
    headers: { "x-football-science-session": job.sessionToken },
  });
  return response.ok;
}

export async function publishLocalMediaExport(result = {}, upload = {}, options = {}) {
  if (!result.artifactId || !upload.assetId) throw new Error("Render the review before publishing it.");
  const win = options.win || window;
  const fetcher = options.fetcher || win.fetch?.bind(win) || fetch;
  const baseUrl = localVideoBridgeBaseUrl(win);
  const session = await openLocalBridgeSession(baseUrl, { fetcher });
  const capabilityResponse = await fetcher(`${baseUrl}/capabilities`, {
    headers: { "x-football-science-session": session.sessionToken },
    signal: options.signal,
  });
  const capabilities = await responseJson(capabilityResponse);
  if (!capabilityResponse.ok || !(capabilities.capabilities || []).includes("publish-export")) {
    throw new Error(capabilities.error || "Update the local video app before publishing portable reviews.");
  }
  const response = await fetcher(`${baseUrl}/jobs/publish-export`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-football-science-session": session.sessionToken,
    },
    body: JSON.stringify({
      ...upload,
      exportArtifactId: result.artifactId,
      sha256: result.sha256,
      expectedBytes: result.sizeBytes,
    }),
    signal: options.signal,
  });
  const queued = await responseJson(response);
  if (!response.ok || !queued.statusUrl) throw new Error(queued.error || "Portable publishing could not be started.");
  const job = { jobId: queued.job?.id || "", statusUrl: queued.statusUrl, sessionToken: session.sessionToken };
  options.onQueued?.(job);
  try {
    return await pollPublishJob(job.statusUrl, job.sessionToken, { ...options, fetcher, win });
  } catch (error) {
    if (options.signal?.aborted) await cancelLocalPortablePublish(job, win).catch(() => false);
    throw error;
  }
}
