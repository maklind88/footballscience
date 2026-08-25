import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  canEditSessionPlanner,
  cloneDefaultPlatformStructureState,
  configurePlatformRuntimeAccessors,
  getAdminAuditState,
  getScheduleEventsForDate,
  getSelectedAdminUserId,
  initializeWorkspaceHub,
  mergePeriodizationStatePreservingLocalUi,
  platformRuntimeAccessorNames,
  readScheduleState,
  renderAdminWorkspace,
  renderLeaderboardWorkspace,
  renderPlayerProfilesWorkspaceMessage,
  renderScoutingWorkspace,
  reloadCentralizedAppStateFromStorage,
} from "../src/core/platform-runtime-accessors.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("platform runtime accessors own app-runtime pass-through names", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/core/platform-runtime-accessors.mjs");
  const packageJson = readProjectFile("package.json");

  expect(platformRuntimeAccessorNames).toContain("cloneDefaultPlatformStructureState");
  expect(platformRuntimeAccessorNames).toContain("canEditSessionPlanner");
  expect(platformRuntimeAccessorNames).toContain("readScheduleState");
  expect(platformRuntimeAccessorNames).toContain("renderScoutingWorkspace");
  expect(platformRuntimeAccessorNames).toContain("renderLeaderboardWorkspace");
  expect(platformRuntimeAccessorNames).toContain("renderAdminWorkspace");
  expect(platformRuntimeAccessorNames).toContain("reloadCentralizedAppStateFromStorage");
  expect(app).toContain("platform-runtime-accessors.mjs");
  expect(app).toContain("configurePlatformRuntimeAccessors(() => ({");
  expect(app).toContain("workspaceAccessRuntimeService");
  expect(app).toContain("workspaceDataRuntimeService");
  expect(app).toContain("centralAppStateReloadService");
  expect(app).not.toContain("function canEditSessionPlanner(...args)");
  expect(app).not.toContain("function readScheduleState(...args)");
  expect(app).not.toContain("function renderAdminWorkspace(...args)");
  expect(app).not.toContain("function reloadCentralizedAppStateFromStorage(...args)");
  expect(accessors).not.toContain("localStorage");
  expect(accessors).not.toContain("rawDataSafetySetItem");
  expect(packageJson).toContain("src/core/platform-runtime-accessors.mjs");
});

test("platform runtime accessors forward to configured runtime services", () => {
  const calls = [];
  const sources = {
    periodizationStateAdapter: {
      mergePeriodizationStatePreservingLocalUi(...args) {
        calls.push(["periodization-adapter", args, this]);
        return "periodization";
      },
    },
    squadWorkspaceRenderer: {
      renderMessage(...args) {
        calls.push(["squad-renderer", args, this]);
        return "squad";
      },
    },
    platformStructureRuntimeService: {
      cloneDefaultPlatformStructureState(...args) {
        calls.push(["structure", args, this]);
        return "structure";
      },
    },
    workspaceAccessRuntimeService: {
      canEditSessionPlanner(...args) {
        calls.push(["access", args, this]);
        return true;
      },
    },
    workspaceDataRuntimeService: {
      readScheduleState(...args) {
        calls.push(["data", args, this]);
        return { schedule: true };
      },
    },
    workspaceModuleRuntimeController: {
      renderScoutingWorkspace(...args) {
        calls.push(["module", args, this]);
        return "scouting";
      },
      renderLeaderboardWorkspace(...args) {
        calls.push(["leaderboard", args, this]);
        return "leaderboard";
      },
    },
    scheduleRuntimeSelectors: {
      getEventsForDate(...args) {
        calls.push(["schedule-selectors", args, this]);
        return ["event"];
      },
    },
    adminRuntimeService: {
      renderAdminWorkspace(...args) {
        calls.push(["admin", args, this]);
        return "admin";
      },
    },
    workspaceShellController: {
      initializeWorkspaceHub(...args) {
        calls.push(["shell", args, this]);
        return "shell";
      },
    },
    centralAppStateReloadService: {
      reloadCentralizedAppStateFromStorage(...args) {
        calls.push(["central-reload", args, this]);
        return "central";
      },
    },
  };
  configurePlatformRuntimeAccessors(() => sources);

  expect(mergePeriodizationStatePreservingLocalUi("a")).toBe("periodization");
  expect(renderPlayerProfilesWorkspaceMessage("saved")).toBe("squad");
  expect(cloneDefaultPlatformStructureState()).toBe("structure");
  expect(canEditSessionPlanner("coach")).toBe(true);
  expect(readScheduleState()).toEqual({ schedule: true });
  expect(renderScoutingWorkspace()).toBe("scouting");
  expect(renderLeaderboardWorkspace()).toBe("leaderboard");
  expect(getScheduleEventsForDate("2026-05-09")).toEqual(["event"]);
  expect(renderAdminWorkspace()).toBe("admin");
  expect(initializeWorkspaceHub()).toBe("shell");
  expect(reloadCentralizedAppStateFromStorage()).toBe("central");
  expect(calls.map((call) => call[0])).toEqual([
    "periodization-adapter",
    "squad-renderer",
    "structure",
    "access",
    "data",
    "module",
    "leaderboard",
    "schedule-selectors",
    "admin",
    "shell",
    "central-reload",
  ]);
  expect(calls[1][2]).toBe(sources.squadWorkspaceRenderer);
  expect(calls[7][1]).toEqual(["2026-05-09"]);
});

test("platform runtime accessors preserve optional admin fallbacks", () => {
  configurePlatformRuntimeAccessors(() => ({ adminRuntimeService: {} }));

  expect(getAdminAuditState()).toEqual({});
  expect(getSelectedAdminUserId()).toBeNull();
});
