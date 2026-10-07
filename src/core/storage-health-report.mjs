import { inspectLibraryMirror } from "./library-storage-diagnostic.mjs";
async function boundedRead(read) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(read), new Promise(resolve => {
      timer = setTimeout(() => resolve(undefined), 1500);
    })]);
  } finally { clearTimeout(timer); }
}

// Read-only diagnostics: never return keys, values, identities or error messages.
export async function collectStorageHealth({ storage, storageLabels = {}, storageKey = "football-data-safety-v1", scope = "", navigatorRef = {} }) {
  const groups = new Map();
  const report = { approximateUtf16Bytes: 0, entries: 0, partial: false, modules: [],
    pendingForCurrentScope: null, recoveryCopies: 0, originUsageBytes: null, originQuotaBytes: null, persistent: null };
  try {
    const length = storage.length;
    for (let index = 0; index < length; index++) {
      const key = storage.key(index);
      if (typeof key !== "string") { report.partial = true; continue; }
      const value = storage.getItem(key);
      if (typeof value !== "string") { report.partial = true; continue; }
      const recovery = key.startsWith(`${storageKey}:recovery:`);
      const label = recovery ? "Recovery copies" : key === storageKey ? "Save metadata"
        : Object.hasOwn(storageLabels, key) ? storageLabels[key] : "Other browser storage";
      const bytes = (key.length + value.length) * 2;
      const group = groups.get(label) || { label, entries: 0, approximateUtf16Bytes: 0 };
      group.entries++; group.approximateUtf16Bytes += bytes; groups.set(label, group);
      report.entries++; report.approximateUtf16Bytes += bytes;
      if (recovery) report.recoveryCopies++;
      if (key === storageKey && scope) {
        try {
          const entries = JSON.parse(value)?.entries;
          if (entries && typeof entries === "object" && !Array.isArray(entries)) {
            report.pendingForCurrentScope = Object.values(entries).filter(entry => entry?.principalScope === scope && entry.pendingCentralSync === true).length;
          } else report.partial = true;
        } catch { report.partial = true; }
      }
    }
    if (storage.length !== length) report.partial = true;
  } catch { report.partial = true; }
  report.libraryMirror = inspectLibraryMirror(storage);
  report.modules = [...groups.values()].sort((a, b) => b.approximateUtf16Bytes - a.approximateUtf16Bytes);
  const [estimate, persistence] = await Promise.allSettled([
    boundedRead(() => navigatorRef.storage?.estimate?.()),
    boundedRead(() => navigatorRef.storage?.persisted?.()),
  ]);
  if (estimate.status === "fulfilled") {
    for (const [source, target] of [["usage", "originUsageBytes"], ["quota", "originQuotaBytes"]]) {
      if (Number.isFinite(estimate.value?.[source]) && estimate.value[source] >= 0) report[target] = estimate.value[source];
    }
  }
  if (persistence.status === "fulfilled" && typeof persistence.value === "boolean") report.persistent = persistence.value;
  return report;
}
