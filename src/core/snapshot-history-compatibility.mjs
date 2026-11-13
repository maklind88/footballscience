import { reuseCompactSnapshot } from './snapshot-compact-reuse.mjs';
import { isReviewableSnapshot } from './snapshot-history-format.mjs';

// Internal read-side comparison only. It neither creates a compact store nor
// exposes recovered values. The caller supplies the scope of its already
// captured backup and rechecks the account epoch before accepting the result.
export async function findRetainedCompactSnapshot({ indexedDB, snapshot, allowedKeys, current, timeoutMs = 3000 }) {
  const scope = snapshot?.saveContext?.scope;
  if (!indexedDB?.databases || !isReviewableSnapshot(snapshot, scope, allowedKeys)) return null;
  const controller = new AbortController(); let timer;
  try {
    if (!current()) throw new Error('History account changed');
    const result = await Promise.race([
      reuseCompactSnapshot({ indexedDB, snapshot, access: { scope, allowedKeys }, signal: controller.signal, scan: true }),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('History compatibility check timed out')); }, timeoutMs); }),
    ]);
    if (!current()) throw new Error('History account changed');
    return result;
  } finally { clearTimeout(timer); controller.abort(); }
}
