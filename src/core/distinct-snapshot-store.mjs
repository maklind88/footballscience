// Compare the recoverable contents, never only a short hash or the snapshot time.
// New recovery metadata must create a new snapshot even when module values match.
export function sameSnapshotContents(previous, next) {
  if (!previous || previous.schema !== next.schema || previous.app !== next.app) return false;
  const fields = ["storage", "recoveryCopies", "recoverySeparations", "recoveryState", "saveContext"];
  // Only known capture/display fields and our lookup hints may be ignored.
  // Unknown future metadata is conservative recovery content, not decoration.
  const descriptive = new Set(["id", "createdAt", "reason", "source", "summary", "sourceSnapshotId", "recentSnapshotRefs"]);
  const compared = new Set([...fields, ...Object.keys(previous), ...Object.keys(next)].filter(field => !descriptive.has(field)));
  return [...compared].every(field => Object.hasOwn(previous, field) && Object.hasOwn(next, field) &&
    JSON.stringify(previous[field]) === JSON.stringify(next[field]));
}

// A bounded hint on the existing latest row avoids scanning large historical
// payloads. History rows and exported backup envelopes keep their old format.
// Old clients can drop the hint: that only loses deduplication, never recovery.
const referenceLimit = 8;
function recentReferences(previous) {
  const rows = Array.isArray(previous?.recentSnapshotRefs) ? previous.recentSnapshotRefs.slice(0, referenceLimit) : [];
  const scope = previous?.saveContext?.scope;
  const candidates = [{ scope, id: previous?.sourceSnapshotId }, ...rows];
  const seen = new Set();
  return candidates.filter(row => {
    if (typeof row?.scope !== "string" || !row.scope || typeof row.id !== "string" || !row.id || seen.has(row.scope)) return false;
    seen.add(row.scope); return true;
  }).slice(0, referenceLimit).map(({ scope, id }) => ({ scope, id }));
}

// Read/compare/write share a transaction, including verification of the actual
// referenced history row. Hints or hashes alone never prove recoverable content.
// Success means transaction completion, not request success.
export function storeDistinctSnapshot(database, snapshotStore, latestStore, snapshot) {
  return new Promise((resolve, reject) => {
    let result, failure, previous, references;
    const transaction = database.transaction([snapshotStore, latestStore], "readwrite");
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(failure || transaction.error || new Error("Snapshot transaction failed."));
    transaction.onabort = () => reject(failure || transaction.error || new Error("Snapshot transaction aborted."));
    const latest = transaction.objectStore(latestStore);
    const read = latest.get("latest");
    const pointTo = row => {
      const scope = row.saveContext?.scope;
      const recentSnapshotRefs = typeof scope === "string" && scope
        ? [{ scope, id: row.id }, ...references.filter(ref => ref.scope !== scope)].slice(0, referenceLimit)
        : references;
      latest.put({ ...row, id: "latest", sourceSnapshotId: row.id, recentSnapshotRefs });
    };
    const append = () => {
      transaction.objectStore(snapshotStore).put(snapshot);
      pointTo(snapshot);
      result = { written: true, createdAt: snapshot.createdAt };
    };
    const reuse = row => {
      if (typeof row?.id !== "string" || !row.id || typeof row.createdAt !== "string" || !row.createdAt ||
          !sameSnapshotContents(row, snapshot)) return false;
      pointTo(row);
      result = { written: false, createdAt: row.createdAt };
      return true;
    };
    const findUnhintedScope = () => {
      // The eight hints are an optimization, not a reason to duplicate unchanged
      // recovery data forever. Bound this exceptional lookup by rows and bytes;
      // an exhausted budget appends normally and never deletes or retags history.
      let records = 0, bytes = 0;
      const request = transaction.objectStore(snapshotStore).openCursor(null, "prev");
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor) { append(); return; }
          const row = cursor.value;
          bytes += (JSON.stringify(row)?.length || 0) * 2;
          records++;
          if (bytes > 8 * 1024 * 1024) { append(); return; }
          if (row?.id === cursor.primaryKey && row?.saveContext?.scope === snapshot.saveContext.scope && reuse(row)) return;
          if (records >= 32) { append(); return; }
          cursor.continue();
        } catch (error) { failure = error; transaction.abort(); }
      };
    };
    read.onsuccess = () => {
      try {
        previous = read.result;
        references = recentReferences(previous);
        const consecutive = typeof previous?.sourceSnapshotId === "string" && previous.sourceSnapshotId &&
          typeof previous.createdAt === "string" && previous.createdAt && sameSnapshotContents(previous, snapshot);
        const sourceId = consecutive ? previous.sourceSnapshotId
          : references.find(ref => ref.scope === snapshot.saveContext?.scope)?.id;
        if (!sourceId) {
          if (references.length === referenceLimit && typeof snapshot.saveContext?.scope === "string" && snapshot.saveContext.scope)
            findUnhintedScope();
          else append();
          return;
        }
        const history = transaction.objectStore(snapshotStore).get(sourceId);
        history.onsuccess = () => {
          try {
            const row = history.result;
            if (row?.id === sourceId && typeof row.createdAt === "string" && row.createdAt && sameSnapshotContents(row, snapshot)) {
              // Keep the legacy full latest copy current for all existing readers.
              // An unchanged consecutive copy needs no write at all.
              if (!consecutive) pointTo(row);
              result = { written: false, createdAt: row.createdAt };
            } else append();
          } catch (error) { failure = error; transaction.abort(); }
        };
      } catch (error) { failure = error; transaction.abort(); }
    };
  });
}
