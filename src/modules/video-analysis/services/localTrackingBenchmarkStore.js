import {
  createTrackingBenchmarkWorkspaceScope,
  validateTrackingBenchmarkWorkspaceArtifact,
} from "./trackingBenchmarkWorkspaceService.js";

const databaseName = "football-science-tracking-benchmarks";
const storeName = "workspaces";
const databaseVersion = 1;

function openDatabase(win = globalThis.window) {
  if (!win?.indexedDB?.open) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open the local tracking benchmark store."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(storeName)
        ? request.transaction.objectStore(storeName)
        : db.createObjectStore(storeName, { keyPath: "id" });
      if (!store.indexNames.contains("scope")) {
        store.createIndex("scope", ["scope.organizationId", "scope.teamId", "scope.userId"], { unique: false });
      }
      if (!store.indexNames.contains("updated")) store.createIndex("updated", "updatedAt", { unique: false });
    };
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("IndexedDB benchmark request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB benchmark transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB benchmark transaction was aborted."));
  });
}

export async function saveLocalTrackingBenchmarkWorkspace(value = {}, win = globalThis.window) {
  const artifact = validateTrackingBenchmarkWorkspaceArtifact(value);
  const db = await openDatabase(win);
  try {
    const transaction = db.transaction(storeName, "readwrite");
    const completed = transactionDone(transaction);
    await requestPromise(transaction.objectStore(storeName).put(artifact));
    await completed;
    return artifact;
  } finally {
    db.close?.();
  }
}

export async function getLocalTrackingBenchmarkWorkspace(scopeValue = {}, win = globalThis.window) {
  const scope = createTrackingBenchmarkWorkspaceScope(scopeValue);
  const db = await openDatabase(win);
  try {
    const value = await requestPromise(db.transaction(storeName).objectStore(storeName).get(scope.id));
    if (!value) return null;
    const artifact = validateTrackingBenchmarkWorkspaceArtifact(value);
    if (artifact.scope.organizationId !== scope.organizationId
      || artifact.scope.teamId !== scope.teamId
      || artifact.scope.userId !== scope.userId
      || artifact.scope.sourceType !== scope.sourceType
      || artifact.scope.sourceId !== scope.sourceId) {
      throw new Error("Local tracking benchmark scope isolation failed.");
    }
    return artifact;
  } finally {
    db.close?.();
  }
}

export async function removeLocalTrackingBenchmarkWorkspace(scopeValue = {}, win = globalThis.window) {
  const scope = createTrackingBenchmarkWorkspaceScope(scopeValue);
  const db = await openDatabase(win);
  try {
    const transaction = db.transaction(storeName, "readwrite");
    const completed = transactionDone(transaction);
    await requestPromise(transaction.objectStore(storeName).delete(scope.id));
    await completed;
    return true;
  } finally {
    db.close?.();
  }
}
