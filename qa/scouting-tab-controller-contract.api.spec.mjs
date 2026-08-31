import { expect, test } from "@playwright/test";
import { createScoutingTabController } from "../src/modules/scouting/index.mjs";

function createHarness(overrides = {}) {
  const state = {
    activeTab: overrides.activeTab || "database",
    shadowXi: {
      selectedSlotId: "cf",
    },
  };
  const tabs = overrides.tabs || [
    { id: "database" },
    { id: "lists" },
    { id: "reports" },
    { id: "shadow-xi" },
  ];
  const calls = {
    cancelledTimers: 0,
    clearedReports: 0,
    ensureState: 0,
    perf: [],
    renders: [],
    resetDatabaseUi: 0,
    scheduledRenders: [],
    scrollResets: [],
    shadowResets: 0,
    syncedTabs: [],
    writes: [],
  };
  const controller = createScoutingTabController({
    cancelDatabaseBackgroundTimers: () => {
      calls.cancelledTimers += 1;
    },
    clearReportsExpandedPanels: () => {
      calls.clearedReports += 1;
    },
    ensureState: () => {
      calls.ensureState += 1;
      return state;
    },
    getTabs: () => tabs,
    renderActiveTabSurfaceOrWorkspace: (options) => calls.renders.push(options),
    scheduleTabSurfaceRender: (render, detail) => {
      if (!overrides.deferDatabase) {
        return false;
      }
      calls.scheduledRenders.push({ detail, render });
      return true;
    },
    shouldDeferTabSurfaceRender: (tabId) => overrides.deferDatabase === true && tabId === "database",
    resetScrollPosition: (options) => calls.scrollResets.push(options),
    resetDatabaseTransientUi: () => {
      calls.resetDatabaseUi += 1;
    },
    resetShadowSelection: (currentState) => {
      calls.shadowResets += 1;
      currentState.shadowXi.selectedSlotId = "";
    },
    startPerformance: (label, detail) => {
      const entry = { label, detail, ended: null };
      calls.perf.push(entry);
      return {
        end(endDetail) {
          entry.ended = endDetail;
        },
      };
    },
    syncTabButtonsDom: (currentState) => calls.syncedTabs.push(currentState.activeTab),
    writeState: (options) => calls.writes.push(options),
  });
  return { calls, controller, state, tabs };
}

test("Scouting tab controller switches tab and keeps the refresh path lightweight", () => {
  const harness = createHarness({ activeTab: "database" });

  const result = harness.controller.setActiveTab("lists");

  expect(result).toEqual({ changed: true, previousTab: "database", tabId: "lists", status: "updated" });
  expect(harness.state.activeTab).toBe("lists");
  expect(harness.calls.writes).toEqual([{ syncCentral: false }]);
  expect(harness.calls.syncedTabs).toEqual(["lists"]);
  expect(harness.calls.renders).toEqual([{ preserveFocus: false }]);
  expect(harness.calls.scrollResets).toEqual([{ previousTab: "database", tabId: "lists" }]);
  expect(harness.calls.cancelledTimers).toBe(1);
  expect(harness.calls.resetDatabaseUi).toBe(1);
  expect(harness.calls.clearedReports).toBe(1);
  expect(harness.calls.perf[0]).toMatchObject({
    label: "tab.switch",
    detail: { from: "database", to: "lists" },
    ended: { from: "database", to: "lists" },
  });
});

test("Scouting tab controller preserves database timers when switching into Database", () => {
  const harness = createHarness({ activeTab: "lists" });

  const result = harness.controller.setActiveTab("database");

  expect(result.status).toBe("updated");
  expect(harness.state.activeTab).toBe("database");
  expect(harness.calls.cancelledTimers).toBe(0);
  expect(harness.calls.resetDatabaseUi).toBe(0);
  expect(harness.calls.clearedReports).toBe(1);
});

test("Scouting tab controller defers state serialization with a deferred Database render", () => {
  const harness = createHarness({ activeTab: "shadow-xi", deferDatabase: true });

  const result = harness.controller.setActiveTab("database", { deferStateWrite: true });

  expect(result.status).toBe("updated");
  expect(harness.state.activeTab).toBe("database");
  expect(harness.calls.syncedTabs).toEqual(["database"]);
  expect(harness.calls.writes).toEqual([]);
  expect(harness.calls.renders).toEqual([]);
  expect(harness.calls.scheduledRenders).toHaveLength(1);

  harness.calls.scheduledRenders[0].render();

  expect(harness.calls.writes).toEqual([{ syncCentral: false }]);
  expect(harness.calls.renders).toEqual([{ preserveFocus: false }]);
  expect(harness.calls.scrollResets).toEqual([{ previousTab: "shadow-xi", tabId: "database" }]);
});

test("Scouting tab controller reuses an already hydrated state for immediate navigation", () => {
  const harness = createHarness({ activeTab: "shadow-xi", deferDatabase: true });

  const result = harness.controller.setActiveTab("database", {
    deferStateWrite: true,
    state: harness.state,
  });

  expect(result.status).toBe("updated");
  expect(harness.calls.ensureState).toBe(0);
  expect(harness.calls.syncedTabs).toEqual(["database"]);
});

test("Scouting tab controller resets Shadow XI focus when opening Shadow XI", () => {
  const harness = createHarness({ activeTab: "lists" });

  const result = harness.controller.setActiveTab("shadow-xi");

  expect(result.status).toBe("updated");
  expect(harness.calls.shadowResets).toBe(1);
  expect(harness.state.shadowXi.selectedSlotId).toBe("");
  expect(harness.calls.cancelledTimers).toBe(1);
  expect(harness.calls.resetDatabaseUi).toBe(0);
});

test("Scouting tab controller does not mutate state for invalid or unchanged tabs", () => {
  const invalidHarness = createHarness({ activeTab: "lists" });

  expect(invalidHarness.controller.setActiveTab("unknown")).toEqual({ changed: false, status: "invalid-tab" });
  expect(invalidHarness.state.activeTab).toBe("lists");
  expect(invalidHarness.calls.writes).toEqual([]);
  expect(invalidHarness.calls.renders).toEqual([]);
  expect(invalidHarness.calls.scrollResets).toEqual([]);

  const unchangedHarness = createHarness({ activeTab: "reports" });

  expect(unchangedHarness.controller.setActiveTab("reports")).toEqual({ changed: false, status: "unchanged" });
  expect(unchangedHarness.calls.writes).toEqual([]);
  expect(unchangedHarness.calls.renders).toEqual([]);
  expect(unchangedHarness.calls.scrollResets).toEqual([]);
});
