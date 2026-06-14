import { normalizeVideoSource } from "../domain/videoSource.model.js";

const localVideoFiles = new Map();

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
  if (codec === "hvc1" || codec === "hev1" || codec === "hvcc") {
    return "This file appears to use HEVC/H.265. Most web browsers cannot play that reliably here. Convert it to MP4/H.264 or use the desktop bridge/transcode workflow.";
  }
  if (codec === "apch" || codec === "apcn" || codec === "apcs" || codec === "apco" || codec === "ap4h") {
    return "This file appears to use Apple ProRes. Web playback needs an MP4/H.264 version or a local transcode workflow.";
  }
  return "";
}

function detectCodecFromText(text = "") {
  const source = String(text || "").toLowerCase();
  for (const codec of ["hvc1", "hev1", "hvcc", "apch", "apcn", "apcs", "apco", "ap4h", "avc1", "avc3", "avcc", "vp09", "vp08", "av01", "mp4v"]) {
    if (source.includes(codec)) return codec;
  }
  return "";
}

function codecLabel(codec = "") {
  const labels = {
    av01: "AV1",
    avc1: "H.264",
    avc3: "H.264",
    avcc: "H.264",
    hvc1: "HEVC/H.265",
    hev1: "HEVC/H.265",
    hvcc: "HEVC/H.265",
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
  const fileSize = Number(file.size || 0);
  if (!fileSize) return "";
  const probeSize = Math.min(fileSize, 2 * 1024 * 1024);
  const decoder = new TextDecoder("latin1");
  const offsets = new Set([0, Math.max(0, fileSize - probeSize)]);
  const sampleCount = Math.min(24, Math.max(2, Math.ceil(fileSize / (64 * 1024 * 1024))));
  for (let index = 1; index < sampleCount; index += 1) {
    offsets.add(Math.max(0, Math.floor((fileSize - probeSize) * (index / sampleCount))));
  }
  let text = "";
  for (const offset of offsets) {
    const chunk = await file.slice(offset, Math.min(fileSize, offset + probeSize)).arrayBuffer();
    text += decoder.decode(chunk);
    if (detectCodecFromText(text)) break;
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
  const extension = fileExtension(file?.name);
  const knownVideoExtension = ["mp4", "mov", "m4v", "webm", "avi", "mkv"].includes(extension);
  if (!file?.type?.startsWith("video/") && !knownVideoExtension) {
    throw new Error("Choose a video file.");
  }
  const displayName = sanitizeDisplayName(file.name);
  const hash = await sha256([displayName, file.size, file.lastModified, file.type].join("|"));
  const playbackCompatibility = await detectPlaybackCompatibility(file, win);
  const objectUrl = win.URL.createObjectURL(file);
  const reference = normalizeVideoSource({
    displayName,
    localVideoIdentifier: `local-video-${hash.slice(0, 40)}`,
    durationMs: 0,
    fileSizeBytes: file.size,
    mimeType: String(file.type || ""),
    extension,
    playbackCompatibility,
    objectUrl,
  });
  localVideoFiles.set(reference.localVideoIdentifier, file);
  return reference;
}

export function getLocalVideoFile(reference = {}) {
  return localVideoFiles.get(reference.localVideoIdentifier) || null;
}

export function revokeLocalVideoReference(reference, win = window) {
  if (reference?.objectUrl?.startsWith("blob:")) win.URL.revokeObjectURL(reference.objectUrl);
  if (reference?.localVideoIdentifier) localVideoFiles.delete(reference.localVideoIdentifier);
}
