import { sameSessionValue } from "./session-save-protocol.mjs";

export function getSessionPlannerRecoveryContext({ user, bridge, storageKey, canEdit = false } = {}) {
  if (!user?.id || !canEdit || bridge?.canAutoSyncKey?.(storageKey) === false) return null;
  const status = bridge?.getStatus?.() || {};
  const metadata = status.metadata?.[storageKey] || {};
  const revision = Number(metadata.revision ?? 0);
  if (!Number.isInteger(revision) || revision < 0) return null;
  return {
    scope: JSON.stringify([user.id, metadata.organizationId || "", user.clubId || "", user.teamId || ""]),
    revision,
    ready: bridge?.isHydrated?.() === true,
    hydrating: Boolean(status.hydrating),
  };
}

export function getSessionPlannerQuotaSnapshotId(storageKey, context) {
  const prefix = `${storageKey}-quota-fallback`;
  return context?.scope ? `${prefix}:${encodeURIComponent(context.scope)}` : prefix;
}

export function createSessionPlannerRecoveryController({
  cloneState,
  getContext = () => null,
  getState,
  getStorageValue,
  hasPendingWrite = () => false,
  mergeState,
  openDatabase,
  reportIssue = () => {},
  restoreState,
  shouldDefer = () => false,
  snapshotStoreName = "snapshots",
  storageKey,
} = {}) {
  let inFlight = null;
  let checkedContext = "";

  async function readPendingSnapshot(context) {
    const database = await openDatabase();
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(snapshotStoreName, "readonly");
      // Historical and unscoped backups remain available for explicit recovery only.
      const request = transaction.objectStore(snapshotStoreName).get(getSessionPlannerQuotaSnapshotId(storageKey, context));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function contextKey(context) {
    return context?.ready ? JSON.stringify([context.scope, context.revision]) : "";
  }

  async function preserveReviewSnapshot(snapshot) {
    const database = await openDatabase();
    if (!database) throw new Error("Local backup storage is not available.");
    // Keep unresolved edits separate before a later edit replaces the active quota snapshot.
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(snapshotStoreName, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore(snapshotStoreName).put({
        ...snapshot,
        id: `${snapshot.id}:review:${snapshot.recovery.baseRevision}`,
        reason: "session-planner-recovery-review",
      });
    });
  }

  function queue() {
    const currentContext = getContext();
    const context = currentContext ? { ...currentContext } : null;
    const key = contextKey(context);
    if (inFlight || !key || key === checkedContext || hasPendingWrite() || shouldDefer()) return inFlight;
    const stateValue = JSON.stringify(getState());
    const storageValue = getStorageValue();
    inFlight = readPendingSnapshot(context).then(async (snapshot) => {
      // A read must never take over edits, navigation, auth changes, or a newer hydration.
      if (contextKey(getContext()) !== key || getContext()?.hydrating || JSON.stringify(getState()) !== stateValue ||
          getStorageValue() !== storageValue || hasPendingWrite() || shouldDefer()) return;
      if (!snapshot) {
        checkedContext = key;
        return;
      }
      if (snapshot.reason !== "session-planner-quota-fallback" || snapshot.recovery?.scope !== context.scope) return;
      const raw = snapshot.storage?.[storageKey];
      if (typeof raw !== "string") return;
      const current = cloneState(getState());
      const baseline = mergeState(current, current);
      const pending = cloneState(JSON.parse(raw));
      for (const date of Object.keys(snapshot.reviewedDates || {})) {
        delete pending.sessions?.[date];
        delete pending.blockDeletionTombstones?.[date];
      }
      const next = mergeState(current, pending);
      if (sameSessionValue(next, baseline)) {
        checkedContext = key;
        return;
      }
      if (snapshot.recovery.baseRevision !== context.revision) {
        await preserveReviewSnapshot(snapshot);
        if (contextKey(getContext()) !== key) return;
        checkedContext = key;
        reportIssue("Local changes need review");
        return;
      }
      if (restoreState(next)) checkedContext = key;
    }).catch(() => {
      reportIssue("Local recovery unavailable");
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return { queue };
}
