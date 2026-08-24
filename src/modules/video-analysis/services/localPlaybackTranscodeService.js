import { normalizeVideoSource } from "../domain/videoSource.model.js";
import { getLocalVideoFile } from "./localVideoBridgeService.js";

const defaultBridgeUrl = "http://127.0.0.1:47831";
const bridgeSessions = new Map();

export function localVideoBridgeBaseUrl(win = window) {
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

function cachedBridgeSession(baseUrl) {
  const session = bridgeSessions.get(baseUrl);
  if (!session) return null;
  const expiresAtMs = Date.parse(session.expiresAt || "");
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 60_000) {
    bridgeSessions.delete(baseUrl);
    return null;
  }
  return session;
}

export async function openLocalBridgeSession(baseUrl) {
  const cached = cachedBridgeSession(baseUrl);
  if (cached) return cached;
  const response = await fetchWithTimeout(`${baseUrl}/session`, { method: "POST" }, 3000);
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || !payload.sessionToken) {
    throw new Error(payload.error || "The local video app must be updated before it can prepare video securely.");
  }
  const session = {
    sessionToken: String(payload.sessionToken),
    expiresAt: String(payload.expiresAt || ""),
  };
  bridgeSessions.set(baseUrl, session);
  return session;
}

function preparationMode(reference = {}) {
  const compatibility = reference.playbackCompatibility || {};
  const codec = String(compatibility.codec || "").toLowerCase();
  const isH264 = codec === "avc1" || codec === "avc3" || codec === "avcc" || compatibility.codecLabel === "H.264";
  return isH264 ? "auto" : "transcode";
}

export async function createPlayableLocalCopy(reference = {}, win = window) {
  const file = getLocalVideoFile(reference);
  if (!file) {
    throw new Error("Reload the original local file before preparing a playable copy.");
  }

  const baseUrl = localVideoBridgeBaseUrl(win);
  let health;
  try {
    health = await fetchWithTimeout(`${baseUrl}/health`, {}, 1500);
  } catch {
    throw new Error("Local video bridge is not running. Start the Football Science local video app, then prepare the playable copy again.");
  }
  if (!health.ok) {
    throw new Error("Local video bridge is not ready. Restart the Football Science local video app and try again.");
  }

  let session;
  try {
    session = await openLocalBridgeSession(baseUrl);
  } catch (error) {
    throw new Error(error.message || "Could not open a secure local video session.");
  }

  const response = await fetchWithTimeout(`${baseUrl}/transcode`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-football-science-file-name": encodeURIComponent(file.name || reference.displayName || "match-video"),
      "x-football-science-prepare-mode": preparationMode(reference),
      "x-football-science-session": session.sessionToken,
    },
    body: file,
  }, 45 * 60 * 1000);

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
