import { normalizeVideoSource } from "../domain/videoSource.model.js";

function sanitizeDisplayName(value = "") {
  return String(value || "Local video")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Local video";
}

function fileExtension(name = "") {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function playbackWarningForCodec(codec = "") {
  if (codec === "hvc1" || codec === "hev1") {
    return "This file appears to use HEVC/H.265. Most web browsers cannot play that reliably here. Convert it to MP4/H.264 or use the desktop bridge/transcode workflow.";
  }
  if (codec === "apch" || codec === "apcn" || codec === "apcs" || codec === "apco" || codec === "ap4h") {
    return "This file appears to use Apple ProRes. Web playback needs an MP4/H.264 version or a local transcode workflow.";
  }
  return "";
}

function detectCodecFromText(text = "") {
  const source = String(text || "");
  for (const codec of ["avc1", "hvc1", "hev1", "vp09", "vp08", "av01", "mp4v", "apch", "apcn", "apcs", "apco", "ap4h"]) {
    if (source.includes(codec)) return codec;
  }
  return "";
}

function codecLabel(codec = "") {
  const labels = {
    av01: "AV1",
    avc1: "H.264",
    hvc1: "HEVC/H.265",
    hev1: "HEVC/H.265",
    vp08: "VP8",
    vp09: "VP9",
    mp4v: "MPEG-4 Visual",
    apch: "Apple ProRes",
    apcn: "Apple ProRes",
    apcs: "Apple ProRes",
    apco: "Apple ProRes",
    ap4h: "Apple ProRes",
  };
  return labels[codec] || "";
}

function containerFromExtension(extension = "", mimeType = "") {
  if (mimeType.includes("webm") || extension === "webm") return "webm";
  if (mimeType.includes("quicktime") || extension === "mov") return "mov";
  if (mimeType.includes("mp4") || ["mp4", "m4v"].includes(extension)) return "mp4";
  return extension || "";
}

function canPlayCodec(win, mimeType = "", codec = "") {
  const video = win.document?.createElement?.("video");
  if (!video?.canPlayType) return false;
  if (mimeType && codec) return Boolean(video.canPlayType(`${mimeType}; codecs="${codec}"`));
  if (mimeType) return Boolean(video.canPlayType(mimeType));
  return false;
}

async function readCodecProbeText(file) {
  const probeSize = Math.min(Number(file.size || 0), 8 * 1024 * 1024);
  if (!probeSize) return "";
  const head = await file.slice(0, probeSize).arrayBuffer();
  const decoder = new TextDecoder("latin1");
  let text = decoder.decode(head);
  if (file.size > probeSize) {
    const tailStart = Math.max(0, file.size - probeSize);
    const tail = await file.slice(tailStart, file.size).arrayBuffer();
    text += decoder.decode(tail);
  }
  return text;
}

async function detectPlaybackCompatibility(file, win = window) {
  const extension = fileExtension(file.name);
  const mimeType = String(file.type || "");
  const container = containerFromExtension(extension, mimeType);
  let codec = "";
  try {
    codec = detectCodecFromText(await readCodecProbeText(file));
  } catch {
    codec = "";
  }
  const warning = playbackWarningForCodec(codec);
  const canPlay = canPlayCodec(win, mimeType, codec);
  const status = warning ? "unsupported" : canPlay ? "supported" : codec ? "uncertain" : "unknown";
  return {
    status,
    container,
    codec,
    codecLabel: codecLabel(codec),
    canPlay,
    warning,
  };
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
  const playbackCompatibility = await detectPlaybackCompatibility(file, win);
  const objectUrl = win.URL.createObjectURL(file);
  return normalizeVideoSource({
    displayName,
    localVideoIdentifier: `local-video-${hash.slice(0, 40)}`,
    durationMs: 0,
    fileSizeBytes: file.size,
    mimeType: String(file.type || ""),
    extension: fileExtension(file.name),
    playbackCompatibility,
    objectUrl,
  });
}

export function revokeLocalVideoReference(reference, win = window) {
  if (reference?.objectUrl) win.URL.revokeObjectURL(reference.objectUrl);
}
