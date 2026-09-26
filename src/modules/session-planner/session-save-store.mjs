import { createLocalDatabaseConnection } from "../../core/local-database-connection.mjs";

const prefix = "session-save:";

export function createSessionSaveStore({ indexedDB = globalThis.indexedDB } = {}) {
  const { open } = createLocalDatabaseConnection({ indexedDB, databaseName: "football-science-data-safety-v1",
    stores: ["snapshots", "latest"].map((name) => ({ name, keyPath: "id" })) });
  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("latest", mode);
      const request = action(transaction.objectStore("latest"));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Local save was cancelled."));
    });
  }
  return {
    async archiveLocal(value, context) {
      if (!context?.scope || typeof value !== "string") return;
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const id = `football-session-planner-v3-quota-fallback:${encodeURIComponent(context.scope)}:review:cache:${hash}`;
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite"), snapshots = tx.objectStore("snapshots");
        const request = snapshots.get(id);
        request.onsuccess = () => {
          if (!request.result) snapshots.put({ id, reason: "session-planner-recovery-review", createdAt: new Date().toISOString(), recovery: { scope: context.scope, baseRevision: context.revision }, storage: { "football-session-planner-v3": value } });
        };
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("Local archive failed."));
      });
    },
    // Pending/review rows deliberately live outside the rotating snapshot store.
    put: (record) => transact("readwrite", (store) => store.put({ ...record, id: `${prefix}${record.change.id}` })),
    replaceWithRebased: (original, rebased) => transact("readwrite", (store) => {
      const request = store.get(`${prefix}${original.change.id}`);
      request.onsuccess = () => {
        const current = request.result;
        if (current?.status !== "pending" || current.scope !== original.scope ||
            current.writer !== original.writer || current.createdAt !== original.createdAt ||
            JSON.stringify(current.change) !== JSON.stringify(original.change)) {
          request.transaction.abort();
          return;
        }
        store.put({ ...original, id: `${prefix}${original.change.id}`, status: "archived", resolvedAt: new Date().toISOString() });
        store.put({ ...rebased, id: `${prefix}${rebased.change.id}` });
      };
      return request;
    }),
    remove: (id) => transact("readwrite", (store) => store.delete(`${prefix}${id}`)),
    async list(scope) {
      const rows = await transact("readonly", (store) => store.getAll());
      return (rows || []).filter((row) => row.id?.startsWith(prefix) && row.scope === scope)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    },
  };
}
