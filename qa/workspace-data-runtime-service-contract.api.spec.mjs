import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createWorkspaceDataRuntimeService } from "../src/core/workspace-data-runtime-service.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStorage(initial = {}) {
  const writes = [];
  const values = new Map(Object.entries(initial));
  return {
    writes,
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => {
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

function createHarness(options = {}) {
  const rawWrites = [];
  const calls = [];
  const storage = createMemoryStorage(options.storage);
  const state = {
    activeWorkspaceId: options.activeWorkspaceId || "periodization",
    periodizationState: options.periodizationState ?? null,
    scheduleState: options.scheduleState ?? null,
    scoutingState: options.scoutingState ?? null,
    transferRoomState: null,
    playerProfilesState: options.playerProfilesState ?? null,
  };
  const transferRuntime = {
    addTargetFromScoutingSnapshot: (snapshot, transferOptions) => ({ snapshot, transferOptions }),
    canAccess: (user) => user?.role === "admin" || user?.id === "allowed",
    ensureState: () => ({ module: "transfer-room", linked: true }),
    readState: () => ({ module: "transfer-room" }),
  };
  const service = createWorkspaceDataRuntimeService({
    win: {
      localStorage: storage,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (callback) => callback(),
    },
    ui: {
      periodizationBoard: {
        querySelector: () => ({
          scrollIntoView: (scrollOptions) => calls.push(["scroll", scrollOptions]),
        }),
      },
    },
    periodizationFieldUpdatedAtKey: "_fieldUpdatedAt",
    periodizationStorageKey: "periodization",
    periodizationTrackedFields: new Set(["load"]),
    periodizationYear: 2026,
    scheduleStorageKey: "schedule",
    scoutingStorageKey: "scouting",
    defaultPeriodizationState: { selectedDate: "2026-01-01", selectedMonthIndex: 0, days: {} },
    defaultScheduleState: { events: [] },
    defaultScoutingState: { filters: { query: "" }, records: [] },
    importedNccScheduleEvents: [{ id: "imported", title: "Imported match" }],
    importedNccScheduleVersion: "v1",
    canEditPeriodizationWorkspace: () => options.canEdit !== false,
    clonePeriodizationState: clone,
    cloneScheduleState: clone,
    cloneScoutingState: clone,
    formatScheduleDateValue: (date) => date.toISOString().slice(0, 10),
    getActiveWorkspaceId: () => state.activeWorkspaceId,
    getCurrentPlatformUser: () => ({ id: "allowed", role: "coach" }),
    getPeriodizationDayFromState: (dateValue, periodizationState) => periodizationState?.days?.[dateValue] || {},
    getPeriodizationState: () => state.periodizationState,
    getPlayerProfilesState: () => state.playerProfilesState,
    getScheduleState: () => state.scheduleState,
    getScoutingState: () => state.scoutingState,
    getTransferRoomRuntime: () => transferRuntime,
    getTransferRoomState: () => state.transferRoomState,
    isDateValueInYear: (dateValue) => String(dateValue).startsWith("2026-"),
    logEvent: (message) => calls.push(["log", message]),
    mergeImportedScheduleEvents: (scheduleState, importPayload) => ({
      ...scheduleState,
      importVersion: importPayload.importVersion,
      events: [...(scheduleState.events || []), ...importPayload.events],
    }),
    normalizePeriodizationDay: (day) => ({ ...day, normalized: true }),
    parseScheduleDateValue: (dateValue) => new Date(`${dateValue}T00:00:00Z`),
    preserveScoutingTransientUiState: (nextState, previousState) => ({
      ...nextState,
      transient: previousState?.transient || "",
    }),
    rawDataSafetySetItem: (key, value) => rawWrites.push([key, value]),
    readPlayerProfilesState: () => ({ players: [{ id: "p1" }] }),
    renderPeriodizationWorkspace: () => calls.push("render-periodization"),
    renderTransferRoomWorkspace: () => calls.push("render-transfer-room"),
    setPeriodizationState: (nextState) => { state.periodizationState = nextState; },
    setPlayerProfilesState: (nextState) => { state.playerProfilesState = nextState; },
    setScheduleState: (nextState) => { state.scheduleState = nextState; },
    setScoutingState: (nextState) => { state.scoutingState = nextState; },
    setTransferRoomState: (nextState) => { state.transferRoomState = nextState; },
    shouldDeferCentralizedAppStateReload: () => options.deferReload || false,
  });
  return { calls, rawWrites, service, state, storage, transferRuntime };
}

test("workspace data runtime service owns state bodies outside app-runtime", () => {
  const runtimeSource = readFileSync(new URL("../app-runtime.js", import.meta.url), "utf8");
  const accessorsSource = readFileSync(new URL("../src/core/platform-runtime-accessors.mjs", import.meta.url), "utf8");
  const serviceSource = readFileSync(new URL("../src/core/workspace-data-runtime-service.mjs", import.meta.url), "utf8");

  expect(runtimeSource).toContain("createWorkspaceDataRuntimeService({");
  expect(runtimeSource).toContain("platform-runtime-accessors.mjs");
  expect(runtimeSource).toContain("workspaceDataRuntimeService,");
  expect(accessorsSource).toContain('callAccessorSource("workspaceDataRuntimeService", "readScheduleState"');
  expect(accessorsSource).toContain('callAccessorSource("workspaceDataRuntimeService", "syncTransferRoomLinkedState"');
  expect(runtimeSource).not.toContain("function readScheduleState() {");
  expect(runtimeSource).not.toContain("function readScoutingState() {");
  expect(runtimeSource).not.toContain("function syncTransferRoomLinkedState(options = {})");
  expect(runtimeSource).not.toContain("function readScheduleState(...args)");
  expect(runtimeSource).not.toContain("function syncTransferRoomLinkedState(...args)");
  expect(serviceSource).toContain("function readScheduleState()");
  expect(serviceSource).toContain("function readScoutingState()");
  expect(serviceSource).toContain("function syncTransferRoomLinkedState(options = {})");
});

test("workspace data runtime service preserves periodization write and overlay behavior", () => {
  const { calls, rawWrites, service, state, storage } = createHarness({
    periodizationState: { selectedDate: "2026-05-01", selectedMonthIndex: 4, days: { "2026-05-01": { load: "low" } } },
  });

  service.writePeriodizationDay("2026-05-01", { load: "high" });
  expect(state.periodizationState.days["2026-05-01"]).toMatchObject({ load: "high", normalized: true });
  expect(state.periodizationState.days["2026-05-01"]._fieldUpdatedAt.load).toBeTruthy();
  expect(storage.writes.at(-1)?.[0]).toBe("periodization");
  expect(calls).toContain("render-periodization");

  service.openPeriodizationDateForDashboard("2026-05-02");
  expect(service.getPeriodizationOverlayState()).toEqual({ open: true, mode: "view" });
  expect(rawWrites.at(-1)?.[0]).toBe("periodization");
  expect(calls.filter((call) => call === "render-periodization")).toHaveLength(1);

  service.setPeriodizationMultiSelectOpenField("focus");
  expect(service.getPeriodizationMultiSelectOpenField()).toBe("focus");
});

test("workspace data runtime service preserves schedule and scouting storage normalization", () => {
  const { rawWrites, service, state } = createHarness({
    activeWorkspaceId: "scouting",
    scoutingState: { transient: "modal-open" },
    storage: {
      schedule: JSON.stringify({ events: [{ id: "existing", title: "Existing" }] }),
      scouting: JSON.stringify({ filters: { query: "winger" }, records: [] }),
    },
  });

  const scheduleState = service.readScheduleState();
  expect(scheduleState.events.map((event) => event.id)).toEqual(["existing", "imported"]);
  expect(rawWrites.find(([key]) => key === "schedule")).toBeTruthy();

  const scoutingState = service.readScoutingState();
  expect(scoutingState).toMatchObject({ filters: { query: "winger" }, transient: "modal-open" });
  expect(rawWrites.find(([key]) => key === "scouting")).toBeTruthy();

  state.scheduleState = scheduleState;
  service.writeScheduleState({ syncCentral: false });
  expect(rawWrites.at(-1)?.[0]).toBe("schedule");
});

test("workspace data runtime service preserves transfer room linked state sync", () => {
  const { calls, service, state } = createHarness({ activeWorkspaceId: "transfer-room" });

  const transferState = service.syncTransferRoomLinkedState({ render: true });

  expect(state.playerProfilesState).toEqual({ players: [{ id: "p1" }] });
  expect(state.scoutingState).toMatchObject({ filters: { query: "" }, records: [] });
  expect(state.transferRoomState).toEqual({ module: "transfer-room", linked: true });
  expect(transferState).toEqual(state.transferRoomState);
  expect(calls).toContain("render-transfer-room");
  expect(service.canUserAccessTransferRoom({ id: "allowed", role: "coach" })).toBe(true);
  expect(service.addTransferRoomTargetFromScoutingSnapshot({ id: "s1" }, { source: "test" })).toEqual({
    snapshot: { id: "s1" },
    transferOptions: { source: "test" },
  });
});
