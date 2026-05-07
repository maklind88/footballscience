export const storageAdapterKinds = Object.freeze({
  legacyAppState: "legacy-app-state",
  futureDatabase: "future-database",
});

export function createReadOnlyStorageAdapter({ kind = storageAdapterKinds.legacyAppState, read }) {
  if (typeof read !== "function") {
    throw new TypeError("A read-only storage adapter requires a read function.");
  }

  return Object.freeze({
    kind,
    async read(key) {
      return read(String(key || "").trim());
    },
    async write() {
      throw new Error("This adapter is read-only. Use the existing app write path until a module is migrated.");
    },
    async remove() {
      throw new Error("This adapter is read-only. Destructive migration paths must be explicit.");
    },
  });
}

