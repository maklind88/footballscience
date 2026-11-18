import { legacySnapshotMatches } from './snapshot-compact-legacy-guard.mjs';
import { serialize, pack, digest } from './snapshot-compact-write-codec.mjs';
import { createCompactWriteStore, compactRowBytes } from './snapshot-compact-write-store.mjs';
import { decodeLosslessVersion } from './snapshot-compact-decode.mjs';
import { isReviewableSnapshot } from './snapshot-history-format.mjs';
import { sameSnapshotContents } from './distinct-snapshot-store.mjs';
import { readRecoverySessions, recoveryDraftModuleKey } from './snapshot-recovery-draft-format.mjs';
import { reuseCompactSnapshot } from './snapshot-compact-reuse.mjs';

// No app wiring, global toggle, localStorage switch, URL flag or remote activation.
// Explicit injection is available to isolated tests; normal construction is off.
export function createCompactSnapshotArchive({ indexedDB = globalThis.indexedDB, enabled = () => false,
  legacyDatabaseName = 'football-science-data-safety-v1', legacyRetention = 'reuse',
  getAccess = () => null, timeoutMs = 3000, storeOptions = {} } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('Invalid compact write timeout');
  if (!['reuse', 'independent'].includes(legacyRetention)) throw new Error('Invalid legacy retention policy');
  const store = createCompactWriteStore({ indexedDB, ...storeOptions });
  const access = () => {
    try {
      const a = getAccess();
      if (a?.canWrite !== true || typeof a.scope !== 'string' || !a.scope || a.scope.length > 256 ||
          !a.generation || !(a.allowedKeys instanceof Set)) return null;
      return { ...a, allowedKeys: new Set(a.allowedKeys), token: JSON.stringify([a.scope, a.generation, [...a.allowedKeys].sort()]) };
    } catch { return null; }
  };
  async function save(snapshot, permit) {
    permit?.check();
    const writing = enabled() === true;
    const prior = access();
    if (!prior) {
      if (!writing) return { status: 'unsupported' };
      throw new Error('Compact history access unavailable');
    }
    let original, copy;
    try {
      original = serialize(snapshot); copy = JSON.parse(original);
      if (copy.reason !== 'autosave' || typeof copy.id !== 'string' || copy.id.length > 256 ||
          !isReviewableSnapshot(copy, prior.scope, prior.allowedKeys) ||
          Object.keys(copy.storage).length !== 1 || !Object.hasOwn(copy.storage, recoveryDraftModuleKey) ||
          Object.keys(copy.saveContext.entries).length !== 1) return { status: 'unsupported' };
      const entry = copy.saveContext.entries[recoveryDraftModuleKey];
      if (entry.pendingCentralSync !== true && entry.localWritePrepared !== true) return { status: 'unsupported' };
      readRecoverySessions(copy.storage[recoveryDraftModuleKey]);
    } catch { return { status: 'unsupported' }; }
    const abort = new AbortController(), current = () => access()?.token === prior.token && enabled() === writing &&
      (!permit || (permit.current() && !permit.signal.aborted));
    const cancel = () => abort.abort();
    permit?.signal.addEventListener('abort', cancel, { once: true });
    const guard = { signal: abort.signal, current };
    let timer;
    const operation = async () => {
      const reused = await reuseCompactSnapshot({ indexedDB, snapshot: copy, access: prior, signal: abort.signal, scan: true });
      if (reused) return reused;
      if (!writing) return { status: 'unsupported' };
      const packet = await pack(original);
      const row = { key: JSON.stringify([prior.scope, copy.id]), scope: prior.scope, id: copy.id,
        format: 1, mode: 'standalone', originalDigest: await digest(new TextEncoder().encode(original)), packet, refs: [] };
      // Small or incompressible copies keep their original path, before any DB open.
      if (!current() || abort.signal.aborted) throw new Error('Compact write cancelled');
      if (packet.codec !== 'gzip' || compactRowBytes(row) + 2048 >= new TextEncoder().encode(original).length)
        return { status: 'unsupported' };
      if (await decodeLosslessVersion(row, new Map(), prior.scope, copy.id) !== original) throw new Error('Compact round trip failed');
      // In independent mode a legacy match is not durable evidence: old code
      // may prune it later. Retain this NEW capture separately; never scan,
      // migrate or alter historical legacy rows. This can add representation
      // duplicates when an older writer runs first; it does not bound its writes.
      if (legacyRetention === 'reuse' && await legacySnapshotMatches({ indexedDB, databaseName: legacyDatabaseName, snapshot: copy, signal: abort.signal }))
        return { status: 'unsupported' };
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!current() || abort.signal.aborted) throw new Error('Compact write cancelled');
        const previous = await store.readHead(prior.scope, guard);
        const old = previous.row && JSON.parse(await decodeLosslessVersion(previous.row, new Map(), prior.scope, previous.row.id));
        const reuse = old && sameSnapshotContents(old, copy);
        // Another writer can insert A then B between the initial lookup and
        // this head read. Check all bounded retained copies after observing the
        // head, so an A retry cannot create a second representation behind B.
        // A subsequent insertion changes the head and retain's CAS retries.
        if (!reuse) {
          const retained = await reuseCompactSnapshot({ indexedDB, snapshot: copy, access: prior,
            signal: abort.signal, scan: true });
          if (retained) return retained;
        }
        const result = await store.retain(reuse ? previous.row : row, previous, Boolean(reuse), guard);
        if (result.retry) continue;
        return { status: 'stored', written: result.inserted, createdAt: reuse ? old.createdAt : copy.createdAt,
          id: reuse ? old.id : copy.id, source: 'compact' };
      }
      throw new Error('Concurrent compact write; retry later');
    };
    try {
      const result = await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error('Compact write timed out')); }, timeoutMs);
      })]);
      if (!current()) throw new Error('Compact write access changed');
      return result;
    } finally { clearTimeout(timer); abort.abort(); permit?.signal.removeEventListener('abort', cancel); }
  }
  return Object.freeze({ save });
}
