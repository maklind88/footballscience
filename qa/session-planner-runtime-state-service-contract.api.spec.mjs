import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createSessionPlannerRuntimeStateService } from "../src/modules/session-planner/index.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createLocalStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => {
      values.set(String(key), String(value));
    },
    values,
  };
}

function createSnapshotDatabase(snapshots = []) {
  return {
    transaction: () => ({
      objectStore: () => ({
        getAll: () => {
          const request = {};
          queueMicrotask(() => {
            request.result = snapshots;
            request.onsuccess?.();
          });
          return request;
        },
      }),
    }),
  };
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(options = {}) {
  const calls = [];
  const storageKey = "football-session-planner-v3";
  const localStorage = createLocalStorage(options.initialStorage || {});
  const win = {
    __footballScienceCentralHydrating: Boolean(options.centralHydrating),
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
    mergeStateForWrite: (existingState, nextState) => ({ ...cloneState(nextState), mergedFrom: existingState.selectedDate }),
    mergeStateFromBackup: (currentState, backupState) => ({
      state: {
        ...cloneState(currentState),
        sessions: { ...currentState.sessions, ...backupState.sessions },
      },
      recoveredSessions: Object.keys(backupState.sessions || {}).length,
    }),
    openDataSafetyDatabase: async () => createSnapshotDatabase(options.snapshots || []),
    rawDataSafetyGetItem: (key) => localStorage.getItem(key),
    rawDataSafetySetItem: (key, value) => localStorage.setItem(key, value),
    recordDataSafetyWrite: (key, value) => calls.push(["record", key, value]),
    renderWorkspace: (payload) => calls.push(["render", payload]),
    sessionPlannerAutosaveBoundary: { markSessionPlannerWrite: () => calls.push("autosave") },
    sessionPlannerMultiSelectFields: new Set(["phase"]),
    sessionPlannerStorageKey: storageKey,
    setSessionPlannerState: (nextState) => {
      stateRef.current = nextState;
    },
    showToast: (message) => calls.push(["toast", message]),
    win,
  });
  return { calls, localStorage, service, stateRef, storageKey };
}

test("Session Planner runtime state service owns read write and recovery bodies outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const runtimeServiceSource = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");
  const serviceSource = readProjectFile("src/modules/session-planner/session-planner-runtime-state-service.mjs");
  const indexSource = readProjectFile("src/modules/session-planner/index.mjs");

  expect(appSource).toContain("createSessionPlannerRuntimeService({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeStateService({");
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
