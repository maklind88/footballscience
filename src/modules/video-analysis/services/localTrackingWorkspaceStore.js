import {
  MAX_LOCAL_TRACKING_SCOPE_BYTES,
  MAX_LOCAL_TRACKING_TRACKS_PER_SCOPE,
  LocalTrackingWorkspaceError,
  createLocalTrackingTrackBundle,
  createLocalTrackingWorkspaceScope,
  hydrateLocalTrackingTrack,
  localTrackingTrackRecordId,
} from "./localTrackingWorkspaceContract.js";
import {
  LOCAL_TRACKING_CHUNK_STORE,
  LOCAL_TRACKING_TRACK_STORE,
  localTrackingKeyRange,
  localTrackingRequest,
  localTrackingTransaction,
  openLocalTrackingDatabase,
} from "./localTrackingWorkspaceDatabase.js";

async function deleteTrackRecord(trackStore, chunkStore, recordId, win) {
  if (!recordId) return;
  const chunkKeys = await localTrackingRequest(
    chunkStore.index("track").getAllKeys(localTrackingKeyRange(win, recordId)),
  );
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
  const db = await openLocalTrackingDatabase(options.win || globalThis.window);
  const win = options.win || globalThis.window;
  try {
    const transaction = db.transaction([LOCAL_TRACKING_TRACK_STORE, LOCAL_TRACKING_CHUNK_STORE], "readwrite");
    const completed = localTrackingTransaction(transaction);
    const trackStore = transaction.objectStore(LOCAL_TRACKING_TRACK_STORE);
    const chunkStore = transaction.objectStore(LOCAL_TRACKING_CHUNK_STORE);
    const existing = await localTrackingRequest(
      trackStore.index("scope").getAll(localTrackingKeyRange(win, scope.id)),
    );
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
  const db = await openLocalTrackingDatabase(win);
  try {
    const transaction = db.transaction([LOCAL_TRACKING_TRACK_STORE, LOCAL_TRACKING_CHUNK_STORE], "readonly");
    const trackStore = transaction.objectStore(LOCAL_TRACKING_TRACK_STORE);
    const chunkStore = transaction.objectStore(LOCAL_TRACKING_CHUNK_STORE);
    const recordsRequest = trackStore.index("scope").getAll(localTrackingKeyRange(win, scope.id));
    const chunksRequest = chunkStore.index("scope").getAll(localTrackingKeyRange(win, scope.id));
    const [records, chunks] = await Promise.all([
      localTrackingRequest(recordsRequest),
      localTrackingRequest(chunksRequest),
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
  const db = await openLocalTrackingDatabase(win);
  try {
    const transaction = db.transaction([LOCAL_TRACKING_TRACK_STORE, LOCAL_TRACKING_CHUNK_STORE], "readwrite");
    const completed = localTrackingTransaction(transaction);
    await deleteTrackRecord(
      transaction.objectStore(LOCAL_TRACKING_TRACK_STORE),
      transaction.objectStore(LOCAL_TRACKING_CHUNK_STORE),
      localTrackingTrackRecordId(scope, trackId),
      win,
    );
    await completed;
    return true;
  } finally {
    db.close?.();
  }
}
