import { acknowledgedSnapshotEntry, knownSnapshotEntry, knownSnapshotShape } from "./snapshot-retention-policy.mjs";

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameField = (a, b, key) => Object.hasOwn(a, key) === Object.hasOwn(b, key) && equal(a[key], b[key]);
const contains = (next, previous) => Object.keys(previous).every(key => Object.hasOwn(next, key) && equal(previous[key], next[key]));

function sameGenerationAccepted(previous, next, scope) {
  if (!knownSnapshotEntry(previous, scope) || !knownSnapshotEntry(next, scope) ||
      previous.pendingCentralSync !== true || next.pendingCentralSync !== false ||
      previous.localWritePrepared || next.localWritePrepared ||
      !Number.isSafeInteger(previous.writes) || previous.writes <= 0 ||
      typeof previous.updatedAt !== "string" || !previous.updatedAt ||
      typeof previous.hash !== "string" || !previous.hash ||
      !Number.isSafeInteger(previous.pendingBaseRevision) || previous.pendingBaseRevision < 0 ||
      !Number.isSafeInteger(previous.serverRevision) || previous.serverRevision < 0 ||
      !Number.isSafeInteger(next.serverRevision) || next.serverRevision <= previous.pendingBaseRevision ||
      next.serverRevision < previous.serverRevision) return false;
  const identity = entry => Object.fromEntries(Object.entries(entry).filter(([key]) =>
    !["pendingCentralSync", "serverRevision", "localWritePrepared"].includes(key)));
  return equal(identity(previous), identity(next));
}

// This is a replacement proof, not a resolution command. Every protected payload
// and its recovery context must remain in the incoming committed snapshot. Only
// an exact generation's accepted metadata may replace its pending metadata.
export function canReplaceSnapshot(previous, next) {
  const scope = next?.saveContext?.scope;
  if (!knownSnapshotShape(previous, scope) || !knownSnapshotShape(next, scope) ||
      !contains(next.recoveryCopies, previous.recoveryCopies) || !contains(next.recoveryState, previous.recoveryState) ||
      !previous.recoverySeparations.every(key => next.recoverySeparations.includes(key))) return false;
  const before = previous.saveContext.entries, after = next.saveContext.entries;
  // Recovery formats may refer to the surrounding module state. Preserve the
  // whole prior context rather than infer which acknowledged fields it needs.
  if (Object.keys(previous.recoveryCopies).length || Object.keys(previous.recoveryState).length || previous.recoverySeparations.length) {
    return contains(next.storage, previous.storage) && contains(after, before) &&
      Object.values(before).every(entry => !entry?.principalScope || entry.principalScope === scope);
  }
  const keys = new Set([...Object.keys(previous.storage), ...Object.keys(before)]);
  return [...keys].every(key => {
    if (before[key]?.principalScope && before[key].principalScope !== scope) return false;
    const sameValue = sameField(previous.storage, next.storage, key);
    if (sameValue && sameField(before, after, key)) return true;
    if (sameValue && sameGenerationAccepted(before[key], after[key], scope) &&
        acknowledgedSnapshotEntry(after[key], scope, next.storage, key) &&
        (Object.hasOwn(previous.storage, key) || (typeof before[key].deletedAt === "string" && Boolean(before[key].deletedAt)))) return true;
    return acknowledgedSnapshotEntry(before[key], scope, previous.storage, key);
  });
}
