import { buildLocalVideoHandleIdentity } from "../services/localVideoSessionService.js";
import {
  getLocalTrackingBenchmarkWorkspace,
  saveLocalTrackingBenchmarkWorkspace,
} from "../services/localTrackingBenchmarkStore.js";
import {
  createTrackingBenchmarkWorkspaceArtifact,
  createTrackingBenchmarkWorkspaceScope,
  emptyTrackingBenchmarkWorkspaceContent,
  normalizeTrackingBenchmarkWorkspaceContent,
  trackingBenchmarkWorkspaceContentFingerprint,
} from "../services/trackingBenchmarkWorkspaceService.js";
import { patchTrackingState } from "./trackingControllerHelpers.js";

const defaultSaveDelayMs = 300;

function storageEntry(value = {}) {
  return {
    status: String(value.status || "waiting-source"),
    lastSavedAt: String(value.lastSavedAt || ""),
    error: String(value.error || ""),
  };
}

export function createTrackingBenchmarkPersistenceController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getContext = options.getContext || (() => ({}));
  const getWindow = options.getWindow || (() => globalThis.window);
  const loadWorkspace = options.loadWorkspace || getLocalTrackingBenchmarkWorkspace;
  const saveWorkspace = options.saveWorkspace || saveLocalTrackingBenchmarkWorkspace;
  const now = options.now || Date.now;
  const saveDelayMs = Math.max(0, Number(options.saveDelayMs ?? defaultSaveDelayMs));
  let activeScope = null;
  let activationId = 0;
  let hydrated = false;
  let pending = null;
  let saveTimer = null;
  let unsubscribe = null;
  let disposed = false;
  let switchingScope = false;
  let lastGroundTruthReference = null;
  let lastProviderRunsReference = null;
  let writeQueue = Promise.resolve(true);
  const fingerprintsByScope = new Map();
  const blockedByScope = new Map();
  const failedEntriesByScope = new Map();
  const inFlightByScope = new Map();

  function setStorage(patch = {}) {
    updateState((state) => {
      const current = storageEntry(state.presentation?.tracking?.benchmarkStorage);
      const next = { ...current, ...patch };
      if (current.status === next.status
        && current.lastSavedAt === next.lastSavedAt
        && current.error === next.error) return state;
      return patchTrackingState(state, { benchmarkStorage: next });
    });
  }

  function scopeFor(state = {}) {
    try {
      const context = getContext();
      const user = context.currentUser || context.user || context.getCurrentPlatformUser?.() || {};
      const userId = String(
        user.id || user.userId || user.user_id || user.authId || user.auth_id || user.profileId || user.profile_id || "",
      ).trim();
      if (!userId) return null;
      const identity = buildLocalVideoHandleIdentity(state, context, { userId });
      if (identity.organizationId === "local" || identity.teamId === "team") return null;
      return createTrackingBenchmarkWorkspaceScope(identity);
    } catch {
      return null;
    }
  }

  function cancelScheduledSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    pending = null;
  }

  function applyContent(content = {}, storagePatch = {}) {
    updateState((state) => patchTrackingState(state, {
      groundTruth: content.groundTruth,
      providerRuns: content.providerRuns,
      benchmarkStorage: {
        ...storageEntry(state.presentation?.tracking?.benchmarkStorage),
        ...storagePatch,
      },
    }));
  }

  async function performSave(entry, failureMessage = "The local benchmark workspace could not be saved.") {
    let fingerprint = "";
    try {
      const content = normalizeTrackingBenchmarkWorkspaceContent(entry.tracking);
      fingerprint = await trackingBenchmarkWorkspaceContentFingerprint(
        content,
        getWindow()?.crypto || globalThis.crypto,
      );
      if (fingerprint === fingerprintsByScope.get(entry.scope.id)) return true;
      const blocked = blockedByScope.get(entry.scope.id);
      if (blocked?.fingerprint === fingerprint) {
        if (!disposed && activeScope?.id === entry.scope.id) {
          setStorage({ status: "error", error: blocked.error });
        }
        return false;
      }
      inFlightByScope.set(entry.scope.id, fingerprint);
      const artifact = createTrackingBenchmarkWorkspaceArtifact({
        scope: entry.scope,
        ...content,
      }, { now });
      const saved = await saveWorkspace(artifact, getWindow());
      fingerprintsByScope.set(entry.scope.id, fingerprint);
      blockedByScope.delete(entry.scope.id);
      failedEntriesByScope.delete(entry.scope.id);
      if (!disposed && activeScope?.id === entry.scope.id) {
        setStorage({ status: "saved", lastSavedAt: saved.updatedAt, error: "" });
      }
      return true;
    } catch (error) {
      const message = error?.message || failureMessage;
      if (fingerprint) blockedByScope.set(entry.scope.id, { fingerprint, error: message });
      failedEntriesByScope.set(entry.scope.id, entry);
      if (!disposed && activeScope?.id === entry.scope.id) setStorage({ status: "error", error: message });
      return false;
    } finally {
      if (inFlightByScope.get(entry.scope.id) === fingerprint) inFlightByScope.delete(entry.scope.id);
    }
  }

  function enqueueSave(entry, failureMessage) {
    const operation = writeQueue.then(() => performSave(entry, failureMessage));
    writeQueue = operation.catch(() => false);
    return operation;
  }

  async function savePending(failureMessage) {
    if (!pending) return writeQueue;
    const entry = pending;
    pending = null;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    return enqueueSave(entry, failureMessage);
  }

  async function flushBeforeScopeChange() {
    if (!pending) return writeQueue;
    return savePending("The previous benchmark workspace could not be saved before switching matches.");
  }

  async function activate(state = getState()) {
    const scope = scopeFor(state);
    if (!scope) {
      activationId += 1;
      activeScope = null;
      hydrated = false;
      lastGroundTruthReference = null;
      lastProviderRunsReference = null;
      cancelScheduledSave();
      setStorage({ status: "waiting-source", lastSavedAt: "", error: "" });
      return false;
    }
    if (activeScope?.id === scope.id && hydrated) return true;
    if (activeScope && activeScope.id !== scope.id) {
      switchingScope = true;
      const flushed = await flushBeforeScopeChange();
      switchingScope = false;
      if (!flushed) return false;
    }
    const requestId = ++activationId;
    activeScope = scope;
    hydrated = false;
    lastGroundTruthReference = null;
    lastProviderRunsReference = null;
    cancelScheduledSave();
    setStorage({ status: "loading", lastSavedAt: "", error: "" });
    try {
      const stored = await loadWorkspace(scope, getWindow());
      if (disposed || requestId !== activationId || activeScope?.id !== scope.id) return false;
      const content = stored
        ? normalizeTrackingBenchmarkWorkspaceContent(stored)
        : normalizeTrackingBenchmarkWorkspaceContent(emptyTrackingBenchmarkWorkspaceContent());
      fingerprintsByScope.set(scope.id, await trackingBenchmarkWorkspaceContentFingerprint(
        content,
        getWindow()?.crypto || globalThis.crypto,
      ));
      blockedByScope.delete(scope.id);
      hydrated = true;
      lastGroundTruthReference = content.groundTruth;
      lastProviderRunsReference = content.providerRuns;
      applyContent(content, {
        status: stored ? "restored" : "ready",
        lastSavedAt: stored?.updatedAt || "",
        error: "",
      });
      return true;
    } catch (error) {
      if (requestId !== activationId || activeScope?.id !== scope.id) return false;
      setStorage({
        status: "error",
        error: error?.message || "The local benchmark workspace could not be restored.",
      });
      return false;
    }
  }

  function scheduleSave(scope, tracking) {
    if (saveTimer) clearTimeout(saveTimer);
    pending = { scope, tracking };
    setStorage({ status: "saving", error: "" });
    saveTimer = setTimeout(() => { void savePending(); }, saveDelayMs);
  }

  function observe(state = getState()) {
    if (disposed || switchingScope) return false;
    const scope = scopeFor(state);
    if (!scope) {
      if (activeScope) void activate(state);
      return false;
    }
    if (activeScope?.id !== scope.id) {
      void activate(state);
      return false;
    }
    if (!hydrated) return false;
    const tracking = state.presentation?.tracking || {};
    if (tracking.groundTruth === lastGroundTruthReference
      && tracking.providerRuns === lastProviderRunsReference) return false;
    lastGroundTruthReference = tracking.groundTruth;
    lastProviderRunsReference = tracking.providerRuns;
    scheduleSave(scope, {
      groundTruth: tracking.groundTruth,
      providerRuns: tracking.providerRuns,
    });
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

  async function retry() {
    const failedEntry = activeScope ? failedEntriesByScope.get(activeScope.id) : null;
    if (activeScope) blockedByScope.delete(activeScope.id);
    if (!activeScope || !hydrated) return activate(getState());
    if (failedEntry) {
      failedEntriesByScope.delete(activeScope.id);
      pending = failedEntry;
      const currentScope = scopeFor(getState());
      return currentScope?.id === activeScope.id ? savePending() : activate(getState());
    }
    lastGroundTruthReference = null;
    lastProviderRunsReference = null;
    observe(getState());
    if (saveTimer && saveDelayMs === 0) return savePending();
    return true;
  }

  async function dispose() {
    unsubscribe?.();
    unsubscribe = null;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const shouldSave = Boolean(pending);
    disposed = true;
    if (shouldSave) await savePending();
    await writeQueue;
    return true;
  }

  return {
    activate,
    dispose,
    observe,
    restore: () => activate(getState()),
    retry,
    start,
  };
}
