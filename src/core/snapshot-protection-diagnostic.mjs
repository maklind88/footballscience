import { isRotatingSnapshot } from './snapshot-retention-store.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// One primary explanation per inspected row; never a cleanup decision. The
// positive acknowledgement test is the SAME predicate used by retention.
export function snapshotProtectionReason(row, { policy, pinned = new Set() } = {}) {
  if (pinned.has(row?.id)) return 'Referenced by latest copies';
  if (row?.reason === 'session-planner-recovery-review' || row?.reason === 'session-planner-quota-fallback' ||
      String(row?.id || '').startsWith('football-session-planner-v3-quota-fallback')) return 'Module recovery or fallback';
  if ((object(row?.recoveryCopies) && Object.keys(row.recoveryCopies).length) ||
      (object(row?.recoveryState) && Object.keys(row.recoveryState).length) ||
      (Array.isArray(row?.recoverySeparations) && row.recoverySeparations.length)) return 'Recovery contents retained';
  const entries = object(row?.saveContext?.entries) ? Object.values(row.saveContext.entries) : [];
  if (entries.some(entry => entry?.pendingCentralSync === true || entry?.localWritePrepared === true))
    return 'Pending or prepared work retained';
  if (entries.some(entry => typeof entry?.deletedAt === 'string' && entry.deletedAt)) return 'Deletion metadata retained';
  if (['manual-export', 'before-restore', 'after-restore'].includes(row?.reason)) return 'Manual or restore copy retained';
  if (policy && isRotatingSnapshot(row, policy)) return 'Acknowledged automatic history';
  return 'Unverified or unsupported history retained';
}

// Typed-array contents are counted as binary bytes, never expanded into JSON
// numeric keys or decoded. JSON sizes exclude those bytes and are estimates.
export function measureStoredRow(row) {
  let binaryBytes = 0;
  const text = JSON.stringify(row, (_key, value) => {
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      binaryBytes += value.byteLength;
      return null;
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      binaryBytes += value.size;
      return null;
    }
    return value;
  });
  if (typeof text !== 'string') throw new Error('Unmeasurable row');
  return { approximateJsonUtf16Bytes: text.length * 2, binaryBytes };
}
