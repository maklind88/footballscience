import { getLocalVideoFile } from "./localVideoBridgeService.js";
import { localVideoBridgeBaseUrl, openLocalBridgeSession } from "./localPlaybackTranscodeService.js";
import { manifestSha256 } from "./mediaProductionService.js";

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
  return new Promise((resolve) => win.setTimeout(resolve, milliseconds));
}

async function localCapabilities(baseUrl, sessionToken, options = {}) {
  const fetcher = options.fetcher || fetch;
  const response = await fetcher(`${baseUrl}/capabilities`, {
    headers: { "x-football-science-session": sessionToken },
    signal: options.signal,
  });
  const payload = await responseJson(response);
  if (!response.ok) throw new Error(payload.error || "The local media service is not ready.");
  return payload.capabilities || [];
}

async function pollJob(statusUrl, sessionToken, options = {}) {
  const win = options.win || window;
  const fetcher = options.fetcher || win.fetch?.bind(win) || fetch;
  const deadline = Date.now() + Math.max(60_000, Number(options.timeoutMs) || 3 * 60 * 60 * 1000);
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException("Export was cancelled.", "AbortError");
    const response = await fetcher(statusUrl, {
      headers: { "x-football-science-session": sessionToken },
      signal: options.signal,
    });
    const payload = await responseJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not read the local export job.");
    const job = payload.job || {};
    options.onProgress?.({
      stage: job.stage || job.status || "rendering",
      ratio: Math.max(0, Math.min(1, Number(job.progress?.ratio) || 0)),
    });
    if (job.status === "succeeded") return job.result || {};
    if (["failed", "cancelled"].includes(job.status)) throw new Error(job.error || "Local export did not complete.");
    await wait(450, win);
  }
  throw new Error("Local export timed out before rendering completed.");
}

export async function renderLocalMediaExport(options = {}) {
  const win = options.win || window;
  const fetcher = options.fetcher || win.fetch?.bind(win) || fetch;
  const file = getLocalVideoFile(options.videoRef);
  if (!file) throw new Error("Reconnect this angle's original local video before exporting.");
  const baseUrl = localVideoBridgeBaseUrl(win);
  const session = await openLocalBridgeSession(baseUrl);
  const capabilities = await localCapabilities(baseUrl, session.sessionToken, {
    fetcher,
    signal: options.signal,
  });
  if (!capabilities.includes("render-export")) {
    throw new Error("Update the Football Science local video app before rendering exports.");
  }
  const manifest = options.manifest || {};
  const specification = {
    exportId: manifest.exportId,
    title: manifest.title,
    startMs: manifest.range?.startMs,
    endMs: manifest.range?.endMs,
    preset: manifest.preset,
    sourceIdentifier: manifest.source?.localVideoIdentifier,
    angleId: manifest.source?.angleId,
    manifestSha256: await manifestSha256(manifest, win.crypto || globalThis.crypto),
    analysis: {
      matchId: manifest.source?.matchId,
      videoId: manifest.source?.videoId,
      sourceId: manifest.source?.sourceId,
      angleLabel: manifest.source?.angleLabel,
      angleRole: manifest.source?.angleRole,
      ...manifest.analysis,
    },
  };
  const response = await fetcher(`${baseUrl}/jobs/render-export`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-football-science-file-name": encodeURIComponent(file.name || options.videoRef?.displayName || "match-video"),
      "x-football-science-export-spec": encodeSpecification(specification, win),
      "x-football-science-session": session.sessionToken,
    },
    body: file,
    signal: options.signal,
  });
  const queued = await responseJson(response);
  if (!response.ok || !queued.statusUrl) throw new Error(queued.error || "The local export job could not be started.");
  options.onQueued?.({
    jobId: queued.job?.id || "",
    statusUrl: queued.statusUrl,
    sessionToken: session.sessionToken,
  });
  const result = await pollJob(queued.statusUrl, session.sessionToken, {
    ...options,
    fetcher,
    win,
  });
  return { ...result, manifest, manifestSha256: specification.manifestSha256 };
}

export async function cancelLocalMediaExport(job = {}, win = window) {
  if (!job.statusUrl || !job.sessionToken) return false;
  const fetcher = win.fetch?.bind(win) || fetch;
  const response = await fetcher(job.statusUrl, {
    method: "DELETE",
    headers: { "x-football-science-session": job.sessionToken },
  });
  return response.ok;
}

export function downloadLocalMediaExport(result = {}, win = window) {
  if (!result.downloadUrl) return false;
  const anchor = win.document?.createElement?.("a");
  if (!anchor) return false;
  anchor.href = result.downloadUrl;
  anchor.download = result.fileName || "football-science-review.mp4";
  anchor.rel = "noopener";
  anchor.click();
  return true;
}
