export const offlineOperationStoreName = "offline-operations-v1";
const schemaVersion = 1;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function recordId(scope, id) {
  return `${scope}\u0000${id}`;
}

function normalizeOperation(operation = {}) {
  const id = normalizeText(operation.id);
  const scope = normalizeText(operation.scope);
  const moduleId = normalizeText(operation.moduleId);
  const key = normalizeText(operation.key);
  const type = normalizeText(operation.type);
  const createdAt = Number(operation.createdAt);
  if (!id || !scope || !moduleId || !key || !type || !Number.isFinite(createdAt)) return null;
  return {
    baseRevision: Number.isInteger(Number(operation.baseRevision)) ? Number(operation.baseRevision) : null,
    createdAt,
    id,
    key,
    moduleId,
    payload: clone(operation.payload ?? {}),
    recordId: recordId(scope, id),
    scope,
    schema: schemaVersion,
    status: ["pending", "review", "applied"].includes(operation.status) ? operation.status : "pending",
    type,
  };
}

export function createOfflineOperationJournal(options = {}) {
  const indexedDB = options.indexedDB ?? globalThis.indexedDB;
  const databaseName = normalizeText(options.databaseName) || "football-science-data-safety-v1";
  const now = typeof options.now === "function" ? options.now : Date.now;
  let opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!indexedDB) {
        reject(new Error("Offline operation storage is unavailable."));
        return;
      }
      const request = indexedDB.open(databaseName, 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const storeName of ["snapshots", "latest", offlineOperationStoreName]) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: storeName === offlineOperationStoreName ? "recordId" : "id" });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error || new Error("Offline operation storage could not open."));
      };
    });
    return opening;
  }

  async function transact(mode, action) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(offlineOperationStoreName, mode);
      const request = action(transaction.objectStore(offlineOperationStoreName));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error || new Error("Offline operation storage failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline operation storage was cancelled."));
    });
  }

  async function close() {
    const currentOpening = opening;
    if (!currentOpening) return;
    const database = await currentOpening;
    database.close();
    if (opening === currentOpening) {
      opening = null;
    }
  }

  async function put(operation = {}) {
    const normalized = normalizeOperation({ ...operation, createdAt: operation.createdAt ?? now() });
    if (!normalized) throw new Error("Offline operation requires an id, scope, module, key, type, and timestamp.");
    await transact("readwrite", (store) => store.put(normalized));
    return normalized;
  }

  async function list(scope, options = {}) {
    const expectedScope = normalizeText(scope);
    if (!expectedScope) return [];
    const includeApplied = Boolean(options.includeApplied);
    const rows = await transact("readonly", (store) => store.getAll());
    return (rows || [])
      .map(normalizeOperation)
      .filter((row) => row && row.scope === expectedScope && (includeApplied || row.status !== "applied"))
      .sort((first, second) => first.createdAt - second.createdAt || first.id.localeCompare(second.id));
  }

  async function updateStatus(id, scope, status) {
    const expectedId = normalizeText(id);
    const expectedScope = normalizeText(scope);
    if (!expectedId || !expectedScope || !["pending", "review", "applied"].includes(status)) return false;
    const database = await open();
    const updated = await new Promise((resolve, reject) => {
      const transaction = database.transaction(offlineOperationStoreName, "readwrite");
      const store = transaction.objectStore(offlineOperationStoreName);
      let changed = false;
      const request = store.get(recordId(expectedScope, expectedId));
      request.onsuccess = () => {
        const existing = normalizeOperation(request.result);
        if (existing?.scope === expectedScope) {
          store.put({ ...existing, status });
          changed = true;
        }
      };
      transaction.oncomplete = () => resolve(changed);
      transaction.onerror = () => reject(transaction.error || new Error("Offline operation status could not update."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline operation status was cancelled."));
    });
    return updated;
  }

  return Object.freeze({ close, list, open, put, updateStatus });
}
