import {
  clearCachedThumbnails,
  clipThumbnailTimeMs,
  generateClipThumbnail,
  getCachedThumbnail,
  pruneThumbnailCache,
  saveCachedThumbnail,
  thumbnailCacheKey,
  thumbnailCacheStats,
} from "../services/localThumbnailCacheService.js";
import { presentationQueue } from "../services/presentationService.js";

const thumbnailBatchLimit = 80;

function thumbnailCandidateClips(state = {}) {
  const sourceClips = Array.isArray(state.presentation?.sourceClips) ? state.presentation.sourceClips : [];
  const queueClips = presentationQueue(state.presentation?.current || {})
    .map((item) => item.clip)
    .filter(Boolean);
  const seen = new Set();
  return [...queueClips, ...sourceClips].filter((clip) => {
    const id = clip?.id || clip?.clipId || clip?.clip_instance_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, thumbnailBatchLimit);
}

export function createThumbnailController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getWindow = options.getWindow || (() => window);
  const thumbnailRequests = new Set();
  let pruneRequested = false;

  async function refreshStats() {
    try {
      const stats = await thumbnailCacheStats(getWindow());
      updateState((state) => ({
        ...state,
        presentation: {
          ...(state.presentation || {}),
          thumbnailCache: stats,
        },
      }));
      return stats;
    } catch {
      return null;
    }
  }

  function ensureThumbnails() {
    const state = getState();
    const videoRef = state.videoRef || {};
    if (!videoRef.objectUrl || !videoRef.localVideoIdentifier) return false;
    if (!pruneRequested) {
      pruneRequested = true;
      pruneThumbnailCache(getWindow())
        .then(refreshStats)
        .catch(() => null);
    }
    for (const clip of thumbnailCandidateClips(state)) {
      const key = thumbnailCacheKey(videoRef, clip);
      if (!key || state.presentation?.thumbnails?.[key] || thumbnailRequests.has(key)) continue;
      thumbnailRequests.add(key);
      const win = getWindow();
      getCachedThumbnail(key, win)
        .then((cached) => cached || generateClipThumbnail(videoRef, clip, win))
        .then(async (dataUrl) => {
          if (!dataUrl || !dataUrl.startsWith("data:image/")) return;
          if (!state.presentation?.thumbnails?.[key]) {
            await saveCachedThumbnail(key, {
              dataUrl,
              localVideoIdentifier: videoRef.localVideoIdentifier,
              clipId: clip.id || clip.clipId || clip.clip_instance_id,
              timestampMs: clipThumbnailTimeMs(clip),
            }, win).catch(() => null);
          }
          updateState((current) => ({
            ...current,
            presentation: {
              ...(current.presentation || {}),
              thumbnails: {
                ...(current.presentation?.thumbnails || {}),
                [key]: dataUrl,
              },
            },
          }));
        })
        .catch(() => null)
        .finally(() => thumbnailRequests.delete(key));
    }
    return true;
  }

  async function clearCache() {
    try {
      await clearCachedThumbnails(getWindow());
      updateState((state) => ({
        ...state,
        message: "Thumbnail cache cleared.",
        presentation: {
          ...(state.presentation || {}),
          thumbnails: {},
          thumbnailCache: { count: 0, bytes: 0, maxItems: 0, maxBytes: 0 },
        },
      }));
      return true;
    } catch (error) {
      updateState((state) => ({
        ...state,
        presentation: {
          ...(state.presentation || {}),
          error: error.message || "Could not clear thumbnail cache.",
        },
      }));
      return false;
    }
  }

  return {
    clearCache,
    ensureThumbnails,
    refreshStats,
  };
}
