export const LOCAL_TRACKING_DATABASE_NAME = "football-science-local-tracking-workspaces";
export const LOCAL_TRACKING_DATABASE_VERSION = 2;
export const LOCAL_TRACKING_TRACK_STORE = "tracks";
export const LOCAL_TRACKING_CHUNK_STORE = "chunks";
export const LOCAL_TRACKING_CORRECTION_STORE = "corrections";

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

export function openLocalTrackingDatabase(win = globalThis.window) {
  if (!win?.indexedDB?.open) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(LOCAL_TRACKING_DATABASE_NAME, LOCAL_TRACKING_DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error("Could not open the local tracking workspace."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tracks = db.objectStoreNames.contains(LOCAL_TRACKING_TRACK_STORE)
        ? request.transaction.objectStore(LOCAL_TRACKING_TRACK_STORE)
        : db.createObjectStore(LOCAL_TRACKING_TRACK_STORE, { keyPath: "id" });
      ensureIndex(tracks, "scope", "scopeId");
      ensureIndex(tracks, "updated", "updatedAt");
      const chunks = db.objectStoreNames.contains(LOCAL_TRACKING_CHUNK_STORE)
        ? request.transaction.objectStore(LOCAL_TRACKING_CHUNK_STORE)
        : db.createObjectStore(LOCAL_TRACKING_CHUNK_STORE, { keyPath: "id" });
      ensureIndex(chunks, "scope", "scopeId");
      ensureIndex(chunks, "track", "trackRecordId");
      const corrections = db.objectStoreNames.contains(LOCAL_TRACKING_CORRECTION_STORE)
        ? request.transaction.objectStore(LOCAL_TRACKING_CORRECTION_STORE)
        : db.createObjectStore(LOCAL_TRACKING_CORRECTION_STORE, { keyPath: "id" });
      ensureIndex(corrections, "scope", "scopeId");
      ensureIndex(corrections, "track", "objectTrackId");
      ensureIndex(corrections, "updated", "updatedAt");
    };
  });
}

export function localTrackingRequest(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Local tracking workspace request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

export function localTrackingTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Local tracking workspace transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local tracking workspace transaction was aborted."));
  });
}

export function localTrackingKeyRange(win, value) {
  const KeyRange = win?.IDBKeyRange || globalThis.IDBKeyRange;
  if (!KeyRange?.only) throw new Error("IndexedDB key ranges are unavailable in this browser.");
  return KeyRange.only(value);
}
