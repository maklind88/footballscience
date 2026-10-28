import { equalSnapshotValue } from "./snapshot-content-equality.mjs";
import { canReplaceSnapshot } from "./snapshot-replacement-proof.mjs";
import { canRotateSnapshot, isDedicatedRecoveryKey, planSnapshotRetirement, snapshotBytes, snapshotBudgetError } from "./snapshot-retention-policy.mjs";

// Compare the recoverable contents, never only a short hash or the snapshot time.
// New recovery metadata must create a new snapshot even when module values match.
export function sameSnapshotContents(previous, next) {
  if (!previous || !next || previous.schema !== next.schema || previous.app !== next.app) return false;
  const fields = ["storage", "recoveryCopies", "recoverySeparations", "recoveryState", "saveContext"];
  if (!fields.every(field => Object.hasOwn(previous, field) && Object.hasOwn(next, field) &&
    equalSnapshotValue(previous[field], next[field]))) return false;
  const ignored = new Set([...fields, "id", "schema", "app", "createdAt", "reason", "source", "summary", "sourceSnapshotId"]);
  const additional = value => Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.has(key)));
  return equalSnapshotValue(additional(previous), additional(next));
}

function hasExactBacking(previous, backing) {
  if (!backing) return false;
  const { id: previousId, sourceSnapshotId, ...previousContents } = previous;
  const { id: backingId, ...backingContents } = backing;
  return JSON.stringify(previousContents) === JSON.stringify(backingContents);
}

// Retirements and both replacement copies commit together. An aborted insertion
// rolls back every deletion; no separate pre-cleanup can destroy the last copy.
function transactSnapshots(database, snapshotStore, latestStore, snapshot, options) {
  return new Promise((resolve, reject) => {
    let result, failure;
    const transaction = database.transaction([snapshotStore, latestStore], "readwrite");
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => { failure ||= transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error("Snapshot transaction aborted."));
    const history = transaction.objectStore(snapshotStore), latest = transaction.objectStore(latestStore);
    const abort = error => { failure = error; transaction.abort(); };
    const read = latest.get("latest");
    read.onsuccess = () => {
      try {
        const previous = read.result;
        if (typeof previous?.sourceSnapshotId !== "string" || !previous.sourceSnapshotId) {
          scan(previous, null); return;
        }
        const backing = history.get(previous.sourceSnapshotId);
        backing.onsuccess = () => {
          try {
            if (snapshot && typeof previous.createdAt === "string" && previous.createdAt &&
                sameSnapshotContents(previous, snapshot) && sameSnapshotContents(backing.result, snapshot)) {
              result = { written: false, createdAt: previous.createdAt }; return;
            }
            scan(previous, backing.result);
          } catch (error) { abort(error); }
        };
      } catch (error) { abort(error); }
    };

    function scan(previous, backing) {
      const scope = (snapshot || previous)?.saveContext?.scope;
      const nextLatest = snapshot ? { ...snapshot, id: "latest", sourceSnapshotId: snapshot.id } : previous;
      // Preserve a sole latest copy before replacing it. Unknown legacy shapes are
      // protected too; same-content repair already carries the recoverable payload.
      const orphan = snapshot && previous && !hasExactBacking(previous, backing) && !sameSnapshotContents(previous, snapshot)
        ? { ...previous, id: `snapshot-orphan:${snapshot.id}`, retainedOrphan: true } : null;
      const rows = [];
      let inspected = 0;
      const cursorRequest = history.openKeyCursor();
      cursorRequest.onsuccess = () => {
        try {
          const cursor = cursorRequest.result;
          if (!cursor) { commit(rows, nextLatest, orphan); return; }
          if (++inspected > 4096) throw snapshotBudgetError();
          if (snapshot && (cursor.primaryKey === snapshot.id || cursor.primaryKey === orphan?.id)) {
            throw new Error("Snapshot identity already exists; existing work was retained.");
          }
          // Sessions recovery belongs to its owner, outside the rotating cache
          // budget. Do not materialize, delete or rewrite those rows.
          if (isDedicatedRecoveryKey(cursor.primaryKey)) { cursor.continue(); return; }
          const request = history.get(cursor.primaryKey);
          request.onsuccess = () => {
            try {
              const value = request.result;
              rows.push({ id: cursor.primaryKey, bytes: snapshotBytes(value),
                rotatable: (canRotateSnapshot(value, scope) || (snapshot && canReplaceSnapshot(value, snapshot))) &&
                  (Boolean(snapshot) || cursor.primaryKey !== previous?.sourceSnapshotId) });
              cursor.continue();
            } catch (error) { abort(error); }
          };
        } catch (error) { abort(error); }
      };
    }

    function commit(rows, nextLatest, orphan) {
      if (orphan) rows.push({ id: orphan.id, bytes: snapshotBytes(orphan), rotatable: false });
      if (snapshot) rows.push({ id: snapshot.id, bytes: snapshotBytes(snapshot), rotatable: false });
      const retire = planSnapshotRetirement(rows, nextLatest ? snapshotBytes(nextLatest) : 0, options);
      retire.forEach(id => history.delete(id));
      if (orphan) history.add(orphan);
      if (snapshot) {
        history.add(snapshot);
        latest.put(nextLatest);
        result = { written: true, createdAt: snapshot.createdAt };
      } else result = { retired: retire.length };
    }
  });
}

export function storeDistinctSnapshot(database, snapshotStore, latestStore, snapshot, options = {}) {
  return transactSnapshots(database, snapshotStore, latestStore, snapshot, options);
}

export function pruneSnapshotHistory(database, snapshotStore, latestStore, options = {}) {
  return transactSnapshots(database, snapshotStore, latestStore, null, options);
}
