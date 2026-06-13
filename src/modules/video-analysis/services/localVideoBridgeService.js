import { normalizeVideoSource } from "../domain/videoSource.model.js";

function sanitizeDisplayName(value = "") {
  return String(value || "Local video")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Local video";
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createLocalVideoReference(file, win = window) {
  if (!file?.type?.startsWith("video/")) {
    throw new Error("Choose a video file.");
  }
  const displayName = sanitizeDisplayName(file.name);
  const hash = await sha256([displayName, file.size, file.lastModified, file.type].join("|"));
  const objectUrl = win.URL.createObjectURL(file);
  return normalizeVideoSource({
    displayName,
    localVideoIdentifier: `local-video-${hash.slice(0, 40)}`,
    durationMs: 0,
    fileSizeBytes: file.size,
    objectUrl,
  });
}

export function revokeLocalVideoReference(reference, win = window) {
  if (reference?.objectUrl) win.URL.revokeObjectURL(reference.objectUrl);
}
