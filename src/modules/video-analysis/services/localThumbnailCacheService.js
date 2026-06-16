const databaseName = "football-science-video-thumbnails";
const storeName = "clipThumbnails";
const databaseVersion = 1;

function text(value = "") {
  return String(value || "").trim();
}

function hasIndexedDb(win = window) {
  return Boolean(win?.indexedDB?.open);
}

function openDatabase(win = window) {
  if (!hasIndexedDb(win)) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open thumbnail cache."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(storeName)
        ? request.transaction.objectStore(storeName)
        : db.createObjectStore(storeName, { keyPath: "id" });
      if (!store.indexNames.contains("video")) store.createIndex("video", "localVideoIdentifier", { unique: false });
      if (!store.indexNames.contains("updated")) store.createIndex("updated", "updatedAt", { unique: false });
    };
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("IndexedDB thumbnail request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionStore(db, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export function clipThumbnailTimeMs(clip = {}) {
  const startMs = Number(clip.startMs ?? clip.start_ms ?? 0);
  const endMs = Number(clip.endMs ?? clip.end_ms ?? startMs + 1500);
  const offset = Math.min(1500, Math.max(0, endMs - startMs) / 3);
  return Math.max(0, Math.round((Number.isFinite(startMs) ? startMs : 0) + offset));
}

export function thumbnailCacheKey(videoRef = {}, clip = {}) {
  const identifier = text(videoRef.localVideoIdentifier || videoRef.local_video_identifier);
  const clipId = text(clip.id || clip.clipId || clip.clip_instance_id || clip.clipInstanceId);
  if (!identifier || !clipId) return "";
  return [identifier, clipId, clipThumbnailTimeMs(clip)].join("::");
}

export async function getCachedThumbnail(key = "", win = window) {
  if (!key) return "";
  const db = await openDatabase(win);
  try {
    const record = await requestPromise(transactionStore(db).get(key));
    return record?.dataUrl || "";
  } finally {
    db.close?.();
  }
}

export async function saveCachedThumbnail(key = "", values = {}, win = window) {
  if (!key || !values.dataUrl) return null;
  const db = await openDatabase(win);
  try {
    const record = {
      id: key,
      localVideoIdentifier: text(values.localVideoIdentifier),
      clipId: text(values.clipId),
      timestampMs: Math.max(0, Math.round(Number(values.timestampMs || 0))),
      dataUrl: values.dataUrl,
      updatedAt: new Date().toISOString(),
    };
    await requestPromise(transactionStore(db, "readwrite").put(record));
    return record;
  } finally {
    db.close?.();
  }
}

function waitForEvent(target, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    }
    function onEvent() {
      cleanup();
      resolve();
    }
    function onError() {
      cleanup();
      reject(new Error("Could not read local video thumbnail."));
    }
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

export async function generateClipThumbnail(videoRef = {}, clip = {}, win = window) {
  if (!videoRef?.objectUrl || !win?.document?.createElement) return "";
  const timestampMs = clipThumbnailTimeMs(clip);
  const video = win.document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = videoRef.objectUrl;
  await waitForEvent(video, "loadedmetadata", 6000);
  const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  video.currentTime = durationSeconds ? Math.min(durationSeconds - 0.05, timestampMs / 1000) : timestampMs / 1000;
  await waitForEvent(video, "seeked", 6000);
  const canvas = win.document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 135;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
