import { expect, test } from "@playwright/test";
import { createScoutingPostRenderController } from "../src/modules/scouting/index.mjs";

function createHarness(overrides = {}) {
  const state = {
    activeTab: overrides.activeTab || "database",
    profileTab: overrides.profileTab || "overview",
    selectedRecordId: overrides.selectedRecordId || "",
  };
  const calls = [];
  const controller = createScoutingPostRenderController({
    bindDragAndDrop: () => calls.push(["bind-drag"]),
    bindMyTeamSpiderShells: () => calls.push(["bind-my-team-spider"]),
    bindRecordMiniRadarShells: () => calls.push(["bind-mini-radar"]),
    ensureState: () => state,
    focusProfileModal: () => calls.push(["focus-profile"]),
    isAdvancedDatabaseMode: () => overrides.advancedMode === true,
    loadImportHistory: () => calls.push(["load-import-history"]),
    normalizeProfileTab: (value) => (value === "overview" ? "overview" : "other"),
    queueProfileHydration: (recordId) => calls.push(["queue-profile-hydration", recordId]),
    queueProfileModalFocus: (recordId) => calls.push(["queue-profile-focus", recordId]),
    scheduleDatabaseAutoLoad: () => calls.push(["schedule-autoload"]),
    scheduleDatabaseWorkerPrewarm: (delayMs) => calls.push(["schedule-worker-prewarm", delayMs]),
    shouldFocusProfileModal: (recordId) => Boolean(recordId && overrides.shouldFocusProfile),
  });
  return { calls, controller, state };
}

test("Scouting post-render controller runs Database hooks in the established order", () => {
  const harness = createHarness({
    activeTab: "database",
    advancedMode: true,
    selectedRecordId: "record-1",
    shouldFocusProfile: true,
  });

  const result = harness.controller.run(harness.state);

  expect(result).toEqual({ status: "updated", tab: "database" });
  expect(harness.calls).toEqual([
    ["bind-drag"],
    ["bind-mini-radar"],
    ["schedule-autoload"],
    ["load-import-history"],
    ["focus-profile"],
    ["queue-profile-focus", "record-1"],
    ["queue-profile-hydration", "record-1"],
    ["schedule-worker-prewarm", 1200],
  ]);
});

test("Scouting post-render controller binds My Team without scheduling Database work", () => {
  const harness = createHarness({ activeTab: "my-team", selectedRecordId: "record-2", shouldFocusProfile: false });

  const result = harness.controller.run(harness.state);

  expect(result).toEqual({ status: "updated", tab: "my-team" });
  expect(harness.calls).toEqual([
    ["bind-drag"],
    ["bind-my-team-spider"],
    ["queue-profile-hydration", "record-2"],
  ]);
});

test("Scouting post-render controller leaves passive tabs light", () => {
  const harness = createHarness({ activeTab: "comparison", selectedRecordId: "", shouldFocusProfile: false });

  const result = harness.controller.run(harness.state);

  expect(result).toEqual({ status: "updated", tab: "comparison" });
  expect(harness.calls).toEqual([]);
});

test("Scouting post-render controller can fall back to ensureState", () => {
  const harness = createHarness({ activeTab: "reports" });

  const result = harness.controller.run();

  expect(result).toEqual({ status: "updated", tab: "reports" });
  expect(harness.calls).toEqual([["bind-drag"]]);
});
