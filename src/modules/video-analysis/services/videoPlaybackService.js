export function formatVideoTime(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getVideoCurrentMs(videoElement) {
  return Math.max(0, Math.round(Number(videoElement?.currentTime || 0) * 1000));
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
