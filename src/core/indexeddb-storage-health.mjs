import { snapshotProtectionReason, measureStoredRow } from './snapshot-protection-diagnostic.mjs';

const databases = [
  { name: "football-science-data-safety-v1", label: "Safety and Sessions", stores: ["snapshots", "latest", "offline-operations-v1"] },
  { name: "football-science-library-v1", label: "Exercise Library", stores: ["baselines", "pending", "recovery", "access"] },
  { name: "football-science-medical-drafts-v1", label: "Medical recovery", stores: ["drafts", "catalog"] },
  { name: "football-science-snapshots-compact-v1", label: "Additional saved copies", stores: ["versions", "blocks"] },
];
const category = (labels, status, fallback) => Object.hasOwn(labels, status) ? labels[status] : fallback;
const empty = (label, status) => ({ label, status, records: 0, totalRecords: status === "absent" ? 0 : null,
  approximateJsonUtf16Bytes: 0, binaryBytes: 0, groups: [], protection: [], stores: [], unknownStores: 0, stoppedBecause: null });
const storeLabels = { snapshots: "Safety snapshots and recovery", latest: "Safety latest copies and Sessions edits",
  "offline-operations-v1": "Shared operations", baselines: "Library read cache", pending: "Library pending and review edits",
  recovery: "Library recovery originals", access: "Library access metadata", drafts: "Medical retained drafts", catalog: "Medical recovery metadata",
  versions: "Compact versions", blocks: "Compact content blocks" };

function classify(store, row) {
  if (store === 'versions') return row?.format === 1 && ['standalone', 'pooled'].includes(row.mode)
    ? 'Compact versions retained (integrity not checked)' : 'Unknown compact versions retained';
  if (store === 'blocks') return 'Compact content blocks retained (references not checked)';
  if (store === "catalog") return "Medical recovery metadata";
  if (store === "drafts") return "Medical retained drafts";
  if (store === "snapshots") return row?.reason === "session-planner-recovery-review" ? "Sessions recovery snapshots"
    : row?.reason === "session-planner-quota-fallback" ? "Sessions fallback snapshots" : "Safety snapshots";
  if (store === "latest") {
    if (!String(row?.id || "").startsWith("session-save:")) return "Safety latest copies";
    return category({ pending: "Sessions pending edits", review: "Sessions review edits", archived: "Sessions archived edits" }, row.status, "Sessions unclassified edits");
  }
  if (store === "offline-operations-v1") return category({ pending: "Shared pending operations", review: "Shared review operations", applied: "Shared applied operations" }, row?.status, "Shared unclassified operations");
  if (store === "pending") return row?.status === "review" ? "Library review edits" : row?.status === "pending" ? "Library pending edits" : "Library unclassified edits";
  return { baselines: "Library read cache", recovery: "Library recovery originals", access: "Library access metadata" }[store];
}

// Counts and approximate serialized sizes only. Never use the write-capable
// connection helper here: an inspection must never commit a schema upgrade.
// If a database vanishes after enumeration, abort its open. WebKit can retain
// a version-zero metadata placeholder even after that native abort; do not delete it.
function inspectDatabase(factory, spec, { timeoutMs, maxRecords, maxBytes, snapshotPolicy }) {
  return new Promise(resolve => {
    const report = empty(spec.label, "complete"), groups = new Map(), protection = new Map(), pinned = new Set();
    let database, transaction, request, ended = false;
    const finish = (status, stoppedBecause = null) => {
      if (ended) return;
      ended = true; clearTimeout(timer);
      report.status = status; report.stoppedBecause = stoppedBecause; report.groups = [...groups.values()];
      report.protection = [...protection.values()];
      if (!report.unknownStores && report.stores.length && report.stores.every(store => Number.isInteger(store.totalRecords)))
        report.totalRecords = report.stores.reduce((total, store) => total + store.totalRecords, 0);
      if (status !== "complete") { try { transaction?.abort(); } catch {} }
      database?.close(); resolve(report);
    };
    const timer = setTimeout(() => finish("partial", "timeout"), timeoutMs);
    try {
      request = factory.open(spec.name); // No version: never request an upgrade.
      request.onupgradeneeded = () => { request.transaction.abort(); };
      request.onerror = request.onblocked = () => finish("unavailable");
      request.onsuccess = () => {
        database = request.result;
        if (ended) { database.close(); return; }
        database.onversionchange = () => finish("partial");
        const stores = spec.stores.filter(name => database.objectStoreNames.contains(name));
        report.unknownStores = [...database.objectStoreNames].filter(name => !spec.stores.includes(name)).length;
        if (!stores.length) { finish("unavailable"); return; }
        try {
          transaction = database.transaction(stores, "readonly");
          transaction.oncomplete = () => finish(report.unknownStores ? 'partial' : 'complete', report.unknownStores ? 'unknown-stores' : null);
          transaction.onerror = transaction.onabort = () => finish("partial");
          // Count every known store before materializing any values. A large
          // snapshot can exhaust the byte budget; unread edits must stay visible
          // as unclassified rows, never become an implied zero pending count.
          report.stores = stores.map(name => ({ label: storeLabels[name], totalRecords: null, scannedRecords: 0 }));
          for (const [index, store] of stores.entries()) {
            const count = transaction.objectStore(store).count();
            count.onsuccess = () => { if (!ended) report.stores[index].totalRecords = count.result; };
            count.onerror = () => finish("partial");
          }
          if (stores.includes('snapshots') && stores.includes('latest')) {
            const latest = transaction.objectStore('latest').get('latest');
            latest.onsuccess = () => {
              if (ended) return;
              if (typeof latest.result?.sourceSnapshotId === 'string') pinned.add(latest.result.sourceSnapshotId);
              for (const ref of Array.isArray(latest.result?.recentSnapshotRefs) ? latest.result.recentSnapshotRefs : [])
                if (typeof ref?.id === 'string') pinned.add(ref.id);
            };
            latest.onerror = () => finish('partial');
          }
          for (const [index, store] of stores.entries()) {
            const cursorRequest = transaction.objectStore(store).openCursor();
            cursorRequest.onerror = () => finish("partial");
            cursorRequest.onsuccess = () => {
              if (ended) return;
              const cursor = cursorRequest.result;
              if (!cursor) return;
              if (report.records >= maxRecords) { finish("partial", "records"); return; }
              if (report.approximateJsonUtf16Bytes + report.binaryBytes >= maxBytes) { finish("partial", "bytes"); return; }
              try {
                const { approximateJsonUtf16Bytes: bytes, binaryBytes } = measureStoredRow(cursor.value);
                const label = classify(store, cursor.value);
                const add = (map, label) => {
                  const group = map.get(label) || { label, records: 0, approximateJsonUtf16Bytes: 0, binaryBytes: 0 };
                  group.records++; group.approximateJsonUtf16Bytes += bytes; group.binaryBytes += binaryBytes; map.set(label, group);
                };
                add(groups, label);
                if (store === 'snapshots') add(protection, snapshotProtectionReason(cursor.value, {
                  policy: stores.includes('latest') ? snapshotPolicy : undefined, pinned }));
                report.records++; report.stores[index].scannedRecords++; report.approximateJsonUtf16Bytes += bytes; report.binaryBytes += binaryBytes;
                cursor.continue();
              } catch { finish("partial"); }
            };
          }
        } catch { finish("unavailable"); }
      };
    } catch { finish("unavailable"); }
  });
}

export async function collectIndexedDbStorageHealth({ indexedDB, timeoutMs = 2000, maxRecords = 3000, maxBytes = 100 * 1024 * 1024, snapshotPolicy } = {}) {
  const unavailable = () => ({ status: "unavailable", databases: databases.map(spec => empty(spec.label, "unavailable")) });
  if (!indexedDB?.databases) return unavailable();
  let timer, available;
  try {
    available = await Promise.race([indexedDB.databases(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error()), timeoutMs);
    })]);
    if (!Array.isArray(available)) return unavailable();
  } catch { return unavailable(); }
  finally { clearTimeout(timer); }
  const rows = await Promise.all(databases.map(spec => available.some(row => row.name === spec.name)
    ? inspectDatabase(indexedDB, spec, { timeoutMs, maxRecords, maxBytes, snapshotPolicy }) : empty(spec.label, "absent")));
  return { status: rows.every(row => ["complete", "absent"].includes(row.status)) ? "complete" : "partial", databases: rows };
}
