// Readers open the installed version; only a schema owner requests an upgrade.
export function createLocalDatabaseConnection({ indexedDB, getIndexedDB = () => indexedDB, databaseName, version, stores }) {
  let opening = null;

  function open() {
    if (opening) return opening;
    const attempt = new Promise((resolve, reject) => {
      const factory = getIndexedDB();
      if (!factory) { reject(new Error("IndexedDB is not available.")); return; }
      let cancelled = false;
      const request = version === undefined ? factory.open(databaseName) : factory.open(databaseName, version);
      request.onblocked = () => {
        cancelled = true;
        reject(new Error("Local storage upgrade is blocked. Close other platform tabs and retry."));
      };
      request.onupgradeneeded = () => {
        // A rejected blocked request must not upgrade storage later in the background.
        if (cancelled) { request.transaction.abort(); return; }
        for (const { name, keyPath } of stores) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath });
        }
      };
      request.onerror = () => reject(request.error || new Error("Local storage could not open."));
      request.onsuccess = () => {
        const database = request.result;
        if (cancelled) { database.close(); return; }
        const release = () => {
          database.close();
          if (opening === attempt) opening = null;
        };
        database.onversionchange = release;
        database.onclose = release;
        try {
          for (const { name, keyPath } of stores) {
            if (!database.objectStoreNames.contains(name)
              || database.transaction(name).objectStore(name).keyPath !== keyPath) {
              throw new Error(`Local storage schema is incompatible: ${name}.`);
            }
          }
          resolve(database);
        } catch (error) { release(); reject(error); }
      };
    });
    opening = attempt;
    attempt.catch(() => { if (opening === attempt) opening = null; });
    return attempt;
  }

  async function close() {
    const attempt = opening;
    if (!attempt) return;
    try { (await attempt).close(); }
    finally { if (opening === attempt) opening = null; }
  }

  return { open, close };
}
