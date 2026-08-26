import {
  MAX_LOCAL_TRACKING_SCOPE_BYTES,
  MAX_LOCAL_TRACKING_TRACKS_PER_SCOPE,
  LocalTrackingWorkspaceError,
  createLocalTrackingTrackBundle,
  createLocalTrackingWorkspaceScope,
  hydrateLocalTrackingTrack,
  localTrackingTrackRecordId,
} from "./localTrackingWorkspaceContract.js";

const databaseName = "football-science-local-tracking-workspaces";
const databaseVersion = 1;
const trackStoreName = "tracks";
const chunkStoreName = "chunks";

function openDatabase(win = globalThis.window) {
  if (!win?.indexedDB?.open) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open the local tracking workspace."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tracks = db.objectStoreNames.contains(trackStoreName)
        ? request.transaction.objectStore(trackStoreName)
        : db.createObjectStore(trackStoreName, { keyPath: "id" });
      if (!tracks.indexNames.contains("scope")) tracks.createIndex("scope", "scopeId", { unique: false });
      if (!tracks.indexNames.contains("updated")) tracks.createIndex("updated", "updatedAt", { unique: false });
      const chunks = db.objectStoreNames.contains(chunkStoreName)
        ? request.transaction.objectStore(chunkStoreName)
        : db.createObjectStore(chunkStoreName, { keyPath: "id" });
      if (!chunks.indexNames.contains("scope")) chunks.createIndex("scope", "scopeId", { unique: false });
      if (!chunks.indexNames.contains("track")) chunks.createIndex("track", "trackRecordId", { unique: false });
    };
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Local tracking workspace request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Local tracking workspace transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local tracking workspace transaction was aborted."));
  });
}

function keyRange(win, value) {
  const KeyRange = win?.IDBKeyRange || globalThis.IDBKeyRange;
  if (!KeyRange?.only) throw new Error("IndexedDB key ranges are unavailable in this browser.");
  return KeyRange.only(value);
}

async function deleteTrackRecord(trackStore, chunkStore, recordId, win) {
  if (!recordId) return;
  const chunkKeys = await requestPromise(chunkStore.index("track").getAllKeys(keyRange(win, recordId)));
  chunkKeys.forEach((key) => chunkStore.delete(key));
  trackStore.delete(recordId);
}

export async function saveLocalTrackingTrack(scopeValue = {}, trackValue = {}, options = {}) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const bundle = createLocalTrackingTrackBundle({
    scope,
    track: trackValue,
    syncStatus: options.syncStatus,
  }, { now: options.now });
  const previousTrackId = String(options.previousTrackId || "").trim();
  const previousRecordId = previousTrackId && previousTrackId !== bundle.record.trackId
    ? localTrackingTrackRecordId(scope, previousTrackId)
    : "";
  const db = await openDatabase(options.win || globalThis.window);
  const win = options.win || globalThis.window;
  try {
    const transaction = db.transaction([trackStoreName, chunkStoreName], "readwrite");
    const completed = transactionDone(transaction);
    const trackStore = transaction.objectStore(trackStoreName);
    const chunkStore = transaction.objectStore(chunkStoreName);
    const existing = await requestPromise(trackStore.index("scope").getAll(keyRange(win, scope.id)));
    const retained = existing.filter((record) => (
      record.id !== bundle.record.id && record.id !== previousRecordId
    ));
    if (retained.length >= MAX_LOCAL_TRACKING_TRACKS_PER_SCOPE) {
      throw new LocalTrackingWorkspaceError(
        "This clip contains too many locally retained tracks.",
        "LOCAL_TRACKING_WORKSPACE_LIMIT",
      );
    }
    const nextBytes = retained.reduce((total, record) => total + Math.max(0, Number(record.serializedSize) || 0), 0)
      + bundle.record.serializedSize;
    if (nextBytes > MAX_LOCAL_TRACKING_SCOPE_BYTES) {
      throw new LocalTrackingWorkspaceError(
        "This local tracking workspace is too large.",
        "LOCAL_TRACKING_WORKSPACE_LIMIT",
      );
    }
    await deleteTrackRecord(trackStore, chunkStore, bundle.record.id, win);
    await deleteTrackRecord(trackStore, chunkStore, previousRecordId, win);
    trackStore.put(bundle.record);
    bundle.chunks.forEach((chunk) => chunkStore.put(chunk));
    await completed;
    return hydrateLocalTrackingTrack(bundle.record, bundle.chunks);
  } finally {
    db.close?.();
  }
}

export async function loadLocalTrackingTracks(scopeValue = {}, win = globalThis.window) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const db = await openDatabase(win);
  try {
    const transaction = db.transaction([trackStoreName, chunkStoreName], "readonly");
    const trackStore = transaction.objectStore(trackStoreName);
    const chunkStore = transaction.objectStore(chunkStoreName);
    const recordsRequest = trackStore.index("scope").getAll(keyRange(win, scope.id));
    const chunksRequest = chunkStore.index("scope").getAll(keyRange(win, scope.id));
    const [records, chunks] = await Promise.all([
      requestPromise(recordsRequest),
      requestPromise(chunksRequest),
    ]);
    if (records.length > MAX_LOCAL_TRACKING_TRACKS_PER_SCOPE
      || records.reduce((total, record) => total + Math.max(0, Number(record.serializedSize) || 0), 0)
        > MAX_LOCAL_TRACKING_SCOPE_BYTES) {
      throw new LocalTrackingWorkspaceError(
        "The local tracking workspace exceeds its safety limits.",
        "LOCAL_TRACKING_WORKSPACE_LIMIT",
      );
    }
    const chunksByTrack = new Map();
    chunks.forEach((chunk) => {
      const values = chunksByTrack.get(chunk.trackRecordId) || [];
      values.push(chunk);
      chunksByTrack.set(chunk.trackRecordId, values);
    });
    return records
      .map((record) => hydrateLocalTrackingTrack(record, chunksByTrack.get(record.id) || []))
      .sort((first, second) => first.track.startMs - second.track.startMs || first.track.id.localeCompare(second.track.id));
  } finally {
    db.close?.();
  }
}

export async function removeLocalTrackingTrack(scopeValue = {}, trackId = "", win = globalThis.window) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const db = await openDatabase(win);
  try {
    const transaction = db.transaction([trackStoreName, chunkStoreName], "readwrite");
    const completed = transactionDone(transaction);
    await deleteTrackRecord(
      transaction.objectStore(trackStoreName),
      transaction.objectStore(chunkStoreName),
      localTrackingTrackRecordId(scope, trackId),
      win,
    );
    await completed;
    return true;
  } finally {
    db.close?.();
  }
}
