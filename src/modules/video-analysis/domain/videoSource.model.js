export function normalizeVideoSource(value = {}) {
  const compatibility = value.playbackCompatibility || value.playback_compatibility || {};
  return {
    id: String(value.id || ""),
    matchId: String(value.matchId || value.match_id || ""),
    videoId: String(value.videoId || value.video_id || ""),
    displayName: String(value.displayName || value.display_name || value.title || "Local video"),
    localVideoIdentifier: String(value.localVideoIdentifier || value.local_video_identifier || ""),
    durationMs: Math.max(0, Math.round(Number(value.durationMs || value.duration_ms || 0)) || 0),
    fileSizeBytes: Math.max(0, Math.round(Number(value.fileSizeBytes || value.file_size_bytes || 0)) || 0),
    mimeType: String(value.mimeType || value.mime_type || ""),
    extension: String(value.extension || ""),
    playbackCompatibility: {
      status: String(compatibility.status || "unknown"),
      container: String(compatibility.container || ""),
      codec: String(compatibility.codec || ""),
      codecLabel: String(compatibility.codecLabel || compatibility.codec_label || ""),
      canPlay: Boolean(compatibility.canPlay),
      warning: String(compatibility.warning || ""),
    },
    objectUrl: String(value.objectUrl || ""),
    loadedAt: String(value.loadedAt || new Date().toISOString()),
  };
}
