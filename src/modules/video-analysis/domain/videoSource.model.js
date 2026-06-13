export function normalizeVideoSource(value = {}) {
  return {
    id: String(value.id || ""),
    matchId: String(value.matchId || value.match_id || ""),
    videoId: String(value.videoId || value.video_id || ""),
    displayName: String(value.displayName || value.display_name || value.title || "Local video"),
    localVideoIdentifier: String(value.localVideoIdentifier || value.local_video_identifier || ""),
    durationMs: Math.max(0, Math.round(Number(value.durationMs || value.duration_ms || 0)) || 0),
    fileSizeBytes: Math.max(0, Math.round(Number(value.fileSizeBytes || value.file_size_bytes || 0)) || 0),
    objectUrl: String(value.objectUrl || ""),
    loadedAt: String(value.loadedAt || new Date().toISOString()),
  };
}
