import { normalizeVideoSource } from "../domain/videoSource.model.js";
import { getLocalVideoFile } from "./localVideoBridgeService.js";

const defaultBridgeUrl = "http://127.0.0.1:47831";

function bridgeBaseUrl(win = window) {
  return String(win.FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL || defaultBridgeUrl).replace(/\/+$/, "");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function createPlayableLocalCopy(reference = {}, win = window) {
  const file = getLocalVideoFile(reference);
  if (!file) {
    throw new Error("Reload the original local file before preparing a playable copy.");
  }

  const baseUrl = bridgeBaseUrl(win);
  let health;
  try {
    health = await fetchWithTimeout(`${baseUrl}/health`, {}, 1500);
  } catch {
    throw new Error("Local video bridge is not running. Start the Football Science local video app, then prepare the playable copy again.");
  }
  if (!health.ok) {
    throw new Error("Local video bridge is not ready. Restart the Football Science local video app and try again.");
  }

  const response = await fetchWithTimeout(`${baseUrl}/transcode`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-football-science-file-name": encodeURIComponent(file.name || reference.displayName || "match-video"),
    },
    body: file,
  }, 120000);

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || !payload.playbackUrl) {
    throw new Error(payload.error || "Could not prepare a playable local copy.");
  }

  return normalizeVideoSource({
    ...reference,
    displayName: reference.displayName,
    objectUrl: payload.playbackUrl,
    durationMs: reference.durationMs,
    mimeType: "video/mp4",
    extension: "mp4",
    playbackCompatibility: {
      status: "supported",
      container: "mp4",
      codec: "avc1",
      codecLabel: "H.264",
      canPlay: true,
      warning: "",
    },
  });
}
