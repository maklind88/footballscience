import { trackingCorrectionApiPayload } from "../services/localTrackingCorrectionOutboxContract.js";
import {
  loadLocalTrackingCorrections,
  migrateLocalTrackingCorrectionTrackId,
  removeLocalTrackingCorrection,
  saveLocalTrackingCorrection,
} from "../services/localTrackingCorrectionOutboxStore.js";
import { trackingWorkspaceTarget } from "../services/trackingWorkspaceScopeService.js";
import { patchTrackingState, selectedTrackingItem } from "./trackingControllerHelpers.js";

function operationId(win = globalThis.window) {
  return win?.crypto?.randomUUID?.()
    || `correction-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 14)}`;
}

export function createTrackingCorrectionOutboxController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getContext = options.getContext || (() => ({}));
  const getWindow = options.getWindow || (() => globalThis.window);
  const saveRecord = options.saveRecord || saveLocalTrackingCorrection;
  const loadRecords = options.loadRecords || loadLocalTrackingCorrections;
  const removeRecord = options.removeRecord || removeLocalTrackingCorrection;
  const migrateTrackIdRecord = options.migrateTrackId || migrateLocalTrackingCorrectionTrackId;
  const persistRemote = options.persistRemote || null;
  const now = options.now || Date.now;
  let activeTarget = null;
  let unsubscribe = null;
  let disposed = false;

  function patchWorkspace(patch = {}) {
    updateState((state) => {
      const workspace = state.presentation?.tracking?.workspace || {};
      return patchTrackingState(state, { workspace: { ...workspace, ...patch } });
    });
  }

  function statusAfterQueue(current = {}, pendingCorrectionCount = 0) {
    if (pendingCorrectionCount) return "pending-sync";
    if (Number(current.localOnlyCount) || Number(current.missingSampleCount)) return current.status || "attention";
    return ["attention", "pending-sync", "syncing"].includes(current.status) ? "restored" : current.status || "ready";
  }

  async function restore() {
    const target = trackingWorkspaceTarget(getState(), getContext());
    activeTarget = target;
    if (!target?.scope) {
      patchWorkspace({ pendingCorrectionCount: 0 });
      return false;
    }
    try {
      const records = await loadRecords(target.scope, getWindow());
      const current = getState().presentation?.tracking?.workspace || {};
      const hadPendingCorrections = Number(current.pendingCorrectionCount) > 0;
      patchWorkspace({
        pendingCorrectionCount: records.length,
        status: statusAfterQueue(current, records.length),
        error: records.length
          ? `${records.length} correction audit${records.length === 1 ? "" : "s"} awaiting sync.`
          : hadPendingCorrections ? "" : current.error || "",
      });
      return records;
    } catch (error) {
      patchWorkspace({
        status: "attention",
        error: error?.message || "Local correction audits could not be restored.",
      });
      return false;
    }
  }

  async function markFailed(target, record, error) {
    try {
      await saveRecord(target.scope, {
        ...record,
        attempts: record.attempts + 1,
        lastAttemptAt: new Date(now()).toISOString(),
        lastError: error?.message || "Correction audit could not be synchronized.",
        updatedAt: new Date(now()).toISOString(),
      }, { now, win: getWindow() });
    } catch {
    }
    const records = await loadRecords(target.scope, getWindow()).catch(() => [record]);
    patchWorkspace({
      status: "attention",
      pendingCorrectionCount: records.length,
      error: `${error?.message || "Correction audit could not be synchronized."} The audit remains on this device.`,
    });
  }

  async function persist(correctionValue = {}) {
    const target = trackingWorkspaceTarget(getState(), getContext());
    if (!target?.scope) throw new Error("Sign in to protect tracking correction audits on this device.");
    const item = selectedTrackingItem(getState());
    const track = (item?.objectTracks || []).find((entry) => entry.id === correctionValue.objectTrackId);
    const record = await saveRecord(target.scope, {
      ...correctionValue,
      operationId: correctionValue.operationId || operationId(getWindow()),
      localWorkspaceTrackKey: correctionValue.localWorkspaceTrackKey
        || track?.metadata?.localWorkspaceTrackKey
        || "",
      createdAt: new Date(now()).toISOString(),
      updatedAt: new Date(now()).toISOString(),
    }, { now, win: getWindow() });
    const queued = await loadRecords(target.scope, getWindow());
    patchWorkspace({
      status: "pending-sync",
      pendingCorrectionCount: queued.length,
      error: "",
    });
    try {
      if (!persistRemote) throw new Error("Central correction audit is not configured.");
      if (track?.metadata?.localWorkspaceStatus === "pending-central"
        || correctionValue.localWorkspaceStatus === "pending-central") {
        throw new Error("Synchronize the track before its correction audit.");
      }
      const result = await persistRemote(trackingCorrectionApiPayload(record));
      await removeRecord(target.scope, record.operationId, getWindow());
      await restore();
      return result;
    } catch (error) {
      await markFailed(target, record, error);
      throw error;
    }
  }

  async function retry() {
    const target = trackingWorkspaceTarget(getState(), getContext());
    if (!target?.scope || !persistRemote) return false;
    patchWorkspace({ status: "syncing", error: "" });
    const records = await loadRecords(target.scope, getWindow());
    for (const record of records) {
      try {
        await persistRemote(trackingCorrectionApiPayload(record));
        await removeRecord(target.scope, record.operationId, getWindow());
      } catch (error) {
        await markFailed(target, record, error);
        return false;
      }
    }
    await restore();
    return true;
  }

  async function migrateTrackId(previousTrackId = "", trackId = "") {
    const target = trackingWorkspaceTarget(getState(), getContext());
    if (!target?.scope || !previousTrackId || !trackId || previousTrackId === trackId) return 0;
    const count = await migrateTrackIdRecord(target.scope, previousTrackId, trackId, {
      now,
      win: getWindow(),
    });
    if (count) await restore();
    return count;
  }

  function observe(state = getState()) {
    if (disposed) return false;
    const target = trackingWorkspaceTarget(state, getContext());
    if (target?.key === activeTarget?.key || (!target && !activeTarget)) return false;
    void restore();
    return true;
  }

  function start() {
    if (unsubscribe || disposed) return false;
    const store = options.getStore?.();
    if (!store?.subscribe) return false;
    unsubscribe = store.subscribe(observe);
    observe(store.getState());
    return true;
  }

  function dispose() {
    disposed = true;
    unsubscribe?.();
    unsubscribe = null;
    return true;
  }

  return { dispose, migrateTrackId, persist, restore, retry, start };
}
