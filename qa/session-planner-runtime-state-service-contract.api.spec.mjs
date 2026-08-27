import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createSessionPlannerRuntimeStateService,
  createSessionPlannerStateMergeHelpers,
} from "../src/modules/session-planner/index.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createLocalStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));
  const setItemCalls = [];
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => {
      values.set(String(key), String(value));
      setItemCalls.push([String(key), String(value)]);
    },
    setItemCalls,
    values,
  };
}

function createSnapshotDatabase(snapshots = []) {
  const records = new Map(snapshots.map((snapshot, index) => [snapshot.id || `snapshot-${index}`, snapshot]));
  return {
    records,
    transaction: () => {
      const transaction = {};
      const store = {
        getAll: () => {
          const request = {};
          queueMicrotask(() => {
            request.result = Array.from(records.values());
            request.onsuccess?.();
          });
          return request;
        },
        put: (snapshot) => {
          records.set(snapshot.id, snapshot);
          queueMicrotask(() => transaction.oncomplete?.());
          return {};
        },
      };
      transaction.objectStore = () => store;
      return transaction;
    },
  };
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(options = {}) {
  const calls = [];
  const storageKey = "football-session-planner-v3";
  const localStorage = createLocalStorage(options.initialStorage || {});
  const snapshotDatabase = createSnapshotDatabase(options.snapshots || []);
  const win = {
    __footballScienceCentralHydrating: Boolean(options.centralHydrating),
    footballScienceCentralState: {
      setCachedValue: (...args) => {
        calls.push(["cache", ...args]);
        return true;
      },
      getCachedValue: (key) =>
        options.centralCachedValues ? options.centralCachedValues[key] : undefined,
    },
    localStorage,
    setTimeout: (callback) => {
      calls.push("timeout");
      callback();
    },
  };
  const stateRef = {
    current: options.state || {
      selectedDate: "2026-05-01",
      sessions: {
        "2026-05-01": {
          id: "session-2026-05-01",
          selectedBlockId: "block-1",
          blocks: [{ id: "block-1", title: "Old", minutes: 10, intensity: 2, phase: [], fieldUpdatedAt: {} }],
        },
      },
    },
  };
  const service = createSessionPlannerRuntimeStateService({
    canWriteCentralBackedCache: () => options.canWrite !== false,
    captureBoardHistoryFromState: () => calls.push("capture"),
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    cloneState,
    createDefaultState: () => ({ selectedDate: "default", sessions: {} }),
    dataSafetySnapshotStoreName: "snapshots",
    findWorkspaceFieldElements: () => options.fields || [],
    formatMultiValue: (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean),
    getActiveWorkspaceId: () => options.activeWorkspaceId || "session-planner",
    getSelectedBlock: () => stateRef.current.sessions["2026-05-01"].blocks[0],
    getSessionPlannerState: () => stateRef.current,
    logEvent: (message) => calls.push(["log", message]),
    markBlockFieldsUpdated: (block, fields) => {
      calls.push(["marked", fields]);
      block.fieldUpdatedAt = Object.fromEntries(fields.map((field) => [field, "now"]));
    },
    mergeStateForWrite: options.mergeStateForWrite ||
      ((existingState, nextState) => ({ ...cloneState(nextState), mergedFrom: existingState.selectedDate })),
    mergeStateFromBackup: (currentState, backupState) => ({
      state: {
        ...cloneState(currentState),
        sessions: { ...currentState.sessions, ...backupState.sessions },
      },
      recoveredSessions: Object.keys(backupState.sessions || {}).length,
    }),
    openDataSafetyDatabase: options.openDataSafetyDatabase || (async () => snapshotDatabase),
    rawDataSafetyGetItem: (key) => localStorage.getItem(key),
    rawDataSafetySetItem: (key, value) => localStorage.setItem(key, value),
    recordDataSafetyWrite: (key, value) => calls.push(["record", key, value]),
    renderWorkspace: (payload) => calls.push(["render", payload]),
    sessionPlannerAutosaveBoundary: {
      markSessionPlannerWrite: () => calls.push("autosave"),
      setStatusForKey: (...args) => {
        calls.push(["autosave-status", ...args]);
        return true;
      },
    },
    sessionPlannerMultiSelectFields: new Set(["phase"]),
    sessionPlannerStorageKey: storageKey,
    setSessionPlannerState: (nextState) => {
      stateRef.current = nextState;
    },
    showToast: (message) => calls.push(["toast", message]),
    win,
  });
  return { calls, localStorage, service, snapshotDatabase, stateRef, storageKey };
}

test("Session Planner runtime state service owns read write and recovery bodies outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const workspaceComposerSource = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const composerSource = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const runtimeServiceSource = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");
  const serviceSource = readProjectFile("src/modules/session-planner/session-planner-runtime-state-service.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("createWorkspaceRuntimeComposition({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(workspaceComposerSource).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeService({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeStateService({");
  expect(composerSource).toContain("createSessionPlannerRuntimeService({");
  expect(runtimeServiceSource).toContain("createSessionPlannerRuntimeStateService({");
  expect(appSource).not.toContain("function persistNormalizedSessionPlannerState(nextState)");
  expect(appSource).not.toContain("function findSessionPlannerStateInSnapshots(currentState)");
  expect(appSource).not.toContain("function queueSessionPlannerSnapshotRecovery()");
  expect(serviceSource).toContain("function readState()");
  expect(serviceSource).toContain("function writeState()");
  expect(serviceSource).toContain("function queueSnapshotRecovery()");
  expect(indexSource).toContain('export * from "./session-planner-runtime-state-service.mjs";');
  expect(indexSource).toContain('export * from "./session-planner-runtime-service.mjs";');
});

test("Session Planner runtime state service preserves field assignment and DOM sync writes", () => {
  const fields = [
    { dataset: { sessionField: "title" }, value: "New title" },
    { dataset: { sessionField: "minutes" }, value: "18" },
    { dataset: { sessionField: "intensity" }, value: "9" },
    { dataset: { sessionField: "phase" }, value: "Build-up, Pressing" },
  ];
  const { calls, localStorage, service, stateRef, storageKey } = createHarness({ fields });

  service.syncSelectedBlockFieldsFromDom();

  const block = stateRef.current.sessions["2026-05-01"].blocks[0];
  expect(block).toMatchObject({
    title: "New title",
    minutes: 18,
    intensity: 5,
    phase: ["Build-up", "Pressing"],
  });
  expect(calls).toContainEqual(["marked", ["title", "minutes", "intensity", "phase"]]);
  expect(calls).toContain("capture");
  expect(calls).toContain("autosave");
  expect(JSON.parse(localStorage.getItem(storageKey)).sessions["2026-05-01"].blocks[0].title).toBe("New title");
});

test("Session Planner runtime state service ignores semantically unchanged multi-select fields", () => {
  const state = {
    selectedDate: "2026-05-01",
    sessions: {
      "2026-05-01": {
        id: "session-2026-05-01",
        selectedBlockId: "block-1",
        blocks: [{
          id: "block-1",
          title: "Same title",
          minutes: 10,
          intensity: 2,
          phase: ["Build-up", "Pressing"],
          fieldUpdatedAt: {},
        }],
      },
    },
  };
  const storageKey = "football-session-planner-v3";
  const fields = [
    { dataset: { sessionField: "title" }, value: "Same title" },
    { dataset: { sessionField: "phase" }, value: "Build-up, Pressing" },
  ];
  const { calls, localStorage, service } = createHarness({
    fields,
    initialStorage: { [storageKey]: JSON.stringify(state) },
    mergeStateForWrite: (_existingState, nextState) => cloneState(nextState),
    state: cloneState(state),
  });

  service.syncSelectedBlockFieldsFromDom();

  expect(calls).not.toContain("capture");
  expect(calls).not.toContain("autosave");
  expect(calls.some((call) => Array.isArray(call) && call[0] === "marked")).toBe(false);
  expect(localStorage.setItemCalls).toHaveLength(0);
});

test("Session Planner runtime state service suppresses byte-identical writes", () => {
  const state = {
    selectedDate: "2026-05-01",
    sessions: {
      "2026-05-01": {
        id: "session-2026-05-01",
        selectedBlockId: "block-1",
        blocks: [{ id: "block-1", title: "Unchanged", fieldUpdatedAt: {} }],
      },
    },
  };
  const storageKey = "football-session-planner-v3";
  const { calls, localStorage, service } = createHarness({
    initialStorage: { [storageKey]: JSON.stringify(state) },
    mergeStateForWrite: (_existingState, nextState) => cloneState(nextState),
    state: cloneState(state),
  });

  expect(service.writeState()).toBe(true);
  expect(calls).not.toContain("capture");
  expect(calls).not.toContain("autosave");
  expect(localStorage.setItemCalls).toHaveLength(0);
});

test("Session Planner runtime state service durably falls back and queues central sync when local storage is full", async () => {
  const { calls, localStorage, service, snapshotDatabase, storageKey } = createHarness();
  const quotaError = new Error("The storage quota was exceeded.");
  quotaError.name = "QuotaExceededError";
  localStorage.setItem = () => {
    throw quotaError;
  };

  expect(service.writeState()).toBe(true);
  expect(await service.flushQuotaFallback()).toBe(true);

  const snapshot = snapshotDatabase.records.get(`${storageKey}-quota-fallback`);
  expect(JSON.parse(snapshot.storage[storageKey]).sessions["2026-05-01"].blocks[0].title).toBe("Old");
  expect(calls).toContainEqual([
    "cache",
    storageKey,
    snapshot.storage[storageKey],
    { source: "local-write", durable: false, serverBacked: false },
  ]);
  expect(calls).toContainEqual(["record", storageKey, snapshot.storage[storageKey]]);
  expect(calls).not.toContainEqual(["autosave-status", storageKey, "issue", "Save failed"]);
  expect(calls).toContainEqual(["autosave-status", storageKey, "saved", "Saved"]);
});

test("Session Planner quota fallback keeps the latest of rapid consecutive edits", async () => {
  const { localStorage, service, snapshotDatabase, stateRef, storageKey } = createHarness();
  const quotaError = new Error("The storage quota was exceeded.");
  quotaError.name = "QuotaExceededError";
  localStorage.setItem = () => {
    throw quotaError;
  };

  expect(service.writeState()).toBe(true);
  stateRef.current.sessions["2026-05-01"].blocks[0].title = "Latest rapid edit";
  expect(service.writeState()).toBe(true);
  expect(await service.flushQuotaFallback()).toBe(true);

  const snapshot = snapshotDatabase.records.get(`${storageKey}-quota-fallback`);
  expect(JSON.parse(snapshot.storage[storageKey]).sessions["2026-05-01"].blocks[0].title).toBe("Latest rapid edit");
});

test("Session Planner runtime state service surfaces an issue when quota fallback also fails", async () => {
  const fallbackError = new Error("IndexedDB is unavailable.");
  const { calls, localStorage, service, storageKey } = createHarness({
    openDataSafetyDatabase: async () => {
      throw fallbackError;
    },
  });
  const quotaError = new Error("The storage quota was exceeded.");
  quotaError.name = "QuotaExceededError";
  localStorage.setItem = () => {
    throw quotaError;
  };

  expect(service.writeState()).toBe(true);
  expect(await service.flushQuotaFallback()).toBe(false);
  expect(calls).toContainEqual(["autosave-status", storageKey, "issue", "Save failed"]);
  expect(calls.some((call) => Array.isArray(call) && call[0] === "record")).toBe(false);
});

test("Session Planner runtime state service reports non-quota write failures immediately", () => {
  const { calls, localStorage, service, storageKey } = createHarness();
  localStorage.setItem = () => {
    throw new Error("Storage write failed.");
  };

  expect(service.writeState()).toBe(false);
  expect(calls).toContainEqual(["autosave-status", storageKey, "issue", "Save failed"]);
});

test("Session Planner production state merge stays idempotent for unchanged content", () => {
  const mergeFields = ["title", "phase"];
  const mergeHelpers = createSessionPlannerStateMergeHelpers({
    blockMergeFields: mergeFields,
    blockMergeFieldSet: new Set(mergeFields),
  });
  const state = mergeHelpers.cloneSessionPlannerState({
    selectedDate: "2026-05-01",
    sessions: {
      "2026-05-01": {
        id: "session-2026-05-01",
        date: "2026-05-01",
        title: "Training",
        selectedBlockId: "block-1",
        blocks: [{
          id: "block-1",
          title: "Unchanged",
          phase: ["Build-up"],
          fieldUpdatedAt: {},
        }],
      },
    },
  });
  const storageKey = "football-session-planner-v3";
  const { calls, localStorage, service } = createHarness({
    initialStorage: { [storageKey]: JSON.stringify(state) },
    mergeStateForWrite: mergeHelpers.mergeSessionPlannerStateForWrite,
    state: cloneState(state),
  });

  expect(service.writeState()).toBe(true);
  expect(calls).not.toContain("capture");
  expect(calls).not.toContain("autosave");
  expect(localStorage.setItemCalls).toHaveLength(0);
});

test("Session Planner runtime state service preserves normalized reads and central record scheduling", () => {
  const storageKey = "football-session-planner-v3";
  const rawState = {
    selectedDate: "2026-05-02",
    sessions: {
      "2026-05-02": { id: "session-2026-05-02", blocks: [] },
    },
  };
  const { calls, localStorage, service } = createHarness({
    initialStorage: {
      [storageKey]: JSON.stringify(rawState),
    },
  });

  const state = service.readState();
  service.persistNormalizedState(state);

  expect(state.selectedDate).toBe("2026-05-02");
  expect(localStorage.getItem(storageKey)).toContain("2026-05-02");
  expect(calls.some((call) => Array.isArray(call) && call[0] === "record" && call[1] === storageKey)).toBe(true);
});

test("Session Planner runtime state service falls back to the central cache when local storage was evicted by quota", () => {
  const storageKey = "football-session-planner-v3";
  const centralState = {
    selectedDate: "2026-08-27",
    sessions: {
      "2026-08-27": { id: "session-2026-08-27", blocks: [{ id: "new-exercise" }] },
    },
  };
  const { service } = createHarness({
    initialStorage: {},
    centralCachedValues: { [storageKey]: JSON.stringify(centralState) },
  });

  const state = service.readState();

  expect(state.selectedDate).toBe("2026-08-27");
  expect(state.sessions["2026-08-27"].blocks).toContainEqual({ id: "new-exercise" });
});

test("Session Planner runtime state service returns the default state when local storage and the central cache are both empty", () => {
  const { service } = createHarness({ initialStorage: {} });

  const state = service.readState();

  expect(state).toEqual({ selectedDate: "default", sessions: {} });
});

test("Session Planner runtime state service recovers sessions from data safety snapshots", async () => {
  const storageKey = "football-session-planner-v3";
  const snapshotState = {
    selectedDate: "2026-05-03",
    sessions: {
      "2026-05-03": { id: "session-2026-05-03", blocks: [{ id: "recovered" }] },
    },
  };
  const { service } = createHarness({
    snapshots: [
      {
        createdAt: "2026-05-03T10:00:00.000Z",
        storage: { [storageKey]: JSON.stringify(snapshotState) },
      },
    ],
  });

  const recovered = await service.findStateInSnapshots({ selectedDate: "2026-05-01", sessions: {} });

  expect(recovered.sessions["2026-05-03"].blocks[0].id).toBe("recovered");
});

test("Session Planner runtime state service restores quota fallback edits when block counts are unchanged", async () => {
  const storageKey = "football-session-planner-v3";
  const currentState = {
    selectedDate: "2026-05-02",
    sessions: {
      "2026-05-01": {
        id: "session-2026-05-01",
        blocks: [{ id: "block-1", title: "Before quota fallback" }],
      },
      "2026-05-02": {
        id: "session-2026-05-02",
        selectedBlockId: "block-current",
        blocks: [
          { id: "block-current", title: "Current selection" },
          { id: "block-other", title: "Other block" },
        ],
      },
    },
  };
  const fallbackState = cloneState(currentState);
  fallbackState.selectedDate = "2026-05-01";
  fallbackState.sessions["2026-05-01"].blocks[0].title = "Recovered quota edit";
  fallbackState.sessions["2026-05-02"].selectedBlockId = "block-other";
  const { service } = createHarness({
    mergeStateForWrite: (_existingState, incomingState) => cloneState(incomingState),
    snapshots: [{
      id: `${storageKey}-quota-fallback`,
      createdAt: "2026-05-03T11:00:00.000Z",
      reason: "session-planner-quota-fallback",
      storage: { [storageKey]: JSON.stringify(fallbackState) },
    }],
    state: cloneState(currentState),
  });

  const recovered = await service.findStateInSnapshots(currentState);

  expect(recovered.sessions["2026-05-01"].blocks[0].title).toBe("Recovered quota edit");
  expect(recovered.selectedDate).toBe("2026-05-02");
  expect(recovered.sessions["2026-05-02"].selectedBlockId).toBe("block-current");
});
