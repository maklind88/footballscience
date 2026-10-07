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
export function storeDistinctSnapshot(database, snapshotStore, latestStore, snapshot) {
  return new Promise((resolve, reject) => {
    let result, failure;
    const transaction = database.transaction([snapshotStore, latestStore], "readwrite");
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(failure || transaction.error || new Error("Snapshot transaction failed."));
    transaction.onabort = () => reject(failure || transaction.error || new Error("Snapshot transaction aborted."));
    const latest = transaction.objectStore(latestStore);
    const read = latest.get("latest");
    const append = () => {
      transaction.objectStore(snapshotStore).put(snapshot);
      latest.put({ ...snapshot, id: "latest", sourceSnapshotId: snapshot.id });
      result = { written: true, createdAt: snapshot.createdAt };
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
