import {
  MAX_LOCAL_TRACKING_CORRECTIONS_PER_SCOPE,
  MAX_LOCAL_TRACKING_CORRECTION_SCOPE_BYTES,
  createLocalTrackingCorrectionRecord,
  hydrateLocalTrackingCorrectionRecord,
  localTrackingCorrectionRecordId,
  trackingCorrectionApiPayload,
} from "./localTrackingCorrectionOutboxContract.js";
import {
  LocalTrackingWorkspaceError,
  createLocalTrackingWorkspaceScope,
} from "./localTrackingWorkspaceContract.js";
import {
  LOCAL_TRACKING_CORRECTION_STORE,
  localTrackingKeyRange,
  localTrackingRequest,
  localTrackingTransaction,
  openLocalTrackingDatabase,
} from "./localTrackingWorkspaceDatabase.js";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function saveLocalTrackingCorrection(scopeValue = {}, correctionValue = {}, options = {}) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const record = createLocalTrackingCorrectionRecord({ ...correctionValue, scope }, { now: options.now });
  const win = options.win || globalThis.window;
  const db = await openLocalTrackingDatabase(win);
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([LOCAL_TRACKING_CORRECTION_STORE], "readwrite");
      const store = transaction.objectStore(LOCAL_TRACKING_CORRECTION_STORE);
      const request = store.index("scope").getAll(localTrackingKeyRange(win, scope.id));
      let failure = null;
      request.onerror = () => {
        failure = request.error || new Error("Local tracking correction queue could not be read.");
        transaction.abort();
      };
      request.onsuccess = () => {
        try {
          const existing = request.result.map(hydrateLocalTrackingCorrectionRecord);
          const previous = existing.find((entry) => entry.id === record.id);
          if (previous && canonicalJson(trackingCorrectionApiPayload(previous))
            !== canonicalJson(trackingCorrectionApiPayload(record))) {
            throw new LocalTrackingWorkspaceError(
              "This tracking correction operation id already protects different content.",
              "LOCAL_TRACKING_CORRECTION_CONFLICT",
            );
          }
          const retained = existing.filter((entry) => entry.id !== record.id);
          if (retained.length >= MAX_LOCAL_TRACKING_CORRECTIONS_PER_SCOPE) {
            throw new LocalTrackingWorkspaceError(
              "This tracking correction queue is full.",
              "LOCAL_TRACKING_CORRECTION_LIMIT",
            );
          }
          const nextBytes = retained.reduce(
            (total, entry) => total + entry.serializedSize,
            record.serializedSize,
          );
          if (nextBytes > MAX_LOCAL_TRACKING_CORRECTION_SCOPE_BYTES) {
            throw new LocalTrackingWorkspaceError(
              "This tracking correction queue is too large.",
              "LOCAL_TRACKING_CORRECTION_LIMIT",
            );
          }
          store.put(record);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(failure || transaction.error
        || new Error("Local tracking correction queue could not be updated."));
      transaction.onabort = () => reject(failure || transaction.error
        || new Error("Local tracking correction queue update was aborted."));
    });
    return hydrateLocalTrackingCorrectionRecord(record);
  } finally {
    db.close?.();
  }
}

export async function loadLocalTrackingCorrections(scopeValue = {}, win = globalThis.window) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const db = await openLocalTrackingDatabase(win);
  try {
    const transaction = db.transaction([LOCAL_TRACKING_CORRECTION_STORE], "readonly");
    const values = await localTrackingRequest(
      transaction.objectStore(LOCAL_TRACKING_CORRECTION_STORE)
        .index("scope").getAll(localTrackingKeyRange(win, scope.id)),
    );
    if (values.length > MAX_LOCAL_TRACKING_CORRECTIONS_PER_SCOPE
      || values.reduce((total, entry) => total + Math.max(0, Number(entry.serializedSize) || 0), 0)
        > MAX_LOCAL_TRACKING_CORRECTION_SCOPE_BYTES) {
      throw new LocalTrackingWorkspaceError(
        "The local tracking correction queue exceeds its safety limits.",
        "LOCAL_TRACKING_CORRECTION_LIMIT",
      );
    }
    return values.map(hydrateLocalTrackingCorrectionRecord)
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
  } finally {
    db.close?.();
  }
}

export async function removeLocalTrackingCorrection(
  scopeValue = {},
  operationId = "",
  win = globalThis.window,
) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const db = await openLocalTrackingDatabase(win);
  try {
    const transaction = db.transaction([LOCAL_TRACKING_CORRECTION_STORE], "readwrite");
    const completed = localTrackingTransaction(transaction);
    transaction.objectStore(LOCAL_TRACKING_CORRECTION_STORE)
      .delete(localTrackingCorrectionRecordId(scope, operationId));
    await completed;
    return true;
  } finally {
    db.close?.();
  }
}

export async function migrateLocalTrackingCorrectionTrackId(
  scopeValue = {},
  previousTrackId = "",
  trackId = "",
  options = {},
) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const entries = await loadLocalTrackingCorrections(scope, options.win || globalThis.window);
  const migrated = entries.filter((entry) => entry.objectTrackId === previousTrackId)
    .map((entry) => createLocalTrackingCorrectionRecord({
      ...entry,
      scope,
      objectTrackId: trackId,
      updatedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    }));
  if (!migrated.length) return 0;
  const db = await openLocalTrackingDatabase(options.win || globalThis.window);
  try {
    const transaction = db.transaction([LOCAL_TRACKING_CORRECTION_STORE], "readwrite");
    const completed = localTrackingTransaction(transaction);
    const store = transaction.objectStore(LOCAL_TRACKING_CORRECTION_STORE);
    migrated.forEach((entry) => store.put(entry));
    await completed;
    return migrated.length;
  } finally {
    db.close?.();
  }
}
