import { expect, test } from "@playwright/test";
import {
  defaultHubState,
  placeholderWorkspaceContent,
  platformSidebarMoreOrder,
  platformSidebarPrimaryOrder,
  topIconMenuOrder,
} from "../src/core/workspace-defaults.mjs";

test("Workspace defaults expose stable hub workspaces and navigation order", () => {
  expect(defaultHubState.activeWorkspaceId).toBe("home");
  expect(defaultHubState.workspaces.find((workspace) => workspace.id === "home")?.hiddenFromNav).toBe(true);
  expect(defaultHubState.workspaces.find((workspace) => workspace.id === "admin")?.requiresAdmin).toBe(true);
  expect(defaultHubState.workspaces.map((workspace) => workspace.id)).not.toContain("game-simulator");
  expect(topIconMenuOrder[0]).toBe("schedule");
  expect(topIconMenuOrder).not.toContain("game-simulator");
  expect(platformSidebarPrimaryOrder).toEqual([
    "schedule",
    "periodization",
    "medical-team",
    "session-planner",
    "player-profiles",
    "scouting",
  ]);
  expect(platformSidebarMoreOrder).toContain("admin");
  expect(placeholderWorkspaceContent).toEqual({});
});
