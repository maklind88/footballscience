import { readExistingVersion } from './snapshot-existing-read.mjs';
import { sameSnapshotContents } from './distinct-snapshot-store.mjs';

// Read-only compatibility check. Never backfill an unchanged legacy generation.
// Different databases cannot provide one cross-format atomic transaction: a
// simultaneous legacy writer can still create an extra copy (never lose one).
export async function legacySnapshotMatches({ indexedDB, databaseName, snapshot, signal }) {
  const read = async (storeName, id) => {
    try {
      return (await readExistingVersion({ factory: indexedDB, source: { name: databaseName, format: 'legacy', storeName },
        scope: snapshot.saveContext.scope, id, signal, maxBytes: 8 * 1024 * 1024, maxBlocks: 0 })).row;
    } catch (error) { if (error.status === 'absent') return null; throw error; }
  };
  const latest = await read('latest', 'latest');
  if (!latest) return false;
  const scope = snapshot.saveContext.scope;
  const id = latest.saveContext?.scope === scope ? latest.sourceSnapshotId
    : latest.recentSnapshotRefs?.slice?.(0, 8).find(ref => ref?.scope === scope)?.id;
  // Missing hints must not manufacture a compact replacement for old history.
  // Leave bounded legacy deduplication to its existing transaction.
  if (typeof id !== 'string' || !id) return true;
  const row = await read('snapshots', id);
  return row?.id === id && sameSnapshotContents(row, snapshot);
}
