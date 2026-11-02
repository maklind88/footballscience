import { prepareSnapshotRetention, permitsExactSnapshotReplacement } from "./snapshot-retention.mjs";
import { snapshotBudget, snapshotBytes, snapshotBudgetError, isSessionRecoverySnapshot } from "./snapshot-budget.mjs";

// Compare the recoverable contents, never only a short hash or the snapshot time.
// New recovery metadata must create a new snapshot even when module values match.
export function sameSnapshotContents(previous, next) {
  if (!previous || previous.schema !== next.schema || previous.app !== next.app) return false;
  const fields = ["storage", "recoveryCopies", "recoverySeparations", "recoveryState", "saveContext"];
  if (!fields.every(field => Object.hasOwn(previous, field) && Object.hasOwn(next, field) &&
      JSON.stringify(previous[field]) === JSON.stringify(next[field]))) return false;
  // A future recovery field must not silently disappear through today's dedup path.
  const incidental = new Set(['id', 'createdAt', 'reason', 'source', 'sourceSnapshotId', 'retention']);
  const contents = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...contents].filter(field => !incidental.has(field) && !fields.includes(field)).every(field =>
    Object.hasOwn(previous, field) === Object.hasOwn(next, field) &&
    JSON.stringify(previous[field]) === JSON.stringify(next[field]));
}

// Read/compare/write share a transaction so two tabs cannot both append the same
// consecutive snapshot. Success means transaction completion, not request success.
export function storeDistinctSnapshot(database, snapshotStore, latestStore, snapshot, options = {}) {
  return new Promise((resolve, reject) => {
    let result, failure;
    const budget = snapshotBudget(options);
    // Capture once before yielding to IndexedDB; caller mutations must not change
    // the measured payload or the eligibility proof while the transaction waits.
    snapshot = prepareSnapshotRetention(structuredClone(snapshot));
    const transaction = database.transaction([snapshotStore, latestStore], "readwrite");
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(failure || transaction.error || new Error("Snapshot transaction failed."));
    transaction.onabort = () => reject(failure || transaction.error || new Error("Snapshot transaction aborted."));
    const latest = transaction.objectStore(latestStore);
    const read = latest.get("latest");
    const fail = error => { failure = error; transaction.abort(); };
    const append = () => {
      const latestCopy = { ...snapshot, id: "latest", sourceSnapshotId: snapshot.id };
      const copyBytes = snapshotBytes(snapshot), latestBytes = snapshotBytes(latestCopy);
      if (copyBytes > budget.maxSnapshotBytes || latestBytes > budget.maxSnapshotBytes) {
        fail(snapshotBudgetError());
        return;
      }
      const history = transaction.objectStore(snapshotStore);
      let count = 1, bytes = copyBytes + latestBytes;
      let replacementBytes = 0;
      const replacements = [];
      const mayReplace = permitsExactSnapshotReplacement(snapshot);
      const previous = read.result;
      // Never overwrite an orphaned latest copy containing different recovery work.
      let previousPreserved = !previous || sameSnapshotContents(previous, snapshot);
      const scan = history.openCursor();
      scan.onsuccess = () => {
        try {
          const cursor = scan.result;
          if (cursor) {
            const row = cursor.value;
            if (cursor.primaryKey === snapshot.id) throw new Error("Snapshot identity already exists. Existing copies were kept.");
            if (!isSessionRecoverySnapshot(row)) count++;
            const rowBytes = snapshotBytes(row);
            bytes += rowBytes;
            // Exact recoverable contents AND summary must survive in the new copy.
            // Pending flags or hash equality alone never authorize retirement.
            if (mayReplace && permitsExactSnapshotReplacement(row) && sameSnapshotContents(row, snapshot) &&
                JSON.stringify(row.summary) === JSON.stringify(snapshot.summary)) {
              replacements.push({ key: cursor.primaryKey, bytes: rowBytes });
              replacementBytes += rowBytes;
            }
            if (cursor.primaryKey === previous?.sourceSnapshotId && sameSnapshotContents(row, previous)) previousPreserved = true;
            if (count - replacements.length > budget.maxSnapshots || bytes - replacementBytes > budget.maxTotalBytes) {
              fail(snapshotBudgetError());
              return;
            }
            cursor.continue();
            return;
          }
          const retire = [];
          for (const replacement of replacements) {
            if (count <= budget.maxSnapshots && bytes <= budget.maxTotalBytes) break;
            retire.push(replacement.key);
            count--;
            bytes -= replacement.bytes;
          }
          if (count > budget.maxSnapshots || bytes > budget.maxTotalBytes) throw snapshotBudgetError();
          if (!previousPreserved) throw new Error("Extra local history paused: the previous latest copy needs recovery. Existing copies were kept.");
          // Deletions and replacement commit together; any quota/write failure rolls
          // back all of them. Never free space in a separate transaction first.
          retire.forEach(key => history.delete(key));
          history.add(snapshot);
          latest.put(latestCopy);
          result = { written: true, createdAt: snapshot.createdAt };
        } catch (error) { fail(error); }
      };
    };
    read.onsuccess = () => {
      try {
        const previous = read.result;
        if (typeof previous?.sourceSnapshotId !== "string" || !previous.sourceSnapshotId ||
            typeof previous.createdAt !== "string" || !previous.createdAt || !sameSnapshotContents(previous, snapshot)) {
          append();
          return;
        }
        const history = transaction.objectStore(snapshotStore).get(previous.sourceSnapshotId);
        history.onsuccess = () => {
          try {
            if (sameSnapshotContents(history.result, snapshot)) result = { written: false, createdAt: previous.createdAt };
            else append();
          } catch (error) { failure = error; transaction.abort(); }
        };
      } catch (error) { failure = error; transaction.abort(); }
    };
  });
}
