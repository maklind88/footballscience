import { snapshotBudget, snapshotBytes, snapshotBudgetError, isSessionRecoverySnapshot } from "./snapshot-budget.mjs";

// Compare the recoverable contents, never only a short hash or the snapshot time.
// New recovery metadata must create a new snapshot even when module values match.
export function sameSnapshotContents(previous, next) {
  if (!previous || previous.schema !== next.schema || previous.app !== next.app) return false;
  const fields = ["storage", "recoveryCopies", "recoverySeparations", "recoveryState", "saveContext"];
  return fields.every(field => Object.hasOwn(previous, field) && Object.hasOwn(next, field) &&
    JSON.stringify(previous[field]) === JSON.stringify(next[field]));
}

// Read/compare/write share a transaction so two tabs cannot both append the same
// consecutive snapshot. Success means transaction completion, not request success.
export function storeDistinctSnapshot(database, snapshotStore, latestStore, snapshot, options = {}) {
  return new Promise((resolve, reject) => {
    let result, failure;
    const budget = snapshotBudget(options);
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
            bytes += snapshotBytes(row);
            if (cursor.primaryKey === previous?.sourceSnapshotId && sameSnapshotContents(row, previous)) previousPreserved = true;
            if (count > budget.maxSnapshots || bytes > budget.maxTotalBytes) {
              fail(snapshotBudgetError());
              return;
            }
            cursor.continue();
            return;
          }
          if (count > budget.maxSnapshots || bytes > budget.maxTotalBytes) throw snapshotBudgetError();
          if (!previousPreserved) throw new Error("Extra local history paused: the previous latest copy needs recovery. Existing copies were kept.");
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
