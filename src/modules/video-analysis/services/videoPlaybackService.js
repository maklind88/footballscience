export function formatVideoTime(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getVideoCurrentMs(videoElement) {
  return Math.max(0, Math.round(Number(videoElement?.currentTime || 0) * 1000));
}

export function describeVideoPlaybackError(videoElement, videoReference = {}) {
  const code = Number(videoElement?.error?.code || 0);
  if (code === 1) return "Video playback was cancelled.";
  if (code === 2) return "The local video could not be read by the browser.";
  if (code === 3) return "The local video is damaged or uses an unsupported encoding.";
  if (code === 4) {
    const container = String(videoReference?.playbackCompatibility?.container || videoReference?.extension || "").toUpperCase();
    const codecLabel = String(videoReference?.playbackCompatibility?.codecLabel || "").trim();
    if (codecLabel) {
      return `This ${container || "video"} file uses ${codecLabel}, but this browser cannot play that exact codec/profile. Convert it locally to MP4/H.264 or use the desktop bridge/transcode workflow.`;
    }
    if (container === "MP4" || container === "MOV" || container === "M4V") {
      return `This is a ${container} container, but the video stream inside is not browser-playable here. It may be HEVC/H.265, ProRes, or another unsupported profile. Convert it locally to MP4/H.264 or use the desktop bridge/transcode workflow.`;
    }
    return "This browser cannot play that video stream. Convert it locally to MP4/H.264 or use the desktop bridge/transcode workflow.";
  }
  return "";
}

export function seekVideoToMs(videoElement, ms = 0) {
  if (!videoElement) return;
  videoElement.currentTime = Math.max(0, Number(ms || 0) / 1000);
  videoElement.focus?.();
}

export function toggleVideoPlayback(videoElement) {
  if (!videoElement) return Promise.resolve(false);
  if (videoElement.paused) {
    return videoElement.play().then(() => true).catch(() => false);
  }
  videoElement.pause();
  return Promise.resolve(false);
}
