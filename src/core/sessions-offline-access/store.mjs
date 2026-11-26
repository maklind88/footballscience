const permissionDatabase = "football-science-sessions-offline-access-v1";
const permissionStore = "permission";

export function openExistingSessionsDatabase(indexedDB, name, { createStore } = {}) {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      if (blocked || !createStore) request.transaction.abort();
      else request.result.createObjectStore(createStore);
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Offline Sessions storage is blocked."));
    };
    request.onerror = () => reject(request.error || new Error("Offline Sessions storage could not open."));
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

export async function readSessionsOfflinePermission(indexedDB) {
  const database = await openExistingSessionsDatabase(indexedDB, permissionDatabase);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(permissionStore, "readonly");
      const request = transaction.objectStore(permissionStore).get("current");
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error("Offline Sessions permission could not be read."));
    });
  } finally {
    database.close();
  }
}

export async function writeSessionsOfflinePermission(indexedDB, value, isCurrent) {
  const database = await openExistingSessionsDatabase(indexedDB, permissionDatabase, { createStore: permissionStore });
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(permissionStore, "readwrite", { durability: "strict" });
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error("Offline Sessions permission was not stored durably."));
      if (transaction.durability !== "strict" || !isCurrent()) { transaction.abort(); return; }
      const store = transaction.objectStore(permissionStore);
      if (value === null) store.delete("current");
      else store.put(value, "current");
    });
  } finally {
    database.close();
  }
}
