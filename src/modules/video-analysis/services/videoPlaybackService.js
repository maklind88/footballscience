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
      return `This ${container || "video"} uses a ${codecLabel} profile this browser cannot play. Prepare a local H.264 playback copy.`;
    }
    if (container === "MP4" || container === "MOV" || container === "M4V") {
      return `This ${container} has a video stream this browser cannot play. Prepare a local H.264 playback copy.`;
    }
    return "This browser cannot play that video stream. Prepare a local H.264 playback copy.";
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
