import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { mergeTrackingWorkspaceTracks } from "../services/localTrackingWorkspaceContract.js";
import {
  loadLocalTrackingTracks,
  removeLocalTrackingTrack,
  saveLocalTrackingTrack,
} from "../services/localTrackingWorkspaceStore.js";
import { trackingMetadataPayload } from "../services/trackingReviewService.js";
import { trackingWorkspaceTarget } from "../services/trackingWorkspaceScopeService.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
} from "./trackingControllerHelpers.js";

function workspaceState(value = {}) {
  return {
    status: String(value.status || "waiting-item"),
    localOnlyCount: Math.max(0, Math.round(Number(value.localOnlyCount) || 0)),
    missingSampleCount: Math.max(0, Math.round(Number(value.missingSampleCount) || 0)),
    pendingCorrectionCount: Math.max(0, Math.round(Number(value.pendingCorrectionCount) || 0)),
    lastLoadedAt: String(value.lastLoadedAt || ""),
    error: String(value.error || ""),
  };
}

function mergeGraphics(remoteValues = [], liveValues = []) {
  const byId = new Map();
  remoteValues.forEach((graphic) => {
    const normalized = normalizeDynamicGraphic(graphic);
    if (normalized.id) byId.set(normalized.id, normalized);
  });
  liveValues.forEach((graphic) => {
    const normalized = normalizeDynamicGraphic(graphic);
    if (normalized.id) byId.set(normalized.id, normalized);
  });
  return [...byId.values()];
}

export function createTrackingWorkspaceController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getContext = options.getContext || (() => ({}));
  const getWindow = options.getWindow || (() => globalThis.window);
  const loadRemoteWorkspace = options.loadRemoteWorkspace || (async () => ({ objectTracks: [], dynamicGraphics: [] }));
  const loadLocalTracks = options.loadLocalTracks || loadLocalTrackingTracks;
  const removeLocalTrack = options.removeLocalTrack || removeLocalTrackingTrack;
  const saveLocalTrack = options.saveLocalTrack || saveLocalTrackingTrack;
  const saveRemoteTrack = options.saveRemoteTrack || null;
  const now = options.now || Date.now;
  let activeTarget = null;
  let requestId = 0;
  let unsubscribe = null;
  let disposed = false;
  const pendingTrackIds = new Set();

  function setWorkspace(patch = {}) {
    updateState((state) => {
      const current = workspaceState(state.presentation?.tracking?.workspace);
      const next = { ...current, ...patch };
      if (JSON.stringify(current) === JSON.stringify(next)) return state;
      return patchTrackingState(state, { workspace: next });
    });
  }

  function applyWorkspace(target, remote = {}, localEntries = [], errors = []) {
    pendingTrackIds.clear();
    localEntries.filter((entry) => entry.syncStatus === "pending")
      .forEach((entry) => pendingTrackIds.add(entry.track.id));
    let summary = null;
    updateState((state) => {
      const liveTarget = trackingWorkspaceTarget(state, getContext());
      const item = selectedTrackingItem(state);
      if (!item || liveTarget?.key !== target.key) return state;
      summary = mergeTrackingWorkspaceTracks(
        remote.objectTracks || [],
        localEntries,
        item.objectTracks || [],
      );
      const idChanges = new Map(summary.migrations.map((entry) => [entry.previousTrackId, entry.trackId]));
      const objectTracks = summary.tracks;
      const trackIds = new Set(objectTracks.map((track) => track.id));
      const selectedTrackIds = (state.presentation?.tracking?.selectedTrackIds || [])
        .map((trackId) => idChanges.get(trackId) || trackId)
        .filter((trackId) => trackIds.has(trackId));
      const dynamicGraphics = mergeGraphics(remote.dynamicGraphics || [], item.dynamicGraphics || [])
        .map((graphic) => ({
          ...graphic,
          bindings: (graphic.bindings || []).map((binding) => ({
            ...binding,
            trackId: idChanges.get(binding.trackId) || binding.trackId,
          })),
        }));
      const next = replacePresentationItem(state, item.id, {
        objectTracks,
        dynamicGraphics,
      });
      const currentWorkspace = workspaceState(state.presentation?.tracking?.workspace);
      return patchTrackingState(next, {
        selectedTrackIds,
        workspace: {
          status: errors.length
            ? "attention"
            : currentWorkspace.pendingCorrectionCount
              ? "pending-sync"
              : localEntries.length || objectTracks.length ? "restored" : "ready",
          localOnlyCount: summary.localOnlyCount,
          missingSampleCount: summary.missingSampleCount,
          pendingCorrectionCount: currentWorkspace.pendingCorrectionCount,
          lastLoadedAt: new Date(now()).toISOString(),
          error: errors.join(" ") || (currentWorkspace.pendingCorrectionCount ? currentWorkspace.error : ""),
        },
      });
    });
    return summary;
  }

  async function restore(optionsValue = {}) {
    const target = trackingWorkspaceTarget(getState(), getContext());
    if (!target) {
      requestId += 1;
      activeTarget = null;
      setWorkspace({
        status: "waiting-item",
        localOnlyCount: 0,
        missingSampleCount: 0,
        pendingCorrectionCount: 0,
        lastLoadedAt: "",
        error: "",
      });
      return false;
    }
    if (!optionsValue.force && activeTarget?.key === target.key) return true;
    activeTarget = target;
    const currentRequestId = ++requestId;
    setWorkspace({ status: "loading", error: "" });
    const [remoteResult, localResult] = await Promise.allSettled([
      loadRemoteWorkspace(target.clipId),
      target.scope ? loadLocalTracks(target.scope, getWindow()) : Promise.resolve([]),
    ]);
    if (disposed || currentRequestId !== requestId || activeTarget?.key !== target.key) return false;
    const errors = [];
    const remote = remoteResult.status === "fulfilled" ? remoteResult.value || {} : {};
    const localEntries = localResult.status === "fulfilled" ? localResult.value || [] : [];
    if (remoteResult.status === "rejected") {
      errors.push(`${remoteResult.reason?.message || "Central tracking metadata could not be restored."}`);
    }
    if (localResult.status === "rejected") {
      errors.push(`${localResult.reason?.message || "Local tracking samples could not be restored."}`);
    }
    const summary = applyWorkspace(target, remote, localEntries, errors);
    if (target.scope && summary?.migrations?.length) {
      try {
        for (const migration of summary.migrations) {
          const track = summary.tracks.find((entry) => entry.id === migration.trackId);
          if (track) {
            await saveLocalTrack(target.scope, track, {
              previousTrackId: migration.previousTrackId,
              syncStatus: "synced",
              now,
              win: getWindow(),
            });
            await options.onTrackIdMigrated?.(migration.previousTrackId, migration.trackId);
          }
        }
      } catch (error) {
        setWorkspace({
          status: "attention",
          error: error?.message || "A synchronized track could not be reconciled on this device.",
        });
        return false;
      }
    }
    return !errors.length;
  }

  function observe(state = getState()) {
    if (disposed) return false;
    const target = trackingWorkspaceTarget(state, getContext());
    if (target?.key === activeTarget?.key || (!target && !activeTarget)) return false;
    void restore({ force: true });
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

  async function retainTrack(trackValue = {}, saveOptions = {}) {
    const target = trackingWorkspaceTarget(getState(), getContext());
    if (!target?.scope) throw new Error("Sign in to protect tracking samples on this device.");
    const entry = await saveLocalTrack(target.scope, normalizeObjectTrack(trackValue), {
      previousTrackId: saveOptions.previousTrackId,
      syncStatus: saveOptions.syncStatus,
      now,
      win: getWindow(),
    });
    if (saveOptions.syncStatus === "synced") {
      pendingTrackIds.delete(String(saveOptions.previousTrackId || ""));
      pendingTrackIds.delete(entry.track.id);
    } else pendingTrackIds.add(entry.track.id);
    setWorkspace({
      status: saveOptions.syncStatus === "synced" ? "saved" : "pending-sync",
      localOnlyCount: pendingTrackIds.size,
      error: "",
    });
    return entry;
  }

  async function discardTrack(trackId = "", removeOptions = {}) {
    const target = trackingWorkspaceTarget(getState(), getContext());
    if (!target?.scope) throw new Error("Sign in to remove tracking samples from this device.");
    const ids = [...new Set([trackId, removeOptions.previousTrackId].map(String).filter(Boolean))];
    for (const id of ids) await removeLocalTrack(target.scope, id, getWindow());
    ids.forEach((id) => pendingTrackIds.delete(id));
    setWorkspace({
      status: pendingTrackIds.size ? "pending-sync" : "saved",
      localOnlyCount: pendingTrackIds.size,
      error: "",
    });
    return true;
  }

  function migrateTrackId(itemId, previousTrackId, trackValue) {
    const track = normalizeObjectTrack(trackValue);
    updateState((state) => {
      const item = selectedTrackingItem(state);
      if (!item || item.id !== itemId) return state;
      const objectTracks = [
        ...(item.objectTracks || []).filter((entry) => ![previousTrackId, track.id].includes(entry.id)),
        track,
      ];
      const dynamicGraphics = (item.dynamicGraphics || []).map((graphic) => ({
        ...graphic,
        bindings: (graphic.bindings || []).map((binding) => (
          binding.trackId === previousTrackId ? { ...binding, trackId: track.id } : binding
        )),
      }));
      const selectedTrackIds = (state.presentation?.tracking?.selectedTrackIds || [])
        .map((trackId) => trackId === previousTrackId ? track.id : trackId);
      return patchTrackingState(replacePresentationItem(state, item.id, { objectTracks, dynamicGraphics }), {
        selectedTrackIds: [...new Set(selectedTrackIds)],
      });
    });
  }

  async function retrySync() {
    const target = trackingWorkspaceTarget(getState(), getContext());
    if (!target?.scope || !saveRemoteTrack) return restore({ force: true });
    setWorkspace({ status: "syncing", error: "" });
    try {
      const entries = await loadLocalTracks(target.scope, getWindow());
      for (const entry of entries.filter((value) => value.syncStatus === "pending")) {
        const previousTrackId = entry.track.id;
        const payload = await saveRemoteTrack(trackingMetadataPayload(entry.track));
        const remoteTrack = payload?.objectTrack || payload?.track || {};
        const track = normalizeObjectTrack({
          ...entry.track,
          ...remoteTrack,
          segments: entry.track.segments,
          metadata: { ...(remoteTrack.metadata || {}), ...(entry.track.metadata || {}) },
        });
        if (track.status === "archived") {
          await discardTrack(track.id, { previousTrackId });
          continue;
        }
        await saveLocalTrack(target.scope, track, {
          previousTrackId,
          syncStatus: "synced",
          now,
          win: getWindow(),
        });
        await options.onTrackIdMigrated?.(previousTrackId, track.id);
        if (track.id !== previousTrackId) migrateTrackId(target.itemId, previousTrackId, track);
      }
      activeTarget = null;
      return restore({ force: true });
    } catch (error) {
      setWorkspace({ status: "attention", error: error?.message || "Tracking metadata could not be synchronized." });
      return false;
    }
  }

  function dispose() {
    disposed = true;
    requestId += 1;
    unsubscribe?.();
    unsubscribe = null;
    return true;
  }

  return {
    discardTrack,
    dispose,
    restore,
    retainTrack,
    retrySync,
    start,
  };
}
